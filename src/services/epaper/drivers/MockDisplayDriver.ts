import { DisplayCapabilities } from "@core/interfaces/IDisplayDriver";
import { IHardwareAdapter } from "@core/interfaces/IHardwareAdapter";
import { DisplayType } from "@core/types";
import { BaseEpaperDriver } from "./BaseEpaperDriver";
import * as imagemagick from "@utils/imagemagick";

/**
 * Mock Display Driver for testing and development
 *
 * Simulates display operations without requiring actual hardware.
 * Converts displayed bitmaps to PNG for web UI viewing.
 * Extends BaseEpaperDriver to simulate e-paper behavior.
 */
export class MockDisplayDriver extends BaseEpaperDriver {
  readonly name = "mock_display";

  readonly capabilities: DisplayCapabilities & {
    supportsPartialRefresh: boolean;
    refreshTimeFullMs: number;
    refreshTimePartialMs: number;
  };

  private lastDisplayedBuffer: Buffer | null = null;
  private lastDisplayedPng: Buffer | null = null;

  constructor(
    width: number = 800,
    height: number = 480,
    options?: { refreshTimeFullMs?: number; refreshTimePartialMs?: number },
  ) {
    super();
    this.capabilities = {
      width,
      height,
      colorDepth: "1bit",
      displayType: DisplayType.MOCK,
      supportsPartialRefresh: true,
      refreshTimeFullMs: options?.refreshTimeFullMs ?? 2000,
      refreshTimePartialMs: options?.refreshTimePartialMs ?? 500,
      supportsSleep: true,
    };
  }

  /**
   * Initialize mock display (minimal setup)
   */
  protected async initDisplay(): Promise<void> {
    this.logger.info("Mock display initialized");
  }

  /**
   * Simulate displaying buffer
   */
  async display(buffer: Buffer, fast: boolean): Promise<void> {
    this.logger.time("display");

    // Validate buffer size
    const expectedSize = Math.ceil(
      (this.capabilities.width * this.capabilities.height) / 8,
    );
    if (buffer.length !== expectedSize) {
      throw new Error(
        `Invalid buffer size: expected ${expectedSize}, got ${buffer.length}`,
      );
    }

    // Simulate display update delay
    const delay = fast
      ? this.capabilities.refreshTimePartialMs
      : this.capabilities.refreshTimeFullMs;
    await this.delay(delay);

    // Store buffer and convert to PNG
    this.lastDisplayedBuffer = Buffer.from(buffer);
    await this.convertToPng(buffer);

    this.logger.timeEnd("display");
    this.logger.info(
      `Mock display updated (${fast ? "fast" : "full"} refresh)`,
    );
  }

  /**
   * Simulate clearing display
   */
  async clear(fast: boolean): Promise<void> {
    this.logger.time("clear");

    // Create white buffer
    const buffer = this.getBuffer();
    buffer.fill(0xff);

    // Simulate clear delay
    const delay = fast
      ? this.capabilities.refreshTimePartialMs
      : this.capabilities.refreshTimeFullMs;
    await this.delay(delay);

    // Store and convert
    this.lastDisplayedBuffer = Buffer.from(buffer);
    await this.convertToPng(buffer);

    this.logger.timeEnd("clear");
    this.logger.info("Mock display cleared");
  }

  /**
   * Simulate sleep (no-op)
   */
  async sleep(): Promise<void> {
    this.logger.info("Mock display sleeping");
    this.setSleeping(true);
    await this.delay(100);
  }

  /**
   * Always ready (mock doesn't have busy state)
   */
  isReady(): boolean {
    return true;
  }

  /**
   * No-op for mock
   */
  async waitUntilReady(_timeoutMs: number): Promise<void> {
    // Mock is always ready
  }

  /**
   * Initialize with mock adapter (minimal)
   */
  async init(adapter: IHardwareAdapter): Promise<void> {
    this.adapter = adapter;
    this.logger = (await import("@utils/logger")).getLogger(this.name);

    // Allocate buffer
    const bufferSize = this.calculateBufferSize();
    this.buffer = Buffer.alloc(bufferSize);
    this.logger.info(`Mock display buffer allocated: ${bufferSize} bytes`);

    await this.initDisplay();
    this.setSleeping(false);
  }

  // --- Mock-specific methods ---

  /**
   * Get the last displayed buffer as PNG
   */
  getDisplayPng(): Buffer | null {
    return this.lastDisplayedPng;
  }

  /**
   * Get the raw last displayed buffer
   */
  getDisplayBuffer(): Buffer | null {
    return this.lastDisplayedBuffer;
  }

  /**
   * Check if display has content
   */
  hasDisplayContent(): boolean {
    return this.lastDisplayedPng !== null;
  }

  /**
   * Convert 1-bit bitmap to PNG using ImageMagick
   */
  private async convertToPng(buffer: Buffer): Promise<void> {
    try {
      this.lastDisplayedPng = await imagemagick.packedBitmapToPng(
        buffer,
        this.capabilities.width,
        this.capabilities.height,
      );
      this.logger.info(`PNG generated: ${this.lastDisplayedPng.length} bytes`);
    } catch (error) {
      this.logger.error("Failed to convert to PNG:", error);
      this.lastDisplayedPng = null;
    }
  }
}
