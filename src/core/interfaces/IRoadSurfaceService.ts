/**
 * Road Surface Service Interface
 *
 * Provides road surface information (asphalt, gravel, dirt, etc.) from OSM data.
 * Used during navigation to inform users about upcoming surface changes.
 */

import { Result } from "@core/types";
import { GPSCoordinate } from "@core/types/GPSTypes";

/**
 * Simplified road surface categories for display
 */
export type RoadSurfaceType =
  | "paved"
  | "gravel"
  | "dirt"
  | "unpaved"
  | "unknown";

/**
 * A road segment with surface information
 */
export interface RoadSurfaceSegment {
  /** Start point of the segment */
  start: { latitude: number; longitude: number };
  /** End point of the segment */
  end: { latitude: number; longitude: number };
  /** Classified surface type */
  surface: RoadSurfaceType;
  /** Original OSM surface value */
  rawSurface: string;
  /** OSM way ID */
  wayId: number;
  /** Road name if available */
  roadName?: string;
  /** Highway type (motorway, residential, track, etc.) */
  highwayType: string;
}

/**
 * Progress information during route prefetch
 */
export interface RoadSurfacePrefetchProgress {
  /** Current segment being processed */
  current: number;
  /** Total segments to process */
  total: number;
  /** Number of surface segments found */
  segmentsFound: number;
  /** Whether prefetch is complete */
  complete: boolean;
}

/**
 * Road surface service interface
 */
export interface IRoadSurfaceService {
  /**
   * Initialize the service
   */
  initialize(): Promise<Result<void>>;

  /**
   * Dispose of the service and clean up resources
   */
  dispose(): Promise<void>;

  /**
   * Get the current road surface at a position
   * @param position Current GPS position
   * @returns The road surface type or null if unknown
   */
  getCurrentSurface(
    position: GPSCoordinate,
  ): Promise<Result<RoadSurfaceType | null>>;

  /**
   * Prefetch road surface data along a route for offline use
   * @param routeGeometry Array of [lat, lon] coordinates
   * @param routeId Unique identifier for caching
   * @param onProgress Optional progress callback
   */
  prefetchRouteSurfaces(
    routeGeometry: [number, number][],
    routeId: string,
    onProgress?: (progress: RoadSurfacePrefetchProgress) => void,
  ): Promise<Result<void>>;

  /**
   * Check if route surface data is cached
   * @param routeId Route identifier
   */
  hasRouteCache(routeId: string): boolean;

  /**
   * Clear cached data for a specific route
   * @param routeId Route identifier
   */
  clearRouteCache(routeId: string): void;

  /**
   * Clear all cached surface data
   */
  clearAllCache(): Promise<void>;
}
