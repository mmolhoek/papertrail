import { IEpaperService } from "@core/interfaces";
import { IDisplayDriver } from "@core/interfaces/IDisplayDriver";
import {
  IHardwareAdapter,
  PinConfig,
  SPIConfig,
} from "@core/interfaces/IHardwareAdapter";
import {
  Result,
  Bitmap1Bit,
  EpaperStatus,
  EpaperConfig,
  DisplayUpdateMode,
  success,
  failure,
} from "@core/types";
import { DisplayError, DisplayErrorCode } from "@core/errors";
import { getLogger } from "@utils/logger";
import path from "path";
import fs from "fs";

const logger = getLogger("EPaperService");

/**
 * E-Paper Service Implementation
 *
 * Orchestrates display operations using a pluggable driver and hardware adapter.
 * This service maintains the same IEpaperService interface while delegating
 * actual hardware operations to the driver/adapter combination.
 */
export class EpaperService implements IEpaperService {
  private isInitialized: boolean = false;
  private isSleeping: boolean = false;
  private busy: boolean = false;
  private fullRefreshCount: number = 0;
  private partialRefreshCount: number = 0;
  private lastUpdate: Date | null = null;
  private rotation: 0 | 90 | 180 | 270;

  constructor(
    private readonly config: EpaperConfig,
    private readonly driver: IDisplayDriver,
    private readonly adapter: IHardwareAdapter,
  ) {
    this.rotation = config.rotation;
    logger.info(`EPaperService created with driver: ${driver.name}`);
    logger.info(
      `  Display: ${driver.capabilities.width}x${driver.capabilities.height}, ${driver.capabilities.colorDepth}`,
    );
  }

  /**
   * Initialize the e-paper display hardware
   */
  async initialize(): Promise<Result<void>> {
    logger.info(`Initializing e-paper display: ${this.getDisplayModel()}`);
    if (this.isInitialized) {
      return success(undefined);
    }

    try {
      // Initialize hardware adapter
      const pins: PinConfig = {
        reset: this.config.pins.reset,
        dc: this.config.pins.dc,
        busy: this.config.pins.busy,
        power: this.config.pins.power,
      };

      const spi: SPIConfig = this.config.spi || {
        bus: 0,
        device: 0,
        speed: 256000,
      };

      this.adapter.init(pins, spi);

      // Initialize display driver
      await this.driver.init(this.adapter);

      this.isInitialized = true;
      this.isSleeping = false;
      this.busy = false;

      // Wait a moment for hardware to stabilize after init
      await this.sleepDelay(100);

      logger.info("E-paper display initialized successfully");
      return success(undefined);
    } catch (error) {
      logger.error("Initializing e-paper display failed:", error);
      if (error instanceof Error) {
        return failure(DisplayError.initFailed(error.message, error));
      }
      return failure(DisplayError.initFailed("Unknown error"));
    }
  }

  /**
   * Display startup logo on the e-paper screen
   */
  async displayLogo(): Promise<Result<void>> {
    logger.info("displayLogo() called");
    logger.info(`  Working directory: ${process.cwd()}`);

    try {
      logger.info("Loading startup logo...");

      // Construct path to logo file
      const logoPath = path.join(
        process.cwd(),
        "onboarding-screens",
        "welcome.bmp",
      );
      logger.info(`  Logo path: ${logoPath}`);

      if (!fs.existsSync(logoPath)) {
        logger.warn(
          `Logo file not found at ${logoPath}, skipping logo display`,
        );
        return success(undefined);
      }

      if (!this.isInitialized) {
        logger.error("Display not initialized - cannot display logo");
        return failure(DisplayError.notInitialized());
      }

      // Load image using driver
      logger.info(`Loading image from ${logoPath}...`);
      const imageBuffer = await this.driver.loadImage(logoPath);
      logger.info(
        `Image loaded successfully, buffer size: ${imageBuffer.length} bytes`,
      );

      const logoBitmap: Bitmap1Bit = {
        width: this.driver.capabilities.width,
        height: this.driver.capabilities.height,
        data: imageBuffer,
      };

      // Display the logo using full update mode
      logger.info("Sending logo bitmap to display (FULL update mode)...");
      const result = await this.displayBitmap(logoBitmap);

      if (!result.success) {
        logger.error("Failed to display startup logo:", result.error);
      } else {
        logger.info("Startup logo displayed successfully on e-paper!");
      }

      return result;
    } catch (error) {
      logger.error("Error loading or displaying startup logo:", error);
      return success(undefined);
    }
  }

