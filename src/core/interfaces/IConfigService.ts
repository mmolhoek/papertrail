import {
  Result,
  AppConfig,
  UserState,
  RenderOptions,
  FallbackNetworkConfig,
  HotspotConfig,
  ScreenType,
} from "@core/types";

/**
 * Config Service Interface
 *
 * Responsible for managing application configuration and user state.
 * Handles both static configuration and runtime state persistence.
 */
export interface IConfigService {
  /**
   * Initialize the config service
   * Loads configuration from file
   * @returns Result indicating success or failure
   */
  initialize(): Promise<Result<void>>;

  /**
   * Get the complete application configuration
   * @returns Application configuration
   */
  getConfig(): AppConfig;

  /**
   * Get the current user state
   * @returns User state
   */
  getUserState(): UserState;

  // Display configuration

  /**
   * Get display width in pixels
   */
  getDisplayWidth(): number;

  /**
   * Get display height in pixels
   */
  getDisplayHeight(): number;

  // Zoom level management

  /**
   * Get current zoom level
   */
  getZoomLevel(): number;

  /**
   * Set zoom level
   * @param level Zoom level (will be clamped to min/max)
   */
  setZoomLevel(level: number): void;

  /**
   * Get minimum allowed zoom level
   */
  getMinZoomLevel(): number;

  /**
   * Get maximum allowed zoom level
   */
  getMaxZoomLevel(): number;

  // Active GPX file management

  /**
   * Get the path to the currently active GPX file
   * @returns File path or null if none selected
   */
  getActiveGPXPath(): string | null;

  /**
   * Set the active GPX file
   * @param path Path to the GPX file
   */
  setActiveGPXPath(path: string | null): void;

  // GPS configuration

  /**
   * Get GPS update interval in milliseconds
   */
  getGPSUpdateInterval(): number;

  /**
   * Set GPS update interval
   * @param intervalMs Interval in milliseconds
   */
  setGPSUpdateInterval(intervalMs: number): void;

  // Rendering options

  /**
   * Get current rendering options
   */
  getRenderOptions(): RenderOptions;

  /**
   * Update rendering options
   * @param options Partial rendering options to update
   */
  updateRenderOptions(options: Partial<RenderOptions>): void;

  // Display preferences

  /**
   * Get auto-center preference
   * @returns true if map should auto-center on GPS position
   */
  getAutoCenter(): boolean;

  /**
   * Set auto-center preference
   * @param enabled Whether to auto-center
   */
  setAutoCenter(enabled: boolean): void;

  /**
   * Get rotate-with-bearing preference
   * @returns true if map should rotate based on GPS bearing
   */
  getRotateWithBearing(): boolean;

  /**
   * Set rotate-with-bearing preference
   * @param enabled Whether to rotate with bearing
   */
  setRotateWithBearing(enabled: boolean): void;

  /**
   * Get auto-refresh interval
   * @returns Interval in seconds (0 = disabled)
   */
  getAutoRefreshInterval(): number;

  /**
   * Set auto-refresh interval
   * @param seconds Interval in seconds (0 = disabled)
   */
  setAutoRefreshInterval(seconds: number): void;

  /**
   * Get show speed limit preference
   * @returns true if speed limit should be displayed during drive navigation
   */
  getShowSpeedLimit(): boolean;

  /**
   * Set show speed limit preference
   * @param enabled Whether to show speed limit
   */
  setShowSpeedLimit(enabled: boolean): void;

  /**
   * Get speed unit preference
   * @returns 'kmh' for kilometers per hour, 'mph' for miles per hour
   */
  getSpeedUnit(): "kmh" | "mph";

  /**
   * Set speed unit preference
   * @param unit Speed unit ('kmh' or 'mph')
   */
  setSpeedUnit(unit: "kmh" | "mph"): void;

  /**
   * Get show location name preference
   * @returns true if location name should be displayed during drive navigation
   */
  getShowLocationName(): boolean;

  /**
   * Set show location name preference
   * @param enabled Whether to show location name
   */
  setShowLocationName(enabled: boolean): void;

  /**
   * Get show elevation preference
   * @returns true if elevation data should be displayed during drive navigation
   */
  getShowElevation(): boolean;

  /**
   * Set show elevation preference
   * @param enabled Whether to show elevation data
   */
  setShowElevation(enabled: boolean): void;

  /**
   * Get enabled POI categories
   * @returns Array of enabled POI category names
   */
  getEnabledPOICategories(): Array<
    "fuel" | "parking" | "food" | "restroom" | "viewpoint"
  >;

