/* eslint-disable @typescript-eslint/no-explicit-any */
import { MapSnapService } from "../MapSnapService";
import { MapSnapError, MapSnapErrorCode } from "@core/errors/MapSnapError";
import { GPXTrack } from "@core/types";

// Helper to assert MapSnapError and check code
function assertMapSnapError(
  error: Error,
  expectedCode: keyof typeof MapSnapErrorCode,
): void {
  expect(error).toBeInstanceOf(MapSnapError);
  expect((error as MapSnapError).code).toBe(MapSnapErrorCode[expectedCode]);
}

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Sample GPS coordinates for testing
const samplePoints = [
  {
    latitude: 52.52,
    longitude: 13.405,
    timestamp: new Date("2024-01-01T08:00:00Z"),
  },
  {
    latitude: 52.521,
    longitude: 13.406,
    timestamp: new Date("2024-01-01T08:01:00Z"),
  },
  {
    latitude: 52.522,
    longitude: 13.407,
    timestamp: new Date("2024-01-01T08:02:00Z"),
  },
  {
    latitude: 52.523,
    longitude: 13.408,
    timestamp: new Date("2024-01-01T08:03:00Z"),
  },
  {
    latitude: 52.524,
    longitude: 13.409,
    timestamp: new Date("2024-01-01T08:04:00Z"),
  },
];

const sampleTrack: GPXTrack = {
  name: "Test Track",
  segments: [
    {
      points: samplePoints.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        altitude: 50,
        timestamp: p.timestamp,
      })),
    },
  ],
};

// Sample OSRM response
const createOSRMResponse = (numPoints: number, confidence = 0.9) => ({
  code: "Ok",
  matchings: [
    {
      geometry: {
        type: "LineString",
        coordinates: Array.from({ length: numPoints }, (_, i) => [
          13.405 + i * 0.001,
          52.52 + i * 0.001,
        ]),
      },
      distance: 500,
      duration: 60,
      confidence,
    },
  ],
  tracepoints: Array.from({ length: numPoints }, (_, i) => ({
    location: [13.405 + i * 0.001, 52.52 + i * 0.001],
    name: `Road ${i}`,
    matchings_index: 0,
    waypoint_index: i,
  })),
});

