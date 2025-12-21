/**
 * SPI/GPIO Hardware Adapter Interface
 *
 * Abstracts GPIO and SPI hardware operations for e-paper displays.
 * This allows different hardware implementations (real lgpio, mock for testing)
 * to be used interchangeably with display drivers.
 *
 * Note: This interface has a specialized init() signature for SPI/GPIO
 * configuration, which differs from the generic IDisplayAdapter.
 */

/**
 * GPIO pin configuration for e-paper display
 */
export interface PinConfig {
  /** Reset pin number */
  reset: number;
  /** Data/Command pin number */
  dc: number;
  /** Busy pin number */
  busy: number;
  /** Power control pin number (optional) */
  power?: number;
}

/**
 * SPI configuration for e-paper display
 */
export interface SPIConfig {
  /** SPI bus number (typically 0) */
  bus: number;
  /** SPI device number (typically 0) */
  device: number;
  /** SPI clock speed in Hz */
  speed: number;
}

/**
 * SPI adapter configuration
 */
export interface SPIAdapterConfig {
  type: "spi";
  pins: PinConfig;
  spi: SPIConfig;
}

/**
 * Hardware adapter interface for e-paper display GPIO and SPI operations
 *
 * Implementations:
 * - LgpioAdapter: Real hardware using lgpio library
 * - MockAdapter: Mock implementation for testing/development
 *
 * This interface provides SPI and GPIO operations for e-paper displays.
 * For other display types, see IDisplayAdapter.
 */
export interface IHardwareAdapter {
  /**
   * Initialize the hardware adapter with pin and SPI configuration
   * @param pins GPIO pin configuration
   * @param spi SPI configuration
   */
  init(pins: PinConfig, spi: SPIConfig): void;

  /**
   * Clean up hardware resources
   */
  dispose(): void;

  /**
   * Write a value to a GPIO pin
   * @param pin GPIO pin number
   * @param value true for HIGH, false for LOW
   */
  gpioWrite(pin: number, value: boolean): void;

  /**
   * Read a value from a GPIO pin
   * @param pin GPIO pin number
   * @returns true for HIGH, false for LOW
   */
  gpioRead(pin: number): boolean;

  /**
   * Write data to SPI
   * @param data Data to write
   */
  spiWrite(data: Uint8Array): void;

  /**
   * Send a command byte to the display
   * Sets DC pin LOW before writing
   * @param command Command byte to send
   */
  sendCommand(command: number): void;

  /**
   * Send data to the display
   * Sets DC pin HIGH before writing
   * @param data Single byte or buffer of data
   */
  sendData(data: number | Buffer): void;

  /**
   * Perform a hardware reset sequence
   * Toggles the reset pin: HIGH -> LOW -> HIGH with appropriate delays
   */
  reset(): Promise<void>;

  /**
   * Wait for a specified time
   * @param ms Milliseconds to wait
   */
  delay(ms: number): Promise<void>;

  /**
   * Get the configured pins
   */
  getPins(): PinConfig;
}

/**
 * SPI Adapter Interface
 * Alias for IHardwareAdapter - preferred name for new code
 */
export type ISPIAdapter = IHardwareAdapter;
