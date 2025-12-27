/* eslint-disable @typescript-eslint/no-explicit-any */
import { RoadSurfaceService } from "../RoadSurfaceService";
import { GPSCoordinate } from "@core/types";
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

describe("RoadSurfaceService", () => {
  let service: RoadSurfaceService;

  const mockRouteGeometry: [number, number][] = [
    [51.5074, -0.1278],
    [51.508, -0.125],
    [51.51, -0.12],
  ];

  const mockPosition: GPSCoordinate = {
    latitude: 51.5074,
    longitude: -0.1278,
    timestamp: new Date(),
  };

  const mockOverpassResponse = {
    elements: [
      {
        type: "way",
        id: 12345,
        tags: {
          surface: "asphalt",
          name: "Test Street",
          highway: "residential",
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
          surface: "gravel",
          name: "Gravel Road",
          highway: "track",
        },
        geometry: [
          { lat: 51.508, lon: -0.125 },
          { lat: 51.51, lon: -0.12 },
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

    service = new RoadSurfaceService();
    await service.initialize();
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe("initialize", () => {
    it("should initialize successfully", async () => {
      const newService = new RoadSurfaceService();
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
            surface: "paved",
            rawSurface: "asphalt",
            wayId: 99999,
            roadName: "Cached Road",
            highwayType: "residential",
          },
        ],
      };

      mockedFs.readdir.mockResolvedValue(["cached-route.json"] as any);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(cacheData));

      const newService = new RoadSurfaceService();
      await newService.initialize();

      expect(newService.hasRouteCache("cached-route")).toBe(true);

      await newService.dispose();
    });
  });

  describe("dispose", () => {
    it("should dispose successfully", async () => {
      await service.dispose();
      // No errors thrown
    });
  });

  describe("prefetchRouteSurfaces", () => {
    it("should prefetch surfaces successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOverpassResponse,
      });

      const progressCallback = jest.fn();
      const result = await service.prefetchRouteSurfaces(
        mockRouteGeometry,
        "test-route",
        progressCallback,
      );

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalled();
      expect(mockedFs.writeFile).toHaveBeenCalled();
    });

    it("should successfully cache data after prefetch", async () => {
      // First prefetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOverpassResponse,
      });

      const result = await service.prefetchRouteSurfaces(
        mockRouteGeometry,
        "test-route",
      );

      expect(result.success).toBe(true);
      expect(service.hasRouteCache("test-route")).toBe(true);
      expect(mockedFs.writeFile).toHaveBeenCalled();
    });

    it("should handle API errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await service.prefetchRouteSurfaces(
        mockRouteGeometry,
        "test-route",
      );

      // API errors result in failure but don't crash
      expect(result.success).toBe(false);
    });

    it("should handle rate limiting", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      });

      const result = await service.prefetchRouteSurfaces(
        mockRouteGeometry,
        "test-route",
      );

      // Rate limiting results in failure
      expect(result.success).toBe(false);
    });
  });

  describe("getCurrentSurface", () => {
    it("should return null when no data is cached", async () => {
      const result = await service.getCurrentSurface(mockPosition);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it("should return surface type from cached data", async () => {
      // First prefetch some data
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRouteSurfaces(mockRouteGeometry, "test-route");

      // Now get current surface
      const result = await service.getCurrentSurface(mockPosition);

      expect(result.success).toBe(true);
      if (result.success) {
        // Should return paved since asphalt maps to paved
        expect(result.data).toBe("paved");
      }
    });

    it("should return gravel for gravel surfaces", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          elements: [
            {
              type: "way",
              id: 12346,
              tags: {
                surface: "gravel",
                name: "Gravel Road",
                highway: "track",
              },
              geometry: [
                { lat: 51.5074, lon: -0.1278 },
                { lat: 51.508, lon: -0.125 },
              ],
            },
          ],
        }),
      });

      await service.prefetchRouteSurfaces(mockRouteGeometry, "test-route");

      const result = await service.getCurrentSurface(mockPosition);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("gravel");
      }
    });

    it("should return dirt for dirt/earth surfaces", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          elements: [
            {
              type: "way",
              id: 12347,
              tags: {
                surface: "dirt",
                name: "Dirt Path",
                highway: "path",
              },
              geometry: [
                { lat: 51.5074, lon: -0.1278 },
                { lat: 51.508, lon: -0.125 },
              ],
            },
          ],
        }),
      });

      await service.prefetchRouteSurfaces(mockRouteGeometry, "test-route");

      const result = await service.getCurrentSurface(mockPosition);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("dirt");
      }
    });
  });

  describe("hasRouteCache", () => {
    it("should return false for uncached route", () => {
      expect(service.hasRouteCache("nonexistent-route")).toBe(false);
    });

    it("should return true for cached route", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRouteSurfaces(mockRouteGeometry, "test-route");

      expect(service.hasRouteCache("test-route")).toBe(true);
    });
  });

  describe("clearRouteCache", () => {
    it("should clear route from cache", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRouteSurfaces(mockRouteGeometry, "test-route");
      expect(service.hasRouteCache("test-route")).toBe(true);

      service.clearRouteCache("test-route");
      expect(service.hasRouteCache("test-route")).toBe(false);
    });
  });

  describe("clearAllCache", () => {
    it("should clear all cached routes", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOverpassResponse,
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOverpassResponse,
      });

      await service.prefetchRouteSurfaces(mockRouteGeometry, "route-1");
      await service.prefetchRouteSurfaces(mockRouteGeometry, "route-2");

      expect(service.hasRouteCache("route-1")).toBe(true);
      expect(service.hasRouteCache("route-2")).toBe(true);

      await service.clearAllCache();

      expect(service.hasRouteCache("route-1")).toBe(false);
      expect(service.hasRouteCache("route-2")).toBe(false);
    });
  });

  describe("surface classification", () => {
    const testSurfaceClassification = async (
      osmSurface: string,
      expectedType: string,
    ) => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          elements: [
            {
              type: "way",
              id: 12345,
              tags: {
                surface: osmSurface,
                highway: "residential",
              },
              geometry: [
                { lat: 51.5074, lon: -0.1278 },
                { lat: 51.508, lon: -0.125 },
              ],
            },
          ],
        }),
      });

      const newService = new RoadSurfaceService();
      await newService.initialize();
      await newService.prefetchRouteSurfaces(mockRouteGeometry, "test-route");
      const result = await newService.getCurrentSurface(mockPosition);
      await newService.dispose();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(expectedType);
      }
    };

    it("should classify asphalt as paved", async () => {
      await testSurfaceClassification("asphalt", "paved");
    });

    it("should classify concrete as paved", async () => {
      await testSurfaceClassification("concrete", "paved");
    });

    it("should classify paving_stones as paved", async () => {
      await testSurfaceClassification("paving_stones", "paved");
    });

    it("should classify gravel as gravel", async () => {
      await testSurfaceClassification("gravel", "gravel");
    });

    it("should classify fine_gravel as gravel", async () => {
      await testSurfaceClassification("fine_gravel", "gravel");
    });

    it("should classify compacted as gravel", async () => {
      await testSurfaceClassification("compacted", "gravel");
    });

    it("should classify dirt as dirt", async () => {
      await testSurfaceClassification("dirt", "dirt");
    });

    it("should classify earth as dirt", async () => {
      await testSurfaceClassification("earth", "dirt");
    });

    it("should classify ground as dirt", async () => {
      await testSurfaceClassification("ground", "dirt");
    });

    it("should classify mud as dirt", async () => {
      await testSurfaceClassification("mud", "dirt");
    });

    it("should classify grass as unpaved", async () => {
      await testSurfaceClassification("grass", "unpaved");
    });

    it("should classify sand as unpaved", async () => {
      await testSurfaceClassification("sand", "unpaved");
    });

    it("should classify wood as paved (boardwalks)", async () => {
      await testSurfaceClassification("wood", "paved");
    });
  });
});
