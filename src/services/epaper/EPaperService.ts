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

/**
 * E-Paper Service Implementation
 *
 * Manages the e-paper display hardware.
 * Handles initialization, display updates, and power management.
 *
 * NOTE: Actual hardware communication will be implemented later.
 * This version provides the structure and basic logic.
 */
export class EpaperService implements IEpaperService {
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
      // TODO: Initialize SPI communication
      // TODO: Initialize GPIO pins
      // TODO: Send display initialization commands

      // For now, just simulate initialization
      await this.sleep();

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
    if (!this.isInitialized) {
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

      // TODO: Send bitmap data to display via SPI
      // TODO: Trigger display update with appropriate mode

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
      this.busy = false; // Reset busy state in all cases
    }
  }

  /**
   * Clear the display (set to white)
   */
  async clear(): Promise<Result<void>> {
    if (!this.isInitialized) {
      return failure(DisplayError.notInitialized());
    }

    const blankBitmap: Bitmap1Bit = {
      width: this.config.width,
      height: this.config.height,
      data: new Uint8Array(
        Math.ceil((this.config.width * this.config.height) / 8),
      ).fill(0xff),
    };

    return await this.displayBitmap(blankBitmap, DisplayUpdateMode.FULL);
  }

  /**
   * Perform a full refresh to clear ghosting
   */
  async fullRefresh(): Promise<Result<void>> {
    if (!this.isInitialized) {
      return failure(DisplayError.notInitialized());
    }

    try {
      this.busy = true;

      // TODO: Send full refresh commands to display

      // Simulate full refresh time
      await this.sleep();

      this.fullRefreshCount++;
      this.lastUpdate = new Date();
      this.busy = false;

      return success(undefined);
    } catch (error) {
      this.busy = false;
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
    }
  }

  /**
   * Put the display into sleep mode
   */
  async sleep(): Promise<Result<void>> {
    if (!this.isInitialized) {
      return failure(DisplayError.notInitialized());
    }

    if (this.isSleeping) {
      return success(undefined); // Already sleeping
    }

    try {
      // TODO: Send sleep command to display

      // Simulate sleep command time
      await this.sleepDelay(100);

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
    if (!this.isInitialized) {
      return failure(DisplayError.notInitialized());
    }

    if (!this.isSleeping) {
      return success(undefined); // Already awake
    }

    try {
      // TODO: Send wake command to display
      // TODO: May need to reinitialize display

      // Simulate wake command time
      await this.sleepDelay(100);

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
    if (!this.isInitialized) {
      return failure(DisplayError.notInitialized());
    }

    try {
      // TODO: Toggle reset pin
      // TODO: Wait for reset time
      // TODO: Reinitialize display

      // Simulate reset time
      await this.sleepDelay(200);

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
    if (!this.isInitialized) {
      return;
    }

    try {
      // Put display to sleep before disposing
      if (!this.isSleeping) {
        await this.sleep();
      }

      // TODO: Close SPI connection
      // TODO: Release GPIO pins

      this.isInitialized = false;
      this.busy = false;
    } catch (error) {
      console.error("Error disposing e-paper service:", error);
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
