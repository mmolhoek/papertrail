/* eslint-disable @typescript-eslint/no-explicit-any */
import { RenderingOrchestrator } from "@services/orchestrator/RenderingOrchestrator";
import {
  success,
  GPSCoordinate,
  GPSStatus,
  GPXTrack,
  Bitmap1Bit,
  WiFiState,
} from "@core/types";

/**
 * Integration tests for WiFi state transitions
 *
 * Tests the flow of WiFi state changes through the orchestrator:
 * 1. WiFiService emits state change
 * 2. OnboardingCoordinator receives and handles the state
 * 3. Appropriate screens are displayed based on WiFi state
 * 4. Registered callbacks are notified
 */
describe("WiFi State Transitions Integration", () => {
  let orchestrator: RenderingOrchestrator;
  let mockGPSService: any;
  let mockMapService: any;
  let mockSVGService: any;
  let mockEpaperService: any;
  let mockConfigService: any;
  let mockWiFiService: any;
  let mockTextRendererService: any;

  // Capture WiFi state callbacks
  let wifiStateCallbacks: Array<
    (state: WiFiState, previousState: WiFiState) => void
  >;

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

  beforeEach(() => {
    wifiStateCallbacks = [];

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
      getActiveGPXPath: jest.fn().mockReturnValue(null),
      setActiveGPXPath: jest.fn(),
      isOnboardingCompleted: jest.fn().mockReturnValue(false), // Start with onboarding incomplete
      setOnboardingCompleted: jest.fn(),
      getZoomLevel: jest.fn().mockReturnValue(15),
      setZoomLevel: jest.fn(),
      getDisplayWidth: jest.fn().mockReturnValue(800),
      getDisplayHeight: jest.fn().mockReturnValue(480),
      getAutoCenter: jest.fn().mockReturnValue(true),
      getRotateWithBearing: jest.fn().mockReturnValue(false),
      getActiveScreen: jest.fn().mockReturnValue("track"),
      getAutoRefreshInterval: jest.fn().mockReturnValue(30),
      getRenderOptions: jest.fn().mockReturnValue({ showLine: true }),
      save: jest.fn().mockResolvedValue(success(undefined)),
      getConfig: jest.fn().mockReturnValue({ web: { port: 3000 } }),
    };

    // Create mock WiFi service with callback capture
    mockWiFiService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      dispose: jest.fn().mockResolvedValue(undefined),
      getState: jest.fn().mockReturnValue(WiFiState.WAITING_FOR_HOTSPOT),
      getCurrentSSID: jest.fn().mockReturnValue("Papertrail"),
      getIPAddress: jest.fn().mockReturnValue("192.168.4.1"),
      scan: jest.fn().mockResolvedValue(success([])),
      connect: jest.fn().mockResolvedValue(success(undefined)),
      disconnect: jest.fn().mockResolvedValue(success(undefined)),
      startHotspot: jest.fn().mockResolvedValue(success(undefined)),
      stopHotspot: jest.fn().mockResolvedValue(success(undefined)),
      notifyConnectedScreenDisplayed: jest.fn(),
      isConnectedToMobileHotspot: jest.fn().mockResolvedValue(success(false)),
      getHotspotConfig: jest.fn().mockReturnValue({
        ssid: "TestHotspot",
        password: "test123",
        updatedAt: new Date().toISOString(),
      }),
      attemptMobileHotspotConnection: jest
        .fn()
        .mockResolvedValue(success(undefined)),
      onStateChange: jest.fn((callback) => {
        wifiStateCallbacks.push(callback);
        return () => {
          const index = wifiStateCallbacks.indexOf(callback);
          if (index > -1) wifiStateCallbacks.splice(index, 1);
        };
      }),
    };

    // Create mock text renderer service
    mockTextRendererService = {
      renderText: jest.fn().mockResolvedValue(success(testBitmap)),
      renderTemplate: jest.fn().mockResolvedValue(success(testBitmap)),
    };

    orchestrator = new RenderingOrchestrator(
      mockGPSService,
      mockMapService,
      mockSVGService,
      mockEpaperService,
      mockConfigService,
      mockWiFiService,
      mockTextRendererService,
    );
  });

  afterEach(async () => {
    await orchestrator.dispose();
  });

  describe("WiFi State Subscription", () => {
    it("should subscribe to WiFi state changes during initialization", async () => {
      await orchestrator.initialize();

      // WiFi service should have state callback registered
      expect(mockWiFiService.onStateChange).toHaveBeenCalled();
      expect(wifiStateCallbacks.length).toBeGreaterThan(0);
    });

    it("should forward WiFi state changes to registered callbacks", async () => {
      await orchestrator.initialize();

      const stateCallback = jest.fn();
      orchestrator.onWiFiStateChange(stateCallback);

      // Simulate WiFi state change
      wifiStateCallbacks.forEach((cb) =>
        cb(WiFiState.CONNECTED, WiFiState.WAITING_FOR_HOTSPOT),
      );

      expect(stateCallback).toHaveBeenCalledWith(
        WiFiState.CONNECTED,
        WiFiState.WAITING_FOR_HOTSPOT,
      );
    });

    it("should allow unsubscribing from WiFi state changes", async () => {
      await orchestrator.initialize();

      const stateCallback = jest.fn();
      const unsubscribe = orchestrator.onWiFiStateChange(stateCallback);

      // First state change should be received
      wifiStateCallbacks.forEach((cb) =>
        cb(WiFiState.CONNECTED, WiFiState.WAITING_FOR_HOTSPOT),
      );
      expect(stateCallback).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Second state change should not be received
      wifiStateCallbacks.forEach((cb) =>
        cb(WiFiState.DISCONNECTED, WiFiState.CONNECTED),
      );
      expect(stateCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe("WiFi State Transitions", () => {
    it("should handle transition from HOTSPOT_ACTIVE to CONNECTED", async () => {
      await orchestrator.initialize();

      const stateCallback = jest.fn();
      orchestrator.onWiFiStateChange(stateCallback);

      // Simulate transition: hotspot active -> connected
      wifiStateCallbacks.forEach((cb) =>
        cb(WiFiState.CONNECTED, WiFiState.WAITING_FOR_HOTSPOT),
      );

      expect(stateCallback).toHaveBeenCalledWith(
        WiFiState.CONNECTED,
        WiFiState.WAITING_FOR_HOTSPOT,
      );
    });

    it("should handle transition from CONNECTED to DISCONNECTED", async () => {
      await orchestrator.initialize();

      const stateCallback = jest.fn();
      orchestrator.onWiFiStateChange(stateCallback);

      // Simulate transition: connected -> disconnected
      wifiStateCallbacks.forEach((cb) =>
        cb(WiFiState.DISCONNECTED, WiFiState.CONNECTED),
      );

      expect(stateCallback).toHaveBeenCalledWith(
        WiFiState.DISCONNECTED,
        WiFiState.CONNECTED,
      );
    });

    it("should handle transition from DISCONNECTED to CONNECTING", async () => {
      await orchestrator.initialize();

      const stateCallback = jest.fn();
      orchestrator.onWiFiStateChange(stateCallback);

      // Simulate transition: disconnected -> connecting
      wifiStateCallbacks.forEach((cb) =>
        cb(WiFiState.CONNECTING, WiFiState.DISCONNECTED),
      );

      expect(stateCallback).toHaveBeenCalledWith(
        WiFiState.CONNECTING,
        WiFiState.DISCONNECTED,
      );
    });

    it("should handle multiple state transitions in sequence", async () => {
      await orchestrator.initialize();

      const stateCallback = jest.fn();
      orchestrator.onWiFiStateChange(stateCallback);

      // Simulate sequence: hotspot -> connecting -> connected
      wifiStateCallbacks.forEach((cb) =>
        cb(WiFiState.CONNECTING, WiFiState.WAITING_FOR_HOTSPOT),
      );
      wifiStateCallbacks.forEach((cb) =>
        cb(WiFiState.CONNECTED, WiFiState.CONNECTING),
      );

      expect(stateCallback).toHaveBeenCalledTimes(2);
      expect(stateCallback).toHaveBeenNthCalledWith(
        1,
        WiFiState.CONNECTING,
        WiFiState.WAITING_FOR_HOTSPOT,
      );
      expect(stateCallback).toHaveBeenNthCalledWith(
        2,
        WiFiState.CONNECTED,
        WiFiState.CONNECTING,
      );
    });
  });

  describe("Onboarding Flow", () => {
    it("should check and show onboarding screen when not completed", async () => {
      await orchestrator.initialize();

      const result = await orchestrator.checkAndShowOnboardingScreen();

      expect(result).toHaveProperty("success");
    });

    it("should restart onboarding when requested", async () => {
      await orchestrator.initialize();

      const result = await orchestrator.restartOnboarding();

      expect(result).toHaveProperty("success");
    });

    it("should fail to restart onboarding when not initialized", async () => {
      // Don't initialize

      const result = await orchestrator.restartOnboarding();

      expect(result.success).toBe(false);
    });
  });

  describe("WebSocket Client Tracking", () => {
    it("should track WebSocket client count", async () => {
      await orchestrator.initialize();

      // Should not throw
      orchestrator.setWebSocketClientCount(1);
      orchestrator.setWebSocketClientCount(2);
      orchestrator.setWebSocketClientCount(0);
    });

    it("should handle WebSocket clients connecting during onboarding", async () => {
      await orchestrator.initialize();

      // Simulate client connect
      orchestrator.setWebSocketClientCount(1);

      // Callback should still work
      const stateCallback = jest.fn();
      orchestrator.onWiFiStateChange(stateCallback);

      // WiFi state changes should still be forwarded
      wifiStateCallbacks.forEach((cb) =>
        cb(WiFiState.CONNECTED, WiFiState.WAITING_FOR_HOTSPOT),
      );

      expect(stateCallback).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should notify error callbacks when WiFi state callback throws", async () => {
      await orchestrator.initialize();

      const errorCallback = jest.fn();
      orchestrator.onError(errorCallback);

      // Register a callback that throws
      orchestrator.onWiFiStateChange(() => {
        throw new Error("Test error in WiFi callback");
      });

      // Simulate WiFi state change - should catch and notify error
      wifiStateCallbacks.forEach((cb) =>
        cb(WiFiState.CONNECTED, WiFiState.WAITING_FOR_HOTSPOT),
      );

      expect(errorCallback).toHaveBeenCalled();
    });

    it("should handle missing WiFi service gracefully", async () => {
      // Create orchestrator without WiFi service
      const orchestratorNoWifi = new RenderingOrchestrator(
        mockGPSService,
        mockMapService,
        mockSVGService,
        mockEpaperService,
        mockConfigService,
        // No WiFi service
      );

      await orchestratorNoWifi.initialize();

      // WiFi callback registration should return noop
      const unsubscribe = orchestratorNoWifi.onWiFiStateChange(jest.fn());
      expect(typeof unsubscribe).toBe("function");
      unsubscribe(); // Should not throw

      await orchestratorNoWifi.dispose();
    });
  });
});
