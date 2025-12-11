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
});
