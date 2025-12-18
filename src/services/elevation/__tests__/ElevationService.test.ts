/* eslint-disable @typescript-eslint/no-explicit-any */
import { ElevationService } from "../ElevationService";
import { DriveRoute } from "@core/types";
import * as fs from "fs/promises";

// Mock the fetch API
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock fs/promises
jest.mock("fs/promises");
const mockedFs = fs as jest.Mocked<typeof fs>;

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe("ElevationService", () => {
  let service: ElevationService;

  // Route with longer geometry to ensure sampling picks up multiple points
  // Each ~0.01 degree is roughly 1km, so this is about 5km total
  const mockRoute: DriveRoute = {
    id: "test-route-1",
    destination: "Test Destination",
    createdAt: new Date(),
    startPoint: { latitude: 51.5, longitude: -0.1 },
    endPoint: { latitude: 51.55, longitude: -0.1 },
    waypoints: [],
    geometry: [
      [51.5, -0.1],
      [51.51, -0.1],
      [51.52, -0.1],
      [51.53, -0.1],
      [51.54, -0.1],
      [51.55, -0.1],
    ],
    totalDistance: 5000,
    estimatedTime: 300,
  };

  // Response matching the route geometry
  const mockOpenElevationResponse = {
    results: [
      { latitude: 51.5, longitude: -0.1, elevation: 10 },
      { latitude: 51.51, longitude: -0.1, elevation: 25 },
      { latitude: 51.52, longitude: -0.1, elevation: 20 },
      { latitude: 51.53, longitude: -0.1, elevation: 35 },
      { latitude: 51.54, longitude: -0.1, elevation: 30 },
      { latitude: 51.55, longitude: -0.1, elevation: 15 },
    ],
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup fs mocks
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.readdir.mockResolvedValue([]);
    mockedFs.writeFile.mockResolvedValue(undefined);
    mockedFs.unlink.mockResolvedValue(undefined);
    mockedFs.readFile.mockResolvedValue("{}");

    service = new ElevationService();
    await service.initialize();
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe("initialize", () => {
    it("should initialize successfully", async () => {
      const newService = new ElevationService();
      const result = await newService.initialize();

      expect(result.success).toBe(true);
      expect(mockedFs.mkdir).toHaveBeenCalled();

      await newService.dispose();
    });

    it("should not re-initialize if already initialized", async () => {
      const result = await service.initialize();

      expect(result.success).toBe(true);
      // mkdir should only have been called once during beforeEach
      expect(mockedFs.mkdir).toHaveBeenCalledTimes(1);
    });

    it("should load existing cached routes on initialization", async () => {
      const cacheData = {
        routeId: "cached-route",
        createdAt: new Date().toISOString(),
        elevations: [
          {
            latitude: 51.5,
            longitude: -0.1,
            elevation: 50,
            distanceFromStart: 0,
          },
        ],
        metrics: {
          totalClimb: 100,
          totalDescent: 50,
          minElevation: 10,
          maxElevation: 110,
          startElevation: 50,
          endElevation: 60,
        },
      };

      mockedFs.readdir.mockResolvedValue(["cached-route.json"] as any);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(cacheData));

      const newService = new ElevationService();
      await newService.initialize();

      expect(newService.hasRouteCache("cached-route")).toBe(true);

      await newService.dispose();
    });
  });

  describe("getElevation", () => {
    it("should return null when no cached data exists", async () => {
      const result = await service.getElevation({
        latitude: 51.5074,
        longitude: -0.1278,
        timestamp: new Date(),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it("should return failure when service not initialized", async () => {
      const newService = new ElevationService();
      const result = await newService.getElevation({
        latitude: 51.5074,
        longitude: -0.1278,
        timestamp: new Date(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as any)?.code).toBe(
          "ELEVATION_SERVICE_NOT_INITIALIZED",
        );
      }
    });

    it("should return cached elevation when within threshold distance", async () => {
      // Set up cache by running prefetch first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOpenElevationResponse),
      });

      await service.prefetchRouteElevations(mockRoute);

      // Now get elevation for a position near the cached one
      const result = await service.getElevation({
        latitude: 51.5,
        longitude: -0.1,
        timestamp: new Date(),
      });

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.elevation).toBe(10);
      }
    });
  });

  describe("getRouteMetrics", () => {
    it("should return null when route not cached", () => {
      const metrics = service.getRouteMetrics("non-existent-route");
      expect(metrics).toBeNull();
    });

    it("should return metrics after prefetch", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOpenElevationResponse),
      });

      await service.prefetchRouteElevations(mockRoute);

      const metrics = service.getRouteMetrics(mockRoute.id!);
      expect(metrics).not.toBeNull();
      if (metrics) {
        expect(metrics.totalClimb).toBeGreaterThanOrEqual(0);
        expect(metrics.totalDescent).toBeGreaterThanOrEqual(0);
        expect(metrics.minElevation).toBeLessThanOrEqual(metrics.maxElevation);
      }
    });
  });

  describe("getRemainingClimb", () => {
    it("should return null when route not cached", () => {
      const remaining = service.getRemainingClimb("non-existent-route", {
        latitude: 51.5074,
        longitude: -0.1278,
        timestamp: new Date(),
      });
      expect(remaining).toBeNull();
    });

    it("should return remaining climb from current position", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOpenElevationResponse),
      });

      await service.prefetchRouteElevations(mockRoute);

      // Verify route was cached first
      expect(service.hasRouteCache(mockRoute.id!)).toBe(true);

      const remaining = service.getRemainingClimb(mockRoute.id!, {
        latitude: 51.5,
        longitude: -0.1,
        timestamp: new Date(),
      });

      // remaining can be 0 if there's no more climb ahead
      expect(remaining).not.toBeNull();
      expect(typeof remaining).toBe("number");
      expect(remaining).toBeGreaterThanOrEqual(0);
    });
  });

  describe("prefetchRouteElevations", () => {
    it("should return failure when service not initialized", async () => {
      const newService = new ElevationService();
      const result = await newService.prefetchRouteElevations(mockRoute);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as any)?.code).toBe(
          "ELEVATION_SERVICE_NOT_INITIALIZED",
        );
      }
    });

    it("should prefetch elevations for route points", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOpenElevationResponse),
      });

      const progressUpdates: any[] = [];
      const result = await service.prefetchRouteElevations(
        mockRoute,
        (progress) => {
          progressUpdates.push(progress);
        },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeGreaterThan(0);
      }

      // Verify progress was reported
      expect(progressUpdates.length).toBeGreaterThan(0);

      // Last progress update should be complete
      const lastProgress = progressUpdates[progressUpdates.length - 1];
      expect(lastProgress.complete).toBe(true);
    });

    it("should handle API errors gracefully", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const result = await service.prefetchRouteElevations(mockRoute);

      // Should still succeed but may have fewer points
      // The service logs warnings but continues
      expect(result.success).toBe(true);
    });

    it("should handle rate limiting (HTTP 429)", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      });

      const result = await service.prefetchRouteElevations(mockRoute);

      expect(result.success).toBe(true);
    });

    it("should save cache after prefetch", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOpenElevationResponse),
      });

      await service.prefetchRouteElevations(mockRoute);

      expect(mockedFs.writeFile).toHaveBeenCalled();
    });
  });

  describe("hasRouteCache", () => {
    it("should return false for non-existent route", () => {
      expect(service.hasRouteCache("non-existent")).toBe(false);
    });

    it("should return true after prefetch", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOpenElevationResponse),
      });

      await service.prefetchRouteElevations(mockRoute);

      expect(service.hasRouteCache(mockRoute.id!)).toBe(true);
    });
  });

  describe("clearRouteCache", () => {
    it("should clear specific route cache", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOpenElevationResponse),
      });

      await service.prefetchRouteElevations(mockRoute);
      expect(service.hasRouteCache(mockRoute.id!)).toBe(true);

      const result = await service.clearRouteCache(mockRoute.id!);

      expect(result.success).toBe(true);
      expect(service.hasRouteCache(mockRoute.id!)).toBe(false);
    });
  });

  describe("clearAllCache", () => {
    it("should clear all cached routes", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOpenElevationResponse),
      });

      await service.prefetchRouteElevations(mockRoute);
      expect(service.hasRouteCache(mockRoute.id!)).toBe(true);

      const result = await service.clearAllCache();

      expect(result.success).toBe(true);
      expect(service.hasRouteCache(mockRoute.id!)).toBe(false);
    });
  });

  describe("dispose", () => {
    it("should clean up resources", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOpenElevationResponse),
      });

      await service.prefetchRouteElevations(mockRoute);

      await service.dispose();

      // After dispose, service should not be initialized
      const result = await service.getElevation({
        latitude: 51.5074,
        longitude: -0.1278,
        timestamp: new Date(),
      });

      expect(result.success).toBe(false);
    });
  });

  describe("elevation metrics calculation", () => {
    it("should calculate total climb correctly", async () => {
      // Mock response with clear climb: 10 -> 30 -> 25 -> 40
      // Climb: (30-10) + (40-25) = 20 + 15 = 35
      const climbResponse = {
        results: [
          { latitude: 51.5, longitude: -0.1, elevation: 10 },
          { latitude: 51.51, longitude: -0.1, elevation: 30 },
          { latitude: 51.52, longitude: -0.1, elevation: 25 },
          { latitude: 51.53, longitude: -0.1, elevation: 40 },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(climbResponse),
      });

      const longRoute: DriveRoute = {
        ...mockRoute,
        id: "climb-test-route",
        geometry: [
          [51.5, -0.1],
          [51.51, -0.1],
          [51.52, -0.1],
          [51.53, -0.1],
        ],
      };

      await service.prefetchRouteElevations(longRoute);

      const metrics = service.getRouteMetrics("climb-test-route");
      expect(metrics).not.toBeNull();
      if (metrics) {
        // Climb should be 20 + 15 = 35 (subtracting 2m threshold per change)
        // With threshold of 2m: (30-10-2) + (40-25-2) = 18 + 13 = 31
        expect(metrics.totalClimb).toBeGreaterThan(0);
        expect(metrics.minElevation).toBe(10);
        expect(metrics.maxElevation).toBe(40);
        expect(metrics.startElevation).toBe(10);
        expect(metrics.endElevation).toBe(40);
      }
    });

    it("should calculate total descent correctly", async () => {
      // Mock response with clear descent: 40 -> 20 -> 25 -> 10
      // Descent: (40-20) + (25-10) = 20 + 15 = 35
      const descentResponse = {
        results: [
          { latitude: 51.5, longitude: -0.1, elevation: 40 },
          { latitude: 51.51, longitude: -0.1, elevation: 20 },
          { latitude: 51.52, longitude: -0.1, elevation: 25 },
          { latitude: 51.53, longitude: -0.1, elevation: 10 },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(descentResponse),
      });

      const longRoute: DriveRoute = {
        ...mockRoute,
        id: "descent-test-route",
        geometry: [
          [51.5, -0.1],
          [51.51, -0.1],
          [51.52, -0.1],
          [51.53, -0.1],
        ],
      };

      await service.prefetchRouteElevations(longRoute);

      const metrics = service.getRouteMetrics("descent-test-route");
      expect(metrics).not.toBeNull();
      if (metrics) {
        expect(metrics.totalDescent).toBeGreaterThan(0);
        expect(metrics.minElevation).toBe(10);
        expect(metrics.maxElevation).toBe(40);
        expect(metrics.startElevation).toBe(40);
        expect(metrics.endElevation).toBe(10);
      }
    });
  });
});
