import * as lgpio from "lgpio";
import {
  IHardwareAdapter,
  PinConfig,
  SPIConfig,
} from "@core/interfaces/IHardwareAdapter";
import { getLogger } from "@utils/logger";

const logger = getLogger("LgpioAdapter");

/**
 * Hardware adapter implementation using the lgpio library
 *
 * Provides GPIO and SPI access for e-paper displays on Raspberry Pi.
 * This adapter handles the low-level hardware communication.
 */
export class LgpioAdapter implements IHardwareAdapter {
  private chip: number = -1;
  private spiHandle: number = -1;
  private pins: PinConfig | null = null;
  private initialized: boolean = false;

  /**
   * Initialize the hardware adapter
   * Opens GPIO chip and SPI device, claims required pins
   */
  init(pins: PinConfig, spi: SPIConfig): void {
    if (this.initialized) {
      logger.warn("LgpioAdapter already initialized");
      return;
    }

    logger.info("Initializing LgpioAdapter...");
    logger.info(`  Pins: RST=${pins.reset}, DC=${pins.dc}, BUSY=${pins.busy}`);
    if (pins.power !== undefined) {
      logger.info(`  Power pin: ${pins.power}`);
    }
    logger.info(
      `  SPI: bus=${spi.bus}, device=${spi.device}, speed=${spi.speed}Hz`,
    );

    try {
      // Open GPIO chip
      this.chip = lgpio.gpiochipOpen(0);
      logger.info(`  GPIO chip opened: handle=${this.chip}`);

      // Open SPI device
      this.spiHandle = lgpio.spiOpen(spi.bus, spi.device, spi.speed);
      logger.info(`  SPI device opened: handle=${this.spiHandle}`);

      // Claim GPIO pins
      lgpio.gpioClaimOutput(this.chip, pins.reset, undefined, false);
      lgpio.gpioClaimOutput(this.chip, pins.dc, undefined, false);
      lgpio.gpioClaimInput(this.chip, pins.busy);

      if (pins.power !== undefined) {
        lgpio.gpioClaimOutput(this.chip, pins.power, undefined, true);
      }

      this.pins = pins;
      this.initialized = true;
      logger.info("LgpioAdapter initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize LgpioAdapter:", error);
      throw error;
    }
  }

  /**
   * Clean up hardware resources
   */
  dispose(): void {
    if (!this.initialized) {
      return;
    }

    logger.info("Disposing LgpioAdapter...");

    try {
      // Turn off power if we have a power pin
      if (this.pins?.power !== undefined) {
        lgpio.gpioWrite(this.chip, this.pins.power, false);
      }

      // Close GPIO chip and SPI
      lgpio.gpiochipClose(this.chip);
      lgpio.spiClose(this.spiHandle);

      this.initialized = false;
      this.chip = -1;
      this.spiHandle = -1;
      this.pins = null;

      logger.info("LgpioAdapter disposed successfully");
    } catch (error) {
      logger.error("Error disposing LgpioAdapter:", error);
    }
  }

  /**
   * Write a value to a GPIO pin
   */
  gpioWrite(pin: number, value: boolean): void {
    this.ensureInitialized();
    lgpio.gpioWrite(this.chip, pin, value);
  }

  /**
   * Read a value from a GPIO pin
   */
  gpioRead(pin: number): boolean {
    this.ensureInitialized();
    return lgpio.gpioRead(this.chip, pin) === true;
  }

  /**
   * Write data to SPI
   */
  spiWrite(data: Uint8Array): void {
    this.ensureInitialized();
    lgpio.spiWrite(this.spiHandle, data);
  }

  /**
   * Send a command byte to the display
   * Sets DC pin LOW before writing
   */
  sendCommand(command: number): void {
    this.ensureInitialized();
    if (!this.pins) return;

    lgpio.gpioWrite(this.chip, this.pins.dc, false);
    const txBuffer = new Uint8Array([command]);
    lgpio.spiWrite(this.spiHandle, txBuffer);
  }

  /**
   * Send data to the display
   * Sets DC pin HIGH before writing
   */
  sendData(data: number | Buffer): void {
    this.ensureInitialized();
    if (!this.pins) return;

    lgpio.gpioWrite(this.chip, this.pins.dc, true);

    if (typeof data === "number") {
      const txBuffer = new Uint8Array([data]);
      lgpio.spiWrite(this.spiHandle, txBuffer);
    } else {
      const txBuffer = new Uint8Array(data);
      lgpio.spiWrite(this.spiHandle, txBuffer);
    }
  }

  /**
   * Perform a hardware reset sequence
   */
  async reset(): Promise<void> {
    this.ensureInitialized();
    if (!this.pins) return;

    logger.info("Hardware reset...");
    lgpio.gpioWrite(this.chip, this.pins.reset, true);
    await this.delay(20);
    lgpio.gpioWrite(this.chip, this.pins.reset, false);
    await this.delay(2);
    lgpio.gpioWrite(this.chip, this.pins.reset, true);
    await this.delay(20);
    logger.info("Hardware reset complete");
  }

  /**
   * Wait for a specified time
   */
  delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the configured pins
   */
  getPins(): PinConfig {
    if (!this.pins) {
      throw new Error("LgpioAdapter not initialized");
    }
    return this.pins;
  }

  /**
   * Check if the busy pin indicates display is busy
   */
  isBusy(): boolean {
    this.ensureInitialized();
    if (!this.pins) return false;
    return this.gpioRead(this.pins.busy);
  }

  /**
   * Ensure adapter is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("LgpioAdapter not initialized. Call init() first.");
    }
  }
}
