import { DisplayCapabilities } from "@core/interfaces/IDisplayDriver";
import { DisplayType } from "@core/types";
import { BaseEpaperDriver } from "./BaseEpaperDriver";

/**
 * Waveshare 7.5" Black/White E-Paper Display Driver
 *
 * Supports:
 * - Waveshare 7.5" V2 (800x480, 1-bit)
 * - Similar Waveshare displays using the same controller
 *
 * Command reference:
 * - 0x12: Software reset (SWRESET)
 * - 0x18: Temperature sensor selection
 * - 0x0C: Soft start settings
 * - 0x01: Driver output control
 * - 0x3C: Border waveform control
 * - 0x11: Data entry mode setting
 * - 0x44: Set RAM X address
 * - 0x45: Set RAM Y address
 * - 0x4E: Set RAM X counter
 * - 0x4F: Set RAM Y counter
 * - 0x24: Write RAM (black/white)
 * - 0x22: Display update control
 * - 0x20: Activate display update sequence
 * - 0x10: Deep sleep mode
 */
export class Waveshare7in5BWDriver extends BaseEpaperDriver {
  readonly name = "waveshare_7in5_bw";

  readonly capabilities: DisplayCapabilities & {
    supportsPartialRefresh: boolean;
    refreshTimeFullMs: number;
    refreshTimePartialMs: number;
  } = {
    width: 800,
    height: 480,
    colorDepth: "1bit",
    displayType: DisplayType.EPAPER,
    supportsPartialRefresh: true,
    refreshTimeFullMs: 3000,
    refreshTimePartialMs: 500,
    supportsSleep: true,
  };

  // Command codes
  private static readonly CMD_SWRESET = 0x12;
  private static readonly CMD_TEMP_SENSOR = 0x18;
  private static readonly CMD_SOFT_START = 0x0c;
  private static readonly CMD_DRIVER_OUTPUT = 0x01;
  private static readonly CMD_BORDER_WAVEFORM = 0x3c;
  private static readonly CMD_DATA_ENTRY_MODE = 0x11;
  private static readonly CMD_SET_RAM_X = 0x44;
  private static readonly CMD_SET_RAM_Y = 0x45;
  private static readonly CMD_SET_RAM_X_COUNTER = 0x4e;
  private static readonly CMD_SET_RAM_Y_COUNTER = 0x4f;
  private static readonly CMD_WRITE_RAM = 0x24;
  private static readonly CMD_DISPLAY_UPDATE_CTRL = 0x22;
  private static readonly CMD_ACTIVATE_UPDATE = 0x20;
  private static readonly CMD_DEEP_SLEEP = 0x10;

  /**
   * Initialize the display with Waveshare-specific command sequence
   */
  protected async initDisplay(): Promise<void> {
    this.logger.time("initDisplay");

    // Software reset
    this.sendCommand(Waveshare7in5BWDriver.CMD_SWRESET);
    await this.waitForReady();

    // Use internal temperature sensor
    this.sendCommand(Waveshare7in5BWDriver.CMD_TEMP_SENSOR);
    this.sendData(0x80);

    // Soft start settings
    this.sendCommand(Waveshare7in5BWDriver.CMD_SOFT_START);
    this.sendData(0xae);
    this.sendData(0xc7);
    this.sendData(0xc3);
    this.sendData(0xc0);
    this.sendData(0x80);

    // Driver output control
    this.sendCommand(Waveshare7in5BWDriver.CMD_DRIVER_OUTPUT);
    this.sendData((this.capabilities.height - 1) & 0xff); // Y low byte
    this.sendData((this.capabilities.height - 1) >> 8); // Y high byte
    this.sendData(0x02);

    // Border waveform control
    this.sendCommand(Waveshare7in5BWDriver.CMD_BORDER_WAVEFORM);
    this.sendData(0x01);

    // Data entry mode: X increment, Y decrement
    this.sendCommand(Waveshare7in5BWDriver.CMD_DATA_ENTRY_MODE);
    this.sendData(0x01);

    // Set RAM window
    this.setWindow(
      0,
      this.capabilities.height - 1,
      this.capabilities.width - 1,
      0,
    );

    // Set initial cursor position
    this.setCursor(0, 0);
    await this.waitForReady();

    this.logger.timeEnd("initDisplay");
  }

  /**
   * Display buffer on screen
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

    // Write to RAM
    this.sendCommand(Waveshare7in5BWDriver.CMD_WRITE_RAM);
    this.sendData(buffer);

    // Trigger display update
    await this.turnOnDisplay(fast);

    this.logger.timeEnd("display");
  }

  /**
   * Clear the display to white
   */
  async clear(fast: boolean): Promise<void> {
    this.logger.time("clear");

    // Fill buffer with 0xFF (white)
    const buffer = this.getBuffer();
    buffer.fill(0xff);

    // Write to RAM and update
    this.sendCommand(Waveshare7in5BWDriver.CMD_WRITE_RAM);
    this.sendData(buffer);
    await this.turnOnDisplay(fast);

    this.logger.timeEnd("clear");
  }

  /**
   * Put display into deep sleep mode
   */
  async sleep(): Promise<void> {
    this.logger.time("sleep");

    this.sendCommand(Waveshare7in5BWDriver.CMD_DEEP_SLEEP);
    this.sendData(0x01);
    await this.delay(100);

    this.setSleeping(true);
    this.logger.timeEnd("sleep");
    this.logger.info("Display is now sleeping");
  }

  /**
   * Trigger display update sequence
   */
  private async turnOnDisplay(fast: boolean): Promise<void> {
    this.logger.time("turnOnDisplay");

    // Display update control
    this.sendCommand(Waveshare7in5BWDriver.CMD_DISPLAY_UPDATE_CTRL);
    this.sendData(fast ? 0xff : 0xf7); // Fast or slow refresh

    // Activate display update sequence
    this.sendCommand(Waveshare7in5BWDriver.CMD_ACTIVATE_UPDATE);

    // Wait for display to finish
    await this.waitForReady();

    this.logger.timeEnd("turnOnDisplay");
  }

  /**
   * Set display RAM window
   */
  private setWindow(
    xStart: number,
    yStart: number,
    xEnd: number,
    yEnd: number,
  ): void {
    // Set X address range
    this.sendCommand(Waveshare7in5BWDriver.CMD_SET_RAM_X);
    this.sendData(xStart & 0xff);
    this.sendData((xStart >> 8) & 0x03);
    this.sendData(xEnd & 0xff);
    this.sendData((xEnd >> 8) & 0x03);

    // Set Y address range
    this.sendCommand(Waveshare7in5BWDriver.CMD_SET_RAM_Y);
    this.sendData(yStart & 0xff);
    this.sendData((yStart >> 8) & 0xff);
    this.sendData(yEnd & 0xff);
    this.sendData((yEnd >> 8) & 0xff);
  }

  /**
   * Set display RAM cursor position
   */
  private setCursor(x: number, y: number): void {
    this.sendCommand(Waveshare7in5BWDriver.CMD_SET_RAM_X_COUNTER);
    this.sendData(x & 0xff);
    this.sendData((x >> 8) & 0x03);

    this.sendCommand(Waveshare7in5BWDriver.CMD_SET_RAM_Y_COUNTER);
    this.sendData(y & 0xff);
    this.sendData((y >> 8) & 0xff);
  }
}
