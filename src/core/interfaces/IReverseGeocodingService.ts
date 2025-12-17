import { Result, GPSCoordinate, DriveRoute } from "@core/types";

/**
 * Location data from reverse geocoding
 */
export interface LocationData {
  /** Human-readable display name (e.g., "Main Street, London") */
  displayName: string;
  /** Street/road name if available */
  street?: string;
  /** Village/town/city name */
  locality?: string;
  /** County/region */
  region?: string;
  /** Country name */
  country?: string;
  /** Postal code */
  postcode?: string;
  /** OSM place ID */
  placeId?: number;
  /** Distance from query point in meters */
  distance?: number;
}

/**
 * Cached location entry for offline use
 */
export interface CachedLocationEntry {
  /** Latitude of cached point */
  latitude: number;
  /** Longitude of cached point */
  longitude: number;
  /** Location data at this point */
  location: LocationData;
  /** Timestamp when cached */
  cachedAt: number;
}

/**
 * Progress callback for location prefetching
 */
export interface LocationPrefetchProgress {
  /** Current point being processed (1-based) */
  current: number;
  /** Total points to process */
  total: number;
  /** Number of locations cached so far */
  locationsCached: number;
  /** Whether prefetch is complete */
  complete: boolean;
}

/**
 * Reverse Geocoding Service Interface
 *
 * Converts GPS coordinates to human-readable location names using Nominatim API.
 * Designed for offline use during driving - prefetches locations along routes.
 */
export interface IReverseGeocodingService {
  /**
   * Initialize the service
   * @returns Result indicating success or failure
   */
  initialize(): Promise<Result<void>>;

  /**
   * Get the location name for a GPS position
   * Uses cached data if available, otherwise returns null (during driving)
   * @param position Current GPS position
   * @returns Location data or null if unknown
   */
  getLocationName(
    position: GPSCoordinate,
  ): Promise<Result<LocationData | null>>;

  /**
   * Prefetch location names along a route for offline use
   * Should be called when route is calculated (while internet is available)
   * @param route The drive route to prefetch locations for
   * @param onProgress Optional callback for progress updates
   * @returns Result with number of locations cached
   */
  prefetchRouteLocations(
    route: DriveRoute,
    onProgress?: (progress: LocationPrefetchProgress) => void,
  ): Promise<Result<number>>;

  /**
   * Check if locations are cached for a route
   * @param routeId The route ID to check
   * @returns true if cached data exists
   */
  hasRouteCache(routeId: string): boolean;

  /**
   * Clear cached location data for a route
   * @param routeId The route ID to clear cache for
   */
  clearRouteCache(routeId: string): Promise<Result<void>>;

  /**
   * Clear all cached location data
   */
  clearAllCache(): Promise<Result<void>>;

  /**
   * Clean up resources
   */
  dispose(): Promise<void>;
}
