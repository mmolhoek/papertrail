import { Result, GPSCoordinate, DriveRoute } from "@core/types";

/**
 * Elevation data for a GPS position
 */
export interface ElevationData {
  /** Elevation in meters above sea level */
  elevation: number;
  /** Latitude of the point */
  latitude: number;
  /** Longitude of the point */
  longitude: number;
}

/**
 * Route elevation metrics
 */
export interface RouteElevationMetrics {
  /** Total climb in meters */
  totalClimb: number;
  /** Total descent in meters */
  totalDescent: number;
  /** Minimum elevation on route in meters */
  minElevation: number;
  /** Maximum elevation on route in meters */
  maxElevation: number;
  /** Starting elevation in meters */
  startElevation: number;
  /** End elevation in meters */
  endElevation: number;
}

/**
 * Cached elevation entry for offline use
 */
export interface CachedElevationEntry {
  /** Latitude of cached point */
  latitude: number;
  /** Longitude of cached point */
  longitude: number;
  /** Elevation in meters */
  elevation: number;
  /** Distance from route start in meters */
  distanceFromStart: number;
}

/**
 * Progress callback for elevation prefetching
 */
export interface ElevationPrefetchProgress {
  /** Current batch being processed (1-based) */
  current: number;
  /** Total batches to process */
  total: number;
  /** Number of elevation points cached so far */
  pointsCached: number;
  /** Whether prefetch is complete */
  complete: boolean;
}

/**
 * Elevation Service Interface
 *
 * Fetches and caches elevation data from Open-Elevation API.
 * Designed for offline use during driving - prefetches elevations along routes.
 */
export interface IElevationService {
  /**
   * Initialize the service
   * @returns Result indicating success or failure
   */
  initialize(): Promise<Result<void>>;

  /**
   * Get the elevation for a GPS position
   * Uses cached data if available, otherwise returns null
   * @param position Current GPS position
   * @returns Elevation data or null if unknown
   */
  getElevation(position: GPSCoordinate): Promise<Result<ElevationData | null>>;

  /**
   * Get route elevation metrics (total climb, descent, etc.)
   * @param routeId The route ID to get metrics for
   * @returns Route elevation metrics or null if not cached
   */
  getRouteMetrics(routeId: string): RouteElevationMetrics | null;

  /**
   * Get remaining climb from current position to route end
   * @param routeId The route ID
   * @param currentPosition Current GPS position
   * @returns Remaining climb in meters or null if not available
   */
  getRemainingClimb(
    routeId: string,
    currentPosition: GPSCoordinate,
  ): number | null;

  /**
   * Prefetch elevation data along a route for offline use
   * Should be called when route is calculated (while internet is available)
   * @param route The drive route to prefetch elevations for
   * @param onProgress Optional callback for progress updates
   * @returns Result with number of elevation points cached
   */
  prefetchRouteElevations(
    route: DriveRoute,
    onProgress?: (progress: ElevationPrefetchProgress) => void,
  ): Promise<Result<number>>;

  /**
   * Check if elevations are cached for a route
   * @param routeId The route ID to check
   * @returns true if cached data exists
   */
  hasRouteCache(routeId: string): boolean;

  /**
   * Clear cached elevation data for a route
   * @param routeId The route ID to clear cache for
   */
  clearRouteCache(routeId: string): Promise<Result<void>>;

  /**
   * Clear all cached elevation data
   */
  clearAllCache(): Promise<Result<void>>;

  /**
   * Clean up resources
   */
  dispose(): Promise<void>;
}
