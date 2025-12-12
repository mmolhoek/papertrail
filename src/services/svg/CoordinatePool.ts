import { Point2D } from "@core/types";
import { getLogger } from "@utils/logger";

const logger = getLogger("CoordinatePool");

/**
 * Pool entry storing a reusable Point2D array
 */
interface ArrayEntry {
  /** The point array */
  points: Point2D[];
  /** Current length in use (may be less than capacity) */
  length: number;
  /** Whether this entry is currently in use */
  inUse: boolean;
  /** Last time this entry was used */
  lastUsed: number;
}

/**
 * Get size bucket for array capacity.
 * Rounds up to nearest power of 2 for efficient pooling.
 */
function getSizeBucket(size: number): number {
  if (size <= 64) return 64;
  if (size <= 128) return 128;
  if (size <= 256) return 256;
  if (size <= 512) return 512;
  if (size <= 1024) return 1024;
  if (size <= 2048) return 2048;
  if (size <= 4096) return 4096;
  if (size <= 8192) return 8192;
  return Math.pow(2, Math.ceil(Math.log2(size)));
}

/**
 * Object pool for reusing coordinate arrays.
 *
 * Track rendering frequently projects GPS coordinates to pixel coordinates,
 * creating temporary Point2D arrays. This pool maintains pre-allocated arrays
 * to reduce garbage collection pressure.
 *
 * Arrays are bucketed by capacity (powers of 2) for efficient reuse.
 *
 * Usage:
 * 1. Call acquire() to get an array from the pool
 * 2. Use the array for projection calculations
 * 3. Call release() when done to return it to the pool
 *
 * @example
 * ```typescript
 * const pool = getCoordinatePool();
 * const points = pool.acquire(trackPoints.length);
 * // ... project coordinates into points array ...
 * // When done:
 * pool.release(points);
 * ```
 */
export class CoordinatePool {
  /** Pools organized by size bucket */
  private pools: Map<number, ArrayEntry[]> = new Map();

  /** Maximum entries per size bucket */
  private readonly maxPoolSize: number;

  /** Maximum age before eviction (ms) */
  private readonly maxAge: number;

  /** Statistics */
  private stats = {
    hits: 0,
    misses: 0,
    created: 0,
    reused: 0,
    evicted: 0,
  };

  /**
   * Create a new coordinate pool
   * @param maxPoolSize Maximum arrays per bucket (default: 4)
   * @param maxAge Maximum age in ms before eviction (default: 60000 = 1 minute)
   */
  constructor(maxPoolSize: number = 4, maxAge: number = 60000) {
    this.maxPoolSize = maxPoolSize;
    this.maxAge = maxAge;
  }

  /**
   * Acquire a Point2D array from the pool.
   *
   * Returns an array with at least the requested capacity.
   * The array may be larger than requested (due to bucketing).
   *
   * @param minCapacity Minimum number of points needed
   * @returns An array ready for use
   */
  acquire(minCapacity: number): Point2D[] {
    const bucket = getSizeBucket(minCapacity);
    let pool = this.pools.get(bucket);

    if (!pool) {
      pool = [];
      this.pools.set(bucket, pool);
    }

    // Try to find an available entry
    for (const entry of pool) {
      if (!entry.inUse) {
        entry.inUse = true;
        entry.lastUsed = Date.now();
        entry.length = 0; // Reset length
        this.stats.hits++;
        this.stats.reused++;

        logger.debug(
          `Coordinate pool hit: bucket ${bucket} (${this.stats.hits} hits)`,
        );
        return entry.points;
      }
    }

    // No available entry, create a new one
    this.stats.misses++;
    this.stats.created++;

    // Pre-allocate array with bucket capacity
    const points: Point2D[] = new Array(bucket);
    for (let i = 0; i < bucket; i++) {
      points[i] = { x: 0, y: 0 };
    }

    // Add to pool if there's room
    if (pool.length < this.maxPoolSize) {
      pool.push({
        points,
        length: 0,
        inUse: true,
        lastUsed: Date.now(),
      });
    }

    logger.debug(
      `Coordinate pool miss: bucket ${bucket} (${this.stats.misses} misses, ${pool.length} in pool)`,
    );
    return points;
  }

