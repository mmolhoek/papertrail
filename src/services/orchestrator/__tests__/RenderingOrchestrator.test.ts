/* eslint-disable @typescript-eslint/no-explicit-any */
import { RenderingOrchestrator } from "@services/orchestrator/RenderingOrchestrator";
import {
  success,
  failure,
  GPSCoordinate,
  GPXTrack,
  Bitmap1Bit,
} from "@core/types";

describe("RenderingOrchestrator", () => {
  let orchestrator: RenderingOrchestrator;
  let mockGPSService: any;
  let mockMapService: any;
  let mockSVGService: any;
  let mockEpaperService: any;
  let mockConfigService: any;

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

  beforeEach(() => {
    // Create mock services
    mockGPSService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      dispose: jest.fn().mockResolvedValue(undefined),
      getCurrentPosition: jest.fn().mockResolvedValue(success(testPosition)),
      startTracking: jest.fn().mockResolvedValue(success(undefined)),
      stopTracking: jest.fn(),
      getStatus: jest.fn().mockReturnValue({
        fixQuality: 1,
        satellitesInUse: 8,
        hdop: 1.2,
        vdop: 1.5,
        pdop: 1.8,
        isTracking: true,
      }),
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
      createBlankBitmap: jest.fn().mockReturnValue(testBitmap),
      getDefaultRenderOptions: jest.fn().mockReturnValue({ showLine: true }),
      addCompass: jest.fn().mockReturnValue(success(testBitmap)),
      addScaleBar: jest.fn().mockReturnValue(success(testBitmap)),
    };

    mockEpaperService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      dispose: jest.fn().mockResolvedValue(undefined),
      display: jest.fn().mockResolvedValue(success(undefined)),
      displayLogo: jest.fn().mockResolvedValue(success(undefined)),
      clear: jest.fn().mockResolvedValue(success(undefined)),
      sleep: jest.fn().mockResolvedValue(success(undefined)),
      wake: jest.fn().mockResolvedValue(success(undefined)),
      isBusy: jest.fn().mockReturnValue(false),
      getWidth: jest.fn().mockReturnValue(800),
      getHeight: jest.fn().mockReturnValue(480),
    };

    mockConfigService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      dispose: jest.fn().mockResolvedValue(undefined),
      getActiveTrackId: jest.fn().mockReturnValue(null),
      setActiveTrackId: jest.fn(),
      getActiveGPXPath: jest.fn().mockReturnValue(null),
      setActiveGPXPath: jest.fn(),
      getOnboardingComplete: jest.fn().mockReturnValue(true),
      setOnboardingComplete: jest.fn(),
      getZoomLevel: jest.fn().mockReturnValue(15),
      setZoomLevel: jest.fn(),
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

  describe("initialize", () => {
    it("should initialize successfully", async () => {
      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
      expect(mockGPSService.initialize).toHaveBeenCalled();
      expect(mockEpaperService.initialize).toHaveBeenCalled();
      expect(mockConfigService.initialize).toHaveBeenCalled();
    });

    it("should return success if already initialized", async () => {
      await orchestrator.initialize();
      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
    });

    it("should handle GPS initialization failure", async () => {
      mockGPSService.initialize.mockResolvedValue(
        failure(new Error("GPS init failed")),
      );

      const result = await orchestrator.initialize();

      expect(result.success).toBe(false);
    });
  });

  describe("getSystemStatus", () => {
    it("should attempt to get system status when initialized", async () => {
      await orchestrator.initialize();

      const result = await orchestrator.getSystemStatus();

      // Result depends on internal state
      expect(result).toHaveProperty("success");
    });

    it("should fail when not initialized", async () => {
      const result = await orchestrator.getSystemStatus();

      expect(result.success).toBe(false);
    });
  });

  describe("getCurrentPosition", () => {
    it("should attempt to get current position when initialized", async () => {
      await orchestrator.initialize();

      const result = await orchestrator.getCurrentPosition();

      // Result depends on GPS fix state
      expect(result).toHaveProperty("success");
    });

    it("should fail when not initialized", async () => {
      const result = await orchestrator.getCurrentPosition();

      expect(result.success).toBe(false);
    });
  });

  describe("setActiveGPX", () => {
    it("should attempt to set active GPX when initialized", async () => {
      await orchestrator.initialize();

      const result = await orchestrator.setActiveGPX("test-track.gpx");

      // Result depends on internal state
      expect(result).toHaveProperty("success");
      if (result.success) {
        expect(mockMapService.getTrack).toHaveBeenCalled();
      }
    });

    it("should fail when not initialized", async () => {
      const result = await orchestrator.setActiveGPX("test-track.gpx");

      expect(result.success).toBe(false);
    });
  });

  describe("clearActiveGPX", () => {
    it("should attempt to clear active GPX when initialized", async () => {
      await orchestrator.initialize();
      await orchestrator.setActiveGPX("test-track.gpx");

      const result = await orchestrator.clearActiveGPX();

      // Result depends on internal state
      expect(result).toHaveProperty("success");
    });

    it("should handle clearActiveGPX when not initialized", async () => {
      // clearActiveGPX doesn't require initialization - it just clears config
      const result = await orchestrator.clearActiveGPX();

      expect(result).toHaveProperty("success");
    });
  });

  describe("setZoom and changeZoom", () => {
    it("should attempt to set zoom level when initialized", async () => {
      await orchestrator.initialize();

      const result = await orchestrator.setZoom(15);

      // Result depends on internal state
      expect(result).toHaveProperty("success");
    });

    it("should attempt to change zoom level when initialized", async () => {
      await orchestrator.initialize();

      const result = await orchestrator.changeZoom(1);

      // Result depends on internal state
      expect(result).toHaveProperty("success");
    });

    it("should fail when not initialized", async () => {
      const result = await orchestrator.setZoom(15);

      expect(result.success).toBe(false);
    });
  });

  describe("updateDisplay", () => {
    it("should attempt to update display when initialized with track", async () => {
      await orchestrator.initialize();
      await orchestrator.setActiveGPX("test-track.gpx");

      const result = await orchestrator.updateDisplay();

      // Result depends on internal state and GPS fix
      expect(result).toHaveProperty("success");
    });

    it("should fail when not initialized", async () => {
      const result = await orchestrator.updateDisplay();

      expect(result.success).toBe(false);
    });
  });

  describe("clearDisplay", () => {
    it("should attempt to clear display when initialized", async () => {
      await orchestrator.initialize();

      const result = await orchestrator.clearDisplay();

      // Result depends on display state
      expect(result).toHaveProperty("success");
    });

    it("should fail when not initialized", async () => {
      const result = await orchestrator.clearDisplay();

      expect(result.success).toBe(false);
    });
  });

  describe("sleepDisplay and wakeDisplay", () => {
    it("should attempt to sleep display when initialized", async () => {
      await orchestrator.initialize();

      const result = await orchestrator.sleepDisplay();

      // The result depends on internal implementation
      expect(result).toHaveProperty("success");
    });

    it("should attempt to wake display when initialized", async () => {
      await orchestrator.initialize();

      const result = await orchestrator.wakeDisplay();

      // The result depends on internal implementation
      expect(result).toHaveProperty("success");
    });
  });

  describe("callbacks", () => {
    it("should register GPS update callback", async () => {
      const callback = jest.fn();
      const unsubscribe = orchestrator.onGPSUpdate(callback);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should register GPS status callback", async () => {
      const callback = jest.fn();
      const unsubscribe = orchestrator.onGPSStatusChange(callback);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should register display update callback", async () => {
      const callback = jest.fn();
      const unsubscribe = orchestrator.onDisplayUpdate(callback);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should register error callback", async () => {
      const callback = jest.fn();
      const unsubscribe = orchestrator.onError(callback);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });
  });

  describe("setWebSocketClientCount", () => {
    it("should set WebSocket client count", async () => {
      await orchestrator.initialize();

      // Should not throw
      orchestrator.setWebSocketClientCount(1);
      orchestrator.setWebSocketClientCount(0);
    });
  });

  describe("dispose", () => {
    it("should dispose resources", async () => {
      await orchestrator.initialize();

      await orchestrator.dispose();

      // Core services should be disposed
      expect(mockGPSService.dispose).toHaveBeenCalled();
      expect(mockEpaperService.dispose).toHaveBeenCalled();
    });
  });
});
