import { Result, GPSCoordinate, DriveRoute } from "@core/types";

/**
 * Speed limit data for a road segment
 */
export interface SpeedLimitData {
  /** Speed limit in km/h */
  speedLimit: number;
  /** OSM way ID */
  wayId: number;
  /** Road name (if available) */
  roadName?: string;
  /** Distance from query point in meters */
  distance: number;
  /** Highway type (e.g., "motorway", "primary", "residential") */
  highwayType?: string;
}

/**
 * Cached speed limit segment for offline use
 */
export interface SpeedLimitSegment {
  /** Start coordinate of segment */
  start: { latitude: number; longitude: number };
  /** End coordinate of segment */
  end: { latitude: number; longitude: number };
  /** Speed limit in km/h */
  speedLimit: number;
  /** OSM way ID */
  wayId: number;
  /** Road name */
  roadName?: string;
  /** Highway type */
  highwayType?: string;
}

/**
 * Speed Limit Service Interface
 *
 * Fetches and caches speed limit data from OpenStreetMap via Overpass API.
 * Designed for offline use during driving - prefetches speed limits along routes.
 */
export interface ISpeedLimitService {
  /**
   * Initialize the service
   * @returns Result indicating success or failure
   */
  initialize(): Promise<Result<void>>;

  /**
   * Get the current speed limit for a GPS position
   * Uses cached data if available, otherwise returns null
   * @param position Current GPS position
   * @returns Speed limit in km/h or null if unknown
   */
  getSpeedLimit(
    position: GPSCoordinate,
  ): Promise<Result<SpeedLimitData | null>>;

  /**
   * Prefetch speed limits along a route for offline use
   * Should be called when route is calculated (while internet is available)
   * @param route The drive route to prefetch speed limits for
   * @returns Result with number of segments cached
   */
  prefetchRouteSpeedLimits(route: DriveRoute): Promise<Result<number>>;

  /**
   * Check if speed limits are cached for a route
   * @param routeId The route ID to check
   * @returns true if cached data exists
   */
  hasRouteCache(routeId: string): boolean;

  /**
   * Clear cached speed limit data for a route
   * @param routeId The route ID to clear cache for
   */
  clearRouteCache(routeId: string): Promise<Result<void>>;

  /**
   * Clear all cached speed limit data
   */
  clearAllCache(): Promise<Result<void>>;

  /**
   * Clean up resources
   */
  dispose(): Promise<void>;
}
