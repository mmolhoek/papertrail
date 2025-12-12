import { BitmapPool, getBitmapPool, resetBitmapPool } from "../BitmapPool";

describe("BitmapPool", () => {
  beforeEach(() => {
    resetBitmapPool();
  });

  describe("acquire", () => {
    it("should create a new bitmap on first acquire", () => {
      const pool = new BitmapPool();
      const bitmap = pool.acquire(800, 480);

      expect(bitmap.width).toBe(800);
      expect(bitmap.height).toBe(480);
      expect(bitmap.data).toBeInstanceOf(Uint8Array);
      expect(bitmap.data.length).toBe(Math.ceil(800 / 8) * 480);
    });

    it("should fill with white (0xFF) by default", () => {
      const pool = new BitmapPool();
      const bitmap = pool.acquire(100, 100);

      // All bytes should be 0xFF (white)
      expect(bitmap.data.every((b) => b === 0xff)).toBe(true);
    });

    it("should fill with black (0x00) when fill is true", () => {
      const pool = new BitmapPool();
      const bitmap = pool.acquire(100, 100, true);

      // All bytes should be 0x00 (black)
      expect(bitmap.data.every((b) => b === 0x00)).toBe(true);
    });

    it("should reuse buffer after release", () => {
      const pool = new BitmapPool();
      const bitmap1 = pool.acquire(800, 480);
      pool.release(bitmap1);

      const bitmap2 = pool.acquire(800, 480);

      // Should be the same object
      expect(bitmap2).toBe(bitmap1);

      const stats = pool.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.reused).toBe(1);
    });

    it("should clear buffer when reusing", () => {
      const pool = new BitmapPool();
      const bitmap1 = pool.acquire(100, 100);

      // Modify the buffer
      bitmap1.data[0] = 0x00;
      bitmap1.data[1] = 0x55;

      pool.release(bitmap1);

      // Acquire again - should be cleared
      const bitmap2 = pool.acquire(100, 100);
      expect(bitmap2.data[0]).toBe(0xff);
      expect(bitmap2.data[1]).toBe(0xff);
    });

    it("should create new bitmap when pool is exhausted", () => {
      const pool = new BitmapPool(1); // Max 1 entry
      const bitmap1 = pool.acquire(800, 480);

      // Don't release, acquire another
      const bitmap2 = pool.acquire(800, 480);

      expect(bitmap2).not.toBe(bitmap1);

      const stats = pool.getStats();
      expect(stats.created).toBe(2);
    });

    it("should handle different dimensions separately", () => {
      const pool = new BitmapPool();
      const bitmap1 = pool.acquire(800, 480);
      const bitmap2 = pool.acquire(400, 300);

      expect(bitmap1.width).toBe(800);
      expect(bitmap2.width).toBe(400);

      pool.release(bitmap1);
      pool.release(bitmap2);

      // Each should come from their respective pool
      const bitmap3 = pool.acquire(800, 480);
      const bitmap4 = pool.acquire(400, 300);

      expect(bitmap3).toBe(bitmap1);
      expect(bitmap4).toBe(bitmap2);
    });

    it("should set metadata with creation date", () => {
      const pool = new BitmapPool();
      const before = new Date();
      const bitmap = pool.acquire(100, 100);
      const after = new Date();

      expect(bitmap.metadata).toBeDefined();
      expect(bitmap.metadata!.createdAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(bitmap.metadata!.createdAt.getTime()).toBeLessThanOrEqual(
        after.getTime(),
      );
    });
  });

  describe("release", () => {
    it("should mark buffer as available for reuse", () => {
      const pool = new BitmapPool();
      const bitmap = pool.acquire(100, 100);

      let stats = pool.getStats();
      expect(stats.inUse).toBe(1);

      pool.release(bitmap);

      stats = pool.getStats();
      expect(stats.inUse).toBe(0);
    });

    it("should handle releasing unknown buffer gracefully", () => {
      const pool = new BitmapPool();
      const fakeBitmap = {
        width: 100,
        height: 100,
        data: new Uint8Array(1300),
      };

      // Should not throw
      expect(() => pool.release(fakeBitmap)).not.toThrow();
    });
  });

  describe("evictOld", () => {
    it("should remove old unused entries", () => {
      const pool = new BitmapPool(10, 100); // 100ms max age
      const bitmap = pool.acquire(100, 100);
      pool.release(bitmap);

      // Wait for entry to age
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          pool.evictOld();
          const stats = pool.getStats();
          expect(stats.evicted).toBe(1);
          expect(stats.poolSize).toBe(0);
          resolve();
        }, 150);
      });
    });

    it("should not evict entries still in use", () => {
      const pool = new BitmapPool(10, 100);
      pool.acquire(100, 100); // Intentionally not released
      // Don't release

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          pool.evictOld();
          const stats = pool.getStats();
          expect(stats.evicted).toBe(0);
          expect(stats.poolSize).toBe(1);
          resolve();
        }, 150);
      });
    });
  });

  describe("clear", () => {
    it("should remove all entries", () => {
      const pool = new BitmapPool();
      pool.acquire(800, 480);
      pool.acquire(400, 300);

      pool.clear();

      const stats = pool.getStats();
      expect(stats.poolSize).toBe(0);
    });
  });

  describe("getStats", () => {
    it("should track hits and misses", () => {
      const pool = new BitmapPool();

      // First acquire is a miss
      const bitmap1 = pool.acquire(100, 100);
      let stats = pool.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);

      // Release and acquire again is a hit
      pool.release(bitmap1);
      pool.acquire(100, 100);

      stats = pool.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it("should track created and reused", () => {
      const pool = new BitmapPool();
      const bitmap = pool.acquire(100, 100);
      pool.release(bitmap);
      pool.acquire(100, 100);

      const stats = pool.getStats();
      expect(stats.created).toBe(1);
      expect(stats.reused).toBe(1);
    });
  });

  describe("global pool", () => {
    it("should return singleton instance", () => {
      const pool1 = getBitmapPool();
      const pool2 = getBitmapPool();
      expect(pool1).toBe(pool2);
    });

    it("should reset singleton on resetBitmapPool", () => {
      const pool1 = getBitmapPool();
      pool1.acquire(100, 100);

      resetBitmapPool();

      const pool2 = getBitmapPool();
      expect(pool2).not.toBe(pool1);
      expect(pool2.getStats().created).toBe(0);
    });
  });
});
