import { MapError, MapErrorCode } from "@errors/MapError";

describe("MapError", () => {
  describe("constructor", () => {
    it("should create error with message and default code", () => {
      const error = new MapError("Test error");
      expect(error.message).toBe("Test error");
      expect(error.code).toBe(MapErrorCode.UNKNOWN);
      expect(error.recoverable).toBe(false);
    });

    it("should create error with all parameters", () => {
      const error = new MapError(
        "Test error",
        MapErrorCode.FILE_NOT_FOUND,
        true,
        { filePath: "/path/to/file.gpx" },
      );
      expect(error.message).toBe("Test error");
      expect(error.code).toBe(MapErrorCode.FILE_NOT_FOUND);
      expect(error.recoverable).toBe(true);
    });
  });

  describe("static factory methods", () => {
    it("fileNotFound should create error with file path", () => {
      const error = MapError.fileNotFound("/path/to/track.gpx");

      expect(error.message).toContain("/path/to/track.gpx");
      expect(error.code).toBe(MapErrorCode.FILE_NOT_FOUND);
      expect(error.recoverable).toBe(false);
    });

    it("invalidGPX should create error with file path and reason", () => {
      const error = MapError.invalidGPX(
        "/path/track.gpx",
        "missing root element",
      );

      expect(error.message).toContain("missing root element");
      expect(error.code).toBe(MapErrorCode.INVALID_GPX);
      expect(error.recoverable).toBe(false);
    });

    it("noTracks should create error with file path", () => {
      const error = MapError.noTracks("/path/empty.gpx");

      expect(error.message).toContain("/path/empty.gpx");
      expect(error.message).toContain("no tracks");
      expect(error.code).toBe(MapErrorCode.NO_TRACKS);
      expect(error.recoverable).toBe(false);
    });

    it("noTrackPoints should create error with file path and track index", () => {
      const error = MapError.noTrackPoints("/path/track.gpx", 2);

      expect(error.message).toContain("Track 2");
      expect(error.message).toContain("no points");
      expect(error.code).toBe(MapErrorCode.NO_TRACK_POINTS);
      expect(error.recoverable).toBe(false);
    });

    it("trackNotFound should create error with file path, index, and count", () => {
      const error = MapError.trackNotFound("/path/track.gpx", 5, 3);

      expect(error.message).toContain("5");
      expect(error.message).toContain("3 tracks");
      expect(error.code).toBe(MapErrorCode.TRACK_INDEX_OUT_OF_BOUNDS);
      expect(error.recoverable).toBe(false);
    });

    it("parseError should create error with file path and original error", () => {
      const original = new Error("Unexpected token");
      const error = MapError.parseError("/path/track.gpx", original);

      expect(error.message).toContain("Unexpected token");
      expect(error.code).toBe(MapErrorCode.PARSE_ERROR);
      expect(error.recoverable).toBe(false);
    });

    it("fileTooLarge should create error with size and max size", () => {
      const error = MapError.fileTooLarge("/path/big.gpx", 15000000, 10000000);

      expect(error.message).toContain("15000000");
      expect(error.message).toContain("10000000");
      expect(error.code).toBe(MapErrorCode.FILE_TOO_LARGE);
      expect(error.recoverable).toBe(false);
    });

    it("directoryNotFound should create error with directory path", () => {
      const error = MapError.directoryNotFound("/path/to/gpx");

      expect(error.message).toContain("/path/to/gpx");
      expect(error.code).toBe(MapErrorCode.DIRECTORY_NOT_FOUND);
      expect(error.recoverable).toBe(false);
    });

    it("noGPXFiles should create error with directory path", () => {
      const error = MapError.noGPXFiles("/path/to/empty");

      expect(error.message).toContain("/path/to/empty");
      expect(error.code).toBe(MapErrorCode.NO_GPX_FILES);
      expect(error.recoverable).toBe(false);
    });

    it("invalidCoordinates should create error with lat/lon", () => {
      const error = MapError.invalidCoordinates(91.5, -180.5);

      expect(error.message).toContain("91.5");
      expect(error.message).toContain("-180.5");
      expect(error.code).toBe(MapErrorCode.INVALID_COORDINATES);
      expect(error.recoverable).toBe(false);
    });
  });

  describe("getUserMessage", () => {
    it("should return user message for FILE_NOT_FOUND", () => {
      const error = MapError.fileNotFound("/path/file.gpx");
      expect(error.getUserMessage()).toBe(
        "GPX file not found. Please check the file path.",
      );
    });

    it("should return user message for INVALID_GPX", () => {
      const error = MapError.invalidGPX("/path", "reason");
      expect(error.getUserMessage()).toBe(
        "Invalid GPX file format. Please use a valid GPX file.",
      );
    });

    it("should return user message for NO_TRACKS", () => {
      const error = MapError.noTracks("/path");
      expect(error.getUserMessage()).toBe("This GPX file contains no tracks.");
    });

    it("should return user message for NO_TRACK_POINTS", () => {
      const error = MapError.noTrackPoints("/path", 0);
      expect(error.getUserMessage()).toBe(
        "This track has no points to display.",
      );
    });

    it("should return user message for FILE_TOO_LARGE", () => {
      const error = MapError.fileTooLarge("/path", 100, 50);
      expect(error.getUserMessage()).toBe(
        "GPX file is too large. Please use a smaller file.",
      );
    });

    it("should return user message for NO_GPX_FILES", () => {
      const error = MapError.noGPXFiles("/path");
      expect(error.getUserMessage()).toBe(
        "No GPX files found. Please add GPX files to the directory.",
      );
    });

    it("should return default user message for UNKNOWN", () => {
      const error = new MapError("Test", MapErrorCode.UNKNOWN);
      expect(error.getUserMessage()).toBe(
        "Error loading map data. Please try again.",
      );
    });
  });
});
