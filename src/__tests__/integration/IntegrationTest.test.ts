// Mock hardware dependencies before importing the service container
jest.mock("lgpio", () => ({
  gpiochipOpen: jest.fn(() => 0),
  gpiochipClose: jest.fn(),
  spiOpen: jest.fn(() => 0),
  spiClose: jest.fn(),
  spiWrite: jest.fn(),
  gpioClaimOutput: jest.fn(),
  gpioClaimInput: jest.fn(),
  gpioWrite: jest.fn(),
  gpioRead: jest.fn(() => false),
}));

jest.mock("bmp-js", () => ({
  encode: jest.fn(() => ({ data: Buffer.alloc(1000) })),
  decode: jest.fn(() => ({
    width: 800,
    height: 480,
    data: Buffer.alloc(800 * 480 * 4),
  })),
}));

import { ServiceContainer } from "@di/ServiceContainer";
import { IntegratedWebService } from "@web/IntegratedWebService";
import {
  IRenderingOrchestrator,
  IGPSService,
  IConfigService,
} from "@core/interfaces";
import { success, GPSCoordinate, SystemStatus } from "@core/types";
import http from "http";

/**
 * Integration Test
 *
 * Tests the complete integration of services through the web interface
 */
describe("Integration: Web Interface → Orchestrator → Services", () => {
  let container: ServiceContainer;
  let mockOrchestrator: IRenderingOrchestrator;
  let mockGPS: IGPSService;
  let mockConfig: IConfigService;
  let webService: IntegratedWebService;
  let testPort: number;

  beforeEach(() => {
    // Get fresh container
    ServiceContainer.reset();
    container = ServiceContainer.getInstance();

    // Use random port for testing
    testPort = 3000 + Math.floor(Math.random() * 1000);

    // Create mock services
    mockGPS = createMockGPSService();
    mockConfig = createMockConfigService();
    mockOrchestrator = createMockOrchestrator();

    // Inject mocks
    container.setGPSService(mockGPS);
    container.setConfigService(mockConfig);
    container.setRenderingOrchestrator(mockOrchestrator);

    // Create integrated web service
    webService = new IntegratedWebService(mockOrchestrator, {
      port: testPort,
      host: "127.0.0.1",
      cors: true,
      apiBasePath: "/api",
      staticDirectory: "/tmp",
      websocket: { enabled: true },
    });
  });

  afterEach(async () => {
    if (webService.isRunning()) {
      await webService.stop();
    }
  });

  describe("Full Integration Flow", () => {
    it("should handle complete GPS → Display update flow", async () => {
      // Start web service
      await webService.start();

      // 1. Client requests GPS position
      const positionResponse = await makeRequest(testPort, "/api/gps/position");

      expect(positionResponse.statusCode).toBe(200);
      expect(positionResponse.body.success).toBe(true);
      expect(positionResponse.body.data).toHaveProperty("latitude");
      expect(positionResponse.body.data).toHaveProperty("longitude");

      // 2. Client sets active GPX track
      const setTrackResponse = await makeRequest(
        testPort,
        "/api/map/active",
        "POST",
        { path: "/data/test-track.gpx" },
      );

      expect(setTrackResponse.statusCode).toBe(200);
      expect(setTrackResponse.body.success).toBe(true);
      expect(mockOrchestrator.setActiveGPX).toHaveBeenCalledWith(
        "/data/test-track.gpx",
      );

      // 3. Client updates display
      const updateResponse = await makeRequest(
        testPort,
        "/api/display/update",
        "POST",
      );

      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.body.success).toBe(true);
      expect(mockOrchestrator.updateDisplay).toHaveBeenCalled();

      // 4. Client gets system status
      const statusResponse = await makeRequest(testPort, "/api/system/status");

      expect(statusResponse.statusCode).toBe(200);
      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.data).toHaveProperty("gps");
      expect(statusResponse.body.data).toHaveProperty("display");
    });

    it("should handle zoom control flow", async () => {
      await webService.start();

      // Change zoom with delta
      const deltaResponse = await makeRequest(
        testPort,
        "/api/config/zoom",
        "POST",
        { delta: 2 },
      );

      expect(deltaResponse.statusCode).toBe(200);
      expect(mockOrchestrator.changeZoom).toHaveBeenCalledWith(2);

      // Set absolute zoom
      const absoluteResponse = await makeRequest(
        testPort,
        "/api/config/zoom",
        "POST",
        { zoom: 15 },
      );

      expect(absoluteResponse.statusCode).toBe(200);
      expect(mockOrchestrator.setZoom).toHaveBeenCalledWith(15);
    });

    it("should handle auto-update control", async () => {
      await webService.start();

      // Start auto-update
      const startResponse = await makeRequest(
        testPort,
        "/api/auto-update/start",
        "POST",
      );

      expect(startResponse.statusCode).toBe(200);
      expect(mockOrchestrator.startAutoUpdate).toHaveBeenCalled();

      // Stop auto-update
      const stopResponse = await makeRequest(
        testPort,
        "/api/auto-update/stop",
        "POST",
      );

      expect(stopResponse.statusCode).toBe(200);
      expect(mockOrchestrator.stopAutoUpdate).toHaveBeenCalled();
    });

    it("should handle display preferences", async () => {
      await webService.start();

      // Set auto-center
      const autoCenterResponse = await makeRequest(
        testPort,
        "/api/config/auto-center",
        "POST",
        { enabled: true },
      );

      expect(autoCenterResponse.statusCode).toBe(200);
      expect(mockOrchestrator.setAutoCenter).toHaveBeenCalledWith(true);

      // Set rotate with bearing
      const rotateResponse = await makeRequest(
        testPort,
        "/api/config/rotate-bearing",
        "POST",
        { enabled: false },
      );

      expect(rotateResponse.statusCode).toBe(200);
      expect(mockOrchestrator.setRotateWithBearing).toHaveBeenCalledWith(false);
    });

    it("should handle errors gracefully", async () => {
      // Setup orchestrator to fail
      (mockOrchestrator.updateDisplay as jest.Mock).mockResolvedValue({
        success: false,
        error: {
          code: "UPDATE_FAILED",
          getUserMessage: () => "Failed to update display",
        },
      });

      await webService.start();

      const response = await makeRequest(
        testPort,
        "/api/display/update",
        "POST",
      );

      expect(response.statusCode).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty("code");
      expect(response.body.error).toHaveProperty("message");
    });

    it("should validate request parameters", async () => {
      await webService.start();

      // Missing required parameter
      const response = await makeRequest(
        testPort,
        "/api/map/active",
        "POST",
        {},
      );

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});

// Helper Functions

function createMockOrchestrator(): IRenderingOrchestrator {
  return {
    initialize: jest.fn().mockResolvedValue(success(undefined)),
    updateDisplay: jest.fn().mockResolvedValue(success(undefined)),
    setActiveGPX: jest.fn().mockResolvedValue(success(undefined)),
    clearActiveGPX: jest.fn().mockResolvedValue(success(undefined)),
    changeZoom: jest.fn().mockResolvedValue(success(undefined)),
    setZoom: jest.fn().mockResolvedValue(success(undefined)),
    refreshGPS: jest.fn().mockResolvedValue(success(undefined)),
    startAutoUpdate: jest.fn().mockResolvedValue(success(undefined)),
    stopAutoUpdate: jest.fn(),
    isAutoUpdateRunning: jest.fn().mockReturnValue(false),
    getCurrentPosition: jest.fn().mockResolvedValue(
      success({
        latitude: 51.5074,
        longitude: -0.1278,
        altitude: 10,
        timestamp: new Date(),
      } as GPSCoordinate),
    ),
    getSystemStatus: jest.fn().mockResolvedValue(
      success({
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
          lastUpdate: new Date(),
          refreshCount: 5,
        },
        system: {
          cpuUsage: 25,
          memoryUsage: 512,
        },
      } as SystemStatus),
    ),
    clearDisplay: jest.fn().mockResolvedValue(success(undefined)),
    displayLogo: jest.fn().mockResolvedValue(success(undefined)),
    sleepDisplay: jest.fn().mockResolvedValue(success(undefined)),
    wakeDisplay: jest.fn().mockResolvedValue(success(undefined)),
    setAutoCenter: jest.fn(),
    setRotateWithBearing: jest.fn(),
    setActiveScreen: jest.fn(),
    onGPSUpdate: jest.fn().mockReturnValue(() => {}),
    onGPSStatusChange: jest.fn().mockReturnValue(() => {}),
    onDisplayUpdate: jest.fn().mockReturnValue(() => {}),
    onError: jest.fn().mockReturnValue(() => {}),
    checkAndShowOnboardingScreen: jest
      .fn()
      .mockResolvedValue(success(undefined)),
    restartOnboarding: jest.fn().mockResolvedValue(success(undefined)),
    setWebSocketClientCount: jest.fn(),
    startDriveNavigation: jest.fn().mockResolvedValue(success(undefined)),
    stopDriveNavigation: jest.fn().mockResolvedValue(success(undefined)),
    isDriveNavigating: jest.fn().mockReturnValue(false),
    showFullRoute: jest
      .fn()
      .mockImplementation(() => Promise.resolve(success(undefined))),
    onDriveNavigationUpdate: jest.fn().mockReturnValue(() => {}),
    onSpeedLimitPrefetchProgress: jest.fn().mockReturnValue(() => {}),
    onPOIPrefetchProgress: jest.fn().mockReturnValue(() => {}),
    onLocationPrefetchProgress: jest.fn().mockReturnValue(() => {}),
    onElevationPrefetchProgress: jest.fn().mockReturnValue(() => {}),
    onRoadSurfacePrefetchProgress: jest.fn().mockReturnValue(() => {}),
    refreshRoutePOIs: jest.fn().mockResolvedValue(success(undefined)),
    clearAllPOICache: jest.fn().mockResolvedValue(success(undefined)),
    getMockDisplayImage: jest.fn().mockReturnValue(null),
    hasMockDisplayImage: jest.fn().mockReturnValue(false),
    isMockGPS: jest.fn().mockReturnValue(false),
    setMockGPSPosition: jest.fn().mockReturnValue(false),
    getCurrentRoadSurface: jest.fn().mockReturnValue(null),
    getCurrentSpeedLimit: jest.fn().mockReturnValue(null),
    getCurrentLocationName: jest.fn().mockReturnValue(null),
    dispose: jest.fn().mockResolvedValue(undefined),
  } as IRenderingOrchestrator;
}

function createMockGPSService(): IGPSService {
  return {
    initialize: jest.fn().mockResolvedValue(success(undefined)),
    getCurrentPosition: jest.fn().mockResolvedValue(
      success({
        latitude: 51.5074,
        longitude: -0.1278,
        timestamp: new Date(),
      } as GPSCoordinate),
    ),
    getStatus: jest.fn(),
    startTracking: jest.fn().mockResolvedValue(success(undefined)),
    stopTracking: jest.fn().mockResolvedValue(success(undefined)),
    isTracking: jest.fn().mockReturnValue(true),
    waitForFix: jest.fn(),
    onPositionUpdate: jest.fn().mockReturnValue(() => {}),
    onStatusChange: jest.fn().mockReturnValue(() => {}),
    dispose: jest.fn().mockResolvedValue(undefined),
  } as IGPSService;
}

function createMockConfigService(): IConfigService {
  return {
    initialize: jest.fn().mockResolvedValue(success(undefined)),
    getConfig: jest.fn(),
    getUserState: jest.fn(),
    getDisplayWidth: jest.fn().mockReturnValue(800),
    getDisplayHeight: jest.fn().mockReturnValue(480),
    getZoomLevel: jest.fn().mockReturnValue(14),
    setZoomLevel: jest.fn(),
    getMinZoomLevel: jest.fn().mockReturnValue(1),
    getMaxZoomLevel: jest.fn().mockReturnValue(20),
    getActiveGPXPath: jest.fn().mockReturnValue(null),
    setActiveGPXPath: jest.fn(),
    getGPSUpdateInterval: jest.fn().mockReturnValue(1000),
    setGPSUpdateInterval: jest.fn(),
    getRenderOptions: jest.fn(),
    updateRenderOptions: jest.fn(),
    getAutoCenter: jest.fn().mockReturnValue(true),
    setAutoCenter: jest.fn(),
    getCenterOverride: jest.fn().mockReturnValue(null),
    setCenterOverride: jest.fn(),
    clearCenterOverride: jest.fn(),
    getRotateWithBearing: jest.fn().mockReturnValue(false),
    setRotateWithBearing: jest.fn(),
    getActiveScreen: jest.fn().mockReturnValue("track"),
    setActiveScreen: jest.fn(),
    getAutoRefreshInterval: jest.fn().mockReturnValue(0),
    setAutoRefreshInterval: jest.fn(),
    getShowSpeedLimit: jest.fn().mockReturnValue(true),
    setShowSpeedLimit: jest.fn(),
    getSpeedUnit: jest.fn().mockReturnValue("kmh"),
    setSpeedUnit: jest.fn(),
    getShowLocationName: jest.fn().mockReturnValue(true),
    setShowLocationName: jest.fn(),
    getShowElevation: jest.fn().mockReturnValue(true),
    setShowElevation: jest.fn(),
    getShowRoads: jest.fn().mockReturnValue(true),
    setShowRoads: jest.fn(),
    getShowWater: jest.fn().mockReturnValue(true),
    setShowWater: jest.fn(),
    getShowWaterways: jest.fn().mockReturnValue(true),
    setShowWaterways: jest.fn(),
    getShowLanduse: jest.fn().mockReturnValue(true),
    setShowLanduse: jest.fn(),
    getShowRoadSurface: jest.fn().mockReturnValue(false),
    setShowRoadSurface: jest.fn(),
    getEnabledPOICategories: jest
      .fn()
      .mockReturnValue(["fuel", "parking", "food", "restroom", "viewpoint"]),
    setEnabledPOICategories: jest.fn(),
    isPOICategoryEnabled: jest.fn().mockReturnValue(true),
    setPOICategoryEnabled: jest.fn(),
    getRoutingProfile: jest.fn().mockReturnValue("car"),
    setRoutingProfile: jest.fn(),
    getRecentFiles: jest.fn().mockReturnValue([]),
    addRecentFile: jest.fn(),
    clearRecentFiles: jest.fn(),
    getRecentDestinations: jest.fn().mockReturnValue([]),
    addRecentDestination: jest.fn(),
    removeRecentDestination: jest.fn(),
    clearRecentDestinations: jest.fn(),
    isOnboardingCompleted: jest.fn().mockReturnValue(true),
    setOnboardingCompleted: jest.fn(),
    save: jest.fn().mockResolvedValue(success(undefined)),
    reload: jest.fn().mockResolvedValue(success(undefined)),
    resetToDefaults: jest.fn().mockResolvedValue(success(undefined)),
    exportConfig: jest.fn().mockReturnValue("{}"),
    importConfig: jest.fn().mockReturnValue(success(undefined)),
    getWiFiFallbackNetwork: jest.fn().mockReturnValue(undefined),
    setWiFiFallbackNetwork: jest.fn(),
    getHotspotConfig: jest.fn().mockReturnValue(undefined),
    setHotspotConfig: jest.fn(),
    getOfflineRoutingEnabled: jest.fn().mockReturnValue(true),
    setOfflineRoutingEnabled: jest.fn(),
    getPreferOfflineRouting: jest.fn().mockReturnValue(true),
    setPreferOfflineRouting: jest.fn(),
    getOfflineRoutingManifestUrl: jest.fn().mockReturnValue(""),
    setOfflineRoutingManifestUrl: jest.fn(),
    getInstalledOfflineRegions: jest.fn().mockReturnValue([]),
    addInstalledOfflineRegion: jest.fn(),
    removeInstalledOfflineRegion: jest.fn(),
    clearInstalledOfflineRegions: jest.fn(),
  } as IConfigService;
}

function makeRequest(
  port: number,
  path: string,
  method: string = "GET",
  data?: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : undefined;

    const options = {
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: postData
        ? {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
          }
        : {},
    };

    const req = http.request(options, (res) => {
      let body = "";

      res.on("data", (chunk) => {
        body += chunk;
      });

      res.on("end", () => {
        try {
          resolve({
            statusCode: res.statusCode || 500,
            body: JSON.parse(body),
          });
        } catch {
          resolve({
            statusCode: res.statusCode || 500,
            body: {},
          });
        }
      });
    });

    req.on("error", reject);

    if (postData) {
      req.write(postData);
    }

    req.end();
  });
}
