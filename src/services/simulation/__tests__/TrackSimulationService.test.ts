import { TrackSimulationService } from "../TrackSimulationService";
import {
  SimulationSpeed,
  SimulationState,
  SimulationStatus,
} from "@core/interfaces";
import { GPXTrack, GPSCoordinate } from "@core/types";

describe("TrackSimulationService", () => {
  let service: TrackSimulationService;

  // Helper to create a test track
  const createTestTrack = (pointCount: number = 10): GPXTrack => {
    const points = [];
    const baseLat = 37.7749;
    const baseLon = -122.4194;

    for (let i = 0; i < pointCount; i++) {
      points.push({
        latitude: baseLat + i * 0.001, // ~111m per 0.001 degree
        longitude: baseLon + i * 0.001,
        altitude: 100 + i * 10,
        timestamp: new Date(Date.now() + i * 1000),
      });
    }

    return {
      name: "Test Track",
      segments: [{ points }],
    };
  };

  // Helper to wait for async operations
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  beforeEach(() => {
    service = new TrackSimulationService();
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe("initialization", () => {
    it("should initialize successfully", async () => {
      const result = await service.initialize();
      expect(result.success).toBe(true);
    });

    it("should allow multiple initializations without error", async () => {
      await service.initialize();
      const result = await service.initialize();
      expect(result.success).toBe(true);
    });

    it("should not be simulating after initialization", async () => {
      await service.initialize();
      expect(service.isSimulating()).toBe(false);
    });

    it("should have stopped state after initialization", async () => {
      await service.initialize();
      const status = service.getStatus();
      expect(status.state).toBe(SimulationState.STOPPED);
    });
  });

  describe("startSimulation", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should fail if not initialized", async () => {
      const uninitializedService = new TrackSimulationService();
      const track = createTestTrack();
      const result = await uninitializedService.startSimulation(track);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("not initialized");
      }

      await uninitializedService.dispose();
    });

    it("should start simulation with valid track", async () => {
      const track = createTestTrack();
      const result = await service.startSimulation(track);

      expect(result.success).toBe(true);
      expect(service.isSimulating()).toBe(true);
    });

    it("should fail with track that has less than 2 points", async () => {
      const track = createTestTrack(1);
      const result = await service.startSimulation(track);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("at least 2 points");
      }
    });

    it("should fail with empty track", async () => {
      const track: GPXTrack = {
        name: "Empty Track",
        segments: [],
      };
      const result = await service.startSimulation(track);

      expect(result.success).toBe(false);
    });

    it("should use default speed (WALK) if not specified", async () => {
      const track = createTestTrack();
      await service.startSimulation(track);

      const status = service.getStatus();
      expect(status.speed).toBe(SimulationSpeed.WALK);
      expect(status.speedPreset).toBe("walk");
    });

    it("should accept custom speed", async () => {
      const track = createTestTrack();
      await service.startSimulation(track, SimulationSpeed.BICYCLE);

      const status = service.getStatus();
      expect(status.speed).toBe(SimulationSpeed.BICYCLE);
      expect(status.speedPreset).toBe("bicycle");
    });

    it("should accept custom numeric speed", async () => {
      const track = createTestTrack();
      await service.startSimulation(track, 30);

      const status = service.getStatus();
      expect(status.speed).toBe(30);
      expect(status.speedPreset).toBe("custom");
    });

    it("should set state to RUNNING", async () => {
      const track = createTestTrack();
      await service.startSimulation(track);

      const status = service.getStatus();
      expect(status.state).toBe(SimulationState.RUNNING);
    });

    it("should stop existing simulation before starting new one", async () => {
      const track1 = createTestTrack();
      const track2 = createTestTrack(5);
      track2.name = "Track 2";

      await service.startSimulation(track1);
      await service.startSimulation(track2);

      const status = service.getStatus();
      expect(status.trackName).toBe("Track 2");
      expect(status.totalPoints).toBe(5);
    });

    it("should set initial position to first track point", async () => {
      const track = createTestTrack();
      await service.startSimulation(track);

      const status = service.getStatus();
      expect(status.currentPosition).toBeDefined();
      expect(status.currentPosition?.latitude).toBeCloseTo(37.7749, 4);
      expect(status.currentPosition?.longitude).toBeCloseTo(-122.4194, 4);
    });

    it("should calculate total points correctly", async () => {
      const track = createTestTrack(15);
      await service.startSimulation(track);

      const status = service.getStatus();
      expect(status.totalPoints).toBe(15);
    });
  });

  describe("stopSimulation", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should stop running simulation", async () => {
      const track = createTestTrack();
      await service.startSimulation(track);
      const result = await service.stopSimulation();

      expect(result.success).toBe(true);
      expect(service.isSimulating()).toBe(false);
    });

    it("should succeed even if not simulating", async () => {
      const result = await service.stopSimulation();
      expect(result.success).toBe(true);
    });

    it("should reset state to STOPPED", async () => {
      const track = createTestTrack();
      await service.startSimulation(track);
      await service.stopSimulation();

      const status = service.getStatus();
      expect(status.state).toBe(SimulationState.STOPPED);
    });

    it("should clear current position", async () => {
      const track = createTestTrack();
      await service.startSimulation(track);
      await service.stopSimulation();

      const status = service.getStatus();
      expect(status.currentPosition).toBeUndefined();
    });

    it("should reset progress", async () => {
      const track = createTestTrack();
      await service.startSimulation(track);
      await wait(100); // Let simulation progress
      await service.stopSimulation();

      const status = service.getStatus();
      expect(status.progress).toBe(0);
      expect(status.currentPointIndex).toBe(0);
    });
  });

  describe("pauseSimulation", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should pause running simulation", async () => {
      const track = createTestTrack();
      await service.startSimulation(track);
      const result = await service.pauseSimulation();

      expect(result.success).toBe(true);
      expect(service.isSimulating()).toBe(true); // Still "simulating" (paused counts)
    });

    it("should fail if not running", async () => {
      const result = await service.pauseSimulation();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("not running");
      }
    });

    it("should fail if already paused", async () => {
      const track = createTestTrack();
      await service.startSimulation(track);
      await service.pauseSimulation();
      const result = await service.pauseSimulation();

      expect(result.success).toBe(false);
    });

    it("should set state to PAUSED", async () => {
      const track = createTestTrack();
      await service.startSimulation(track);
      await service.pauseSimulation();

      const status = service.getStatus();
      expect(status.state).toBe(SimulationState.PAUSED);
    });

    it("should preserve current position when paused", async () => {
      const track = createTestTrack();
      await service.startSimulation(track);
      await wait(100);

      const statusBefore = service.getStatus();
      await service.pauseSimulation();
      const statusAfter = service.getStatus();

      expect(statusAfter.currentPosition?.latitude).toBeCloseTo(
        statusBefore.currentPosition?.latitude || 0,
        4,
      );
    });
  });

  describe("resumeSimulation", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should resume paused simulation", async () => {
      const track = createTestTrack();
      await service.startSimulation(track);
      await service.pauseSimulation();
      const result = await service.resumeSimulation();

      expect(result.success).toBe(true);
    });

    it("should fail if not paused", async () => {
      const result = await service.resumeSimulation();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("not paused");
      }
    });

    it("should fail if running (not paused)", async () => {
      const track = createTestTrack();
      await service.startSimulation(track);
      const result = await service.resumeSimulation();

      expect(result.success).toBe(false);
    });

    it("should set state back to RUNNING", async () => {
      const track = createTestTrack();
      await service.startSimulation(track);
      await service.pauseSimulation();
      await service.resumeSimulation();

      const status = service.getStatus();
      expect(status.state).toBe(SimulationState.RUNNING);
    });
  });

  describe("setSpeed", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should set speed to valid value", async () => {
      const result = await service.setSpeed(35);

      expect(result.success).toBe(true);
      expect(service.getStatus().speed).toBe(35);
    });

    it("should reject speed <= 0", async () => {
      const result = await service.setSpeed(0);

      expect(result.success).toBe(false);
    });

    it("should reject speed > 200", async () => {
      const result = await service.setSpeed(250);

      expect(result.success).toBe(false);
    });

    it("should update speed during simulation", async () => {
      const track = createTestTrack();
      await service.startSimulation(track, SimulationSpeed.WALK);
      await service.setSpeed(40);

      const status = service.getStatus();
      expect(status.speed).toBe(40);
      expect(status.speedPreset).toBe("custom");
    });
  });

  describe("setSpeedPreset", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should set walk speed preset", async () => {
      const result = await service.setSpeedPreset("walk");

      expect(result.success).toBe(true);
      expect(service.getStatus().speed).toBe(SimulationSpeed.WALK);
      expect(service.getStatus().speedPreset).toBe("walk");
    });

    it("should set bicycle speed preset", async () => {
      const result = await service.setSpeedPreset("bicycle");

      expect(result.success).toBe(true);
      expect(service.getStatus().speed).toBe(SimulationSpeed.BICYCLE);
      expect(service.getStatus().speedPreset).toBe("bicycle");
    });

    it("should set drive speed preset", async () => {
      const result = await service.setSpeedPreset("drive");

      expect(result.success).toBe(true);
      expect(service.getStatus().speed).toBe(SimulationSpeed.DRIVE);
      expect(service.getStatus().speedPreset).toBe("drive");
    });
  });

  describe("getStatus", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should return correct initial status", async () => {
      const status = service.getStatus();

      expect(status.state).toBe(SimulationState.STOPPED);
      expect(status.speed).toBe(SimulationSpeed.WALK);
      expect(status.speedPreset).toBe("walk");
      expect(status.currentPointIndex).toBe(0);
      expect(status.totalPoints).toBe(0);
      expect(status.progress).toBe(0);
      expect(status.currentPosition).toBeUndefined();
      expect(status.trackName).toBeUndefined();
    });

    it("should return correct status during simulation", async () => {
      const track = createTestTrack(10);
      await service.startSimulation(track, SimulationSpeed.BICYCLE);

      const status = service.getStatus();

      expect(status.state).toBe(SimulationState.RUNNING);
      expect(status.speed).toBe(SimulationSpeed.BICYCLE);
      expect(status.speedPreset).toBe("bicycle");
      expect(status.totalPoints).toBe(10);
      expect(status.trackName).toBe("Test Track");
      expect(status.currentPosition).toBeDefined();
      expect(status.estimatedTimeRemaining).toBeGreaterThanOrEqual(0);
      expect(status.distanceRemaining).toBeGreaterThanOrEqual(0);
    });

    it("should update progress as simulation runs", async () => {
      // Create longer track with closer points for more predictable timing
      const track: GPXTrack = {
        name: "Progress Track",
        segments: [
          {
            points: [
              { latitude: 37.0, longitude: -122.0, timestamp: new Date() },
              { latitude: 37.0001, longitude: -122.0, timestamp: new Date() }, // ~11m apart
              { latitude: 37.0002, longitude: -122.0, timestamp: new Date() },
              { latitude: 37.0003, longitude: -122.0, timestamp: new Date() },
              { latitude: 37.0004, longitude: -122.0, timestamp: new Date() },
            ],
          },
        ],
      };

      // Use high speed (100 km/h = ~28 m/s) for faster progress through ~44m track
      await service.startSimulation(track, 100);

      // Check initial state
      const initialStatus = service.getStatus();
      expect(initialStatus.currentPointIndex).toBe(0);

      // Wait long enough for at least one position update (500ms) plus some processing time
      await wait(1000);

      const laterStatus = service.getStatus();
      // Either progress increased, or simulation completed due to high speed
      const hasProgressed =
        laterStatus.currentPointIndex > 0 ||
        laterStatus.progress > 0 ||
        laterStatus.state === SimulationState.STOPPED;
      expect(hasProgressed).toBe(true);
    });
  });

  describe("isSimulating", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should return false when stopped", async () => {
      expect(service.isSimulating()).toBe(false);
    });

    it("should return true when running", async () => {
      const track = createTestTrack();
      await service.startSimulation(track);

      expect(service.isSimulating()).toBe(true);
    });

    it("should return true when paused", async () => {
      const track = createTestTrack();
      await service.startSimulation(track);
      await service.pauseSimulation();

      expect(service.isSimulating()).toBe(true);
    });

    it("should return false after stop", async () => {
      const track = createTestTrack();
      await service.startSimulation(track);
      await service.stopSimulation();

      expect(service.isSimulating()).toBe(false);
    });
  });

  describe("callbacks", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    describe("onPositionUpdate", () => {
      it("should call callback on position update", async () => {
        const callback = jest.fn();
        service.onPositionUpdate(callback);

        const track = createTestTrack();
        await service.startSimulation(track);

        // Wait for position updates
        await wait(600);

        expect(callback).toHaveBeenCalled();
        const position = callback.mock.calls[0][0] as GPSCoordinate;
        expect(position.latitude).toBeDefined();
        expect(position.longitude).toBeDefined();
      });

      it("should return unsubscribe function", async () => {
        const callback = jest.fn();
        const unsubscribe = service.onPositionUpdate(callback);

        const track = createTestTrack();
        await service.startSimulation(track);

        // Unsubscribe
        unsubscribe();

        // Wait and verify no more calls
        const callCountBefore = callback.mock.calls.length;
        await wait(600);
        expect(callback.mock.calls.length).toBe(callCountBefore);
      });

      it("should provide speed in position update", async () => {
        const callback = jest.fn();
        service.onPositionUpdate(callback);

        const track = createTestTrack();
        await service.startSimulation(track, SimulationSpeed.BICYCLE);

        await wait(100);

        const position = callback.mock.calls[0][0] as GPSCoordinate;
        // Speed should be in m/s (20 km/h = ~5.56 m/s)
        expect(position.speed).toBeCloseTo(5.56, 1);
      });
    });

    describe("onStateChange", () => {
      it("should call callback on state change", async () => {
        const callback = jest.fn();
        service.onStateChange(callback);

        const track = createTestTrack();
        await service.startSimulation(track);

        expect(callback).toHaveBeenCalled();
        const status = callback.mock.calls[0][0] as SimulationStatus;
        expect(status.state).toBe(SimulationState.RUNNING);
      });

      it("should call callback on pause", async () => {
        const callback = jest.fn();
        service.onStateChange(callback);

        const track = createTestTrack();
        await service.startSimulation(track);
        callback.mockClear();

        await service.pauseSimulation();

        expect(callback).toHaveBeenCalled();
        const lastCall = callback.mock.calls[callback.mock.calls.length - 1];
        expect(lastCall[0].state).toBe(SimulationState.PAUSED);
      });

      it("should return unsubscribe function", async () => {
        const callback = jest.fn();
        const unsubscribe = service.onStateChange(callback);

        unsubscribe();

        const track = createTestTrack();
        await service.startSimulation(track);

        expect(callback).not.toHaveBeenCalled();
      });
    });

    describe("onSimulationComplete", () => {
      it("should call callback when simulation completes", async () => {
        const callback = jest.fn();
        service.onSimulationComplete(callback);

        // Create very short track with close points (~11m total)
        const track: GPXTrack = {
          name: "Short Track",
          segments: [
            {
              points: [
                { latitude: 37.0, longitude: -122.0, timestamp: new Date() },
                { latitude: 37.0001, longitude: -122.0, timestamp: new Date() }, // ~11m
              ],
            },
          ],
        };

        // At 200 km/h = ~55 m/s, 11m takes ~0.2 seconds
        await service.startSimulation(track, 200);

        // Wait long enough for updates (500ms interval) + completion
        await wait(3000);

        expect(callback).toHaveBeenCalled();
      }, 10000);

      it("should return unsubscribe function", async () => {
        const callback = jest.fn();
        const unsubscribe = service.onSimulationComplete(callback);

        unsubscribe();

        const track: GPXTrack = {
          name: "Short Track",
          segments: [
            {
              points: [
                { latitude: 37.0, longitude: -122.0, timestamp: new Date() },
                { latitude: 37.0001, longitude: -122.0, timestamp: new Date() },
              ],
            },
          ],
        };

        await service.startSimulation(track, 200);
        await wait(3000);

        expect(callback).not.toHaveBeenCalled();
      }, 10000);
    });
  });

  describe("dispose", () => {
    it("should stop simulation on dispose", async () => {
      await service.initialize();
      const track = createTestTrack();
      await service.startSimulation(track);

      await service.dispose();

      expect(service.isSimulating()).toBe(false);
    });

    it("should clear all callbacks on dispose", async () => {
      await service.initialize();
      const positionCallback = jest.fn();
      const stateCallback = jest.fn();
      const completeCallback = jest.fn();

      service.onPositionUpdate(positionCallback);
      service.onStateChange(stateCallback);
      service.onSimulationComplete(completeCallback);

      await service.dispose();

      // Create new service and start simulation
      const newService = new TrackSimulationService();
      await newService.initialize();
      const track = createTestTrack();
      await newService.startSimulation(track);

      await wait(100);

      // Old callbacks should not be called
      expect(positionCallback).not.toHaveBeenCalled();

      await newService.dispose();
    });
  });

  describe("edge cases", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should handle track with duplicate points", async () => {
      const track: GPXTrack = {
        name: "Duplicate Points Track",
        segments: [
          {
            points: [
              { latitude: 37.7749, longitude: -122.4194, timestamp: new Date() },
              { latitude: 37.7749, longitude: -122.4194, timestamp: new Date() }, // Same point
              { latitude: 37.7759, longitude: -122.4184, timestamp: new Date() },
            ],
          },
        ],
      };

      const result = await service.startSimulation(track);
      expect(result.success).toBe(true);
    });

    it("should handle very long track", async () => {
      const track = createTestTrack(1000);
      const result = await service.startSimulation(track);

      expect(result.success).toBe(true);
      expect(service.getStatus().totalPoints).toBe(1000);
    });

    it("should calculate bearing correctly", async () => {
      const callback = jest.fn();
      service.onPositionUpdate(callback);

      const track: GPXTrack = {
        name: "North-South Track",
        segments: [
          {
            points: [
              { latitude: 37.0, longitude: -122.0, timestamp: new Date() },
              { latitude: 38.0, longitude: -122.0, timestamp: new Date() }, // Due north
            ],
          },
        ],
      };

      await service.startSimulation(track, 50);
      await wait(600);

      const position = callback.mock.calls[callback.mock.calls.length - 1][0] as GPSCoordinate;
      // Bearing should be approximately 0 (north)
      expect(position.bearing).toBeDefined();
      expect(position.bearing).toBeCloseTo(0, 0);
    });

    it("should handle altitude data", async () => {
      const callback = jest.fn();
      service.onPositionUpdate(callback);

      const track = createTestTrack(5);
      await service.startSimulation(track);
      await wait(100);

      const position = callback.mock.calls[0][0] as GPSCoordinate;
      expect(position.altitude).toBeDefined();
    });
  });
});
