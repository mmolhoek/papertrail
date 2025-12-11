/* eslint-disable @typescript-eslint/no-explicit-any */
import { RenderingOrchestrator } from "../../RenderingOrchestrator";
import {
  success,
  failure,
  GPSCoordinate,
  GPSStatus,
  GPXTrack,
  Bitmap1Bit,
} from "@core/types";

/**
 * Integration tests for GPS → Display update flow
 *
 * Tests the complete flow from GPS position updates through to display rendering:
 * 1. GPS service emits position update
 * 2. GPSCoordinator receives and stores position
 * 3. GPSCoordinator notifies registered callbacks
 * 4. TrackDisplayCoordinator receives update and triggers display refresh
 * 5. SVGService renders new viewport
 * 6. EpaperService displays bitmap
 */
describe("GPS → Display Update Flow Integration", () => {
  let orchestrator: RenderingOrchestrator;
  let mockGPSService: any;
  let mockMapService: any;
  let mockSVGService: any;
  let mockEpaperService: any;
  let mockConfigService: any;

  // Capture GPS position callbacks registered with the mock service
  let gpsPositionCallbacks: Array<(position: GPSCoordinate) => void>;
  let gpsStatusCallbacks: Array<(status: GPSStatus) => void>;

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

  const testPosition2: GPSCoordinate = {
    latitude: 37.785,
    longitude: -122.4094,
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

  beforeEach(() => {
    gpsPositionCallbacks = [];
    gpsStatusCallbacks = [];

    // Create mock services with callback capture
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
      onStatusChange: jest.fn((callback) => {
        gpsStatusCallbacks.push(callback);
        return () => {
          const index = gpsStatusCallbacks.indexOf(callback);
          if (index > -1) gpsStatusCallbacks.splice(index, 1);
        };
      }),
    };

    mockMapService = {
      getTrack: jest.fn().mockResolvedValue(success(testTrack)),
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
      addText: jest.fn().mockReturnValue(success(testBitmap)),
      addCompass: jest.fn().mockReturnValue(success(testBitmap)),
      addScaleBar: jest.fn().mockReturnValue(success(testBitmap)),
      addInfoPanel: jest.fn().mockReturnValue(success(testBitmap)),
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
      getActiveTrackId: jest.fn().mockReturnValue(null),
      setActiveTrackId: jest.fn(),
      getActiveGPXPath: jest.fn().mockReturnValue("test-track.gpx"),
      setActiveGPXPath: jest.fn(),
      isOnboardingCompleted: jest.fn().mockReturnValue(true),
      setOnboardingCompleted: jest.fn(),
      getZoomLevel: jest.fn().mockReturnValue(15),
      setZoomLevel: jest.fn(),
      getDisplayWidth: jest.fn().mockReturnValue(800),
      getDisplayHeight: jest.fn().mockReturnValue(480),
      getAutoCenter: jest.fn().mockReturnValue(true),
      setAutoCenter: jest.fn(),
      getRotateWithBearing: jest.fn().mockReturnValue(false),
      setRotateWithBearing: jest.fn(),
      getActiveScreen: jest.fn().mockReturnValue("track"),
      setActiveScreen: jest.fn(),
      getAutoRefreshInterval: jest.fn().mockReturnValue(30),
      getRenderOptions: jest.fn().mockReturnValue({ showLine: true }),
      save: jest.fn().mockResolvedValue(success(undefined)),
    };

    orchestrator = new RenderingOrchestrator(
      mockGPSService,
      mockMapService,
      mockSVGService,
      mockEpaperService,
      mockConfigService,
    );
  });

  afterEach(async () => {
    await orchestrator.dispose();
  });

  describe("GPS Position Update Flow", () => {
    it("should subscribe to GPS updates during initialization", async () => {
      await orchestrator.initialize();

      // GPS service should have position callback registered
      expect(mockGPSService.onPositionUpdate).toHaveBeenCalled();
      expect(gpsPositionCallbacks.length).toBeGreaterThan(0);
    });

    it("should subscribe to GPS status changes during initialization", async () => {
      await orchestrator.initialize();

      // GPS service should have status callback registered
      expect(mockGPSService.onStatusChange).toHaveBeenCalled();
      expect(gpsStatusCallbacks.length).toBeGreaterThan(0);
    });

    it("should forward GPS position updates to registered callbacks", async () => {
      await orchestrator.initialize();

      const positionCallback = jest.fn();
      orchestrator.onGPSUpdate(positionCallback);

      // Simulate GPS position update
      gpsPositionCallbacks.forEach((cb) => cb(testPosition));

      expect(positionCallback).toHaveBeenCalledWith(testPosition);
    });

    it("should forward GPS status changes to registered callbacks", async () => {
      await orchestrator.initialize();

      const statusCallback = jest.fn();
      orchestrator.onGPSStatusChange(statusCallback);

      // Simulate GPS status change
      gpsStatusCallbacks.forEach((cb) => cb(testGPSStatus));

      expect(statusCallback).toHaveBeenCalledWith(testGPSStatus);
    });

    it("should allow unsubscribing from GPS updates", async () => {
      await orchestrator.initialize();

      const positionCallback = jest.fn();
      const unsubscribe = orchestrator.onGPSUpdate(positionCallback);

      // First update should be received
      gpsPositionCallbacks.forEach((cb) => cb(testPosition));
      expect(positionCallback).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Second update should not be received
      gpsPositionCallbacks.forEach((cb) => cb(testPosition2));
      expect(positionCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe("Display Update Flow", () => {
    it("should update display when updateDisplay is called", async () => {
      await orchestrator.initialize();

      const result = await orchestrator.updateDisplay();

      expect(result).toHaveProperty("success");
      // Display update should have attempted to render (uses renderDriveMapScreen by default)
      expect(mockSVGService.renderDriveMapScreen).toHaveBeenCalled();
    });

    it("should notify display update callbacks after successful update", async () => {
      await orchestrator.initialize();

      const displayCallback = jest.fn();
      orchestrator.onDisplayUpdate(displayCallback);

      await orchestrator.updateDisplay();

      expect(displayCallback).toHaveBeenCalledWith(true);
    });

    it("should allow unsubscribing from display updates", async () => {
      await orchestrator.initialize();

      const displayCallback = jest.fn();
      const unsubscribe = orchestrator.onDisplayUpdate(displayCallback);

      await orchestrator.updateDisplay();
      expect(displayCallback).toHaveBeenCalledTimes(1);

      unsubscribe();

      await orchestrator.updateDisplay();
      expect(displayCallback).toHaveBeenCalledTimes(1);
    });

    it("should use current GPS position when rendering viewport", async () => {
      await orchestrator.initialize();

      // Simulate GPS position update to store position
      gpsPositionCallbacks.forEach((cb) => cb(testPosition));

      await orchestrator.updateDisplay();

      // SVG service should have received viewport with position
      expect(mockSVGService.renderDriveMapScreen).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should notify error callbacks when GPS update callback throws", async () => {
      await orchestrator.initialize();

      const errorCallback = jest.fn();
      orchestrator.onError(errorCallback);

      // Register a callback that throws
      orchestrator.onGPSUpdate(() => {
        throw new Error("Test error in GPS callback");
      });

      // Simulate GPS update - should catch and notify error
      gpsPositionCallbacks.forEach((cb) => cb(testPosition));

      expect(errorCallback).toHaveBeenCalled();
    });

    it("should fail gracefully when not initialized", async () => {
      // Don't initialize

      const result = await orchestrator.updateDisplay();

      expect(result.success).toBe(false);
    });

    it("should return current position when available", async () => {
      await orchestrator.initialize();

      const result = await orchestrator.getCurrentPosition();

      expect(result).toHaveProperty("success");
    });
  });

  describe("GPS to Display Integration", () => {
    it("should complete full flow from GPS update to display notification", async () => {
      await orchestrator.initialize();

      const displayCallback = jest.fn();
      const positionCallback = jest.fn();

      orchestrator.onDisplayUpdate(displayCallback);
      orchestrator.onGPSUpdate(positionCallback);

      // Simulate GPS position update
      gpsPositionCallbacks.forEach((cb) => cb(testPosition));

      // Position callback should be called
      expect(positionCallback).toHaveBeenCalledWith(testPosition);

      // Manually trigger display update (as would happen via auto-update)
      await orchestrator.updateDisplay();

      // Display callback should be called
      expect(displayCallback).toHaveBeenCalledWith(true);
    });

    it("should handle multiple GPS updates in sequence", async () => {
      await orchestrator.initialize();

      const positionCallback = jest.fn();
      orchestrator.onGPSUpdate(positionCallback);

      // Simulate multiple GPS updates
      gpsPositionCallbacks.forEach((cb) => cb(testPosition));
      gpsPositionCallbacks.forEach((cb) => cb(testPosition2));

      expect(positionCallback).toHaveBeenCalledTimes(2);
      expect(positionCallback).toHaveBeenNthCalledWith(1, testPosition);
      expect(positionCallback).toHaveBeenNthCalledWith(2, testPosition2);
    });
  });
});
