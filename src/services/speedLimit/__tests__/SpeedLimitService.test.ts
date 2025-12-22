/* eslint-disable @typescript-eslint/no-explicit-any */
import { SpeedLimitService } from "../SpeedLimitService";
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

describe("SpeedLimitService", () => {
  let service: SpeedLimitService;

  const mockRoute: DriveRoute = {
    id: "test-route-1",
    destination: "Test Destination",
    createdAt: new Date(),
    startPoint: { latitude: 51.5074, longitude: -0.1278 },
    endPoint: { latitude: 51.51, longitude: -0.12 },
    waypoints: [],
    geometry: [
      [51.5074, -0.1278],
      [51.508, -0.125],
      [51.51, -0.12],
    ],
    totalDistance: 1000,
    estimatedTime: 120,
  };

  const mockOverpassResponse = {
    elements: [
      {
        type: "way",
        id: 12345,
        tags: {
          maxspeed: "30",
          name: "Test Street",
          highway: "residential",
        },
        geometry: [
          { lat: 51.5074, lon: -0.1278 },
          { lat: 51.508, lon: -0.125 },
        ],
      },
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

    service = new SpeedLimitService();
    await service.initialize();
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe("initialize", () => {
    it("should initialize successfully", async () => {
      const newService = new SpeedLimitService();
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
        segments: [
          {
            start: { latitude: 51.5, longitude: -0.1 },
            end: { latitude: 51.51, longitude: -0.11 },
            speedLimit: 50,
            wayId: 99999,
            roadName: "Cached Road",
          },
        ],
      };

      mockedFs.readdir.mockResolvedValue(["cached-route.json"] as any);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(cacheData));

      const newService = new SpeedLimitService();
      await newService.initialize();

      expect(newService.hasRouteCache("cached-route")).toBe(true);

      await newService.dispose();
    });
  });

  describe("getSpeedLimit", () => {
    it("should return null when no cached data exists", async () => {
      const result = await service.getSpeedLimit({
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
      const newService = new SpeedLimitService();
      const result = await newService.getSpeedLimit({
        latitude: 51.5074,
        longitude: -0.1278,
        timestamp: new Date(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as any)?.code).toBe(
          "SPEEDLIMIT_SERVICE_NOT_INITIALIZED",
        );
      }
    });

    it("should return cached speed limit when data exists nearby", async () => {
      // First prefetch some data
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOverpassResponse),
      });

      await service.prefetchRouteSpeedLimits(mockRoute);

      // Query at the midpoint of the cached segment (51.5077, -0.1264)
      // The segment is from (51.5074, -0.1278) to (51.508, -0.125)
      const result = await service.getSpeedLimit({
        latitude: 51.5077,
        longitude: -0.1264,
        timestamp: new Date(),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toBeNull();
        expect(result.data?.speedLimit).toBe(30);
        expect(result.data?.wayId).toBe(12345);
      }
    });
  });

  describe("prefetchRouteSpeedLimits", () => {
    it("should prefetch speed limits along a route", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOverpassResponse),
      });

      const result = await service.prefetchRouteSpeedLimits(mockRoute);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeGreaterThanOrEqual(0);
      }
      expect(service.hasRouteCache(mockRoute.id)).toBe(true);
    });

    it("should return failure when service not initialized", async () => {
      const newService = new SpeedLimitService();
      const result = await newService.prefetchRouteSpeedLimits(mockRoute);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as any)?.code).toBe(
          "SPEEDLIMIT_SERVICE_NOT_INITIALIZED",
        );
      }
    });

    it("should handle API rate limiting gracefully", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
      });

      const result = await service.prefetchRouteSpeedLimits(mockRoute);

      // Should return failure when all segment queries fail
      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as any)?.code).toBe(
          "SPEEDLIMIT_API_REQUEST_FAILED",
        );
      }
    });

    it("should save cache to disk after prefetching", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOverpassResponse),
      });

      await service.prefetchRouteSpeedLimits(mockRoute);

      expect(mockedFs.writeFile).toHaveBeenCalled();
    });
  });

  describe("hasRouteCache", () => {
    it("should return false for uncached routes", () => {
      expect(service.hasRouteCache("non-existent-route")).toBe(false);
    });

    it("should return true for cached routes", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOverpassResponse),
      });

      await service.prefetchRouteSpeedLimits(mockRoute);

      expect(service.hasRouteCache(mockRoute.id)).toBe(true);
    });
  });

  describe("clearRouteCache", () => {
    it("should clear cache for a specific route", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOverpassResponse),
      });

      await service.prefetchRouteSpeedLimits(mockRoute);
      expect(service.hasRouteCache(mockRoute.id)).toBe(true);

      const result = await service.clearRouteCache(mockRoute.id);

      expect(result.success).toBe(true);
      expect(service.hasRouteCache(mockRoute.id)).toBe(false);
    });
  });

  describe("clearAllCache", () => {
    it("should clear all cached routes", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOverpassResponse),
      });

      await service.prefetchRouteSpeedLimits(mockRoute);
      expect(service.hasRouteCache(mockRoute.id)).toBe(true);

      const result = await service.clearAllCache();

      expect(result.success).toBe(true);
      expect(service.hasRouteCache(mockRoute.id)).toBe(false);
    });
  });

  describe("parseMaxspeed", () => {
    // Test various maxspeed tag formats
    const testCases = [
      { input: "50", expected: 50 },
      { input: "30", expected: 30 },
      { input: "30 mph", expected: 48 }, // 30 * 1.60934 ≈ 48
      { input: "50 km/h", expected: 50 },
      { input: "walk", expected: 5 },
      { input: "none", expected: 999 },
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should parse maxspeed "${input}" as ${expected} km/h`, async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              elements: [
                {
                  type: "way",
                  id: 12345,
                  tags: { maxspeed: input, highway: "residential" },
                  geometry: [
                    { lat: 51.5074, lon: -0.1278 },
                    { lat: 51.508, lon: -0.125 },
                  ],
                },
              ],
            }),
        });

        await service.prefetchRouteSpeedLimits(mockRoute);

        const result = await service.getSpeedLimit({
          latitude: 51.5076,
          longitude: -0.1275,
          timestamp: new Date(),
        });

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data.speedLimit).toBe(expected);
        }
      });
    });
  });

  describe("dispose", () => {
    it("should clean up resources", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOverpassResponse),
      });

      await service.prefetchRouteSpeedLimits(mockRoute);
      expect(service.hasRouteCache(mockRoute.id)).toBe(true);

      await service.dispose();

      // After dispose, cache should be cleared
      expect(service.hasRouteCache(mockRoute.id)).toBe(false);
    });
  });
});
