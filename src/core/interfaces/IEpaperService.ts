import {
  Result,
  Bitmap1Bit,
  EpaperStatus,
  DisplayUpdateMode,
} from "@core/types";

/**
 * E-Paper Service Interface
 *
 * Responsible for controlling the e-paper display hardware.
 * Handles initialization, display updates, and power management.
 */
export interface IEpaperService {
  /**
   * Initialize the e-paper display hardware
   * Sets up GPIO pins, SPI connection, and display configuration
   * @returns Result indicating success or failure
   */
  initialize(): Promise<Result<void>>;

  /**
   * Send logo or splash screen to the display
   * @param mode Update mode (full, partial, or auto)
   * @returns Result indicating success or failure
   */
  displayLogo(mode?: DisplayUpdateMode): Promise<Result<void>>;

  /**
   * Display a bitmap on the e-paper screen
   * @param bitmap The 1-bit bitmap to display
   * @param mode Update mode (full, partial, or auto)
   * @returns Result indicating success or failure
   */
  displayBitmap(
    bitmap: Bitmap1Bit,
    mode?: DisplayUpdateMode,
  ): Promise<Result<void>>;

  /**
   * Load and display a BMP image file on the e-paper screen
   * @param filePath Absolute path to the BMP file
   * @param mode Update mode (full, partial, or auto)
   * @returns Result indicating success or failure
   */
  displayBitmapFromFile(
    filePath: string,
    mode?: DisplayUpdateMode,
  ): Promise<Result<void>>;

  /**
   * Clear the display (set to white)
   * @returns Result indicating success or failure
   */
  clear(): Promise<Result<void>>;

  /**
   * Perform a full refresh to clear ghosting
   * E-paper displays can accumulate ghosting over time with partial updates
   * @returns Result indicating success or failure
   */
  fullRefresh(): Promise<Result<void>>;

  /**
   * Put the display into sleep mode to save power
   * Display will not update until woken
   * @returns Result indicating success or failure
   */
  sleep(): Promise<Result<void>>;

  /**
   * Wake the display from sleep mode
   * @returns Result indicating success or failure
   */
  wake(): Promise<Result<void>>;

  /**
   * Get the current status of the display
   * @returns Result containing display status or error
   */
  getStatus(): Promise<Result<EpaperStatus>>;

  /**
   * Check if the display is currently busy
   * Display cannot accept new commands while busy
   * @returns true if display is busy
   */
  isBusy(): boolean;

  /**
   * Wait for the display to become ready
   * @param timeoutMs Maximum time to wait in milliseconds
   * @returns Result indicating if display became ready
   */
  waitUntilReady(timeoutMs?: number): Promise<Result<void>>;

  /**
   * Set the display rotation
   * @param rotation Rotation in degrees (0, 90, 180, 270)
   * @returns Result indicating success or failure
   */
  setRotation(rotation: 0 | 90 | 180 | 270): Result<void>;

  /**
   * Get display dimensions
   * @returns Width and height in pixels
   */
  getDimensions(): { width: number; height: number };

  /**
   * Reset the display hardware
   * Performs a hardware reset using the reset pin
   * @returns Result indicating success or failure
   */
  reset(): Promise<Result<void>>;

  /**
   * Clean up resources and close hardware connections
   */
  dispose(): Promise<void>;

  /**
   * Get the last displayed image as a PNG buffer (MockEpaperService only)
   * This is used for development to view what would be shown on the e-paper
   * @returns PNG buffer or null if not available/not a mock service
   */
  getMockDisplayImage?(): Buffer | null;

  /**
   * Check if a mock display image is available (MockEpaperService only)
   */
  hasMockDisplayImage?(): boolean;
}
