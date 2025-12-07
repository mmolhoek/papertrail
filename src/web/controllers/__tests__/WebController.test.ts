import { Request, Response } from "express";
import { WebController } from "../WebController";
import { success, failure } from "@core/types";
import { WebError, WebErrorCode } from "@core/errors";

// Mock express request and response
const mockRequest = (body = {}, params = {}, query = {}, file?: any) =>
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
    contentType: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

// Create mock orchestrator
const createMockOrchestrator = () => ({
  initialize: jest.fn(),
  updateDisplay: jest.fn().mockResolvedValue(success(undefined)),
  dispose: jest.fn(),
  getCurrentPosition: jest.fn(),
  getSystemStatus: jest.fn(),
  setActiveGPX: jest.fn().mockResolvedValue(success(undefined)),
  startAutoUpdate: jest.fn(),
  stopAutoUpdate: jest.fn(),
  isAutoUpdateRunning: jest.fn(),
  onGPSUpdate: jest.fn(),
  onGPSStatusChange: jest.fn(),
  onDisplayUpdate: jest.fn(),
  onError: jest.fn(),
  clearDisplay: jest.fn(),
  setZoom: jest.fn(),
  getZoom: jest.fn(),
  setAutoCenter: jest.fn(),
  getAutoCenter: jest.fn(),
  setRotateWithBearing: jest.fn(),
  getRotateWithBearing: jest.fn(),
  listGPXFiles: jest.fn(),
  onWiFiStateChange: jest.fn(),
  checkAndShowOnboardingScreen: jest.fn(),
  showHotspotConnectedScreen: jest.fn(),
  showHotspotConnectingScreen: jest.fn(),
  showWiFiFailedScreen: jest.fn(),
  onSimulationPositionUpdate: jest.fn(),
  onSimulationStateChange: jest.fn(),
  startSimulation: jest.fn(),
  stopSimulation: jest.fn(),
  pauseSimulation: jest.fn(),
  resumeSimulation: jest.fn(),
  setSimulationSpeed: jest.fn(),
  getSimulationStatus: jest.fn(),
  createDriveRoute: jest.fn(),
  startDriveNavigation: jest.fn(),
  stopDriveNavigation: jest.fn(),
  getDriveNavigationStatus: jest.fn(),
  onDriveNavigationUpdate: jest.fn(),
  getSavedDriveRoutes: jest.fn(),
  deleteDriveRoute: jest.fn(),
  getActiveDriveRoute: jest.fn(),
  startSimulatedDriveNavigation: jest.fn(),
  uploadGPXFile: jest.fn(),
  deleteGPXFile: jest.fn(),
  getActiveTrackStart: jest.fn(),
  resetSystem: jest.fn(),
  getShowInfoPanel: jest.fn(),
  setShowInfoPanel: jest.fn(),
  getInfoPanelPosition: jest.fn(),
  setInfoPanelPosition: jest.fn(),
  restartOnboarding: jest.fn().mockResolvedValue(success(undefined)),
});

// Create mock WiFi service
const createMockWiFiService = () => ({
  initialize: jest.fn(),
  scanNetworks: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn().mockResolvedValue(success(undefined)),
  isConnected: jest.fn(),
  getCurrentConnection: jest.fn(),
  onConnectionChange: jest.fn(),
  dispose: jest.fn(),
  isConnectedToMobileHotspot: jest.fn(),
  getCurrentState: jest.fn(),
  onStateChange: jest.fn(),
  setWebSocketClientCount: jest.fn(),
  getTargetHotspotConfig: jest.fn(),
  setTargetHotspotConfig: jest.fn(),
  attemptHotspotConnection: jest.fn(),
  setConnectedScreenDisplayed: jest.fn(),
  setHotspotConfig: jest.fn().mockResolvedValue(success(undefined)),
  getHotspotConfig: jest.fn().mockReturnValue({
    ssid: "MockHotspot",
    password: "mockpassword",
    updatedAt: new Date().toISOString(),
  }),
});

// Create mock Map service
const createMockMapService = () => ({
  loadGPXFile: jest.fn(),
  getTrack: jest.fn(),
  listAvailableGPXFiles: jest.fn(),
  getGPXFileInfo: jest.fn(),
  calculateBounds: jest.fn(),
  calculateDistance: jest.fn(),
  calculateElevation: jest.fn(),
  simplifyTrack: jest.fn(),
  validateGPXFile: jest.fn(),
  clearCache: jest.fn(),
});

