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

      // Should still succeed but with 0 POIs
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(0);
      }
    });

    it("should handle rate limiting", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      });

      const result = await service.prefetchRoutePOIs(mockRoute, ["fuel"]);

      expect(result.success).toBe(true);
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