  /**
   * Release a Point2D array back to the pool.
   *
   * @param points The array to release
   */
  release(points: Point2D[]): void {
    const bucket = getSizeBucket(points.length);
    const pool = this.pools.get(bucket);

    if (!pool) {
      // Try exact match if bucket doesn't exist
      for (const [, p] of this.pools) {
        for (const entry of p) {
          if (entry.points === points) {
            entry.inUse = false;
            entry.lastUsed = Date.now();
            return;
          }
        }
      }
      return;
    }

    // Find the entry and mark it as not in use
    for (const entry of pool) {
      if (entry.points === points) {
        entry.inUse = false;
        entry.lastUsed = Date.now();
        logger.debug(`Coordinates released: bucket ${bucket}`);
        return;
      }
    }
  }

  /**
   * Project coordinates into a pooled array.
   *
   * This is a convenience method that acquires an array, projects
   * the coordinates, and returns the result. Caller is responsible
   * for releasing the array.
   *
   * @param coordinates Source coordinates to project
   * @param projectFn Function to project each coordinate
   * @returns Pooled array with projected points
   */
  projectInto<T>(
    coordinates: T[],
    projectFn: (coord: T, index: number) => Point2D,
  ): Point2D[] {
    const points = this.acquire(coordinates.length);

    for (let i = 0; i < coordinates.length; i++) {
      const projected = projectFn(coordinates[i], i);
      points[i].x = projected.x;
      points[i].y = projected.y;
    }

    return points;
  }

  /**
   * Transform points in-place.
   *
   * Applies a transformation function to each point in the array
   * without creating new objects.
   *
   * @param points Array of points to transform
   * @param count Number of points to transform
   * @param transformFn Function to transform each point
   */
  transformInPlace(
    points: Point2D[],
    count: number,
    transformFn: (point: Point2D, index: number) => Point2D,
  ): void {
    for (let i = 0; i < count; i++) {
      const transformed = transformFn(points[i], i);
      points[i].x = transformed.x;
      points[i].y = transformed.y;
    }
  }

  /**
   * Evict old entries from the pool.
   */
  evictOld(): void {
    const now = Date.now();

    for (const [bucket, pool] of this.pools) {
      const before = pool.length;

      const filtered = pool.filter((entry) => {
        if (entry.inUse) return true;
        if (now - entry.lastUsed < this.maxAge) return true;
        return false;
      });

      const evicted = before - filtered.length;
      if (evicted > 0) {
        this.pools.set(bucket, filtered);
        this.stats.evicted += evicted;
        logger.debug(`Evicted ${evicted} old entries for bucket ${bucket}`);
      }
    }
  }

  /**
   * Clear the entire pool.
   */
  clear(): void {
    let totalCleared = 0;
    for (const pool of this.pools.values()) {
      totalCleared += pool.length;
    }
    this.pools.clear();
    logger.info(`Cleared coordinate pool (${totalCleared} entries)`);
  }

  /**
   * Get pool statistics.
   */
  getStats(): {
    hits: number;
    misses: number;
    created: number;
    reused: number;
    evicted: number;
    hitRate: number;
    poolSize: number;
    inUse: number;
  } {
    const total = this.stats.hits + this.stats.misses;
    let poolSize = 0;
    let inUse = 0;

    for (const pool of this.pools.values()) {
      poolSize += pool.length;
      inUse += pool.filter((e) => e.inUse).length;
    }

    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      poolSize,
      inUse,
    };
  }
}

// Singleton instance
let globalPool: CoordinatePool | null = null;

/**
 * Get the global coordinate pool instance
 */
export function getCoordinatePool(): CoordinatePool {
  if (!globalPool) {
    globalPool = new CoordinatePool();
  }
  return globalPool;
}

/**
 * Reset the global coordinate pool (useful for testing)
 */
export function resetCoordinatePool(): void {
  if (globalPool) {
    globalPool.clear();
  }
  globalPool = null;
}
