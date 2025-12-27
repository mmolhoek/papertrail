/* eslint-disable @typescript-eslint/no-explicit-any */
import { RenderingOrchestrator } from "@services/orchestrator/RenderingOrchestrator";
import {
  success,
  GPSCoordinate,
  GPSStatus,
  GPXTrack,
  Bitmap1Bit,
  DriveRoute,
  DriveWaypoint,
  DriveNavigationUpdate,
  ManeuverType,
  NavigationState,
  DriveDisplayMode,
} from "@core/types";

/**
 * Integration tests for Drive Navigation flow
 *
 * Tests the flow of drive navigation through the orchestrator:
 * 1. Start drive navigation with a route
 * 2. DriveCoordinator subscribes to navigation updates
 * 3. GPS positions update navigation state
 * 4. Display updates show turn-by-turn or map views
 * 5. Navigation callbacks are notified
 * 6. Stop navigation when complete
 */
describe("Drive Navigation Flow Integration", () => {
  let orchestrator: RenderingOrchestrator;
  let mockGPSService: any;
  let mockMapService: any;
  let mockSVGService: any;
  let mockEpaperService: any;
  let mockConfigService: any;
  let mockDriveNavigationService: any;

  // Capture callbacks
  let gpsPositionCallbacks: Array<(position: GPSCoordinate) => void>;
  let navigationUpdateCallbacks: Array<(update: DriveNavigationUpdate) => void>;
  let displayUpdateCallbacks: Array<() => void>;

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
  };

  const testGPSStatus: GPSStatus = {
    fixQuality: 1,
    satellitesInUse: 8,
    hdop: 1.2,
    vdop: 1.5,
    pdop: 1.8,
    isTracking: true,
  };

  const testWaypoint: DriveWaypoint = {
    latitude: 37.78,
    longitude: -122.42,
    instruction: "Turn right onto Main St",
    maneuverType: ManeuverType.RIGHT,
    distance: 500,
    index: 0,
  };

  const testRoute: DriveRoute = {
    id: "test-route-1",
    destination: "Test Destination",
    createdAt: new Date(),
    startPoint: { latitude: 37.7749, longitude: -122.4194 },
    endPoint: { latitude: 37.785, longitude: -122.4094 },
    waypoints: [testWaypoint],
    geometry: [
      [37.7749, -122.4194],
      [37.78, -122.42],
      [37.785, -122.41],
    ],
    totalDistance: 1000,
    estimatedTime: 120,
  };

  const testNavigationStatus = {
    state: NavigationState.NAVIGATING,
    displayMode: DriveDisplayMode.MAP_WITH_OVERLAY,
    distanceRemaining: 800,
    distanceToNextTurn: 200,
    progress: 20,
    currentWaypointIndex: 0,
    timeRemaining: 60,
    nextTurn: testWaypoint,
    route: testRoute,
  };

  beforeEach(() => {
    gpsPositionCallbacks = [];
    navigationUpdateCallbacks = [];
    displayUpdateCallbacks = [];

    // Create mock GPS service
    mockGPSService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      dispose: jest.fn().mockResolvedValue(undefined),
      getCurrentPosition: jest.fn().mockResolvedValue(success(testPosition)),
      startTracking: jest.fn().mockResolvedValue(success(undefined)),
      stopTracking: jest.fn(),
      isTracking: jest.fn().mockReturnValue(true),
      getStatus: jest.fn().mockResolvedValue(success(testGPSStatus)),
      onPositionUpdate: jest.fn((callback) => {
        gpsPositionCallbacks.push(callback);
        return () => {
          const index = gpsPositionCallbacks.indexOf(callback);
          if (index > -1) gpsPositionCallbacks.splice(index, 1);
        };
      }),
      onStatusChange: jest.fn().mockReturnValue(() => {}),
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
        .mockResolvedValue(success(["track1.gpx"])),
      calculateBounds: jest.fn().mockReturnValue({
        minLat: 37,
        maxLat: 38,
        minLon: -123,
        maxLon: -122,
      }),
      calculateDistance: jest.fn().mockReturnValue(5000),
    };

    mockSVGService = {
      renderViewport: jest.fn().mockResolvedValue(success(testBitmap)),
      renderDriveMapScreen: jest.fn().mockResolvedValue(success(testBitmap)),
      renderTurnScreen: jest.fn().mockResolvedValue(success(testBitmap)),
      renderOffRoadScreen: jest.fn().mockResolvedValue(success(testBitmap)),
      renderArrivalScreen: jest.fn().mockResolvedValue(success(testBitmap)),
      createBlankBitmap: jest.fn().mockReturnValue(testBitmap),
    };

    mockEpaperService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      dispose: jest.fn().mockResolvedValue(undefined),
      display: jest.fn().mockResolvedValue(success(undefined)),
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
          model: "7.5inch",
          width: 800,
          height: 480,
        }),
      ),
    };

    mockConfigService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      dispose: jest.fn().mockResolvedValue(undefined),
      getActiveGPXPath: jest.fn().mockReturnValue("test-track.gpx"),
      setActiveGPXPath: jest.fn(),
      isOnboardingCompleted: jest.fn().mockReturnValue(true),
      setOnboardingCompleted: jest.fn(),
      getZoomLevel: jest.fn().mockReturnValue(15),
      setZoomLevel: jest.fn(),
      getDisplayWidth: jest.fn().mockReturnValue(800),
      getDisplayHeight: jest.fn().mockReturnValue(480),
      getAutoCenter: jest.fn().mockReturnValue(true),
      getRotateWithBearing: jest.fn().mockReturnValue(false),
      getActiveScreen: jest.fn().mockReturnValue("track"),
      setActiveScreen: jest.fn(),
      getAutoRefreshInterval: jest.fn().mockReturnValue(30),
      getRenderOptions: jest.fn().mockReturnValue({ showLine: true }),
      save: jest.fn().mockResolvedValue(success(undefined)),
      getConfig: jest.fn().mockReturnValue({ web: { port: 3000 } }),
      getShowSpeedLimit: jest.fn().mockReturnValue(true),
      getSpeedUnit: jest.fn().mockReturnValue("kmh"),
      getShowLocationName: jest.fn().mockReturnValue(true),
      getShowElevation: jest.fn().mockReturnValue(true),
      getShowRoads: jest.fn().mockReturnValue(true),
      getShowWater: jest.fn().mockReturnValue(true),
      getShowWaterways: jest.fn().mockReturnValue(true),
      getShowLanduse: jest.fn().mockReturnValue(true),
      getEnabledPOICategories: jest
        .fn()
        .mockReturnValue(["fuel", "parking", "food", "restroom", "viewpoint"]),
      setEnabledPOICategories: jest.fn(),
      isPOICategoryEnabled: jest.fn().mockReturnValue(true),
      setPOICategoryEnabled: jest.fn(),
      getRoutingProfile: jest.fn().mockReturnValue("car"),
      getShowRoadSurface: jest.fn().mockReturnValue(false),
    };

    // Create mock drive navigation service
    mockDriveNavigationService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      dispose: jest.fn().mockResolvedValue(undefined),
      isNavigating: jest.fn().mockReturnValue(false),
      getActiveRoute: jest.fn().mockReturnValue(null),
      getNavigationStatus: jest.fn().mockReturnValue(testNavigationStatus),
      startNavigation: jest.fn().mockImplementation((route) => {
        mockDriveNavigationService.isNavigating.mockReturnValue(true);
        mockDriveNavigationService.getActiveRoute.mockReturnValue(route);
        return Promise.resolve(success(undefined));
      }),
      stopNavigation: jest.fn().mockImplementation(() => {
        mockDriveNavigationService.isNavigating.mockReturnValue(false);
        mockDriveNavigationService.getActiveRoute.mockReturnValue(null);
        return Promise.resolve(success(undefined));
      }),
      updatePosition: jest.fn(),
      onNavigationUpdate: jest.fn((callback) => {
        navigationUpdateCallbacks.push(callback);
        return () => {
          const index = navigationUpdateCallbacks.indexOf(callback);
          if (index > -1) navigationUpdateCallbacks.splice(index, 1);
        };
      }),
      onDisplayUpdate: jest.fn((callback) => {
        displayUpdateCallbacks.push(callback);
        return () => {
          const index = displayUpdateCallbacks.indexOf(callback);
          if (index > -1) displayUpdateCallbacks.splice(index, 1);
        };
      }),
    };

    orchestrator = new RenderingOrchestrator(
      mockGPSService,
      mockMapService,
      mockSVGService,
      mockEpaperService,
      mockConfigService,
      undefined, // WiFi service
      undefined, // Text renderer service
      undefined, // Simulation service
      mockDriveNavigationService,
      undefined, // Speed limit service
      undefined, // POI service
      undefined, // Reverse geocoding service
    );
  });

  afterEach(async () => {
    await orchestrator.dispose();
  });

  describe("Drive Navigation Start/Stop", () => {
    it("should start drive navigation with a route", async () => {
      await orchestrator.initialize();

      const result = await orchestrator.startDriveNavigation(testRoute);

      expect(result.success).toBe(true);
      expect(mockDriveNavigationService.startNavigation).toHaveBeenCalledWith(
        testRoute,
      );
    });

    it("should report navigation active after starting", async () => {
      await orchestrator.initialize();

      expect(orchestrator.isDriveNavigating()).toBe(false);

      await orchestrator.startDriveNavigation(testRoute);

      expect(orchestrator.isDriveNavigating()).toBe(true);
    });

    it("should stop drive navigation", async () => {
      await orchestrator.initialize();
      await orchestrator.startDriveNavigation(testRoute);

      const result = await orchestrator.stopDriveNavigation();

      expect(result.success).toBe(true);
      expect(mockDriveNavigationService.stopNavigation).toHaveBeenCalled();
    });

    it("should report navigation inactive after stopping", async () => {
      await orchestrator.initialize();
      await orchestrator.startDriveNavigation(testRoute);
      expect(orchestrator.isDriveNavigating()).toBe(true);

      await orchestrator.stopDriveNavigation();

      expect(orchestrator.isDriveNavigating()).toBe(false);
    });

    it("should report navigation not active before starting", async () => {
      await orchestrator.initialize();

      // Should report not navigating before start
      expect(orchestrator.isDriveNavigating()).toBe(false);
    });
  });

  describe("Navigation Update Callbacks", () => {
    it("should allow registering navigation update callbacks", async () => {
      await orchestrator.initialize();

      const callback = jest.fn();
      const unsubscribe = orchestrator.onDriveNavigationUpdate(callback);

      expect(typeof unsubscribe).toBe("function");
    });

    it("should forward navigation updates to registered callbacks", async () => {
      await orchestrator.initialize();
      await orchestrator.startDriveNavigation(testRoute);

      const callback = jest.fn();
      orchestrator.onDriveNavigationUpdate(callback);

      // Simulate navigation update
      const update: DriveNavigationUpdate = {
        type: "status",
        status: testNavigationStatus,
        timestamp: new Date(),
      };
      navigationUpdateCallbacks.forEach((cb) => cb(update));

      expect(callback).toHaveBeenCalledWith(update);
    });

    it("should allow unsubscribing from navigation updates", async () => {
      await orchestrator.initialize();
      await orchestrator.startDriveNavigation(testRoute);

      const callback = jest.fn();
      const unsubscribe = orchestrator.onDriveNavigationUpdate(callback);

      // First update should be received
      const update: DriveNavigationUpdate = {
        type: "status",
        status: testNavigationStatus,
        timestamp: new Date(),
      };
      navigationUpdateCallbacks.forEach((cb) => cb(update));
      expect(callback).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Second update should not be received
      navigationUpdateCallbacks.forEach((cb) => cb(update));
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("GPS Position During Navigation", () => {
    it("should forward GPS positions to navigation service during navigation", async () => {
      await orchestrator.initialize();
      await orchestrator.startDriveNavigation(testRoute);

      // Simulate GPS position update
      const newPosition: GPSCoordinate = {
        latitude: 37.78,
        longitude: -122.42,
        timestamp: new Date(),
      };
      gpsPositionCallbacks.forEach((cb) => cb(newPosition));

      // Navigation service should receive position
      expect(mockDriveNavigationService.updatePosition).toHaveBeenCalledWith(
        newPosition,
      );
    });

    it("should skip invalid (0,0) GPS positions during navigation", async () => {
      await orchestrator.initialize();
      await orchestrator.startDriveNavigation(testRoute);

      // Simulate invalid GPS position update
      const invalidPosition: GPSCoordinate = {
        latitude: 0,
        longitude: 0,
        timestamp: new Date(),
      };
      gpsPositionCallbacks.forEach((cb) => cb(invalidPosition));

      // Navigation service should NOT receive invalid position
      expect(mockDriveNavigationService.updatePosition).not.toHaveBeenCalled();
    });
  });

  describe("Display Updates During Navigation", () => {
    it("should render turn screen when in TURN_SCREEN mode", async () => {
      await orchestrator.initialize();
      await orchestrator.startDriveNavigation(testRoute);

      // Configure for turn screen mode
      mockDriveNavigationService.getNavigationStatus.mockReturnValue({
        ...testNavigationStatus,
        displayMode: DriveDisplayMode.TURN_SCREEN,
      });

      // Trigger display update
      displayUpdateCallbacks.forEach((cb) => cb());

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockSVGService.renderTurnScreen).toHaveBeenCalled();
    });

    it("should render map screen when in MAP_WITH_OVERLAY mode", async () => {
      await orchestrator.initialize();
      await orchestrator.startDriveNavigation(testRoute);

      // Ensure a valid GPS position exists
      gpsPositionCallbacks.forEach((cb) => cb(testPosition));

      // Configure for map mode
      mockDriveNavigationService.getNavigationStatus.mockReturnValue({
        ...testNavigationStatus,
        displayMode: DriveDisplayMode.MAP_WITH_OVERLAY,
      });

      // Trigger display update
      displayUpdateCallbacks.forEach((cb) => cb());

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockSVGService.renderDriveMapScreen).toHaveBeenCalled();
    });

    it("should render arrival screen when arrived", async () => {
      await orchestrator.initialize();
      await orchestrator.startDriveNavigation(testRoute);

      // Configure for arrived mode
      mockDriveNavigationService.getNavigationStatus.mockReturnValue({
        ...testNavigationStatus,
        state: NavigationState.ARRIVED,
        displayMode: DriveDisplayMode.ARRIVED,
      });

      // Trigger display update
      displayUpdateCallbacks.forEach((cb) => cb());

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockSVGService.renderArrivalScreen).toHaveBeenCalled();
    });
  });

  describe("Navigation Without Service", () => {
    it("should fail gracefully when drive navigation service not available", async () => {
      // Create orchestrator without drive navigation service
      const orchestratorNoNav = new RenderingOrchestrator(
        mockGPSService,
        mockMapService,
        mockSVGService,
        mockEpaperService,
        mockConfigService,
      );

      await orchestratorNoNav.initialize();

      const result = await orchestratorNoNav.startDriveNavigation(testRoute);

      expect(result.success).toBe(false);

      await orchestratorNoNav.dispose();
    });

    it("should return empty unsubscribe when no navigation service", async () => {
      // Create orchestrator without drive navigation service
      const orchestratorNoNav = new RenderingOrchestrator(
        mockGPSService,
        mockMapService,
        mockSVGService,
        mockEpaperService,
        mockConfigService,
      );

      await orchestratorNoNav.initialize();

      const unsubscribe = orchestratorNoNav.onDriveNavigationUpdate(jest.fn());
      expect(typeof unsubscribe).toBe("function");
      unsubscribe(); // Should not throw

      await orchestratorNoNav.dispose();
    });
  });
});