// Create mock Config service
const createMockConfigService = () => ({
  initialize: jest.fn(),
  getConfig: jest.fn(),
  getUserState: jest.fn(),
  getDisplayWidth: jest.fn().mockReturnValue(800),
  getDisplayHeight: jest.fn().mockReturnValue(480),
  getZoomLevel: jest.fn().mockReturnValue(14),
  setZoomLevel: jest.fn(),
  getMinZoomLevel: jest.fn().mockReturnValue(1),
  getMaxZoomLevel: jest.fn().mockReturnValue(20),
  getActiveGPXPath: jest.fn(),
  setActiveGPXPath: jest.fn(),
  getGPSUpdateInterval: jest.fn(),
  setGPSUpdateInterval: jest.fn(),
  getRenderOptions: jest.fn(),
  updateRenderOptions: jest.fn(),
  getAutoCenter: jest.fn().mockReturnValue(true),
  setAutoCenter: jest.fn(),
  getRotateWithBearing: jest.fn().mockReturnValue(false),
  setRotateWithBearing: jest.fn(),
  getAutoRefreshInterval: jest.fn().mockReturnValue(5),
  setAutoRefreshInterval: jest.fn(),
  getRecentFiles: jest.fn(),
  addRecentFile: jest.fn(),
  clearRecentFiles: jest.fn(),
  isOnboardingCompleted: jest.fn(),
  setOnboardingCompleted: jest.fn(),
  getWiFiFallbackNetwork: jest.fn(),
  setWiFiFallbackNetwork: jest.fn(),
  getHotspotConfig: jest.fn(),
  setHotspotConfig: jest.fn(),
  save: jest.fn(),
  reload: jest.fn(),
  resetToDefaults: jest.fn().mockResolvedValue(success(undefined)),
  exportConfig: jest.fn(),
  importConfig: jest.fn(),
});

// Create mock simulation service
const createMockSimulationService = () => ({
  initialize: jest.fn(),
  startSimulation: jest.fn().mockResolvedValue(success(undefined)),
  stopSimulation: jest.fn().mockResolvedValue(success(undefined)),
  pauseSimulation: jest.fn().mockResolvedValue(success(undefined)),
  resumeSimulation: jest.fn().mockResolvedValue(success(undefined)),
  setSpeed: jest.fn().mockResolvedValue(success(undefined)),
  getStatus: jest.fn().mockReturnValue({ state: "idle" }),
  onPositionUpdate: jest.fn(),
  onSimulationStateChange: jest.fn(),
  dispose: jest.fn(),
});

// Create mock drive navigation service
const createMockDriveNavigationService = () => ({
  initialize: jest.fn(),
  createRoute: jest.fn(),
  startNavigation: jest.fn(),
  stopNavigation: jest.fn(),
  getNavigationStatus: jest.fn().mockReturnValue({}),
  updateCurrentPosition: jest.fn(),
  onNavigationUpdate: jest.fn(),
  dispose: jest.fn(),
  getSavedRoutes: jest.fn(),
  deleteRoute: jest.fn(),
  getActiveRoute: jest.fn().mockReturnValue(null),
  startSimulatedNavigation: jest.fn(),
  setSimulationMode: jest.fn(),
  getNavigationState: jest.fn().mockReturnValue("idle"),
  isNavigating: jest.fn().mockReturnValue(false),
});

