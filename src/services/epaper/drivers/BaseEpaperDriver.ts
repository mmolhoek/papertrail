import { IEpaperDriver } from "@core/interfaces/IEpaperDriver";
import { DisplayCapabilities } from "@core/interfaces/IDisplayDriver";
import { BaseDisplayDriver } from "./BaseDisplayDriver";

/**
 * Base class for e-paper display drivers
 *
 * Extends BaseDisplayDriver with e-paper specific functionality:
 * - Sleep/wake power management
 * - Sleeping state tracking
 * - Multi-color channel support (for 3-color displays)
 *
 * Subclasses must implement:
 * - sleep(): Put display into deep sleep mode
 * - display(): Display buffer with refresh mode control
 * - clear(): Clear the display
 * - initDisplay(): Display-specific initialization
 */
export abstract class BaseEpaperDriver
  extends BaseDisplayDriver
  implements IEpaperDriver
{
  /**
   * Whether the display is currently sleeping
   */
  protected sleeping: boolean = false;

  /**
   * Display capabilities (must include e-paper specific fields)
   */
  abstract readonly capabilities: DisplayCapabilities & {
    supportsPartialRefresh: boolean;
    refreshTimeFullMs: number;
    refreshTimePartialMs: number;
  };

  /**
   * Put display into deep sleep mode
   * Subclasses must implement with display-specific commands
   */
  abstract sleep(): Promise<void>;

  /**
   * Display a buffer with refresh mode control
   * This is the e-paper specific display method that supports fast/partial refresh
   * @param buffer Image data in display's native format
   * @param fast Use fast/partial refresh if true, full refresh if false
   */
  async displayWithMode(buffer: Buffer, fast: boolean): Promise<void> {
    return this.display(buffer, fast);
  }

  /**
   * Display with separate color channel (for 3-color displays)
   * Default implementation throws - override for 3-color displays
   */
  async displayWithColor(
    _buffer: Buffer,
    _colorBuffer: Buffer,
    _fast: boolean,
  ): Promise<void> {
    throw new Error(
      `${this.name} does not support 3-color display. Use display() instead.`,
    );
  }

  /**
   * Wake display from sleep
   * Default implementation reinitializes the display
   */
  async wake(): Promise<void> {
    if (!this.sleeping) {
      this.logger.info("Display is not sleeping");
      return;
    }

    this.logger.info("Waking display...");

    if (!this.adapter) {
      throw new Error("Cannot wake: adapter not initialized");
    }

    // Most e-paper displays require full reinitialization after sleep
    await this.adapter.reset();
    await this.waitForReady();
    await this.initDisplay();

    this.sleeping = false;
    this.logger.info("Display awake");
  }

  /**
   * Check if the display is currently sleeping
   */
  isSleeping(): boolean {
    return this.sleeping;
  }

  /**
   * Override onDispose to sleep the display before cleanup
   */
  protected override async onDispose(): Promise<void> {
    if (!this.sleeping) {
      await this.sleep();
    }
  }

  /**
   * Mark the display as sleeping (for use by subclass sleep implementations)
   */
  protected setSleeping(value: boolean): void {
    this.sleeping = value;
  }
}
