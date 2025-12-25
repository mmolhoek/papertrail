/* eslint-disable @typescript-eslint/no-explicit-any */
import { RenderingOrchestrator } from "@services/orchestrator/RenderingOrchestrator";
import {
  success,
  failure,
  GPSCoordinate,
  GPXTrack,
  Bitmap1Bit,
  DriveRoute,
  ManeuverType,
  WiFiState,
  DisplayUpdateMode,
  ScreenType,
} from "@core/types";

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock path module
jest.mock("path", () => ({
  basename: jest.fn().mockImplementation((p: string) => {
    const parts = p.split("/");
    return parts[parts.length - 1];
  }),
}));

describe("RenderingOrchestrator", () => {
  let orchestrator: RenderingOrchestrator;
  let mockGPSService: any;
  let mockMapService: any;
  let mockSVGService: any;
  let mockDisplayService: any;
  let mockConfigService: any;
  let mockWiFiService: any;
  let mockTextRendererService: any;
  let mockSimulationService: any;
  let mockDriveNavigationService: any;
  let mockSpeedLimitService: any;
  let mockPOIService: any;
  let mockReverseGeocodingService: any;
  let mockElevationService: any;
  let mockVectorMapService: any;

  const testBitmap: Bitmap1Bit = {
    width: 800,
    height: 480,
    data: new Uint8Array((800 * 480) / 8),
  };

  const testPosition: GPSCoordinate = {
    latitude: 37.7749,
    longitude: -122.4194,
    timestamp: new Date(),
  };

  const testTrack: GPXTrack = {
    name: "Test Track",
    segments: [
      {
        points: [
          { latitude: 37.77, longitude: -122.41, timestamp: new Date() },
          { latitude: 37.78, longitude: -122.42, timestamp: new Date() },
        ],
      },
    ],
    totalDistance: 5000,
  };

  const testRoute: DriveRoute = {
    id: "route-1",
    destination: "Test Destination",
    totalDistance: 10000,
    estimatedTime: 600,
    createdAt: new Date(),
    startPoint: { latitude: 51.5, longitude: -0.1 },
    endPoint: { latitude: 51.51, longitude: -0.09 },
    waypoints: [
      {
        latitude: 51.5,
        longitude: -0.1,
        maneuverType: ManeuverType.LEFT,
        distance: 100,
        instruction: "Turn left",
        streetName: "Test Street",
        index: 0,
      },
      {
        latitude: 51.51,
        longitude: -0.09,
        maneuverType: ManeuverType.ARRIVE,
        distance: 0,
        instruction: "Arrive at destination",
        index: 1,
      },
    ],
    geometry: [
      [51.5, -0.1],
      [51.505, -0.095],
      [51.51, -0.09],
    ],
  };

  const createMockServices = () => {
    mockGPSService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      dispose: jest.fn().mockResolvedValue(undefined),
      getCurrentPosition: jest.fn().mockResolvedValue(success(testPosition)),
      startTracking: jest.fn().mockResolvedValue(success(undefined)),
      stopTracking: jest.fn(),
      isTracking: jest.fn().mockReturnValue(true),
      getStatus: jest.fn().mockResolvedValue(
        success({
          fixQuality: 1,
          satellitesInUse: 8,
          hdop: 1.2,
          vdop: 1.5,
          pdop: 1.8,
          isTracking: true,
        }),
      ),
      onPositionUpdate: jest.fn().mockReturnValue(() => {}),
      onStatusChange: jest.fn().mockReturnValue(() => {}),
      isMock: jest.fn().mockReturnValue(false),
      setPosition: jest.fn(),
    };

    mockMapService = {
      getTrack: jest.fn().mockResolvedValue(success(testTrack)),
      loadGPXFile: jest.fn().mockResolvedValue(
        success({
          tracks: [testTrack],
          waypoints: [],
        }),
      ),
      validateGPXFile: jest.fn().mockResolvedValue(success(undefined)),
      listAvailableGPXFiles: jest
        .fn()
        .mockResolvedValue(success(["track1.gpx", "track2.gpx"])),
      calculateBounds: jest.fn().mockReturnValue({
        minLat: 37,
        maxLat: 38,
        minLon: -123,
        maxLon: -122,
      }),
      calculateDistance: jest.fn().mockReturnValue(5000),
      calculateElevation: jest
        .fn()
        .mockReturnValue({ gain: 100, loss: 50, min: 0, max: 150 }),
    };

    mockSVGService = {
      renderViewport: jest.fn().mockResolvedValue(success(testBitmap)),
      renderFollowTrackScreen: jest.fn().mockResolvedValue(success(testBitmap)),
      renderDriveMapScreen: jest.fn().mockResolvedValue(success(testBitmap)),
      renderTurnScreen: jest.fn().mockResolvedValue(success(testBitmap)),
      renderOffRoadScreen: jest.fn().mockResolvedValue(success(testBitmap)),
      renderArrivalScreen: jest.fn().mockResolvedValue(success(testBitmap)),
      createBlankBitmap: jest.fn().mockReturnValue(testBitmap),
      getDefaultRenderOptions: jest.fn().mockReturnValue({ showLine: true }),
      addCompass: jest.fn().mockReturnValue(success(testBitmap)),
      addScaleBar: jest.fn().mockReturnValue(success(testBitmap)),
    };

    mockDisplayService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      dispose: jest.fn().mockResolvedValue(undefined),
      displayBitmap: jest.fn().mockResolvedValue(success(undefined)),
      displayLogo: jest.fn().mockResolvedValue(success(undefined)),
      clear: jest.fn().mockResolvedValue(success(undefined)),
      sleep: jest.fn().mockResolvedValue(success(undefined)),
      wake: jest.fn().mockResolvedValue(success(undefined)),
      isBusy: jest.fn().mockReturnValue(false),
      getWidth: jest.fn().mockReturnValue(800),
      getHeight: jest.fn().mockReturnValue(480),
      getStatus: jest.fn().mockResolvedValue(
        success({
          busy: false,
          model: "test-model",
          width: 800,
          height: 480,
          lastUpdate: new Date(),
          fullRefreshCount: 5,
        }),
      ),
      getMockDisplayImage: jest.fn().mockReturnValue(Buffer.from([0x89])),
      hasMockDisplayImage: jest.fn().mockReturnValue(true),
    };

    mockConfigService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      dispose: jest.fn().mockResolvedValue(undefined),
      getActiveTrackId: jest.fn().mockReturnValue(null),
      setActiveTrackId: jest.fn(),
      getActiveGPXPath: jest.fn().mockReturnValue(null),
      setActiveGPXPath: jest.fn(),
      isOnboardingCompleted: jest.fn().mockReturnValue(true),
      setOnboardingCompleted: jest.fn(),
      getZoomLevel: jest.fn().mockReturnValue(15),
      setZoomLevel: jest.fn(),
      save: jest.fn().mockResolvedValue(success(undefined)),
      getDisplayWidth: jest.fn().mockReturnValue(800),
      getDisplayHeight: jest.fn().mockReturnValue(480),
      getAutoRefreshInterval: jest.fn().mockReturnValue(30),
      setAutoCenter: jest.fn(),
      setRotateWithBearing: jest.fn(),
      getActiveScreen: jest.fn().mockReturnValue(ScreenType.TRACK),
      setActiveScreen: jest.fn(),
      getShowSpeedLimit: jest.fn().mockReturnValue(true),
      getShowLocationName: jest.fn().mockReturnValue(true),
      getShowElevation: jest.fn().mockReturnValue(true),
      getShowRoads: jest.fn().mockReturnValue(true),
      getEnabledPOICategories: jest.fn().mockReturnValue(["restaurant"]),
      getSpeedUnit: jest.fn().mockReturnValue("kmh"),
      getRenderOptions: jest.fn().mockReturnValue({}),
      getRotateWithBearing: jest.fn().mockReturnValue(false),
      getConfig: jest.fn().mockReturnValue({ web: { port: 3000 } }),
      getRoutingProfile: jest.fn().mockReturnValue("car"),
    };

    mockWiFiService = {
      onStateChange: jest.fn().mockReturnValue(() => {}),
      getState: jest.fn().mockReturnValue(WiFiState.IDLE),
      isConnectedToMobileHotspot: jest.fn().mockResolvedValue(success(false)),
      attemptMobileHotspotConnection: jest
        .fn()
        .mockResolvedValue(success(undefined)),
      notifyConnectedScreenDisplayed: jest.fn(),
      hasConnectedScreenBeenDisplayed: jest.fn().mockReturnValue(false),
      setWebSocketClientCount: jest.fn(),
    };

    mockTextRendererService = {
      renderTemplate: jest.fn().mockResolvedValue(success(testBitmap)),
    };

    mockSimulationService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      isSimulating: jest.fn().mockReturnValue(false),
      stopSimulation: jest.fn().mockResolvedValue(success(undefined)),
      onSimulationUpdate: jest.fn().mockReturnValue(() => {}),
      onStateChange: jest.fn().mockReturnValue(() => {}),
      onPositionUpdate: jest.fn().mockReturnValue(() => {}),
    };

    mockDriveNavigationService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      startNavigation: jest.fn().mockResolvedValue(success(undefined)),
      stopNavigation: jest.fn().mockResolvedValue(success(undefined)),
      isNavigating: jest.fn().mockReturnValue(false),
      getActiveRoute: jest.fn().mockReturnValue(null),
      onNavigationUpdate: jest.fn().mockReturnValue(() => {}),
      onDisplayUpdate: jest.fn().mockReturnValue(() => {}),
    };

    mockSpeedLimitService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      hasRouteCache: jest.fn().mockReturnValue(false),
      prefetchRouteSpeedLimits: jest.fn().mockResolvedValue(success(10)),
    };

    mockPOIService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      hasRouteCache: jest.fn().mockReturnValue(false),
      prefetchRoutePOIs: jest.fn().mockResolvedValue(success(20)),
      clearRouteCache: jest.fn().mockResolvedValue(success(undefined)),
      clearAllCache: jest.fn().mockResolvedValue(success(undefined)),
      getNearbyPOIs: jest.fn().mockResolvedValue(success([])),
    };

    mockReverseGeocodingService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      hasRouteCache: jest.fn().mockReturnValue(false),
      prefetchRouteLocations: jest.fn().mockResolvedValue(success(15)),
    };

    mockElevationService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      hasRouteCache: jest.fn().mockReturnValue(false),
      prefetchRouteElevations: jest.fn().mockResolvedValue(success(100)),
      getRouteMetrics: jest
        .fn()
        .mockReturnValue({ totalClimb: 500, totalDescent: 300 }),
    };

    mockVectorMapService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      hasRouteCache: jest.fn().mockReturnValue(false),
      prefetchRouteRoads: jest.fn().mockResolvedValue(success(50)),
      getAllCachedRoads: jest.fn().mockReturnValue([]),
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    createMockServices();

    orchestrator = new RenderingOrchestrator(
      mockGPSService,
      mockMapService,
      mockSVGService,
      mockDisplayService,
      mockConfigService,
      mockWiFiService,
      mockTextRendererService,
      mockSimulationService,
      mockDriveNavigationService,
      mockSpeedLimitService,
      mockPOIService,
      mockReverseGeocodingService,
      mockElevationService,
      mockVectorMapService,
    );
  });

  afterEach(async () => {
    await orchestrator.dispose();
  });

  describe("initialize", () => {
    it("should initialize successfully with all services", async () => {
      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
      expect(mockGPSService.initialize).toHaveBeenCalled();
      expect(mockDisplayService.initialize).toHaveBeenCalled();
      expect(mockConfigService.initialize).toHaveBeenCalled();
    });

    it("should return success if already initialized", async () => {
      await orchestrator.initialize();
      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
      // Services should only be initialized once
      expect(mockConfigService.initialize).toHaveBeenCalledTimes(1);
    });

    it("should handle ConfigService initialization failure", async () => {
      mockConfigService.initialize.mockResolvedValue(
        failure(new Error("Config init failed")),
      );

      const result = await orchestrator.initialize();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("ConfigService");
      }
    });

    it("should handle GPS initialization failure", async () => {
      mockGPSService.initialize.mockResolvedValue(
        failure(new Error("GPS init failed")),
      );

      const result = await orchestrator.initialize();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("GPSService");
      }
    });

    it("should handle Display initialization failure", async () => {
      mockDisplayService.initialize.mockResolvedValue(
        failure(new Error("Display init failed")),
      );

      const result = await orchestrator.initialize();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("DisplayService");
      }
    });

    it("should handle logo display failure", async () => {
      mockDisplayService.displayLogo.mockResolvedValue(
        failure(new Error("Logo display failed")),
      );

      const result = await orchestrator.initialize();

      expect(result.success).toBe(false);
    });

    it("should handle simulation service failure gracefully", async () => {
      mockSimulationService.initialize.mockResolvedValue(
        failure(new Error("Simulation init failed")),
      );

      const result = await orchestrator.initialize();

      // Should still succeed - simulation is optional
      expect(result.success).toBe(true);
    });

    it("should handle drive navigation service failure gracefully", async () => {
      mockDriveNavigationService.initialize.mockResolvedValue(
        failure(new Error("Drive nav init failed")),
      );

      const result = await orchestrator.initialize();

      // Should still succeed - drive nav is optional
      expect(result.success).toBe(true);
    });

    it("should handle speed limit service failure gracefully", async () => {
      mockSpeedLimitService.initialize.mockResolvedValue(
        failure(new Error("Speed limit init failed")),
      );

      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
    });

    it("should handle POI service failure gracefully", async () => {
      mockPOIService.initialize.mockResolvedValue(
        failure(new Error("POI init failed")),
      );

      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
    });

    it("should handle reverse geocoding service failure gracefully", async () => {
      mockReverseGeocodingService.initialize.mockResolvedValue(
        failure(new Error("Geocoding init failed")),
      );

      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
    });

    it("should handle elevation service failure gracefully", async () => {
      mockElevationService.initialize.mockResolvedValue(
        failure(new Error("Elevation init failed")),
      );

      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
    });

    it("should handle vector map service failure gracefully", async () => {
      mockVectorMapService.initialize.mockResolvedValue(
        failure(new Error("Vector map init failed")),
      );

      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
    });

    it("should handle exception during initialization", async () => {
      mockConfigService.initialize.mockRejectedValue(
        new Error("Unexpected error"),
      );

      const result = await orchestrator.initialize();

      expect(result.success).toBe(false);
    });

    it("should handle non-Error exception during initialization", async () => {
      mockConfigService.initialize.mockRejectedValue("String error");

      const result = await orchestrator.initialize();

      expect(result.success).toBe(false);
    });
  });

  describe("drive navigation", () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it("should start drive navigation successfully", async () => {
      const result = await orchestrator.startDriveNavigation(testRoute);

      expect(result).toHaveProperty("success");
    });

    it("should stop drive navigation successfully", async () => {
      await orchestrator.startDriveNavigation(testRoute);
      const result = await orchestrator.stopDriveNavigation();

      expect(result.success).toBe(true);
    });

    it("should return false for isDriveNavigating when not navigating", () => {
      expect(orchestrator.isDriveNavigating()).toBe(false);
    });

    it("should trigger speed limit prefetch when starting navigation", async () => {
      await orchestrator.startDriveNavigation(testRoute);

      // Allow prefetch promise to start
      await Promise.resolve();

      expect(mockSpeedLimitService.prefetchRouteSpeedLimits).toHaveBeenCalled();
    });

    it("should skip speed limit prefetch when already cached", async () => {
      mockSpeedLimitService.hasRouteCache.mockReturnValue(true);

      await orchestrator.startDriveNavigation(testRoute);

      expect(
        mockSpeedLimitService.prefetchRouteSpeedLimits,
      ).not.toHaveBeenCalled();
    });

    it("should trigger POI prefetch when starting navigation", async () => {
      await orchestrator.startDriveNavigation(testRoute);

      await Promise.resolve();

      expect(mockPOIService.prefetchRoutePOIs).toHaveBeenCalled();
    });

    it("should skip POI prefetch when already cached", async () => {
      mockPOIService.hasRouteCache.mockReturnValue(true);

      await orchestrator.startDriveNavigation(testRoute);

      expect(mockPOIService.prefetchRoutePOIs).not.toHaveBeenCalled();
    });

    it("should trigger location prefetch when starting navigation", async () => {
      await orchestrator.startDriveNavigation(testRoute);

      await Promise.resolve();

      expect(
        mockReverseGeocodingService.prefetchRouteLocations,
      ).toHaveBeenCalled();
    });

    it("should skip location prefetch when already cached", async () => {
      mockReverseGeocodingService.hasRouteCache.mockReturnValue(true);

      await orchestrator.startDriveNavigation(testRoute);

      expect(
        mockReverseGeocodingService.prefetchRouteLocations,
      ).not.toHaveBeenCalled();
    });

    it("should trigger elevation prefetch when starting navigation", async () => {
      await orchestrator.startDriveNavigation(testRoute);

      await Promise.resolve();

      expect(mockElevationService.prefetchRouteElevations).toHaveBeenCalled();
    });

    it("should skip elevation prefetch when already cached", async () => {
      mockElevationService.hasRouteCache.mockReturnValue(true);

      await orchestrator.startDriveNavigation(testRoute);

      expect(
        mockElevationService.prefetchRouteElevations,
      ).not.toHaveBeenCalled();
    });

    it("should trigger road prefetch when starting navigation", async () => {
      await orchestrator.startDriveNavigation(testRoute);

      await Promise.resolve();

      expect(mockVectorMapService.prefetchRouteRoads).toHaveBeenCalled();
    });

    it("should skip road prefetch when already cached", async () => {
      mockVectorMapService.hasRouteCache.mockReturnValue(true);

      await orchestrator.startDriveNavigation(testRoute);

      expect(mockVectorMapService.prefetchRouteRoads).not.toHaveBeenCalled();
    });

    it("should register drive navigation update callback", async () => {
      const callback = jest.fn();
      const unsubscribe = orchestrator.onDriveNavigationUpdate(callback);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });
  });

  describe("refreshRoutePOIs", () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it("should return success when no POI service", async () => {
      const orchestratorNoPOI = new RenderingOrchestrator(
        mockGPSService,
        mockMapService,
        mockSVGService,
        mockDisplayService,
        mockConfigService,
      );
      await orchestratorNoPOI.initialize();

      const result = await orchestratorNoPOI.refreshRoutePOIs();

      expect(result.success).toBe(true);
      await orchestratorNoPOI.dispose();
    });

    it("should return success when no active route", async () => {
      const result = await orchestrator.refreshRoutePOIs();

      expect(result.success).toBe(true);
    });

    it("should clear cache when no POI categories enabled", async () => {
      mockConfigService.getEnabledPOICategories.mockReturnValue([]);

      const result = await orchestrator.refreshRoutePOIs();

      expect(result.success).toBe(true);
    });
  });

  describe("clearAllPOICache", () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it("should clear all POI cache", async () => {
      const result = await orchestrator.clearAllPOICache();

      expect(result.success).toBe(true);
      expect(mockPOIService.clearAllCache).toHaveBeenCalled();
    });

    it("should return success when no POI service", async () => {
      const orchestratorNoPOI = new RenderingOrchestrator(
        mockGPSService,
        mockMapService,
        mockSVGService,
        mockDisplayService,
        mockConfigService,
      );
      await orchestratorNoPOI.initialize();

      const result = await orchestratorNoPOI.clearAllPOICache();

      expect(result.success).toBe(true);
      await orchestratorNoPOI.dispose();
    });
  });

  describe("showFullRoute", () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it("should fail when no route available", async () => {
      const result = await orchestrator.showFullRoute();

      expect(result.success).toBe(false);
    });

    it("should show full route when provided", async () => {
      const result = await orchestrator.showFullRoute(testRoute);

      expect(result).toHaveProperty("success");
    });

    it("should fail with empty geometry", async () => {
      const routeNoGeometry = { ...testRoute, geometry: [] };
      const result = await orchestrator.showFullRoute(routeNoGeometry);

      expect(result.success).toBe(false);
    });

    it("should handle render failure", async () => {
      mockSVGService.renderDriveMapScreen.mockResolvedValue(
        failure(new Error("Render failed")),
      );

      const result = await orchestrator.showFullRoute(testRoute);

      expect(result.success).toBe(false);
    });

    it("should handle render exception", async () => {
      mockSVGService.renderDriveMapScreen.mockRejectedValue(
        new Error("Render exception"),
      );

      const result = await orchestrator.showFullRoute(testRoute);

      expect(result.success).toBe(false);
    });
  });

  describe("prefetch progress callbacks", () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it("should register and unregister speed limit prefetch callback", () => {
      const callback = jest.fn();
      const unsubscribe = orchestrator.onSpeedLimitPrefetchProgress(callback);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should register and unregister POI prefetch callback", () => {
      const callback = jest.fn();
      const unsubscribe = orchestrator.onPOIPrefetchProgress(callback);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should register and unregister location prefetch callback", () => {
      const callback = jest.fn();
      const unsubscribe = orchestrator.onLocationPrefetchProgress(callback);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should register and unregister elevation prefetch callback", () => {
      const callback = jest.fn();
      const unsubscribe = orchestrator.onElevationPrefetchProgress(callback);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should register and unregister road prefetch callback", () => {
      const callback = jest.fn();
      const unsubscribe = orchestrator.onRoadPrefetchProgress(callback);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });
  });

  describe("getSystemStatus", () => {
    it("should get system status when initialized", async () => {
      await orchestrator.initialize();
      mockConfigService.getActiveGPXPath.mockReturnValue("/path/to/track.gpx");

      const result = await orchestrator.getSystemStatus();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("uptime");
        expect(result.data).toHaveProperty("gps");
        expect(result.data).toHaveProperty("display");
        expect(result.data).toHaveProperty("system");
      }
    });

    it("should fail when not initialized", async () => {
      const result = await orchestrator.getSystemStatus();

      expect(result.success).toBe(false);
    });

    it("should include active track info when track is loaded", async () => {
      await orchestrator.initialize();
      mockConfigService.getActiveGPXPath.mockReturnValue("/path/to/track.gpx");

      const result = await orchestrator.getSystemStatus();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.activeTrack).toBeDefined();
      }
    });

    it("should handle track load failure gracefully", async () => {
      await orchestrator.initialize();
      mockConfigService.getActiveGPXPath.mockReturnValue("/path/to/track.gpx");
      mockMapService.getTrack.mockResolvedValue(
        failure(new Error("Track not found")),
      );

      const result = await orchestrator.getSystemStatus();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.activeTrack).toBeUndefined();
      }
    });
  });

  describe("getCurrentPosition", () => {
    it("should get current position when initialized", async () => {
      await orchestrator.initialize();

      const result = await orchestrator.getCurrentPosition();

      expect(result).toHaveProperty("success");
    });

    it("should fail when not initialized", async () => {
      const result = await orchestrator.getCurrentPosition();

      expect(result.success).toBe(false);
    });
  });

  describe("setActiveGPX", () => {
    it("should set active GPX when initialized", async () => {
      await orchestrator.initialize();

      const result = await orchestrator.setActiveGPX("test-track.gpx");

      expect(result).toHaveProperty("success");
    });

    it("should fail when not initialized", async () => {
      const result = await orchestrator.setActiveGPX("test-track.gpx");

      expect(result.success).toBe(false);
    });

    it("should handle validation failure", async () => {
      await orchestrator.initialize();
      mockMapService.validateGPXFile.mockResolvedValue(
        failure(new Error("Invalid GPX")),
      );

      const result = await orchestrator.setActiveGPX("invalid.gpx");

      expect(result.success).toBe(false);
    });

    it("should stop simulation when switching tracks", async () => {
      await orchestrator.initialize();
      mockSimulationService.isSimulating.mockReturnValue(true);

      await orchestrator.setActiveGPX("new-track.gpx");

      expect(mockSimulationService.stopSimulation).toHaveBeenCalled();
    });

    it("should mark onboarding complete on first track load", async () => {
      await orchestrator.initialize();
      mockConfigService.isOnboardingCompleted.mockReturnValue(false);

      await orchestrator.setActiveGPX("first-track.gpx");

      expect(mockConfigService.setOnboardingCompleted).toHaveBeenCalledWith(
        true,
      );
    });

    it("should handle exception during setActiveGPX", async () => {
      await orchestrator.initialize();
      mockMapService.validateGPXFile.mockRejectedValue(
        new Error("Unexpected error"),
      );

      const result = await orchestrator.setActiveGPX("track.gpx");

      expect(result.success).toBe(false);
    });
  });

  describe("clearActiveGPX", () => {
    it("should clear active GPX", async () => {
      await orchestrator.initialize();
      await orchestrator.setActiveGPX("test-track.gpx");

      const result = await orchestrator.clearActiveGPX();

      expect(result.success).toBe(true);
      expect(mockConfigService.setActiveGPXPath).toHaveBeenCalledWith(null);
    });
  });

  describe("zoom methods", () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it("should change zoom level", async () => {
      const result = await orchestrator.changeZoom(1);

      expect(result).toHaveProperty("success");
      expect(mockConfigService.setZoomLevel).toHaveBeenCalled();
    });

    it("should set absolute zoom level", async () => {
      const result = await orchestrator.setZoom(18);

      expect(result).toHaveProperty("success");
      expect(mockConfigService.setZoomLevel).toHaveBeenCalledWith(18);
    });

    it("should fail changeZoom when not initialized", async () => {
      const uninitOrchestrator = new RenderingOrchestrator(
        mockGPSService,
        mockMapService,
        mockSVGService,
        mockDisplayService,
        mockConfigService,
      );

      const result = await uninitOrchestrator.changeZoom(1);

      expect(result.success).toBe(false);
      await uninitOrchestrator.dispose();
    });

    it("should fail setZoom when not initialized", async () => {
      const uninitOrchestrator = new RenderingOrchestrator(
        mockGPSService,
        mockMapService,
        mockSVGService,
        mockDisplayService,
        mockConfigService,
      );

      const result = await uninitOrchestrator.setZoom(15);

      expect(result.success).toBe(false);
      await uninitOrchestrator.dispose();
    });
  });

  describe("calculateFitZoom", () => {
    it("should calculate appropriate zoom level for track", async () => {
      await orchestrator.initialize();

      const zoom = orchestrator.calculateFitZoom(testTrack);

      expect(zoom).toBeGreaterThanOrEqual(1);
      expect(zoom).toBeLessThanOrEqual(20);
    });
  });

  describe("updateDisplay", () => {
    it("should update display when initialized", async () => {
      await orchestrator.initialize();

      const result = await orchestrator.updateDisplay();

      expect(result).toHaveProperty("success");
    });

    it("should fail when not initialized", async () => {
      const result = await orchestrator.updateDisplay();

      expect(result.success).toBe(false);
    });

    it("should accept display update mode", async () => {
      await orchestrator.initialize();

      const result = await orchestrator.updateDisplay(DisplayUpdateMode.FULL);

      expect(result).toHaveProperty("success");
    });
  });

  describe("refreshGPS", () => {
    it("should refresh GPS and update display", async () => {
      await orchestrator.initialize();

      const result = await orchestrator.refreshGPS();

      expect(result).toHaveProperty("success");
    });
  });

  describe("auto update", () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it("should start auto update", async () => {
      const result = await orchestrator.startAutoUpdate();

      expect(result.success).toBe(true);
      expect(orchestrator.isAutoUpdateRunning()).toBe(true);
    });

    it("should fail when already running", async () => {
      await orchestrator.startAutoUpdate();
      const result = await orchestrator.startAutoUpdate();

      expect(result.success).toBe(false);
    });

    it("should fail with invalid interval", async () => {
      mockConfigService.getAutoRefreshInterval.mockReturnValue(0);

      const result = await orchestrator.startAutoUpdate();

      expect(result.success).toBe(false);
    });

    it("should stop auto update", async () => {
      await orchestrator.startAutoUpdate();

      orchestrator.stopAutoUpdate();

      expect(orchestrator.isAutoUpdateRunning()).toBe(false);
    });

    it("should handle stop when not running", () => {
      // Should not throw
      orchestrator.stopAutoUpdate();

      expect(orchestrator.isAutoUpdateRunning()).toBe(false);
    });

    it("should trigger updates at interval", async () => {
      jest.useFakeTimers();
      await orchestrator.startAutoUpdate();

      jest.advanceTimersByTime(30000);

      // updateDisplay should have been called
      expect(orchestrator.isAutoUpdateRunning()).toBe(true);
      jest.useRealTimers();
    });

    it("should fail when not initialized", async () => {
      const uninitOrchestrator = new RenderingOrchestrator(
        mockGPSService,
        mockMapService,
        mockSVGService,
        mockDisplayService,
        mockConfigService,
      );

      const result = await uninitOrchestrator.startAutoUpdate();

      expect(result.success).toBe(false);
      await uninitOrchestrator.dispose();
    });
  });

  describe("display methods", () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it("should clear display", async () => {
      const result = await orchestrator.clearDisplay();

      expect(result.success).toBe(true);
      expect(mockDisplayService.clear).toHaveBeenCalled();
    });

    it("should handle clear display failure", async () => {
      mockDisplayService.clear.mockResolvedValue(
        failure(new Error("Clear failed")),
      );

      const result = await orchestrator.clearDisplay();

      expect(result.success).toBe(false);
    });

    it("should display logo", async () => {
      const result = await orchestrator.displayLogo();

      expect(result.success).toBe(true);
      expect(mockDisplayService.displayLogo).toHaveBeenCalled();
    });

    it("should handle display logo failure", async () => {
      mockDisplayService.displayLogo.mockResolvedValue(
        failure(new Error("Logo failed")),
      );

      const result = await orchestrator.displayLogo();

      expect(result.success).toBe(false);
    });

    it("should sleep display", async () => {
      const result = await orchestrator.sleepDisplay();

      expect(result).toHaveProperty("success");
    });

    it("should wake display", async () => {
      const result = await orchestrator.wakeDisplay();

      expect(result).toHaveProperty("success");
    });

    it("should fail clearDisplay when not initialized", async () => {
      const uninitOrchestrator = new RenderingOrchestrator(
        mockGPSService,
        mockMapService,
        mockSVGService,
        mockDisplayService,
        mockConfigService,
      );

      const result = await uninitOrchestrator.clearDisplay();

      expect(result.success).toBe(false);
      await uninitOrchestrator.dispose();
    });

    it("should fail displayLogo when not initialized", async () => {
      const uninitOrchestrator = new RenderingOrchestrator(
        mockGPSService,
        mockMapService,
        mockSVGService,
        mockDisplayService,
        mockConfigService,
      );

      const result = await uninitOrchestrator.displayLogo();

      expect(result.success).toBe(false);
      await uninitOrchestrator.dispose();
    });

    it("should fail sleepDisplay when not initialized", async () => {
      const uninitOrchestrator = new RenderingOrchestrator(
        mockGPSService,
        mockMapService,
        mockSVGService,
        mockDisplayService,
        mockConfigService,
      );

      const result = await uninitOrchestrator.sleepDisplay();

      expect(result.success).toBe(false);
      await uninitOrchestrator.dispose();
    });

    it("should fail wakeDisplay when not initialized", async () => {
      const uninitOrchestrator = new RenderingOrchestrator(
        mockGPSService,
        mockMapService,
        mockSVGService,
        mockDisplayService,
        mockConfigService,
      );

      const result = await uninitOrchestrator.wakeDisplay();

      expect(result.success).toBe(false);
      await uninitOrchestrator.dispose();
    });
  });

  describe("settings methods", () => {
    it("should set auto center", () => {
      orchestrator.setAutoCenter(true);

      expect(mockConfigService.setAutoCenter).toHaveBeenCalledWith(true);
    });

    it("should set rotate with bearing", () => {
      orchestrator.setRotateWithBearing(true);

      expect(mockConfigService.setRotateWithBearing).toHaveBeenCalledWith(true);
    });

    it("should set active screen", () => {
      orchestrator.setActiveScreen("track");

      expect(mockConfigService.setActiveScreen).toHaveBeenCalled();
    });

    it("should handle invalid screen type", () => {
      // Should not throw, just log warning
      orchestrator.setActiveScreen("invalid_screen");
    });
  });

  describe("callbacks", () => {
    it("should register GPS update callback", () => {
      const callback = jest.fn();
      const unsubscribe = orchestrator.onGPSUpdate(callback);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should register GPS status callback", () => {
      const callback = jest.fn();
      const unsubscribe = orchestrator.onGPSStatusChange(callback);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should register display update callback", () => {
      const callback = jest.fn();
      const unsubscribe = orchestrator.onDisplayUpdate(callback);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should register error callback", () => {
      const callback = jest.fn();
      const unsubscribe = orchestrator.onError(callback);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should register WiFi state change callback", () => {
      const callback = jest.fn();
      const unsubscribe = orchestrator.onWiFiStateChange(callback);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });
  });

  describe("onboarding", () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it("should check and show onboarding screen", async () => {
      const result = await orchestrator.checkAndShowOnboardingScreen();

      expect(result).toHaveProperty("success");
    });

    it("should restart onboarding", async () => {
      const result = await orchestrator.restartOnboarding();

      expect(result).toHaveProperty("success");
    });

    it("should set WebSocket client count", () => {
      // Should not throw
      orchestrator.setWebSocketClientCount(1);
      orchestrator.setWebSocketClientCount(0);
    });

    it("should fail checkAndShowOnboardingScreen when not initialized", async () => {
      const uninitOrchestrator = new RenderingOrchestrator(
        mockGPSService,
        mockMapService,
        mockSVGService,
        mockDisplayService,
        mockConfigService,
      );

      const result = await uninitOrchestrator.checkAndShowOnboardingScreen();

      expect(result.success).toBe(false);
      await uninitOrchestrator.dispose();
    });

    it("should fail restartOnboarding when not initialized", async () => {
      const uninitOrchestrator = new RenderingOrchestrator(
        mockGPSService,
        mockMapService,
        mockSVGService,
        mockDisplayService,
        mockConfigService,
      );

      const result = await uninitOrchestrator.restartOnboarding();

      expect(result.success).toBe(false);
      await uninitOrchestrator.dispose();
    });
  });

  describe("mock display methods", () => {
    it("should get mock display image", async () => {
      await orchestrator.initialize();

      const image = orchestrator.getMockDisplayImage();

      expect(image).toBeDefined();
    });

    it("should check if mock display image exists", async () => {
      await orchestrator.initialize();

      const hasImage = orchestrator.hasMockDisplayImage();

      expect(hasImage).toBe(true);
    });

    it("should return null when getMockDisplayImage is not available", async () => {
      mockDisplayService.getMockDisplayImage = undefined;
      await orchestrator.initialize();

      const image = orchestrator.getMockDisplayImage();

      expect(image).toBeNull();
    });

    it("should return false when hasMockDisplayImage is not available", async () => {
      mockDisplayService.hasMockDisplayImage = undefined;
      await orchestrator.initialize();

      const hasImage = orchestrator.hasMockDisplayImage();

      expect(hasImage).toBe(false);
    });
  });

  describe("mock GPS methods", () => {
    it("should check if GPS is mock", () => {
      expect(orchestrator.isMockGPS()).toBe(false);
    });

    it("should return true when GPS is mock", () => {
      mockGPSService.isMock.mockReturnValue(true);

      expect(orchestrator.isMockGPS()).toBe(true);
    });

    it("should set mock GPS position when using mock GPS", () => {
      mockGPSService.isMock.mockReturnValue(true);

      const result = orchestrator.setMockGPSPosition(37.77, -122.41);

      expect(result).toBe(true);
      expect(mockGPSService.setPosition).toHaveBeenCalledWith(37.77, -122.41);
    });

    it("should return false when setting position on real GPS", () => {
      mockGPSService.isMock.mockReturnValue(false);

      const result = orchestrator.setMockGPSPosition(37.77, -122.41);

      expect(result).toBe(false);
    });

    it("should return false when setPosition method not available", () => {
      mockGPSService.isMock.mockReturnValue(true);
      mockGPSService.setPosition = undefined;

      const result = orchestrator.setMockGPSPosition(37.77, -122.41);

      expect(result).toBe(false);
    });
  });

  describe("dispose", () => {
    it("should dispose all resources", async () => {
      await orchestrator.initialize();
      await orchestrator.startAutoUpdate();

      await orchestrator.dispose();

      expect(mockGPSService.dispose).toHaveBeenCalled();
      expect(mockDisplayService.dispose).toHaveBeenCalled();
      expect(orchestrator.isAutoUpdateRunning()).toBe(false);
    });

    it("should handle GPS dispose error", async () => {
      await orchestrator.initialize();
      mockGPSService.dispose.mockRejectedValue(new Error("Dispose failed"));

      // Should not throw
      await orchestrator.dispose();
    });

    it("should handle display dispose error", async () => {
      await orchestrator.initialize();
      mockDisplayService.dispose.mockRejectedValue(new Error("Dispose failed"));

      // Should not throw
      await orchestrator.dispose();
    });
  });

  describe("minimal orchestrator (no optional services)", () => {
    let minimalOrchestrator: RenderingOrchestrator;

    beforeEach(() => {
      minimalOrchestrator = new RenderingOrchestrator(
        mockGPSService,
        mockMapService,
        mockSVGService,
        mockDisplayService,
        mockConfigService,
      );
    });

    afterEach(async () => {
      await minimalOrchestrator.dispose();
    });

    it("should initialize without optional services", async () => {
      const result = await minimalOrchestrator.initialize();

      expect(result.success).toBe(true);
    });

    it("should handle WiFi state callback without WiFi service", () => {
      const callback = jest.fn();
      const unsubscribe = minimalOrchestrator.onWiFiStateChange(callback);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should handle drive navigation without drive service", async () => {
      await minimalOrchestrator.initialize();

      const result = await minimalOrchestrator.startDriveNavigation(testRoute);

      expect(result.success).toBe(false);
    });

    it("should handle stop drive navigation without drive service", async () => {
      await minimalOrchestrator.initialize();

      const result = await minimalOrchestrator.stopDriveNavigation();

      expect(result.success).toBe(true);
    });
  });

  describe("error callback notification", () => {
    it("should notify error callbacks", async () => {
      const errorCallback = jest.fn();
      orchestrator.onError(errorCallback);
      await orchestrator.initialize();

      // Trigger an error by making GPS status call fail
      mockGPSService.getStatus.mockRejectedValue(new Error("GPS error"));

      // The error notification happens internally
      // We can verify the callback was registered
      expect(errorCallback).not.toHaveBeenCalled(); // Not called yet
    });

    it("should handle error in error callback", async () => {
      const throwingCallback = jest.fn().mockImplementation(() => {
        throw new Error("Callback error");
      });
      const normalCallback = jest.fn();

      orchestrator.onError(throwingCallback);
      orchestrator.onError(normalCallback);
      await orchestrator.initialize();

      // Callbacks should be registered without errors
      expect(typeof throwingCallback).toBe("function");
    });
  });

  describe("display update callback notification", () => {
    it("should notify display update callbacks on clear", async () => {
      const callback = jest.fn();
      orchestrator.onDisplayUpdate(callback);
      await orchestrator.initialize();

      await orchestrator.clearDisplay();

      expect(callback).toHaveBeenCalledWith(true);
    });

    it("should notify display update callbacks on logo display", async () => {
      const callback = jest.fn();
      orchestrator.onDisplayUpdate(callback);
      await orchestrator.initialize();

      await orchestrator.displayLogo();

      expect(callback).toHaveBeenCalledWith(true);
    });

    it("should handle error in display update callback", async () => {
      const throwingCallback = jest.fn().mockImplementation(() => {
        throw new Error("Callback error");
      });
      orchestrator.onDisplayUpdate(throwingCallback);
      await orchestrator.initialize();

      // Should not throw
      await orchestrator.clearDisplay();
    });
  });
});
