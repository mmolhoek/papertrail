import { RenderingOrchestrator } from "../RenderingOrchestrator";
import {
  IGPSService,
  IMapService,
  ISVGService,
  IEpaperService,
  IConfigService,
} from "@core/interfaces";
import {
  GPSCoordinate,
  GPSStatus,
  GPXTrack,
  Bitmap1Bit,
  EpaperStatus,
  GPSFixQuality,
  success,
  failure,
} from "@core/types";
import {
  GPSError,
  MapError,
  DisplayError,
  OrchestratorError,
} from "@core/errors";

describe("RenderingOrchestrator", () => {
  let orchestrator: RenderingOrchestrator;
  let mockGPS: jest.Mocked<IGPSService>;
  let mockMap: jest.Mocked<IMapService>;
  let mockSVG: jest.Mocked<ISVGService>;
  let mockEpaper: jest.Mocked<IEpaperService>;
  let mockConfig: jest.Mocked<IConfigService>;

  const mockCoordinate: GPSCoordinate = {
    latitude: 51.9225,
    longitude: 4.47917,
    timestamp: new Date(),
  };

  const mockTrack: GPXTrack = {
    name: "Test Track",
    segments: [
      {
        points: [
          { latitude: 51.92, longitude: 4.47, timestamp: new Date() },
          { latitude: 51.93, longitude: 4.48, timestamp: new Date() },
        ],
      },
    ],
  };

  const mockBitmap: Bitmap1Bit = {
    width: 800,
    height: 480,
    data: new Uint8Array(48000),
  };

  beforeEach(() => {
    // Create mock services
    mockGPS = {
      initialize: jest.fn(),
      getCurrentPosition: jest.fn(),
      getStatus: jest.fn(),
      startTracking: jest.fn(),
      stopTracking: jest.fn(),
      isTracking: jest.fn(),
      waitForFix: jest.fn(),
      onPositionUpdate: jest.fn(),
      onStatusChange: jest.fn(),
      dispose: jest.fn(),
    };

    mockMap = {
      loadGPXFile: jest.fn(),
      getTrack: jest.fn(),
      listAvailableGPXFiles: jest.fn(),
      getGPXFileInfo: jest.fn(),
      calculateBounds: jest.fn(),
      calculateDistance: jest.fn(),
      calculateElevation: jest.fn(),
      simplifyTrack: jest.fn(),
      validateGPXFile: jest.fn(),
      clearCache: jest.fn(),
    };

    mockSVG = {
      renderViewport: jest.fn(),
      renderMultipleTracks: jest.fn(),
      createBlankBitmap: jest.fn(),
      addText: jest.fn(),
      addCompass: jest.fn(),
      addScaleBar: jest.fn(),
      addInfoPanel: jest.fn(),
      getDefaultRenderOptions: jest.fn(),
      renderFollowTrackScreen: jest.fn(),
    };

    mockEpaper = {
      initialize: jest.fn(),
      displayLogo: jest.fn(),
      displayBitmap: jest.fn(),
      displayBitmapFromFile: jest.fn(),
      clear: jest.fn(),
      fullRefresh: jest.fn(),
      sleep: jest.fn(),
      wake: jest.fn(),
      getStatus: jest.fn(),
      isBusy: jest.fn(),
      waitUntilReady: jest.fn(),
      setRotation: jest.fn(),
      getDimensions: jest.fn(),
      reset: jest.fn(),
      dispose: jest.fn(),
    };

    mockConfig = {
      initialize: jest.fn(),
      getConfig: jest.fn(),
      getUserState: jest.fn(),
      getDisplayWidth: jest.fn().mockReturnValue(800),
      getDisplayHeight: jest.fn().mockReturnValue(480),
      getZoomLevel: jest.fn().mockReturnValue(14),
      setZoomLevel: jest.fn(),
      getMinZoomLevel: jest.fn().mockReturnValue(1),
      getMaxZoomLevel: jest.fn().mockReturnValue(20),
      getActiveGPXPath: jest.fn().mockReturnValue("/path/to/track.gpx"),
      setActiveGPXPath: jest.fn(),
      getGPSUpdateInterval: jest.fn().mockReturnValue(1000),
      setGPSUpdateInterval: jest.fn(),
      getRenderOptions: jest.fn().mockReturnValue({
        lineWidth: 2,
        pointRadius: 3,
        showPoints: true,
        showLine: true,
        highlightCurrentPosition: true,
        showDirection: false,
        antiAlias: false,
      }),
      updateRenderOptions: jest.fn(),
      getAutoCenter: jest.fn().mockReturnValue(true),
      setAutoCenter: jest.fn(),
      getRotateWithBearing: jest.fn().mockReturnValue(false),
      setRotateWithBearing: jest.fn(),
      getAutoRefreshInterval: jest.fn().mockReturnValue(30),
      setAutoRefreshInterval: jest.fn(),
      getRecentFiles: jest.fn().mockReturnValue([]),
      addRecentFile: jest.fn(),
      clearRecentFiles: jest.fn(),
      isOnboardingCompleted: jest.fn().mockReturnValue(true),
      setOnboardingCompleted: jest.fn(),
      save: jest.fn().mockResolvedValue(success(undefined)),
      reload: jest.fn(),
      resetToDefaults: jest.fn(),
      exportConfig: jest.fn(),
      importConfig: jest.fn(),
      getWiFiFallbackNetwork: jest.fn().mockReturnValue(undefined),
      setWiFiFallbackNetwork: jest.fn(),
      getHotspotConfig: jest.fn().mockReturnValue(undefined),
      setHotspotConfig: jest.fn(),
    };

    orchestrator = new RenderingOrchestrator(
      mockGPS,
      mockMap,
      mockSVG,
      mockEpaper,
      mockConfig,
    );
  });

  afterEach(async () => {
    await orchestrator.dispose();
  });

  describe("initialization", () => {
    it("should initialize all services successfully", async () => {
      mockConfig.initialize.mockResolvedValue(success(undefined));
      mockGPS.initialize.mockResolvedValue(success(undefined));
      mockEpaper.initialize.mockResolvedValue(success(undefined));
      mockEpaper.displayLogo.mockResolvedValue(success(undefined));
      mockGPS.startTracking.mockResolvedValue(success(undefined));

      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
      expect(mockConfig.initialize).toHaveBeenCalled();
      expect(mockGPS.initialize).toHaveBeenCalled();
      expect(mockEpaper.initialize).toHaveBeenCalled();
      expect(mockGPS.startTracking).toHaveBeenCalled();
    });

    it("should fail if config service fails to initialize", async () => {
      mockConfig.initialize.mockResolvedValue(
        failure(new Error("Config init failed")),
      );

      const result = await orchestrator.initialize();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as OrchestratorError).code).toBe(
          "ORCHESTRATOR_SERVICE_INIT_FAILED",
        );
      }
    });

    it("should fail if GPS service fails to initialize", async () => {
      mockConfig.initialize.mockResolvedValue(success(undefined));
      mockGPS.initialize.mockResolvedValue(
        failure(GPSError.deviceNotFound("/dev/ttyAMA0")),
      );

      const result = await orchestrator.initialize();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as OrchestratorError).code).toBe(
          "ORCHESTRATOR_SERVICE_INIT_FAILED",
        );
      }
    });

    it("should not reinitialize if already initialized", async () => {
      mockConfig.initialize.mockResolvedValue(success(undefined));
      mockGPS.initialize.mockResolvedValue(success(undefined));
      mockEpaper.initialize.mockResolvedValue(success(undefined));
      mockEpaper.displayLogo.mockResolvedValue(success(undefined));
      mockGPS.startTracking.mockResolvedValue(success(undefined));

      await orchestrator.initialize();
      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
      expect(mockConfig.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateDisplay", () => {
    beforeEach(async () => {
      mockConfig.initialize.mockResolvedValue(success(undefined));
      mockGPS.initialize.mockResolvedValue(success(undefined));
      mockEpaper.initialize.mockResolvedValue(success(undefined));
      mockEpaper.displayLogo.mockResolvedValue(success(undefined));
      mockGPS.startTracking.mockResolvedValue(success(undefined));
      await orchestrator.initialize();
    });

    it("should update display successfully", async () => {
      mockGPS.getCurrentPosition.mockResolvedValue(success(mockCoordinate));
      mockMap.getTrack.mockResolvedValue(success(mockTrack));
      mockSVG.renderViewport.mockResolvedValue(success(mockBitmap));
      mockEpaper.displayBitmap.mockResolvedValue(success(undefined));

      const result = await orchestrator.updateDisplay();

      expect(result.success).toBe(true);
      expect(mockGPS.getCurrentPosition).toHaveBeenCalled();
      expect(mockMap.getTrack).toHaveBeenCalledWith("/path/to/track.gpx");
      expect(mockSVG.renderViewport).toHaveBeenCalled();
      expect(mockEpaper.displayBitmap).toHaveBeenCalledWith(mockBitmap);
    });

    it("should fail if no active GPX path", async () => {
      mockConfig.getActiveGPXPath.mockReturnValue(null);
      mockGPS.getCurrentPosition.mockResolvedValue(success(mockCoordinate));

      const result = await orchestrator.updateDisplay();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as OrchestratorError).code).toBe(
          "ORCHESTRATOR_NO_ACTIVE_GPX",
        );
      }
    });

    it("should fail if GPS position unavailable", async () => {
      mockGPS.getCurrentPosition.mockResolvedValue(failure(GPSError.noFix(0)));

      const result = await orchestrator.updateDisplay();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as OrchestratorError).code).toBe(
          "ORCHESTRATOR_UPDATE_FAILED",
        );
      }
    });

    it("should fail if track cannot be loaded", async () => {
      mockGPS.getCurrentPosition.mockResolvedValue(success(mockCoordinate));
      mockMap.getTrack.mockResolvedValue(
        failure(MapError.fileNotFound("/path/to/track.gpx")),
      );

      const result = await orchestrator.updateDisplay();

      expect(result.success).toBe(false);
    });

    it("should fail if rendering fails", async () => {
      mockGPS.getCurrentPosition.mockResolvedValue(success(mockCoordinate));
      mockMap.getTrack.mockResolvedValue(success(mockTrack));
      mockSVG.renderViewport.mockResolvedValue(
        failure(DisplayError.renderFailed("Test error")),
      );

      const result = await orchestrator.updateDisplay();

      expect(result.success).toBe(false);
    });
  });

  describe("setActiveGPX", () => {
    beforeEach(async () => {
      mockConfig.initialize.mockResolvedValue(success(undefined));
      mockGPS.initialize.mockResolvedValue(success(undefined));
      mockEpaper.initialize.mockResolvedValue(success(undefined));
      mockEpaper.displayLogo.mockResolvedValue(success(undefined));
      mockGPS.startTracking.mockResolvedValue(success(undefined));
      await orchestrator.initialize();
    });

    it("should set active GPX and update display", async () => {
      mockMap.validateGPXFile.mockResolvedValue(success(true));
      mockMap.getTrack.mockResolvedValue(success(mockTrack));
      mockMap.calculateBounds.mockReturnValue({
        minLat: 52.52,
        maxLat: 52.522,
        minLon: 13.405,
        maxLon: 13.407,
      });
      mockGPS.getCurrentPosition.mockResolvedValue(success(mockCoordinate));
      mockSVG.renderViewport.mockResolvedValue(success(mockBitmap));
      mockEpaper.displayBitmap.mockResolvedValue(success(undefined));

      const result = await orchestrator.setActiveGPX("/new/path.gpx");

      expect(result.success).toBe(true);
      expect(mockConfig.setActiveGPXPath).toHaveBeenCalledWith("/new/path.gpx");
      expect(mockConfig.save).toHaveBeenCalled();
    });

    it("should fail if GPX file is invalid", async () => {
      mockMap.validateGPXFile.mockResolvedValue(
        failure(MapError.fileNotFound("/invalid/path.gpx")),
      );

      const result = await orchestrator.setActiveGPX("/invalid/path.gpx");

      expect(result.success).toBe(false);
    });
  });

  describe("clearActiveGPX", () => {
    beforeEach(async () => {
      mockConfig.initialize.mockResolvedValue(success(undefined));
      mockGPS.initialize.mockResolvedValue(success(undefined));
      mockEpaper.initialize.mockResolvedValue(success(undefined));
      mockEpaper.displayLogo.mockResolvedValue(success(undefined));
      mockGPS.startTracking.mockResolvedValue(success(undefined));
      await orchestrator.initialize();
    });

    it("should clear active GPX path", async () => {
      const result = await orchestrator.clearActiveGPX();

      expect(result.success).toBe(true);
      expect(mockConfig.setActiveGPXPath).toHaveBeenCalledWith(null);
      expect(mockConfig.save).toHaveBeenCalled();
    });
  });

  describe("zoom control", () => {
    beforeEach(async () => {
      mockConfig.initialize.mockResolvedValue(success(undefined));
      mockGPS.initialize.mockResolvedValue(success(undefined));
      mockEpaper.initialize.mockResolvedValue(success(undefined));
      mockEpaper.displayLogo.mockResolvedValue(success(undefined));
      mockGPS.startTracking.mockResolvedValue(success(undefined));
      await orchestrator.initialize();

      // Setup for successful display update
      mockGPS.getCurrentPosition.mockResolvedValue(success(mockCoordinate));
      mockMap.getTrack.mockResolvedValue(success(mockTrack));
      mockSVG.renderViewport.mockResolvedValue(success(mockBitmap));
      mockEpaper.displayBitmap.mockResolvedValue(success(undefined));
    });

    it("should change zoom by delta", async () => {
      const result = await orchestrator.changeZoom(2);

      expect(result.success).toBe(true);
      expect(mockConfig.setZoomLevel).toHaveBeenCalledWith(16); // 14 + 2
      expect(mockConfig.save).toHaveBeenCalled();
    });

    it("should set absolute zoom level", async () => {
      const result = await orchestrator.setZoom(18);

      expect(result.success).toBe(true);
      expect(mockConfig.setZoomLevel).toHaveBeenCalledWith(18);
      expect(mockConfig.save).toHaveBeenCalled();
    });
  });

  describe("auto-update", () => {
    beforeEach(async () => {
      mockConfig.initialize.mockResolvedValue(success(undefined));
      mockGPS.initialize.mockResolvedValue(success(undefined));
      mockEpaper.initialize.mockResolvedValue(success(undefined));
      mockEpaper.displayLogo.mockResolvedValue(success(undefined));
      mockGPS.startTracking.mockResolvedValue(success(undefined));
      await orchestrator.initialize();
    });

    it("should start auto-update", async () => {
      const result = await orchestrator.startAutoUpdate();

      expect(result.success).toBe(true);
      expect(orchestrator.isAutoUpdateRunning()).toBe(true);
    });

    it("should fail if auto-update already running", async () => {
      await orchestrator.startAutoUpdate();
      const result = await orchestrator.startAutoUpdate();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as OrchestratorError).code).toBe(
          "ORCHESTRATOR_ALREADY_RUNNING",
        );
      }
    });

    it("should stop auto-update", async () => {
      await orchestrator.startAutoUpdate();
      orchestrator.stopAutoUpdate();

      expect(orchestrator.isAutoUpdateRunning()).toBe(false);
    });

    it("should fail if refresh interval is 0", async () => {
      mockConfig.getAutoRefreshInterval.mockReturnValue(0);

      const result = await orchestrator.startAutoUpdate();

      expect(result.success).toBe(false);
    });
  });

  describe("display control", () => {
    beforeEach(async () => {
      mockConfig.initialize.mockResolvedValue(success(undefined));
      mockGPS.initialize.mockResolvedValue(success(undefined));
      mockEpaper.initialize.mockResolvedValue(success(undefined));
      mockEpaper.displayLogo.mockResolvedValue(success(undefined));
      mockGPS.startTracking.mockResolvedValue(success(undefined));
      await orchestrator.initialize();
    });

    it("should clear display", async () => {
      mockEpaper.clear.mockResolvedValue(success(undefined));

      const result = await orchestrator.clearDisplay();

      expect(result.success).toBe(true);
      expect(mockEpaper.clear).toHaveBeenCalled();
    });

    it("should sleep display", async () => {
      mockEpaper.sleep.mockResolvedValue(success(undefined));

      const result = await orchestrator.sleepDisplay();

      expect(result.success).toBe(true);
      expect(mockEpaper.sleep).toHaveBeenCalled();
    });

    it("should wake display", async () => {
      mockEpaper.wake.mockResolvedValue(success(undefined));

      const result = await orchestrator.wakeDisplay();

      expect(result.success).toBe(true);
      expect(mockEpaper.wake).toHaveBeenCalled();
    });
  });

  describe("preferences", () => {
    it("should set auto-center", () => {
      orchestrator.setAutoCenter(false);
      expect(mockConfig.setAutoCenter).toHaveBeenCalledWith(false);
    });

    it("should set rotate with bearing", () => {
      orchestrator.setRotateWithBearing(true);
      expect(mockConfig.setRotateWithBearing).toHaveBeenCalledWith(true);
    });
  });

  describe("callbacks", () => {
    it("should register display update callback", () => {
      const callback = jest.fn();
      const unsubscribe = orchestrator.onDisplayUpdate(callback);

      expect(typeof unsubscribe).toBe("function");
    });

    it("should unsubscribe display update callback", () => {
      const callback = jest.fn();
      const unsubscribe = orchestrator.onDisplayUpdate(callback);

      unsubscribe();
    });

    it("should register error callback", () => {
      const callback = jest.fn();
      const unsubscribe = orchestrator.onError(callback);

      expect(typeof unsubscribe).toBe("function");
    });

    it("should unsubscribe error callback", () => {
      const callback = jest.fn();
      const unsubscribe = orchestrator.onError(callback);

      unsubscribe();
    });
  });

  describe("getSystemStatus", () => {
    beforeEach(async () => {
      mockConfig.initialize.mockResolvedValue(success(undefined));
      mockGPS.initialize.mockResolvedValue(success(undefined));
      mockEpaper.initialize.mockResolvedValue(success(undefined));
      mockEpaper.displayLogo.mockResolvedValue(success(undefined));
      mockGPS.startTracking.mockResolvedValue(success(undefined));
      await orchestrator.initialize();
    });

    it("should return system status", async () => {
      const mockGPSStatus: GPSStatus = {
        fixQuality: GPSFixQuality.GPS_FIX,
        satellitesInUse: 8,
        hdop: 1.2,
        isTracking: true,
      };

      const mockEpaperStatus: EpaperStatus = {
        initialized: true,
        busy: false,
        sleeping: false,
        fullRefreshCount: 5,
        partialRefreshCount: 10,
      };

      mockGPS.getStatus.mockResolvedValue(success(mockGPSStatus));
      mockGPS.isTracking.mockReturnValue(true);
      mockEpaper.getStatus.mockResolvedValue(success(mockEpaperStatus));
      mockMap.getTrack.mockResolvedValue(success(mockTrack));

      const result = await orchestrator.getSystemStatus();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("uptime");
        expect(result.data).toHaveProperty("gps");
        expect(result.data).toHaveProperty("display");
        expect(result.data).toHaveProperty("system");
        expect(result.data.gps.satellitesInUse).toBe(8);
        expect(result.data.display.refreshCount).toBe(5);
      }
    });
  });

  describe("disposal", () => {
    it("should clean up resources", async () => {
      mockConfig.initialize.mockResolvedValue(success(undefined));
      mockGPS.initialize.mockResolvedValue(success(undefined));
      mockEpaper.initialize.mockResolvedValue(success(undefined));
      mockEpaper.displayLogo.mockResolvedValue(success(undefined));
      mockGPS.startTracking.mockResolvedValue(success(undefined));

      await orchestrator.initialize();
      await orchestrator.startAutoUpdate();

      await orchestrator.dispose();

      expect(orchestrator.isAutoUpdateRunning()).toBe(false);
      expect(mockGPS.dispose).toHaveBeenCalled();
      expect(mockEpaper.dispose).toHaveBeenCalled();
    });
  });
});