  /**
   * Display a bitmap on the e-paper screen
   */
  async displayBitmap(
    bitmap: Bitmap1Bit,
    mode: DisplayUpdateMode = DisplayUpdateMode.FULL,
  ): Promise<Result<void>> {
    logger.info(`Displaying bitmap on e-paper: ${this.getDisplayModel()}`);

    if (!this.isInitialized) {
      logger.error("Display not initialized");
      return failure(DisplayError.notInitialized());
    }

    if (this.isSleeping) {
      logger.error("Display is sleeping");
      return failure(
        new DisplayError(
          "Display is sleeping. Call wake() first.",
          DisplayErrorCode.DISPLAY_SLEEPING,
          true,
        ),
      );
    }

    if (this.busy) {
      logger.error("Display is busy (software flag)");
      return failure(DisplayError.displayBusy());
    }

    // Check hardware busy state
    if (!this.driver.isReady()) {
      logger.info(
        "Hardware display is busy, waiting for it to become ready...",
      );
      try {
        await this.driver.waitUntilReady(5000);
      } catch {
        logger.error("Display busy timeout");
        return failure(DisplayError.displayBusy());
      }

      if (this.busy) {
        logger.error("Display became busy while waiting for hardware");
        return failure(DisplayError.displayBusy());
      }
    }

    // Validate bitmap dimensions
    const { width, height } = this.driver.capabilities;
    if (bitmap.width !== width || bitmap.height !== height) {
      logger.error("Bitmap size mismatch");
      return failure(
        DisplayError.sizeMismatch(bitmap.width, bitmap.height, width, height),
      );
    }

    try {
      this.busy = true;

      // Determine update mode
      const updateMode =
        mode === DisplayUpdateMode.AUTO ? this.determineUpdateMode() : mode;

      // Convert Uint8Array to Buffer
      const buffer = Buffer.from(bitmap.data);

      // Determine if we should use fast or slow mode
      const useFastMode = updateMode !== DisplayUpdateMode.FULL;

      // Send bitmap to display
      await this.driver.display(buffer, useFastMode);
      logger.info(`Bitmap displayed using ${updateMode} update`);

      // Update statistics
      if (updateMode === DisplayUpdateMode.FULL) {
        this.fullRefreshCount++;
      } else if (updateMode === DisplayUpdateMode.PARTIAL) {
        this.partialRefreshCount++;
      }

      this.lastUpdate = new Date();
      return success(undefined);
    } catch (error) {
      logger.error("Displaying bitmap failed", error);
      if (error instanceof Error) {
        return failure(DisplayError.updateFailed(error));
      }
      return failure(DisplayError.updateFailed(new Error("Unknown error")));
    } finally {
      this.busy = false;
    }
  }

  /**
   * Load and display a BMP image file on the e-paper screen
   */
  async displayBitmapFromFile(
    filePath: string,
    mode: DisplayUpdateMode = DisplayUpdateMode.FULL,
  ): Promise<Result<void>> {
    logger.info(`Loading and displaying image from: ${filePath}`);

    if (!this.isInitialized) {
      logger.error("Display not initialized");
      return failure(DisplayError.notInitialized());
    }

    try {
      if (!fs.existsSync(filePath)) {
        logger.error(`Image file not found: ${filePath}`);
        return failure(
          new DisplayError(
            `Image file not found: ${filePath}`,
            DisplayErrorCode.RENDER_FAILED,
            true,
          ),
        );
      }

      // Load image using driver
      const imageBuffer = await this.driver.loadImage(filePath);
      logger.info(
        `Image loaded successfully, buffer size: ${imageBuffer.length} bytes`,
      );

      const bitmap: Bitmap1Bit = {
        width: this.driver.capabilities.width,
        height: this.driver.capabilities.height,
        data: imageBuffer,
      };

      return await this.displayBitmap(bitmap, mode);
    } catch (error) {
      logger.error(`Failed to load and display image from ${filePath}:`, error);
      if (error instanceof Error) {
        return failure(DisplayError.updateFailed(error));
      }
      return failure(DisplayError.updateFailed(new Error("Unknown error")));
    }
  }

