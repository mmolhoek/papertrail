/* eslint-disable @typescript-eslint/no-explicit-any */
import { RenderingOrchestrator } from "@services/orchestrator/RenderingOrchestrator";
import {
  success,
  GPSCoordinate,
  GPSStatus,
  GPXTrack,
  Bitmap1Bit,
} from "@core/types";
import { SimulationState, SimulationStatus } from "@core/interfaces";

/**
 * Integration tests for Track Simulation flow
 *
 * Tests the flow of track simulation through the orchestrator:
 * 1. Simulation service starts simulating a track
 * 2. SimulationCoordinator subscribes to state changes
 * 3. Position updates are forwarded to GPSCoordinator
 * 4. Display updates are triggered periodically
 * 5. Auto-update is disabled during simulation
 * 6. Simulation stops and auto-update resumes
 */
describe("Track Simulation Flow Integration", () => {
  let orchestrator: RenderingOrchestrator;
  let mockGPSService: any;
  let mockMapService: any;
  let mockSVGService: any;
  let mockEpaperService: any;
  let mockConfigService: any;
  let mockSimulationService: any;

  // Capture callbacks
  let simulationStateCallbacks: Array<(status: SimulationStatus) => void>;
  let simulationPositionCallbacks: Array<(position: GPSCoordinate) => void>;

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

  const testSimPosition: GPSCoordinate = {
    latitude: 37.78,
    longitude: -122.42,
    timestamp: new Date(),
    speed: 10,
  };

  const testTrack: GPXTrack = {
    name: "Test Track",
    segments: [
      {
        points: [
          { latitude: 37.77, longitude: -122.41, timestamp: new Date() },
          { latitude: 37.78, longitude: -122.42, timestamp: new Date() },
          { latitude: 37.79, longitude: -122.43, timestamp: new Date() },
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

  beforeEach(() => {
    simulationStateCallbacks = [];
    simulationPositionCallbacks = [];

    // Create mock GPS service
    mockGPSService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      dispose: jest.fn().mockResolvedValue(undefined),
      getCurrentPosition: jest.fn().mockResolvedValue(success(testPosition)),
      startTracking: jest.fn().mockResolvedValue(success(undefined)),
      stopTracking: jest.fn(),
      isTracking: jest.fn().mockReturnValue(true),
      getStatus: jest.fn().mockResolvedValue(success(testGPSStatus)),
      onPositionUpdate: jest.fn().mockReturnValue(() => {}),
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
      getPanOffset: jest.fn().mockReturnValue({ x: 0, y: 0 }),
      getRotateWithBearing: jest.fn().mockReturnValue(false),
      getActiveScreen: jest.fn().mockReturnValue("track"),
      setActiveScreen: jest.fn(),
      getAutoRefreshInterval: jest.fn().mockReturnValue(30),
      getRenderOptions: jest.fn().mockReturnValue({ showLine: true }),
      save: jest.fn().mockResolvedValue(success(undefined)),
      getConfig: jest.fn().mockReturnValue({ web: { port: 3000 } }),
      getRoutingProfile: jest.fn().mockReturnValue("car"),
    };

    // Create mock simulation service
    let isSimulating = false;
    const createStatus = (
      state: SimulationState,
      hasPosition: boolean,
    ): SimulationStatus => ({
      state,
      speed: 10,
      speedPreset: "walk",
      currentPointIndex: hasPosition ? 5 : 0,
      totalPoints: 10,
      progress: hasPosition ? 50 : 0,
      currentPosition: hasPosition ? testSimPosition : undefined,
      trackName: "Test Track",
    });

    mockSimulationService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      dispose: jest.fn().mockResolvedValue(undefined),
      isSimulating: jest.fn(() => isSimulating),
      getStatus: jest.fn(() =>
        createStatus(
          isSimulating ? SimulationState.RUNNING : SimulationState.STOPPED,
          isSimulating,
        ),
      ),
      start: jest.fn().mockImplementation(() => {
        isSimulating = true;
        simulationStateCallbacks.forEach((cb) =>
          cb(createStatus(SimulationState.RUNNING, true)),
        );
        return Promise.resolve(success(undefined));
      }),
      stop: jest.fn().mockImplementation(() => {
        isSimulating = false;
        simulationStateCallbacks.forEach((cb) =>
          cb(createStatus(SimulationState.STOPPED, false)),
        );
        return Promise.resolve(success(undefined));
      }),
      pause: jest.fn().mockImplementation(() => {
        simulationStateCallbacks.forEach((cb) =>
          cb(createStatus(SimulationState.PAUSED, true)),
        );
        return Promise.resolve(success(undefined));
      }),
      resume: jest.fn().mockResolvedValue(success(undefined)),
      setSpeed: jest.fn().mockResolvedValue(success(undefined)),
      onStateChange: jest.fn((callback) => {
        simulationStateCallbacks.push(callback);
        return () => {
          const index = simulationStateCallbacks.indexOf(callback);
          if (index > -1) simulationStateCallbacks.splice(index, 1);
        };
      }),
      onPositionUpdate: jest.fn((callback) => {
        simulationPositionCallbacks.push(callback);
        return () => {
          const index = simulationPositionCallbacks.indexOf(callback);
          if (index > -1) simulationPositionCallbacks.splice(index, 1);
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
      mockSimulationService,
    );
  });

  afterEach(async () => {
    await orchestrator.dispose();
  });

  describe("Simulation State Subscription", () => {
    it("should subscribe to simulation state changes during initialization", async () => {
      await orchestrator.initialize();

      // Simulation service should have state callback registered
      expect(mockSimulationService.onStateChange).toHaveBeenCalled();
      expect(simulationStateCallbacks.length).toBeGreaterThan(0);
    });

    it("should subscribe to simulation position updates during initialization", async () => {
      await orchestrator.initialize();

      // Simulation service should have position callback registered
      expect(mockSimulationService.onPositionUpdate).toHaveBeenCalled();
      expect(simulationPositionCallbacks.length).toBeGreaterThan(0);
    });
  });

  describe("Simulation Position Updates", () => {
    it("should forward simulation positions to GPS coordinator", async () => {
      await orchestrator.initialize();

      // Register a GPS update callback to verify position forwarding
      const gpsCallback = jest.fn();
      orchestrator.onGPSUpdate(gpsCallback);

      // Simulate position update from simulation service
      simulationPositionCallbacks.forEach((cb) => cb(testSimPosition));

      expect(gpsCallback).toHaveBeenCalledWith(testSimPosition);
    });

    it("should use simulated position in display updates during simulation", async () => {
      await orchestrator.initialize();

      // Start simulation
      await mockSimulationService.start();

      // Verify simulation is running
      expect(mockSimulationService.isSimulating()).toBe(true);

      // Update display
      await orchestrator.updateDisplay();

      // The display should have been updated
      expect(mockSVGService.renderDriveMapScreen).toHaveBeenCalled();
    });
  });

  describe("Auto Update Management", () => {
    it("should stop auto-update when simulation starts", async () => {
      await orchestrator.initialize();

      // Start auto-update
      await orchestrator.startAutoUpdate();
      expect(orchestrator.isAutoUpdateRunning()).toBe(true);

      // Simulate simulation starting
      const runningStatus: SimulationStatus = {
        state: SimulationState.RUNNING,
        speed: 10,
        speedPreset: "walk",
        currentPointIndex: 0,
        totalPoints: 10,
        progress: 0,
        currentPosition: testSimPosition,
      };
      simulationStateCallbacks.forEach((cb) => cb(runningStatus));

      // Auto-update should be stopped
      expect(orchestrator.isAutoUpdateRunning()).toBe(false);
    });

    it("should not restart auto-update when simulation stops", async () => {
      await orchestrator.initialize();

      // Start auto-update, then stop it via simulation start
      await orchestrator.startAutoUpdate();
      expect(orchestrator.isAutoUpdateRunning()).toBe(true);

      // Simulate simulation running
      const runningStatus: SimulationStatus = {
        state: SimulationState.RUNNING,
        speed: 10,
        speedPreset: "walk",
        currentPointIndex: 0,
        totalPoints: 10,
        progress: 0,
        currentPosition: testSimPosition,
      };
      simulationStateCallbacks.forEach((cb) => cb(runningStatus));
      expect(orchestrator.isAutoUpdateRunning()).toBe(false);

      // Simulate simulation stopped
      const stoppedStatus: SimulationStatus = {
        state: SimulationState.STOPPED,
        speed: 10,
        speedPreset: "walk",
        currentPointIndex: 0,
        totalPoints: 10,
        progress: 0,
      };
      simulationStateCallbacks.forEach((cb) => cb(stoppedStatus));

      // Auto-update should NOT auto-restart (user must manually restart)
      expect(orchestrator.isAutoUpdateRunning()).toBe(false);
    });
  });

  describe("Simulation State Transitions", () => {
    it("should handle running state", async () => {
      await orchestrator.initialize();

      // Simulate transition to running
      const runningStatus: SimulationStatus = {
        state: SimulationState.RUNNING,
        speed: 10,
        speedPreset: "walk",
        currentPointIndex: 0,
        totalPoints: 10,
        progress: 0,
        currentPosition: testSimPosition,
      };
      simulationStateCallbacks.forEach((cb) => cb(runningStatus));

      // Display update should work with simulation position
      const result = await orchestrator.updateDisplay();
      expect(result).toHaveProperty("success");
    });

    it("should handle paused state", async () => {
      await orchestrator.initialize();

      // Start simulation
      await mockSimulationService.start();

      // Pause simulation
      await mockSimulationService.pause();

      // Should still be able to update display
      const result = await orchestrator.updateDisplay();
      expect(result).toHaveProperty("success");
    });

    it("should handle stopped state", async () => {
      await orchestrator.initialize();

      // Start and stop simulation
      await mockSimulationService.start();
      await mockSimulationService.stop();

      // Should fall back to GPS for position
      expect(mockSimulationService.isSimulating()).toBe(false);
    });
  });

  describe("Simulation Without Service", () => {
    it("should work without simulation service", async () => {
      // Create orchestrator without simulation service
      const orchestratorNoSim = new RenderingOrchestrator(
        mockGPSService,
        mockMapService,
        mockSVGService,
        mockEpaperService,
        mockConfigService,
      );

      await orchestratorNoSim.initialize();

      // Should be able to update display using GPS
      const result = await orchestratorNoSim.updateDisplay();
      expect(result).toHaveProperty("success");

      await orchestratorNoSim.dispose();
    });
  });

  describe("GPS Update Filtering During Simulation", () => {
    it("should ignore real GPS updates when simulation is running", async () => {
      await orchestrator.initialize();

      // Start simulation
      await mockSimulationService.start();

      // Capture the GPS position callback from the GPS service
      const gpsServicePositionCallbacks: Array<
        (position: GPSCoordinate) => void
      > = [];
      mockGPSService.onPositionUpdate.mockImplementation(
        (callback: (position: GPSCoordinate) => void) => {
          gpsServicePositionCallbacks.push(callback);
          return () => {};
        },
      );

      // Re-subscribe to trigger the new mock
      await orchestrator.dispose();

      // Reset mocks for new orchestrator
      mockSimulationService.isSimulating = jest.fn().mockReturnValue(true);

      const newOrchestrator = new RenderingOrchestrator(
        mockGPSService,
        mockMapService,
        mockSVGService,
        mockEpaperService,
        mockConfigService,
        undefined,
        undefined,
        mockSimulationService,
      );
      await newOrchestrator.initialize();

      // Register GPS callback on orchestrator
      const gpsCallback = jest.fn();
      newOrchestrator.onGPSUpdate(gpsCallback);

      // Simulate real GPS update (should be ignored during simulation)
      gpsServicePositionCallbacks.forEach((cb) => cb(testPosition));

      // The callback should NOT be called for real GPS during simulation
      // (the filter in GPSCoordinator checks isSimulating)
      expect(gpsCallback).not.toHaveBeenCalled();

      await newOrchestrator.dispose();
    });
  });
});
