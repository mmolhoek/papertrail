import {
  IDisplayDriver,
  DisplayCapabilities,
} from "@core/interfaces/IDisplayDriver";
import { IHardwareAdapter } from "@core/interfaces/IHardwareAdapter";
import { ColorDepth } from "@core/types";
import { getLogger } from "@utils/logger";
import * as magickProcessor from "@utils/magickImageProcessor";

/**
 * Base class for display drivers
 *
 * Provides common functionality shared across all display drivers:
 * - State management
 * - Ready polling
 * - Logging
 * - Image loading
 * - Buffer management
 *
 * Subclasses must implement display-specific:
 * - Command sequences
 * - Initialization routines
 * - Buffer handling
 *
 * For e-paper specific functionality (sleep/wake), see BaseEpaperDriver.
 */
export abstract class BaseDisplayDriver implements IDisplayDriver {
  /**
   * Unique driver identifier
   */
  abstract readonly name: string;

  /**
   * Display capabilities and specifications
   */
  abstract readonly capabilities: DisplayCapabilities;

  /**
   * Hardware adapter for GPIO/SPI operations
   */
  protected adapter: IHardwareAdapter | null = null;

  /**
   * Logger instance for this driver
   */
  protected logger = getLogger("DisplayDriver");

  /**
   * Internal buffer for display data
   */
  protected buffer: Buffer | null = null;

  /**
   * Initialize the display with a hardware adapter
   */
  async init(adapter: IHardwareAdapter): Promise<void> {
    this.logger = getLogger(this.name);
    this.logger.info(`Initializing ${this.name} driver...`);
    this.logger.info(
      `  Display: ${this.capabilities.width}x${this.capabilities.height}, ${this.capabilities.colorDepth}`,
    );

    this.adapter = adapter;

    // Allocate buffer based on color depth
    const bufferSize = this.calculateBufferSize();
    this.buffer = Buffer.alloc(bufferSize);
    this.logger.info(`  Buffer allocated: ${bufferSize} bytes`);

    // Perform hardware reset
    await this.adapter.reset();

    // Wait for display to be ready after reset
    await this.waitForReady();

    // Call display-specific initialization
    await this.initDisplay();

    this.logger.info(`${this.name} driver initialized successfully`);
  }

  /**
   * Display-specific initialization sequence
   * Subclasses must implement this with their command sequences
   */
  protected abstract initDisplay(): Promise<void>;

  /**
   * Clean up display resources
   */
  async dispose(): Promise<void> {
    this.logger.info(`Disposing ${this.name} driver...`);
    await this.onDispose();
    this.adapter = null;
    this.buffer = null;
    this.logger.info(`${this.name} driver disposed`);
  }

  /**
   * Hook for subclasses to perform cleanup before disposal
   * Override this to add sleep or other cleanup operations
   */
  protected async onDispose(): Promise<void> {
    // Default: no-op. Subclasses can override.
  }

  /**
   * Display a buffer on the screen
   * Subclasses must implement with display-specific commands
   */
  abstract display(buffer: Buffer, fast: boolean): Promise<void>;

  /**
   * Clear the display
   * Subclasses must implement with display-specific commands
   */
  abstract clear(fast: boolean): Promise<void>;

  /**
   * Check if display is ready (not busy)
   */
  isReady(): boolean {
    if (!this.adapter) return false;
    const pins = this.adapter.getPins();
    return !this.adapter.gpioRead(pins.busy);
  }

  /**
   * Wait until display is ready
   */
  async waitUntilReady(timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    let count = 0;

    while (!this.isReady()) {
      if (Date.now() - startTime > timeoutMs) {
        this.logger.warn(
          `Timeout waiting for display ready after ${timeoutMs}ms`,
        );
        throw new Error(`Display busy timeout after ${timeoutMs}ms`);
      }

      await this.delay(5);
      count++;

      // Log every 200 iterations (~1 second)
      if (count % 200 === 0) {
        this.logger.debug(
          `Still waiting for display... (${Date.now() - startTime}ms)`,
        );
      }
    }
  }

  /**
   * Load an image from file
   */
  async loadImage(filePath: string): Promise<Buffer> {
    this.logger.info(`Loading image: ${filePath}`);
    const buffer = await magickProcessor.loadImageToBuffer(
      filePath,
      this.capabilities.width,
      this.capabilities.height,
    );
    this.logger.info(`Image loaded: ${buffer.length} bytes`);
    return buffer;
  }

  // --- Protected helper methods for subclasses ---

  /**
   * Wait for display to be ready (internal use)
   * Uses default timeout based on display refresh time
   */
  protected async waitForReady(): Promise<void> {
    const timeout = (this.capabilities.refreshTimeFullMs ?? 3000) + 1000;
    await this.waitUntilReady(timeout);
  }

  /**
   * Send a command to the display
   */
  protected sendCommand(command: number): void {
    if (!this.adapter) {
      throw new Error("Adapter not initialized");
    }
    this.adapter.sendCommand(command);
  }

  /**
   * Send data to the display
   */
  protected sendData(data: number | Buffer): void {
    if (!this.adapter) {
      throw new Error("Adapter not initialized");
    }
    this.adapter.sendData(data);
  }

  /**
   * Delay for specified milliseconds
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Calculate buffer size based on display dimensions and color depth
   */
  protected calculateBufferSize(): number {
    const { width, height, colorDepth } = this.capabilities;
    return BaseDisplayDriver.calculateBufferSizeForColorDepth(
      width,
      height,
      colorDepth,
    );
  }

  /**
   * Static helper to calculate buffer size for a given color depth
   */
  static calculateBufferSizeForColorDepth(
    width: number,
    height: number,
    colorDepth: ColorDepth,
  ): number {
    switch (colorDepth) {
      // E-paper types
      case "1bit":
        // 1 bit per pixel, packed into bytes
        return Math.ceil((width * height) / 8);

      case "4bit-grayscale":
        // 4 bits per pixel, 2 pixels per byte
        return Math.ceil((width * height) / 2);

      case "3color-bwr":
      case "3color-bwy":
        // Two separate buffers: black channel + color channel
        // Each is 1 bit per pixel
        return Math.ceil((width * height) / 8) * 2;

      // LCD/HDMI types
      case "8bit-grayscale":
        // 8 bits per pixel
        return width * height;

      case "rgb565":
        // 16 bits per pixel (2 bytes)
        return width * height * 2;

      case "rgb888":
        // 24 bits per pixel (3 bytes)
        return width * height * 3;

      case "rgba8888":
        // 32 bits per pixel (4 bytes)
        return width * height * 4;

      default:
        // Default to 1-bit
        return Math.ceil((width * height) / 8);
    }
  }

  /**
   * Get the internal buffer
   */
  protected getBuffer(): Buffer {
    if (!this.buffer) {
      throw new Error("Buffer not allocated");
    }
    return this.buffer;
  }
}
