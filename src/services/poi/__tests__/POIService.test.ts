/* eslint-disable @typescript-eslint/no-explicit-any */
import { POIService } from "../POIService";
import { DriveRoute } from "@core/types";
import { POICategory } from "@core/interfaces";
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

describe("POIService", () => {
  let service: POIService;

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
        type: "node",
        id: 12345,
        lat: 51.5075,
        lon: -0.1279,
        tags: {
          amenity: "fuel",
          name: "Test Fuel Station",
        },
      },
      {
        type: "node",
        id: 12346,
        lat: 51.5076,
        lon: -0.128,
        tags: {
          amenity: "parking",
          name: "Test Parking",
        },
      },
      {
        type: "node",
        id: 12347,
        lat: 51.5077,
        lon: -0.1281,
        tags: {
          amenity: "restaurant",
          name: "Test Restaurant",
        },
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

    service = new POIService();
    await service.initialize();
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe("initialize", () => {
    it("should initialize successfully", async () => {
      const newService = new POIService();
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
        pois: [
          {
            id: 111,
            category: "fuel" as POICategory,
            name: "Cached Fuel",
            latitude: 51.5,
            longitude: -0.1,
          },
        ],
      };

      mockedFs.readdir.mockResolvedValue(["cached-route.json"] as any);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(cacheData));

      const newService = new POIService();
      await newService.initialize();

      expect(newService.hasRouteCache("cached-route")).toBe(true);

      await newService.dispose();
    });
  });

  describe("getNearbyPOIs", () => {
    it("should return empty array when not initialized", async () => {
      const newService = new POIService();
      const result = await newService.getNearbyPOIs({
        latitude: 51.5074,
        longitude: -0.1278,
        altitude: 10,
        timestamp: new Date(),
      });

      expect(result.success).toBe(false);
    });

    it("should return empty array when no cached POIs", async () => {
      const result = await service.getNearbyPOIs({
        latitude: 51.5074,
        longitude: -0.1278,
        altitude: 10,
        timestamp: new Date(),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });

    it("should return nearby POIs from cache", async () => {
      // First, populate the cache via prefetch
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      const categories: POICategory[] = ["fuel", "parking", "food"];
      await service.prefetchRoutePOIs(mockRoute, categories);

      // Now query for nearby POIs
      const result = await service.getNearbyPOIs(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        categories,
        5000,
        10,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBeGreaterThan(0);
      }
    });

    it("should filter by category", async () => {
      // First, populate the cache
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      const allCategories: POICategory[] = ["fuel", "parking", "food"];
      await service.prefetchRoutePOIs(mockRoute, allCategories);

      // Query for only fuel stations
      const result = await service.getNearbyPOIs(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        ["fuel"],
        5000,
        10,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        result.data.forEach((poi) => {
          expect(poi.codeLetter).toBe("F");
        });
      }
    });
  });

  describe("getNearestPOI", () => {
    it("should return null when no POIs found", async () => {
      const result = await service.getNearestPOI(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        "fuel",
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it("should return the nearest POI of a category", async () => {
      // Populate cache
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRoutePOIs(mockRoute, ["fuel"]);

      const result = await service.getNearestPOI(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        "fuel",
      );

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.codeLetter).toBe("F");
      }
    });
  });

  describe("prefetchRoutePOIs", () => {
    it("should prefetch POIs along a route", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      const categories: POICategory[] = ["fuel", "parking"];
      const result = await service.prefetchRoutePOIs(mockRoute, categories);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeGreaterThanOrEqual(0);
      }
      expect(service.hasRouteCache(mockRoute.id)).toBe(true);
    });

    it("should report progress during prefetch", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      const progressUpdates: any[] = [];
      const categories: POICategory[] = ["fuel"];

      await service.prefetchRoutePOIs(mockRoute, categories, (progress) => {
        progressUpdates.push({ ...progress });
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      // Last update should be complete
      expect(progressUpdates[progressUpdates.length - 1].complete).toBe(true);
    });

    it("should return 0 when no categories specified", async () => {
      const result = await service.prefetchRoutePOIs(mockRoute, []);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(0);
      }
    });

    it("should handle API errors gracefully", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const result = await service.prefetchRoutePOIs(mockRoute, ["fuel"]);

      // Single route query: API error means failure
      expect(result.success).toBe(false);
    });

    it("should handle rate limiting", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
      });

      const result = await service.prefetchRoutePOIs(mockRoute, ["fuel"]);

      // Rate limiting returns failure
      expect(result.success).toBe(false);
    });
  });

  describe("hasRouteCache", () => {
    it("should return false for uncached routes", () => {
      expect(service.hasRouteCache("nonexistent-route")).toBe(false);
    });

    it("should return true for cached routes", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRoutePOIs(mockRoute, ["fuel"]);

      expect(service.hasRouteCache(mockRoute.id)).toBe(true);
    });
  });

  describe("clearRouteCache", () => {
    it("should clear cache for a specific route", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRoutePOIs(mockRoute, ["fuel"]);
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
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRoutePOIs(mockRoute, ["fuel"]);

      const result = await service.clearAllCache();

      expect(result.success).toBe(true);
      expect(service.hasRouteCache(mockRoute.id)).toBe(false);
    });
  });

  describe("dispose", () => {
    it("should clean up resources", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRoutePOIs(mockRoute, ["fuel"]);
      expect(service.hasRouteCache(mockRoute.id)).toBe(true);

      await service.dispose();

      expect(service.hasRouteCache(mockRoute.id)).toBe(false);
    });
  });

  describe("initialization error handling", () => {
    it("should return failure when mkdir fails", async () => {
      mockedFs.mkdir.mockRejectedValue(new Error("Permission denied"));

      const newService = new POIService();
      const result = await newService.initialize();

      expect(result.success).toBe(false);
    });

    it("should handle corrupted cache files gracefully", async () => {
      mockedFs.readdir.mockResolvedValue(["corrupted.json"] as any);
      mockedFs.readFile.mockResolvedValue("not valid json{{{");

      const newService = new POIService();
      const result = await newService.initialize();

      // Should still initialize successfully, just skip the corrupted file
      expect(result.success).toBe(true);
      await newService.dispose();
    });

    it("should handle readdir failure during cache loading", async () => {
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.readdir.mockRejectedValue(new Error("ENOENT"));

      const newService = new POIService();
      const result = await newService.initialize();

      // Should still succeed - directory might not exist yet
      expect(result.success).toBe(true);
      await newService.dispose();
    });
  });

  describe("getNearbyPOIs with route context", () => {
    it("should filter POIs by route proximity", async () => {
      // Create POIs at various distances from the route
      const responseWithRoutePOIs = {
        elements: [
          {
            type: "node",
            id: 1,
            lat: 51.5075, // Close to route
            lon: -0.1279,
            tags: { amenity: "fuel", name: "On Route Fuel" },
          },
          {
            type: "node",
            id: 2,
            lat: 51.6, // Far from route
            lon: -0.2,
            tags: { amenity: "fuel", name: "Far Fuel" },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => responseWithRoutePOIs,
      });

      await service.prefetchRoutePOIs(mockRoute, ["fuel"]);

      const result = await service.getNearbyPOIs(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        ["fuel"],
        10000,
        10,
        {
          geometry: mockRoute.geometry,
          maxDistanceToRoute: 200,
          distanceFromStart: 0,
        },
      );

      expect(result.success).toBe(true);
    });

    it("should calculate distanceAlongRoute for POIs", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRoutePOIs(mockRoute, ["fuel"]);

      const result = await service.getNearbyPOIs(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        ["fuel"],
        5000,
        10,
        {
          geometry: mockRoute.geometry,
          distanceFromStart: 100,
        },
      );

      expect(result.success).toBe(true);
      if (result.success && result.data.length > 0) {
        // POI should have route context data
        expect(result.data[0].distanceToRoute).toBeDefined();
      }
    });

    it("should handle route with insufficient points", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRoutePOIs(mockRoute, ["fuel"]);

      // Route with only 1 point - should fall back to crow-fly distance
      const result = await service.getNearbyPOIs(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        ["fuel"],
        5000,
        10,
        {
          geometry: [[51.5074, -0.1278]], // Only one point
        },
      );

      expect(result.success).toBe(true);
    });

    it("should deduplicate POIs from multiple route caches", async () => {
      // Prefetch same route twice with different IDs
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRoutePOIs(mockRoute, ["fuel"]);
      await service.prefetchRoutePOIs({ ...mockRoute, id: "test-route-2" }, [
        "fuel",
      ]);

      const result = await service.getNearbyPOIs(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        ["fuel"],
        5000,
        10,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Should deduplicate by ID
        const ids = result.data.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    });
  });

  describe("getNearestPOI error handling", () => {
    it("should propagate errors from getNearbyPOIs", async () => {
      const newService = new POIService();
      // Not initialized

      const result = await newService.getNearestPOI(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        "fuel",
      );

      expect(result.success).toBe(false);
    });
  });

  describe("prefetchRoutePOIs edge cases", () => {
    it("should fail when service not initialized", async () => {
      const newService = new POIService();
      const result = await newService.prefetchRoutePOIs(mockRoute, ["fuel"]);

      expect(result.success).toBe(false);
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await service.prefetchRoutePOIs(mockRoute, ["fuel"]);

      expect(result.success).toBe(false);
    });

    it("should handle AbortError (timeout)", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      mockFetch.mockRejectedValue(abortError);

      const result = await service.prefetchRoutePOIs(mockRoute, ["fuel"]);

      expect(result.success).toBe(false);
    });

    it("should handle long routes with multiple segments", async () => {
      // Create a long route that will be split into segments
      const longGeometry: [number, number][] = [];
      for (let i = 0; i < 100; i++) {
        longGeometry.push([51.5 + i * 0.01, -0.1 + i * 0.01]);
      }

      const longRoute: DriveRoute = {
        ...mockRoute,
        id: "long-route",
        geometry: longGeometry,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      const result = await service.prefetchRoutePOIs(longRoute, ["fuel"]);

      expect(result.success).toBe(true);
    });

    it("should save cache to disk after prefetch", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRoutePOIs(mockRoute, ["fuel"]);

      expect(mockedFs.writeFile).toHaveBeenCalled();
    });

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

      const result = await service.prefetchRoutePOIs(emptyRoute, ["fuel"]);

      expect(result.success).toBe(true);
    });
  });

  describe("clearRouteCache error handling", () => {
    it("should handle unlink errors gracefully", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRoutePOIs(mockRoute, ["fuel"]);

      // unlink fails but catch should handle it
      mockedFs.unlink.mockRejectedValue(new Error("Permission denied"));

      const result = await service.clearRouteCache(mockRoute.id);

      // Should still succeed (ignores file errors)
      expect(result.success).toBe(true);
    });
  });

  describe("clearAllCache error handling", () => {
    it("should delete all JSON files in cache directory", async () => {
      mockedFs.readdir.mockResolvedValue([
        "route1.json",
        "route2.json",
        "not-a-json.txt",
      ] as any);

      const result = await service.clearAllCache();

      expect(result.success).toBe(true);
      // Should only unlink .json files
      expect(mockedFs.unlink).toHaveBeenCalledTimes(2);
    });

    it("should return failure when readdir fails", async () => {
      mockedFs.readdir.mockRejectedValue(new Error("Permission denied"));

      const result = await service.clearAllCache();

      expect(result.success).toBe(false);
    });
  });

  describe("Overpass response parsing", () => {
    it("should handle way elements with center coordinates", async () => {
      const responseWithWay = {
        elements: [
          {
            type: "way",
            id: 99999,
            center: { lat: 51.5074, lon: -0.1278 },
            tags: { amenity: "fuel", name: "Way Fuel Station" },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => responseWithWay,
      });

      await service.prefetchRoutePOIs(mockRoute, ["fuel"]);

      const result = await service.getNearbyPOIs(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        ["fuel"],
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(1);
        expect(result.data[0].name).toBe("Way Fuel Station");
      }
    });

    it("should skip elements without coordinates", async () => {
      const responseWithMissingCoords = {
        elements: [
          {
            type: "node",
            id: 11111,
            // lat and lon are missing
            tags: { amenity: "fuel", name: "No Coords" },
          },
          {
            type: "way",
            id: 22222,
            // center is missing
            tags: { amenity: "fuel", name: "No Center" },
          },
          {
            type: "node",
            id: 33333,
            lat: 51.5074,
            lon: -0.1278,
            tags: { amenity: "fuel", name: "Valid Station" },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => responseWithMissingCoords,
      });

      await service.prefetchRoutePOIs(mockRoute, ["fuel"]);

      const result = await service.getNearbyPOIs(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        ["fuel"],
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(1);
        expect(result.data[0].name).toBe("Valid Station");
      }
    });

    it("should skip elements without matching tags", async () => {
      const responseWithNoTags = {
        elements: [
          {
            type: "node",
            id: 11111,
            lat: 51.5074,
            lon: -0.1278,
            // tags is missing
          },
          {
            type: "node",
            id: 22222,
            lat: 51.5075,
            lon: -0.1279,
            tags: { highway: "bus_stop" }, // Wrong tag type
          },
          {
            type: "node",
            id: 33333,
            lat: 51.5076,
            lon: -0.128,
            tags: { amenity: "fuel", name: "Valid" },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => responseWithNoTags,
      });

      await service.prefetchRoutePOIs(mockRoute, ["fuel"]);

      const result = await service.getNearbyPOIs(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        ["fuel"],
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(1);
      }
    });

    it("should handle POIs without names", async () => {
      const responseWithoutName = {
        elements: [
          {
            type: "node",
            id: 12345,
            lat: 51.5074,
            lon: -0.1278,
            tags: { amenity: "fuel" }, // No name tag
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => responseWithoutName,
      });

      await service.prefetchRoutePOIs(mockRoute, ["fuel"]);

      const result = await service.getNearbyPOIs(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        ["fuel"],
      );

      expect(result.success).toBe(true);
      if (result.success && result.data.length > 0) {
        expect(result.data[0].name).toBeUndefined();
      }
    });
  });

  describe("all food types", () => {
    it("should correctly identify cafe", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          elements: [
            {
              type: "node",
              id: 1,
              lat: 51.5074,
              lon: -0.1278,
              tags: { amenity: "cafe", name: "Coffee Shop" },
            },
          ],
        }),
      });

      await service.prefetchRoutePOIs(mockRoute, ["food"]);

      const result = await service.getNearbyPOIs(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        ["food"],
      );

      expect(result.success).toBe(true);
      if (result.success && result.data.length > 0) {
        expect(result.data[0].codeLetter).toBe("E"); // E for Eat
      }
    });

    it("should correctly identify fast_food", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          elements: [
            {
              type: "node",
              id: 1,
              lat: 51.5074,
              lon: -0.1278,
              tags: { amenity: "fast_food", name: "Burger Place" },
            },
          ],
        }),
      });

      await service.prefetchRoutePOIs(mockRoute, ["food"]);

      const result = await service.getNearbyPOIs(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        ["food"],
      );

      expect(result.success).toBe(true);
      if (result.success && result.data.length > 0) {
        expect(result.data[0].codeLetter).toBe("E");
      }
    });
  });

  describe("charging stations", () => {
    it("should correctly identify charging stations", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          elements: [
            {
              type: "node",
              id: 1,
              lat: 51.5074,
              lon: -0.1278,
              tags: { amenity: "charging_station", name: "EV Charger" },
            },
          ],
        }),
      });

      await service.prefetchRoutePOIs(mockRoute, ["charging"]);

      const result = await service.getNearbyPOIs(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        ["charging"],
      );

      expect(result.success).toBe(true);
      if (result.success && result.data.length > 0) {
        expect(result.data[0].codeLetter).toBe("C");
      }
    });
  });

  describe("POI category mapping", () => {
    it("should correctly identify fuel stations", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          elements: [
            {
              type: "node",
              id: 1,
              lat: 51.5074,
              lon: -0.1278,
              tags: { amenity: "fuel", name: "Gas Station" },
            },
          ],
        }),
      });

      await service.prefetchRoutePOIs(mockRoute, ["fuel"]);

      const result = await service.getNearbyPOIs(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        ["fuel"],
      );

      expect(result.success).toBe(true);
      if (result.success && result.data.length > 0) {
        expect(result.data[0].codeLetter).toBe("F");
      }
    });

    it("should correctly identify parking", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          elements: [
            {
              type: "node",
              id: 1,
              lat: 51.5074,
              lon: -0.1278,
              tags: { amenity: "parking", name: "Car Park" },
            },
          ],
        }),
      });

      await service.prefetchRoutePOIs(mockRoute, ["parking"]);

      const result = await service.getNearbyPOIs(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        ["parking"],
      );

      expect(result.success).toBe(true);
      if (result.success && result.data.length > 0) {
        expect(result.data[0].codeLetter).toBe("P");
      }
    });

    it("should correctly identify food (restaurant)", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          elements: [
            {
              type: "node",
              id: 1,
              lat: 51.5074,
              lon: -0.1278,
              tags: { amenity: "restaurant", name: "Restaurant" },
            },
          ],
        }),
      });

      await service.prefetchRoutePOIs(mockRoute, ["food"]);

      const result = await service.getNearbyPOIs(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        ["food"],
      );

      expect(result.success).toBe(true);
      if (result.success && result.data.length > 0) {
        expect(result.data[0].codeLetter).toBe("E");
      }
    });

    it("should correctly identify restrooms", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          elements: [
            {
              type: "node",
              id: 1,
              lat: 51.5074,
              lon: -0.1278,
              tags: { amenity: "toilets", name: "Public Toilet" },
            },
          ],
        }),
      });

      await service.prefetchRoutePOIs(mockRoute, ["restroom"]);

      const result = await service.getNearbyPOIs(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        ["restroom"],
      );

      expect(result.success).toBe(true);
      if (result.success && result.data.length > 0) {
        expect(result.data[0].codeLetter).toBe("R");
      }
    });

    it("should correctly identify viewpoints", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          elements: [
            {
              type: "node",
              id: 1,
              lat: 51.5074,
              lon: -0.1278,
              tags: { tourism: "viewpoint", name: "Scenic View" },
            },
          ],
        }),
      });

      await service.prefetchRoutePOIs(mockRoute, ["viewpoint"]);

      const result = await service.getNearbyPOIs(
        {
          latitude: 51.5074,
          longitude: -0.1278,
          altitude: 10,
          timestamp: new Date(),
        },
        ["viewpoint"],
      );

      expect(result.success).toBe(true);
      if (result.success && result.data.length > 0) {
        expect(result.data[0].codeLetter).toBe("V");
      }
    });
  });
});
