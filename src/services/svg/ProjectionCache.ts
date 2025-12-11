import { Point2D, ViewportConfig, GPXTrack } from "@core/types";
import { getLogger } from "@utils/logger";
import { ProjectionService } from "./ProjectionService";

const logger = getLogger("ProjectionCache");

/**
 * Cache key for viewport-based projection caching
 */
interface ViewportCacheKey {
  centerLat: number;
  centerLon: number;
  zoomLevel: number;
  width: number;
  height: number;
  bearing?: number;
}

/**
 * Cached projection result
 */
interface CachedProjection {
  key: ViewportCacheKey;
  projectedPoints: Point2D[];
  rotatedPoints?: Point2D[];
  metersPerPixel: number;
  timestamp: number;
}

/**
 * Cache for coordinate projections to avoid redundant calculations.
 *
 * When the viewport (center, zoom, dimensions) hasn't changed and we're rendering
 * the same track, we can reuse the previously projected coordinates.
 *
 * The cache stores:
 * - Projected pixel coordinates for track points
 * - Pre-calculated meters per pixel value
 * - Rotated coordinates (if bearing rotation was applied)
 */
export class ProjectionCache {
  private trackCache: Map<string, CachedProjection> = new Map();
  private readonly maxCacheSize: number;
  private readonly maxAge: number; // ms
  private hits = 0;
  private misses = 0;

  /**
   * Create a new projection cache
   * @param maxCacheSize Maximum number of cached projections (default: 10)
   * @param maxAge Maximum age of cached entries in milliseconds (default: 30000)
   */
  constructor(maxCacheSize: number = 10, maxAge: number = 30000) {
    this.maxCacheSize = maxCacheSize;
    this.maxAge = maxAge;
  }

  /**
   * Generate a cache key for a track and viewport combination
   */
  private generateTrackKey(track: GPXTrack, viewport: ViewportConfig): string {
    // Use track name and point count as part of the key
    const trackId = `${track.name}:${track.segments[0]?.points.length || 0}`;
    const viewportKey = this.serializeViewportKey(viewport);
    return `${trackId}:${viewportKey}`;
  }

  /**
   * Serialize viewport configuration to a string key
   */
  private serializeViewportKey(viewport: ViewportConfig): string {
    // Round values to avoid floating point precision issues
    const key: ViewportCacheKey = {
      centerLat: Math.round(viewport.centerPoint.latitude * 100000) / 100000,
      centerLon: Math.round(viewport.centerPoint.longitude * 100000) / 100000,
      zoomLevel: viewport.zoomLevel,
      width: viewport.width,
      height: viewport.height,
      bearing: viewport.centerPoint.bearing
        ? Math.round(viewport.centerPoint.bearing * 10) / 10
        : undefined,
    };
    return JSON.stringify(key);
  }

  /**
   * Get cached projected coordinates for a track and viewport
   * @returns Cached projection or null if not found/expired
   */
  getProjectedTrack(
    track: GPXTrack,
    viewport: ViewportConfig,
    rotateWithBearing: boolean,
  ): { points: Point2D[]; metersPerPixel: number } | null {
    const key = this.generateTrackKey(track, viewport);
    const cached = this.trackCache.get(key);

    if (!cached) {
      this.misses++;
      return null;
    }

    // Check if cache entry has expired
    if (Date.now() - cached.timestamp > this.maxAge) {
      this.trackCache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    logger.debug(`Cache hit for track projection (${this.hits} hits)`);

    // Return rotated or regular points based on request
    const points =
      rotateWithBearing && cached.rotatedPoints
        ? cached.rotatedPoints
        : cached.projectedPoints;

    return {
      points,
      metersPerPixel: cached.metersPerPixel,
    };
  }

  /**
   * Cache projected coordinates for a track and viewport
   */
  cacheProjectedTrack(
    track: GPXTrack,
    viewport: ViewportConfig,
    projectedPoints: Point2D[],
    rotatedPoints: Point2D[] | undefined,
    metersPerPixel: number,
  ): void {
    const key = this.generateTrackKey(track, viewport);

    // Evict old entries if cache is full
    if (this.trackCache.size >= this.maxCacheSize) {
      this.evictOldestEntry();
    }

    this.trackCache.set(key, {
      key: {
        centerLat: viewport.centerPoint.latitude,
        centerLon: viewport.centerPoint.longitude,
        zoomLevel: viewport.zoomLevel,
        width: viewport.width,
        height: viewport.height,
        bearing: viewport.centerPoint.bearing,
      },
      projectedPoints,
      rotatedPoints,
      metersPerPixel,
      timestamp: Date.now(),
    });

    logger.debug(
      `Cached projection for track (${this.trackCache.size} entries)`,
    );
  }

  /**
   * Evict the oldest cache entry
   */
  private evictOldestEntry(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, value] of this.trackCache) {
      if (value.timestamp < oldestTime) {
        oldestTime = value.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.trackCache.delete(oldestKey);
    }
  }

  /**
   * Clear all cached projections
   */
  clear(): void {
    this.trackCache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): { hits: number; misses: number; size: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.trackCache.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Precompute meters per pixel for a viewport (cache-friendly)
   */
  getMetersPerPixel(viewport: ViewportConfig): number {
    return ProjectionService.calculateMetersPerPixel(
      viewport.centerPoint.latitude,
      viewport.zoomLevel,
    );
  }
}

// Singleton instance for global use
let globalCache: ProjectionCache | null = null;

/**
 * Get the global projection cache instance
 */
export function getProjectionCache(): ProjectionCache {
  if (!globalCache) {
    globalCache = new ProjectionCache();
  }
  return globalCache;
}

/**
 * Reset the global projection cache (useful for testing)
 */
export function resetProjectionCache(): void {
  if (globalCache) {
    globalCache.clear();
  }
  globalCache = null;
}
