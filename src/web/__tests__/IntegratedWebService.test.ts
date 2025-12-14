/* eslint-disable @typescript-eslint/no-explicit-any */
import http from "http";
import { IntegratedWebService } from "../IntegratedWebService";
import { IRenderingOrchestrator, IWiFiService } from "@core/interfaces";
import { WebConfig, WiFiState, success } from "@core/types";

// Track mock functions for socket.io
const mockSocketOn = jest.fn();
const mockSocketEmit = jest.fn();
const mockSocket = {
  id: "test-socket-id",
  on: mockSocketOn,
  emit: mockSocketEmit,
};

const mockIoOn = jest.fn();
const mockIoEmit = jest.fn();
const mockIoClose = jest.fn();
const mockIo = {
  on: mockIoOn,
  emit: mockIoEmit,
  close: mockIoClose,
  engine: { clientsCount: 0 },
};

jest.mock("socket.io", () => ({
  Server: jest.fn(() => mockIo),
}));

// Mock server
let mockServer: any;
let mockServerClose: jest.Mock;

describe("IntegratedWebService", () => {
  let service: IntegratedWebService;
  let mockOrchestrator: IRenderingOrchestrator;
  let createServerSpy: jest.SpyInstance;
  let mockWifiService: IWiFiService;
  let gpsUpdateCallback:
    | ((position: { latitude: number; longitude: number }) => void)
    | null = null;
  let gpsStatusCallback:
    | ((status: {
        fixQuality: number;
        satellitesInUse: number;
        hdop: number;
      }) => void)
    | null = null;
  let displayUpdateCallback: ((success: boolean) => void) | null = null;
  let errorCallback: ((error: Error) => void) | null = null;
  let wifiStateCallback:
    | ((state: WiFiState, prevState: WiFiState) => void)
    | null = null;

  const testConfig: WebConfig = {
    port: 3000,
    host: "0.0.0.0",
    cors: true,
    apiBasePath: "/api",
    staticDirectory: "/tmp/test-static",
    websocket: { enabled: true },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    gpsUpdateCallback = null;
    gpsStatusCallback = null;
    displayUpdateCallback = null;
    errorCallback = null;
    wifiStateCallback = null;

    // Setup mock server
    mockServerClose = jest.fn((callback: (err?: Error) => void) => callback());
    mockServer = {
      listen: jest.fn((_port: number, _host: string, callback: () => void) => {
        callback();
        return mockServer;
      }),
      close: mockServerClose,
      on: jest.fn().mockReturnThis(),
    };

    createServerSpy = jest
      .spyOn(http, "createServer")
      .mockReturnValue(mockServer as any);

    mockOrchestrator = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      dispose: jest.fn().mockResolvedValue(undefined),
      updateDisplay: jest.fn().mockResolvedValue(success(undefined)),
      setActiveGPX: jest.fn().mockResolvedValue(success(undefined)),
      getSystemStatus: jest.fn().mockResolvedValue(
        success({
          initialized: true,
          activeGPX: "test.gpx",
          gpsStatus: { fixQuality: 1, satellitesInUse: 8 },
        }),
      ),
      onGPSUpdate: jest.fn((cb) => {
        gpsUpdateCallback = cb;
        return () => {
          gpsUpdateCallback = null;
        };
      }),
      onGPSStatusChange: jest.fn((cb) => {
        gpsStatusCallback = cb;
        return () => {
          gpsStatusCallback = null;
        };
      }),
      onDisplayUpdate: jest.fn((cb) => {
        displayUpdateCallback = cb;
        return () => {
          displayUpdateCallback = null;
        };
      }),
      onError: jest.fn((cb) => {
        errorCallback = cb;
        return () => {
          errorCallback = null;
        };
      }),
      onSpeedLimitPrefetchProgress: jest.fn().mockReturnValue(() => {}),
      setWebSocketClientCount: jest.fn(),
    } as unknown as IRenderingOrchestrator;

    mockWifiService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      dispose: jest.fn().mockResolvedValue(undefined),
      setWebSocketClientCount: jest.fn(),
      getMode: jest.fn().mockReturnValue("stopped"),
      getMobileHotspotSSID: jest.fn().mockReturnValue("TestHotspot"),
      onStateChange: jest.fn((cb) => {
        wifiStateCallback = cb;
        return () => {
          wifiStateCallback = null;
        };
      }),
    } as unknown as IWiFiService;

    service = new IntegratedWebService(
      mockOrchestrator,
      testConfig,
      mockWifiService,
    );
  });

  afterEach(async () => {
    if (service.isRunning()) {
      await service.stop();
    }
    createServerSpy.mockRestore();
  });

  describe("start", () => {
    it("should start the server successfully", async () => {
      const result = await service.start();

      expect(result.success).toBe(true);
      expect(service.isRunning()).toBe(true);
    });

    it("should return success if already running", async () => {
      await service.start();
      const result = await service.start();

      expect(result.success).toBe(true);
    });

    it("should subscribe to orchestrator events on start", async () => {
      await service.start();

      expect(mockOrchestrator.onGPSUpdate).toHaveBeenCalled();
      expect(mockOrchestrator.onGPSStatusChange).toHaveBeenCalled();
      expect(mockOrchestrator.onDisplayUpdate).toHaveBeenCalled();
      expect(mockOrchestrator.onError).toHaveBeenCalled();
    });

    it("should subscribe to WiFi state changes if WiFi service provided", async () => {
      await service.start();

      expect(mockWifiService.onStateChange).toHaveBeenCalled();
    });
  });

  describe("stop", () => {
    it("should stop the server successfully", async () => {
      await service.start();
      const result = await service.stop();

      expect(result.success).toBe(true);
      expect(service.isRunning()).toBe(false);
    });

    it("should return failure if not running", async () => {
      const result = await service.stop();

      expect(result.success).toBe(false);
    });

    it("should close WebSocket connections on stop", async () => {
      await service.start();
      await service.stop();

      expect(mockIoClose).toHaveBeenCalled();
    });
  });

  describe("isRunning", () => {
    it("should return false before start", () => {
      expect(service.isRunning()).toBe(false);
    });

    it("should return true after start", async () => {
      await service.start();
      expect(service.isRunning()).toBe(true);
    });

    it("should return false after stop", async () => {
      await service.start();
      await service.stop();
      expect(service.isRunning()).toBe(false);
    });
  });

  describe("getServerUrl", () => {
    it("should return localhost URL when host is 0.0.0.0", () => {
      expect(service.getServerUrl()).toBe("http://localhost:3000");
    });

    it("should return configured host in URL when not 0.0.0.0", () => {
      const customConfig: WebConfig = {
        ...testConfig,
        host: "192.168.1.1",
      };
      const customService = new IntegratedWebService(
        mockOrchestrator,
        customConfig,
      );
      expect(customService.getServerUrl()).toBe("http://192.168.1.1:3000");
    });
  });

  describe("getPort", () => {
    it("should return configured port", () => {
      expect(service.getPort()).toBe(3000);
    });
  });

  describe("broadcast", () => {
    it("should emit to socket.io when server is running", async () => {
      await service.start();

      service.broadcast("test:event", { data: "test" });

      expect(mockIoEmit).toHaveBeenCalledWith("test:event", { data: "test" });
    });
  });

  describe("onWebSocketConnection", () => {
    it("should register connection handler with socket.io", async () => {
      await service.start();

      const handler = jest.fn();
      service.onWebSocketConnection(handler);

      expect(mockIoOn).toHaveBeenCalledWith("connection", handler);
    });
  });

  describe("WebSocket event handling", () => {
    beforeEach(async () => {
      await service.start();
    });

    it("should setup connection handler", () => {
      expect(mockIoOn).toHaveBeenCalledWith("connection", expect.any(Function));
    });

    it("should track client connections and notify WiFi service", () => {
      // Get the connection handler
      const connectionHandler = mockIoOn.mock.calls.find(
        (call) => call[0] === "connection",
      )?.[1];
      expect(connectionHandler).toBeDefined();

      // Simulate connection
      connectionHandler(mockSocket);

      expect(mockWifiService.setWebSocketClientCount).toHaveBeenCalledWith(1);
      expect(mockOrchestrator.setWebSocketClientCount).toHaveBeenCalledWith(1);
    });

    it("should handle client disconnection", () => {
      const connectionHandler = mockIoOn.mock.calls.find(
        (call) => call[0] === "connection",
      )?.[1];
      connectionHandler(mockSocket);

      // Get disconnect handler
      const disconnectHandler = mockSocketOn.mock.calls.find(
        (call) => call[0] === "disconnect",
      )?.[1];
      expect(disconnectHandler).toBeDefined();

      // Simulate disconnect
      disconnectHandler();

      expect(mockWifiService.setWebSocketClientCount).toHaveBeenCalledWith(0);
    });

    it("should handle ping/pong", () => {
      const connectionHandler = mockIoOn.mock.calls.find(
        (call) => call[0] === "connection",
      )?.[1];
      connectionHandler(mockSocket);

      const pingHandler = mockSocketOn.mock.calls.find(
        (call) => call[0] === "ping",
      )?.[1];
      expect(pingHandler).toBeDefined();

      pingHandler();
      expect(mockSocketEmit).toHaveBeenCalledWith("pong");
    });

    it("should handle display:refresh request", async () => {
      const connectionHandler = mockIoOn.mock.calls.find(
        (call) => call[0] === "connection",
      )?.[1];
      connectionHandler(mockSocket);

      const refreshHandler = mockSocketOn.mock.calls.find(
        (call) => call[0] === "display:refresh",
      )?.[1];
      expect(refreshHandler).toBeDefined();

      await refreshHandler();
      expect(mockOrchestrator.updateDisplay).toHaveBeenCalled();
    });
  });

  describe("Orchestrator event broadcasting", () => {
    beforeEach(async () => {
      await service.start();
    });

    it("should broadcast GPS updates", () => {
      expect(gpsUpdateCallback).toBeDefined();

      const position = {
        latitude: 37.7749,
        longitude: -122.4194,
        altitude: 10,
        timestamp: new Date(),
        accuracy: 5,
        speed: 10,
        bearing: 45,
      };
      gpsUpdateCallback!(position);

      expect(mockIoEmit).toHaveBeenCalledWith(
        "gps:update",
        expect.objectContaining({
          latitude: 37.7749,
          longitude: -122.4194,
        }),
      );
    });

    it("should broadcast GPS status changes", () => {
      expect(gpsStatusCallback).toBeDefined();

      const status = {
        fixQuality: 1,
        satellitesInUse: 8,
        hdop: 1.2,
        vdop: 1.5,
        pdop: 1.8,
        isTracking: true,
      };
      gpsStatusCallback!(status);

      expect(mockIoEmit).toHaveBeenCalledWith(
        "gps:status",
        expect.objectContaining({
          fixQuality: 1,
          satellitesInUse: 8,
        }),
      );
    });

    it("should broadcast display updates", () => {
      expect(displayUpdateCallback).toBeDefined();

      displayUpdateCallback!(true);

      expect(mockIoEmit).toHaveBeenCalledWith(
        "display:updated",
        expect.objectContaining({ success: true }),
      );
    });

    it("should broadcast errors", () => {
      expect(errorCallback).toBeDefined();

      const error = new Error("Test error");
      errorCallback!(error);

      expect(mockIoEmit).toHaveBeenCalledWith(
        "error",
        expect.objectContaining({
          message: "Test error",
        }),
      );
    });

    it("should broadcast WiFi state changes", () => {
      expect(wifiStateCallback).toBeDefined();

      wifiStateCallback!(WiFiState.CONNECTED, WiFiState.CONNECTING);

      expect(mockIoEmit).toHaveBeenCalledWith(
        "wifi:state",
        expect.objectContaining({
          state: WiFiState.CONNECTED,
          previousState: WiFiState.CONNECTING,
        }),
      );
    });
  });

  describe("without WebSocket", () => {
    it("should work without WebSocket enabled", async () => {
      const noWsConfig: WebConfig = {
        ...testConfig,
        websocket: { enabled: false },
      };
      const noWsService = new IntegratedWebService(
        mockOrchestrator,
        noWsConfig,
      );

      const result = await noWsService.start();
      expect(result.success).toBe(true);

      // broadcast should not throw
      noWsService.broadcast("test", {});

      await noWsService.stop();
    });
  });

  describe("without WiFi service", () => {
    it("should work without WiFi service", async () => {
      const noWifiService = new IntegratedWebService(
        mockOrchestrator,
        testConfig,
      );

      const result = await noWifiService.start();
      expect(result.success).toBe(true);

      await noWifiService.stop();
    });
  });
});
