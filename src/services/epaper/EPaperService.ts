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

      return success(undefined);
    } catch (error) {
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
    if (!this.isInitialized || !this.epd) {
      return failure(DisplayError.notInitialized());
    }

    if (this.isSleeping) {
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

      // Convert Uint8Array to Buffer
      const buffer = Buffer.from(bitmap.data);

      // Send bitmap to display
      await this.epd.display(buffer);

      // Update statistics
      if (updateMode === DisplayUpdateMode.FULL) {
        this.fullRefreshCount++;
      } else if (updateMode === DisplayUpdateMode.PARTIAL) {
        this.partialRefreshCount++;
      }

      this.lastUpdate = new Date();
      return success(undefined);
    } catch (error) {
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
    if (!this.isInitialized || !this.epd) {
      return failure(DisplayError.notInitialized());
    }

    try {
      this.busy = true;
      await this.epd.clear(true);
      this.fullRefreshCount++;
      this.lastUpdate = new Date();
      return success(undefined);
    } catch (error) {
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
    if (!this.isInitialized || !this.epd) {
      return failure(DisplayError.notInitialized());
    }

    try {
      this.busy = true;

      // Full refresh using slow mode
      await this.epd.clear(false);

      this.fullRefreshCount++;
      this.lastUpdate = new Date();

      return success(undefined);
    } catch (error) {
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
    if (!this.isInitialized || !this.epd) {
      return failure(DisplayError.notInitialized());
    }

    if (this.isSleeping) {
      return success(undefined);
    }

    try {
      await this.epd.sleep();
      this.isSleeping = true;
      this.busy = false;

      return success(undefined);
    } catch (error) {
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
    if (!this.isInitialized || !this.epd) {
      return failure(DisplayError.notInitialized());
    }

    if (!this.isSleeping) {
      return success(undefined);
    }

    try {
      // Reinitialize the display to wake it up
      await this.epd.init();
      this.isSleeping = false;

      return success(undefined);
    } catch (error) {
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
    if (!this.isInitialized) {
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
    return this.busy;
  }

  /**
   * Wait for the display to become ready
   */
  async waitUntilReady(timeoutMs: number = 5000): Promise<Result<void>> {
    if (!this.isInitialized) {
      return failure(DisplayError.notInitialized());
    }

    const startTime = Date.now();

    while (this.busy && Date.now() - startTime < timeoutMs) {
      await this.sleepDelay(100);
    }

    if (this.busy) {
      return failure(DisplayError.timeout("waitUntilReady", timeoutMs));
    }

    return success(undefined);
  }

  /**
   * Set the display rotation
   */
  setRotation(rotation: 0 | 90 | 180 | 270): Result<void> {
    this.rotation = rotation;
    return success(undefined);
  }

  /**
   * Get display dimensions
   */
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

  /**
   * Reset the display hardware
   */
  async reset(): Promise<Result<void>> {
    if (!this.isInitialized || !this.epd) {
      return failure(DisplayError.notInitialized());
    }

    try {
      // Reinitialize the display
      await this.epd.init();

      this.busy = false;
      this.isSleeping = false;

      return success(undefined);
    } catch (error) {
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
    if (!this.isInitialized || !this.epd) {
      return;
    }

    try {
      // Put display to sleep before disposing
      if (!this.isSleeping) {
        await this.sleep();
      }

      // Cleanup hardware resources
      this.epd.cleanup();

      this.isInitialized = false;
      this.busy = false;
      this.epd = null;
    } catch (error) {
      logger.error("Error disposing e-paper service:", error);
    }
  }

  /**
   * Determine whether to use full or partial update
   * Full refresh every 10 updates to prevent ghosting
   */
  private determineUpdateMode(): DisplayUpdateMode {
    const totalUpdates = this.fullRefreshCount + this.partialRefreshCount;

    // Do a full refresh every 10 updates, but default to PARTIAL for the first update
    if (totalUpdates > 0 && totalUpdates % 10 === 0) {
      return DisplayUpdateMode.FULL;
    }

    return DisplayUpdateMode.PARTIAL;
  }

  /**
   * Helper method for async sleep (renamed to avoid conflict with sleep())
   */
  private sleepDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
