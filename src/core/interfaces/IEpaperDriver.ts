import { IDisplayDriver } from "./IDisplayDriver";

/**
 * E-Paper Display Driver Interface
 *
 * Extends IDisplayDriver with e-paper specific functionality:
 * - Fast/partial refresh modes
 * - Sleep/wake power management
 * - Multi-color channel support (for 3-color displays)
 *
 * Use IDisplayDriver for generic display drivers that don't
 * need e-paper specific features.
 */
export interface IEpaperDriver extends IDisplayDriver {
  /**
   * Display a buffer with refresh mode control
   * @param buffer Image data in display's native format
   * @param fast Use fast/partial refresh if true, full refresh if false
   */
  displayWithMode(buffer: Buffer, fast: boolean): Promise<void>;

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
   * Put the display into deep sleep mode
   */
  sleep(): Promise<void>;

  /**
   * Wake the display from sleep (usually requires reinit)
   */
  wake(): Promise<void>;
}

/**
 * Type guard to check if a driver is an e-paper driver
 */
export function isEpaperDriver(
  driver: IDisplayDriver,
): driver is IEpaperDriver {
  return "sleep" in driver && "wake" in driver && "displayWithMode" in driver;
}