describe("MapSnapService", () => {
  let service: MapSnapService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MapSnapService();
    // Reset rate limit timing
    (service as any).lastRequestTime = 0;
  });

  describe("initialize", () => {
    it("should initialize successfully", async () => {
      const result = await service.initialize();
      expect(result.success).toBe(true);
    });

    it("should be idempotent", async () => {
      const result1 = await service.initialize();
      const result2 = await service.initialize();
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  describe("dispose", () => {
    it("should dispose successfully", async () => {
      await service.initialize();
      await service.dispose();
      // After dispose, service should need re-initialization
      const result = await service.snapPoints(samplePoints);
      expect(result.success).toBe(false);
      if (!result.success) {
        assertMapSnapError(result.error, "SERVICE_NOT_INITIALIZED");
      }
    });
  });

  describe("snapPoints", () => {
    it("should fail if service not initialized", async () => {
      const result = await service.snapPoints(samplePoints);
      expect(result.success).toBe(false);
      if (!result.success) {
        assertMapSnapError(result.error, "SERVICE_NOT_INITIALIZED");
      }
    });

    it("should fail with too few points", async () => {
      await service.initialize();
      const result = await service.snapPoints([samplePoints[0]]);
      expect(result.success).toBe(false);
      if (!result.success) {
        assertMapSnapError(result.error, "TOO_FEW_POINTS");
      }
    });

    it("should fail with zero points", async () => {
      await service.initialize();
      const result = await service.snapPoints([]);
      expect(result.success).toBe(false);
      if (!result.success) {
        assertMapSnapError(result.error, "TOO_FEW_POINTS");
      }
    });

    it("should snap points successfully", async () => {
      await service.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(createOSRMResponse(5)),
      });

      const result = await service.snapPoints(samplePoints);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.snappedPoints).toHaveLength(5);
        expect(result.data.geometry).toHaveLength(5);
        expect(result.data.matchedDistance).toBe(500);
        expect(result.data.averageConfidence).toBeCloseTo(0.9);
        expect(result.data.unmatchedCount).toBe(0);
      }
    });

    it("should use correct profile in API URL", async () => {
      await service.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(createOSRMResponse(5)),
      });

      await service.snapPoints(samplePoints, "bike");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("routed-bike"),
      );
    });

    it("should call progress callback", async () => {
      await service.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(createOSRMResponse(5)),
      });

      const onProgress = jest.fn();
      await service.snapPoints(samplePoints, "car", onProgress);

      expect(onProgress).toHaveBeenCalled();
      // Should have at least one matching phase and one complete phase
      const calls = onProgress.mock.calls;
      expect(calls.some((c) => c[0].phase === "matching")).toBe(true);
      expect(calls.some((c) => c[0].phase === "complete")).toBe(true);
    });

    it("should handle API rate limiting (429)", async () => {
      await service.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      });

      const result = await service.snapPoints(samplePoints);
      expect(result.success).toBe(false);
      // When all batches fail, result is NO_MATCH_FOUND since no points were matched
      if (!result.success) {
        assertMapSnapError(result.error, "NO_MATCH_FOUND");
      }
    });

    it("should handle API errors", async () => {
      await service.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const result = await service.snapPoints(samplePoints);
      expect(result.success).toBe(false);
      // When all batches fail, result is NO_MATCH_FOUND since no points were matched
      if (!result.success) {
        assertMapSnapError(result.error, "NO_MATCH_FOUND");
      }
    });

    it("should handle NoMatch response", async () => {
      await service.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ code: "NoMatch" }),
      });

      const result = await service.snapPoints(samplePoints);
      expect(result.success).toBe(false);
      if (!result.success) {
        assertMapSnapError(result.error, "NO_MATCH_FOUND");
      }
    });

    it("should handle network errors", async () => {
      await service.initialize();
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await service.snapPoints(samplePoints);
      expect(result.success).toBe(false);
      // When all batches fail, result is NO_MATCH_FOUND since no points were matched
      if (!result.success) {
        assertMapSnapError(result.error, "NO_MATCH_FOUND");
      }
    });

    it("should handle empty matchings array", async () => {
      await service.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ code: "Ok", matchings: [], tracepoints: [] }),
      });

      const result = await service.snapPoints(samplePoints);
      expect(result.success).toBe(false);
      if (!result.success) {
        assertMapSnapError(result.error, "NO_MATCH_FOUND");
      }
    });

    it("should handle unmatched tracepoints (null)", async () => {
      await service.initialize();
      const responseWithNulls = {
        code: "Ok",
        matchings: [
          {
            geometry: {
              type: "LineString",
              coordinates: [
                [13.405, 52.52],
                [13.407, 52.522],
              ],
            },
            distance: 300,
            duration: 30,
            confidence: 0.8,
          },
        ],
        tracepoints: [
          {
            location: [13.405, 52.52],
            name: "Road 1",
            matchings_index: 0,
            waypoint_index: 0,
          },
          null, // Point could not be matched
          {
            location: [13.407, 52.522],
            name: "Road 2",
            matchings_index: 0,
            waypoint_index: 2,
          },
          null, // Point could not be matched
          null, // Point could not be matched
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(responseWithNulls),
      });

      const result = await service.snapPoints(samplePoints);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.snappedPoints).toHaveLength(2); // Only 2 matched
        expect(result.data.unmatchedCount).toBe(3);
      }
    });

    it("should calculate distance from original points", async () => {
      await service.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(createOSRMResponse(5)),
      });

      const result = await service.snapPoints(samplePoints);
      expect(result.success).toBe(true);
      if (result.success) {
        // Each snapped point should have a distance from original
        result.data.snappedPoints.forEach((sp) => {
          expect(typeof sp.distance).toBe("number");
          expect(sp.distance).toBeGreaterThanOrEqual(0);
        });
      }
    });
  });

  describe("snapTrack", () => {
    it("should extract points from track and snap them", async () => {
      await service.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(createOSRMResponse(5)),
      });

      const result = await service.snapTrack(sampleTrack);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.snappedPoints).toHaveLength(5);
      }
    });

    it("should handle track with multiple segments", async () => {
      await service.initialize();
      const multiSegmentTrack: GPXTrack = {
        name: "Multi-segment Track",
        segments: [
          {
            points: [
              {
                latitude: 52.52,
                longitude: 13.405,
                altitude: 50,
                timestamp: new Date(),
              },
              {
                latitude: 52.521,
                longitude: 13.406,
                altitude: 51,
                timestamp: new Date(),
              },
            ],
          },
          {
            points: [
              {
                latitude: 52.522,
                longitude: 13.407,
                altitude: 52,
                timestamp: new Date(),
              },
              {
                latitude: 52.523,
                longitude: 13.408,
                altitude: 53,
                timestamp: new Date(),
              },
            ],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(createOSRMResponse(4)),
      });

      const result = await service.snapTrack(multiSegmentTrack);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.snappedPoints).toHaveLength(4);
      }
    });

    it("should fail with empty track", async () => {
      await service.initialize();
      const emptyTrack: GPXTrack = {
        name: "Empty Track",
        segments: [],
      };

      const result = await service.snapTrack(emptyTrack);
      expect(result.success).toBe(false);
      if (!result.success) {
        assertMapSnapError(result.error, "TOO_FEW_POINTS");
      }
    });

    it("should use specified profile", async () => {
      await service.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(createOSRMResponse(5)),
      });

      await service.snapTrack(sampleTrack, "foot");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("routed-foot"),
      );
    });
  });

  describe("batching", () => {
    it("should create single batch for small point sets", async () => {
      await service.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(createOSRMResponse(5)),
      });

      await service.snapPoints(samplePoints);
      // Should only call fetch once for 5 points
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should create multiple batches for large point sets", async () => {
      await service.initialize();

      // Create 150 points (should need 2 batches with MAX_POINTS_PER_REQUEST=100)
      const manyPoints = Array.from({ length: 150 }, (_, i) => ({
        latitude: 52.52 + i * 0.001,
        longitude: 13.405 + i * 0.001,
        timestamp: new Date(),
      }));

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(createOSRMResponse(100)),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(createOSRMResponse(52)), // 150 - 100 + 2 overlap
        });

      const result = await service.snapPoints(manyPoints);
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should continue even if one batch fails", async () => {
      await service.initialize();

      // Create 150 points
      const manyPoints = Array.from({ length: 150 }, (_, i) => ({
        latitude: 52.52 + i * 0.001,
        longitude: 13.405 + i * 0.001,
        timestamp: new Date(),
      }));

      // First batch fails, second succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Error",
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(createOSRMResponse(52)),
        });

      const result = await service.snapPoints(manyPoints);
      // Should still succeed with partial data
      expect(result.success).toBe(true);
      if (result.success) {
        // Some points matched from second batch
        expect(result.data.snappedPoints.length).toBeGreaterThan(0);
        // All points from first batch are unmatched
        expect(result.data.unmatchedCount).toBe(100);
      }
    });

    it("should fail if all batches fail", async () => {
      await service.initialize();

      // Create 150 points
      const manyPoints = Array.from({ length: 150 }, (_, i) => ({
        latitude: 52.52 + i * 0.001,
        longitude: 13.405 + i * 0.001,
        timestamp: new Date(),
      }));

      // Both batches fail
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Error",
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Error",
        });

      const result = await service.snapPoints(manyPoints);
      expect(result.success).toBe(false);
      if (!result.success) {
        assertMapSnapError(result.error, "NO_MATCH_FOUND");
      }
    });
  });

  describe("rate limiting", () => {
    it("should respect rate limit between requests", async () => {
      await service.initialize();

      // Create 150 points to force multiple batches
      const manyPoints = Array.from({ length: 150 }, (_, i) => ({
        latitude: 52.52 + i * 0.001,
        longitude: 13.405 + i * 0.001,
        timestamp: new Date(),
      }));

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(createOSRMResponse(100)),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(createOSRMResponse(52)),
        });

      const startTime = Date.now();
      await service.snapPoints(manyPoints);
      const duration = Date.now() - startTime;

      // Should take at least RATE_LIMIT_DELAY (1100ms) between batches
      // Allow some tolerance for test execution
      expect(duration).toBeGreaterThanOrEqual(1000);
    }, 10000); // Increase timeout for rate limit test
  });

  describe("geometry handling", () => {
    it("should convert coordinates from [lon, lat] to [lat, lon]", async () => {
      await service.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            code: "Ok",
            matchings: [
              {
                geometry: {
                  type: "LineString",
                  coordinates: [
                    [13.405, 52.52], // [lon, lat] from API
                    [13.406, 52.521],
                  ],
                },
                distance: 100,
                duration: 10,
                confidence: 0.9,
              },
            ],
            tracepoints: [
              {
                location: [13.405, 52.52],
                name: "Road",
                matchings_index: 0,
                waypoint_index: 0,
              },
              {
                location: [13.406, 52.521],
                name: "Road",
                matchings_index: 0,
                waypoint_index: 1,
              },
            ],
          }),
      });

      const result = await service.snapPoints([
        samplePoints[0],
        samplePoints[1],
      ]);
      expect(result.success).toBe(true);
      if (result.success) {
        // Geometry should be in [lat, lon] format
        expect(result.data.geometry[0]).toEqual([52.52, 13.405]);
        expect(result.data.geometry[1]).toEqual([52.521, 13.406]);
      }
    });
  });
});