  /**
   * Set enabled POI categories
   * @param categories Array of POI category names to enable
   */
  setEnabledPOICategories(
    categories: Array<"fuel" | "parking" | "food" | "restroom" | "viewpoint">,
  ): void;

  /**
   * Check if a specific POI category is enabled
   * @param category POI category name
   * @returns true if the category is enabled
   */
  isPOICategoryEnabled(
    category: "fuel" | "parking" | "food" | "restroom" | "viewpoint",
  ): boolean;

  /**
   * Toggle a specific POI category
   * @param category POI category name
   * @param enabled Whether to enable or disable
   */
  setPOICategoryEnabled(
    category: "fuel" | "parking" | "food" | "restroom" | "viewpoint",
    enabled: boolean,
  ): void;

  /**
   * Get routing profile for OSRM route calculation
   * @returns 'car' for driving, 'bike' for bicycle, 'foot' for walking
   */
  getRoutingProfile(): "car" | "bike" | "foot";

  /**
   * Set routing profile for OSRM route calculation
   * @param profile Routing profile ('car', 'bike', or 'foot')
   */
  setRoutingProfile(profile: "car" | "bike" | "foot"): void;

  // Active screen management

  /**
   * Get the active screen type for display rendering
   * @returns ScreenType (defaults to TRACK if not set)
   */
  getActiveScreen(): ScreenType;

  /**
   * Set the active screen type for display rendering
   * @param screenType The screen type to use
   */
  setActiveScreen(screenType: ScreenType): void;

  // Recent files

  /**
   * Get list of recently used GPX files
   * @returns Array of file paths
   */
  getRecentFiles(): string[];

  /**
   * Add a file to recent files list
   * @param filePath Path to the file
   */
  addRecentFile(filePath: string): void;

  /**
   * Clear recent files list
   */
  clearRecentFiles(): void;

  // Recent destinations management

  /**
   * Get list of recent drive destinations
   * @returns Array of destination objects
   */
  getRecentDestinations(): Array<{
    name: string;
    latitude: number;
    longitude: number;
    usedAt: string;
  }>;

  /**
   * Add a destination to recent destinations list
   * @param destination Destination to add
   */
  addRecentDestination(destination: {
    name: string;
    latitude: number;
    longitude: number;
  }): void;

  /**
   * Remove a destination from recent destinations list
   * @param latitude Latitude of destination
   * @param longitude Longitude of destination
   */
  removeRecentDestination(latitude: number, longitude: number): void;

  /**
   * Clear recent destinations list
   */
  clearRecentDestinations(): void;

  // Onboarding management

  /**
   * Check if onboarding has been completed
   * @returns true if onboarding is complete
   */
  isOnboardingCompleted(): boolean;

  /**
   * Set onboarding completion status
   * @param completed Whether onboarding is complete
   */
  setOnboardingCompleted(completed: boolean): void;

  // WiFi fallback network management

  /**
   * Get the stored WiFi fallback network configuration
   * @returns FallbackNetworkConfig or undefined if not set
   */
  getWiFiFallbackNetwork(): FallbackNetworkConfig | undefined;

  /**
   * Set the WiFi fallback network configuration
   * @param config FallbackNetworkConfig to store, or null to clear
   */
  setWiFiFallbackNetwork(config: FallbackNetworkConfig | null): void;

  // Hotspot configuration management

  /**
   * Get the stored hotspot configuration
   * @returns HotspotConfig or undefined if not set
   */
  getHotspotConfig(): HotspotConfig | undefined;

  /**
   * Set the hotspot configuration
   * @param config HotspotConfig to store, or null to clear
   */
  setHotspotConfig(config: HotspotConfig | null): void;

  // Persistence

  /**
   * Save current user state to disk
   * @returns Result indicating success or failure
   */
  save(): Promise<Result<void>>;

  /**
   * Reload configuration from disk
   * @returns Result indicating success or failure
   */
  reload(): Promise<Result<void>>;

  /**
   * Reset user state to defaults
   * @returns Result indicating success or failure
   */
  resetToDefaults(): Promise<Result<void>>;

  /**
   * Export configuration as JSON string
   * @returns JSON string
   */
  exportConfig(): string;

  /**
   * Import configuration from JSON string
   * @param json JSON string
   * @returns Result indicating success or failure
   */
  importConfig(json: string): Result<void>;
}
