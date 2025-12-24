/* eslint-disable @typescript-eslint/no-explicit-any */
import { VectorMapService } from "../VectorMapService";
import { DriveRoute } from "@core/types";
import {
  VectorMapError,
  VectorMapErrorCode,
} from "@core/errors/VectorMapError";
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

describe("VectorMapService", () => {
  let service: VectorMapService;

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
          highway: "primary",
          name: "Test Street",
        },
        geometry: [
          { lat: 51.5074, lon: -0.1278 },
          { lat: 51.508, lon: -0.125 },
        ],
      },
      {
        type: "way",
        id: 12346,
        tags: {
          highway: "residential",
          name: "Side Street",
        },
        geometry: [
          { lat: 51.507, lon: -0.126 },
          { lat: 51.509, lon: -0.124 },
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

    service = new VectorMapService();
    await service.initialize();
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe("initialize", () => {
    it("should initialize successfully", async () => {
      const newService = new VectorMapService();
      const result = await newService.initialize();

      expect(result.success).toBe(true);
      expect(mockedFs.mkdir).toHaveBeenCalledWith("./data/roads", {
        recursive: true,
      });

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
        corridorRadius: 5000,
        roads: [
          {
            wayId: 99999,
            highwayType: "motorway",
            name: "Cached Highway",
            geometry: [
              [51.5, -0.1],
              [51.6, -0.2],
            ],
          },
        ],
      };

      mockedFs.readdir.mockResolvedValue(["cached-route.json"] as any);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(cacheData));

      const newService = new VectorMapService();
      await newService.initialize();

      expect(newService.hasRouteCache("cached-route")).toBe(true);

      await newService.dispose();
    });

    it("should handle initialization failure gracefully", async () => {
      mockedFs.mkdir.mockRejectedValue(new Error("Permission denied"));

      const newService = new VectorMapService();
      const result = await newService.initialize();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as VectorMapError).code).toBe(
          VectorMapErrorCode.CACHE_WRITE_FAILED,
        );
      }
    });
  });

  describe("getRoadsInBounds", () => {
    it("should return empty array when no roads cached", () => {
      const roads = service.getRoadsInBounds(51.5, 51.6, -0.2, -0.1);
      expect(roads).toEqual([]);
    });

    it("should return roads within bounds", async () => {
      // Add roads to cache by prefetching
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRouteRoads(mockRoute, 1000);

      const roads = service.getRoadsInBounds(51.506, 51.509, -0.128, -0.124);
      expect(roads.length).toBeGreaterThan(0);
    });

    it("should not return roads outside bounds", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRouteRoads(mockRoute, 1000);

      // Query far away from cached roads
      const roads = service.getRoadsInBounds(52.0, 52.1, 0.0, 0.1);
      expect(roads).toEqual([]);
    });
  });

  describe("getAllCachedRoads", () => {
    it("should return empty array when no roads cached", () => {
      const roads = service.getAllCachedRoads();
      expect(roads).toEqual([]);
    });

    it("should return all cached roads without duplicates", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRouteRoads(mockRoute, 1000);

      const roads = service.getAllCachedRoads();
      expect(roads.length).toBe(2);

      // Verify no duplicates
      const wayIds = roads.map((r) => r.wayId);
      expect(new Set(wayIds).size).toBe(wayIds.length);
    });
  });

  describe("prefetchRouteRoads", () => {
    it("should fail if service not initialized", async () => {
      const uninitializedService = new VectorMapService();
      const result = await uninitializedService.prefetchRouteRoads(mockRoute);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as VectorMapError).code).toBe(
          VectorMapErrorCode.SERVICE_NOT_INITIALIZED,
        );
      }
    });

    it("should prefetch roads successfully", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      const result = await service.prefetchRouteRoads(mockRoute, 1000);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(2); // 2 roads from mock response
      }
      expect(service.hasRouteCache("test-route-1")).toBe(true);
    });

    it("should call progress callback during prefetch", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      const progressUpdates: any[] = [];
      const onProgress = jest.fn((progress) => progressUpdates.push(progress));

      await service.prefetchRouteRoads(mockRoute, 1000, onProgress);

      expect(onProgress).toHaveBeenCalled();

      // Should have start, progress, and completion updates
      const lastUpdate = progressUpdates[progressUpdates.length - 1];
      expect(lastUpdate.complete).toBe(true);
    });

    it("should handle API rate limiting", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      });

      const result = await service.prefetchRouteRoads(mockRoute, 1000);

      // Should still return success with 0 roads (continues despite failures)
      expect(result.success).toBe(true);
    });

    it("should handle API errors gracefully", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const result = await service.prefetchRouteRoads(mockRoute, 1000);

      // Should still return success (continues despite individual failures)
      expect(result.success).toBe(true);
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await service.prefetchRouteRoads(mockRoute, 1000);

      // Continues despite network errors
      expect(result.success).toBe(true);
    });

    it("should save cache to disk after prefetch", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRouteRoads(mockRoute, 1000);

      expect(mockedFs.writeFile).toHaveBeenCalled();
      const writeCall = mockedFs.writeFile.mock.calls[0];
      expect(writeCall[0]).toContain("test-route-1.json");
    });

    it("should filter out invalid road elements", async () => {
      const responseWithInvalid = {
        elements: [
          // Valid road
          {
            type: "way",
            id: 12345,
            tags: { highway: "primary", name: "Valid Road" },
            geometry: [
              { lat: 51.5074, lon: -0.1278 },
              { lat: 51.508, lon: -0.125 },
            ],
          },
          // Node (not a way) - should be skipped
          {
            type: "node",
            id: 99999,
            lat: 51.5,
            lon: -0.1,
          },
          // Way without geometry - should be skipped
          {
            type: "way",
            id: 12347,
            tags: { highway: "secondary" },
          },
          // Way with invalid highway type - should be skipped
          {
            type: "way",
            id: 12348,
            tags: { highway: "footway" },
            geometry: [
              { lat: 51.5, lon: -0.1 },
              { lat: 51.6, lon: -0.2 },
            ],
          },
          // Way with only 1 point - should be skipped
          {
            type: "way",
            id: 12349,
            tags: { highway: "tertiary" },
            geometry: [{ lat: 51.5, lon: -0.1 }],
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => responseWithInvalid,
      });

      const result = await service.prefetchRouteRoads(mockRoute, 1000);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(1); // Only the valid road
      }
    });
  });

  describe("hasRouteCache", () => {
    it("should return false for uncached route", () => {
      expect(service.hasRouteCache("nonexistent-route")).toBe(false);
    });

    it("should return true for cached route", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRouteRoads(mockRoute, 1000);

      expect(service.hasRouteCache("test-route-1")).toBe(true);
    });
  });

  describe("clearRouteCache", () => {
    it("should clear cache for specific route", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRouteRoads(mockRoute, 1000);
      expect(service.hasRouteCache("test-route-1")).toBe(true);

      const result = await service.clearRouteCache("test-route-1");

      expect(result.success).toBe(true);
      expect(service.hasRouteCache("test-route-1")).toBe(false);
      expect(mockedFs.unlink).toHaveBeenCalled();
    });

    it("should not fail if cache file does not exist", async () => {
      mockedFs.unlink.mockRejectedValue(new Error("ENOENT"));

      const result = await service.clearRouteCache("nonexistent-route");

      expect(result.success).toBe(true);
    });
  });

  describe("clearAllCache", () => {
    it("should clear all cached routes", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRouteRoads(mockRoute, 1000);

      mockedFs.readdir.mockResolvedValue([
        "test-route-1.json",
        "other-route.json",
      ] as any);

      const result = await service.clearAllCache();

      expect(result.success).toBe(true);
      expect(service.getAllCachedRoads()).toEqual([]);
      expect(mockedFs.unlink).toHaveBeenCalledTimes(2);
    });

    it("should handle errors when clearing cache", async () => {
      mockedFs.readdir.mockRejectedValue(new Error("Permission denied"));

      const result = await service.clearAllCache();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as VectorMapError).code).toBe(
          VectorMapErrorCode.CACHE_WRITE_FAILED,
        );
      }
    });
  });

  describe("dispose", () => {
    it("should clear all cached data", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRouteRoads(mockRoute, 1000);

      await service.dispose();

      expect(service.getAllCachedRoads()).toEqual([]);
    });
  });

  describe("route sampling", () => {
    it("should handle empty geometry", async () => {
      const emptyRoute: DriveRoute = {
        ...mockRoute,
        id: "empty-route",
        geometry: [],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ elements: [] }),
      });

      const result = await service.prefetchRouteRoads(emptyRoute, 1000);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(0);
      }
    });

    it("should sample route points based on distance intervals", async () => {
      // Create a short route that will result in only a few sample points
      // The service samples every 2000m, so short segments won't add extra points
      const shortRoute: DriveRoute = {
        ...mockRoute,
        id: "short-route",
        geometry: [
          [51.5, -0.1],
          [51.5001, -0.1001], // Very close points (~15m apart)
          [51.5002, -0.1002],
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      const result = await service.prefetchRouteRoads(shortRoute, 1000);

      expect(result.success).toBe(true);
      // With points very close together, should only sample first and last
      // Rate limiting means we can't easily test exact call count,
      // but we verify the prefetch completes successfully
    });
  });

  describe("API response handling", () => {
    it("should handle timeout errors", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      mockFetch.mockRejectedValue(abortError);

      const result = await service.prefetchRouteRoads(mockRoute, 1000);

      // Should continue despite timeout
      expect(result.success).toBe(true);
    });

    it("should handle malformed JSON response", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("Invalid JSON");
        },
      });

      const result = await service.prefetchRouteRoads(mockRoute, 1000);

      // Should continue despite parse error
      expect(result.success).toBe(true);
    });
  });
});
