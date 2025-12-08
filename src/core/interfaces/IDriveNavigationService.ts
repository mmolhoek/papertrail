import {
  Result,
  GPSCoordinate,
  DriveRoute,
  DriveNavigationStatus,
  DriveNavigationUpdate,
  NavigationState,
} from "@core/types";

/**
 * Drive Navigation Service Interface
 *
 * Manages turn-by-turn navigation from current GPS position to a destination.
 * Routes are calculated online and stored for offline use during driving.
 */
export interface IDriveNavigationService {
  /**
   * Initialize the navigation service
   * @returns Result indicating success or failure
   */
  initialize(): Promise<Result<void>>;

  /**
   * Save a calculated route for later use
   * @param route The route to save
   * @returns Result with the saved route ID
   */
  saveRoute(route: DriveRoute): Promise<Result<string>>;

  /**
   * Load a previously saved route
   * @param id Route ID to load
   * @returns Result with the loaded route
   */
  loadRoute(id: string): Promise<Result<DriveRoute>>;

  /**
   * Delete a saved route
   * @param id Route ID to delete
   * @returns Result indicating success or failure
   */
  deleteRoute(id: string): Promise<Result<void>>;

  /**
   * List all saved routes
   * @returns Result with array of route IDs and metadata
   */
  listRoutes(): Promise<
    Result<Array<{ id: string; destination: string; createdAt: Date }>>
  >;

  /**
   * Start navigation along a route
   * @param route The route to navigate (or route ID string)
   * @returns Result indicating success or failure
   */
  startNavigation(route: DriveRoute | string): Promise<Result<void>>;

  /**
   * Stop current navigation
   * @returns Result indicating success or failure
   */
  stopNavigation(): Promise<Result<void>>;

  /**
   * Get the currently active route (if any)
   * @returns The active route or null
   */
  getActiveRoute(): DriveRoute | null;

  /**
   * Get current navigation state
   * @returns Current navigation state
   */
  getNavigationState(): NavigationState;

  /**
   * Get current navigation status with all details
   * @returns Current navigation status
   */
  getNavigationStatus(): DriveNavigationStatus;

  /**
   * Check if navigation is currently active
   * @returns true if navigating
   */
  isNavigating(): boolean;

  /**
   * Set simulation mode - when true, off-road detection is skipped
   * since simulation always follows the route exactly
   * @param enabled Whether simulation mode is enabled
   */
  setSimulationMode(enabled: boolean): void;

  /**
   * Set whether to use map view during simulation
   * When true, MAP_WITH_OVERLAY will be used (may cause freezing due to Sharp text rendering)
   * When false, TURN_SCREEN will be used (safer, no freezing)
   * @param enabled Whether to use map view in simulation
   */
  setUseMapViewInSimulation(enabled: boolean): void;

  /**
   * Update the current GPS position
   * This should be called by the orchestrator when GPS updates
   * @param position Current GPS position
   */
  updatePosition(position: GPSCoordinate): void;

  /**
   * Register a callback for navigation updates
   * Called when turn approaching, waypoint reached, off-road, arrived, etc.
   * @param callback Function to call on navigation updates
   * @returns Unsubscribe function
   */
  onNavigationUpdate(
    callback: (update: DriveNavigationUpdate) => void,
  ): () => void;

  /**
   * Register a callback for when display should be updated
   * @param callback Function to call when display needs refresh
   * @returns Unsubscribe function
   */
  onDisplayUpdate(callback: () => void): () => void;

  /**
   * Clean up resources
   */
  dispose(): Promise<void>;
}
