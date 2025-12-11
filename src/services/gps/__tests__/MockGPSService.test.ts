import { MockGPSService } from "@services/gps/MockGPSService";
import { GPSFixQuality, GPSCoordinate } from "@core/types/GPSTypes";
import { GPSError } from "@core/errors";

describe("MockGPSService", () => {
  let mockGPSService: MockGPSService;

  beforeEach(() => {
    mockGPSService = new MockGPSService({
      devicePath: "/dev/ttyAMA0",
      baudRate: 9600,
      updateInterval: 100, // Faster for testing
      minAccuracy: 10,
    });
  });

  afterEach(async () => {
    await mockGPSService.dispose();
  });

  describe("initialization", () => {
    it("should initialize successfully", async () => {
      const result = await mockGPSService.initialize();

      expect(result.success).toBe(true);
    });

    it("should set initial position on initialization", async () => {
      await mockGPSService.initialize();
      const positionResult = await mockGPSService.getCurrentPosition();

      expect(positionResult.success).toBe(true);
      if (positionResult.success) {
        expect(positionResult.data).toHaveProperty("latitude");
        expect(positionResult.data).toHaveProperty("longitude");
        expect(positionResult.data).toHaveProperty("timestamp");
        expect(typeof positionResult.data.latitude).toBe("number");
        expect(typeof positionResult.data.longitude).toBe("number");
      }
    });

    it("should not reinitialize if already initialized", async () => {
      await mockGPSService.initialize();
      const result = await mockGPSService.initialize();

      expect(result.success).toBe(true);
    });
  });

  describe("getCurrentPosition", () => {
    it("should return error if not initialized", async () => {
      const result = await mockGPSService.getCurrentPosition();

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as GPSError;
        expect(error.code).toBe("GPS_DEVICE_NOT_INITIALIZED");
      }
    });

    it("should return current position after initialization", async () => {
      await mockGPSService.initialize();
      const result = await mockGPSService.getCurrentPosition();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.latitude).toBeCloseTo(37.7749, 1); // San Francisco
        expect(result.data.longitude).toBeCloseTo(-122.4194, 1);
        expect(result.data.timestamp).toBeInstanceOf(Date);
      }
    });
  });

  describe("getStatus", () => {
    it("should return error if not initialized", async () => {
      const result = await mockGPSService.getStatus();

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as GPSError;
        expect(error.code).toBe("GPS_DEVICE_NOT_INITIALIZED");
      }
    });

    it("should return GPS status after initialization", async () => {
      await mockGPSService.initialize();
      const result = await mockGPSService.getStatus();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fixQuality).toBe(GPSFixQuality.GPS_FIX);
        expect(result.data.satellitesInUse).toBeGreaterThanOrEqual(8);
        expect(result.data.satellitesInUse).toBeLessThanOrEqual(15);
        expect(result.data.hdop).toBeGreaterThan(0);
        expect(result.data.isTracking).toBe(false);
      }
    });
  });

  describe("tracking", () => {
    beforeEach(async () => {
      await mockGPSService.initialize();
    });

    it("should start tracking successfully", async () => {
      const result = await mockGPSService.startTracking();

      expect(result.success).toBe(true);
      expect(mockGPSService.isTracking()).toBe(true);
    });

    it("should return error if trying to start tracking when already tracking", async () => {
      await mockGPSService.startTracking();
      const result = await mockGPSService.startTracking();

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as GPSError;
        expect(error.code).toBe("GPS_ALREADY_TRACKING");
      }
    });

    it("should stop tracking successfully", async () => {
      await mockGPSService.startTracking();
      const result = await mockGPSService.stopTracking();

      expect(result.success).toBe(true);
      expect(mockGPSService.isTracking()).toBe(false);
    });

    it("should return error if trying to stop tracking when not tracking", async () => {
      const result = await mockGPSService.stopTracking();

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as GPSError;
        expect(error.code).toBe("GPS_NOT_TRACKING");
      }
    });

    it("should update status isTracking when starting tracking", async () => {
      await mockGPSService.startTracking();
      const statusResult = await mockGPSService.getStatus();

      expect(statusResult.success).toBe(true);
      if (statusResult.success) {
        expect(statusResult.data.isTracking).toBe(true);
      }
    });

    it("should update status isTracking when stopping tracking", async () => {
      await mockGPSService.startTracking();
      await mockGPSService.stopTracking();
      const statusResult = await mockGPSService.getStatus();

      expect(statusResult.success).toBe(true);
      if (statusResult.success) {
        expect(statusResult.data.isTracking).toBe(false);
      }
    });
  });

  describe("waitForFix", () => {
    it("should return error if not initialized", async () => {
      const result = await mockGPSService.waitForFix(1000);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as GPSError;
        expect(error.code).toBe("GPS_DEVICE_NOT_INITIALIZED");
      }
    });

    it("should return position quickly when initialized", async () => {
      await mockGPSService.initialize();
      const result = await mockGPSService.waitForFix(2000);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("latitude");
        expect(result.data).toHaveProperty("longitude");
      }
    });
  });

  describe("callbacks", () => {
    beforeEach(async () => {
      await mockGPSService.initialize();
    });

    it("should register position update callback", async () => {
      const callback = jest.fn();
      const unsubscribe = mockGPSService.onPositionUpdate(callback);

      expect(typeof unsubscribe).toBe("function");
    });

    it("should call position update callback when tracking", async () => {
      const callback = jest.fn();
      mockGPSService.onPositionUpdate(callback);

      await mockGPSService.startTracking();

      // Wait for at least one update (update interval is 100ms in tests)
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0]).toHaveProperty("latitude");
      expect(callback.mock.calls[0][0]).toHaveProperty("longitude");
    });

    it("should unsubscribe position update callback", async () => {
      const callback = jest.fn();
      const unsubscribe = mockGPSService.onPositionUpdate(callback);

      await mockGPSService.startTracking();
      await new Promise((resolve) => setTimeout(resolve, 150));

      const callCountBefore = callback.mock.calls.length;
      unsubscribe();

      await new Promise((resolve) => setTimeout(resolve, 150));
      const callCountAfter = callback.mock.calls.length;

      // After unsubscribe, no new calls should be made
      expect(callCountAfter).toBe(callCountBefore);
    });

    it("should register status change callback", async () => {
      const callback = jest.fn();
      const unsubscribe = mockGPSService.onStatusChange(callback);

      expect(typeof unsubscribe).toBe("function");
    });

    it("should call status change callback when tracking starts", async () => {
      const callback = jest.fn();
      mockGPSService.onStatusChange(callback);

      await mockGPSService.startTracking();

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0]).toHaveProperty("isTracking", true);
    });

    it("should unsubscribe status change callback", async () => {
      const callback = jest.fn();
      const unsubscribe = mockGPSService.onStatusChange(callback);

      await mockGPSService.startTracking();
      callback.mockClear();

      unsubscribe();
      await mockGPSService.stopTracking();

      // After unsubscribe, callback should not be called
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("position simulation", () => {
    beforeEach(async () => {
      await mockGPSService.initialize();
    });

    it("should generate varying positions during tracking", async () => {
      const positions: GPSCoordinate[] = [];
      mockGPSService.onPositionUpdate((pos) => positions.push(pos));

      await mockGPSService.startTracking();

      // Collect multiple position updates
      await new Promise((resolve) => setTimeout(resolve, 350));
      await mockGPSService.stopTracking();

      expect(positions.length).toBeGreaterThan(1);

      // Check that positions vary slightly (simulate movement)
      if (positions.length >= 2) {
        const firstPos = positions[0];
        const lastPos = positions[positions.length - 1];

        // Positions should be different but close to each other
        expect(firstPos.latitude).not.toBe(lastPos.latitude);
        expect(Math.abs(firstPos.latitude - lastPos.latitude)).toBeLessThan(
          0.01,
        );
      }
    });
  });

  describe("dispose", () => {
    it("should stop tracking when disposing", async () => {
      await mockGPSService.initialize();
      await mockGPSService.startTracking();

      expect(mockGPSService.isTracking()).toBe(true);

      await mockGPSService.dispose();

      expect(mockGPSService.isTracking()).toBe(false);
    });

    it("should clear callbacks when disposing", async () => {
      await mockGPSService.initialize();

      const posCallback = jest.fn();
      const statusCallback = jest.fn();

      mockGPSService.onPositionUpdate(posCallback);
      mockGPSService.onStatusChange(statusCallback);

      await mockGPSService.dispose();

      // Re-initialize for testing
      await mockGPSService.initialize();
      await mockGPSService.startTracking();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Old callbacks should not be called
      expect(posCallback).not.toHaveBeenCalled();
      expect(statusCallback).not.toHaveBeenCalled();
    });
  });

  describe("error handling in callbacks", () => {
    beforeEach(async () => {
      await mockGPSService.initialize();
    });

    it("should handle errors in position callbacks gracefully", async () => {
      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error("Callback error");
      });
      const normalCallback = jest.fn();

      mockGPSService.onPositionUpdate(errorCallback);
      mockGPSService.onPositionUpdate(normalCallback);

      await mockGPSService.startTracking();

      // Wait for at least one update
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Both callbacks should have been attempted
      expect(errorCallback).toHaveBeenCalled();
      // Normal callback should still be called despite error in first callback
      expect(normalCallback).toHaveBeenCalled();
    });

    it("should handle errors in status callbacks gracefully", async () => {
      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error("Status callback error");
      });
      const normalCallback = jest.fn();

      mockGPSService.onStatusChange(errorCallback);
      mockGPSService.onStatusChange(normalCallback);

      await mockGPSService.startTracking();

      // Both callbacks should have been attempted
      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();
    });

    it("should handle non-Error objects thrown in callbacks", async () => {
      const errorCallback = jest.fn().mockImplementation(() => {
        throw "string error";
      });

      mockGPSService.onPositionUpdate(errorCallback);

      await mockGPSService.startTracking();
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(errorCallback).toHaveBeenCalled();
    });
  });

  describe("startTracking when not initialized", () => {
    it("should fail when starting tracking without initialization", async () => {
      const result = await mockGPSService.startTracking();

      expect(result.success).toBe(false);
    });
  });
});
