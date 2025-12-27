/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import { TrackController } from "../TrackController";
import { success, failure } from "@core/types";
import * as fs from "fs/promises";

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock fs/promises
jest.mock("fs/promises");
const mockedFs = fs as jest.Mocked<typeof fs>;

// Mock file validation
jest.mock("@web/validation", () => ({
  validateUploadedFile: jest.fn(),
}));

import { validateUploadedFile } from "@web/validation";
const mockedValidateUploadedFile = validateUploadedFile as jest.MockedFunction<
  typeof validateUploadedFile
>;

// Mock express request and response
const mockRequest = (
  body = {},
  params = {},
  query = {},
  file?: Express.Multer.File,
) =>
  ({
    body,
    params,
    query,
    file,
  }) as Request;

const mockResponse = () => {
  const res: Partial<Response> = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

// Create mock map service
const createMockMapService = () => ({
  getGPXFileInfo: jest.fn().mockResolvedValue(success([])),
  getTrack: jest.fn().mockResolvedValue(
    success({
      name: "Test Track",
      segments: [
        {
          points: [
            { latitude: 51.5074, longitude: -0.1278, altitude: 10 },
            { latitude: 51.508, longitude: -0.125, altitude: 15 },
          ],
        },
      ],
    }),
  ),
  validateGPXFile: jest.fn().mockResolvedValue(success(undefined)),
  loadGPXFile: jest.fn().mockResolvedValue(
    success({
      tracks: [
        {
          segments: [
            {
              points: [
                { latitude: 51.5074, longitude: -0.1278 },
                { latitude: 51.508, longitude: -0.125 },
              ],
            },
          ],
        },
      ],
      waypoints: [],
    }),
  ),
  calculateDistance: jest.fn().mockReturnValue(1000),
  clearCache: jest.fn(),
});

// Create mock config service
const createMockConfigService = () => ({
  getActiveGPXPath: jest.fn().mockReturnValue(null),
});

// Create mock multer file
const createMockFile = (
  originalname = "test.gpx",
  path = "/tmp/upload123",
): Express.Multer.File => ({
  fieldname: "gpxFile",
  originalname,
  encoding: "7bit",
  mimetype: "application/gpx+xml",
  size: 1024,
  destination: "/tmp",
  filename: "upload123",
  path,
  buffer: Buffer.from(""),
  stream: null as any,
});

describe("TrackController", () => {
  let controller: TrackController;
  let mockMapService: ReturnType<typeof createMockMapService>;
  let mockConfigService: ReturnType<typeof createMockConfigService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMapService = createMockMapService();
    mockConfigService = createMockConfigService();

    // Setup default fs mocks
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.unlink.mockResolvedValue(undefined);
    mockedFs.copyFile.mockResolvedValue(undefined);
    mockedFs.access.mockRejectedValue({ code: "ENOENT" }); // File doesn't exist by default

    // Setup default validation mock
    mockedValidateUploadedFile.mockResolvedValue({ valid: true });

    controller = new TrackController(
      mockMapService as any,
      mockConfigService as any,
      undefined, // mapSnapService
      "./data/gpx-files",
    );
  });

  describe("getGPXFiles", () => {
    it("should return list of GPX files", async () => {
      const mockFiles = [
        {
          path: "./data/gpx-files/track1.gpx",
          fileName: "track1.gpx",
          trackCount: 1,
          pointCount: 100,
          totalDistance: 5000,
          waypointCount: 2,
          fileSize: 1024,
          lastModified: new Date().toISOString(),
        },
      ];
      mockMapService.getGPXFileInfo.mockResolvedValue(success(mockFiles));

      const req = mockRequest();
      const res = mockResponse();

      await controller.getGPXFiles(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          files: [
            expect.objectContaining({
              fileName: "track1.gpx",
              trackName: "track1",
              pointCount: 100,
              totalDistance: 5000,
            }),
          ],
        },
      });
    });

    it("should return empty array when mapService unavailable", async () => {
      const controllerWithoutMap = new TrackController();
      const req = mockRequest();
      const res = mockResponse();

      await controllerWithoutMap.getGPXFiles(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { files: [] },
      });
    });

    it("should return empty array on error", async () => {
      mockMapService.getGPXFileInfo.mockResolvedValue(
        failure(new Error("Read failed")),
      );
      const req = mockRequest();
      const res = mockResponse();

      await controller.getGPXFiles(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { files: [] },
      });
    });
  });

  describe("getActiveTrackStart", () => {
    it("should return starting point of active track", async () => {
      mockConfigService.getActiveGPXPath.mockReturnValue(
        "./data/gpx-files/active.gpx",
      );

      const req = mockRequest();
      const res = mockResponse();

      await controller.getActiveTrackStart(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          startPoint: {
            lat: 51.5074,
            lon: -0.1278,
            altitude: 10,
          },
          trackName: "Test Track",
        },
      });
    });

    it("should return null when no active track", async () => {
      const req = mockRequest();
      const res = mockResponse();

      await controller.getActiveTrackStart(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          startPoint: null,
          message: "No active track set",
        },
      });
    });

    it("should return 503 when mapService unavailable", async () => {
      const controllerWithoutMap = new TrackController(
        undefined,
        mockConfigService as any,
      );
      const req = mockRequest();
      const res = mockResponse();

      await controllerWithoutMap.getActiveTrackStart(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "SERVICE_UNAVAILABLE" }),
        }),
      );
    });

    it("should return 503 when configService unavailable", async () => {
      const controllerWithoutConfig = new TrackController(
        mockMapService as any,
        undefined,
      );
      const req = mockRequest();
      const res = mockResponse();

      await controllerWithoutConfig.getActiveTrackStart(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 500 when track load fails", async () => {
      mockConfigService.getActiveGPXPath.mockReturnValue("./data/active.gpx");
      mockMapService.getTrack.mockResolvedValue(
        failure(new Error("Load failed")),
      );

      const req = mockRequest();
      const res = mockResponse();

      await controller.getActiveTrackStart(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "TRACK_LOAD_FAILED" }),
        }),
      );
    });

    it("should return null when track has no points", async () => {
      mockConfigService.getActiveGPXPath.mockReturnValue("./data/active.gpx");
      mockMapService.getTrack.mockResolvedValue(
        success({
          name: "Empty Track",
          segments: [],
        }),
      );

      const req = mockRequest();
      const res = mockResponse();

      await controller.getActiveTrackStart(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          startPoint: null,
          message: "Active track has no points",
        },
      });
    });
  });

  describe("uploadGPXFile", () => {
    it("should upload a valid GPX file successfully", async () => {
      const file = createMockFile("test-track.gpx");
      const req = mockRequest({ trackName: "My Track" }, {}, {}, file);
      const res = mockResponse();

      await controller.uploadGPXFile(req, res);

      expect(mockedFs.mkdir).toHaveBeenCalledWith("./data/gpx-files", {
        recursive: true,
      });
      expect(mockedFs.copyFile).toHaveBeenCalled();
      expect(mockedFs.unlink).toHaveBeenCalledWith(file.path);
      expect(mockMapService.clearCache).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            fileName: "My_Track.gpx",
          }),
        }),
      );
    });

    it("should return 400 when no file uploaded", async () => {
      const req = mockRequest();
      const res = mockResponse();

      await controller.uploadGPXFile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "NO_FILE" }),
        }),
      );
    });

    it("should return 400 for invalid file type", async () => {
      mockedValidateUploadedFile.mockResolvedValue({
        valid: false,
        error: "Invalid file type",
        detectedType: "text/plain",
      });
      const file = createMockFile("test.txt");
      const req = mockRequest({}, {}, {}, file);
      const res = mockResponse();

      await controller.uploadGPXFile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "INVALID_FILE_TYPE" }),
        }),
      );
      expect(mockedFs.unlink).toHaveBeenCalledWith(file.path);
    });

    it("should return 400 for invalid GPX content", async () => {
      mockMapService.validateGPXFile.mockResolvedValue(
        failure(new Error("Invalid GPX")),
      );
      const file = createMockFile("invalid.gpx");
      const req = mockRequest({}, {}, {}, file);
      const res = mockResponse();

      await controller.uploadGPXFile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "INVALID_GPX" }),
        }),
      );
    });

    it("should return 409 when file already exists", async () => {
      mockedFs.access.mockResolvedValue(undefined); // File exists
      const file = createMockFile("existing.gpx");
      const req = mockRequest({ trackName: "existing" }, {}, {}, file);
      const res = mockResponse();

      await controller.uploadGPXFile(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "FILE_EXISTS" }),
        }),
      );
    });

    it("should use track name from GPX when no custom name provided", async () => {
      const file = createMockFile("track.gpx");
      const req = mockRequest({}, {}, {}, file);
      const res = mockResponse();

      await controller.uploadGPXFile(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            fileName: "Test_Track.gpx",
          }),
        }),
      );
    });

    it("should use original filename when track has no name", async () => {
      mockMapService.getTrack.mockResolvedValue(
        success({
          name: "Unnamed Track",
          segments: [],
        }),
      );
      const file = createMockFile("my-route.gpx");
      const req = mockRequest({}, {}, {}, file);
      const res = mockResponse();

      await controller.uploadGPXFile(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            fileName: "my-route.gpx",
          }),
        }),
      );
    });

    it("should sanitize special characters in filename", async () => {
      const file = createMockFile("track.gpx");
      const req = mockRequest(
        { trackName: "My Track! @#$%^&*()" },
        {},
        {},
        file,
      );
      const res = mockResponse();

      await controller.uploadGPXFile(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fileName: expect.stringMatching(/^My_Track_+\.gpx$/),
          }),
        }),
      );
    });

    it("should handle upload error", async () => {
      mockedFs.copyFile.mockRejectedValue(new Error("Disk full"));
      const file = createMockFile("track.gpx");
      const req = mockRequest({ trackName: "Test" }, {}, {}, file);
      const res = mockResponse();

      await controller.uploadGPXFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "UPLOAD_FAILED" }),
        }),
      );
    });

    it("should work without mapService", async () => {
      const controllerWithoutMap = new TrackController(
        undefined,
        mockConfigService as any,
        undefined, // mapSnapService
        "./data/gpx-files",
      );
      const file = createMockFile("track.gpx");
      const req = mockRequest({ trackName: "Test" }, {}, {}, file);
      const res = mockResponse();

      await controllerWithoutMap.uploadGPXFile(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
    });
  });

  describe("deleteGPXFile", () => {
    it("should delete a GPX file successfully", async () => {
      mockedFs.access.mockResolvedValue(undefined); // File exists
      const req = mockRequest({}, { fileName: "track.gpx" });
      const res = mockResponse();

      await controller.deleteGPXFile(req, res);

      expect(mockedFs.unlink).toHaveBeenCalledWith(
        expect.stringContaining("track.gpx"),
      );
      expect(mockMapService.clearCache).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "File deleted successfully",
      });
    });

    it("should return 400 when fileName is missing", async () => {
      const req = mockRequest({}, {});
      const res = mockResponse();

      await controller.deleteGPXFile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "INVALID_REQUEST" }),
        }),
      );
    });

    it("should return 400 for non-GPX files", async () => {
      const req = mockRequest({}, { fileName: "file.txt" });
      const res = mockResponse();

      await controller.deleteGPXFile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "INVALID_FILE_TYPE" }),
        }),
      );
    });

    it("should return 404 when file not found", async () => {
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      mockedFs.access.mockRejectedValue(error);
      mockedFs.unlink.mockRejectedValue(error);

      const req = mockRequest({}, { fileName: "nonexistent.gpx" });
      const res = mockResponse();

      await controller.deleteGPXFile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "FILE_NOT_FOUND" }),
        }),
      );
    });

    it("should return 500 on delete error", async () => {
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.unlink.mockRejectedValue(new Error("Permission denied"));

      const req = mockRequest({}, { fileName: "track.gpx" });
      const res = mockResponse();

      await controller.deleteGPXFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "DELETE_FAILED" }),
        }),
      );
    });

    it("should prevent path traversal attacks", async () => {
      mockedFs.access.mockResolvedValue(undefined);
      const req = mockRequest({}, { fileName: "../../../etc/passwd.gpx" });
      const res = mockResponse();

      await controller.deleteGPXFile(req, res);

      // Should only use the basename, not the full path with traversal
      expect(mockedFs.unlink).toHaveBeenCalledWith(
        expect.stringContaining("passwd.gpx"),
      );
      // Ensure it doesn't contain path traversal
      expect(mockedFs.unlink).not.toHaveBeenCalledWith(
        expect.stringContaining("../"),
      );
    });

    it("should work without mapService", async () => {
      const controllerWithoutMap = new TrackController(
        undefined,
        mockConfigService as any,
        undefined, // mapSnapService
        "./data/gpx-files",
      );
      mockedFs.access.mockResolvedValue(undefined);

      const req = mockRequest({}, { fileName: "track.gpx" });
      const res = mockResponse();

      await controllerWithoutMap.deleteGPXFile(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "File deleted successfully",
      });
    });
  });
});
