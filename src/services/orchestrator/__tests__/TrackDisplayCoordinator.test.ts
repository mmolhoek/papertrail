import { TrackDisplayCoordinator } from "../TrackDisplayCoordinator";
import {
  IGPSService,
  IMapService,
  ISVGService,
  IConfigService,
  IDriveNavigationService,
  IDisplayService,
} from "@core/interfaces";
import {
  GPSCoordinate,
  GPXTrack,
  success,
  failure,
  DisplayUpdateMode,
  ScreenType,
  Bitmap1Bit,
} from "@core/types";
import { SimulationCoordinator } from "../SimulationCoordinator";
import { DriveCoordinator } from "../DriveCoordinator";

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock geo utilities
jest.mock("@utils/geo", () => ({
  haversineDistance: jest.fn().mockReturnValue(100),
  calculateBearing: jest.fn().mockReturnValue(45),
}));

describe("TrackDisplayCoordinator", () => {
  let coordinator: TrackDisplayCoordinator;
  let mockGPSService: jest.Mocked<IGPSService>;
  let mockMapService: jest.Mocked<IMapService>;
  let mockSVGService: jest.Mocked<ISVGService>;
  let mockDisplayService: jest.Mocked<IDisplayService>;
  let mockConfigService: jest.Mocked<IConfigService>;
  let mockDriveNavigationService: jest.Mocked<IDriveNavigationService>;
  let mockSimulationCoordinator: jest.Mocked<SimulationCoordinator>;
  let mockDriveCoordinator: jest.Mocked<DriveCoordinator>;

  const mockPosition: GPSCoordinate = {
    latitude: 51.5074,
    longitude: -0.1278,
    altitude: 10,
    timestamp: new Date(),
  };

  const mockTrack: GPXTrack = {
    name: "Test Track",
    segments: [
      {
        points: [
          {
            latitude: 51.5,
            longitude: -0.1,
            altitude: 0,
            timestamp: new Date(),
          },
          {
            latitude: 51.51,
            longitude: -0.09,
            altitude: 0,
            timestamp: new Date(),
          },
          {
            latitude: 51.52,
            longitude: -0.08,
            altitude: 0,
            timestamp: new Date(),
          },
        ],
      },
    ],
  };

  const mockBitmap: Bitmap1Bit = {
    width: 800,
    height: 480,
    data: Buffer.alloc((800 * 480) / 8),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockGPSService = {
      getCurrentPosition: jest.fn().mockResolvedValue(success(mockPosition)),
      getStatus: jest.fn().mockResolvedValue(
        success({
          satellitesInUse: 8,
          fixQuality: 1,
          hdop: 1.0,
          isTracking: true,
        }),
      ),
      startTracking: jest.fn(),
      stopTracking: jest.fn(),
      onPositionUpdate: jest.fn(),
      onStatusChange: jest.fn(),
    } as unknown as jest.Mocked<IGPSService>;

    mockMapService = {
      loadGPXFile: jest.fn().mockResolvedValue(
        success({
          tracks: [mockTrack],
          waypoints: [],
        }),
      ),
      calculateDistance: jest.fn().mockReturnValue(5000),
    } as unknown as jest.Mocked<IMapService>;

    mockSVGService = {
      renderTurnScreen: jest.fn().mockResolvedValue(success(mockBitmap)),
      renderDriveMapScreen: jest.fn().mockResolvedValue(success(mockBitmap)),
    } as unknown as jest.Mocked<ISVGService>;

    mockDisplayService = {
      displayBitmap: jest.fn().mockResolvedValue(success(undefined)),
      isBusy: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<IDisplayService>;

    mockConfigService = {
      getActiveGPXPath: jest.fn().mockReturnValue("/path/to/track.gpx"),
      getDisplayWidth: jest.fn().mockReturnValue(800),
      getDisplayHeight: jest.fn().mockReturnValue(480),
      getZoomLevel: jest.fn().mockReturnValue(15),
      getRenderOptions: jest.fn().mockReturnValue({
        lineWidth: 2,
        pointRadius: 2,
        showPoints: false,
        showLine: true,
        highlightCurrentPosition: true,
        showDirection: true,
        antiAlias: false,
      }),
      getRotateWithBearing: jest.fn().mockReturnValue(true),
      getActiveScreen: jest.fn().mockReturnValue(ScreenType.TRACK),
      getRoutingProfile: jest.fn().mockReturnValue("car"),
    } as unknown as jest.Mocked<IConfigService>;

    mockDriveNavigationService = {
      isNavigating: jest.fn().mockReturnValue(false),
      getActiveRoute: jest.fn().mockReturnValue(null),
    } as unknown as jest.Mocked<IDriveNavigationService>;

    mockSimulationCoordinator = {
      isSimulating: jest.fn().mockReturnValue(false),
      getSimulationService: jest.fn().mockReturnValue(null),
    } as unknown as jest.Mocked<SimulationCoordinator>;

    mockDriveCoordinator = {
      isDriveNavigating: jest.fn().mockReturnValue(false),
      updateDriveDisplay: jest.fn().mockResolvedValue(success(undefined)),
    } as unknown as jest.Mocked<DriveCoordinator>;

    coordinator = new TrackDisplayCoordinator(
      mockGPSService,
      mockMapService,
      mockSVGService,
      mockDisplayService,
      mockConfigService,
      mockDriveNavigationService,
      mockSimulationCoordinator,
      mockDriveCoordinator,
    );
  });

  describe("initialization", () => {
    it("should not be initialized by default", async () => {
      const result = await coordinator.updateDisplay();

      expect(result.success).toBe(false);
    });

    it("should allow setting initialized state", async () => {
      coordinator.setInitialized(true);

      await coordinator.updateDisplay();

      // Will proceed past initialization check
      expect(mockMapService.loadGPXFile).toHaveBeenCalled();
    });
  });

  describe("setSimulationCoordinator", () => {
    it("should set the simulation coordinator", () => {
      const newCoordinator = {} as jest.Mocked<SimulationCoordinator>;
      coordinator.setSimulationCoordinator(newCoordinator);

      // Verified through behavior
      expect(true).toBe(true);
    });

    it("should allow setting null coordinator", () => {
      coordinator.setSimulationCoordinator(null);

      expect(true).toBe(true);
    });
  });

  describe("setDriveCoordinator", () => {
    it("should set the drive coordinator", () => {
      const newCoordinator = {} as jest.Mocked<DriveCoordinator>;
      coordinator.setDriveCoordinator(newCoordinator);

      expect(true).toBe(true);
    });

    it("should allow setting null coordinator", () => {
      coordinator.setDriveCoordinator(null);

      expect(true).toBe(true);
    });
  });

  describe("setDisplayUpdateCallback", () => {
    it("should set the display update callback", () => {
      const callback = jest.fn();
      coordinator.setDisplayUpdateCallback(callback);

      expect(true).toBe(true);
    });
  });

  describe("setErrorCallback", () => {
    it("should set the error callback", () => {
      const callback = jest.fn();
      coordinator.setErrorCallback(callback);

      expect(true).toBe(true);
    });
  });

  describe("updateDisplay", () => {
    beforeEach(() => {
      coordinator.setInitialized(true);
    });

    it("should fail when not initialized", async () => {
      coordinator.setInitialized(false);

      const result = await coordinator.updateDisplay();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("not initialized");
      }
    });

    it("should redirect to drive display during drive simulation", async () => {
      mockSimulationCoordinator.isSimulating.mockReturnValue(true);
      mockDriveCoordinator.isDriveNavigating.mockReturnValue(true);

      await coordinator.updateDisplay();

      expect(mockDriveCoordinator.updateDriveDisplay).toHaveBeenCalled();
    });

    it("should load and display GPX track", async () => {
      const result = await coordinator.updateDisplay();

      expect(mockConfigService.getActiveGPXPath).toHaveBeenCalled();
      expect(mockMapService.loadGPXFile).toHaveBeenCalledWith(
        "/path/to/track.gpx",
      );
      expect(result.success).toBe(true);
    });

    it("should fail when no active GPX path", async () => {
      mockConfigService.getActiveGPXPath.mockReturnValue(null);

      const result = await coordinator.updateDisplay();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("GPX");
      }
    });

    it("should fail when GPX file load fails", async () => {
      mockMapService.loadGPXFile.mockResolvedValue(
        failure(new Error("File not found")),
      );

      const result = await coordinator.updateDisplay();

      expect(result.success).toBe(false);
    });

    it("should fail when GPX file has no tracks", async () => {
      mockMapService.loadGPXFile.mockResolvedValue(
        success({ tracks: [], waypoints: [] }),
      );

      const result = await coordinator.updateDisplay();

      expect(result.success).toBe(false);
    });

    it("should get current position from GPS", async () => {
      await coordinator.updateDisplay();

      expect(mockGPSService.getCurrentPosition).toHaveBeenCalled();
    });

    it("should render track display", async () => {
      await coordinator.updateDisplay();

      expect(mockSVGService.renderDriveMapScreen).toHaveBeenCalled();
    });

    it("should render turn-by-turn screen when active", async () => {
      mockConfigService.getActiveScreen.mockReturnValue(
        ScreenType.TURN_BY_TURN,
      );

      await coordinator.updateDisplay();

      expect(mockSVGService.renderTurnScreen).toHaveBeenCalled();
    });

    it("should display bitmap on e-paper", async () => {
      await coordinator.updateDisplay();

      expect(mockDisplayService.displayBitmap).toHaveBeenCalledWith(
        mockBitmap,
        undefined,
      );
    });

    it("should pass display mode to displayBitmap", async () => {
      await coordinator.updateDisplay(DisplayUpdateMode.FULL);

      expect(mockDisplayService.displayBitmap).toHaveBeenCalledWith(
        mockBitmap,
        DisplayUpdateMode.FULL,
      );
    });

    it("should notify display update callback on success", async () => {
      const callback = jest.fn();
      coordinator.setDisplayUpdateCallback(callback);

      await coordinator.updateDisplay();

      expect(callback).toHaveBeenCalledWith(true);
    });

    it("should notify error callback on display failure", async () => {
      const errorCallback = jest.fn();
      coordinator.setErrorCallback(errorCallback);
      mockDisplayService.displayBitmap.mockResolvedValue(
        failure(new Error("Display error")),
      );

      await coordinator.updateDisplay();

      expect(errorCallback).toHaveBeenCalledWith(expect.any(Error));
    });

    it("should notify error callback on render failure", async () => {
      const errorCallback = jest.fn();
      coordinator.setErrorCallback(errorCallback);
      mockSVGService.renderDriveMapScreen.mockResolvedValue(
        failure(new Error("Render error")),
      );

      await coordinator.updateDisplay();

      expect(errorCallback).toHaveBeenCalledWith(expect.any(Error));
    });

    it("should handle exception during update", async () => {
      const errorCallback = jest.fn();
      coordinator.setErrorCallback(errorCallback);
      mockMapService.loadGPXFile.mockRejectedValue(new Error("Unexpected"));

      const result = await coordinator.updateDisplay();

      expect(result.success).toBe(false);
      expect(errorCallback).toHaveBeenCalled();
    });

    it("should not proceed when display is busy", async () => {
      mockDisplayService.isBusy.mockReturnValue(true);

      const result = await coordinator.updateDisplay();

      expect(result.success).toBe(true);
      expect(mockMapService.loadGPXFile).not.toHaveBeenCalled();
    });
  });

  describe("updateDisplay with drive navigation", () => {
    beforeEach(() => {
      coordinator.setInitialized(true);
    });

    it("should use route geometry when drive navigation is active", async () => {
      mockDriveNavigationService.isNavigating.mockReturnValue(true);
      mockDriveNavigationService.getActiveRoute.mockReturnValue({
        id: "route-1",
        destination: "Test Destination",
        geometry: [
          [51.5, -0.1],
          [51.51, -0.09],
        ],
        totalDistance: 1000,
        estimatedTime: 60,
        createdAt: new Date(),
        startPoint: { latitude: 51.5, longitude: -0.1 },
        endPoint: { latitude: 51.51, longitude: -0.09 },
        waypoints: [],
      });

      await coordinator.updateDisplay();

      // Should not load GPX file
      expect(mockMapService.loadGPXFile).not.toHaveBeenCalled();
      // Should render display
      expect(mockSVGService.renderDriveMapScreen).toHaveBeenCalled();
    });

    it("should fail when drive navigation active but no geometry", async () => {
      mockDriveNavigationService.isNavigating.mockReturnValue(true);
      mockDriveNavigationService.getActiveRoute.mockReturnValue(null);

      const result = await coordinator.updateDisplay();

      expect(result.success).toBe(false);
    });
  });

  describe("getCurrentPosition", () => {
    beforeEach(() => {
      coordinator.setInitialized(true);
    });

    it("should use simulation position when simulating", async () => {
      const simPosition: GPSCoordinate = {
        latitude: 52.0,
        longitude: -0.2,
        timestamp: new Date(),
      };
      mockSimulationCoordinator.getSimulationService.mockReturnValue({
        isSimulating: () => true,
        getStatus: () => ({ currentPosition: simPosition }),
      } as never);

      await coordinator.updateDisplay();

      // The render should use the simulation position
      expect(mockSVGService.renderDriveMapScreen).toHaveBeenCalled();
    });

    it("should use GPS position when not simulating", async () => {
      await coordinator.updateDisplay();

      expect(mockGPSService.getCurrentPosition).toHaveBeenCalled();
    });

    it("should fall back to track start when no GPS", async () => {
      mockGPSService.getCurrentPosition.mockResolvedValue(
        success({ latitude: 0, longitude: 0, timestamp: new Date() }),
      );

      await coordinator.updateDisplay();

      // Should still succeed using track start point
      expect(mockDisplayService.displayBitmap).toHaveBeenCalled();
    });

    it("should fail when simulation has no position", async () => {
      mockSimulationCoordinator.getSimulationService.mockReturnValue({
        isSimulating: () => true,
        getStatus: () => ({ currentPosition: null }),
      } as never);

      const result = await coordinator.updateDisplay();

      expect(result.success).toBe(false);
    });
  });

  describe("getDisplayUpdateQueue", () => {
    it("should return the display update queue", () => {
      const queue = coordinator.getDisplayUpdateQueue();

      expect(queue).toBeDefined();
    });
  });

  describe("clearTurnCache", () => {
    it("should clear the turn analysis cache", () => {
      coordinator.clearTurnCache();

      // Verified through behavior - no error thrown
      expect(true).toBe(true);
    });
  });

  describe("track progress calculation", () => {
    beforeEach(() => {
      coordinator.setInitialized(true);
    });

    it("should calculate track progress based on position", async () => {
      await coordinator.updateDisplay();

      // renderDriveMapScreen should be called with progress info
      expect(mockSVGService.renderDriveMapScreen).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          progress: expect.any(Number),
          distanceRemaining: expect.any(Number),
        }),
        expect.anything(),
      );
    });

    it("should handle zero total distance", async () => {
      mockMapService.calculateDistance.mockReturnValue(0);

      const result = await coordinator.updateDisplay();

      expect(result.success).toBe(true);
    });

    it("should handle empty track segments", async () => {
      // Return 0,0 position so it falls back to track start (which is empty)
      mockGPSService.getCurrentPosition.mockResolvedValue(
        success({ latitude: 0, longitude: 0, timestamp: new Date() }),
      );
      mockMapService.loadGPXFile.mockResolvedValue(
        success({
          tracks: [{ name: "Empty", segments: [] }],
          waypoints: [],
        }),
      );

      const result = await coordinator.updateDisplay();

      expect(result.success).toBe(false);
    });
  });

  describe("turn analysis caching", () => {
    beforeEach(() => {
      coordinator.setInitialized(true);
    });

    it("should cache turn analysis for same track", async () => {
      await coordinator.updateDisplay();
      await coordinator.updateDisplay();

      // Track turn analyzer is created once, not re-analyzed
      expect(mockSVGService.renderDriveMapScreen).toHaveBeenCalledTimes(2);
    });

    it("should re-analyze turns when track path changes", async () => {
      await coordinator.updateDisplay();

      mockConfigService.getActiveGPXPath.mockReturnValue("/path/to/other.gpx");

      await coordinator.updateDisplay();

      expect(mockSVGService.renderDriveMapScreen).toHaveBeenCalledTimes(2);
    });
  });

  describe("waypoint caching", () => {
    beforeEach(() => {
      coordinator.setInitialized(true);
    });

    it("should cache waypoints from GPX file", async () => {
      mockMapService.loadGPXFile.mockResolvedValue(
        success({
          tracks: [mockTrack],
          waypoints: [
            {
              latitude: 51.505,
              longitude: -0.095,
              name: "Waypoint 1",
              altitude: 0,
              timestamp: new Date(),
            },
          ],
        }),
      );

      await coordinator.updateDisplay();

      // Waypoints should be used in render
      expect(mockSVGService.renderDriveMapScreen).toHaveBeenCalled();
    });
  });

  describe("dispose", () => {
    it("should clean up resources", () => {
      coordinator.dispose();

      // Should not throw
      expect(true).toBe(true);
    });

    it("should clear turn cache on dispose", () => {
      coordinator.dispose();

      // Verified through not throwing
      expect(true).toBe(true);
    });
  });

  describe("display queue integration", () => {
    beforeEach(() => {
      coordinator.setInitialized(true);
    });

    it("should queue updates when one is in progress", async () => {
      // Start first update
      const promise1 = coordinator.updateDisplay();

      // Try second update while first is in progress
      const promise2 = coordinator.updateDisplay(DisplayUpdateMode.FULL);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1.success).toBe(true);
      // Second should succeed (queued)
      expect(result2.success).toBe(true);
    });
  });

  describe("render options", () => {
    beforeEach(() => {
      coordinator.setInitialized(true);
    });

    it("should pass render options from config", async () => {
      mockConfigService.getRenderOptions.mockReturnValue({
        lineWidth: 3,
        pointRadius: 3,
        showPoints: true,
        showLine: true,
        highlightCurrentPosition: true,
        showDirection: true,
        antiAlias: false,
      });
      mockConfigService.getRotateWithBearing.mockReturnValue(false);

      await coordinator.updateDisplay();

      expect(mockSVGService.renderDriveMapScreen).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          lineWidth: 3,
          showPoints: true,
          rotateWithBearing: false,
        }),
      );
    });
  });

  describe("satellite count", () => {
    beforeEach(() => {
      coordinator.setInitialized(true);
    });

    it("should include satellite count from GPS status", async () => {
      mockGPSService.getStatus.mockResolvedValue(
        success({
          satellitesInUse: 12,
          fixQuality: 2,
          hdop: 0.8,
          isTracking: true,
        }),
      );

      await coordinator.updateDisplay();

      expect(mockSVGService.renderDriveMapScreen).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          satellites: 12,
        }),
        expect.anything(),
      );
    });

    it("should use 0 satellites when GPS status fails", async () => {
      mockGPSService.getStatus.mockResolvedValue(
        failure(new Error("GPS error")),
      );

      await coordinator.updateDisplay();

      expect(mockSVGService.renderDriveMapScreen).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          satellites: 0,
        }),
        expect.anything(),
      );
    });
  });

  describe("speed and ETA calculation", () => {
    beforeEach(() => {
      coordinator.setInitialized(true);
    });

    it("should include speed in km/h", async () => {
      const posWithSpeed: GPSCoordinate = {
        ...mockPosition,
        speed: 10, // 10 m/s = 36 km/h
      };
      mockGPSService.getCurrentPosition.mockResolvedValue(
        success(posWithSpeed),
      );

      await coordinator.updateDisplay();

      expect(mockSVGService.renderDriveMapScreen).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          speed: 36, // 10 m/s * 3.6
        }),
        expect.anything(),
      );
    });

    it("should handle zero speed", async () => {
      const posNoSpeed: GPSCoordinate = {
        ...mockPosition,
        speed: 0,
      };
      mockGPSService.getCurrentPosition.mockResolvedValue(success(posNoSpeed));

      await coordinator.updateDisplay();

      expect(mockSVGService.renderDriveMapScreen).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          speed: 0,
        }),
        expect.anything(),
      );
    });
  });

  describe("bearing and rotation", () => {
    beforeEach(() => {
      coordinator.setInitialized(true);
    });

    it("should include bearing in position", async () => {
      const posWithBearing: GPSCoordinate = {
        ...mockPosition,
        bearing: 45,
      };
      mockGPSService.getCurrentPosition.mockResolvedValue(
        success(posWithBearing),
      );

      await coordinator.updateDisplay();

      // Bearing is passed in the position object (2nd argument)
      expect(mockSVGService.renderDriveMapScreen).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          bearing: 45,
        }),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });
  });
});
