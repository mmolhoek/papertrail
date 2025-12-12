import { Bitmap1Bit } from "@core/types";
import { getLogger } from "@utils/logger";

const logger = getLogger("BitmapPool");

/**
 * Pool entry storing a reusable bitmap buffer
 */
interface PoolEntry {
  /** The bitmap buffer */
  bitmap: Bitmap1Bit;
  /** Whether this entry is currently in use */
  inUse: boolean;
  /** Last time this entry was used */
  lastUsed: number;
}

/**
 * Pool key based on bitmap dimensions
 */
function getDimensionKey(width: number, height: number): string {
  return `${width}x${height}`;
}

/**
 * Object pool for reusing bitmap buffers.
 *
 * E-paper displays have fixed dimensions, so bitmaps are frequently allocated
 * with the same size. This pool maintains a cache of pre-allocated buffers
 * to reduce garbage collection pressure during frequent display updates.
 *
 * Usage:
 * 1. Call acquire() to get a bitmap from the pool (or create new if none available)
 * 2. Use the bitmap for rendering
 * 3. Call release() when done to return it to the pool
 *
 * The pool automatically evicts entries that haven't been used recently.
 *
 * @example
 * ```typescript
 * const pool = getBitmapPool();
 * const bitmap = pool.acquire(800, 480);
 * // ... render to bitmap ...
 * pool.release(bitmap);
 * ```
 */
export class BitmapPool {
  /** Pool organized by dimension key */
  private pools: Map<string, PoolEntry[]> = new Map();

  /** Maximum entries per dimension */
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
   * Create a new bitmap pool
   * @param maxPoolSize Maximum buffers to keep per dimension (default: 3)
   * @param maxAge Maximum age in ms before eviction (default: 60000 = 1 minute)
   */
  constructor(maxPoolSize: number = 3, maxAge: number = 60000) {
    this.maxPoolSize = maxPoolSize;
    this.maxAge = maxAge;
  }

  /**
   * Acquire a bitmap buffer from the pool.
   *
   * Returns a buffer from the pool if available, otherwise creates a new one.
   * The buffer is cleared to white (0xFF) before returning.
   *
   * @param width Bitmap width in pixels
   * @param height Bitmap height in pixels
   * @param fill If true, fill with black (0x00); if false, fill with white (0xFF)
   * @returns A bitmap buffer ready for use
   */
  acquire(width: number, height: number, fill: boolean = false): Bitmap1Bit {
    const key = getDimensionKey(width, height);
    let pool = this.pools.get(key);

    if (!pool) {
      pool = [];
      this.pools.set(key, pool);
    }

    // Try to find an available entry
    for (const entry of pool) {
      if (!entry.inUse) {
        entry.inUse = true;
        entry.lastUsed = Date.now();
        this.stats.hits++;
        this.stats.reused++;

        // Clear the buffer to the desired state
        entry.bitmap.data.fill(fill ? 0x00 : 0xff);

        // Update metadata
        entry.bitmap.metadata = {
          createdAt: new Date(),
        };

        logger.debug(`Bitmap pool hit: ${key} (${this.stats.hits} hits)`);
        return entry.bitmap;
      }
    }

    // No available entry, create a new one
    this.stats.misses++;
    this.stats.created++;

    const bytesPerRow = Math.ceil(width / 8);
    const totalBytes = bytesPerRow * height;
    const data = new Uint8Array(totalBytes);
    data.fill(fill ? 0x00 : 0xff);

    const bitmap: Bitmap1Bit = {
      width,
      height,
      data,
      metadata: {
        createdAt: new Date(),
      },
    };

    // Add to pool if there's room
    if (pool.length < this.maxPoolSize) {
      pool.push({
        bitmap,
        inUse: true,
        lastUsed: Date.now(),
      });
    }

    logger.debug(
      `Bitmap pool miss: ${key} (${this.stats.misses} misses, ${pool.length} in pool)`,
    );
    return bitmap;
  }

  /**
   * Release a bitmap buffer back to the pool.
   *
   * The buffer becomes available for reuse. If the bitmap wasn't
   * from the pool (wrong dimensions), it's simply discarded.
   *
   * @param bitmap The bitmap to release
   */
  release(bitmap: Bitmap1Bit): void {
    const key = getDimensionKey(bitmap.width, bitmap.height);
    const pool = this.pools.get(key);

    if (!pool) {
      return;
    }

    // Find the entry and mark it as not in use
    for (const entry of pool) {
      if (entry.bitmap === bitmap) {
        entry.inUse = false;
        entry.lastUsed = Date.now();
        logger.debug(`Bitmap released: ${key}`);
        return;
      }
    }
  }

  /**
   * Evict old entries from the pool.
   *
   * Removes entries that haven't been used within maxAge milliseconds.
   * Call this periodically to free up memory.
   */
  evictOld(): void {
    const now = Date.now();

    for (const [key, pool] of this.pools) {
      const before = pool.length;

      // Filter out old entries that aren't in use
      const filtered = pool.filter((entry) => {
        if (entry.inUse) return true;
        if (now - entry.lastUsed < this.maxAge) return true;
        return false;
      });

      const evicted = before - filtered.length;
      if (evicted > 0) {
        this.pools.set(key, filtered);
        this.stats.evicted += evicted;
        logger.debug(`Evicted ${evicted} old entries for ${key}`);
      }
    }
  }

  /**
   * Clear the entire pool.
   *
   * Releases all buffers. Use when shutting down or when
   * memory pressure is high.
   */
  clear(): void {
    let totalCleared = 0;
    for (const pool of this.pools.values()) {
      totalCleared += pool.length;
    }
    this.pools.clear();
    logger.info(`Cleared bitmap pool (${totalCleared} entries)`);
  }

  /**
   * Get pool statistics.
   *
   * @returns Statistics about pool usage
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
let globalPool: BitmapPool | null = null;

/**
 * Get the global bitmap pool instance
 */
export function getBitmapPool(): BitmapPool {
  if (!globalPool) {
    globalPool = new BitmapPool();
  }
  return globalPool;
}

/**
 * Reset the global bitmap pool (useful for testing)
 */
export function resetBitmapPool(): void {
  if (globalPool) {
    globalPool.clear();
  }
  globalPool = null;
}
