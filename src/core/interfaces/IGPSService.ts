import { Result, GPSCoordinate, GPSStatus } from '@core/types';

/**
 * GPS Service Interface
 * 
 * Responsible for reading GPS data from hardware and providing
 * current position and status information.
 */
export interface IGPSService {
  /**
   * Initialize the GPS hardware connection
   * @returns Result indicating success or failure
   */
  initialize(): Promise<Result<void>>;
  
  /**
   * Get the current GPS position
   * @returns Result containing current GPS coordinate or error
   */
  getCurrentPosition(): Promise<Result<GPSCoordinate>>;
  
  /**
   * Get detailed GPS status including satellite info
   * @returns Result containing GPS status or error
   */
  getStatus(): Promise<Result<GPSStatus>>;
  
  /**
   * Start continuous GPS tracking
   * Begins reading GPS data at the configured update interval
   * @returns Promise that resolves when tracking has started
   */
  startTracking(): Promise<Result<void>>;
  
  /**
   * Stop GPS tracking
   * @returns Promise that resolves when tracking has stopped
   */
  stopTracking(): Promise<Result<void>>;
  
  /**
   * Check if GPS is currently tracking
   * @returns true if tracking is active
   */
  isTracking(): boolean;
  
  /**
   * Wait for a GPS fix
   * @param timeoutMs Maximum time to wait in milliseconds
   * @returns Result containing coordinate when fix is acquired
   */
  waitForFix(timeoutMs?: number): Promise<Result<GPSCoordinate>>;
  
  /**
   * Register a callback for GPS position updates
   * @param callback Function to call when position updates
   * @returns Unsubscribe function
   */
  onPositionUpdate(callback: (position: GPSCoordinate) => void): () => void;
  
  /**
   * Register a callback for GPS status changes
   * @param callback Function to call when status changes
   * @returns Unsubscribe function
   */
  onStatusChange(callback: (status: GPSStatus) => void): () => void;
  
  /**
   * Clean up resources and close GPS connection
   */
  dispose(): Promise<void>;
}