  /**
   * Clear the display (set to white)
   */
  async clear(): Promise<Result<void>> {
    logger.info(`Clearing e-paper display: ${this.getDisplayModel()}`);

    if (!this.isInitialized) {
      logger.error("Display not initialized");
      return failure(DisplayError.notInitialized());
    }

    try {
      this.busy = true;
      await this.driver.clear(false);
      this.fullRefreshCount++;
      this.lastUpdate = new Date();
      logger.info("E-paper display cleared");
      return success(undefined);
    } catch (error) {
      logger.error("Clearing e-paper display failed", error);
      if (error instanceof Error) {
        return failure(DisplayError.updateFailed(error));
      }
      return failure(DisplayError.updateFailed(new Error("Unknown error")));
    } finally {
      this.busy = false;
    }
  }

  /**
   * Perform a full refresh to clear ghosting
   */
  async fullRefresh(): Promise<Result<void>> {
    logger.info(
      `Performing full refresh on e-paper: ${this.getDisplayModel()}`,
    );

    if (!this.isInitialized) {
      logger.error("Display not initialized");
      return failure(DisplayError.notInitialized());
    }

    try {
      this.busy = true;
      await this.driver.clear(false);
      this.fullRefreshCount++;
      this.lastUpdate = new Date();
      logger.info("Full refresh completed");
      return success(undefined);
    } catch (error) {
      logger.error("Full refresh failed", error);
      if (error instanceof Error) {
        return failure(
          new DisplayError(
            `Full refresh failed: ${error.message}`,
            DisplayErrorCode.REFRESH_FAILED,
            true,
          ),
        );
      }
      return failure(
        new DisplayError(
          "Full refresh failed: Unknown error",
          DisplayErrorCode.REFRESH_FAILED,
          true,
        ),
      );
    } finally {
      this.busy = false;
    }
  }

  /**
   * Put the display into sleep mode
   */
  async sleep(): Promise<Result<void>> {
    logger.info(`Putting e-paper display to sleep: ${this.getDisplayModel()}`);

    if (!this.isInitialized) {
      logger.error("Display not initialized");
      return failure(DisplayError.notInitialized());
    }

    if (this.isSleeping) {
      logger.info("Display already sleeping");
      return success(undefined);
    }

    try {
      await this.driver.sleep();
      this.isSleeping = true;
      this.busy = false;
      logger.info("E-paper display is now sleeping");
      return success(undefined);
    } catch (error) {
      logger.error("Putting display to sleep failed", error);
      if (error instanceof Error) {
        return failure(
          new DisplayError(
            `Failed to put display to sleep: ${error.message}`,
            DisplayErrorCode.UNKNOWN,
            true,
          ),
        );
      }
      return failure(
        new DisplayError(
          "Failed to put display to sleep",
          DisplayErrorCode.UNKNOWN,
          true,
        ),
      );
    }
  }

  /**
   * Wake the display from sleep mode
   */
  async wake(): Promise<Result<void>> {
    logger.info(`Waking e-paper display: ${this.getDisplayModel()}`);

    if (!this.isInitialized) {
      logger.error("Display not initialized");
      return failure(DisplayError.notInitialized());
    }

    if (!this.isSleeping) {
      logger.info("Display is not sleeping");
      return success(undefined);
    }

    try {
      await this.driver.wake();
      this.isSleeping = false;
      logger.info("E-paper display is now awake");
      return success(undefined);
    } catch (error) {
      logger.error("Waking display failed", error);
      if (error instanceof Error) {
        return failure(
          new DisplayError(
            `Failed to wake display: ${error.message}`,
            DisplayErrorCode.UNKNOWN,
            true,
          ),
        );
      }
      return failure(
        new DisplayError(
          "Failed to wake display",
          DisplayErrorCode.UNKNOWN,
          true,
        ),
      );
    }
  }

  /**
   * Get the current status of the display
   */
  async getStatus(): Promise<Result<EpaperStatus>> {
    logger.info(`Getting e-paper display status: ${this.getDisplayModel()}`);

    if (!this.isInitialized) {
      logger.error("Display not initialized");
      return failure(DisplayError.notInitialized());
    }

    const status: EpaperStatus = {
      initialized: this.isInitialized,
      busy: this.busy,
      sleeping: this.isSleeping,
      model: this.getDisplayModel(),
      width: this.driver.capabilities.width,
      height: this.driver.capabilities.height,
      lastUpdate: this.lastUpdate || undefined,
      fullRefreshCount: this.fullRefreshCount,
      partialRefreshCount: this.partialRefreshCount,
    };

    logger.info("E-paper display status retrieved", status);
    return success(status);
  }

