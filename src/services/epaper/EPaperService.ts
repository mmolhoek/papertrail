import { IEpaperService } from "@core/interfaces";
import {
  Result,
  Bitmap1Bit,
  EpaperStatus,
  EpaperConfig,
  DisplayUpdateMode,
  success,
  failure,
} from "../../core/types";
import { DisplayError, DisplayErrorCode } from "../../core/errors";
import { getLogger } from "../../utils/logger";
import { EPD } from "./EPD";

const logger = getLogger("EPaperService");

/**
 * E-Paper Service Implementation
 *
 * Manages the e-paper display hardware using the EPD class.
 */
export class EpaperService implements IEpaperService {
  private epd: EPD | null = null;
  private isInitialized: boolean = false;
  private isSleeping: boolean = false;
  private busy: boolean = false;
  private fullRefreshCount: number = 0;
  private partialRefreshCount: number = 0;
  private lastUpdate: Date | null = null;
  private rotation: 0 | 90 | 180 | 270;

  constructor(private readonly config: EpaperConfig) {
    this.rotation = config.rotation;
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
      // Create EPD instance with config
      this.epd = new EPD({
        width: this.config.width,
        height: this.config.height,
      });

      // Initialize the display
      await this.epd.init();

      this.isInitialized = true;
      this.isSleeping = false;
      this.busy = false;

      logger.info("Initializing e-paper display finished");
      return success(undefined);
    } catch (error) {
      logger.error("Initializing e-paper display failed");
      if (error instanceof Error) {
        return failure(DisplayError.initFailed(error.message, error));
      }
      return failure(DisplayError.initFailed("Unknown error"));
    }
  }

  /**
   * Display a bitmap on the e-paper screen
   */
  async displayBitmap(
    bitmap: Bitmap1Bit,
    mode: DisplayUpdateMode = DisplayUpdateMode.AUTO,
  ): Promise<Result<void>> {
    logger.info(`Displaying bitmap on e-paper: ${this.getDisplayModel()}`);
    if (!this.isInitialized || !this.epd) {
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
      logger.error("Display is busy");
      return failure(DisplayError.displayBusy());
    }

    // Validate bitmap dimensions
    if (
      bitmap.width !== this.config.width ||
      bitmap.height !== this.config.height
    ) {
      logger.error("Bitmap size mismatch");
      return failure(
        DisplayError.sizeMismatch(
          bitmap.width,
          bitmap.height,
          this.config.width,
          this.config.height,
        ),
      );
    }

    try {
      this.busy = true;

      // Determine update mode
      const updateMode =
        mode === DisplayUpdateMode.AUTO ? this.determineUpdateMode() : mode;

      // Convert Uint8Array to Buffer
      const buffer = Buffer.from(bitmap.data);

      // Send bitmap to display
      await this.epd.display(buffer);
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
   * Clear the display (set to white)
   */
  async clear(): Promise<Result<void>> {
    logger.info(`Clearing e-paper display: ${this.getDisplayModel()}`);
    if (!this.isInitialized || !this.epd) {
      logger.error("Display not initialized");
      return failure(DisplayError.notInitialized());
    }

    try {
      this.busy = true;
      await this.epd.clear(true);
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
    if (!this.isInitialized || !this.epd) {
      logger.error("Display not initialized");
      return failure(DisplayError.notInitialized());
    }

    try {
      this.busy = true;

      // Full refresh using slow mode
      await this.epd.clear(false);

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
    if (!this.isInitialized || !this.epd) {
      logger.error("Display not initialized");
      return failure(DisplayError.notInitialized());
    }

    if (this.isSleeping) {
      logger.info("Display already sleeping");
      return success(undefined);
    }

    try {
      await this.epd.sleep();
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
    if (!this.isInitialized || !this.epd) {
      logger.error("Display not initialized");
      return failure(DisplayError.notInitialized());
    }

    if (!this.isSleeping) {
      logger.info("Display is not sleeping");
      return success(undefined);
    }

    try {
      // Reinitialize the display to wake it up
      await this.epd.init();
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
      width: this.config.width,
      height: this.config.height,
      lastUpdate: this.lastUpdate || undefined,
      fullRefreshCount: this.fullRefreshCount,
      partialRefreshCount: this.partialRefreshCount,
    };
    logger.info("E-paper display status retrieved", status);
    return success(status);
  }

  /**
   * Get the display model name
   * Uses config.model if provided, otherwise detects based on dimensions
   */
  private getDisplayModel(): string {
    // If model is explicitly set in config, use that
    if (this.config.model) {
      return this.config.model;
    }

    // Otherwise, detect based on dimensions
    const { width, height } = this.config;

    return `${width}×${height}`;
  }

  /**
   * Check if the display is currently busy
   */
  isBusy(): boolean {
    if (this.busy) logger.info("E-paper display is busy");
    return this.busy;
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
    logger.info("Getting e-paper display dimensions");
    // Account for rotation
    if (this.rotation === 90 || this.rotation === 270) {
      logger.info(
        "Display is rotated, swapping width and height",
        this.config.width,
        this.config.height,
      );
      return {
        width: this.config.height,
        height: this.config.width,
      };
    }
    logger.info(
      "Display is not rotated, returning original dimensions",
      this.config.width,
      this.config.height,
    );
    return {
      width: this.config.width,
      height: this.config.height,
    };
  }

  /**
   * Reset the display hardware
   */
  async reset(): Promise<Result<void>> {
    logger.info(`Resetting e-paper display: ${this.getDisplayModel()}`);
    if (!this.isInitialized || !this.epd) {
      logger.error("Display not initialized");
      return failure(DisplayError.notInitialized());
    }

    try {
      // Reinitialize the display
      await this.epd.init();

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
    if (!this.isInitialized || !this.epd) {
      logger.info("E-paper service already disposed");
      return;
    }

    try {
      // Put display to sleep before disposing
      if (!this.isSleeping) {
        logger.info("Putting display to sleep before disposing");
        await this.sleep();
      }

      // Cleanup hardware resources
      this.epd.cleanup();

      this.isInitialized = false;
      this.busy = false;
      this.epd = null;
      logger.info("E-paper service disposed successfully");
    } catch (error) {
      logger.error("Error disposing e-paper service:", error);
    }
  }

  /**
   * Determine whether to use full or partial update
   * Full refresh every 10 updates to prevent ghosting
   */
  private determineUpdateMode(): DisplayUpdateMode {
    logger.info("Determining display update mode");
    const totalUpdates = this.fullRefreshCount + this.partialRefreshCount;

    // Do a full refresh every 10 updates, but default to PARTIAL for the first update
    if (totalUpdates > 0 && totalUpdates % 10 === 0) {
      logger.info("Choosing FULL update mode to prevent ghosting");
      return DisplayUpdateMode.FULL;
    }
    logger.info("Choosing PARTIAL update mode");
    return DisplayUpdateMode.PARTIAL;
  }

  /**
   * Helper method for async sleep (renamed to avoid conflict with sleep())
   */
  private sleepDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