describe("WebController", () => {
  let controller: WebController;
  let mockOrchestrator: ReturnType<typeof createMockOrchestrator>;
  let mockWiFiService: ReturnType<typeof createMockWiFiService>;
  let mockMapService: ReturnType<typeof createMockMapService>;
  let mockConfigService: ReturnType<typeof createMockConfigService>;
  let mockSimulationService: ReturnType<typeof createMockSimulationService>;
  let mockDriveNavigationService: ReturnType<
    typeof createMockDriveNavigationService
  >;

  beforeEach(() => {
    mockOrchestrator = createMockOrchestrator();
    mockWiFiService = createMockWiFiService();
    mockMapService = createMockMapService();
    mockConfigService = createMockConfigService();
    mockSimulationService = createMockSimulationService();
    mockDriveNavigationService = createMockDriveNavigationService();

    controller = new WebController(
      mockOrchestrator as any,
      mockWiFiService as any,
      mockMapService as any,
      "./data/gpx-files",
      mockConfigService as any,
      mockSimulationService as any,
      mockDriveNavigationService as any,
    );
  });

  describe("getHealth", () => {
    it("should return health status", async () => {
      const req = mockRequest();
      const res = mockResponse();

      await controller.getHealth(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "ok",
          timestamp: expect.any(String),
        }),
      );
    });
  });

  describe("getGPSPosition", () => {
    it("should return GPS position on success", async () => {
      const mockPosition = {
        latitude: 37.7749,
        longitude: -122.4194,
        altitude: 10,
        timestamp: new Date(),
        accuracy: 5,
        speed: 1.5,
        bearing: 90,
      };
      mockOrchestrator.getCurrentPosition.mockResolvedValue(
        success(mockPosition),
      );

      const req = mockRequest();
      const res = mockResponse();

      await controller.getGPSPosition(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          latitude: 37.7749,
          longitude: -122.4194,
        }),
      });
    });

    it("should return error on failure", async () => {
      const error = new WebError(
        "GPS not available",
        WebErrorCode.SERVER_NOT_RUNNING,
      );
      mockOrchestrator.getCurrentPosition.mockResolvedValue(failure(error));

      const req = mockRequest();
      const res = mockResponse();

      await controller.getGPSPosition(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: WebErrorCode.SERVER_NOT_RUNNING,
        }),
      });
    });
  });

  describe("getGPSStatus", () => {
    it("should return GPS status on success", async () => {
      const mockStatus = {
        gps: {
          connected: true,
          tracking: true,
          satellitesInUse: 8,
          lastUpdate: new Date(),
        },
        display: { busy: false },
        activeTrack: "test.gpx",
      };
      mockOrchestrator.getSystemStatus.mockResolvedValue(success(mockStatus));

      const req = mockRequest();
      const res = mockResponse();

      await controller.getGPSStatus(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          connected: true,
          tracking: true,
          satellitesInUse: 8,
        }),
      });
    });

    it("should return error on failure", async () => {
      const error = new WebError("Error", WebErrorCode.SERVER_START_FAILED);
      mockOrchestrator.getSystemStatus.mockResolvedValue(failure(error));

      const req = mockRequest();
      const res = mockResponse();

      await controller.getGPSStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getGPXFiles", () => {
    it("should return list of GPX files", async () => {
      const mockFiles = [
        {
          path: "/path/to/test.gpx",
          fileName: "test.gpx",
          trackCount: 1,
          pointCount: 100,
          totalDistance: 5000,
          fileSize: 1024,
          lastModified: new Date(),
        },
      ];
      mockMapService.getGPXFileInfo.mockResolvedValue(success(mockFiles));

      const req = mockRequest();
      const res = mockResponse();

      await controller.getGPXFiles(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          files: expect.arrayContaining([
            expect.objectContaining({
              fileName: "test.gpx",
              trackName: "test",
            }),
          ]),
        },
      });
    });

    it("should return empty array when no map service", async () => {
      // Create controller without map service
      const controllerNoMap = new WebController(
        mockOrchestrator as any,
        mockWiFiService as any,
        undefined, // no map service
      );

      const req = mockRequest();
      const res = mockResponse();

      await controllerNoMap.getGPXFiles(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { files: [] },
      });
    });

    it("should return empty array on failure", async () => {
      mockMapService.getGPXFileInfo.mockResolvedValue(
        failure(new Error("Error")),
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

  describe("getActiveGPX", () => {
    it("should return active GPX file", async () => {
      const mockStatus = {
        gps: { connected: true },
        display: { busy: false },
        activeTrack: "test.gpx",
      };
      mockOrchestrator.getSystemStatus.mockResolvedValue(success(mockStatus));

      const req = mockRequest();
      const res = mockResponse();

      await controller.getActiveGPX(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { active: "test.gpx" },
      });
    });

    it("should return null when no active track", async () => {
      const mockStatus = {
        gps: { connected: true },
        display: { busy: false },
        activeTrack: null,
      };
      mockOrchestrator.getSystemStatus.mockResolvedValue(success(mockStatus));

      const req = mockRequest();
      const res = mockResponse();

      await controller.getActiveGPX(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { active: null },
      });
    });

    it("should return error on failure", async () => {
      const error = new WebError("Error", WebErrorCode.SERVER_START_FAILED);
      mockOrchestrator.getSystemStatus.mockResolvedValue(failure(error));

      const req = mockRequest();
      const res = mockResponse();

      await controller.getActiveGPX(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("setActiveGPX", () => {
    it("should set active GPX file", async () => {
      mockOrchestrator.setActiveGPX.mockResolvedValue(success(undefined));

      const req = mockRequest({ path: "/path/to/test.gpx" });
      const res = mockResponse();

      await controller.setActiveGPX(req, res);

      expect(mockOrchestrator.setActiveGPX).toHaveBeenCalledWith(
        "/path/to/test.gpx",
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
    });

    it("should return error when path not provided", async () => {
      const req = mockRequest({});
      const res = mockResponse();

      await controller.setActiveGPX(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("updateDisplay", () => {
    it("should update display successfully", async () => {
      mockOrchestrator.updateDisplay.mockResolvedValue(success(undefined));

      const req = mockRequest();
      const res = mockResponse();

      await controller.updateDisplay(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
    });

    it("should return error on failure", async () => {
      const error = new WebError("Error", WebErrorCode.SERVER_START_FAILED);
      mockOrchestrator.updateDisplay.mockResolvedValue(failure(error));

      const req = mockRequest();
      const res = mockResponse();

      await controller.updateDisplay(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("clearDisplay", () => {
    it("should clear display successfully", async () => {
      mockOrchestrator.clearDisplay.mockResolvedValue(success(undefined));

      const req = mockRequest();
      const res = mockResponse();

      await controller.clearDisplay(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
    });

    it("should return error on failure", async () => {
      const error = new WebError("Error", WebErrorCode.SERVER_START_FAILED);
      mockOrchestrator.clearDisplay.mockResolvedValue(failure(error));

      const req = mockRequest();
      const res = mockResponse();

      await controller.clearDisplay(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getSystemStatus", () => {
    it("should return system status", async () => {
      const mockStatus = {
        gps: { connected: true, tracking: true, satellitesInUse: 8 },
        display: { busy: false },
        activeTrack: "test.gpx",
      };
      mockOrchestrator.getSystemStatus.mockResolvedValue(success(mockStatus));

      const req = mockRequest();
      const res = mockResponse();

      await controller.getSystemStatus(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockStatus,
      });
    });
  });

  describe("getDisplaySettings", () => {
    it("should return display settings", async () => {
      mockOrchestrator.getZoom.mockReturnValue(14);
      mockOrchestrator.getAutoCenter.mockReturnValue(true);
      mockOrchestrator.getRotateWithBearing.mockReturnValue(false);
      mockOrchestrator.isAutoUpdateRunning.mockReturnValue(true);

      const req = mockRequest();
      const res = mockResponse();

      await controller.getDisplaySettings(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
    });
  });

  describe("setZoom", () => {
    it("should set zoom level", async () => {
      mockOrchestrator.setZoom.mockResolvedValue(success(undefined));

      const req = mockRequest({ zoom: 16 });
      const res = mockResponse();

      await controller.setZoom(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
    });

    it("should handle zoom out of valid range", async () => {
      mockOrchestrator.setZoom.mockResolvedValue(success(undefined));

      const req = mockRequest({ zoom: 25 }); // above max
      const res = mockResponse();

      await controller.setZoom(req, res);

      // It should either clamp or return success
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("startAutoUpdate", () => {
    it("should start auto update", async () => {
      mockOrchestrator.startAutoUpdate.mockResolvedValue(success(undefined));

      const req = mockRequest();
      const res = mockResponse();

      await controller.startAutoUpdate(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Auto-update started",
      });
    });
  });

  describe("stopAutoUpdate", () => {
    it("should stop auto update", async () => {
      mockOrchestrator.stopAutoUpdate.mockReturnValue(undefined);

      const req = mockRequest();
      const res = mockResponse();

      await controller.stopAutoUpdate(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Auto-update stopped",
      });
    });
  });

  describe("setAutoCenter", () => {
    it("should set auto center", async () => {
      mockOrchestrator.setAutoCenter.mockResolvedValue(success(undefined));

      const req = mockRequest({ enabled: true });
      const res = mockResponse();

      await controller.setAutoCenter(req, res);

      expect(mockOrchestrator.setAutoCenter).toHaveBeenCalledWith(true);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
    });

    it("should return error when enabled not provided", async () => {
      const req = mockRequest({});
      const res = mockResponse();

      await controller.setAutoCenter(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("setRotateWithBearing", () => {
    it("should set rotate with bearing", async () => {
      mockOrchestrator.setRotateWithBearing.mockResolvedValue(
        success(undefined),
      );

      const req = mockRequest({ enabled: false });
      const res = mockResponse();

      await controller.setRotateWithBearing(req, res);

      expect(mockOrchestrator.setRotateWithBearing).toHaveBeenCalledWith(false);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
    });

    it("should return error when enabled not provided", async () => {
      const req = mockRequest({});
      const res = mockResponse();

      await controller.setRotateWithBearing(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("getHotspotConfig", () => {
    it("should return hotspot config", async () => {
      mockWiFiService.getHotspotConfig.mockReturnValue({
        ssid: "MyHotspot",
        password: "password123",
        updatedAt: new Date().toISOString(),
      });

      const req = mockRequest();
      const res = mockResponse();

      await controller.getHotspotConfig(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          ssid: "MyHotspot",
          hasPassword: true,
        }),
      });
    });

    it("should return service unavailable when WiFi service not available", async () => {
      const controllerNoWifi = new WebController(
        mockOrchestrator as any,
        undefined, // no wifi service
      );

      const req = mockRequest();
      const res = mockResponse();

      await controllerNoWifi.getHotspotConfig(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe("setHotspotConfig", () => {
    it("should set hotspot config", async () => {
      mockWiFiService.setHotspotConfig.mockResolvedValue(success(undefined));

      const req = mockRequest({
        ssid: "NewHotspot",
        password: "newpassword123",
      });
      const res = mockResponse();

      await controller.setHotspotConfig(req, res);

      expect(mockWiFiService.setHotspotConfig).toHaveBeenCalledWith(
        "NewHotspot",
        "newpassword123",
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Hotspot configuration updated successfully",
      });
    });

    it("should return error when ssid not provided", async () => {
      const req = mockRequest({ password: "password123" });
      const res = mockResponse();

      await controller.setHotspotConfig(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return error when password is too short", async () => {
      const req = mockRequest({ ssid: "Test", password: "short" });
      const res = mockResponse();

      await controller.setHotspotConfig(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("getActiveTrackStart", () => {
    it("should return track start point", async () => {
      mockConfigService.getActiveGPXPath.mockReturnValue("/path/to/test.gpx");
      mockMapService.getTrack.mockResolvedValue(
        success({
          name: "Test Track",
          segments: [
            {
              points: [
                { latitude: 37.77, longitude: -122.42, altitude: 10 },
                { latitude: 37.78, longitude: -122.43, altitude: 15 },
              ],
            },
          ],
        }),
      );

      const req = mockRequest();
      const res = mockResponse();

      await controller.getActiveTrackStart(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          startPoint: {
            lat: 37.77,
            lon: -122.42,
            altitude: 10,
          },
          trackName: "Test Track",
        },
      });
    });

    it("should return null when no active track", async () => {
      mockConfigService.getActiveGPXPath.mockReturnValue(null);

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

    it("should return error when map service unavailable", async () => {
      const controllerNoMap = new WebController(
        mockOrchestrator as any,
        mockWiFiService as any,
        undefined,
        "./data/gpx-files",
        mockConfigService as any,
      );

      const req = mockRequest();
      const res = mockResponse();

      await controllerNoMap.getActiveTrackStart(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return error when config service unavailable", async () => {
      const controllerNoConfig = new WebController(
        mockOrchestrator as any,
        mockWiFiService as any,
        mockMapService as any,
        "./data/gpx-files",
        undefined,
      );

      const req = mockRequest();
      const res = mockResponse();

      await controllerNoConfig.getActiveTrackStart(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should handle track with no points", async () => {
      mockConfigService.getActiveGPXPath.mockReturnValue("/path/to/empty.gpx");
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

    it("should return error when track loading fails", async () => {
      mockConfigService.getActiveGPXPath.mockReturnValue("/path/to/bad.gpx");
      mockMapService.getTrack.mockResolvedValue(
        failure(new Error("File not found")),
      );

      const req = mockRequest();
      const res = mockResponse();

      await controller.getActiveTrackStart(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: "TRACK_LOAD_FAILED",
          message: "Failed to load track data",
        },
      });
    });
  });

  describe("Simulation endpoints", () => {
    describe("startSimulation", () => {
      it("should return error without trackPath", async () => {
        const req = mockRequest({ speed: "fast" });
        const res = mockResponse();

        await controller.startSimulation(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
      });

      it("should return error when simulation service unavailable", async () => {
        const controllerNoSim = new WebController(
          mockOrchestrator as any,
          mockWiFiService as any,
          mockMapService as any,
          "./data/gpx-files",
          mockConfigService as any,
          undefined, // no simulation service
        );

        const req = mockRequest({ trackPath: "/path/to/track.gpx" });
        const res = mockResponse();

        await controllerNoSim.startSimulation(req, res);

        expect(res.status).toHaveBeenCalledWith(503);
      });
    });

    describe("stopSimulation", () => {
      it("should stop simulation successfully", async () => {
        mockSimulationService.stopSimulation.mockResolvedValue(
          success(undefined),
        );

        const req = mockRequest();
        const res = mockResponse();

        await controller.stopSimulation(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            message: "Simulation stopped",
          }),
        );
      });
    });

    describe("pauseSimulation", () => {
      it("should pause simulation successfully", async () => {
        mockSimulationService.pauseSimulation.mockResolvedValue(
          success(undefined),
        );

        const req = mockRequest();
        const res = mockResponse();

        await controller.pauseSimulation(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            message: "Simulation paused",
          }),
        );
      });
    });

    describe("resumeSimulation", () => {
      it("should resume simulation successfully", async () => {
        mockSimulationService.resumeSimulation.mockResolvedValue(
          success(undefined),
        );

        const req = mockRequest();
        const res = mockResponse();

        await controller.resumeSimulation(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            message: "Simulation resumed",
          }),
        );
      });
    });

    describe("setSimulationSpeed", () => {
      it("should return error without speed", async () => {
        const req = mockRequest({});
        const res = mockResponse();

        await controller.setSimulationSpeed(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
      });

      it("should return error for invalid speed", async () => {
        const req = mockRequest({ speed: "invalid" });
        const res = mockResponse();

        await controller.setSimulationSpeed(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
      });
    });

    describe("getSimulationStatus", () => {
      it("should return simulation status", async () => {
        const req = mockRequest();
        const res = mockResponse();

        await controller.getSimulationStatus(req, res);

        expect(res.json).toHaveBeenCalledWith({
          success: true,
          data: expect.objectContaining({
            state: "idle",
          }),
        });
      });
    });
  });

  describe("Drive Navigation endpoints", () => {
    describe("saveDriveRoute", () => {
      it("should return error without destination", async () => {
        const req = mockRequest({ name: "Test Route" });
        const res = mockResponse();

        await controller.saveDriveRoute(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
      });
    });

    describe("deleteDriveRoute", () => {
      it("should return error without routeId", async () => {
        const req = mockRequest({}, {});
        const res = mockResponse();

        await controller.deleteDriveRoute(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
      });
    });

    describe("startDriveNavigation", () => {
      it("should return error without routeId", async () => {
        const req = mockRequest({});
        const res = mockResponse();

        await controller.startDriveNavigation(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
      });
    });

    describe("stopDriveNavigation", () => {
      it("should stop drive navigation", async () => {
        mockOrchestrator.stopDriveNavigation.mockResolvedValue(
          success(undefined),
        );

        const req = mockRequest();
        const res = mockResponse();

        await controller.stopDriveNavigation(req, res);

        expect(res.json).toHaveBeenCalledWith({
          success: true,
          message: "Navigation stopped",
        });
      });
    });

    describe("getDriveNavigationStatus", () => {
      it("should return drive navigation status", async () => {
        const req = mockRequest();
        const res = mockResponse();

        await controller.getDriveNavigationStatus(req, res);

        expect(res.json).toHaveBeenCalledWith({
          success: true,
          data: expect.objectContaining({
            state: "idle",
            isNavigating: false,
          }),
        });
      });
    });

    describe("simulateDriveRoute", () => {
      it("should return error without routeId", async () => {
        const req = mockRequest({ speed: "normal" });
        const res = mockResponse();

        await controller.simulateDriveRoute(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
      });
    });
  });

  describe("resetSystem", () => {
    it("should reset system", async () => {
      mockConfigService.resetToDefaults.mockResolvedValue(success(undefined));
      mockWiFiService.disconnect.mockResolvedValue(success(undefined));
      mockOrchestrator.restartOnboarding.mockResolvedValue(success(undefined));

      const req = mockRequest();
      const res = mockResponse();

      await controller.resetSystem(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message:
          "System reset to factory defaults. Device is restarting setup.",
      });
    });
  });
});
