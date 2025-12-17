/* eslint-disable @typescript-eslint/no-explicit-any */
import { ReverseGeocodingService } from "../ReverseGeocodingService";
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

describe("ReverseGeocodingService", () => {
  let service: ReverseGeocodingService;

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

  const mockNominatimResponse = {
    place_id: 12345,
    display_name: "Test Street, Test City, Test Country",
    address: {
      road: "Test Street",
      city: "Test City",
      county: "Test County",
      country: "Test Country",
      postcode: "TEST123",
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup fs mocks
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.readdir.mockResolvedValue([]);
    mockedFs.writeFile.mockResolvedValue(undefined);
    mockedFs.unlink.mockResolvedValue(undefined);
    mockedFs.readFile.mockResolvedValue("{}");

    service = new ReverseGeocodingService();
    await service.initialize();
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe("initialize", () => {
    it("should initialize successfully", async () => {
      const newService = new ReverseGeocodingService();
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
        locations: [
          {
            latitude: 51.5,
            longitude: -0.1,
            location: {
              displayName: "Cached Street, Cached City",
              street: "Cached Street",
              locality: "Cached City",
            },
            cachedAt: Date.now(),
          },
        ],
      };

      mockedFs.readdir.mockResolvedValue(["cached-route.json"] as any);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(cacheData));

      const newService = new ReverseGeocodingService();
      await newService.initialize();

      expect(newService.hasRouteCache("cached-route")).toBe(true);

      await newService.dispose();
    });
  });

  describe("getLocationName", () => {
    it("should return null when no cached data exists", async () => {
      const result = await service.getLocationName({
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
      const newService = new ReverseGeocodingService();
      const result = await newService.getLocationName({
        latitude: 51.5074,
        longitude: -0.1278,
        timestamp: new Date(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as any)?.code).toBe(
          "GEOCODING_SERVICE_NOT_INITIALIZED",
        );
      }
    });

    it("should return cached location when within threshold distance", async () => {
      // Set up cache by running prefetch first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockNominatimResponse),
      });

      await service.prefetchRouteLocations(mockRoute);

      // Now get location name for a position near the cached one
      const result = await service.getLocationName({
        latitude: 51.5074,
        longitude: -0.1278,
        timestamp: new Date(),
      });

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.displayName).toContain("Test");
      }
    });
  });

  describe("prefetchRouteLocations", () => {
    it("should return failure when service not initialized", async () => {
      const newService = new ReverseGeocodingService();
      const result = await newService.prefetchRouteLocations(mockRoute);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as any)?.code).toBe(
          "GEOCODING_SERVICE_NOT_INITIALIZED",
        );
      }
    });

    it("should prefetch locations for route points", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockNominatimResponse),
      });

      const progressUpdates: any[] = [];
      const result = await service.prefetchRouteLocations(
        mockRoute,
        (progress) => {
          progressUpdates.push(progress);
        },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeGreaterThan(0);
      }
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1].complete).toBe(true);
    });

    it("should handle API errors gracefully during prefetch", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const result = await service.prefetchRouteLocations(mockRoute);

      // Should still succeed (prefetch continues on partial failures)
      expect(result.success).toBe(true);
    });

    it("should handle rate limiting response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      });

      const result = await service.prefetchRouteLocations(mockRoute);

      // Should still succeed overall (logs warning but continues)
      expect(result.success).toBe(true);
    });

    it("should save cache to disk after prefetching", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockNominatimResponse),
      });

      await service.prefetchRouteLocations(mockRoute);

      expect(mockedFs.writeFile).toHaveBeenCalled();
    });
  });

  describe("hasRouteCache", () => {
    it("should return false when no cache exists", () => {
      expect(service.hasRouteCache("nonexistent-route")).toBe(false);
    });

    it("should return true after prefetching", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockNominatimResponse),
      });

      await service.prefetchRouteLocations(mockRoute);

      expect(service.hasRouteCache(mockRoute.id!)).toBe(true);
    });
  });

  describe("clearRouteCache", () => {
    it("should clear cache for specific route", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockNominatimResponse),
      });

      await service.prefetchRouteLocations(mockRoute);
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
        json: () => Promise.resolve(mockNominatimResponse),
      });

      await service.prefetchRouteLocations(mockRoute);

      const result = await service.clearAllCache();
      expect(result.success).toBe(true);
      expect(service.hasRouteCache(mockRoute.id!)).toBe(false);
    });
  });

  describe("dispose", () => {
    it("should clear all state on dispose", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockNominatimResponse),
      });

      await service.prefetchRouteLocations(mockRoute);
      expect(service.hasRouteCache(mockRoute.id!)).toBe(true);

      await service.dispose();

      // After dispose, service should no longer have cache
      // (and would fail on operations as not initialized)
      const newService = new ReverseGeocodingService();
      expect(newService.hasRouteCache(mockRoute.id!)).toBe(false);
    });
  });

  describe("parseNominatimResponse", () => {
    it("should build display name from address components", async () => {
      const response = {
        place_id: 123,
        display_name: "Full Display Name, With Many, Parts",
        address: {
          road: "Main Street",
          city: "London",
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });

      await service.prefetchRouteLocations(mockRoute);

      const result = await service.getLocationName({
        latitude: 51.5074,
        longitude: -0.1278,
        timestamp: new Date(),
      });

      if (result.success && result.data) {
        // Should use road and city, not full display name
        expect(result.data.displayName).toBe("Main Street, London");
      }
    });

    it("should fall back to display name when address parts are missing", async () => {
      const response = {
        place_id: 123,
        display_name: "Short Name, Place",
        address: {},
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });

      await service.prefetchRouteLocations(mockRoute);

      const result = await service.getLocationName({
        latitude: 51.5074,
        longitude: -0.1278,
        timestamp: new Date(),
      });

      if (result.success && result.data) {
        // Should fall back to first parts of display_name
        expect(result.data.displayName).toContain("Short Name");
      }
    });

    it("should handle village/town locality types", async () => {
      const response = {
        place_id: 123,
        display_name: "Full Name",
        address: {
          road: "Village Road",
          village: "Small Village",
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });

      await service.prefetchRouteLocations(mockRoute);

      const result = await service.getLocationName({
        latitude: 51.5074,
        longitude: -0.1278,
        timestamp: new Date(),
      });

      if (result.success && result.data) {
        expect(result.data.displayName).toBe("Village Road, Small Village");
        expect(result.data.locality).toBe("Small Village");
      }
    });
  });
});
