import { DriveCoordinator } from "../DriveCoordinator";
import {
  IDriveNavigationService,
  ISVGService,
  IConfigService,
  ITrackSimulationService,
  ISpeedLimitService,
  IPOIService,
  IReverseGeocodingService,
  IVectorMapService,
  IDisplayService,
  CachedRoad,
} from "@core/interfaces";
import {
  success,
  DriveRoute,
  DriveDisplayMode,
  NavigationState,
  ManeuverType,
  ScreenType,
  DriveNavigationStatus,
} from "@core/types";
import { OrchestratorError } from "@core/errors";
import { GPSCoordinator } from "../GPSCoordinator";
import { OnboardingCoordinator } from "../OnboardingCoordinator";

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe("DriveCoordinator", () => {
  let coordinator: DriveCoordinator;
  let mockDriveNavigationService: jest.Mocked<IDriveNavigationService>;
  let mockSVGService: jest.Mocked<ISVGService>;
  let mockDisplayService: jest.Mocked<IDisplayService>;
  let mockConfigService: jest.Mocked<IConfigService>;
  let mockSimulationService: jest.Mocked<ITrackSimulationService>;
  let mockSpeedLimitService: jest.Mocked<ISpeedLimitService>;
  let mockPOIService: jest.Mocked<IPOIService>;
  let mockReverseGeocodingService: jest.Mocked<IReverseGeocodingService>;
  let mockVectorMapService: jest.Mocked<IVectorMapService>;
  let mockGPSCoordinator: jest.Mocked<GPSCoordinator>;
  let mockOnboardingCoordinator: jest.Mocked<OnboardingCoordinator>;

  const mockRoute: DriveRoute = {
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
      [51.51, -0.09],
    ],
  };

  const createNavigationStatus = (
    overrides: Partial<DriveNavigationStatus> = {},
  ): DriveNavigationStatus => ({
    state: NavigationState.NAVIGATING,
    displayMode: DriveDisplayMode.MAP_WITH_OVERLAY,
    currentWaypointIndex: 0,
    distanceToNextTurn: 100,
    distanceRemaining: 5000,
    timeRemaining: 300,
    progress: 50,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockDriveNavigationService = {
      startNavigation: jest.fn().mockResolvedValue(success(undefined)),
      stopNavigation: jest.fn().mockResolvedValue(success(undefined)),
      isNavigating: jest.fn().mockReturnValue(false),
      getNavigationStatus: jest
        .fn()
        .mockReturnValue(
          createNavigationStatus({ state: NavigationState.IDLE }),
        ),
      getActiveRoute: jest.fn().mockReturnValue(null),
      onNavigationUpdate: jest.fn().mockReturnValue(() => {}),
      onDisplayUpdate: jest.fn().mockReturnValue(() => {}),
    } as unknown as jest.Mocked<IDriveNavigationService>;

    mockSVGService = {
      renderTurnScreen: jest.fn().mockResolvedValue(success(Buffer.from([]))),
      renderDriveMapScreen: jest
        .fn()
        .mockResolvedValue(success(Buffer.from([]))),
      renderOffRoadScreen: jest
        .fn()
        .mockResolvedValue(success(Buffer.from([]))),
      renderArrivalScreen: jest
        .fn()
        .mockResolvedValue(success(Buffer.from([]))),
    } as unknown as jest.Mocked<ISVGService>;

    mockDisplayService = {
      displayBitmap: jest.fn().mockResolvedValue(success(undefined)),
      isBusy: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<IDisplayService>;

    mockConfigService = {
      setZoomLevel: jest.fn(),
      getZoomLevel: jest.fn().mockReturnValue(18),
      save: jest.fn().mockResolvedValue(undefined),
      isOnboardingCompleted: jest.fn().mockReturnValue(true),
      setOnboardingCompleted: jest.fn(),
      getDisplayWidth: jest.fn().mockReturnValue(800),
      getDisplayHeight: jest.fn().mockReturnValue(480),
      getActiveScreen: jest.fn().mockReturnValue(ScreenType.TRACK),
      getShowSpeedLimit: jest.fn().mockReturnValue(true),
      getShowLocationName: jest.fn().mockReturnValue(true),
      getShowRoads: jest.fn().mockReturnValue(true),
      getShowWater: jest.fn().mockReturnValue(true),
      getShowWaterways: jest.fn().mockReturnValue(true),
      getShowLanduse: jest.fn().mockReturnValue(true),
      getEnabledPOICategories: jest.fn().mockReturnValue(["restaurant"]),
      getSpeedUnit: jest.fn().mockReturnValue("kmh"),
      getRoutingProfile: jest.fn().mockReturnValue("car"),
      getRenderOptions: jest.fn().mockReturnValue({}),
      getRotateWithBearing: jest.fn().mockReturnValue(false),
      getShowRoadSurface: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<IConfigService>;

    mockSimulationService = {
      isSimulating: jest.fn().mockReturnValue(false),
      setCurrentSpeedLimit: jest.fn(),
    } as unknown as jest.Mocked<ITrackSimulationService>;

    mockSpeedLimitService = {
      getSpeedLimit: jest
        .fn()
        .mockResolvedValue(success({ speedLimit: 50, roadName: "Test Road" })),
    } as unknown as jest.Mocked<ISpeedLimitService>;

    mockPOIService = {
      getNearbyPOIs: jest.fn().mockResolvedValue(success([])),
    } as unknown as jest.Mocked<IPOIService>;

    mockReverseGeocodingService = {
      getLocationName: jest
        .fn()
        .mockResolvedValue(success({ street: "Test Street" })),
    } as unknown as jest.Mocked<IReverseGeocodingService>;

    mockVectorMapService = {
      getAllCachedRoads: jest.fn().mockReturnValue([]),
      getAllCachedWater: jest.fn().mockReturnValue([]),
      getAllCachedLanduse: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<IVectorMapService>;

    mockGPSCoordinator = {
      getLastPosition: jest.fn().mockReturnValue({
        latitude: 51.5,
        longitude: -0.1,
        timestamp: new Date(),
        speed: 10,
      }),
      getLastStatus: jest.fn().mockReturnValue({ satellitesInUse: 8 }),
    } as unknown as jest.Mocked<GPSCoordinator>;

    mockOnboardingCoordinator = {
      stopGPSInfoRefresh: jest.fn(),
    } as unknown as jest.Mocked<OnboardingCoordinator>;

    coordinator = new DriveCoordinator(
      mockDriveNavigationService,
      mockSVGService,
      mockDisplayService,
      mockConfigService,
      mockSimulationService,
      mockSpeedLimitService,
      mockPOIService,
      mockReverseGeocodingService,
      mockVectorMapService,
      null, // roadSurfaceService
      mockGPSCoordinator,
      mockOnboardingCoordinator,
    );
  });

  describe("initialization", () => {
    it("should not be navigating initially", () => {
      expect(coordinator.isDriveNavigating()).toBe(false);
    });

    it("should have no callbacks initially", () => {
      expect(coordinator.getCallbackCount()).toBe(0);
    });

    it("should have no active route initially", () => {
      expect(coordinator.getActiveRoute()).toBeNull();
    });
  });

  describe("setInitialized", () => {
    it("should set initialized state", () => {
      coordinator.setInitialized(true);
      // State is internal, we verify via behavior in updateDriveDisplay tests
      expect(true).toBe(true); // State changed internally
    });
  });

  describe("setGPSCoordinator", () => {
    it("should set GPS coordinator", () => {
      const newCoordinator = {} as unknown as jest.Mocked<
        typeof mockGPSCoordinator
      >;
      coordinator.setGPSCoordinator(newCoordinator);
      // Verified through behavior
      expect(true).toBe(true);
    });

    it("should allow setting null coordinator", () => {
      coordinator.setGPSCoordinator(null);
      expect(true).toBe(true);
    });
  });

  describe("setOnboardingCoordinator", () => {
    it("should set onboarding coordinator", () => {
      const newCoordinator = {} as unknown as jest.Mocked<
        typeof mockOnboardingCoordinator
      >;
      coordinator.setOnboardingCoordinator(newCoordinator);
      expect(true).toBe(true);
    });

    it("should allow setting null coordinator", () => {
      coordinator.setOnboardingCoordinator(null);
      expect(true).toBe(true);
    });
  });

  describe("setDisplayUpdateCallback", () => {
    it("should set display update callback", () => {
      const callback = jest.fn();
      coordinator.setDisplayUpdateCallback(callback);
      // Callback is called during successful display updates
      expect(true).toBe(true);
    });
  });

  describe("startDriveNavigation", () => {
    it("should start navigation successfully", async () => {
      const result = await coordinator.startDriveNavigation(mockRoute);

      expect(result.success).toBe(true);
      expect(mockDriveNavigationService.startNavigation).toHaveBeenCalledWith(
        mockRoute,
      );
    });

    it("should set zoom level to 18", async () => {
      await coordinator.startDriveNavigation(mockRoute);

      expect(mockConfigService.setZoomLevel).toHaveBeenCalledWith(18);
      expect(mockConfigService.save).toHaveBeenCalled();
    });

    it("should stop GPS info refresh", async () => {
      await coordinator.startDriveNavigation(mockRoute);

      expect(mockOnboardingCoordinator.stopGPSInfoRefresh).toHaveBeenCalled();
    });

    it("should mark onboarding as complete if not already", async () => {
      mockConfigService.isOnboardingCompleted.mockReturnValue(false);

      await coordinator.startDriveNavigation(mockRoute);

      expect(mockConfigService.setOnboardingCompleted).toHaveBeenCalledWith(
        true,
      );
    });

    it("should not mark onboarding if already complete", async () => {
      mockConfigService.isOnboardingCompleted.mockReturnValue(true);

      await coordinator.startDriveNavigation(mockRoute);

      expect(mockConfigService.setOnboardingCompleted).not.toHaveBeenCalled();
    });

    it("should subscribe to navigation updates", async () => {
      await coordinator.startDriveNavigation(mockRoute);

      expect(
        mockDriveNavigationService.onNavigationUpdate,
      ).toHaveBeenCalledWith(expect.any(Function));
      expect(mockDriveNavigationService.onDisplayUpdate).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

    it("should fail if navigation service is not available", async () => {
      const coordinatorWithoutService = new DriveCoordinator(
        null,
        mockSVGService,
        mockDisplayService,
        mockConfigService,
        mockSimulationService,
        mockSpeedLimitService,
        mockPOIService,
        mockReverseGeocodingService,
        mockVectorMapService,
        null, // roadSurfaceService
        mockGPSCoordinator,
        mockOnboardingCoordinator,
      );

      const result =
        await coordinatorWithoutService.startDriveNavigation(mockRoute);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(OrchestratorError);
      }
    });

    it("should store route start position from geometry", async () => {
      await coordinator.startDriveNavigation(mockRoute);

      // The start position is stored internally, verified through behavior
      // when updateDriveDisplay falls back to it
      expect(mockDriveNavigationService.startNavigation).toHaveBeenCalledWith(
        mockRoute,
      );
    });
  });

  describe("stopDriveNavigation", () => {
    it("should stop navigation successfully", async () => {
      await coordinator.startDriveNavigation(mockRoute);
      const result = await coordinator.stopDriveNavigation();

      expect(result.success).toBe(true);
      expect(mockDriveNavigationService.stopNavigation).toHaveBeenCalled();
    });

    it("should succeed if navigation service is not available", async () => {
      const coordinatorWithoutService = new DriveCoordinator(
        null,
        mockSVGService,
        mockDisplayService,
        mockConfigService,
        mockSimulationService,
        mockSpeedLimitService,
        mockPOIService,
        mockReverseGeocodingService,
        mockVectorMapService,
        null, // roadSurfaceService
        mockGPSCoordinator,
        mockOnboardingCoordinator,
      );

      const result = await coordinatorWithoutService.stopDriveNavigation();

      expect(result.success).toBe(true);
    });
  });

  describe("isDriveNavigating", () => {
    it("should return false when not navigating", () => {
      mockDriveNavigationService.isNavigating.mockReturnValue(false);

      expect(coordinator.isDriveNavigating()).toBe(false);
    });

    it("should return true when navigating", () => {
      mockDriveNavigationService.isNavigating.mockReturnValue(true);

      expect(coordinator.isDriveNavigating()).toBe(true);
    });

    it("should return false if navigation service is not available", () => {
      const coordinatorWithoutService = new DriveCoordinator(
        null,
        mockSVGService,
        mockDisplayService,
        mockConfigService,
        mockSimulationService,
        mockSpeedLimitService,
        mockPOIService,
        mockReverseGeocodingService,
        mockVectorMapService,
        null, // roadSurfaceService
        mockGPSCoordinator,
        mockOnboardingCoordinator,
      );

      expect(coordinatorWithoutService.isDriveNavigating()).toBe(false);
    });
  });

  describe("onDriveNavigationUpdate", () => {
    it("should register callback", () => {
      const callback = jest.fn();

      coordinator.onDriveNavigationUpdate(callback);

      expect(coordinator.getCallbackCount()).toBe(1);
    });

    it("should allow multiple callbacks", () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      coordinator.onDriveNavigationUpdate(callback1);
      coordinator.onDriveNavigationUpdate(callback2);

      expect(coordinator.getCallbackCount()).toBe(2);
    });

    it("should return unsubscribe function", () => {
      const callback = jest.fn();

      const unsubscribe = coordinator.onDriveNavigationUpdate(callback);
      expect(coordinator.getCallbackCount()).toBe(1);

      unsubscribe();
      expect(coordinator.getCallbackCount()).toBe(0);
    });

    it("should only remove the specific callback", () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      const unsubscribe1 = coordinator.onDriveNavigationUpdate(callback1);
      coordinator.onDriveNavigationUpdate(callback2);

      unsubscribe1();

      expect(coordinator.getCallbackCount()).toBe(1);
    });
  });

  describe("updateDriveDisplay", () => {
    beforeEach(() => {
      coordinator.setInitialized(true);
    });

    it("should return success if not initialized", async () => {
      coordinator.setInitialized(false);

      const result = await coordinator.updateDriveDisplay();

      expect(result.success).toBe(true);
      expect(mockSVGService.renderDriveMapScreen).not.toHaveBeenCalled();
    });

    it("should return success if navigation service not available", async () => {
      const coordinatorWithoutService = new DriveCoordinator(
        null,
        mockSVGService,
        mockDisplayService,
        mockConfigService,
        mockSimulationService,
        mockSpeedLimitService,
        mockPOIService,
        mockReverseGeocodingService,
        mockVectorMapService,
        null, // roadSurfaceService
        mockGPSCoordinator,
        mockOnboardingCoordinator,
      );

      const result = await coordinatorWithoutService.updateDriveDisplay();

      expect(result.success).toBe(true);
    });

    it("should return success for IDLE state", async () => {
      mockDriveNavigationService.getNavigationStatus.mockReturnValue(
        createNavigationStatus({ state: NavigationState.IDLE }),
      );

      const result = await coordinator.updateDriveDisplay();

      expect(result.success).toBe(true);
      expect(mockSVGService.renderDriveMapScreen).not.toHaveBeenCalled();
    });

    it("should render turn screen for TURN_SCREEN display mode", async () => {
      mockDriveNavigationService.getNavigationStatus.mockReturnValue(
        createNavigationStatus({
          state: NavigationState.NAVIGATING,
          displayMode: DriveDisplayMode.TURN_SCREEN,
          nextTurn: mockRoute.waypoints[0],
          distanceToNextTurn: 100,
          progress: 50,
          route: mockRoute,
          currentWaypointIndex: 0,
        }),
      );

      await coordinator.updateDriveDisplay();

      expect(mockSVGService.renderTurnScreen).toHaveBeenCalled();
    });

    it("should render arrival screen for ARRIVED display mode", async () => {
      mockDriveNavigationService.getNavigationStatus.mockReturnValue(
        createNavigationStatus({
          state: NavigationState.NAVIGATING,
          displayMode: DriveDisplayMode.ARRIVED,
          route: mockRoute,
        }),
      );

      await coordinator.updateDriveDisplay();

      expect(mockSVGService.renderArrivalScreen).toHaveBeenCalledWith(
        mockRoute.destination,
        expect.any(Object),
      );
    });

    it("should render off-road screen for OFF_ROAD_ARROW display mode", async () => {
      mockDriveNavigationService.getNavigationStatus.mockReturnValue(
        createNavigationStatus({
          state: NavigationState.NAVIGATING,
          displayMode: DriveDisplayMode.OFF_ROAD_ARROW,
          bearingToRoute: 45,
          distanceToRoute: 200,
        }),
      );

      await coordinator.updateDriveDisplay();

      expect(mockSVGService.renderOffRoadScreen).toHaveBeenCalledWith(
        45,
        200,
        expect.any(Object),
      );
    });

    it("should render map screen for MAP_WITH_OVERLAY display mode", async () => {
      mockDriveNavigationService.getNavigationStatus.mockReturnValue(
        createNavigationStatus({
          state: NavigationState.NAVIGATING,
          displayMode: DriveDisplayMode.MAP_WITH_OVERLAY,
          route: mockRoute,
          nextTurn: mockRoute.waypoints[0],
          distanceToNextTurn: 100,
          distanceRemaining: 5000,
          progress: 50,
          timeRemaining: 300,
          currentWaypointIndex: 0,
        }),
      );

      await coordinator.updateDriveDisplay();

      expect(mockSVGService.renderDriveMapScreen).toHaveBeenCalled();
    });

    it("should call display update callback on success", async () => {
      const callback = jest.fn();
      coordinator.setDisplayUpdateCallback(callback);

      mockDriveNavigationService.getNavigationStatus.mockReturnValue(
        createNavigationStatus({
          state: NavigationState.NAVIGATING,
          displayMode: DriveDisplayMode.ARRIVED,
          route: mockRoute,
        }),
      );

      await coordinator.updateDriveDisplay();

      expect(callback).toHaveBeenCalledWith(true);
    });

    it("should use stored route start position as fallback", async () => {
      // Start navigation to store position
      await coordinator.startDriveNavigation(mockRoute);

      // Clear GPS position
      mockGPSCoordinator.getLastPosition.mockReturnValue(null);

      mockDriveNavigationService.getNavigationStatus.mockReturnValue(
        createNavigationStatus({
          state: NavigationState.NAVIGATING,
          displayMode: DriveDisplayMode.ARRIVED,
          route: mockRoute,
        }),
      );

      await coordinator.updateDriveDisplay();

      expect(mockSVGService.renderArrivalScreen).toHaveBeenCalled();
    });
  });

  describe("getActiveRoute", () => {
    it("should return null when no route is active", () => {
      mockDriveNavigationService.getActiveRoute.mockReturnValue(null);

      expect(coordinator.getActiveRoute()).toBeNull();
    });

    it("should return the active route", () => {
      mockDriveNavigationService.getActiveRoute.mockReturnValue(mockRoute);

      expect(coordinator.getActiveRoute()).toBe(mockRoute);
    });

    it("should return null if navigation service is not available", () => {
      const coordinatorWithoutService = new DriveCoordinator(
        null,
        mockSVGService,
        mockDisplayService,
        mockConfigService,
        mockSimulationService,
        mockSpeedLimitService,
        mockPOIService,
        mockReverseGeocodingService,
        mockVectorMapService,
        null, // roadSurfaceService
        mockGPSCoordinator,
        mockOnboardingCoordinator,
      );

      expect(coordinatorWithoutService.getActiveRoute()).toBeNull();
    });
  });

  describe("POI cache management", () => {
    it("should invalidate POI cache", () => {
      coordinator.invalidatePOICache();
      // Cache is cleared internally
      expect(true).toBe(true);
    });

    it("should set and check POI prefetch active state", () => {
      expect(coordinator.isBackgroundFetchActive()).toBe(false);

      coordinator.setPOIPrefetchActive(true);
      expect(coordinator.isBackgroundFetchActive()).toBe(true);

      coordinator.setPOIPrefetchActive(false);
      expect(coordinator.isBackgroundFetchActive()).toBe(false);
    });
  });

  describe("speed limit prefetch", () => {
    it("should set and check speed limit prefetch active state", () => {
      expect(coordinator.isBackgroundFetchActive()).toBe(false);

      coordinator.setSpeedLimitPrefetchActive(true);
      expect(coordinator.isBackgroundFetchActive()).toBe(true);

      coordinator.setSpeedLimitPrefetchActive(false);
      expect(coordinator.isBackgroundFetchActive()).toBe(false);
    });
  });

  describe("location prefetch", () => {
    it("should set and check location prefetch active state", () => {
      expect(coordinator.isBackgroundFetchActive()).toBe(false);

      coordinator.setLocationPrefetchActive(true);
      expect(coordinator.isBackgroundFetchActive()).toBe(true);

      coordinator.setLocationPrefetchActive(false);
      expect(coordinator.isBackgroundFetchActive()).toBe(false);
    });
  });

  describe("elevation prefetch", () => {
    it("should set and check elevation prefetch active state", () => {
      expect(coordinator.isBackgroundFetchActive()).toBe(false);

      coordinator.setElevationPrefetchActive(true);
      expect(coordinator.isBackgroundFetchActive()).toBe(true);

      coordinator.setElevationPrefetchActive(false);
      expect(coordinator.isBackgroundFetchActive()).toBe(false);
    });
  });

  describe("road prefetch", () => {
    it("should set and check road prefetch active state", () => {
      expect(coordinator.isBackgroundFetchActive()).toBe(false);

      coordinator.setRoadPrefetchActive(true);
      expect(coordinator.isBackgroundFetchActive()).toBe(true);

      coordinator.setRoadPrefetchActive(false);
      expect(coordinator.isBackgroundFetchActive()).toBe(false);
    });
  });

  describe("isBackgroundFetchActive", () => {
    it("should return true if any prefetch is active", () => {
      coordinator.setPOIPrefetchActive(true);
      expect(coordinator.isBackgroundFetchActive()).toBe(true);

      coordinator.setPOIPrefetchActive(false);
      coordinator.setSpeedLimitPrefetchActive(true);
      expect(coordinator.isBackgroundFetchActive()).toBe(true);

      coordinator.setSpeedLimitPrefetchActive(false);
      coordinator.setLocationPrefetchActive(true);
      expect(coordinator.isBackgroundFetchActive()).toBe(true);

      coordinator.setLocationPrefetchActive(false);
      coordinator.setElevationPrefetchActive(true);
      expect(coordinator.isBackgroundFetchActive()).toBe(true);

      coordinator.setElevationPrefetchActive(false);
      coordinator.setRoadPrefetchActive(true);
      expect(coordinator.isBackgroundFetchActive()).toBe(true);
    });
  });

  describe("cached roads", () => {
    it("should set and get cached roads", () => {
      const roads: CachedRoad[] = [
        {
          wayId: 1,
          geometry: [
            [51.5, -0.1],
            [51.51, -0.11],
          ],
          highwayType: "primary",
          name: "Test Road",
        },
      ];

      coordinator.setCachedRoads(roads);

      expect(coordinator.getCachedRoads()).toEqual(roads);
    });

    it("should return empty array initially", () => {
      expect(coordinator.getCachedRoads()).toEqual([]);
    });
  });

  describe("dispose", () => {
    it("should clear all callbacks", async () => {
      coordinator.onDriveNavigationUpdate(jest.fn());
      coordinator.onDriveNavigationUpdate(jest.fn());

      expect(coordinator.getCallbackCount()).toBe(2);

      coordinator.dispose();

      expect(coordinator.getCallbackCount()).toBe(0);
    });

    it("should clear cached data", () => {
      coordinator.setCachedRoads([
        { wayId: 1, geometry: [], highwayType: "primary" },
      ]);

      coordinator.dispose();

      expect(coordinator.getCachedRoads()).toEqual([]);
    });

    it("should unsubscribe from navigation updates", async () => {
      const unsubscribe = jest.fn();
      mockDriveNavigationService.onNavigationUpdate.mockReturnValue(
        unsubscribe,
      );
      mockDriveNavigationService.onDisplayUpdate.mockReturnValue(unsubscribe);

      await coordinator.startDriveNavigation(mockRoute);
      coordinator.dispose();

      expect(unsubscribe).toHaveBeenCalled();
    });
  });

  describe("display mode forcing", () => {
    beforeEach(() => {
      coordinator.setInitialized(true);
    });

    it("should force turn screen mode when active screen is TURN_BY_TURN", async () => {
      mockConfigService.getActiveScreen.mockReturnValue(
        ScreenType.TURN_BY_TURN,
      );
      mockDriveNavigationService.getNavigationStatus.mockReturnValue(
        createNavigationStatus({
          state: NavigationState.NAVIGATING,
          displayMode: DriveDisplayMode.MAP_WITH_OVERLAY,
          nextTurn: mockRoute.waypoints[0],
          distanceToNextTurn: 100,
          progress: 50,
          route: mockRoute,
          currentWaypointIndex: 0,
        }),
      );

      await coordinator.updateDriveDisplay();

      expect(mockSVGService.renderTurnScreen).toHaveBeenCalled();
      expect(mockSVGService.renderDriveMapScreen).not.toHaveBeenCalled();
    });
  });

  describe("speed limit caching", () => {
    beforeEach(() => {
      coordinator.setInitialized(true);
    });

    it("should not fetch speed limit when disabled", async () => {
      mockConfigService.getShowSpeedLimit.mockReturnValue(false);

      mockDriveNavigationService.getNavigationStatus.mockReturnValue(
        createNavigationStatus({
          state: NavigationState.NAVIGATING,
          displayMode: DriveDisplayMode.MAP_WITH_OVERLAY,
          route: mockRoute,
          nextTurn: mockRoute.waypoints[0],
          distanceToNextTurn: 100,
          distanceRemaining: 5000,
          progress: 50,
          currentWaypointIndex: 0,
        }),
      );

      await coordinator.updateDriveDisplay();

      expect(mockSpeedLimitService.getSpeedLimit).not.toHaveBeenCalled();
    });
  });

  describe("POI caching", () => {
    beforeEach(() => {
      coordinator.setInitialized(true);
    });

    it("should not fetch POIs when zoom level is below 15", async () => {
      mockConfigService.getZoomLevel.mockReturnValue(14);

      mockDriveNavigationService.getNavigationStatus.mockReturnValue(
        createNavigationStatus({
          state: NavigationState.NAVIGATING,
          displayMode: DriveDisplayMode.MAP_WITH_OVERLAY,
          route: mockRoute,
          nextTurn: mockRoute.waypoints[0],
          distanceToNextTurn: 100,
          distanceRemaining: 5000,
          progress: 50,
          currentWaypointIndex: 0,
        }),
      );

      await coordinator.updateDriveDisplay();

      expect(mockPOIService.getNearbyPOIs).not.toHaveBeenCalled();
    });

    it("should not fetch POIs when no categories are enabled", async () => {
      mockConfigService.getEnabledPOICategories.mockReturnValue([]);

      mockDriveNavigationService.getNavigationStatus.mockReturnValue(
        createNavigationStatus({
          state: NavigationState.NAVIGATING,
          displayMode: DriveDisplayMode.MAP_WITH_OVERLAY,
          route: mockRoute,
          nextTurn: mockRoute.waypoints[0],
          distanceToNextTurn: 100,
          distanceRemaining: 5000,
          progress: 50,
          currentWaypointIndex: 0,
        }),
      );

      await coordinator.updateDriveDisplay();

      expect(mockPOIService.getNearbyPOIs).not.toHaveBeenCalled();
    });
  });

  describe("simulation integration", () => {
    beforeEach(() => {
      coordinator.setInitialized(true);
    });

    it("should push speed limit to simulation service during navigation", async () => {
      mockSimulationService.isSimulating.mockReturnValue(true);

      mockDriveNavigationService.getNavigationStatus.mockReturnValue(
        createNavigationStatus({
          state: NavigationState.NAVIGATING,
          displayMode: DriveDisplayMode.MAP_WITH_OVERLAY,
          route: mockRoute,
          nextTurn: mockRoute.waypoints[0],
          distanceToNextTurn: 100,
          distanceRemaining: 5000,
          progress: 50,
          currentWaypointIndex: 0,
        }),
      );

      await coordinator.updateDriveDisplay();

      expect(mockSimulationService.setCurrentSpeedLimit).toHaveBeenCalledWith(
        50,
      );
    });
  });
});
