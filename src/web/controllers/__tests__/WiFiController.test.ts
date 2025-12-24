import { Request, Response } from "express";
import { WiFiController } from "../WiFiController";
import { IWiFiService } from "@core/interfaces";
import { success, failure } from "@core/types";
import { WiFiError } from "@core/errors";

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe("WiFiController", () => {
  let controller: WiFiController;
  let mockWiFiService: jest.Mocked<IWiFiService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  const mockHotspotConfig = {
    ssid: "Papertrail-Hotspot",
    password: "securepassword123",
    updatedAt: new Date().toISOString(),
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

    mockWiFiService = {
      getHotspotConfig: jest.fn(),
      setHotspotConfig: jest.fn(),
      initialize: jest.fn(),
      dispose: jest.fn(),
      getStatus: jest.fn(),
      scanNetworks: jest.fn(),
      connectToNetwork: jest.fn(),
      disconnectFromNetwork: jest.fn(),
      getCurrentNetwork: jest.fn(),
      getSignalStrength: jest.fn(),
      startHotspot: jest.fn(),
      stopHotspot: jest.fn(),
      isHotspotActive: jest.fn(),
      getFallbackNetwork: jest.fn(),
      setFallbackNetwork: jest.fn(),
      clearFallbackNetwork: jest.fn(),
    } as unknown as jest.Mocked<IWiFiService>;

    controller = new WiFiController(mockWiFiService);
  });

  describe("getHotspotConfig", () => {
    it("should return hotspot config successfully", async () => {
      mockWiFiService.getHotspotConfig.mockReturnValue(mockHotspotConfig);

      await controller.getHotspotConfig(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          ssid: mockHotspotConfig.ssid,
          hasPassword: true,
          updatedAt: mockHotspotConfig.updatedAt,
        },
      });
    });

    it("should not expose password in response", async () => {
      mockWiFiService.getHotspotConfig.mockReturnValue(mockHotspotConfig);

      await controller.getHotspotConfig(
        mockRequest as Request,
        mockResponse as Response,
      );

      const responseData = jsonMock.mock.calls[0][0];
      expect(responseData.data.password).toBeUndefined();
      expect(responseData.data.hasPassword).toBe(true);
    });

    it("should indicate no password when not set", async () => {
      mockWiFiService.getHotspotConfig.mockReturnValue({
        ...mockHotspotConfig,
        password: "",
      });

      await controller.getHotspotConfig(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          ssid: mockHotspotConfig.ssid,
          hasPassword: false,
          updatedAt: mockHotspotConfig.updatedAt,
        },
      });
    });

    it("should return 503 when WiFi service is not available", async () => {
      const controllerWithoutService = new WiFiController(undefined);

      await controllerWithoutService.getHotspotConfig(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(503);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "WiFi service is not available",
        },
      });
    });

    it("should return 500 when getHotspotConfig throws", async () => {
      mockWiFiService.getHotspotConfig.mockImplementation(() => {
        throw new Error("Internal error");
      });

      await controller.getHotspotConfig(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to get hotspot configuration",
        },
      });
    });
  });

  describe("setHotspotConfig", () => {
    it("should update hotspot config successfully", async () => {
      mockRequest.body = {
        ssid: "NewHotspot",
        password: "newpassword123",
      };
      mockWiFiService.setHotspotConfig.mockResolvedValue(success(undefined));

      await controller.setHotspotConfig(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(mockWiFiService.setHotspotConfig).toHaveBeenCalledWith(
        "NewHotspot",
        "newpassword123",
      );
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        message: "Hotspot configuration updated successfully",
      });
    });

    it("should trim SSID whitespace", async () => {
      mockRequest.body = {
        ssid: "  TrimmedSSID  ",
        password: "password123",
      };
      mockWiFiService.setHotspotConfig.mockResolvedValue(success(undefined));

      await controller.setHotspotConfig(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(mockWiFiService.setHotspotConfig).toHaveBeenCalledWith(
        "TrimmedSSID",
        "password123",
      );
    });

    it("should return 503 when WiFi service is not available", async () => {
      const controllerWithoutService = new WiFiController(undefined);
      mockRequest.body = {
        ssid: "TestSSID",
        password: "password123",
      };

      await controllerWithoutService.setHotspotConfig(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(503);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "WiFi service is not available",
        },
      });
    });

    it("should return 400 when SSID is missing", async () => {
      mockRequest.body = {
        password: "password123",
      };

      await controller.setHotspotConfig(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "SSID is required and must be a non-empty string",
        },
      });
    });

    it("should return 400 when SSID is empty string", async () => {
      mockRequest.body = {
        ssid: "",
        password: "password123",
      };

      await controller.setHotspotConfig(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "SSID is required and must be a non-empty string",
        },
      });
    });

    it("should return 400 when SSID is only whitespace", async () => {
      mockRequest.body = {
        ssid: "   ",
        password: "password123",
      };

      await controller.setHotspotConfig(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "SSID is required and must be a non-empty string",
        },
      });
    });

    it("should return 400 when SSID is not a string", async () => {
      mockRequest.body = {
        ssid: 12345,
        password: "password123",
      };

      await controller.setHotspotConfig(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "SSID is required and must be a non-empty string",
        },
      });
    });

    it("should return 400 when password is missing", async () => {
      mockRequest.body = {
        ssid: "TestSSID",
      };

      await controller.setHotspotConfig(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message:
            "Password is required and must be at least 8 characters (WPA2 requirement)",
        },
      });
    });

    it("should return 400 when password is too short", async () => {
      mockRequest.body = {
        ssid: "TestSSID",
        password: "short",
      };

      await controller.setHotspotConfig(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message:
            "Password is required and must be at least 8 characters (WPA2 requirement)",
        },
      });
    });

    it("should return 400 when password is not a string", async () => {
      mockRequest.body = {
        ssid: "TestSSID",
        password: 12345678,
      };

      await controller.setHotspotConfig(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message:
            "Password is required and must be at least 8 characters (WPA2 requirement)",
        },
      });
    });

    it("should accept password with exactly 8 characters", async () => {
      mockRequest.body = {
        ssid: "TestSSID",
        password: "12345678",
      };
      mockWiFiService.setHotspotConfig.mockResolvedValue(success(undefined));

      await controller.setHotspotConfig(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(mockWiFiService.setHotspotConfig).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        message: "Hotspot configuration updated successfully",
      });
    });

    it("should return 500 when setHotspotConfig fails", async () => {
      mockRequest.body = {
        ssid: "TestSSID",
        password: "password123",
      };
      mockWiFiService.setHotspotConfig.mockResolvedValue(
        failure(WiFiError.unknown("Config update failed")),
      );

      await controller.setHotspotConfig(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: "CONFIG_UPDATE_FAILED",
          message: expect.any(String),
        },
      });
    });
  });
});
