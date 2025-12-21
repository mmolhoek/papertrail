import { Result, GPSCoordinate, DriveRoute } from "@core/types";

/**
 * POI category types
 */
export type POICategory =
  | "fuel"
  | "charging"
  | "parking"
  | "food"
  | "restroom"
  | "viewpoint";

/**
 * All POI categories for prefetching
 */
export const ALL_POI_CATEGORIES: POICategory[] = [
  "fuel",
  "charging",
  "parking",
  "food",
  "restroom",
  "viewpoint",
];

/**
 * POI code letters for display
 */
export const POI_CODE_LETTERS: Record<POICategory, string> = {
  fuel: "F",
  charging: "C",
  parking: "P",
  food: "E",
  restroom: "R",
  viewpoint: "V",
};

/**
 * POI category display names
 */
export const POI_CATEGORY_NAMES: Record<POICategory, string> = {
  fuel: "Fuel Station",
  charging: "Charging Station",
  parking: "Parking",
  food: "Food",
  restroom: "Restroom",
  viewpoint: "Viewpoint",
};

/**
 * Point of Interest data
 */
export interface POIData {
  /** OSM node/way ID */
  id: number;
  /** POI category */
  category: POICategory;
  /** POI name (if available) */
  name?: string;
  /** Latitude */
  latitude: number;
  /** Longitude */
  longitude: number;
  /** Distance from query point in meters */
  distance: number;
  /** Bearing from query point in degrees (0-360) */
  bearing?: number;
}

/**
 * Cached POI data for offline use
 */
export interface CachedPOI {
  /** OSM node/way ID */
  id: number;
  /** POI category */
  category: POICategory;
  /** POI name */
  name?: string;
  /** Latitude */
  latitude: number;
  /** Longitude */
  longitude: number;
}

/**
 * Progress callback for POI prefetching
 */
export interface POIPrefetchProgress {
  /** Current point being processed (1-based) */
  current: number;
  /** Total points to process */
  total: number;
  /** Number of POIs found so far */
  poisFound: number;
  /** Whether prefetch is complete */
  complete: boolean;
}

/**
 * Nearby POI result with distance and bearing
 */
export interface NearbyPOI extends POIData {
  /** Code letter for display (F, P, E, R, V) */
  codeLetter: string;
  /** Distance from POI to the route line (perpendicular), in meters. Only set when route is active. */
  distanceToRoute?: number;
  /** Distance along route to reach this POI (from current position), in meters. Only set when route is active. */
  distanceAlongRoute?: number;
}

/**
 * POI Service Interface
 *
 * Fetches and caches Points of Interest from OpenStreetMap via Overpass API.
 * Designed for offline use during driving - prefetches POIs along routes.
 */
export interface IPOIService {
  /**
   * Initialize the service
   * @returns Result indicating success or failure
   */
  initialize(): Promise<Result<void>>;

  /**
   * Get nearby POIs for a GPS position
   * Uses cached data if available, otherwise returns empty array
   * @param position Current GPS position
   * @param categories POI categories to include (defaults to all enabled)
   * @param maxDistance Maximum distance in meters (default 5000)
   * @param maxResults Maximum number of results (default 10)
   * @param routeContext Optional route context for route-aware filtering
   * @returns Array of nearby POIs sorted by distance (or distance along route if route context provided)
   */
  getNearbyPOIs(
    position: GPSCoordinate,
    categories?: POICategory[],
    maxDistance?: number,
    maxResults?: number,
    routeContext?: {
      /** Route geometry for filtering POIs by route proximity */
      geometry: [number, number][];
      /** Max perpendicular distance from route to include POIs (default 200m) */
      maxDistanceToRoute?: number;
      /** Distance already traveled along route from start */
      distanceFromStart?: number;
    },
  ): Promise<Result<NearbyPOI[]>>;

  /**
   * Get the nearest POI of a specific category
   * @param position Current GPS position
   * @param category POI category
   * @param maxDistance Maximum distance in meters (default 5000)
   * @returns Nearest POI or null if none found
   */
  getNearestPOI(
    position: GPSCoordinate,
    category: POICategory,
    maxDistance?: number,
  ): Promise<Result<NearbyPOI | null>>;

  /**
   * Prefetch POIs along a route for offline use
   * Should be called when route is calculated (while internet is available)
   * @param route The drive route to prefetch POIs for
   * @param categories POI categories to prefetch
   * @param onProgress Optional callback for progress updates
   * @returns Result with number of POIs cached
   */
  prefetchRoutePOIs(
    route: DriveRoute,
    categories: POICategory[],
    onProgress?: (progress: POIPrefetchProgress) => void,
  ): Promise<Result<number>>;

  /**
   * Check if POIs are cached for a route
   * @param routeId The route ID to check
   * @returns true if cached data exists
   */
  hasRouteCache(routeId: string): boolean;

  /**
   * Clear cached POI data for a route
   * @param routeId The route ID to clear cache for
   */
  clearRouteCache(routeId: string): Promise<Result<void>>;

  /**
   * Clear all cached POI data
   */
  clearAllCache(): Promise<Result<void>>;

  /**
   * Clean up resources
   */
  dispose(): Promise<void>;
}