  /**
   * Get the display model name
   */
  private getDisplayModel(): string {
    if (this.config.model) {
      return this.config.model;
    }
    return this.driver.name;
  }

  /**
   * Check if the display is currently busy
   */
  isBusy(): boolean {
    if (this.busy) {
      logger.info("E-paper display is busy (software flag)");
      return true;
    }
    if (!this.driver.isReady()) {
      logger.info("E-paper display is busy (hardware)");
      return true;
    }
    return false;
  }

  /**
   * Wait for the display to become ready
   */
  async waitUntilReady(timeoutMs: number = 5000): Promise<Result<void>> {
    logger.info(
      `Waiting for e-paper display to become ready: ${this.getDisplayModel()}`,
    );

    if (!this.isInitialized) {
      logger.error("Display not initialized");
      return failure(DisplayError.notInitialized());
    }

    const startTime = Date.now();

    while (this.isBusy() && Date.now() - startTime < timeoutMs) {
      await this.sleepDelay(100);
    }

    if (this.busy) {
      logger.error("Timeout waiting for display to become ready");
      return failure(DisplayError.timeout("waitUntilReady", timeoutMs));
    }

    logger.info("E-paper display is now ready");
    return success(undefined);
  }

  /**
   * Set the display rotation
   */
  setRotation(rotation: 0 | 90 | 180 | 270): Result<void> {
    logger.info(
      `Setting e-paper display rotation to ${rotation}: ${this.getDisplayModel()}`,
    );
    this.rotation = rotation;
    return success(undefined);
  }

  /**
   * Get display dimensions
   */
  getDimensions(): { width: number; height: number } {
    const { width, height } = this.driver.capabilities;

    // Account for rotation
    if (this.rotation === 90 || this.rotation === 270) {
      logger.info(
        "Display is rotated, swapping width and height",
        width,
        height,
      );
      return { width: height, height: width };
    }

    logger.info("Display dimensions", width, height);
    return { width, height };
  }

  /**
   * Reset the display hardware
   */
  async reset(): Promise<Result<void>> {
    logger.info(`Resetting e-paper display: ${this.getDisplayModel()}`);

    if (!this.isInitialized) {
      logger.error("Display not initialized");
      return failure(DisplayError.notInitialized());
    }

    try {
      // Reset via adapter and reinitialize driver
      await this.adapter.reset();
      await this.driver.wake();

      this.busy = false;
      this.isSleeping = false;
      logger.info("E-paper display reset completed");
      return success(undefined);
    } catch (error) {
      logger.error("Display reset failed", error);
      if (error instanceof Error) {
        return failure(
          new DisplayError(
            `Display reset failed: ${error.message}`,
            DisplayErrorCode.UNKNOWN,
            true,
          ),
        );
      }
      return failure(
        new DisplayError(
          "Display reset failed",
          DisplayErrorCode.UNKNOWN,
          true,
        ),
      );
    }
  }

  /**
   * Clean up resources and close hardware connections
   */
  async dispose(): Promise<void> {
    logger.info(`Disposing e-paper service: ${this.getDisplayModel()}`);

    if (!this.isInitialized) {
      logger.info("E-paper service already disposed");
      return;
    }

    try {
      // Put display to sleep before disposing
      if (!this.isSleeping) {
        logger.info("Putting display to sleep before disposing");
        await this.sleep();
      }

      // Dispose driver and adapter
      await this.driver.dispose();
      this.adapter.dispose();

      this.isInitialized = false;
      this.busy = false;
      logger.info("E-paper service disposed successfully");
    } catch (error) {
      logger.error("Error disposing e-paper service:", error);
    }
  }

  /**
   * Determine whether to use full or partial update
   */
  private determineUpdateMode(): DisplayUpdateMode {
    logger.info("Determining display update mode");
    const totalUpdates = this.fullRefreshCount + this.partialRefreshCount;

    if (totalUpdates > 0 && totalUpdates % 10 === 0) {
      logger.info("Choosing FULL update mode to prevent ghosting");
      return DisplayUpdateMode.FULL;
    }

    logger.info("Choosing PARTIAL update mode");
    return DisplayUpdateMode.PARTIAL;
  }

  /**
   * Helper method for async sleep
   */
  private sleepDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
