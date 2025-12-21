/**
 * Display Adapter Interface
 *
 * Base interface for all display hardware adapters.
 * Provides common operations shared across all adapter types
 * (SPI/GPIO for e-paper, framebuffer for LCD, etc.).
 *
 * Specific adapter interfaces extend this with hardware-specific operations:
 * - ISPIAdapter: GPIO and SPI operations for e-paper displays
 * - IFramebufferAdapter: Linux framebuffer operations for LCD/HDMI
 */

/**
 * Base configuration for display adapters
 */
export interface DisplayAdapterConfig {
  /** Adapter type identifier */
  type: "spi" | "framebuffer" | "mock";
}

/**
 * Base display adapter interface
 */
export interface IDisplayAdapter {
  /**
   * Initialize the adapter with configuration
   * @param config Adapter-specific configuration
   */
  init(config: DisplayAdapterConfig): Promise<void>;

  /**
   * Clean up adapter resources
   */
  dispose(): void;

  /**
   * Wait for a specified duration
   * @param ms Milliseconds to wait
   */
  delay(ms: number): Promise<void>;
}
