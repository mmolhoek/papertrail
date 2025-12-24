import { Request, Response } from "express";
import { GPSController } from "../GPSController";
import { IRenderingOrchestrator } from "@core/interfaces";
import { success, failure } from "@core/types";
import { GPSError } from "@core/errors";

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe("GPSController", () => {
  let controller: GPSController;
  let mockOrchestrator: jest.Mocked<IRenderingOrchestrator>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  const mockGPSPosition = {
    latitude: 51.5074,
    longitude: -0.1278,
    altitude: 10,
    timestamp: new Date(),
    accuracy: 5,
    speed: 10,
    bearing: 90,
  };

  const mockSystemStatus = {
    uptime: 3600,
    gps: {
      connected: true,
      tracking: true,
      satellitesInUse: 8,
      lastUpdate: new Date(),
    },
    display: {
      initialized: true,
      busy: false,
      refreshCount: 5,
    },
    system: {
      cpuUsage: 25,
      memoryUsage: 50,
      temperature: 45,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnThis();

    mockResponse = {
      json: jsonMock,
      status: statusMock,
    };

    mockRequest = {};

    mockOrchestrator = {
      getCurrentPosition: jest.fn(),
      getSystemStatus: jest.fn(),
      isMockGPS: jest.fn(),
      setMockGPSPosition: jest.fn(),
    } as unknown as jest.Mocked<IRenderingOrchestrator>;

    controller = new GPSController(mockOrchestrator);
  });

  describe("getGPSPosition", () => {
    it("should return GPS position successfully", async () => {
      mockOrchestrator.getCurrentPosition.mockResolvedValue(
        success(mockGPSPosition),
      );

      await controller.getGPSPosition(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          latitude: mockGPSPosition.latitude,
          longitude: mockGPSPosition.longitude,
          altitude: mockGPSPosition.altitude,
          timestamp: mockGPSPosition.timestamp,
          accuracy: mockGPSPosition.accuracy,
          speed: mockGPSPosition.speed,
          bearing: mockGPSPosition.bearing,
        },
      });
    });

    it("should return 500 when getting position fails", async () => {
      mockOrchestrator.getCurrentPosition.mockResolvedValue(
        failure(GPSError.noFix()),
      );

      await controller.getGPSPosition(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: expect.any(String),
        }),
      });
    });

    it("should handle position with optional fields", async () => {
      const minimalPosition = {
        latitude: 51.5074,
        longitude: -0.1278,
        altitude: undefined,
        timestamp: new Date(),
        accuracy: undefined,
        speed: undefined,
        bearing: undefined,
      };

      mockOrchestrator.getCurrentPosition.mockResolvedValue(
        success(minimalPosition),
      );

      await controller.getGPSPosition(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          latitude: minimalPosition.latitude,
          longitude: minimalPosition.longitude,
        }),
      });
    });
  });

  describe("getGPSStatus", () => {
    it("should return GPS status successfully", async () => {
      mockOrchestrator.getSystemStatus.mockResolvedValue(
        success(mockSystemStatus),
      );

      await controller.getGPSStatus(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          connected: mockSystemStatus.gps.connected,
          tracking: mockSystemStatus.gps.tracking,
          satellitesInUse: mockSystemStatus.gps.satellitesInUse,
          lastUpdate: mockSystemStatus.gps.lastUpdate,
        },
      });
    });

    it("should return 500 when getting status fails", async () => {
      mockOrchestrator.getSystemStatus.mockResolvedValue(
        failure(GPSError.deviceNotFound("/dev/ttyUSB0")),
      );

      await controller.getGPSStatus(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: expect.any(String),
        }),
      });
    });

    it("should handle disconnected GPS status", async () => {
      const disconnectedStatus = {
        ...mockSystemStatus,
        gps: {
          connected: false,
          tracking: false,
          satellitesInUse: 0,
          lastUpdate: undefined,
        },
      };

      mockOrchestrator.getSystemStatus.mockResolvedValue(
        success(disconnectedStatus),
      );

      await controller.getGPSStatus(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          connected: false,
          tracking: false,
          satellitesInUse: 0,
          lastUpdate: undefined,
        },
      });
    });
  });

  describe("setMockGPSPosition", () => {
    it("should set mock GPS position successfully", async () => {
      mockRequest.body = { latitude: 51.5074, longitude: -0.1278 };
      mockOrchestrator.isMockGPS.mockReturnValue(true);
      mockOrchestrator.setMockGPSPosition.mockReturnValue(true);

      await controller.setMockGPSPosition(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(mockOrchestrator.setMockGPSPosition).toHaveBeenCalledWith(
        51.5074,
        -0.1278,
      );
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        message: "Mock GPS position updated",
        data: {
          latitude: 51.5074,
          longitude: -0.1278,
        },
      });
    });

    it("should return 400 for invalid latitude", async () => {
      mockRequest.body = { latitude: "invalid", longitude: -0.1278 };

      await controller.setMockGPSPosition(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "latitude and longitude must be numbers",
        },
      });
    });

    it("should return 400 for invalid longitude", async () => {
      mockRequest.body = { latitude: 51.5074, longitude: "invalid" };

      await controller.setMockGPSPosition(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "latitude and longitude must be numbers",
        },
      });
    });

    it("should return 400 for missing parameters", async () => {
      mockRequest.body = {};

      await controller.setMockGPSPosition(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "latitude and longitude must be numbers",
        },
      });
    });

    it("should return 400 when not using mock GPS", async () => {
      mockRequest.body = { latitude: 51.5074, longitude: -0.1278 };
      mockOrchestrator.isMockGPS.mockReturnValue(false);

      await controller.setMockGPSPosition(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: "NOT_MOCK_GPS",
          message: "Mock GPS is not available (using real GPS hardware)",
        },
      });
    });

    it("should return 500 when setMockGPSPosition fails", async () => {
      mockRequest.body = { latitude: 51.5074, longitude: -0.1278 };
      mockOrchestrator.isMockGPS.mockReturnValue(true);
      mockOrchestrator.setMockGPSPosition.mockReturnValue(false);

      await controller.setMockGPSPosition(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: "SET_POSITION_FAILED",
          message: "Failed to set mock GPS position",
        },
      });
    });
  });

  describe("checkMockGPS", () => {
    it("should return true when using mock GPS", async () => {
      mockOrchestrator.isMockGPS.mockReturnValue(true);

      await controller.checkMockGPS(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          isMockGPS: true,
        },
      });
    });

    it("should return false when using real GPS", async () => {
      mockOrchestrator.isMockGPS.mockReturnValue(false);

      await controller.checkMockGPS(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          isMockGPS: false,
        },
      });
    });
  });
});
