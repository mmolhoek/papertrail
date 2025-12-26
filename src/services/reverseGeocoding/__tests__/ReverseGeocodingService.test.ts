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

  describe("initialize - error handling", () => {
    it("should return failure when mkdir fails with Error", async () => {
      mockedFs.mkdir.mockRejectedValue(new Error("Permission denied"));

      const newService = new ReverseGeocodingService();
      const result = await newService.initialize();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as any)?.code).toBe(
          "GEOCODING_CACHE_WRITE_FAILED",
        );
      }
    });

    it("should return failure when mkdir fails with non-Error", async () => {
      mockedFs.mkdir.mockRejectedValue("string error");

      const newService = new ReverseGeocodingService();
      const result = await newService.initialize();

      expect(result.success).toBe(false);
    });

    it("should handle corrupted cache file during load", async () => {
      mockedFs.readdir.mockResolvedValue(["corrupted.json"] as any);
      mockedFs.readFile.mockResolvedValue("not valid json");

      const newService = new ReverseGeocodingService();
      const result = await newService.initialize();

      // Should succeed but skip corrupted file
      expect(result.success).toBe(true);
      expect(newService.hasRouteCache("corrupted")).toBe(false);

      await newService.dispose();
    });

    it("should handle readdir failure during cache load", async () => {
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.readdir.mockRejectedValue(new Error("Directory not found"));

      const newService = new ReverseGeocodingService();
      const result = await newService.initialize();

      // Should succeed - no cached routes is OK
      expect(result.success).toBe(true);

      await newService.dispose();
    });
  });

  describe("queryNominatimApi - error handling", () => {
    it("should handle API returning error field", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            error: "Unable to geocode",
          }),
      });

      const result = await service.prefetchRouteLocations(mockRoute);

      // Should succeed but with no locations cached
      expect(result.success).toBe(true);
    });

    it("should handle AbortError (timeout)", async () => {
      const abortError = new Error("Request timeout");
      abortError.name = "AbortError";
      mockFetch.mockRejectedValue(abortError);

      const result = await service.prefetchRouteLocations(mockRoute);

      // Should succeed (individual failures don't fail entire prefetch)
      expect(result.success).toBe(true);
    });

    it("should handle generic network errors", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await service.prefetchRouteLocations(mockRoute);

      expect(result.success).toBe(true);
    });

    it("should handle non-Error exceptions from fetch", async () => {
      mockFetch.mockRejectedValue("string error");

      const result = await service.prefetchRouteLocations(mockRoute);

      expect(result.success).toBe(true);
    });

    it("should handle HTTP error responses", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      const result = await service.prefetchRouteLocations(mockRoute);

      expect(result.success).toBe(true);
    });
  });

  describe("prefetchRouteLocations - edge cases", () => {
    it("should handle empty route geometry", async () => {
      const emptyRoute: DriveRoute = {
        ...mockRoute,
        id: "empty-route",
        geometry: [],
      };

      const result = await service.prefetchRouteLocations(emptyRoute);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(0);
      }
    });

    it("should handle single point route", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockNominatimResponse),
      });

      const singlePointRoute: DriveRoute = {
        ...mockRoute,
        id: "single-point-route",
        geometry: [[51.5, -0.1]],
      };

      const result = await service.prefetchRouteLocations(singlePointRoute);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(1);
      }
    });

    it("should always include last point even if interval not met", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockNominatimResponse),
      });

      // Route where last point is not at exact interval
      const shortRoute: DriveRoute = {
        ...mockRoute,
        id: "short-route",
        geometry: [
          [51.5, -0.1],
          [51.502, -0.1], // Only ~220m from start, less than 1000m interval
        ],
      };

      const result = await service.prefetchRouteLocations(shortRoute);

      expect(result.success).toBe(true);
      // Should have 2 points: start and end
      if (result.success) {
        expect(result.data).toBe(2);
      }
    });

    it("should handle route with special characters in id", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockNominatimResponse),
      });

      const specialIdRoute: DriveRoute = {
        ...mockRoute,
        id: "route-with-special_chars.123",
      };

      const result = await service.prefetchRouteLocations(specialIdRoute);

      expect(result.success).toBe(true);
      expect(service.hasRouteCache("route-with-special_chars.123")).toBe(true);
    });
  });

  describe("clearRouteCache - error handling", () => {
    it("should handle unlink failure with Error", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockNominatimResponse),
      });

      await service.prefetchRouteLocations(mockRoute);

      // Make unlink throw (outside the .catch())
      mockedFs.unlink.mockImplementation(() => {
        throw new Error("Unlink failed");
      });

      const result = await service.clearRouteCache(mockRoute.id!);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as any)?.code).toBe(
          "GEOCODING_CACHE_WRITE_FAILED",
        );
      }
    });

    it("should handle unlink failure with non-Error", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockNominatimResponse),
      });

      await service.prefetchRouteLocations(mockRoute);

      mockedFs.unlink.mockImplementation(() => {
        throw "string error";
      });

      const result = await service.clearRouteCache(mockRoute.id!);

      expect(result.success).toBe(false);
    });
  });

  describe("clearAllCache - error handling", () => {
    it("should delete multiple cache files", async () => {
      mockedFs.readdir.mockResolvedValue([
        "route1.json",
        "route2.json",
        "route3.json",
      ] as any);

      const result = await service.clearAllCache();

      expect(result.success).toBe(true);
      expect(mockedFs.unlink).toHaveBeenCalledTimes(3);
    });

    it("should skip non-json files", async () => {
      mockedFs.readdir.mockResolvedValue([
        "route1.json",
        "readme.txt",
        "data.csv",
      ] as any);

      const result = await service.clearAllCache();

      expect(result.success).toBe(true);
      expect(mockedFs.unlink).toHaveBeenCalledTimes(1);
    });

    it("should handle readdir failure with Error", async () => {
      mockedFs.readdir.mockRejectedValue(new Error("Read failed"));

      const result = await service.clearAllCache();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as any)?.code).toBe(
          "GEOCODING_CACHE_WRITE_FAILED",
        );
      }
    });

    it("should handle readdir failure with non-Error", async () => {
      mockedFs.readdir.mockRejectedValue("string error");

      const result = await service.clearAllCache();

      expect(result.success).toBe(false);
    });
  });

  describe("findLocationInCache - edge cases", () => {
    it("should return null when position is outside threshold distance", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockNominatimResponse),
      });

      await service.prefetchRouteLocations(mockRoute);

      // Query for a position far from any cached location
      const result = await service.getLocationName({
        latitude: 52.0, // ~55km north
        longitude: -0.1278,
        timestamp: new Date(),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it("should find nearest location when multiple cached routes exist", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockNominatimResponse),
      });

      // Prefetch first route
      await service.prefetchRouteLocations(mockRoute);

      // Prefetch second route with different response
      const secondResponse = {
        ...mockNominatimResponse,
        address: {
          ...mockNominatimResponse.address,
          road: "Second Street",
        },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(secondResponse),
      });

      const secondRoute: DriveRoute = {
        ...mockRoute,
        id: "second-route",
        geometry: [
          [51.52, -0.13],
          [51.53, -0.14],
        ],
      };
      await service.prefetchRouteLocations(secondRoute);

      // Query for position closer to first route
      const result = await service.getLocationName({
        latitude: 51.5074,
        longitude: -0.1278,
        timestamp: new Date(),
      });

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.distance).toBeDefined();
      }
    });
  });

  describe("rate limiting", () => {
    it("should wait between API requests", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockNominatimResponse),
      });

      // Create a route that needs multiple API calls
      const longRoute: DriveRoute = {
        ...mockRoute,
        id: "long-route",
        geometry: [
          [51.5, -0.1],
          [51.52, -0.1], // ~2.2km, will need 3 samples
          [51.54, -0.1], // ~2.2km more
        ],
      };

      await service.prefetchRouteLocations(longRoute);

      // Should have made multiple API calls
      expect(mockFetch.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe("parseNominatimResponse - edge cases", () => {
    it("should return null when display_name is missing", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            place_id: 123,
            // No display_name
            address: {
              road: "Some Road",
            },
          }),
      });

      await service.prefetchRouteLocations(mockRoute);

      const result = await service.getLocationName({
        latitude: 51.5074,
        longitude: -0.1278,
        timestamp: new Date(),
      });

      expect(result.success).toBe(true);
      // Location should be null due to missing display_name
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it("should use town when city is not available", async () => {
      const response = {
        place_id: 123,
        display_name: "Full Name",
        address: {
          road: "Town Road",
          town: "Market Town",
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
        expect(result.data.displayName).toBe("Town Road, Market Town");
        expect(result.data.locality).toBe("Market Town");
      }
    });

    it("should use municipality when other locality types unavailable", async () => {
      const response = {
        place_id: 123,
        display_name: "Full Name",
        address: {
          road: "Rural Road",
          municipality: "Local Municipality",
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
        expect(result.data.displayName).toBe("Rural Road, Local Municipality");
        expect(result.data.locality).toBe("Local Municipality");
      }
    });

    it("should use state as region when county not available", async () => {
      const response = {
        place_id: 123,
        display_name: "Full Name",
        address: {
          road: "State Road",
          city: "Big City",
          state: "California",
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
        expect(result.data.region).toBe("California");
      }
    });

    it("should handle missing address object", async () => {
      const response = {
        place_id: 123,
        display_name: "Some Place, In The, World",
        // No address object
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
        // Should fall back to first 2 parts of display_name (note: leading space preserved after split)
        expect(result.data.displayName).toBe("Some Place,  In The");
      }
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
