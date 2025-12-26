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
      onPOIPrefetchProgress: jest.fn().mockReturnValue(() => {}),
      onLocationPrefetchProgress: jest.fn().mockReturnValue(() => {}),
      onElevationPrefetchProgress: jest.fn().mockReturnValue(() => {}),
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

  describe("SSL/HTTPS configuration", () => {
    let httpsCreateServerSpy: jest.SpyInstance;
    let fsReadFileSpy: jest.SpyInstance;

    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const https = require("https");
      httpsCreateServerSpy = jest
        .spyOn(https, "createServer")
        .mockReturnValue(mockServer);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("fs/promises");
      fsReadFileSpy = jest.spyOn(fs, "readFile").mockResolvedValue("cert-data");
    });

    afterEach(() => {
      httpsCreateServerSpy?.mockRestore();
      fsReadFileSpy?.mockRestore();
    });

    it("should create HTTPS server when SSL is enabled", async () => {
      const sslConfig: WebConfig = {
        ...testConfig,
        ssl: {
          enabled: true,
          keyPath: "/path/to/key.pem",
          certPath: "/path/to/cert.pem",
        },
      };
      const sslService = new IntegratedWebService(mockOrchestrator, sslConfig);

      const result = await sslService.start();

      expect(result.success).toBe(true);
      expect(httpsCreateServerSpy).toHaveBeenCalled();
      expect(fsReadFileSpy).toHaveBeenCalledWith("/path/to/key.pem");
      expect(fsReadFileSpy).toHaveBeenCalledWith("/path/to/cert.pem");

      await sslService.stop();
    });

    it("should return https URL when SSL is enabled", () => {
      const sslConfig: WebConfig = {
        ...testConfig,
        ssl: {
          enabled: true,
          keyPath: "/path/to/key.pem",
          certPath: "/path/to/cert.pem",
        },
      };
      const sslService = new IntegratedWebService(mockOrchestrator, sslConfig);

      expect(sslService.getServerUrl()).toBe("https://localhost:3000");
    });
  });

  describe("CORS with specific origins", () => {
    it("should handle CORS with allowed origins", async () => {
      const corsConfig: WebConfig = {
        ...testConfig,
        cors: true,
        corsOrigins: ["http://localhost:8080", "http://example.com"],
      };
      const corsService = new IntegratedWebService(
        mockOrchestrator,
        corsConfig,
      );

      const result = await corsService.start();
      expect(result.success).toBe(true);

      await corsService.stop();
    });

    it("should handle CORS disabled", async () => {
      const noCorsConfig: WebConfig = {
        ...testConfig,
        cors: false,
      };
      const noCorsService = new IntegratedWebService(
        mockOrchestrator,
        noCorsConfig,
      );

      const result = await noCorsService.start();
      expect(result.success).toBe(true);

      await noCorsService.stop();
    });
  });

  describe("error handling", () => {
    it("should return failure when port is in use", async () => {
      const errorServer: any = {
        listen: jest.fn(
          (_port: number, _host: string, _callback: () => void): any =>
            errorServer,
        ),
        on: jest.fn(
          (
            event: string,
            handler: (err: NodeJS.ErrnoException) => void,
          ): any => {
            if (event === "error") {
              const error = new Error("Port in use") as NodeJS.ErrnoException;
              error.code = "EADDRINUSE";
              handler(error);
            }
            return errorServer;
          },
        ),
        close: jest.fn(),
      };

      createServerSpy.mockReturnValue(errorServer);

      const result = await service.start();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("3000");
      }
    });

    it("should return failure on other server errors", async () => {
      const errorServer: any = {
        listen: jest.fn(
          (_port: number, _host: string, _callback: () => void): any =>
            errorServer,
        ),
        on: jest.fn(
          (
            event: string,
            handler: (err: NodeJS.ErrnoException) => void,
          ): any => {
            if (event === "error") {
              const error = new Error(
                "Permission denied",
              ) as NodeJS.ErrnoException;
              error.code = "EACCES";
              handler(error);
            }
            return errorServer;
          },
        ),
        close: jest.fn(),
      };

      createServerSpy.mockReturnValue(errorServer);

      const result = await service.start();

      expect(result.success).toBe(false);
    });

    it("should handle non-Error exception during start", async () => {
      createServerSpy.mockImplementation(() => {
        throw "string error";
      });

      const result = await service.start();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Unknown error");
      }
    });

    it("should handle Error exception during start", async () => {
      createServerSpy.mockImplementation(() => {
        throw new Error("Test error");
      });

      const result = await service.start();

      expect(result.success).toBe(false);
    });

    it("should handle server close error during stop", async () => {
      await service.start();

      mockServerClose.mockImplementation((callback: (err?: Error) => void) => {
        callback(new Error("Close failed"));
      });

      const result = await service.stop();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Failed to stop server");
      }
    });

    it("should handle non-Error exception during stop", async () => {
      await service.start();

      mockServerClose.mockImplementation(() => {
        throw "string error";
      });

      const result = await service.stop();

      expect(result.success).toBe(false);
    });
  });

  describe("simulation service integration", () => {
    let simulationPositionCallback: ((position: any) => void) | null = null;
    let simulationStateCallback: ((status: any) => void) | null = null;
    let mockSimulationService: any;

    beforeEach(() => {
      mockSimulationService = {
        isSimulating: jest.fn().mockReturnValue(false),
        onPositionUpdate: jest.fn((cb) => {
          simulationPositionCallback = cb;
          return () => {
            simulationPositionCallback = null;
          };
        }),
        onStateChange: jest.fn((cb) => {
          simulationStateCallback = cb;
          return () => {
            simulationStateCallback = null;
          };
        }),
      };
    });

    it("should subscribe to simulation events when service is provided", async () => {
      const simService = new IntegratedWebService(
        mockOrchestrator,
        testConfig,
        mockWifiService,
        undefined,
        "./data/gpx",
        undefined,
        mockSimulationService,
      );

      await simService.start();

      expect(mockSimulationService.onPositionUpdate).toHaveBeenCalled();
      expect(mockSimulationService.onStateChange).toHaveBeenCalled();

      await simService.stop();
    });

    it("should broadcast simulation position updates", async () => {
      const simService = new IntegratedWebService(
        mockOrchestrator,
        testConfig,
        mockWifiService,
        undefined,
        "./data/gpx",
        undefined,
        mockSimulationService,
      );

      await simService.start();

      const position = {
        latitude: 37.7749,
        longitude: -122.4194,
        altitude: 10,
        timestamp: new Date(),
        speed: 15,
        bearing: 90,
      };
      simulationPositionCallback!(position);

      expect(mockIoEmit).toHaveBeenCalledWith(
        "gps:update",
        expect.objectContaining({
          latitude: 37.7749,
          longitude: -122.4194,
          fixQuality: 8, // SIMULATION
        }),
      );

      await simService.stop();
    });

    it("should broadcast simulation state changes", async () => {
      const simService = new IntegratedWebService(
        mockOrchestrator,
        testConfig,
        mockWifiService,
        undefined,
        "./data/gpx",
        undefined,
        mockSimulationService,
      );

      await simService.start();

      const status = { isRunning: true, progress: 50 };
      simulationStateCallback!(status);

      expect(mockIoEmit).toHaveBeenCalledWith("simulation:status", status);

      await simService.stop();
    });

    it("should skip real GPS updates when simulation is running", async () => {
      mockSimulationService.isSimulating.mockReturnValue(true);

      const simService = new IntegratedWebService(
        mockOrchestrator,
        testConfig,
        mockWifiService,
        undefined,
        "./data/gpx",
        undefined,
        mockSimulationService,
      );

      await simService.start();

      // Trigger real GPS update
      const position = { latitude: 37.77, longitude: -122.41 };
      gpsUpdateCallback!(position);

      // Should NOT broadcast real GPS when simulation is running
      const gpsUpdateCalls = mockIoEmit.mock.calls.filter(
        (call) => call[0] === "gps:update",
      );
      expect(gpsUpdateCalls.length).toBe(0);

      await simService.stop();
    });
  });

  describe("drive navigation service integration", () => {
    let driveNavigationCallback: ((update: any) => void) | null = null;
    let mockDriveNavigationService: any;

    beforeEach(() => {
      mockDriveNavigationService = {
        onNavigationUpdate: jest.fn((cb) => {
          driveNavigationCallback = cb;
          return () => {
            driveNavigationCallback = null;
          };
        }),
        getActiveRoute: jest.fn().mockReturnValue({
          destination: "Test Destination",
        }),
      };
    });

    it("should subscribe to drive navigation events when service is provided", async () => {
      const driveService = new IntegratedWebService(
        mockOrchestrator,
        testConfig,
        mockWifiService,
        undefined,
        "./data/gpx",
        undefined,
        undefined,
        mockDriveNavigationService,
      );

      await driveService.start();

      expect(mockDriveNavigationService.onNavigationUpdate).toHaveBeenCalled();

      await driveService.stop();
    });

    it("should broadcast drive navigation updates", async () => {
      const driveService = new IntegratedWebService(
        mockOrchestrator,
        testConfig,
        mockWifiService,
        undefined,
        "./data/gpx",
        undefined,
        undefined,
        mockDriveNavigationService,
      );

      await driveService.start();

      const update = {
        status: {
          state: "navigating",
          displayMode: "turn",
          currentWaypointIndex: 2,
          distanceToNextTurn: 500,
          bearingToRoute: 45,
          nextTurn: {
            maneuverType: "right",
            instruction: "Turn right",
            streetName: "Main St",
          },
          progress: 30,
          distanceRemaining: 5000,
          timeRemaining: 600,
          distanceToRoute: 0,
        },
      };
      driveNavigationCallback!(update);

      expect(mockIoEmit).toHaveBeenCalledWith(
        "drive:update",
        expect.objectContaining({
          state: "navigating",
          distanceToNextTurn: 500,
        }),
      );

      await driveService.stop();
    });

    it("should emit drive:arrived event when arriving at destination", async () => {
      const driveService = new IntegratedWebService(
        mockOrchestrator,
        testConfig,
        mockWifiService,
        undefined,
        "./data/gpx",
        undefined,
        undefined,
        mockDriveNavigationService,
      );

      await driveService.start();

      const update = {
        status: {
          state: "arrived",
          displayMode: "arrival",
          currentWaypointIndex: 5,
          distanceToNextTurn: 0,
          bearingToRoute: 0,
          progress: 100,
          distanceRemaining: 0,
          timeRemaining: 0,
          distanceToRoute: 0,
        },
      };
      driveNavigationCallback!(update);

      expect(mockIoEmit).toHaveBeenCalledWith(
        "drive:arrived",
        expect.objectContaining({
          destination: "Test Destination",
        }),
      );

      await driveService.stop();
    });

    it("should only emit drive:arrived once per arrival", async () => {
      const driveService = new IntegratedWebService(
        mockOrchestrator,
        testConfig,
        mockWifiService,
        undefined,
        "./data/gpx",
        undefined,
        undefined,
        mockDriveNavigationService,
      );

      await driveService.start();

      const arrivedUpdate = {
        status: {
          state: "arrived",
          displayMode: "arrival",
          currentWaypointIndex: 5,
          distanceToNextTurn: 0,
          bearingToRoute: 0,
          progress: 100,
          distanceRemaining: 0,
          timeRemaining: 0,
          distanceToRoute: 0,
        },
      };

      // Trigger arrived twice
      driveNavigationCallback!(arrivedUpdate);
      driveNavigationCallback!(arrivedUpdate);

      const arrivedCalls = mockIoEmit.mock.calls.filter(
        (call) => call[0] === "drive:arrived",
      );
      expect(arrivedCalls.length).toBe(1);

      await driveService.stop();
    });

    it("should emit drive:off-road event when off route", async () => {
      const driveService = new IntegratedWebService(
        mockOrchestrator,
        testConfig,
        mockWifiService,
        undefined,
        "./data/gpx",
        undefined,
        undefined,
        mockDriveNavigationService,
      );

      await driveService.start();

      const update = {
        status: {
          state: "off_road",
          displayMode: "off_road",
          currentWaypointIndex: 2,
          distanceToNextTurn: 0,
          bearingToRoute: 180,
          progress: 40,
          distanceRemaining: 3000,
          timeRemaining: 400,
          distanceToRoute: 500,
        },
      };
      driveNavigationCallback!(update);

      expect(mockIoEmit).toHaveBeenCalledWith(
        "drive:off-road",
        expect.objectContaining({
          distance: 500,
          bearing: 180,
        }),
      );

      await driveService.stop();
    });

    it("should reset arrived flag when state changes from arrived", async () => {
      const driveService = new IntegratedWebService(
        mockOrchestrator,
        testConfig,
        mockWifiService,
        undefined,
        "./data/gpx",
        undefined,
        undefined,
        mockDriveNavigationService,
      );

      await driveService.start();

      // First arrive
      driveNavigationCallback!({
        status: {
          state: "arrived",
          displayMode: "arrival",
          currentWaypointIndex: 5,
          distanceToNextTurn: 0,
          bearingToRoute: 0,
          progress: 100,
          distanceRemaining: 0,
          timeRemaining: 0,
          distanceToRoute: 0,
        },
      });

      // Navigate again
      driveNavigationCallback!({
        status: {
          state: "navigating",
          displayMode: "turn",
          currentWaypointIndex: 1,
          distanceToNextTurn: 1000,
          bearingToRoute: 45,
          progress: 10,
          distanceRemaining: 9000,
          timeRemaining: 900,
          distanceToRoute: 0,
        },
      });

      // Arrive again
      driveNavigationCallback!({
        status: {
          state: "arrived",
          displayMode: "arrival",
          currentWaypointIndex: 5,
          distanceToNextTurn: 0,
          bearingToRoute: 0,
          progress: 100,
          distanceRemaining: 0,
          timeRemaining: 0,
          distanceToRoute: 0,
        },
      });

      const arrivedCalls = mockIoEmit.mock.calls.filter(
        (call) => call[0] === "drive:arrived",
      );
      expect(arrivedCalls.length).toBe(2);

      await driveService.stop();
    });
  });

  describe("prefetch progress subscriptions", () => {
    let speedLimitCallback: ((progress: any) => void) | null = null;
    let poiCallback: ((progress: any) => void) | null = null;
    let locationCallback: ((progress: any) => void) | null = null;
    let elevationCallback: ((progress: any) => void) | null = null;

    beforeEach(() => {
      (
        mockOrchestrator.onSpeedLimitPrefetchProgress as jest.Mock
      ).mockImplementation((cb) => {
        speedLimitCallback = cb;
        return () => {
          speedLimitCallback = null;
        };
      });
      (mockOrchestrator.onPOIPrefetchProgress as jest.Mock).mockImplementation(
        (cb) => {
          poiCallback = cb;
          return () => {
            poiCallback = null;
          };
        },
      );
      (
        mockOrchestrator.onLocationPrefetchProgress as jest.Mock
      ).mockImplementation((cb) => {
        locationCallback = cb;
        return () => {
          locationCallback = null;
        };
      });
      (
        mockOrchestrator.onElevationPrefetchProgress as jest.Mock
      ).mockImplementation((cb) => {
        elevationCallback = cb;
        return () => {
          elevationCallback = null;
        };
      });
    });

    it("should broadcast speed limit prefetch progress", async () => {
      await service.start();

      const progress = {
        current: 5,
        total: 10,
        segmentsFound: 50,
        complete: false,
      };
      speedLimitCallback!(progress);

      expect(mockIoEmit).toHaveBeenCalledWith(
        "speedlimit:prefetch",
        expect.objectContaining({ current: 5, total: 10 }),
      );

      await service.stop();
    });

    it("should broadcast POI prefetch progress", async () => {
      await service.start();

      const progress = { current: 3, total: 8, poisFound: 25, complete: false };
      poiCallback!(progress);

      expect(mockIoEmit).toHaveBeenCalledWith(
        "poi:prefetch",
        expect.objectContaining({ current: 3, poisFound: 25 }),
      );

      await service.stop();
    });

    it("should broadcast location prefetch progress", async () => {
      await service.start();

      const progress = {
        current: 2,
        total: 5,
        locationsCached: 100,
        complete: false,
      };
      locationCallback!(progress);

      expect(mockIoEmit).toHaveBeenCalledWith(
        "location:prefetch",
        expect.objectContaining({ locationsCached: 100 }),
      );

      await service.stop();
    });

    it("should broadcast elevation prefetch progress", async () => {
      await service.start();

      const progress = {
        current: 1,
        total: 4,
        pointsCached: 500,
        complete: true,
      };
      elevationCallback!(progress);

      expect(mockIoEmit).toHaveBeenCalledWith(
        "elevation:prefetch",
        expect.objectContaining({ pointsCached: 500, complete: true }),
      );

      await service.stop();
    });
  });

  describe("display update with status broadcast", () => {
    it("should broadcast status update after successful display update", async () => {
      await service.start();

      displayUpdateCallback!(true);

      // Wait for async status fetch
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockOrchestrator.getSystemStatus).toHaveBeenCalled();
      expect(mockIoEmit).toHaveBeenCalledWith(
        "status:update",
        expect.objectContaining({ initialized: true }),
      );
    });

    it("should not broadcast status update after failed display update", async () => {
      await service.start();

      displayUpdateCallback!(false);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const statusCalls = mockIoEmit.mock.calls.filter(
        (call) => call[0] === "status:update",
      );
      expect(statusCalls.length).toBe(0);
    });
  });

  describe("GPS status caching", () => {
    it("should include cached GPS status in position updates", async () => {
      await service.start();

      // First update GPS status
      gpsStatusCallback!({
        fixQuality: 2,
        satellitesInUse: 10,
        hdop: 0.8,
      });

      // Then trigger GPS position update
      gpsUpdateCallback!({
        latitude: 37.7749,
        longitude: -122.4194,
      });

      expect(mockIoEmit).toHaveBeenCalledWith(
        "gps:update",
        expect.objectContaining({
          latitude: 37.7749,
          fixQuality: 2,
          satellitesInUse: 10,
          hdop: 0.8,
        }),
      );
    });
  });

  describe("WebSocket handlers", () => {
    it("should handle gps:subscribe event", async () => {
      await service.start();

      const connectionHandler = mockIoOn.mock.calls.find(
        (call) => call[0] === "connection",
      )?.[1];
      connectionHandler(mockSocket);

      const subscribeHandler = mockSocketOn.mock.calls.find(
        (call) => call[0] === "gps:subscribe",
      )?.[1];
      expect(subscribeHandler).toBeDefined();

      // Should not throw
      subscribeHandler();
    });

    it("should handle gps:unsubscribe event", async () => {
      await service.start();

      const connectionHandler = mockIoOn.mock.calls.find(
        (call) => call[0] === "connection",
      )?.[1];
      connectionHandler(mockSocket);

      const unsubscribeHandler = mockSocketOn.mock.calls.find(
        (call) => call[0] === "gps:unsubscribe",
      )?.[1];
      expect(unsubscribeHandler).toBeDefined();

      // Should not throw
      unsubscribeHandler();
    });
  });

  describe("broadcast without io", () => {
    it("should not throw when broadcasting without io initialized", () => {
      const noWsConfig: WebConfig = {
        ...testConfig,
        websocket: { enabled: false },
      };
      const noWsService = new IntegratedWebService(
        mockOrchestrator,
        noWsConfig,
      );

      // Should not throw
      expect(() => noWsService.broadcast("test", {})).not.toThrow();
    });
  });

  describe("onWebSocketConnection without io", () => {
    it("should not throw when registering handler without io", () => {
      const noWsConfig: WebConfig = {
        ...testConfig,
        websocket: { enabled: false },
      };
      const noWsService = new IntegratedWebService(
        mockOrchestrator,
        noWsConfig,
      );

      // Should not throw
      expect(() => noWsService.onWebSocketConnection(() => {})).not.toThrow();
    });
  });
});
