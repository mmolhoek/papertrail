import {
  ProjectionCache,
  getProjectionCache,
  resetProjectionCache,
} from "../ProjectionCache";
import { GPXTrack, ViewportConfig } from "@core/types";

describe("ProjectionCache", () => {
  let cache: ProjectionCache;

  const mockTrack: GPXTrack = {
    name: "Test Track",
    segments: [
      {
        points: [
          { latitude: 51.5074, longitude: -0.1278, timestamp: new Date() },
          { latitude: 51.508, longitude: -0.127, timestamp: new Date() },
          { latitude: 51.509, longitude: -0.126, timestamp: new Date() },
        ],
      },
    ],
  };

  const mockViewport: ViewportConfig = {
    width: 800,
    height: 480,
    zoomLevel: 15,
    centerPoint: {
      latitude: 51.5074,
      longitude: -0.1278,
      timestamp: new Date(),
    },
  };

  const mockProjectedPoints = [
    { x: 400, y: 240 },
    { x: 420, y: 220 },
    { x: 440, y: 200 },
  ];

  beforeEach(() => {
    cache = new ProjectionCache();
  });

  describe("constructor", () => {
    it("should create cache with default settings", () => {
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it("should accept custom cache size and age", () => {
      const customCache = new ProjectionCache(5, 10000);
      expect(customCache.getStats().size).toBe(0);
    });
  });

  describe("getProjectedTrack", () => {
    it("should return null for uncached track", () => {
      const result = cache.getProjectedTrack(mockTrack, mockViewport, false);
      expect(result).toBeNull();
    });

    it("should return cached projection", () => {
      cache.cacheProjectedTrack(
        mockTrack,
        mockViewport,
        mockProjectedPoints,
        undefined,
        1.5,
      );

      const result = cache.getProjectedTrack(mockTrack, mockViewport, false);

      expect(result).not.toBeNull();
      expect(result!.points).toEqual(mockProjectedPoints);
      expect(result!.metersPerPixel).toBe(1.5);
    });

    it("should return rotated points when requested and available", () => {
      const rotatedPoints = [
        { x: 410, y: 250 },
        { x: 430, y: 230 },
        { x: 450, y: 210 },
      ];

      cache.cacheProjectedTrack(
        mockTrack,
        mockViewport,
        mockProjectedPoints,
        rotatedPoints,
        1.5,
      );

      const result = cache.getProjectedTrack(mockTrack, mockViewport, true);

      expect(result).not.toBeNull();
      expect(result!.points).toEqual(rotatedPoints);
    });

    it("should return regular points when rotation requested but not available", () => {
      cache.cacheProjectedTrack(
        mockTrack,
        mockViewport,
        mockProjectedPoints,
        undefined,
        1.5,
      );

      const result = cache.getProjectedTrack(mockTrack, mockViewport, true);

      expect(result).not.toBeNull();
      expect(result!.points).toEqual(mockProjectedPoints);
    });

    it("should track cache hits and misses", () => {
      // First miss
      cache.getProjectedTrack(mockTrack, mockViewport, false);

      let stats = cache.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);

      // Cache and hit
      cache.cacheProjectedTrack(
        mockTrack,
        mockViewport,
        mockProjectedPoints,
        undefined,
        1.5,
      );
      cache.getProjectedTrack(mockTrack, mockViewport, false);

      stats = cache.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });
  });

  describe("cacheProjectedTrack", () => {
    it("should evict oldest entry when cache is full", () => {
      const smallCache = new ProjectionCache(2);

      // Fill the cache
      smallCache.cacheProjectedTrack(
        { ...mockTrack, name: "Track1" },
        mockViewport,
        mockProjectedPoints,
        undefined,
        1.5,
      );

      // Wait a bit to ensure different timestamps
      smallCache.cacheProjectedTrack(
        { ...mockTrack, name: "Track2" },
        mockViewport,
        mockProjectedPoints,
        undefined,
        1.5,
      );

      // Add third entry (should evict first)
      smallCache.cacheProjectedTrack(
        { ...mockTrack, name: "Track3" },
        mockViewport,
        mockProjectedPoints,
        undefined,
        1.5,
      );

      expect(smallCache.getStats().size).toBe(2);
    });
  });

  describe("clear", () => {
    it("should clear all cached entries and stats", () => {
      cache.cacheProjectedTrack(
        mockTrack,
        mockViewport,
        mockProjectedPoints,
        undefined,
        1.5,
      );
      cache.getProjectedTrack(mockTrack, mockViewport, false);

      cache.clear();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe("getMetersPerPixel", () => {
    it("should calculate meters per pixel for viewport", () => {
      const metersPerPixel = cache.getMetersPerPixel(mockViewport);
      expect(metersPerPixel).toBeGreaterThan(0);
    });
  });

  describe("viewport key generation", () => {
    it("should differentiate viewports with different centers", () => {
      const viewport2: ViewportConfig = {
        ...mockViewport,
        centerPoint: {
          latitude: 51.51,
          longitude: -0.13,
          timestamp: new Date(),
        },
      };

      cache.cacheProjectedTrack(
        mockTrack,
        mockViewport,
        mockProjectedPoints,
        undefined,
        1.5,
      );

      const result = cache.getProjectedTrack(mockTrack, viewport2, false);
      expect(result).toBeNull();
    });

    it("should differentiate viewports with different zoom levels", () => {
      const viewport2: ViewportConfig = {
        ...mockViewport,
        zoomLevel: 16,
      };

      cache.cacheProjectedTrack(
        mockTrack,
        mockViewport,
        mockProjectedPoints,
        undefined,
        1.5,
      );

      const result = cache.getProjectedTrack(mockTrack, viewport2, false);
      expect(result).toBeNull();
    });

    it("should differentiate viewports with different dimensions", () => {
      const viewport2: ViewportConfig = {
        ...mockViewport,
        width: 1024,
      };

      cache.cacheProjectedTrack(
        mockTrack,
        mockViewport,
        mockProjectedPoints,
        undefined,
        1.5,
      );

      const result = cache.getProjectedTrack(mockTrack, viewport2, false);
      expect(result).toBeNull();
    });
  });
});

describe("Global ProjectionCache", () => {
  beforeEach(() => {
    resetProjectionCache();
  });

  describe("getProjectionCache", () => {
    it("should return singleton instance", () => {
      const cache1 = getProjectionCache();
      const cache2 = getProjectionCache();
      expect(cache1).toBe(cache2);
    });
  });

  describe("resetProjectionCache", () => {
    it("should reset the global cache", () => {
      const cache1 = getProjectionCache();
      resetProjectionCache();
      const cache2 = getProjectionCache();
      expect(cache1).not.toBe(cache2);
    });
  });
});
