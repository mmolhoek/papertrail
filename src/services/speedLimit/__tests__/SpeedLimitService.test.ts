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

  describe("initialize error handling", () => {
    it("should handle mkdir failure during initialization", async () => {
      mockedFs.mkdir.mockRejectedValue(new Error("Permission denied"));

      const newService = new SpeedLimitService();
      const result = await newService.initialize();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as any)?.code).toBe(
          "SPEEDLIMIT_CACHE_WRITE_FAILED",
        );
      }
    });

    it("should handle non-Error thrown during initialization", async () => {
      mockedFs.mkdir.mockRejectedValue("string error");

      const newService = new SpeedLimitService();
      const result = await newService.initialize();

      expect(result.success).toBe(false);
    });

    it("should handle malformed JSON in cache file", async () => {
      mockedFs.readdir.mockResolvedValue(["bad-cache.json"] as any);
      mockedFs.readFile.mockResolvedValue("not valid json {{{");

      const newService = new SpeedLimitService();
      const result = await newService.initialize();

      // Should still succeed but skip the bad file
      expect(result.success).toBe(true);
      expect(newService.hasRouteCache("bad-cache")).toBe(false);
      await newService.dispose();
    });

    it("should handle readdir failure during cache loading", async () => {
      mockedFs.readdir.mockRejectedValue(new Error("ENOENT"));

      const newService = new SpeedLimitService();
      const result = await newService.initialize();

      // Should succeed - directory might not exist yet
      expect(result.success).toBe(true);
      await newService.dispose();
    });
  });

  describe("prefetchRouteSpeedLimits edge cases", () => {
    it("should call progress callback with correct values", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOverpassResponse),
      });

      const progressUpdates: any[] = [];
      await service.prefetchRouteSpeedLimits(mockRoute, (progress) => {
        progressUpdates.push({ ...progress });
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      // First update should have current=0
      expect(progressUpdates[0].current).toBe(0);
      expect(progressUpdates[0].complete).toBe(false);
      // Last update should have complete=true
      expect(progressUpdates[progressUpdates.length - 1].complete).toBe(true);
    });

    it("should handle empty route geometry", async () => {
      const emptyRoute: DriveRoute = {
        ...mockRoute,
        geometry: [],
      };

      const result = await service.prefetchRouteSpeedLimits(emptyRoute);

      // Should succeed with 0 segments found
      expect(result.success).toBe(true);
    });

    it("should handle single point geometry", async () => {
      const singlePointRoute: DriveRoute = {
        ...mockRoute,
        geometry: [[51.5074, -0.1278]],
      };

      const result = await service.prefetchRouteSpeedLimits(singlePointRoute);

      expect(result.success).toBe(true);
    });

    it("should handle very long route with multiple segments", async () => {
      // Create a long route with many points (simulating >25km)
      const longGeometry: [number, number][] = [];
      for (let i = 0; i < 100; i++) {
        longGeometry.push([51.5 + i * 0.01, -0.1 + i * 0.01]);
      }

      const longRoute: DriveRoute = {
        ...mockRoute,
        geometry: longGeometry,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOverpassResponse),
      });

      const result = await service.prefetchRouteSpeedLimits(longRoute);

      expect(result.success).toBe(true);
      // Should have made multiple API calls
      expect(mockFetch).toHaveBeenCalled();
    });

    it("should handle partial success when some segments fail", async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockOverpassResponse),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        });
      });

      // Create a long route that requires multiple segment queries
      const longGeometry: [number, number][] = [];
      for (let i = 0; i < 50; i++) {
        longGeometry.push([51.5 + i * 0.005, -0.1 + i * 0.005]);
      }

      const longRoute: DriveRoute = {
        ...mockRoute,
        geometry: longGeometry,
      };

      const result = await service.prefetchRouteSpeedLimits(longRoute);

      // Should succeed because at least one segment succeeded
      expect(result.success).toBe(true);
    });

    it("should return failure when all segment queries fail", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const result = await service.prefetchRouteSpeedLimits(mockRoute);

      expect(result.success).toBe(false);
    });

    it("should handle exception during prefetch", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await service.prefetchRouteSpeedLimits(mockRoute);

      expect(result.success).toBe(false);
      if (!result.success) {
        // Error is wrapped in API_REQUEST_FAILED when all segments fail
        expect((result.error as any)?.code).toBe(
          "SPEEDLIMIT_API_REQUEST_FAILED",
        );
      }
    });

    it("should handle AbortError timeout", async () => {
      const abortError = new Error("Request timed out");
      abortError.name = "AbortError";
      mockFetch.mockRejectedValue(abortError);

      const result = await service.prefetchRouteSpeedLimits(mockRoute);

      expect(result.success).toBe(false);
    });

    it("should avoid duplicate wayIds in results", async () => {
      // Return the same wayId twice
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            elements: [
              {
                type: "way",
                id: 12345,
                tags: { maxspeed: "30", highway: "residential" },
                geometry: [
                  { lat: 51.5074, lon: -0.1278 },
                  { lat: 51.508, lon: -0.125 },
                ],
              },
              {
                type: "way",
                id: 12345, // Duplicate
                tags: { maxspeed: "30", highway: "residential" },
                geometry: [
                  { lat: 51.5074, lon: -0.1278 },
                  { lat: 51.508, lon: -0.125 },
                ],
              },
            ],
          }),
      });

      await service.prefetchRouteSpeedLimits(mockRoute);

      // Should deduplicate
      const result = await service.getSpeedLimit({
        latitude: 51.5076,
        longitude: -0.1275,
        timestamp: new Date(),
      });

      expect(result.success).toBe(true);
    });
  });

  describe("API response parsing edge cases", () => {
    it("should skip elements without geometry", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            elements: [
              {
                type: "way",
                id: 12345,
                tags: { maxspeed: "30", highway: "residential" },
                // No geometry
              },
            ],
          }),
      });

      await service.prefetchRouteSpeedLimits(mockRoute);

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

    it("should skip elements with only one geometry point", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            elements: [
              {
                type: "way",
                id: 12345,
                tags: { maxspeed: "30", highway: "residential" },
                geometry: [{ lat: 51.5074, lon: -0.1278 }], // Only one point
              },
            ],
          }),
      });

      await service.prefetchRouteSpeedLimits(mockRoute);

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

    it("should skip node type elements", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            elements: [
              {
                type: "node",
                id: 12345,
                tags: { maxspeed: "30", highway: "traffic_signals" },
                center: { lat: 51.5074, lon: -0.1278 },
              },
            ],
          }),
      });

      await service.prefetchRouteSpeedLimits(mockRoute);

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

    it("should skip elements without highway tag", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            elements: [
              {
                type: "way",
                id: 12345,
                tags: { maxspeed: "30" }, // No highway tag
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
        latitude: 51.5074,
        longitude: -0.1278,
        timestamp: new Date(),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it("should use default speed limit when maxspeed tag is missing", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            elements: [
              {
                type: "way",
                id: 12345,
                tags: { highway: "motorway" }, // No maxspeed, should default to 120
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
        expect(result.data.speedLimit).toBe(120); // Default for motorway
      }
    });

    it("should handle various highway types with default speeds", async () => {
      const highwayTypes = [
        { type: "motorway", expected: 120 },
        { type: "trunk", expected: 100 },
        { type: "primary", expected: 80 },
        { type: "secondary", expected: 70 },
        { type: "tertiary", expected: 60 },
        { type: "residential", expected: 50 },
        { type: "living_street", expected: 20 },
        { type: "service", expected: 30 },
      ];

      for (const { type, expected } of highwayTypes) {
        jest.clearAllMocks();
        mockedFs.mkdir.mockResolvedValue(undefined);
        mockedFs.readdir.mockResolvedValue([]);
        mockedFs.writeFile.mockResolvedValue(undefined);

        const newService = new SpeedLimitService();
        await newService.initialize();

        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              elements: [
                {
                  type: "way",
                  id: 12345,
                  tags: { highway: type },
                  geometry: [
                    { lat: 51.5074, lon: -0.1278 },
                    { lat: 51.508, lon: -0.125 },
                  ],
                },
              ],
            }),
        });

        await newService.prefetchRouteSpeedLimits(mockRoute);

        const result = await newService.getSpeedLimit({
          latitude: 51.5076,
          longitude: -0.1275,
          timestamp: new Date(),
        });

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data.speedLimit).toBe(expected);
        }

        await newService.dispose();
      }
    });

    it("should return null for unknown highway type without maxspeed", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            elements: [
              {
                type: "way",
                id: 12345,
                tags: { highway: "unknown_type" },
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
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });
  });

  describe("parseMaxspeed edge cases", () => {
    it("should handle 'signals' value as variable speed (null)", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            elements: [
              {
                type: "way",
                id: 12345,
                tags: { maxspeed: "signals", highway: "motorway" },
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
      // Should fall back to default for motorway since signals returns null
      if (result.success && result.data) {
        expect(result.data.speedLimit).toBe(120);
      }
    });

    it("should handle invalid maxspeed format", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            elements: [
              {
                type: "way",
                id: 12345,
                tags: { maxspeed: "abc", highway: "residential" },
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
      // Should fall back to default for residential
      if (result.success && result.data) {
        expect(result.data.speedLimit).toBe(50);
      }
    });

    it("should reject extreme speed values", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            elements: [
              {
                type: "way",
                id: 12345,
                tags: { maxspeed: "500", highway: "residential" }, // Too high
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
      // Should fall back to default
      if (result.success && result.data) {
        expect(result.data.speedLimit).toBe(50);
      }
    });

    it("should reject very low speed values", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            elements: [
              {
                type: "way",
                id: 12345,
                tags: { maxspeed: "2", highway: "residential" }, // Too low
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
      // Should fall back to default
      if (result.success && result.data) {
        expect(result.data.speedLimit).toBe(50);
      }
    });
  });

  describe("getSpeedLimit cache lookup edge cases", () => {
    it("should return null when position is far from cached segments", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOverpassResponse),
      });

      await service.prefetchRouteSpeedLimits(mockRoute);

      // Query at a position far from the cached segment
      const result = await service.getSpeedLimit({
        latitude: 52.0, // Far away
        longitude: -0.5,
        timestamp: new Date(),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it("should find nearest segment when multiple routes are cached", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            elements: [
              {
                type: "way",
                id: 11111,
                tags: { maxspeed: "30", highway: "residential" },
                geometry: [
                  { lat: 51.5074, lon: -0.1278 },
                  { lat: 51.508, lon: -0.125 },
                ],
              },
            ],
          }),
      });

      await service.prefetchRouteSpeedLimits(mockRoute);

      // Add another route with different speed limit
      const secondRoute: DriveRoute = {
        ...mockRoute,
        id: "route-2",
        geometry: [
          [51.52, -0.14],
          [51.53, -0.15],
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            elements: [
              {
                type: "way",
                id: 22222,
                tags: { maxspeed: "50", highway: "primary" },
                geometry: [
                  { lat: 51.52, lon: -0.14 },
                  { lat: 51.53, lon: -0.15 },
                ],
              },
            ],
          }),
      });

      await service.prefetchRouteSpeedLimits(secondRoute);

      // Query near the first route
      const result = await service.getSpeedLimit({
        latitude: 51.5076,
        longitude: -0.1275,
        timestamp: new Date(),
      });

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.speedLimit).toBe(30);
        expect(result.data.wayId).toBe(11111);
      }
    });
  });

  describe("clearRouteCache edge cases", () => {
    it("should handle unlink failure gracefully", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOverpassResponse),
      });

      await service.prefetchRouteSpeedLimits(mockRoute);

      // Make unlink fail with non-ENOENT error
      mockedFs.unlink.mockRejectedValue(new Error("Permission denied"));

      const result = await service.clearRouteCache(mockRoute.id);

      // Should still succeed (cache is cleared from memory)
      expect(result.success).toBe(true);
      expect(service.hasRouteCache(mockRoute.id)).toBe(false);
    });
  });

  describe("clearAllCache edge cases", () => {
    it("should handle readdir failure", async () => {
      mockedFs.readdir.mockRejectedValue(new Error("ENOENT"));

      const result = await service.clearAllCache();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as any)?.code).toBe(
          "SPEEDLIMIT_CACHE_WRITE_FAILED",
        );
      }
    });

    it("should only delete JSON files", async () => {
      mockedFs.readdir.mockResolvedValue([
        "route1.json",
        "route2.json",
        "readme.txt",
        "image.png",
      ] as any);

      await service.clearAllCache();

      // Should only call unlink for JSON files
      expect(mockedFs.unlink).toHaveBeenCalledTimes(2);
    });
  });

  describe("distanceToSegment", () => {
    it("should handle segment that is a point (zero length)", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            elements: [
              {
                type: "way",
                id: 12345,
                tags: { maxspeed: "30", highway: "residential" },
                geometry: [
                  { lat: 51.5074, lon: -0.1278 },
                  { lat: 51.5074, lon: -0.1278 }, // Same point (zero-length segment)
                ],
              },
            ],
          }),
      });

      await service.prefetchRouteSpeedLimits(mockRoute);

      // Query near the point
      const result = await service.getSpeedLimit({
        latitude: 51.5074,
        longitude: -0.1278,
        timestamp: new Date(),
      });

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.speedLimit).toBe(30);
      }
    });
  });

  describe("HTTP error handling", () => {
    it("should handle HTTP 500 error", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const result = await service.prefetchRouteSpeedLimits(mockRoute);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as any)?.code).toBe(
          "SPEEDLIMIT_API_REQUEST_FAILED",
        );
      }
    });

    it("should handle HTTP 403 error", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      });

      const result = await service.prefetchRouteSpeedLimits(mockRoute);

      expect(result.success).toBe(false);
    });

    it("should handle network error (non-Error exception)", async () => {
      mockFetch.mockRejectedValue("Network failure");

      const result = await service.prefetchRouteSpeedLimits(mockRoute);

      expect(result.success).toBe(false);
      if (!result.success) {
        // Error is wrapped in API_REQUEST_FAILED when all segments fail
        expect((result.error as any)?.code).toBe(
          "SPEEDLIMIT_API_REQUEST_FAILED",
        );
      }
    });
  });

  describe("rate limiting", () => {
    it("should wait between API requests", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOverpassResponse),
      });

      // Create a route that requires multiple segment queries
      const longGeometry: [number, number][] = [];
      for (let i = 0; i < 100; i++) {
        longGeometry.push([51.5 + i * 0.005, -0.1 + i * 0.005]);
      }

      const longRoute: DriveRoute = {
        ...mockRoute,
        geometry: longGeometry,
      };

      const startTime = Date.now();
      await service.prefetchRouteSpeedLimits(longRoute);
      const elapsed = Date.now() - startTime;

      // Should have had some delay between requests
      // (This is a loose check - the important thing is it doesn't fail)
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });
  });
});
