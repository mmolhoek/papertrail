import * as lgpio from "lgpio";
import { getLogger } from "../../utils/logger";
import * as magickProcessor from "../../utils/magickImageProcessor";

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
    epdLogger.info("Loading image using ImageMagick");
    return magickProcessor.loadImageToBuffer(path, this.WIDTH, this.HEIGHT);
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
    epdLogger.info("Loading image using ImageMagick");
    return magickProcessor.loadImageToBuffer(
      imagePath,
      this.WIDTH,
      this.HEIGHT,
    );
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
