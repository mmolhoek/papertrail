import { MapService } from "@services/map/MapService";
import { GPXTrack } from "@core/types";
import { MapError } from "@core/errors";
import * as fs from "fs/promises";
import * as path from "path";

// Mock fs module
jest.mock("fs/promises");
jest.mock("path");

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;

// Sample GPX content for testing
const sampleGPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test">
  <metadata>
    <name>Test Track</name>
    <desc>A test track</desc>
    <time>2024-01-01T12:00:00Z</time>
  </metadata>
  <trk>
    <name>Morning Run</name>
    <type>running</type>
    <trkseg>
      <trkpt lat="52.5200" lon="13.4050">
        <ele>50</ele>
        <time>2024-01-01T08:00:00Z</time>
      </trkpt>
      <trkpt lat="52.5210" lon="13.4060">
        <ele>55</ele>
        <time>2024-01-01T08:01:00Z</time>
      </trkpt>
      <trkpt lat="52.5220" lon="13.4070">
        <ele>60</ele>
        <time>2024-01-01T08:02:00Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

const emptyGPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test">
  <metadata>
    <name>Empty Track</name>
  </metadata>
</gpx>`;

const gpxWithEmptySegment = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test">
  <trk>
    <name>Empty Segment Track</name>
    <trkseg>
    </trkseg>
  </trk>
</gpx>`;

const gpxWithWaypoints = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test">
  <wpt lat="52.5200" lon="13.4050">
    <ele>100</ele>
    <name>Start Point</name>
    <time>2024-01-01T08:00:00Z</time>
  </wpt>
  <wpt lat="52.5300" lon="13.4150">
    <name>End Point</name>
  </wpt>
  <trk>
    <name>Track with Waypoints</name>
    <trkseg>
      <trkpt lat="52.5200" lon="13.4050">
        <ele>100</ele>
      </trkpt>
      <trkpt lat="52.5300" lon="13.4150">
        <ele>110</ele>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

const gpxWithInvalidWaypoint = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test">
  <wpt lat="invalid" lon="13.4050">
    <name>Invalid Point</name>
  </wpt>
  <wpt lat="52.5200" lon="13.4050">
    <name>Valid Point</name>
  </wpt>
  <trk>
    <name>Track</name>
    <trkseg>
      <trkpt lat="52.5200" lon="13.4050"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const gpxWithInvalidTrackpoint = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test">
  <trk>
    <name>Track with Invalid Points</name>
    <trkseg>
      <trkpt lat="invalid" lon="13.4050"></trkpt>
      <trkpt lat="52.5200" lon="13.4050"></trkpt>
      <trkpt lat="52.5210" lon="notanumber"></trkpt>
      <trkpt lat="52.5220" lon="13.4070"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const gpxWithMultipleTracks = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test">
  <trk>
    <name>Track 1</name>
    <trkseg>
      <trkpt lat="52.5200" lon="13.4050"></trkpt>
      <trkpt lat="52.5210" lon="13.4060"></trkpt>
    </trkseg>
  </trk>
  <trk>
    <name>Track 2</name>
    <trkseg>
      <trkpt lat="52.5300" lon="13.4150"></trkpt>
      <trkpt lat="52.5310" lon="13.4160"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const gpxWithMultipleSegments = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test">
  <trk>
    <name>Multi-Segment Track</name>
    <trkseg>
      <trkpt lat="52.5200" lon="13.4050"></trkpt>
      <trkpt lat="52.5210" lon="13.4060"></trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="52.5300" lon="13.4150"></trkpt>
      <trkpt lat="52.5310" lon="13.4160"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const gpxNoRoot = `<?xml version="1.0" encoding="UTF-8"?>
<notgpx version="1.1">
  <trk><name>Test</name></trk>
</notgpx>`;

const gpxWithNoName = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test">
  <trk>
    <trkseg>
      <trkpt lat="52.5200" lon="13.4050"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

