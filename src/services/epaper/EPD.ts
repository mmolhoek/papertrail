import * as lgpio from "lgpio";
import sharp from "sharp";
import * as bmp from "bmp-js";
import { getLogger } from "../../utils/logger";
import fs from "fs";
import * as magickProcessor from "../../utils/magickImageProcessor";

// Check if we should use ImageMagick instead of Sharp
const USE_IMAGEMAGICK = process.env.USE_IMAGEMAGICK === "true";

const epdLogger = getLogger("EPD");

/**
 * Pin configuration for the waveshare 4.26 ePaper display (800x480) 1-bit black and white
 */
export interface EPDConfig {
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
export class EPD {
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
    epdLogger.time("epaper: reset");
    lgpio.gpioWrite(this.chip, this.rstGPIO, true);
    await this.delay(20);
    lgpio.gpioWrite(this.chip, this.rstGPIO, false);
    await this.delay(2);
    lgpio.gpioWrite(this.chip, this.rstGPIO, true);
    await this.delay(20);
    epdLogger.timeEnd("epaper: reset");
  }

  private sendCommand(command: number): void {
    lgpio.gpioWrite(this.chip, this.dcGPIO, false);
    const txBuffer = Buffer.from([command]);
    lgpio.spiWrite(this.spiHandle, new Uint8Array(txBuffer));
  }

  private sendData(data: number | Buffer): void {
    if (typeof data !== "number") epdLogger.time("sendData");
    lgpio.gpioWrite(this.chip, this.dcGPIO, true);

    if (typeof data === "number") {
      const txBuffer = new Uint8Array([data]);
      lgpio.spiWrite(this.spiHandle, txBuffer);
    } else {
      const txBuffer = new Uint8Array(data);
      lgpio.spiWrite(this.spiHandle, txBuffer);
    }
    if (typeof data !== "number") epdLogger.timeEnd("sendData");
  }

  private async epaperReady(): Promise<void> {
    let count = 0;
    epdLogger.time("epaperReady");
    while (lgpio.gpioRead(this.chip, this.busyGPIO) === true) {
      await this.delay(5);
      count++;
      if (count > 1000) {
        break;
      }
    }
    epdLogger.timeEnd("epaperReady");
  }
  async loadImageInBuffer(path: string): Promise<Buffer> {
    // Use ImageMagick if enabled
    if (USE_IMAGEMAGICK) {
      epdLogger.info("Loading image using ImageMagick (wasm-imagemagick)");
      return magickProcessor.loadImageToBuffer(path, this.WIDTH, this.HEIGHT);
    }

    // Load the BMP file using sharp
    const bmpBuffer = fs.readFileSync(path);
    let bitmap;
    try {
      bitmap = bmp.decode(bmpBuffer);
    } catch {
      console.log(
        "epaper: Image is not in BMP format, converting using sharp...",
      );
      try {
        await sharp(bmpBuffer)
          .raw()
          .toBuffer()
          .then((data) => {
            console.log("epaper: Image loaded, converting to BMP format...");
            bitmap = bmp.encode({
              data: data,
              width: this.WIDTH,
              height: this.HEIGHT,
            });
            bitmap = bmp.decode(bitmap.data);
            console.log("epaper: Image converted to BMP!");
          })
          .catch((err) => {
            console.error("epaper: Error:", err);
          });
      } catch (err) {
        console.error("epaper: Failed to convert image to BMP format:", err);
      }
    }
    if (!bitmap) {
      throw new Error("Failed to load image");
    }

    // Determine the scaling factor if the image is larger than the display
    const scaleFactor = Math.min(
      this.WIDTH / bitmap.width,
      this.HEIGHT / bitmap.height,
      1, // Ensure we don't upscale smaller images
    );

    const targetWidth = Math.floor(bitmap.width * scaleFactor);
    const targetHeight = Math.floor(bitmap.height * scaleFactor);

    // Resize and process the image using sharp
    const packedBytesBuffer = await sharp(bitmap.data, {
      raw: {
        width: bitmap.width,
        height: bitmap.height,
        channels: 4, // Assuming bmp-js output is RGBA
      },
    })
      .resize(targetWidth, targetHeight) // Resize the image if necessary
      .greyscale() // Convert to 8-bit grayscale
      .threshold(128) // Apply a threshold to make it purely black and white
      .toColourspace("b-w") // Explicitly set the 1-bit colorspace
      .raw() // Request raw output bytes
      .toBuffer(); // Get the final buffer

    const buf = Buffer.alloc((this.WIDTH / 8) * this.HEIGHT, 0xff); // Start with all white pixels

    // Calculate offsets for centering the image
    const xOffset = Math.max(0, Math.floor((this.WIDTH - targetWidth) / 2));
    const yOffset = Math.max(0, Math.floor((this.HEIGHT - targetHeight) / 2));

    // Process the raw pixel data and copy it into the display buffer
    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const pixelIndex = y * targetWidth + x; // Index in the raw pixel data
        const byteIndex = Math.floor(
          (x + xOffset + (y + yOffset) * this.WIDTH) / 8,
        ); // Byte index in the buffer
        const bitIndex = 7 - ((x + xOffset) % 8); // Bit index within the byte

        // Check if the pixel is black (value 0)
        if (packedBytesBuffer[pixelIndex] === 0) {
          buf[byteIndex] &= ~(1 << bitIndex); // Set the bit to 0 for black
        }
      }
    }

    return buf;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async init(): Promise<void> {
    epdLogger.time("init");
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
    epdLogger.timeEnd("init");
  }

  async clear(fast: boolean = true): Promise<void> {
    epdLogger.time("clear");
    epdLogger.time("clear: Buffer fill");
    this.buffer.fill(0xff);
    epdLogger.timeEnd("clear: Buffer fill");

    epdLogger.time("clear: Sending data");
    this.sendCommand(0x24);
    this.sendData(this.buffer);
    epdLogger.timeEnd("clear: Sending data");

    await this.turnOnDisplay(fast);
    epdLogger.timeEnd("clear");
  }

  async display(imageBuffer?: Buffer, fast: boolean = true): Promise<void> {
    epdLogger.time("display");
    const buf = imageBuffer || this.buffer;

    this.sendCommand(0x24);
    this.sendData(buf);
    await this.turnOnDisplay(fast);
    epdLogger.timeEnd("display");
  }

  private async turnOnDisplay(fast: boolean = true): Promise<void> {
    epdLogger.time("turnOnDisplay");
    this.sendCommand(0x22); // Display update control
    this.sendData(fast ? 0xff : 0xf7); // Fast or slow refresh
    this.sendCommand(0x20); // Activate display update sequence
    await this.epaperReady();
    epdLogger.timeEnd("turnOnDisplay");
  }

  async sleep(): Promise<void> {
    epdLogger.time("sleep");
    this.sendCommand(0x10); // Enter deep sleep mode
    this.sendData(0x01); // Deep sleep command
    await this.delay(100); // Wait for the command to take effect
    epdLogger.timeEnd("sleep");
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
    // Use ImageMagick if enabled
    if (USE_IMAGEMAGICK) {
      epdLogger.info("Loading image using ImageMagick (wasm-imagemagick)");
      return magickProcessor.loadImageToBuffer(
        imagePath,
        this.WIDTH,
        this.HEIGHT,
      );
    }

    const bmpBuffer = await sharp(imagePath)
      .resize(this.WIDTH, this.HEIGHT, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255 },
      })
      .raw()
      .toBuffer();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
