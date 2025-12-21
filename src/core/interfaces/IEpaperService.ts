import { Result } from "@core/types";
import { IDisplayService } from "./IDisplayService";

/**
 * E-Paper Service Interface
 *
 * Extends IDisplayService with e-paper specific functionality:
 * - Sleep/wake power management
 * - Full refresh for ghosting removal
 * - Hardware reset
 *
 * Use IDisplayService for generic display operations that work
 * across all display types.
 */
export interface IEpaperService extends IDisplayService {
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
   * Reset the display hardware
   * Performs a hardware reset using the reset pin
   * @returns Result indicating success or failure
   */
  reset(): Promise<Result<void>>;
}
