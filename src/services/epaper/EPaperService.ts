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
import * as lgpio from "lgpio";
import sharp from "sharp";
import * as bmp from "bmp-js";
import { getLogger } from "../../utils/logger";

const logger = getLogger("EPaperService");
const epdLogger = getLogger("EPaperService");

/**
 * Pin configuration for the waveshare 4.26 ePaper display (800x480) 1-bit black and white
 */
interface EPDConfig {
  width?: number;
  height?: number;
  spiDevice?: string;
  rstGPIO?: number;
  dcGPIO?: number;
  busyGPIO?: number;
  powerGPIO?: number;
}

/**
 * Internal EPD hardware control class
 */
class EPD {
  private readonly WIDTH: number;
  private readonly HEIGHT: number;
  private rstGPIO: number;
  private dcGPIO: number;
  private busyGPIO: number;
  private powerGPIO: number;
  private chip: number;
  private spiHandle: number;
  private buffer: Buffer;

  constructor(config: EPDConfig = {}) {
    const {
      width = 800,
      height = 480,
      rstGPIO = 17,
      dcGPIO = 25,
      busyGPIO = 24,
      powerGPIO = 18,
    } = config;
    this.WIDTH = width || 800;
    this.HEIGHT = height || 480;
    this.rstGPIO = rstGPIO;
    this.dcGPIO = dcGPIO;
    this.busyGPIO = busyGPIO;
    this.powerGPIO = powerGPIO;

    this.chip = lgpio.gpiochipOpen(0);
    this.spiHandle = lgpio.spiOpen(0, 0, 256000);

    lgpio.gpioClaimOutput(this.chip, this.rstGPIO, undefined, false);
    lgpio.gpioClaimOutput(this.chip, this.dcGPIO, undefined, false);
    lgpio.gpioClaimInput(this.chip, this.busyGPIO);
    lgpio.gpioClaimOutput(this.chip, this.powerGPIO, undefined, true);

    epdLogger.info(
      `Display (${this.WIDTH}, ${this.HEIGHT}), buffer size: ${(this.WIDTH / 8) * this.HEIGHT} bytes`,
    );
    this.buffer = Buffer.alloc((this.WIDTH / 8) * this.HEIGHT);
  }

  public get width(): number {
    return this.WIDTH;
  }

  public get height(): number {
    return this.HEIGHT;
  }

  private async reset(): Promise<void> {
    console.time("epaper: reset");
    lgpio.gpioWrite(this.chip, this.rstGPIO, true);
    await this.delay(20);
    lgpio.gpioWrite(this.chip, this.rstGPIO, false);
    await this.delay(2);
    lgpio.gpioWrite(this.chip, this.rstGPIO, true);
    await this.delay(20);
    console.timeEnd("epaper: reset");
  }

  private sendCommand(command: number): void {
    lgpio.gpioWrite(this.chip, this.dcGPIO, false);
    const txBuffer = Buffer.from([command]);
    lgpio.spiWrite(this.spiHandle, new Uint8Array(txBuffer));
  }

  private sendData(data: number | Buffer): void {
    if (typeof data !== "number") console.time("sendData");
    lgpio.gpioWrite(this.chip, this.dcGPIO, true);

    if (typeof data === "number") {
      const txBuffer = new Uint8Array([data]);
      lgpio.spiWrite(this.spiHandle, txBuffer);
    } else {
      const txBuffer = new Uint8Array(data);
      lgpio.spiWrite(this.spiHandle, txBuffer);
    }
    if (typeof data !== "number") console.timeEnd("sendData");
  }

  private async epaperReady(): Promise<void> {
    let count = 0;
    console.time("epaperReady");
    while (lgpio.gpioRead(this.chip, this.busyGPIO) === true) {
      await this.delay(5);
      count++;
      if (count > 1000) {
        break;
      }
    }
    console.timeEnd("epaperReady");
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async init(): Promise<void> {
    console.time("init");
    await this.reset();
    await this.epaperReady();

    this.sendCommand(0x12); // SWRESET
    await this.epaperReady();

    this.sendCommand(0x18); // Use the internal temperature sensor
    this.sendData(0x80);

    this.sendCommand(0x0c); // Set soft start
    this.sendData(0xae);
    this.sendData(0xc7);
    this.sendData(0xc3);
    this.sendData(0xc0);
    this.sendData(0x80);

    this.sendCommand(0x01); // Driver output control
    this.sendData((this.HEIGHT - 1) & 0xff); // Y (low byte)
    this.sendData((this.HEIGHT - 1) >> 8); // Y (high byte)
    this.sendData(0x02);

    this.sendCommand(0x3c); // Border setting
    this.sendData(0x01);

    this.sendCommand(0x11); // Data entry mode
    this.sendData(0x01); // X-mode x+ y-

    this.setWindow(0, this.HEIGHT - 1, this.WIDTH - 1, 0);

    this.setCursor(0, 0);
    await this.epaperReady();
    console.timeEnd("init");
  }

  async clear(fast: boolean = true): Promise<void> {
    console.time("clear");
    console.time("clear: Buffer fill");
    this.buffer.fill(0xff);
    console.timeEnd("clear: Buffer fill");

    console.time("clear: Sending data");
    this.sendCommand(0x24);
    this.sendData(this.buffer);
    console.timeEnd("clear: Sending data");

    await this.turnOnDisplay(fast);
    console.timeEnd("clear");
  }

  async display(imageBuffer?: Buffer): Promise<void> {
    console.time("display");
    const buf = imageBuffer || this.buffer;

    this.sendCommand(0x24);
    this.sendData(buf);
    await this.turnOnDisplay();
    console.timeEnd("display");
  }

  private async turnOnDisplay(fast: boolean = true): Promise<void> {
    console.time("turnOnDisplay");
    this.sendCommand(0x22); // Display update control
    this.sendData(fast ? 0xff : 0xf7); // Fast or slow refresh
    this.sendCommand(0x20); // Activate display update sequence
    await this.epaperReady();
    console.timeEnd("turnOnDisplay");
  }

  async sleep(): Promise<void> {
    console.time("sleep");
    this.sendCommand(0x10); // Enter deep sleep mode
    this.sendData(0x01); // Deep sleep command
    await this.delay(100); // Wait for the command to take effect
    console.timeEnd("sleep");
  }

  getBuffer(): Buffer {
    return this.buffer;
  }

  setPixel(x: number, y: number, color: number): void {
    if (x < 0 || x >= this.WIDTH || y < 0 || y >= this.HEIGHT) {
      return;
    }

    const byteIndex = (x + y * this.WIDTH) >> 3;
    const bitIndex = 7 - (x & 7);

    if (color === 0) {
      this.buffer[byteIndex] |= 1 << bitIndex;
    } else {
      this.buffer[byteIndex] &= ~(1 << bitIndex);
    }
  }

  drawHLine(x: number, y: number, width: number, color: number): void {
    for (let i = 0; i < width; i++) {
      this.setPixel(x + i, y, color);
    }
  }

  drawVLine(x: number, y: number, height: number, color: number): void {
    for (let i = 0; i < height; i++) {
      this.setPixel(x, y + i, color);
    }
  }

  drawRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
  ): void {
    this.drawHLine(x, y, width, color);
    this.drawHLine(x, y + height - 1, width, color);
    this.drawVLine(x, y, height, color);
    this.drawVLine(x + width - 1, y, height, color);
  }

  fillRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
  ): void {
    for (let i = 0; i < height; i++) {
      this.drawHLine(x, y + i, width, color);
    }
  }

  async loadImage(imagePath: string): Promise<Buffer> {
    const bmpBuffer = await sharp(imagePath)
      .resize(this.WIDTH, this.HEIGHT, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255 },
      })
      .raw()
      .toBuffer();

    let bitmap: any;

    epdLogger.info("Image loaded, converting using sharp...");

    try {
      await sharp(bmpBuffer)
        .raw()
        .toBuffer()
        .then((data: Buffer) => {
          epdLogger.info("Image loaded, converting to BMP format...");
          bitmap = bmp.encode({
            data: data,
            width: this.WIDTH,
            height: this.HEIGHT,
          });
          bitmap = bmp.decode(bitmap.data);
          epdLogger.info("Image converted to BMP!");
        })
        .catch((err: Error) => {
          epdLogger.error("Error:", err);
        });
    } catch (err) {
      epdLogger.error("Failed to convert image to BMP format:", err);
    }

    if (!bitmap) {
      throw new Error("Failed to load image");
    }

    const scaleFactor = Math.min(
      this.WIDTH / bitmap.width,
      this.HEIGHT / bitmap.height,
      1,
    );

    const targetWidth = Math.floor(bitmap.width * scaleFactor);
    const targetHeight = Math.floor(bitmap.height * scaleFactor);

    const packedBytesBuffer = await sharp(bitmap.data, {
      raw: {
        width: bitmap.width,
        height: bitmap.height,
        channels: 4,
      },
    })
      .resize(targetWidth, targetHeight)
      .greyscale()
      .threshold(128)
      .toColourspace("b-w")
      .raw()
      .toBuffer();

    const buf = Buffer.alloc((this.WIDTH / 8) * this.HEIGHT, 0xff);

    const xOffset = Math.max(0, Math.floor((this.WIDTH - targetWidth) / 2));
    const yOffset = Math.max(0, Math.floor((this.HEIGHT - targetHeight) / 2));

    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const pixelIndex = y * targetWidth + x;
        const byteIndex = Math.floor(
          (x + xOffset + (y + yOffset) * this.WIDTH) / 8,
        );
        const bitIndex = 7 - ((x + xOffset) % 8);

        if (packedBytesBuffer[pixelIndex] === 0) {
          buf[byteIndex] &= ~(1 << bitIndex);
        }
      }
    }

    return buf;
  }

  cleanup(): void {
    lgpio.gpioWrite(this.chip, this.powerGPIO, false);
    lgpio.gpiochipClose(this.chip);
    lgpio.spiClose(this.spiHandle);
  }

  setWindow(xStart: number, yStart: number, xEnd: number, yEnd: number): void {
    this.sendCommand(0x44);
    this.sendData(xStart & 0xff);
    this.sendData((xStart >> 8) & 0x03);
    this.sendData(xEnd & 0xff);
    this.sendData((xEnd >> 8) & 0x03);

    this.sendCommand(0x45);
    this.sendData(yStart & 0xff);
    this.sendData((yStart >> 8) & 0xff);
    this.sendData(yEnd & 0xff);
    this.sendData((yEnd >> 8) & 0xff);
  }

  setCursor(x: number, y: number): void {
    this.sendCommand(0x4e);
    this.sendData(x & 0xff);
    this.sendData((x >> 8) & 0x03);

    this.sendCommand(0x4f);
    this.sendData(y & 0xff);
    this.sendData((y >> 8) & 0xff);
  }
}

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
      epdLogger.error("Error disposing e-paper service:", error);
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