describe("MapService", () => {
  let mapService: MapService;
  const testDirectory = "./test-gpx";

  beforeEach(() => {
    jest.clearAllMocks();
    mapService = new MapService({
      gpxDirectory: testDirectory,
      maxFileSize: 10 * 1024 * 1024,
      enableCache: true,
      defaultZoomLevel: 12,
      minZoomLevel: 1,
      maxZoomLevel: 20,
    });

    // Default path.join mock
    mockPath.join.mockImplementation((...args) => args.join("/"));
    mockPath.basename.mockImplementation((p) => p.split("/").pop() || "");
  });

  afterEach(() => {
    mapService.clearCache();
  });

  describe("loadGPXFile", () => {
    it("should load and parse a valid GPX file", async () => {
      mockFs.access.mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFs.stat.mockResolvedValue({ size: 1024, mtime: new Date() } as any);
      mockFs.readFile.mockResolvedValue(sampleGPX);

      const result = await mapService.loadGPXFile("./test.gpx");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tracks).toHaveLength(1);
        expect(result.data.tracks[0].name).toBe("Morning Run");
        expect(result.data.tracks[0].segments[0].points).toHaveLength(3);
      }
    });

    it("should return error for non-existent file", async () => {
      mockFs.access.mockRejectedValue(new Error("ENOENT"));

      const result = await mapService.loadGPXFile("./nonexistent.gpx");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as MapError).code).toBe("MAP_FILE_NOT_FOUND");
      }
    });

    it("should return error for file too large", async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({
        size: 20 * 1024 * 1024,
        mtime: new Date(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const result = await mapService.loadGPXFile("./large.gpx");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as MapError).code).toBe("MAP_FILE_TOO_LARGE");
      }
    });

    it("should use cached data on second load", async () => {
      mockFs.access.mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFs.stat.mockResolvedValue({ size: 1024, mtime: new Date() } as any);
      mockFs.readFile.mockResolvedValue(sampleGPX);

      await mapService.loadGPXFile("./test.gpx");
      await mapService.loadGPXFile("./test.gpx");

      // Should only read file once
      expect(mockFs.readFile).toHaveBeenCalledTimes(1);
    });

    it("should handle invalid XML", async () => {
      mockFs.access.mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFs.stat.mockResolvedValue({ size: 1024, mtime: new Date() } as any);
      mockFs.readFile.mockResolvedValue("invalid xml content");

      const result = await mapService.loadGPXFile("./invalid.gpx");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as MapError).code).toBe("MAP_PARSE_ERROR");
      }
    });
  });

  describe("getTrack", () => {
    beforeEach(() => {
      mockFs.access.mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFs.stat.mockResolvedValue({ size: 1024, mtime: new Date() } as any);
      mockFs.readFile.mockResolvedValue(sampleGPX);
    });

    it("should return first track by default", async () => {
      const result = await mapService.getTrack("./test.gpx");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Morning Run");
      }
    });

    it("should return specified track by index", async () => {
      const result = await mapService.getTrack("./test.gpx", 0);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Morning Run");
      }
    });

    it("should return error for invalid track index", async () => {
      const result = await mapService.getTrack("./test.gpx", 10);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as MapError).code).toBe(
          "MAP_TRACK_INDEX_OUT_OF_BOUNDS",
        );
      }
    });

    it("should return error for GPX with no tracks", async () => {
      mockFs.readFile.mockResolvedValue(emptyGPX);

      const result = await mapService.getTrack("./empty.gpx");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as MapError).code).toBe("MAP_NO_TRACKS");
      }
    });
  });

  describe("listAvailableGPXFiles", () => {
    it("should list GPX files in directory", async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([
        "track1.gpx",
        "track2.gpx",
        "notes.txt",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any);

      const result = await mapService.listAvailableGPXFiles();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0]).toContain("track1.gpx");
      }
    });

    it("should return error if directory does not exist", async () => {
      mockFs.access.mockRejectedValue(new Error("ENOENT"));

      const result = await mapService.listAvailableGPXFiles();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as MapError).code).toBe("MAP_DIRECTORY_NOT_FOUND");
      }
    });

    it("should return error if no GPX files found", async () => {
      mockFs.access.mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFs.readdir.mockResolvedValue(["notes.txt", "readme.md"] as any);

      const result = await mapService.listAvailableGPXFiles();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as MapError).code).toBe("MAP_NO_GPX_FILES");
      }
    });
  });

  describe("getGPXFileInfo", () => {
    beforeEach(() => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({
        size: 1024,
        mtime: new Date("2024-01-01"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      mockFs.readFile.mockResolvedValue(sampleGPX);
    });

    it("should get info for all files if none specified", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFs.readdir.mockResolvedValue(["track1.gpx", "track2.gpx"] as any);

      const result = await mapService.getGPXFileInfo();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
      }
    });

    it("should get info for specified files", async () => {
      const result = await mapService.getGPXFileInfo(["./track1.gpx"]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]).toHaveProperty("fileName");
        expect(result.data[0]).toHaveProperty("trackCount");
        expect(result.data[0]).toHaveProperty("pointCount");
        expect(result.data[0].pointCount).toBe(3);
      }
    });
  });

  describe("calculateBounds", () => {
    it("should calculate correct bounding box", () => {
      const track: GPXTrack = {
        name: "Test",
        segments: [
          {
            points: [
              { latitude: 52.52, longitude: 13.405, timestamp: new Date() },
              { latitude: 52.522, longitude: 13.407, timestamp: new Date() },
              { latitude: 52.521, longitude: 13.406, timestamp: new Date() },
            ],
          },
        ],
      };

      const bounds = mapService.calculateBounds(track);

      expect(bounds.minLat).toBe(52.52);
      expect(bounds.maxLat).toBe(52.522);
      expect(bounds.minLon).toBe(13.405);
      expect(bounds.maxLon).toBe(13.407);
    });
  });

  describe("calculateDistance", () => {
    it("should calculate track distance", () => {
      const track: GPXTrack = {
        name: "Test",
        segments: [
          {
            points: [
              { latitude: 52.52, longitude: 13.405, timestamp: new Date() },
              { latitude: 52.521, longitude: 13.406, timestamp: new Date() },
              { latitude: 52.522, longitude: 13.407, timestamp: new Date() },
            ],
          },
        ],
      };

      const distance = mapService.calculateDistance(track);

      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(10000); // Should be less than 10km
    });

    it("should return 0 for single point track", () => {
      const track: GPXTrack = {
        name: "Test",
        segments: [
          {
            points: [
              { latitude: 52.52, longitude: 13.405, timestamp: new Date() },
            ],
          },
        ],
      };

      const distance = mapService.calculateDistance(track);

      expect(distance).toBe(0);
    });
  });

  describe("calculateElevation", () => {
    it("should calculate elevation gain and loss", () => {
      const track: GPXTrack = {
        name: "Test",
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
                altitude: 55,
                timestamp: new Date(),
              },
              {
                latitude: 52.522,
                longitude: 13.407,
                altitude: 52,
                timestamp: new Date(),
              },
            ],
          },
        ],
      };

      const elevation = mapService.calculateElevation(track);

      expect(elevation.gain).toBe(5);
      expect(elevation.loss).toBe(3);
      expect(elevation.min).toBe(50);
      expect(elevation.max).toBe(55);
    });

    it("should handle missing elevation data", () => {
      const track: GPXTrack = {
        name: "Test",
        segments: [
          {
            points: [
              { latitude: 52.52, longitude: 13.405, timestamp: new Date() },
              { latitude: 52.521, longitude: 13.406, timestamp: new Date() },
            ],
          },
        ],
      };

      const elevation = mapService.calculateElevation(track);

      expect(elevation.gain).toBe(0);
      expect(elevation.loss).toBe(0);
      expect(elevation.min).toBe(0);
      expect(elevation.max).toBe(0);
    });
  });

  describe("simplifyTrack", () => {
    it("should simplify track with Douglas-Peucker algorithm", () => {
      const track: GPXTrack = {
        name: "Test",
        segments: [
          {
            points: [
              { latitude: 52.52, longitude: 13.405, timestamp: new Date() },
              { latitude: 52.5205, longitude: 13.4055, timestamp: new Date() },
              { latitude: 52.521, longitude: 13.406, timestamp: new Date() },
              { latitude: 52.5215, longitude: 13.4065, timestamp: new Date() },
              { latitude: 52.522, longitude: 13.407, timestamp: new Date() },
            ],
          },
        ],
      };

      const simplified = mapService.simplifyTrack(track, 100);

      expect(simplified.segments[0].points.length).toBeLessThanOrEqual(
        track.segments[0].points.length,
      );
    });

    it("should keep track with 2 or fewer points unchanged", () => {
      const track: GPXTrack = {
        name: "Test",
        segments: [
          {
            points: [
              { latitude: 52.52, longitude: 13.405, timestamp: new Date() },
              { latitude: 52.522, longitude: 13.407, timestamp: new Date() },
            ],
          },
        ],
      };

      const simplified = mapService.simplifyTrack(track, 100);

      expect(simplified.segments[0].points.length).toBe(2);
    });
  });

  describe("validateGPXFile", () => {
    it("should validate correct GPX file", async () => {
      mockFs.access.mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFs.stat.mockResolvedValue({ size: 1024, mtime: new Date() } as any);
      mockFs.readFile.mockResolvedValue(sampleGPX);

      const result = await mapService.validateGPXFile("./test.gpx");

      expect(result.success).toBe(true);
    });

    it("should reject GPX with no tracks", async () => {
      mockFs.access.mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFs.stat.mockResolvedValue({ size: 1024, mtime: new Date() } as any);
      mockFs.readFile.mockResolvedValue(emptyGPX);

      const result = await mapService.validateGPXFile("./empty.gpx");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as MapError).code).toBe("MAP_NO_TRACKS");
      }
    });
  });

  describe("clearCache", () => {
    it("should clear the cache", async () => {
      mockFs.access.mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFs.stat.mockResolvedValue({ size: 1024, mtime: new Date() } as any);
      mockFs.readFile.mockResolvedValue(sampleGPX);

      await mapService.loadGPXFile("./test.gpx");
      mapService.clearCache();
      await mapService.loadGPXFile("./test.gpx");

      // Should read file twice (once before cache clear, once after)
      expect(mockFs.readFile).toHaveBeenCalledTimes(2);
    });
  });

  describe("loadGPXFile - error handling", () => {
    it("should handle MapError thrown during parsing", async () => {
      mockFs.access.mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFs.stat.mockResolvedValue({ size: 1024, mtime: new Date() } as any);
      mockFs.readFile.mockResolvedValue(gpxNoRoot);

      const result = await mapService.loadGPXFile("./invalid.gpx");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as MapError).code).toBe("MAP_INVALID_GPX");
      }
    });

    it("should handle unknown error types", async () => {
      mockFs.access.mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFs.stat.mockResolvedValue({ size: 1024, mtime: new Date() } as any);
      mockFs.readFile.mockRejectedValue("string error");

      const result = await mapService.loadGPXFile("./test.gpx");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as MapError).code).toBe("MAP_PARSE_ERROR");
      }
    });

    it("should not use cache when caching is disabled", async () => {
      const noCacheService = new MapService({
        gpxDirectory: testDirectory,
        maxFileSize: 10 * 1024 * 1024,
        enableCache: false,
        defaultZoomLevel: 12,
        minZoomLevel: 1,
        maxZoomLevel: 20,
      });

      mockFs.access.mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFs.stat.mockResolvedValue({ size: 1024, mtime: new Date() } as any);
      mockFs.readFile.mockResolvedValue(sampleGPX);

      await noCacheService.loadGPXFile("./test.gpx");
      await noCacheService.loadGPXFile("./test.gpx");

      // Should read file twice since caching is disabled
      expect(mockFs.readFile).toHaveBeenCalledTimes(2);
    });
  });

  describe("getTrack - edge cases", () => {
    it("should return error when loadGPXFile fails", async () => {
      mockFs.access.mockRejectedValue(new Error("ENOENT"));

      const result = await mapService.getTrack("./nonexistent.gpx");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as MapError).code).toBe("MAP_FILE_NOT_FOUND");
      }
    });

    it("should return error when track has no points", async () => {
      mockFs.access.mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFs.stat.mockResolvedValue({ size: 1024, mtime: new Date() } as any);
      mockFs.readFile.mockResolvedValue(gpxWithEmptySegment);

      const result = await mapService.getTrack("./empty-segment.gpx");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as MapError).code).toBe("MAP_NO_TRACK_POINTS");
      }
    });
  });

  describe("listAvailableGPXFiles - error handling", () => {
    it("should handle Error exceptions during readdir", async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockRejectedValue(new Error("Permission denied"));

      const result = await mapService.listAvailableGPXFiles();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as MapError).code).toBe(
          "MAP_DIRECTORY_READ_ERROR",
        );
        expect(result.error.message).toContain("Permission denied");
      }
    });

    it("should handle non-Error exceptions during readdir", async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockRejectedValue("string error");

      const result = await mapService.listAvailableGPXFiles();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as MapError).code).toBe(
          "MAP_DIRECTORY_READ_ERROR",
        );
      }
    });

    it("should filter case-insensitively for .GPX extension", async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([
        "track1.GPX",
        "track2.gpx",
        "track3.Gpx",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any);

      const result = await mapService.listAvailableGPXFiles();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
      }
    });
  });

  describe("getGPXFileInfo - edge cases", () => {
    it("should return failure when listAvailableGPXFiles fails", async () => {
      mockFs.access.mockRejectedValue(new Error("ENOENT"));

      const result = await mapService.getGPXFileInfo();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as MapError).code).toBe("MAP_DIRECTORY_NOT_FOUND");
      }
    });

    it("should skip files that fail to load", async () => {
      mockFs.access.mockResolvedValue(undefined);
      // First call for stat fails, second succeeds
      mockFs.stat
        .mockRejectedValueOnce(new Error("File error"))
        .mockResolvedValue({
          size: 1024,
          mtime: new Date("2024-01-01"),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      mockFs.readFile.mockResolvedValue(sampleGPX);

      const result = await mapService.getGPXFileInfo([
        "./bad.gpx",
        "./good.gpx",
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
      }
    });

    it("should skip files that fail to parse", async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({
        size: 1024,
        mtime: new Date("2024-01-01"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      mockFs.readFile
        .mockResolvedValueOnce("invalid xml")
        .mockResolvedValue(sampleGPX);

      // Clear cache to force re-read
      mapService.clearCache();

      const result = await mapService.getGPXFileInfo([
        "./bad.gpx",
        "./good.gpx",
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
      }
    });

    it("should handle Error exception in outer try block", async () => {
      // Create a scenario where the outer try fails
      const brokenService = new MapService({
        gpxDirectory: testDirectory,
        maxFileSize: 10 * 1024 * 1024,
        enableCache: true,
        defaultZoomLevel: 12,
        minZoomLevel: 1,
        maxZoomLevel: 20,
      });

      // Mock listAvailableGPXFiles to throw
      jest
        .spyOn(brokenService, "listAvailableGPXFiles")
        .mockRejectedValue(new Error("Unexpected error"));

      const result = await brokenService.getGPXFileInfo();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Unexpected error");
      }
    });

    it("should handle non-Error exception in outer try block", async () => {
      const brokenService = new MapService({
        gpxDirectory: testDirectory,
        maxFileSize: 10 * 1024 * 1024,
        enableCache: true,
        defaultZoomLevel: 12,
        minZoomLevel: 1,
        maxZoomLevel: 20,
      });

      jest
        .spyOn(brokenService, "listAvailableGPXFiles")
        .mockRejectedValue("string error");

      const result = await brokenService.getGPXFileInfo();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as MapError).code).toBe("MAP_UNKNOWN_ERROR");
      }
    });

    it("should calculate total distance across multiple tracks", async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({
        size: 1024,
        mtime: new Date("2024-01-01"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      mockFs.readFile.mockResolvedValue(gpxWithMultipleTracks);

      const result = await mapService.getGPXFileInfo(["./multi.gpx"]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].trackCount).toBe(2);
        expect(result.data[0].totalDistance).toBeGreaterThan(0);
      }
    });

    it("should include waypoint count in file info", async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({
        size: 1024,
        mtime: new Date("2024-01-01"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      mockFs.readFile.mockResolvedValue(gpxWithWaypoints);

      const result = await mapService.getGPXFileInfo(["./waypoints.gpx"]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].waypointCount).toBe(2);
      }
    });
  });

  describe("validateGPXFile - edge cases", () => {
    it("should return failure when loadGPXFile fails", async () => {
      mockFs.access.mockRejectedValue(new Error("ENOENT"));

      const result = await mapService.validateGPXFile("./nonexistent.gpx");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as MapError).code).toBe("MAP_FILE_NOT_FOUND");
      }
    });

    it("should return failure for tracks with no points", async () => {
      mockFs.access.mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFs.stat.mockResolvedValue({ size: 1024, mtime: new Date() } as any);
      mockFs.readFile.mockResolvedValue(gpxWithEmptySegment);

      const result = await mapService.validateGPXFile("./empty-segment.gpx");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as MapError).code).toBe("MAP_NO_TRACK_POINTS");
      }
    });
  });

  describe("GPX parsing - waypoints", () => {
    beforeEach(() => {
      mockFs.access.mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFs.stat.mockResolvedValue({ size: 1024, mtime: new Date() } as any);
    });

    it("should parse waypoints with all fields", async () => {
      mockFs.readFile.mockResolvedValue(gpxWithWaypoints);

      const result = await mapService.loadGPXFile("./waypoints.gpx");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.waypoints).toHaveLength(2);
        expect(result.data.waypoints![0].name).toBe("Start Point");
        expect(result.data.waypoints![0].altitude).toBe(100);
        expect(result.data.waypoints![1].name).toBe("End Point");
        expect(result.data.waypoints![1].altitude).toBeUndefined();
      }
    });

    it("should skip waypoints with invalid coordinates", async () => {
      mockFs.readFile.mockResolvedValue(gpxWithInvalidWaypoint);

      const result = await mapService.loadGPXFile("./invalid-waypoint.gpx");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.waypoints).toHaveLength(1);
        expect(result.data.waypoints![0].name).toBe("Valid Point");
      }
    });
  });

  describe("GPX parsing - tracks", () => {
    beforeEach(() => {
      mockFs.access.mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFs.stat.mockResolvedValue({ size: 1024, mtime: new Date() } as any);
    });

    it("should skip trackpoints with invalid latitude", async () => {
      mockFs.readFile.mockResolvedValue(gpxWithInvalidTrackpoint);

      const result = await mapService.loadGPXFile("./invalid-points.gpx");

      expect(result.success).toBe(true);
      if (result.success) {
        // Only valid points should be included
        expect(result.data.tracks[0].segments[0].points).toHaveLength(2);
      }
    });

    it("should parse tracks without name as Unnamed Track", async () => {
      mockFs.readFile.mockResolvedValue(gpxWithNoName);

      const result = await mapService.loadGPXFile("./noname.gpx");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tracks[0].name).toBe("Unnamed Track");
      }
    });

    it("should parse multiple track segments", async () => {
      mockFs.readFile.mockResolvedValue(gpxWithMultipleSegments);

      const result = await mapService.loadGPXFile("./multi-segment.gpx");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tracks[0].segments).toHaveLength(2);
        expect(result.data.tracks[0].segments[0].points).toHaveLength(2);
        expect(result.data.tracks[0].segments[1].points).toHaveLength(2);
      }
    });

    it("should parse multiple tracks", async () => {
      mockFs.readFile.mockResolvedValue(gpxWithMultipleTracks);

      const result = await mapService.loadGPXFile("./multi-track.gpx");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tracks).toHaveLength(2);
        expect(result.data.tracks[0].name).toBe("Track 1");
        expect(result.data.tracks[1].name).toBe("Track 2");
      }
    });

    it("should reject GPX without root element", async () => {
      mockFs.readFile.mockResolvedValue(gpxNoRoot);

      const result = await mapService.loadGPXFile("./noroot.gpx");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as MapError).code).toBe("MAP_INVALID_GPX");
      }
    });
  });

  describe("simplifyTrack - Douglas-Peucker", () => {
    it("should recursively simplify when max distance exceeds tolerance", () => {
      // Create a track with points that form a significant deviation
      const track: GPXTrack = {
        name: "Test",
        segments: [
          {
            points: [
              { latitude: 0, longitude: 0, timestamp: new Date() },
              { latitude: 0.001, longitude: 0.5, timestamp: new Date() }, // Point off the line
              { latitude: 0.002, longitude: 1, timestamp: new Date() },
              { latitude: 0.003, longitude: 1.5, timestamp: new Date() }, // Point off the line
              { latitude: 0.004, longitude: 2, timestamp: new Date() },
            ],
          },
        ],
      };

      // Very small tolerance should keep most points
      const simplifiedSmall = mapService.simplifyTrack(track, 0.001);
      // Very large tolerance should remove most points
      const simplifiedLarge = mapService.simplifyTrack(track, 100000);

      expect(simplifiedSmall.segments[0].points.length).toBeGreaterThanOrEqual(
        2,
      );
      expect(simplifiedLarge.segments[0].points.length).toBe(2); // Only start and end
    });

    it("should handle nearly collinear points with large tolerance", () => {
      // Points nearly on a straight line
      const track: GPXTrack = {
        name: "Test",
        segments: [
          {
            points: [
              { latitude: 52.52, longitude: 13.405, timestamp: new Date() },
              { latitude: 52.521, longitude: 13.406, timestamp: new Date() },
              { latitude: 52.522, longitude: 13.407, timestamp: new Date() },
            ],
          },
        ],
      };

      // Large tolerance should simplify to just endpoints
      const simplified = mapService.simplifyTrack(track, 10000);

      expect(simplified.segments[0].points.length).toBe(2);
    });

    it("should handle perpendicular distance when start equals end", () => {
      // Create a track where first and last points are the same (closed loop)
      const track: GPXTrack = {
        name: "Closed Loop",
        segments: [
          {
            points: [
              { latitude: 52.52, longitude: 13.405, timestamp: new Date() },
              { latitude: 52.521, longitude: 13.406, timestamp: new Date() },
              { latitude: 52.52, longitude: 13.405, timestamp: new Date() }, // Same as first
            ],
          },
        ],
      };

      const simplified = mapService.simplifyTrack(track, 50);

      expect(simplified.segments[0].points.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("calculateDistance - edge cases", () => {
    it("should calculate distance across multiple segments", () => {
      const track: GPXTrack = {
        name: "Multi-segment",
        segments: [
          {
            points: [
              { latitude: 52.52, longitude: 13.405, timestamp: new Date() },
              { latitude: 52.521, longitude: 13.406, timestamp: new Date() },
            ],
          },
          {
            points: [
              { latitude: 52.522, longitude: 13.407, timestamp: new Date() },
              { latitude: 52.523, longitude: 13.408, timestamp: new Date() },
            ],
          },
        ],
      };

      const distance = mapService.calculateDistance(track);

      expect(distance).toBeGreaterThan(0);
    });

    it("should handle empty segments", () => {
      const track: GPXTrack = {
        name: "Empty",
        segments: [{ points: [] }],
      };

      const distance = mapService.calculateDistance(track);

      expect(distance).toBe(0);
    });
  });

  describe("calculateElevation - edge cases", () => {
    it("should handle partial elevation data", () => {
      const track: GPXTrack = {
        name: "Partial Elevation",
        segments: [
          {
            points: [
              {
                latitude: 52.52,
                longitude: 13.405,
                altitude: 100,
                timestamp: new Date(),
              },
              {
                latitude: 52.521,
                longitude: 13.406,
                // No altitude
                timestamp: new Date(),
              },
              {
                latitude: 52.522,
                longitude: 13.407,
                altitude: 110,
                timestamp: new Date(),
              },
            ],
          },
        ],
      };

      const elevation = mapService.calculateElevation(track);

      expect(elevation.min).toBe(100);
      expect(elevation.max).toBe(110);
    });

    it("should calculate across multiple segments", () => {
      const track: GPXTrack = {
        name: "Multi-segment Elevation",
        segments: [
          {
            points: [
              {
                latitude: 52.52,
                longitude: 13.405,
                altitude: 100,
                timestamp: new Date(),
              },
              {
                latitude: 52.521,
                longitude: 13.406,
                altitude: 120,
                timestamp: new Date(),
              },
            ],
          },
          {
            points: [
              {
                latitude: 52.522,
                longitude: 13.407,
                altitude: 110,
                timestamp: new Date(),
              },
              {
                latitude: 52.523,
                longitude: 13.408,
                altitude: 90,
                timestamp: new Date(),
              },
            ],
          },
        ],
      };

      const elevation = mapService.calculateElevation(track);

      expect(elevation.gain).toBe(20); // 100->120 = +20
      expect(elevation.loss).toBe(20); // 110->90 = -20
      expect(elevation.min).toBe(90);
      expect(elevation.max).toBe(120);
    });
  });

  describe("calculateBounds - edge cases", () => {
    it("should calculate bounds across multiple segments", () => {
      const track: GPXTrack = {
        name: "Multi-segment",
        segments: [
          {
            points: [
              { latitude: 52.52, longitude: 13.405, timestamp: new Date() },
              { latitude: 52.521, longitude: 13.406, timestamp: new Date() },
            ],
          },
          {
            points: [
              { latitude: 52.518, longitude: 13.403, timestamp: new Date() },
              { latitude: 52.523, longitude: 13.408, timestamp: new Date() },
            ],
          },
        ],
      };

      const bounds = mapService.calculateBounds(track);

      expect(bounds.minLat).toBe(52.518);
      expect(bounds.maxLat).toBe(52.523);
      expect(bounds.minLon).toBe(13.403);
      expect(bounds.maxLon).toBe(13.408);
    });
  });

  describe("default config", () => {
    it("should use default config when none provided", () => {
      const defaultService = new MapService();

      expect(defaultService).toBeDefined();
    });
  });
});
