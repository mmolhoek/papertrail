import {
  Result,
  GPSCoordinate,
  GPSStatus,
  SystemStatus,
  DriveRoute,
  DriveNavigationUpdate,
  DisplayUpdateMode,
} from "@core/types";
import { SpeedLimitPrefetchProgress } from "./ISpeedLimitService";
import { POIPrefetchProgress } from "./IPOIService";
import { LocationPrefetchProgress } from "./IReverseGeocodingService";
import { ElevationPrefetchProgress } from "./IElevationService";
import { RoadSurfacePrefetchProgress } from "./IRoadSurfaceService";

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
   * @param mode Optional display update mode (FULL, PARTIAL, or AUTO)
   * @returns Result indicating success or failure
   */
  updateDisplay(mode?: DisplayUpdateMode): Promise<Result<void>>;

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
   * Display the startup logo on the e-paper screen
   * @returns Result indicating success or failure
   */
  displayLogo(): Promise<Result<void>>;

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
   * Set the active screen type for display rendering
   * @param screenType The screen type to use ('track' or 'turn_by_turn')
   */
  setActiveScreen(screenType: string): void;

  /**
   * Register a callback for GPS position updates
   * @param callback Function to call when GPS position changes
   * @returns Unsubscribe function
   */
  onGPSUpdate(callback: (position: GPSCoordinate) => void): () => void;

  /**
   * Register a callback for GPS status changes
   * @param callback Function to call when GPS status changes (fix quality, satellites, etc.)
   * @returns Unsubscribe function
   */
  onGPSStatusChange(callback: (status: GPSStatus) => void): () => void;

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
   * Check if onboarding is needed and show appropriate screen
   * Call this after all services are initialized (including WiFi)
   * @returns Result indicating success or failure
   */
  checkAndShowOnboardingScreen(): Promise<Result<void>>;

  /**
   * Restart the onboarding flow (used after factory reset)
   * Displays the logo, then shows WiFi instructions screen
   * @returns Result indicating success or failure
   */
  restartOnboarding(): Promise<Result<void>>;

  /**
   * Set the number of connected WebSocket clients
   * When clients connect, shows the "select track" screen with GPS info
   * When all clients disconnect, returns to the connected screen
   * @param count Number of connected WebSocket clients
   */
  setWebSocketClientCount(count: number): void;

  // ============================================
  // Drive Navigation Methods
  // ============================================

  /**
   * Start drive navigation with a route
   * @param route The drive route to navigate
   * @returns Result indicating success or failure
   */
  startDriveNavigation(route: DriveRoute): Promise<Result<void>>;

  /**
   * Stop current drive navigation
   * @returns Result indicating success or failure
   */
  stopDriveNavigation(): Promise<Result<void>>;

  /**
   * Check if drive navigation is currently active
   * @returns true if drive navigation is running
   */
  isDriveNavigating(): boolean;

  /**
   * Get the current cached road surface type
   * @returns The road surface type or null if not available
   */
  getCurrentRoadSurface(): string | null;

  /**
   * Get the current cached speed limit
   * @returns The speed limit in km/h or null if not available
   */
  getCurrentSpeedLimit(): number | null;

  /**
   * Get the current cached location name
   * @returns The location name or null if not available
   */
  getCurrentLocationName(): string | null;

  /**
   * Show the full route on the e-paper display
   * Sets zoom level to fit the entire route and renders it
   * @param route Optional route to display (uses active route if not provided)
   * @returns Result indicating success or failure
   */
  showFullRoute(route?: DriveRoute): Promise<Result<void>>;

  /**
   * Register a callback for drive navigation updates
   * @param callback Function to call on navigation updates
   * @returns Unsubscribe function
   */
  onDriveNavigationUpdate(
    callback: (update: DriveNavigationUpdate) => void,
  ): () => void;

  /**
   * Register a callback for speed limit prefetch progress
   * @param callback Function to call on prefetch progress updates
   * @returns Unsubscribe function
   */
  onSpeedLimitPrefetchProgress(
    callback: (progress: SpeedLimitPrefetchProgress) => void,
  ): () => void;

  /**
   * Register a callback for POI prefetch progress
   * @param callback Function to call on prefetch progress updates
   * @returns Unsubscribe function
   */
  onPOIPrefetchProgress(
    callback: (progress: POIPrefetchProgress) => void,
  ): () => void;

  /**
   * Register a callback for location prefetch progress
   * @param callback Function to call on prefetch progress updates
   * @returns Unsubscribe function
   */
  onLocationPrefetchProgress(
    callback: (progress: LocationPrefetchProgress) => void,
  ): () => void;

  /**
   * Register a callback for elevation prefetch progress
   * @param callback Function to call on prefetch progress updates
   * @returns Unsubscribe function
   */
  onElevationPrefetchProgress(
    callback: (progress: ElevationPrefetchProgress) => void,
  ): () => void;

  /**
   * Register a callback for road surface prefetch progress
   * @param callback Function to call on prefetch progress updates
   * @returns Unsubscribe function
   */
  onRoadSurfacePrefetchProgress(
    callback: (progress: RoadSurfacePrefetchProgress) => void,
  ): () => void;

  /**
   * Refresh POIs for the active route with current enabled categories.
   * Call this when POI categories are changed during navigation.
   * @returns Result indicating success or failure
   */
  refreshRoutePOIs(): Promise<Result<void>>;

  /**
   * Clear all cached POI data.
   * Call this when POI categories change while not navigating,
   * so POIs are re-fetched on next route view.
   * @returns Result indicating success or failure
   */
  clearAllPOICache(): Promise<Result<void>>;

  /**
   * Clean up resources and shut down all services
   */
  dispose(): Promise<void>;

  /**
   * Get the mock display image (only available when using MockEpaperService)
   * Returns a PNG buffer of what would be shown on the e-paper display
   * @returns PNG buffer or null if not available
   */
  getMockDisplayImage(): Buffer | null;

  /**
   * Check if mock display image is available
   * @returns true if using MockEpaperService and an image is available
   */
  hasMockDisplayImage(): boolean;

  /**
   * Check if GPS service is a mock (for development)
   * @returns true if using MockGPSService
   */
  isMockGPS(): boolean;

  /**
   * Set mock GPS position (only works with MockGPSService)
   * Useful for setting position to track start before drive simulation
   * @param latitude Latitude in degrees
   * @param longitude Longitude in degrees
   * @returns true if position was set, false if not using mock GPS
   */
  setMockGPSPosition(latitude: number, longitude: number): boolean;
}
