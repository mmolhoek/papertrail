import {
  CoordinatePool,
  getCoordinatePool,
  resetCoordinatePool,
} from "../CoordinatePool";

describe("CoordinatePool", () => {
  beforeEach(() => {
    resetCoordinatePool();
  });

  describe("acquire", () => {
    it("should create a new array on first acquire", () => {
      const pool = new CoordinatePool();
      const points = pool.acquire(100);

      expect(Array.isArray(points)).toBe(true);
      expect(points.length).toBeGreaterThanOrEqual(100);
    });

    it("should bucket sizes to powers of 2", () => {
      const pool = new CoordinatePool();

      // 50 should go to bucket 64
      const points50 = pool.acquire(50);
      expect(points50.length).toBe(64);

      // 100 should go to bucket 128
      pool.release(points50);
      const points100 = pool.acquire(100);
      expect(points100.length).toBe(128);

      // 500 should go to bucket 512
      pool.release(points100);
      const points500 = pool.acquire(500);
      expect(points500.length).toBe(512);
    });

    it("should pre-initialize points with x and y", () => {
      const pool = new CoordinatePool();
      const points = pool.acquire(10);

      for (let i = 0; i < points.length; i++) {
        expect(points[i]).toHaveProperty("x");
        expect(points[i]).toHaveProperty("y");
        expect(typeof points[i].x).toBe("number");
        expect(typeof points[i].y).toBe("number");
      }
    });

    it("should reuse array after release", () => {
      const pool = new CoordinatePool();
      const points1 = pool.acquire(100);
      pool.release(points1);

      const points2 = pool.acquire(100);

      // Should be the same array
      expect(points2).toBe(points1);

      const stats = pool.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.reused).toBe(1);
    });

    it("should create new array when pool is exhausted", () => {
      const pool = new CoordinatePool(1); // Max 1 entry
      const points1 = pool.acquire(100);

      // Don't release, acquire another
      const points2 = pool.acquire(100);

      expect(points2).not.toBe(points1);

      const stats = pool.getStats();
      expect(stats.created).toBe(2);
    });

    it("should handle different size buckets separately", () => {
      const pool = new CoordinatePool();
      const points64 = pool.acquire(50); // -> bucket 64
      const points128 = pool.acquire(100); // -> bucket 128

      pool.release(points64);
      pool.release(points128);

      // Each should come from their respective bucket
      const points64b = pool.acquire(50);
      const points128b = pool.acquire(100);

      expect(points64b).toBe(points64);
      expect(points128b).toBe(points128);
    });
  });

  describe("release", () => {
    it("should mark array as available for reuse", () => {
      const pool = new CoordinatePool();
      const points = pool.acquire(100);

      let stats = pool.getStats();
      expect(stats.inUse).toBe(1);

      pool.release(points);

      stats = pool.getStats();
      expect(stats.inUse).toBe(0);
    });

    it("should handle releasing unknown array gracefully", () => {
      const pool = new CoordinatePool();
      const fakeArray = [{ x: 0, y: 0 }];

      // Should not throw
      expect(() => pool.release(fakeArray)).not.toThrow();
    });
  });

  describe("projectInto", () => {
    it("should project coordinates into pooled array", () => {
      const pool = new CoordinatePool();
      const coords = [
        { lat: 51.5, lon: -0.1 },
        { lat: 51.6, lon: -0.2 },
        { lat: 51.7, lon: -0.3 },
      ];

      const points = pool.projectInto(coords, (coord) => ({
        x: coord.lon * 100,
        y: coord.lat * 100,
      }));

      expect(points[0].x).toBe(-10);
      expect(points[0].y).toBe(5150);
      expect(points[1].x).toBe(-20);
      expect(points[1].y).toBe(5160);
      expect(points[2].x).toBe(-30);
      expect(points[2].y).toBe(5170);
    });

    it("should provide index to projection function", () => {
      const pool = new CoordinatePool();
      const coords = [1, 2, 3];

      const points = pool.projectInto(coords, (_, index) => ({
        x: index * 10,
        y: index * 20,
      }));

      expect(points[0]).toEqual({ x: 0, y: 0 });
      expect(points[1]).toEqual({ x: 10, y: 20 });
      expect(points[2]).toEqual({ x: 20, y: 40 });
    });
  });

  describe("transformInPlace", () => {
    it("should transform points without allocation", () => {
      const pool = new CoordinatePool();
      const points = pool.acquire(3);

      // Set initial values
      points[0] = { x: 10, y: 20 };
      points[1] = { x: 30, y: 40 };
      points[2] = { x: 50, y: 60 };

      // Double all values
      pool.transformInPlace(points, 3, (p) => ({
        x: p.x * 2,
        y: p.y * 2,
      }));

      expect(points[0]).toEqual({ x: 20, y: 40 });
      expect(points[1]).toEqual({ x: 60, y: 80 });
      expect(points[2]).toEqual({ x: 100, y: 120 });
    });

    it("should only transform up to count", () => {
      const pool = new CoordinatePool();
      const points = pool.acquire(5);

      points[0] = { x: 1, y: 1 };
      points[1] = { x: 2, y: 2 };
      points[2] = { x: 3, y: 3 };
      points[3] = { x: 4, y: 4 };
      points[4] = { x: 5, y: 5 };

      // Only transform first 3
      pool.transformInPlace(points, 3, (p) => ({
        x: p.x * 10,
        y: p.y * 10,
      }));

      expect(points[0].x).toBe(10);
      expect(points[2].x).toBe(30);
      expect(points[3].x).toBe(4); // Unchanged
      expect(points[4].x).toBe(5); // Unchanged
    });
  });

  describe("evictOld", () => {
    it("should remove old unused entries", () => {
      const pool = new CoordinatePool(10, 100); // 100ms max age
      const points = pool.acquire(100);
      pool.release(points);

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
      const pool = new CoordinatePool(10, 100);
      pool.acquire(100);
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
      const pool = new CoordinatePool();
      pool.acquire(100);
      pool.acquire(200);

      pool.clear();

      const stats = pool.getStats();
      expect(stats.poolSize).toBe(0);
    });
  });

  describe("getStats", () => {
    it("should track hits and misses", () => {
      const pool = new CoordinatePool();

      // First acquire is a miss
      const points1 = pool.acquire(100);
      let stats = pool.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);

      // Release and acquire again is a hit
      pool.release(points1);
      pool.acquire(100);

      stats = pool.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });
  });

  describe("global pool", () => {
    it("should return singleton instance", () => {
      const pool1 = getCoordinatePool();
      const pool2 = getCoordinatePool();
      expect(pool1).toBe(pool2);
    });

    it("should reset singleton on resetCoordinatePool", () => {
      const pool1 = getCoordinatePool();
      pool1.acquire(100);

      resetCoordinatePool();

      const pool2 = getCoordinatePool();
      expect(pool2).not.toBe(pool1);
      expect(pool2.getStats().created).toBe(0);
    });
  });

  describe("size bucket edge cases", () => {
    it("should handle minimum bucket (64)", () => {
      const pool = new CoordinatePool();
      const points = pool.acquire(1);
      expect(points.length).toBe(64);
    });

    it("should handle exact power of 2 requests", () => {
      const pool = new CoordinatePool();

      const p128 = pool.acquire(128);
      expect(p128.length).toBe(128);

      pool.release(p128);
      const p256 = pool.acquire(256);
      expect(p256.length).toBe(256);
    });

    it("should handle large arrays", () => {
      const pool = new CoordinatePool();
      const points = pool.acquire(5000);
      expect(points.length).toBe(8192); // Next power of 2 above 5000
    });
  });
});
