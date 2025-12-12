/* eslint-disable @typescript-eslint/no-explicit-any */
import { GPSCoordinator } from "@services/orchestrator/GPSCoordinator";
import { GPSCoordinate } from "@core/types";
import {
  GPS_DEFAULT_DEBOUNCE_MS,
  GPS_DEFAULT_DISTANCE_THRESHOLD_METERS,
} from "@core/constants";

describe("GPSCoordinator", () => {
  let coordinator: GPSCoordinator;
  let mockGPSService: any;
  let mockSimulationService: any;
  let mockDriveNavigationService: any;
  let mockOnboardingCoordinator: any;
  let positionCallback: ((position: GPSCoordinate) => void) | null = null;

  const testPosition: GPSCoordinate = {
    latitude: 37.7749,
    longitude: -122.4194,
    timestamp: new Date(),
  };

  beforeEach(() => {
    positionCallback = null;

    mockGPSService = {
      onPositionUpdate: jest.fn((callback: (pos: GPSCoordinate) => void) => {
        positionCallback = callback;
        return () => {
          positionCallback = null;
        };
      }),
      onStatusChange: jest.fn().mockReturnValue(() => {}),
      getCurrentPosition: jest
        .fn()
        .mockResolvedValue({ success: true, data: testPosition }),
    };

    mockSimulationService = {
      isSimulating: jest.fn().mockReturnValue(false),
    };

    mockDriveNavigationService = {
      isNavigating: jest.fn().mockReturnValue(false),
      updatePosition: jest.fn(),
    };

    mockOnboardingCoordinator = {
      updateGPSPosition: jest.fn(),
      updateGPSStatus: jest.fn(),
    };

    coordinator = new GPSCoordinator(
      mockGPSService,
      mockSimulationService,
      mockDriveNavigationService,
      mockOnboardingCoordinator,
    );
  });

  afterEach(() => {
    coordinator.dispose();
  });

  describe("initialization", () => {
    it("should initialize with default debounce configuration", () => {
      const config = coordinator.getDebounceConfig();
      expect(config.enabled).toBe(true);
      expect(config.debounceMs).toBe(GPS_DEFAULT_DEBOUNCE_MS);
      expect(config.distanceThresholdMeters).toBe(
        GPS_DEFAULT_DISTANCE_THRESHOLD_METERS,
      );
    });

    it("should accept custom debounce configuration", () => {
      const customCoordinator = new GPSCoordinator(
        mockGPSService,
        null,
        null,
        null,
        { enabled: false, debounceMs: 1000, distanceThresholdMeters: 5 },
      );

      const config = customCoordinator.getDebounceConfig();
      expect(config.enabled).toBe(false);
      expect(config.debounceMs).toBe(1000);
      expect(config.distanceThresholdMeters).toBe(5);

      customCoordinator.dispose();
    });

    it("should merge partial debounce configuration with defaults", () => {
      const customCoordinator = new GPSCoordinator(
        mockGPSService,
        null,
        null,
        null,
        { debounceMs: 200 }, // Only specify debounceMs
      );

      const config = customCoordinator.getDebounceConfig();
      expect(config.enabled).toBe(true); // Default
      expect(config.debounceMs).toBe(200); // Custom
      expect(config.distanceThresholdMeters).toBe(
        GPS_DEFAULT_DISTANCE_THRESHOLD_METERS,
      ); // Default

      customCoordinator.dispose();
    });
  });

  describe("debounce configuration", () => {
    it("should update debounce configuration", () => {
      coordinator.setDebounceConfig({ debounceMs: 1000 });
      const config = coordinator.getDebounceConfig();
      expect(config.debounceMs).toBe(1000);
      expect(config.enabled).toBe(true); // Unchanged
    });

    it("should disable debouncing", () => {
      coordinator.setDebounceConfig({ enabled: false });
      const config = coordinator.getDebounceConfig();
      expect(config.enabled).toBe(false);
    });

    it("should update distance threshold", () => {
      coordinator.setDebounceConfig({ distanceThresholdMeters: 10 });
      const config = coordinator.getDebounceConfig();
      expect(config.distanceThresholdMeters).toBe(10);
    });
  });

  describe("time-based debouncing", () => {
    beforeEach(() => {
      // Enable debouncing with only time-based threshold
      coordinator.setDebounceConfig({
        enabled: true,
        debounceMs: 100,
        distanceThresholdMeters: 0, // Disable distance threshold
      });
      coordinator.subscribeToGPSUpdates();
    });

    it("should notify first update immediately", () => {
      const callback = jest.fn();
      coordinator.onGPSUpdate(callback);

      positionCallback!(testPosition);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(testPosition);
    });

    it("should skip updates within debounce window", () => {
      const callback = jest.fn();
      coordinator.onGPSUpdate(callback);

      // First update
      positionCallback!(testPosition);
      expect(callback).toHaveBeenCalledTimes(1);

      // Second update immediately after - should be skipped
      const position2: GPSCoordinate = {
        ...testPosition,
        latitude: testPosition.latitude + 0.0001, // Small change
      };
      positionCallback!(position2);
      expect(callback).toHaveBeenCalledTimes(1); // Still 1
    });

    it("should notify updates after debounce window expires", async () => {
      const callback = jest.fn();
      coordinator.onGPSUpdate(callback);

      // First update
      positionCallback!(testPosition);
      expect(callback).toHaveBeenCalledTimes(1);

      // Wait for debounce window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Second update after debounce window
      const position2: GPSCoordinate = {
        ...testPosition,
        latitude: testPosition.latitude + 0.0001,
      };
      positionCallback!(position2);
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe("distance-based throttling", () => {
    beforeEach(() => {
      // Enable debouncing with only distance-based threshold
      coordinator.setDebounceConfig({
        enabled: true,
        debounceMs: 60000, // Very long debounce time
        distanceThresholdMeters: 10, // 10 meter threshold
      });
      coordinator.subscribeToGPSUpdates();
    });

    it("should trigger update when distance threshold exceeded", () => {
      const callback = jest.fn();
      coordinator.onGPSUpdate(callback);

      // First update
      positionCallback!(testPosition);
      expect(callback).toHaveBeenCalledTimes(1);

      // Move position by ~111 meters (1 degree latitude ≈ 111km, so 0.001 ≈ 111m)
      const position2: GPSCoordinate = {
        ...testPosition,
        latitude: testPosition.latitude + 0.001,
      };
      positionCallback!(position2);
      expect(callback).toHaveBeenCalledTimes(2); // Should trigger due to distance
    });

    it("should skip updates below distance threshold", () => {
      const callback = jest.fn();
      coordinator.onGPSUpdate(callback);

      // First update
      positionCallback!(testPosition);
      expect(callback).toHaveBeenCalledTimes(1);

      // Move position by ~1 meter (very small change)
      const position2: GPSCoordinate = {
        ...testPosition,
        latitude: testPosition.latitude + 0.00001, // ~1.1 meters
      };
      positionCallback!(position2);
      expect(callback).toHaveBeenCalledTimes(1); // Should NOT trigger
    });
  });

  describe("combined time and distance thresholds", () => {
    beforeEach(() => {
      coordinator.setDebounceConfig({
        enabled: true,
        debounceMs: 100,
        distanceThresholdMeters: 50,
      });
      coordinator.subscribeToGPSUpdates();
    });

    it("should trigger on time threshold even with small movement", async () => {
      const callback = jest.fn();
      coordinator.onGPSUpdate(callback);

      positionCallback!(testPosition);
      expect(callback).toHaveBeenCalledTimes(1);

      await new Promise((resolve) => setTimeout(resolve, 150));

      // Small movement but time expired
      const position2: GPSCoordinate = {
        ...testPosition,
        latitude: testPosition.latitude + 0.00001,
      };
      positionCallback!(position2);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it("should trigger on distance threshold even within time window", () => {
      const callback = jest.fn();
      coordinator.onGPSUpdate(callback);

      positionCallback!(testPosition);
      expect(callback).toHaveBeenCalledTimes(1);

      // Large movement within time window
      const position2: GPSCoordinate = {
        ...testPosition,
        latitude: testPosition.latitude + 0.001, // ~111 meters
      };
      positionCallback!(position2);
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe("debouncing disabled", () => {
    beforeEach(() => {
      coordinator.setDebounceConfig({ enabled: false });
      coordinator.subscribeToGPSUpdates();
    });

    it("should pass through all updates when disabled", () => {
      const callback = jest.fn();
      coordinator.onGPSUpdate(callback);

      // Rapid-fire updates
      for (let i = 0; i < 5; i++) {
        const position: GPSCoordinate = {
          ...testPosition,
          latitude: testPosition.latitude + i * 0.00001,
        };
        positionCallback!(position);
      }

      expect(callback).toHaveBeenCalledTimes(5);
    });
  });

  describe("debounce statistics", () => {
    beforeEach(() => {
      coordinator.setDebounceConfig({
        enabled: true,
        debounceMs: 100,
        distanceThresholdMeters: 50,
      });
      coordinator.subscribeToGPSUpdates();
    });

    it("should track total and notified updates", () => {
      coordinator.onGPSUpdate(() => {});

      // First update - notified
      positionCallback!(testPosition);

      // Second update - skipped (within debounce window)
      positionCallback!(testPosition);

      const stats = coordinator.getDebounceStats();
      expect(stats.totalUpdates).toBe(2);
      expect(stats.notifiedUpdates).toBe(1);
    });

    it("should track distance-triggered updates", () => {
      coordinator.onGPSUpdate(() => {});

      positionCallback!(testPosition);

      // Large movement - should trigger by distance
      const farPosition: GPSCoordinate = {
        ...testPosition,
        latitude: testPosition.latitude + 0.001, // ~111 meters
      };
      positionCallback!(farPosition);

      const stats = coordinator.getDebounceStats();
      expect(stats.triggeredByDistance).toBe(1);
    });

    it("should calculate hit rate", () => {
      coordinator.onGPSUpdate(() => {});

      positionCallback!(testPosition);
      positionCallback!(testPosition); // Skipped
      positionCallback!(testPosition); // Skipped

      const stats = coordinator.getDebounceStats();
      expect(stats.hitRate).toBeCloseTo(0.33, 1);
    });

    it("should reset statistics", () => {
      coordinator.onGPSUpdate(() => {});

      positionCallback!(testPosition);
      positionCallback!(testPosition);

      coordinator.resetDebounceStats();
      const stats = coordinator.getDebounceStats();
      expect(stats.totalUpdates).toBe(0);
      expect(stats.notifiedUpdates).toBe(0);
      expect(stats.hitRate).toBe(1); // 0/0 defaults to 1
    });
  });

  describe("debounce state reset", () => {
    beforeEach(() => {
      coordinator.setDebounceConfig({
        enabled: true,
        debounceMs: 60000, // Very long debounce
        distanceThresholdMeters: 1000, // Very high threshold
      });
      coordinator.subscribeToGPSUpdates();
    });

    it("should force next update after state reset", () => {
      const callback = jest.fn();
      coordinator.onGPSUpdate(callback);

      positionCallback!(testPosition);
      expect(callback).toHaveBeenCalledTimes(1);

      // Normally this would be skipped
      positionCallback!(testPosition);
      expect(callback).toHaveBeenCalledTimes(1);

      // Reset state
      coordinator.resetDebounceState();

      // Now it should notify
      positionCallback!(testPosition);
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe("GPS update forwarding", () => {
    beforeEach(() => {
      coordinator.setDebounceConfig({ enabled: false }); // Disable debouncing for clarity
      coordinator.subscribeToGPSUpdates();
    });

    it("should forward updates to onboarding coordinator", () => {
      positionCallback!(testPosition);
      expect(mockOnboardingCoordinator.updateGPSPosition).toHaveBeenCalledWith(
        testPosition,
      );
    });

    it("should forward updates to drive navigation when navigating", () => {
      mockDriveNavigationService.isNavigating.mockReturnValue(true);
      positionCallback!(testPosition);
      expect(mockDriveNavigationService.updatePosition).toHaveBeenCalledWith(
        testPosition,
      );
    });

    it("should skip updates during simulation", () => {
      const callback = jest.fn();
      coordinator.onGPSUpdate(callback);

      mockSimulationService.isSimulating.mockReturnValue(true);
      positionCallback!(testPosition);

      expect(callback).not.toHaveBeenCalled();
    });

    it("should skip invalid (0,0) positions during navigation", () => {
      const callback = jest.fn();
      coordinator.onGPSUpdate(callback);

      mockDriveNavigationService.isNavigating.mockReturnValue(true);
      const invalidPosition: GPSCoordinate = {
        latitude: 0,
        longitude: 0,
        timestamp: new Date(),
      };
      positionCallback!(invalidPosition);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("callback error handling", () => {
    beforeEach(() => {
      coordinator.setDebounceConfig({ enabled: false });
      coordinator.subscribeToGPSUpdates();
    });

    it("should continue notifying other callbacks after one throws", () => {
      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error("Test error");
      });
      const successCallback = jest.fn();

      coordinator.onGPSUpdate(errorCallback);
      coordinator.onGPSUpdate(successCallback);

      positionCallback!(testPosition);

      expect(errorCallback).toHaveBeenCalled();
      expect(successCallback).toHaveBeenCalled(); // Should still be called
    });

    it("should report errors to error callback", () => {
      const errorReporter = jest.fn();
      coordinator.setErrorCallback(errorReporter);

      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error("Test error");
      });
      coordinator.onGPSUpdate(errorCallback);

      positionCallback!(testPosition);

      expect(errorReporter).toHaveBeenCalled();
    });
  });

  describe("callback management", () => {
    it("should support unsubscribing from GPS updates", () => {
      coordinator.setDebounceConfig({ enabled: false });
      coordinator.subscribeToGPSUpdates();

      const callback = jest.fn();
      const unsubscribe = coordinator.onGPSUpdate(callback);

      positionCallback!(testPosition);
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      positionCallback!(testPosition);
      expect(callback).toHaveBeenCalledTimes(1); // Still 1
    });

    it("should track callback counts", () => {
      expect(coordinator.getGPSUpdateCallbackCount()).toBe(0);

      const unsub1 = coordinator.onGPSUpdate(() => {});
      expect(coordinator.getGPSUpdateCallbackCount()).toBe(1);

      const unsub2 = coordinator.onGPSUpdate(() => {});
      expect(coordinator.getGPSUpdateCallbackCount()).toBe(2);

      unsub1();
      expect(coordinator.getGPSUpdateCallbackCount()).toBe(1);

      unsub2();
      expect(coordinator.getGPSUpdateCallbackCount()).toBe(0);
    });
  });

  describe("position storage", () => {
    beforeEach(() => {
      coordinator.setDebounceConfig({ enabled: false });
      coordinator.subscribeToGPSUpdates();
    });

    it("should store last GPS position", () => {
      expect(coordinator.getLastPosition()).toBeNull();

      positionCallback!(testPosition);

      expect(coordinator.getLastPosition()).toEqual(testPosition);
    });

    it("should update position via updatePosition method", () => {
      const newPosition: GPSCoordinate = {
        latitude: 40.7128,
        longitude: -74.006,
        timestamp: new Date(),
      };

      coordinator.updatePosition(newPosition);

      expect(coordinator.getLastPosition()).toEqual(newPosition);
    });
  });

  describe("dispose", () => {
    it("should clear all state on dispose", () => {
      coordinator.subscribeToGPSUpdates();
      coordinator.onGPSUpdate(() => {});
      coordinator.setDebounceConfig({ enabled: false });

      coordinator.dispose();

      expect(coordinator.getGPSUpdateCallbackCount()).toBe(0);
      expect(coordinator.getLastPosition()).toBeNull();
    });
  });
});
