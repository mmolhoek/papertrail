import { IEpaperService } from "@core/interfaces";
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
import { MockAdapter } from "./adapters/MockAdapter";
import { MockDisplayDriver } from "./drivers/MockDisplayDriver";

const logger = getLogger("MockEpaperService");

/**
 * Mock E-Paper Service for development and testing
 *
 * Simulates e-paper display operations without requiring actual hardware.
 * Uses MockAdapter and MockDisplayDriver internally.
 *
 * Provides realistic mock behavior including:
 * - Display update simulation with delays
 * - Busy state management
 * - Sleep/wake state tracking
 * - Refresh count tracking (full vs partial)
 * - Bitmap validation
 * - PNG conversion for web UI viewing
 */
export class MockEpaperService implements IEpaperService {
  private readonly adapter: MockAdapter;
  private readonly driver: MockDisplayDriver;
  private initialized = false;
  private sleeping = false;
  private busy = false;
  private fullRefreshCount = 0;
  private partialRefreshCount = 0;
  private lastUpdate: Date | null = null;
  private rotation: 0 | 90 | 180 | 270;

  constructor(private readonly config: EpaperConfig) {
    this.rotation = config.rotation;
    this.adapter = new MockAdapter();
    this.driver = new MockDisplayDriver(config.width, config.height);

    logger.info("Mock E-Paper Service created (for development/testing)");
    logger.info(`Mock E-Paper: Display size ${config.width}x${config.height}`);
  }

  async initialize(): Promise<Result<void>> {
    if (this.initialized) {
      return success(undefined);
    }

    logger.info("Initializing Mock E-Paper Service...");

    try {
      // Initialize adapter with config
      this.adapter.init(
        {
          reset: this.config.pins.reset,
          dc: this.config.pins.dc,
          busy: this.config.pins.busy,
          power: this.config.pins.power,
        },
        this.config.spi || { bus: 0, device: 0, speed: 256000 },
      );

      // Initialize driver with adapter
      await this.driver.init(this.adapter);

      this.initialized = true;
      this.sleeping = false;
      this.busy = false;

      logger.info("Mock E-Paper Service initialized");
      return success(undefined);
    } catch (error) {
      logger.error("Failed to initialize Mock E-Paper Service:", error);
      if (error instanceof Error) {
        return failure(DisplayError.initFailed(error.message, error));
      }
      return failure(DisplayError.initFailed("Unknown error"));
    }
  }

  async displayLogo(
    mode: DisplayUpdateMode = DisplayUpdateMode.FULL,
  ): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    logger.info("Mock E-Paper: Displaying logo...");

