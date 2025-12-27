import { Result, DriveRoute } from "@core/types";

/**
 * OSM Water types supported for rendering
 */
export type WaterType =
  | "river"
  | "stream"
  | "canal"
  | "lake"
  | "pond"
  | "reservoir"
  | "water";

/**
 * OSM Landuse/natural types supported for rendering
 */
export type LanduseType =
  | "forest"
  | "wood"
  | "park"
  | "meadow"
  | "grass"
  | "farmland";

/**
 * Cached water feature for offline rendering
 */
export interface CachedWater {
  /** OSM element ID */
  id: number;
  /** Water type for styling */
  waterType: WaterType;
  /** Feature name (optional) */
  name?: string;
  /** Whether this is an area (polygon) or linear (river/stream) */
  isArea: boolean;
  /** Geometry as array of [latitude, longitude] pairs */
  geometry: [number, number][];
}

/**
 * Cached landuse feature for offline rendering
 */
export interface CachedLanduse {
  /** OSM element ID */
  id: number;
  /** Landuse type for styling */
  landuseType: LanduseType;
  /** Feature name (optional) */
  name?: string;
  /** Geometry as array of [latitude, longitude] pairs (polygon) */
  geometry: [number, number][];
}

/**
 * OSM Highway types supported for rendering
 */
export type HighwayType =
  | "motorway"
  | "motorway_link"
  | "trunk"
  | "trunk_link"
  | "primary"
  | "primary_link"
  | "secondary"
  | "secondary_link"
  | "tertiary"
  | "tertiary_link"
  | "residential"
  | "unclassified";

/**
 * Line widths for highway types (in pixels)
 * Major roads are thicker, minor roads are thinner
 */
export const HIGHWAY_LINE_WIDTHS: Record<HighwayType, number> = {
  motorway: 5,
  motorway_link: 4,
  trunk: 4,
  trunk_link: 3,
  primary: 3,
  primary_link: 2,
  secondary: 2,
  secondary_link: 2,
  tertiary: 2,
  tertiary_link: 1,
  residential: 1,
  unclassified: 1,
};

/**
 * Render priority for highway types (lower = rendered first, appears below)
 */
export const HIGHWAY_RENDER_PRIORITY: Record<HighwayType, number> = {
  residential: 1,
  unclassified: 1,
  tertiary_link: 2,
  tertiary: 2,
  secondary_link: 3,
  secondary: 3,
  primary_link: 4,
  primary: 4,
  trunk_link: 5,
  trunk: 5,
  motorway_link: 6,
  motorway: 6,
};

/**
 * Cached road segment for offline rendering
 */
export interface CachedRoad {
  /** OSM way ID */
  wayId: number;
  /** Highway type for line width selection */
  highwayType: HighwayType;
  /** Road name (optional) */
  name?: string;
  /** Geometry as array of [latitude, longitude] pairs */
  geometry: [number, number][];
}

/**
 * Progress callback for road prefetching
 */
export interface RoadPrefetchProgress {
  /** Current point being processed (1-based) */
  current: number;
  /** Total points to process */
  total: number;
  /** Number of roads found so far */
  roadsFound: number;
  /** Whether prefetch is complete */
  complete: boolean;
}

/**
 * Vector Map Service Interface
 *
 * Fetches and caches road geometries from OpenStreetMap via Overpass API.
 * Designed for offline use during driving - prefetches roads along routes.
 */
export interface IVectorMapService {
  /**
   * Initialize the service
   * @returns Result indicating success or failure
   */
  initialize(): Promise<Result<void>>;

  /**
   * Get roads within a bounding box (from cache)
   * @param minLat Minimum latitude
   * @param maxLat Maximum latitude
   * @param minLon Minimum longitude
   * @param maxLon Maximum longitude
   * @returns Array of cached roads in the bounds
   */
  getRoadsInBounds(
    minLat: number,
    maxLat: number,
    minLon: number,
    maxLon: number,
  ): CachedRoad[];

  /**
   * Get all cached roads for all routes
   * Useful for rendering when viewport may overlap multiple cached areas
   * @returns Array of all cached roads
   */
  getAllCachedRoads(): CachedRoad[];

  /**
   * Prefetch roads along a route corridor for offline use
   * Should be called when route is calculated (while internet is available)
   * @param route The drive route to prefetch roads for
   * @param corridorRadiusMeters Radius around route to fetch (default 5000m)
   * @param onProgress Optional callback for progress updates
   * @returns Result with number of roads cached
   */
  prefetchRouteRoads(
    route: DriveRoute,
    corridorRadiusMeters?: number,
    onProgress?: (progress: RoadPrefetchProgress) => void,
  ): Promise<Result<number>>;

  /**
   * Check if roads are cached for a route
   * @param routeId The route ID to check
   * @returns true if cached data exists
   */
  hasRouteCache(routeId: string): boolean;

  /**
   * Clear cached road data for a route
   * @param routeId The route ID to clear cache for
   */
  clearRouteCache(routeId: string): Promise<Result<void>>;

  /**
   * Clear all cached road data
   */
  clearAllCache(): Promise<Result<void>>;

  /**
   * Get all cached water features
   * @returns Array of all cached water features
   */
  getAllCachedWater(): CachedWater[];

  /**
   * Get all cached landuse features
   * @returns Array of all cached landuse features
   */
  getAllCachedLanduse(): CachedLanduse[];

  /**
   * Prefetch water features along a route corridor for offline use
   * @param route The drive route to prefetch water for
   * @param corridorRadiusMeters Radius around route to fetch (default 5000m)
   * @returns Result with number of water features cached
   */
  prefetchRouteWater(
    route: DriveRoute,
    corridorRadiusMeters?: number,
  ): Promise<Result<number>>;

  /**
   * Prefetch landuse features along a route corridor for offline use
   * @param route The drive route to prefetch landuse for
   * @param corridorRadiusMeters Radius around route to fetch (default 5000m)
   * @returns Result with number of landuse features cached
   */
  prefetchRouteLanduse(
    route: DriveRoute,
    corridorRadiusMeters?: number,
  ): Promise<Result<number>>;

  /**
   * Clean up resources
   */
  dispose(): Promise<void>;
}
