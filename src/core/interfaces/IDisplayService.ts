import {
  Result,
  Bitmap1Bit,
  DisplayStatus,
  DisplayUpdateMode,
} from "@core/types";
import { DisplayCapabilities } from "./IDisplayDriver";

/**
 * Display Service Interface
 *
 * Generic interface for controlling any display type (e-paper, LCD, HDMI).
 * Handles initialization, display updates, and status monitoring.
 *
 * For e-paper specific features (sleep, wake, full refresh), use IEpaperService
 * which extends this interface.
 */
export interface IDisplayService {
  /**
   * Initialize the display hardware
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
   * Display a bitmap on the screen
   * @param bitmap The bitmap to display
   * @param mode Update mode (full, partial, or auto)
   * @returns Result indicating success or failure
   */
  displayBitmap(
    bitmap: Bitmap1Bit,
    mode?: DisplayUpdateMode,
  ): Promise<Result<void>>;

  /**
   * Load and display a BMP image file on the screen
   * @param filePath Absolute path to the BMP file
   * @param mode Update mode (full, partial, or auto)
   * @returns Result indicating success or failure
   */
  displayBitmapFromFile(
    filePath: string,
    mode?: DisplayUpdateMode,
  ): Promise<Result<void>>;

  /**
   * Clear the display (set to white/blank)
   * @returns Result indicating success or failure
   */
  clear(): Promise<Result<void>>;

  /**
   * Get the current status of the display
   * @returns Result containing display status or error
   */
  getStatus(): Promise<Result<DisplayStatus>>;

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
   * Get display capabilities
   * @returns Display capabilities including color depth, refresh rates, etc.
   */
  getCapabilities(): DisplayCapabilities;

  /**
   * Clean up resources and close hardware connections
   */
  dispose(): Promise<void>;

  /**
   * Get the last displayed image as a PNG buffer (MockDisplayService only)
   * This is used for development to view what would be shown on the display
   * @returns PNG buffer or null if not available/not a mock service
   */
  getMockDisplayImage?(): Buffer | null;

  /**
   * Check if a mock display image is available (MockDisplayService only)
   */
  hasMockDisplayImage?(): boolean;
}

/**
 * Type guard to check if a display service supports e-paper specific features
 */
export function isEpaperService(
  service: IDisplayService,
): service is IDisplayService & {
  sleep(): Promise<Result<void>>;
  wake(): Promise<Result<void>>;
  fullRefresh(): Promise<Result<void>>;
  reset(): Promise<Result<void>>;
} {
  return (
    "sleep" in service &&
    "wake" in service &&
    "fullRefresh" in service &&
    "reset" in service
  );
}
