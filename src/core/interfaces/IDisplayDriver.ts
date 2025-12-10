import { IHardwareAdapter } from "./IHardwareAdapter";

/**
 * Display Driver Interface
 *
 * Defines the contract for e-paper display drivers. Each display model
 * (Waveshare, Good Display, etc.) implements this interface with its
 * specific command sequences and timing requirements.
 */

/**
 * Color depth supported by the display
 */
export type ColorDepth =
  | "1bit" // Black and white only
  | "4bit-grayscale" // 16 shades of gray
  | "3color-bwr" // Black, White, Red
  | "3color-bwy"; // Black, White, Yellow

/**
 * Display capabilities and specifications
 */
export interface DisplayCapabilities {
  /** Display width in pixels */
  width: number;

  /** Display height in pixels */
  height: number;

  /** Color depth supported by the display */
  colorDepth: ColorDepth;

  /** Whether the display supports partial refresh */
  supportsPartialRefresh: boolean;

  /** Typical full refresh time in milliseconds */
  refreshTimeFullMs: number;

  /** Typical partial refresh time in milliseconds */
  refreshTimePartialMs: number;
}

/**
 * Display driver interface
 *
 * Implementations should handle:
 * - Display-specific command sequences
 * - Initialization routines
 * - Buffer format conversion if needed
 * - Timing requirements
 */
export interface IDisplayDriver {
  /**
   * Unique identifier for this driver
   * Used for registration and configuration
   * Example: 'waveshare_7in5_bw', 'waveshare_4in2_bwr'
   */
  readonly name: string;

  /**
   * Display capabilities and specifications
   */
  readonly capabilities: DisplayCapabilities;

  /**
   * Initialize the display with the hardware adapter
   * Performs display-specific initialization sequence
   * @param adapter Hardware adapter for GPIO/SPI operations
   */
  init(adapter: IHardwareAdapter): Promise<void>;

  /**
   * Clean up display resources
   */
  dispose(): Promise<void>;

  /**
   * Display a buffer on the screen
   * @param buffer Image data in display's native format
   * @param fast Use fast/partial refresh if true, full refresh if false
   */
  display(buffer: Buffer, fast: boolean): Promise<void>;

  /**
   * Display a buffer with optional color channel (for 3-color displays)
   * @param buffer Black channel data
   * @param colorBuffer Red/Yellow channel data (for 3-color displays)
   * @param fast Use fast/partial refresh if true
   */
  displayWithColor?(
    buffer: Buffer,
    colorBuffer: Buffer,
    fast: boolean,
  ): Promise<void>;

  /**
   * Clear the display (set to white)
   * @param fast Use fast/partial refresh if true
   */
  clear(fast: boolean): Promise<void>;

  /**
   * Put the display into deep sleep mode
   */
  sleep(): Promise<void>;

  /**
   * Wake the display from sleep (usually requires reinit)
   */
  wake(): Promise<void>;

  /**
   * Check if the display is ready for new commands
   * @returns true if display is ready, false if busy
   */
  isReady(): boolean;

  /**
   * Wait until the display is ready
   * @param timeoutMs Maximum time to wait in milliseconds
   * @throws Error if timeout is reached
   */
  waitUntilReady(timeoutMs: number): Promise<void>;

  /**
   * Load an image from file and return display-ready buffer
   * Handles format conversion based on display's color depth
   * @param filePath Path to image file
   * @returns Buffer ready for display()
   */
  loadImage(filePath: string): Promise<Buffer>;
}
