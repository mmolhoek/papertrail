import { Result, GPSCoordinate, SystemStatus } from '@core/types';

/**
 * Rendering Orchestrator Interface
 * 
 * Coordinates all services to update the display.
 * This is the main application service that ties everything together.
 */
export interface IRenderingOrchestrator {
  /**
   * Initialize the orchestrator and all dependent services
   * @returns Result indicating success or failure
   */
  initialize(): Promise<Result<void>>;
  
  /**
   * Update the display with current GPS position and active track
   * This is the main operation that:
   * 1. Gets current GPS position
   * 2. Loads active GPX track
   * 3. Renders viewport
   * 4. Displays on e-paper
   * @returns Result indicating success or failure
   */
  updateDisplay(): Promise<Result<void>>;
  
  /**
   * Set the active GPX file and update display
   * @param filePath Path to the GPX file
   * @returns Result indicating success or failure
   */
  setActiveGPX(filePath: string): Promise<Result<void>>;
  
  /**
   * Clear the active GPX file
   * @returns Result indicating success or failure
   */
  clearActiveGPX(): Promise<Result<void>>;
  
  /**
   * Change zoom level and update display
   * @param delta Change in zoom level (positive = zoom in, negative = zoom out)
   * @returns Result indicating success or failure
   */
  changeZoom(delta: number): Promise<Result<void>>;
  
  /**
   * Set absolute zoom level and update display
   * @param level Zoom level
   * @returns Result indicating success or failure
   */
  setZoom(level: number): Promise<Result<void>>;
  
  /**
   * Refresh GPS position and update display
   * @returns Result indicating success or failure
   */
  refreshGPS(): Promise<Result<void>>;
  
  /**
   * Start automatic display updates at configured interval
   * @returns Result indicating success or failure
   */
  startAutoUpdate(): Promise<Result<void>>;
  
  /**
   * Stop automatic display updates
   */
  stopAutoUpdate(): void;
  
  /**
   * Check if auto-update is running
   * @returns true if auto-update is active
   */
  isAutoUpdateRunning(): boolean;
  
  /**
   * Get current GPS position
   * @returns Result containing GPS coordinate or error
   */
  getCurrentPosition(): Promise<Result<GPSCoordinate>>;
  
  /**
   * Get system status including all services
   * @returns Result containing system status or error
   */
  getSystemStatus(): Promise<Result<SystemStatus>>;
  
  /**
   * Clear the display
   * @returns Result indicating success or failure
   */
  clearDisplay(): Promise<Result<void>>;
  
  /**
   * Put the display to sleep
   * @returns Result indicating success or failure
   */
  sleepDisplay(): Promise<Result<void>>;
  
  /**
   * Wake the display
   * @returns Result indicating success or failure
   */
  wakeDisplay(): Promise<Result<void>>;
  
  /**
   * Toggle auto-center on GPS position
   * @param enabled Whether to enable auto-center
   */
  setAutoCenter(enabled: boolean): void;
  
  /**
   * Toggle map rotation based on GPS bearing
   * @param enabled Whether to enable rotation
   */
  setRotateWithBearing(enabled: boolean): void;
  
  /**
   * Register a callback for display updates
   * @param callback Function to call after each display update
   * @returns Unsubscribe function
   */
  onDisplayUpdate(callback: (success: boolean) => void): () => void;
  
  /**
   * Register a callback for errors
   * @param callback Function to call when errors occur
   * @returns Unsubscribe function
   */
  onError(callback: (error: Error) => void): () => void;
  
  /**
   * Clean up resources and shut down all services
   */
  dispose(): Promise<void>;
}