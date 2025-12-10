import {
  IHardwareAdapter,
  PinConfig,
  SPIConfig,
} from "@core/interfaces/IHardwareAdapter";
import { getLogger } from "@utils/logger";

const logger = getLogger("MockAdapter");

/**
 * Mock hardware adapter for testing and development
 *
 * Simulates GPIO and SPI operations without requiring actual hardware.
 * Useful for:
 * - Running on non-Linux platforms (macOS, Windows)
 * - Unit testing display drivers
 * - Development without hardware connected
 */
export class MockAdapter implements IHardwareAdapter {
  private pins: PinConfig | null = null;
  private spiConfig: SPIConfig | null = null;
  private initialized: boolean = false;
  private pinStates: Map<number, boolean> = new Map();
  private busyState: boolean = false;
  private commandLog: Array<{ type: "cmd" | "data"; value: number | Buffer }> =
    [];

  /**
   * Initialize the mock adapter
   */
  init(pins: PinConfig, spi: SPIConfig): void {
    if (this.initialized) {
      logger.warn("MockAdapter already initialized");
      return;
    }

    logger.info("Initializing MockAdapter (mock hardware)...");
    logger.info(`  Pins: RST=${pins.reset}, DC=${pins.dc}, BUSY=${pins.busy}`);
    if (pins.power !== undefined) {
      logger.info(`  Power pin: ${pins.power}`);
    }
    logger.info(
      `  SPI: bus=${spi.bus}, device=${spi.device}, speed=${spi.speed}Hz`,
    );

    this.pins = pins;
    this.spiConfig = spi;

    // Initialize pin states
    this.pinStates.set(pins.reset, false);
    this.pinStates.set(pins.dc, false);
    this.pinStates.set(pins.busy, false); // Not busy by default
    if (pins.power !== undefined) {
      this.pinStates.set(pins.power, true);
    }

    this.initialized = true;
    logger.info("MockAdapter initialized successfully");
  }

  /**
   * Clean up (no-op for mock)
   */
  dispose(): void {
    if (!this.initialized) {
      return;
    }

    logger.info("Disposing MockAdapter...");
    this.initialized = false;
    this.pins = null;
    this.spiConfig = null;
    this.pinStates.clear();
    this.commandLog = [];
    logger.info("MockAdapter disposed successfully");
  }

  /**
   * Simulate writing to a GPIO pin
   */
  gpioWrite(pin: number, value: boolean): void {
    this.ensureInitialized();
    this.pinStates.set(pin, value);
    logger.debug(`GPIO write: pin=${pin}, value=${value}`);
  }

  /**
   * Simulate reading from a GPIO pin
   */
  gpioRead(pin: number): boolean {
    this.ensureInitialized();
    // If reading busy pin, return simulated busy state
    if (this.pins && pin === this.pins.busy) {
      return this.busyState;
    }
    return this.pinStates.get(pin) ?? false;
  }

  /**
   * Simulate SPI write (no-op but logs)
   */
  spiWrite(data: Uint8Array): void {
    this.ensureInitialized();
    logger.debug(`SPI write: ${data.length} bytes`);
  }

  /**
   * Send a command byte (logs for debugging)
   */
  sendCommand(command: number): void {
    this.ensureInitialized();
    if (!this.pins) return;

    this.pinStates.set(this.pins.dc, false);
    this.commandLog.push({ type: "cmd", value: command });
    logger.debug(`Command: 0x${command.toString(16).padStart(2, "0")}`);
  }

  /**
   * Send data (logs for debugging)
   */
  sendData(data: number | Buffer): void {
    this.ensureInitialized();
    if (!this.pins) return;

    this.pinStates.set(this.pins.dc, true);

    if (typeof data === "number") {
      this.commandLog.push({ type: "data", value: data });
      logger.debug(`Data: 0x${data.toString(16).padStart(2, "0")}`);
    } else {
      this.commandLog.push({ type: "data", value: data });
      logger.debug(`Data: ${data.length} bytes`);
    }
  }

  /**
   * Simulate hardware reset
   */
  async reset(): Promise<void> {
    this.ensureInitialized();
    if (!this.pins) return;

    logger.info("Mock hardware reset...");
    this.pinStates.set(this.pins.reset, true);
    await this.delay(20);
    this.pinStates.set(this.pins.reset, false);
    await this.delay(2);
    this.pinStates.set(this.pins.reset, true);
    await this.delay(20);
    logger.info("Mock hardware reset complete");
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
      throw new Error("MockAdapter not initialized");
    }
    return this.pins;
  }

  // --- Mock-specific methods for testing ---

  /**
   * Set the simulated busy state
   * Used in tests to simulate display being busy
   */
  setBusyState(busy: boolean): void {
    this.busyState = busy;
    logger.debug(`Mock busy state set to: ${busy}`);
  }

  /**
   * Get the command log for inspection in tests
   */
  getCommandLog(): Array<{ type: "cmd" | "data"; value: number | Buffer }> {
    return [...this.commandLog];
  }

  /**
   * Clear the command log
   */
  clearCommandLog(): void {
    this.commandLog = [];
  }

  /**
   * Get the current state of a pin
   */
  getPinState(pin: number): boolean {
    return this.pinStates.get(pin) ?? false;
  }

  /**
   * Check if adapter is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Ensure adapter is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("MockAdapter not initialized. Call init() first.");
    }
  }
}