    try {
      this.busy = true;

      // Simulate logo display delay
      const updateDelay = mode === DisplayUpdateMode.FULL ? 2000 : 500;
      await this.delay(updateDelay);

      // Update statistics
      if (mode === DisplayUpdateMode.FULL) {
        this.fullRefreshCount++;
      } else if (mode === DisplayUpdateMode.PARTIAL) {
        this.partialRefreshCount++;
      }

      this.lastUpdate = new Date();
      logger.info("Mock E-Paper: Logo displayed successfully");
      return success(undefined);
    } catch (error) {
      logger.error("Mock E-Paper: Display logo failed:", error);
      if (error instanceof Error) {
        return failure(DisplayError.updateFailed(error));
      }
      return failure(DisplayError.updateFailed(new Error("Unknown error")));
    } finally {
      this.busy = false;
    }
  }

  async dispose(): Promise<void> {
    logger.info("Disposing Mock E-Paper Service...");

    if (!this.sleeping && this.initialized) {
      logger.info("Mock E-Paper: Putting display to sleep before disposing");
      await this.sleep();
    }

    await this.driver.dispose();
    this.adapter.dispose();

    this.initialized = false;
    this.busy = false;
    logger.info("Mock E-Paper Service disposed");
  }

  async displayBitmap(
    bitmap: Bitmap1Bit,
    mode: DisplayUpdateMode = DisplayUpdateMode.AUTO,
  ): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    if (this.sleeping) {
      return failure(
        new DisplayError(
          "Display is sleeping. Call wake() first.",
          DisplayErrorCode.DISPLAY_SLEEPING,
          true,
        ),
      );
    }

    if (this.busy) {
      return failure(DisplayError.displayBusy());
    }

    // Validate bitmap dimensions
    if (
      bitmap.width !== this.config.width ||
      bitmap.height !== this.config.height
    ) {
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

      logger.info(
        `Mock E-Paper: Displaying bitmap (${bitmap.width}x${bitmap.height}, ${bitmap.data.length} bytes, ${updateMode} mode)`,
      );

      // Use driver to display
      const buffer = Buffer.from(bitmap.data);
      const useFastMode = updateMode !== DisplayUpdateMode.FULL;
      await this.driver.display(buffer, useFastMode);

      // Update statistics
      if (updateMode === DisplayUpdateMode.FULL) {
        this.fullRefreshCount++;
      } else if (updateMode === DisplayUpdateMode.PARTIAL) {
        this.partialRefreshCount++;
      }

      this.lastUpdate = new Date();
      logger.info(
        `Mock E-Paper: Bitmap displayed successfully (${updateMode} update)`,
      );

      return success(undefined);
    } catch (error) {
      logger.error("Mock E-Paper: Display bitmap failed:", error);
      if (error instanceof Error) {
        return failure(DisplayError.updateFailed(error));
      }
      return failure(DisplayError.updateFailed(new Error("Unknown error")));
    } finally {
      this.busy = false;
    }
  }

  async displayBitmapFromFile(
    filePath: string,
    mode: DisplayUpdateMode = DisplayUpdateMode.FULL,
  ): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    logger.info(`Mock E-Paper: Loading and displaying image from: ${filePath}`);

    try {
      // For mock service, create a simulated bitmap instead of loading the file
      // This allows testing without requiring actual image files
      const dataSize = Math.ceil((this.config.width * this.config.height) / 8);
      const bitmap: Bitmap1Bit = {
        width: this.config.width,
        height: this.config.height,
        data: new Uint8Array(dataSize),
      };
      logger.info(`Mock E-Paper: Created simulated ${dataSize} byte bitmap`);

      return await this.displayBitmap(bitmap, mode);
    } catch (error) {
      logger.error(
        `Mock E-Paper: Failed to load and display image from ${filePath}:`,
        error,
      );
      if (error instanceof Error) {
        return failure(DisplayError.updateFailed(error));
      }
      return failure(DisplayError.updateFailed(new Error("Unknown error")));
    }
  }

  async clear(): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    logger.info("Mock E-Paper: Clearing display...");

    try {
      this.busy = true;

      await this.driver.clear(false);

      this.fullRefreshCount++;
      this.lastUpdate = new Date();

      logger.info("Mock E-Paper: Display cleared");
      return success(undefined);
    } catch (error) {
      logger.error("Mock E-Paper: Clear failed:", error);
      if (error instanceof Error) {
        return failure(DisplayError.updateFailed(error));
      }
      return failure(DisplayError.updateFailed(new Error("Unknown error")));
    } finally {
      this.busy = false;
    }
  }

  async fullRefresh(): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    logger.info("Mock E-Paper: Performing full refresh...");

    try {
      this.busy = true;

      await this.driver.clear(false);

      this.fullRefreshCount++;
      this.lastUpdate = new Date();

      logger.info("Mock E-Paper: Full refresh completed");
      return success(undefined);
    } catch (error) {
      logger.error("Mock E-Paper: Full refresh failed:", error);
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

  async sleep(): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    if (this.sleeping) {
      logger.info("Mock E-Paper: Display already sleeping");
      return success(undefined);
    }

    logger.info("Mock E-Paper: Putting display to sleep...");
    await this.driver.sleep();

    this.sleeping = true;
    this.busy = false;

    logger.info("Mock E-Paper: Display is now sleeping");
    return success(undefined);
  }

  async wake(): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    if (!this.sleeping) {
      logger.info("Mock E-Paper: Display is not sleeping");
      return success(undefined);
    }

    logger.info("Mock E-Paper: Waking display...");
    await this.driver.wake();

    this.sleeping = false;

    logger.info("Mock E-Paper: Display is now awake");
    return success(undefined);
  }

  async getStatus(): Promise<Result<EpaperStatus>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    const status: EpaperStatus = {
      initialized: this.initialized,
      busy: this.busy,
      sleeping: this.sleeping,
      model: this.getDisplayModel(),
      width: this.config.width,
      height: this.config.height,
      lastUpdate: this.lastUpdate || undefined,
      fullRefreshCount: this.fullRefreshCount,
      partialRefreshCount: this.partialRefreshCount,
    };

    logger.info("Mock E-Paper: Status retrieved", status);
    return success(status);
  }

  isBusy(): boolean {
    return this.busy;
  }

  async waitUntilReady(timeoutMs: number = 5000): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    logger.info(
      `Mock E-Paper: Waiting for display to become ready (timeout: ${timeoutMs}ms)...`,
    );

    const startTime = Date.now();

    while (this.busy && Date.now() - startTime < timeoutMs) {
      await this.delay(100);
    }

    if (this.busy) {
      logger.error("Mock E-Paper: Timeout waiting for display to become ready");
      return failure(DisplayError.timeout("waitUntilReady", timeoutMs));
    }

    logger.info("Mock E-Paper: Display is ready");
    return success(undefined);
  }

  setRotation(rotation: 0 | 90 | 180 | 270): Result<void> {
    logger.info(`Mock E-Paper: Setting rotation to ${rotation}°`);
    this.rotation = rotation;
    return success(undefined);
  }

  getDimensions(): { width: number; height: number } {
    // Account for rotation
    if (this.rotation === 90 || this.rotation === 270) {
      return {
        width: this.config.height,
        height: this.config.width,
      };
    }
    return {
      width: this.config.width,
      height: this.config.height,
    };
  }

  async reset(): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    logger.info("Mock E-Paper: Resetting display...");
    await this.adapter.reset();
    await this.driver.wake();

    this.busy = false;
    this.sleeping = false;

    logger.info("Mock E-Paper: Display reset completed");
    return success(undefined);
  }

  /**
   * Get the last displayed image as a PNG buffer
   * This is only available in MockEpaperService for development/testing
   * @returns PNG buffer or null if no image has been displayed
   */
  getMockDisplayImage(): Buffer | null {
    return this.driver.getDisplayPng();
  }

  /**
   * Check if a mock display image is available
   */
  hasMockDisplayImage(): boolean {
    return this.driver.hasDisplayContent();
  }

  /**
   * Get the display model name
   */
  private getDisplayModel(): string {
    if (this.config.model) {
      return this.config.model;
    }
    return `Mock ${this.config.width}×${this.config.height}`;
  }

  /**
   * Determine whether to use full or partial update
   * Full refresh every 10 updates to prevent ghosting
   */
  private determineUpdateMode(): DisplayUpdateMode {
    const totalUpdates = this.fullRefreshCount + this.partialRefreshCount;

    // Do a full refresh every 10 updates
    if (totalUpdates > 0 && totalUpdates % 10 === 0) {
      return DisplayUpdateMode.FULL;
    }
    return DisplayUpdateMode.PARTIAL;
  }

  /**
   * Simulate async delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
