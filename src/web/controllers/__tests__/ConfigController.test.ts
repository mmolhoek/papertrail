/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import { ConfigController } from "../ConfigController";
import { success, failure } from "@core/types";

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock fetch for Google Maps URL resolution
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock express request and response
const mockRequest = (body = {}, params = {}, query = {}) =>
  ({
    body,
    params,
    query,
  }) as Request;

const mockResponse = () => {
  const res: Partial<Response> = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

// Create mock orchestrator
const createMockOrchestrator = () => ({
  setZoom: jest.fn().mockResolvedValue(success(undefined)),
  changeZoom: jest.fn().mockResolvedValue(success(undefined)),
  startAutoUpdate: jest.fn().mockResolvedValue(success(undefined)),
  stopAutoUpdate: jest.fn(),
  setAutoCenter: jest.fn(),
  setRotateWithBearing: jest.fn(),
  setActiveScreen: jest.fn(),
  updateDisplay: jest.fn().mockResolvedValue(success(undefined)),
  restartOnboarding: jest.fn().mockResolvedValue(success(undefined)),
});

// Create mock config service
const createMockConfigService = () => ({
  getZoomLevel: jest.fn().mockReturnValue(14),
  getAutoCenter: jest.fn().mockReturnValue(true),
  getCenterOverride: jest.fn().mockReturnValue(null),
  setCenterOverride: jest.fn(),
  clearCenterOverride: jest.fn(),
  getRotateWithBearing: jest.fn().mockReturnValue(false),
  getActiveScreen: jest.fn().mockReturnValue("track"),
  getSpeedUnit: jest.fn().mockReturnValue("kmh"),
  getEnabledPOICategories: jest.fn().mockReturnValue(["fuel", "parking"]),
  getShowLocationName: jest.fn().mockReturnValue(true),
  getShowRoads: jest.fn().mockReturnValue(false),
  getShowWater: jest.fn().mockReturnValue(true),
  getShowWaterways: jest.fn().mockReturnValue(true),
  getShowLanduse: jest.fn().mockReturnValue(true),
  getShowSpeedLimit: jest.fn().mockReturnValue(true),
  getShowElevation: jest.fn().mockReturnValue(false),
  getRoutingProfile: jest.fn().mockReturnValue("car"),
  setSpeedUnit: jest.fn(),
  setPOICategoryEnabled: jest.fn(),
  setRoutingProfile: jest.fn(),
  setShowLocationName: jest.fn(),
  setShowRoads: jest.fn(),
  setShowWater: jest.fn(),
  setShowWaterways: jest.fn(),
  setShowLanduse: jest.fn(),
  setShowSpeedLimit: jest.fn(),
  setShowElevation: jest.fn(),
  save: jest.fn().mockResolvedValue(undefined),
  getRecentDestinations: jest.fn().mockReturnValue([]),
  addRecentDestination: jest.fn(),
  removeRecentDestination: jest.fn(),
  clearRecentDestinations: jest.fn(),
  resetToDefaults: jest.fn().mockResolvedValue(success(undefined)),
});

// Create mock WiFi service
const createMockWiFiService = () => ({
  disconnect: jest.fn().mockResolvedValue(success(undefined)),
});

describe("ConfigController", () => {
  let controller: ConfigController;
  let mockOrchestrator: ReturnType<typeof createMockOrchestrator>;
  let mockConfigService: ReturnType<typeof createMockConfigService>;
  let mockWiFiService: ReturnType<typeof createMockWiFiService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockOrchestrator = createMockOrchestrator();
    mockConfigService = createMockConfigService();
    mockWiFiService = createMockWiFiService();

    controller = new ConfigController(
      mockOrchestrator as any,
      mockConfigService as any,
      mockWiFiService as any,
    );
  });

  describe("getDisplaySettings", () => {
    it("should return display settings successfully", async () => {
      const req = mockRequest();
      const res = mockResponse();

      await controller.getDisplaySettings(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          zoomLevel: 14,
          autoCenter: true,
          centerOverride: null,
          rotateWithBearing: false,
          activeScreen: "track",
          speedUnit: "kmh",
          enabledPOICategories: ["fuel", "parking"],
          showLocationName: true,
          showRoads: false,
          showWater: true,
          showWaterways: true,
          showLanduse: true,
          showSpeedLimit: true,
          showElevation: false,
          routingProfile: "car",
        },
      });
    });

    it("should return 500 when config service unavailable", async () => {
      const controllerWithoutConfig = new ConfigController(
        mockOrchestrator as any,
      );
      const req = mockRequest();
      const res = mockResponse();

      await controllerWithoutConfig.getDisplaySettings(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: "SERVICE_UNAVAILABLE" }),
        }),
      );
    });
  });

  describe("setZoom", () => {
    it("should set zoom level with absolute value", async () => {
      const req = mockRequest({ zoom: 16 });
      const res = mockResponse();

      await controller.setZoom(req, res);

      expect(mockOrchestrator.setZoom).toHaveBeenCalledWith(16);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("should change zoom with delta", async () => {
      const req = mockRequest({ delta: 2 });
      const res = mockResponse();

      await controller.setZoom(req, res);

      expect(mockOrchestrator.changeZoom).toHaveBeenCalledWith(2);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("should return 400 when neither zoom nor delta provided", async () => {
      const req = mockRequest({});
      const res = mockResponse();

      await controller.setZoom(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should handle zoom failure", async () => {
      mockOrchestrator.setZoom.mockResolvedValue(
        failure(new Error("Zoom out of bounds")),
      );
      const req = mockRequest({ zoom: 100 });
      const res = mockResponse();

      await controller.setZoom(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("startAutoUpdate", () => {
    it("should start auto-update successfully", async () => {
      const req = mockRequest();
      const res = mockResponse();

      await controller.startAutoUpdate(req, res);

      expect(mockOrchestrator.startAutoUpdate).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("should handle start failure", async () => {
      mockOrchestrator.startAutoUpdate.mockResolvedValue(
        failure(new Error("Failed to start")),
      );
      const req = mockRequest();
      const res = mockResponse();

      await controller.startAutoUpdate(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("stopAutoUpdate", () => {
    it("should stop auto-update successfully", async () => {
      const req = mockRequest();
      const res = mockResponse();

      await controller.stopAutoUpdate(req, res);

      expect(mockOrchestrator.stopAutoUpdate).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });
  });

  describe("setAutoCenter", () => {
    it("should enable auto-center", async () => {
      const req = mockRequest({ enabled: true });
      const res = mockResponse();

      await controller.setAutoCenter(req, res);

      expect(mockOrchestrator.setAutoCenter).toHaveBeenCalledWith(true);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Auto-center enabled",
        }),
      );
    });

    it("should disable auto-center", async () => {
      const req = mockRequest({ enabled: false });
      const res = mockResponse();

      await controller.setAutoCenter(req, res);

      expect(mockOrchestrator.setAutoCenter).toHaveBeenCalledWith(false);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Auto-center disabled",
        }),
      );
    });

    it("should return 400 for non-boolean enabled", async () => {
      const req = mockRequest({ enabled: "true" });
      const res = mockResponse();

      await controller.setAutoCenter(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("setRotateWithBearing", () => {
    it("should enable rotate with bearing", async () => {
      const req = mockRequest({ enabled: true });
      const res = mockResponse();

      await controller.setRotateWithBearing(req, res);

      expect(mockOrchestrator.setRotateWithBearing).toHaveBeenCalledWith(true);
      expect(mockOrchestrator.updateDisplay).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("should return 400 for non-boolean enabled", async () => {
      const req = mockRequest({ enabled: 1 });
      const res = mockResponse();

      await controller.setRotateWithBearing(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("setActiveScreen", () => {
    it("should set active screen to track", async () => {
      const req = mockRequest({ screenType: "track" });
      const res = mockResponse();

      await controller.setActiveScreen(req, res);

      expect(mockOrchestrator.setActiveScreen).toHaveBeenCalledWith("track");
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("should set active screen to turn_by_turn", async () => {
      const req = mockRequest({ screenType: "turn_by_turn" });
      const res = mockResponse();

      await controller.setActiveScreen(req, res);

      expect(mockOrchestrator.setActiveScreen).toHaveBeenCalledWith(
        "turn_by_turn",
      );
    });

    it("should return 400 for invalid screenType", async () => {
      const req = mockRequest({ screenType: "invalid" });
      const res = mockResponse();

      await controller.setActiveScreen(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should handle unexpected errors", async () => {
      mockOrchestrator.setActiveScreen.mockImplementation(() => {
        throw new Error("Unexpected error");
      });
      const req = mockRequest({ screenType: "track" });
      const res = mockResponse();

      await controller.setActiveScreen(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("setSpeedUnit", () => {
    it("should set speed unit to kmh", async () => {
      const req = mockRequest({ unit: "kmh" });
      const res = mockResponse();

      await controller.setSpeedUnit(req, res);

      expect(mockConfigService.setSpeedUnit).toHaveBeenCalledWith("kmh");
      expect(mockConfigService.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("should set speed unit to mph", async () => {
      const req = mockRequest({ unit: "mph" });
      const res = mockResponse();

      await controller.setSpeedUnit(req, res);

      expect(mockConfigService.setSpeedUnit).toHaveBeenCalledWith("mph");
    });

    it("should return 400 for invalid unit", async () => {
      const req = mockRequest({ unit: "kph" });
      const res = mockResponse();

      await controller.setSpeedUnit(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 500 when config service unavailable", async () => {
      const controllerWithoutConfig = new ConfigController(
        mockOrchestrator as any,
      );
      const req = mockRequest({ unit: "kmh" });
      const res = mockResponse();

      await controllerWithoutConfig.setSpeedUnit(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("setPOICategory", () => {
    it("should enable a POI category", async () => {
      const req = mockRequest({ category: "fuel", enabled: true });
      const res = mockResponse();

      await controller.setPOICategory(req, res);

      expect(mockConfigService.setPOICategoryEnabled).toHaveBeenCalledWith(
        "fuel",
        true,
      );
      expect(mockConfigService.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("should disable a POI category", async () => {
      const req = mockRequest({ category: "parking", enabled: false });
      const res = mockResponse();

      await controller.setPOICategory(req, res);

      expect(mockConfigService.setPOICategoryEnabled).toHaveBeenCalledWith(
        "parking",
        false,
      );
    });

    it("should return 400 for invalid category", async () => {
      const req = mockRequest({ category: "invalid", enabled: true });
      const res = mockResponse();

      await controller.setPOICategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 for non-boolean enabled", async () => {
      const req = mockRequest({ category: "fuel", enabled: "yes" });
      const res = mockResponse();

      await controller.setPOICategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 500 when config service unavailable", async () => {
      const controllerWithoutConfig = new ConfigController(
        mockOrchestrator as any,
      );
      const req = mockRequest({ category: "fuel", enabled: true });
      const res = mockResponse();

      await controllerWithoutConfig.setPOICategory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("setRoutingProfile", () => {
    it("should set routing profile to car", async () => {
      const req = mockRequest({ profile: "car" });
      const res = mockResponse();

      await controller.setRoutingProfile(req, res);

      expect(mockConfigService.setRoutingProfile).toHaveBeenCalledWith("car");
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Routing profile set to Driving",
        }),
      );
    });

    it("should set routing profile to bike", async () => {
      const req = mockRequest({ profile: "bike" });
      const res = mockResponse();

      await controller.setRoutingProfile(req, res);

      expect(mockConfigService.setRoutingProfile).toHaveBeenCalledWith("bike");
    });

    it("should set routing profile to foot", async () => {
      const req = mockRequest({ profile: "foot" });
      const res = mockResponse();

      await controller.setRoutingProfile(req, res);

      expect(mockConfigService.setRoutingProfile).toHaveBeenCalledWith("foot");
    });

    it("should return 400 for invalid profile", async () => {
      const req = mockRequest({ profile: "train" });
      const res = mockResponse();

      await controller.setRoutingProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 500 when config service unavailable", async () => {
      const controllerWithoutConfig = new ConfigController(
        mockOrchestrator as any,
      );
      const req = mockRequest({ profile: "car" });
      const res = mockResponse();

      await controllerWithoutConfig.setRoutingProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("setShowLocationName", () => {
    it("should enable show location name", async () => {
      const req = mockRequest({ enabled: true });
      const res = mockResponse();

      await controller.setShowLocationName(req, res);

      expect(mockConfigService.setShowLocationName).toHaveBeenCalledWith(true);
      expect(mockConfigService.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("should return 400 for non-boolean enabled", async () => {
      const req = mockRequest({ enabled: "true" });
      const res = mockResponse();

      await controller.setShowLocationName(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 500 when config service unavailable", async () => {
      const controllerWithoutConfig = new ConfigController(
        mockOrchestrator as any,
      );
      const req = mockRequest({ enabled: true });
      const res = mockResponse();

      await controllerWithoutConfig.setShowLocationName(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("setShowRoads", () => {
    it("should enable show roads", async () => {
      const req = mockRequest({ enabled: true });
      const res = mockResponse();

      await controller.setShowRoads(req, res);

      expect(mockConfigService.setShowRoads).toHaveBeenCalledWith(true);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("should return 400 for non-boolean enabled", async () => {
      const req = mockRequest({ enabled: 1 });
      const res = mockResponse();

      await controller.setShowRoads(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 500 when config service unavailable", async () => {
      const controllerWithoutConfig = new ConfigController(
        mockOrchestrator as any,
      );
      const req = mockRequest({ enabled: true });
      const res = mockResponse();

      await controllerWithoutConfig.setShowRoads(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("setShowSpeedLimit", () => {
    it("should enable show speed limit", async () => {
      const req = mockRequest({ enabled: true });
      const res = mockResponse();

      await controller.setShowSpeedLimit(req, res);

      expect(mockConfigService.setShowSpeedLimit).toHaveBeenCalledWith(true);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("should return 400 for non-boolean enabled", async () => {
      const req = mockRequest({ enabled: null });
      const res = mockResponse();

      await controller.setShowSpeedLimit(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 500 when config service unavailable", async () => {
      const controllerWithoutConfig = new ConfigController(
        mockOrchestrator as any,
      );
      const req = mockRequest({ enabled: true });
      const res = mockResponse();

      await controllerWithoutConfig.setShowSpeedLimit(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("setShowElevation", () => {
    it("should enable show elevation", async () => {
      const req = mockRequest({ enabled: true });
      const res = mockResponse();

      await controller.setShowElevation(req, res);

      expect(mockConfigService.setShowElevation).toHaveBeenCalledWith(true);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("should return 400 for non-boolean enabled", async () => {
      const req = mockRequest({ enabled: undefined });
      const res = mockResponse();

      await controller.setShowElevation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 500 when config service unavailable", async () => {
      const controllerWithoutConfig = new ConfigController(
        mockOrchestrator as any,
      );
      const req = mockRequest({ enabled: true });
      const res = mockResponse();

      await controllerWithoutConfig.setShowElevation(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getRecentDestinations", () => {
    it("should return recent destinations", async () => {
      const mockDestinations = [
        { name: "Home", latitude: 51.5, longitude: -0.1 },
      ];
      mockConfigService.getRecentDestinations.mockReturnValue(mockDestinations);

      const req = mockRequest();
      const res = mockResponse();

      await controller.getRecentDestinations(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockDestinations,
      });
    });

    it("should return 500 when config service unavailable", async () => {
      const controllerWithoutConfig = new ConfigController(
        mockOrchestrator as any,
      );
      const req = mockRequest();
      const res = mockResponse();

      await controllerWithoutConfig.getRecentDestinations(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("addRecentDestination", () => {
    it("should add a recent destination", async () => {
      const req = mockRequest({
        name: "Work",
        latitude: 51.5074,
        longitude: -0.1278,
      });
      const res = mockResponse();

      await controller.addRecentDestination(req, res);

      expect(mockConfigService.addRecentDestination).toHaveBeenCalledWith({
        name: "Work",
        latitude: 51.5074,
        longitude: -0.1278,
      });
      expect(mockConfigService.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("should return 400 for missing name", async () => {
      const req = mockRequest({ latitude: 51.5, longitude: -0.1 });
      const res = mockResponse();

      await controller.addRecentDestination(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 for invalid latitude", async () => {
      const req = mockRequest({
        name: "Test",
        latitude: "51.5",
        longitude: -0.1,
      });
      const res = mockResponse();

      await controller.addRecentDestination(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 500 when config service unavailable", async () => {
      const controllerWithoutConfig = new ConfigController(
        mockOrchestrator as any,
      );
      const req = mockRequest({
        name: "Work",
        latitude: 51.5,
        longitude: -0.1,
      });
      const res = mockResponse();

      await controllerWithoutConfig.addRecentDestination(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("removeRecentDestination", () => {
    it("should remove a recent destination", async () => {
      const req = mockRequest({ latitude: 51.5074, longitude: -0.1278 });
      const res = mockResponse();

      await controller.removeRecentDestination(req, res);

      expect(mockConfigService.removeRecentDestination).toHaveBeenCalledWith(
        51.5074,
        -0.1278,
      );
      expect(mockConfigService.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("should return 400 for invalid coordinates", async () => {
      const req = mockRequest({ latitude: "51.5", longitude: -0.1 });
      const res = mockResponse();

      await controller.removeRecentDestination(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 500 when config service unavailable", async () => {
      const controllerWithoutConfig = new ConfigController(
        mockOrchestrator as any,
      );
      const req = mockRequest({ latitude: 51.5, longitude: -0.1 });
      const res = mockResponse();

      await controllerWithoutConfig.removeRecentDestination(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("clearRecentDestinations", () => {
    it("should clear all recent destinations", async () => {
      const req = mockRequest();
      const res = mockResponse();

      await controller.clearRecentDestinations(req, res);

      expect(mockConfigService.clearRecentDestinations).toHaveBeenCalled();
      expect(mockConfigService.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("should return 500 when config service unavailable", async () => {
      const controllerWithoutConfig = new ConfigController(
        mockOrchestrator as any,
      );
      const req = mockRequest();
      const res = mockResponse();

      await controllerWithoutConfig.clearRecentDestinations(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("resolveGoogleMapsLink", () => {
    it("should resolve a Google Maps URL with @ pattern", async () => {
      const req = mockRequest({
        url: "https://www.google.com/maps/place/Eiffel+Tower/@48.8583,2.2944,15z",
      });
      const res = mockResponse();

      await controller.resolveGoogleMapsLink(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          latitude: 48.8583,
          longitude: 2.2944,
          name: "Eiffel Tower",
        },
      });
    });

    it("should resolve a shortened URL by following redirect", async () => {
      mockFetch.mockResolvedValue({
        url: "https://www.google.com/maps/place/Test/@40.7128,-74.0060,15z",
      });

      const req = mockRequest({
        url: "https://maps.app.goo.gl/abc123",
      });
      const res = mockResponse();

      await controller.resolveGoogleMapsLink(req, res);

      expect(mockFetch).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          latitude: 40.7128,
          longitude: -74.006,
          name: "Test",
        },
      });
    });

    it("should return 400 when coordinates cannot be parsed", async () => {
      const req = mockRequest({
        url: "https://www.google.com/maps/search/restaurants",
      });
      const res = mockResponse();

      await controller.resolveGoogleMapsLink(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "PARSE_FAILED" }),
        }),
      );
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const req = mockRequest({
        url: "https://maps.app.goo.gl/abc123",
      });
      const res = mockResponse();

      await controller.resolveGoogleMapsLink(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should resolve URL with q parameter", async () => {
      const req = mockRequest({
        url: "https://www.google.com/maps?q=51.5074,-0.1278",
      });
      const res = mockResponse();

      await controller.resolveGoogleMapsLink(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          latitude: 51.5074,
          longitude: -0.1278,
          name: "51.50740, -0.12780",
        },
      });
    });

    it("should resolve URL with ll parameter", async () => {
      const req = mockRequest({
        url: "https://www.google.com/maps?ll=51.5074,-0.1278",
      });
      const res = mockResponse();

      await controller.resolveGoogleMapsLink(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          latitude: 51.5074,
          longitude: -0.1278,
          name: "51.50740, -0.12780",
        },
      });
    });

    it("should resolve URL with destination parameter", async () => {
      const req = mockRequest({
        url: "https://www.google.com/maps/dir/?destination=51.5074,-0.1278",
      });
      const res = mockResponse();

      await controller.resolveGoogleMapsLink(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          latitude: 51.5074,
          longitude: -0.1278,
          name: "51.50740, -0.12780",
        },
      });
    });

    it("should resolve URL with data parameter pattern", async () => {
      const req = mockRequest({
        url: "https://www.google.com/maps/place/Name/data=!3d40.7128!4d-74.0060",
      });
      const res = mockResponse();

      await controller.resolveGoogleMapsLink(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          latitude: 40.7128,
          longitude: -74.006,
          name: "Name",
        },
      });
    });

    it("should try GET if HEAD fails for shortened URLs", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("HEAD failed"))
        .mockResolvedValueOnce({
          url: "https://www.google.com/maps/place/Test/@40.7128,-74.0060,15z",
        });

      const req = mockRequest({
        url: "https://goo.gl/maps/abc123",
      });
      const res = mockResponse();

      await controller.resolveGoogleMapsLink(req, res);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("resetSystem", () => {
    it("should reset system successfully", async () => {
      const req = mockRequest();
      const res = mockResponse();

      await controller.resetSystem(req, res);

      expect(mockConfigService.resetToDefaults).toHaveBeenCalled();
      expect(mockWiFiService.disconnect).toHaveBeenCalled();
      expect(mockOrchestrator.restartOnboarding).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("should handle config reset failure", async () => {
      mockConfigService.resetToDefaults.mockResolvedValue(
        failure(new Error("Reset failed")),
      );
      const req = mockRequest();
      const res = mockResponse();

      await controller.resetSystem(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "CONFIG_RESET_FAILED" }),
        }),
      );
    });

    it("should continue even if WiFi disconnect fails", async () => {
      mockWiFiService.disconnect.mockResolvedValue(
        failure(new Error("Not connected")),
      );
      const req = mockRequest();
      const res = mockResponse();

      await controller.resetSystem(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("should work without config service", async () => {
      const controllerWithoutConfig = new ConfigController(
        mockOrchestrator as any,
        undefined,
        mockWiFiService as any,
      );
      const req = mockRequest();
      const res = mockResponse();

      await controllerWithoutConfig.resetSystem(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("should work without WiFi service", async () => {
      const controllerWithoutWiFi = new ConfigController(
        mockOrchestrator as any,
        mockConfigService as any,
        undefined,
      );
      const req = mockRequest();
      const res = mockResponse();

      await controllerWithoutWiFi.resetSystem(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("should handle unexpected errors", async () => {
      mockConfigService.resetToDefaults.mockRejectedValue(
        new Error("Unexpected error"),
      );
      const req = mockRequest();
      const res = mockResponse();

      await controller.resetSystem(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "RESET_FAILED" }),
        }),
      );
    });
  });
});
