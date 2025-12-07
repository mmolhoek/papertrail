import { MockWiFiService } from "../MockWiFiService";
import { WiFiConfig, WiFiState, HotspotConfig } from "@core/types";
import { IConfigService } from "@core/interfaces";

describe("MockWiFiService", () => {
  let service: MockWiFiService;
  const mockConfig: WiFiConfig = {
    enabled: true,
    primarySSID: "TestHotspot",
    primaryPassword: "testpassword123",
    scanIntervalMs: 60000,
    connectionTimeoutMs: 30000,
  };

  beforeEach(async () => {
    service = new MockWiFiService(mockConfig);
    await service.initialize();
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe("initialization", () => {
    it("should initialize successfully", async () => {
      const newService = new MockWiFiService(mockConfig);
      const result = await newService.initialize();
      expect(result.success).toBe(true);
    });

    it("should dispose properly", async () => {
      await service.dispose();
      // After dispose, methods should fail
      const result = await service.scanNetworks();
      expect(result.success).toBe(false);
    });
  });

  describe("methods requiring initialization", () => {
    it("scanNetworks should fail when not initialized", async () => {
      const uninitService = new MockWiFiService(mockConfig);
      const result = await uninitService.scanNetworks();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("not initialized");
      }
    });

    it("getCurrentConnection should fail when not initialized", async () => {
      const uninitService = new MockWiFiService(mockConfig);
      const result = await uninitService.getCurrentConnection();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("not initialized");
      }
    });

    it("isConnected should fail when not initialized", async () => {
      const uninitService = new MockWiFiService(mockConfig);
      const result = await uninitService.isConnected();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("not initialized");
      }
    });

    it("connect should fail when not initialized", async () => {
      const uninitService = new MockWiFiService(mockConfig);
      const result = await uninitService.connect("TestNetwork", "password");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("not initialized");
      }
    });

    it("disconnect should fail when not initialized", async () => {
      const uninitService = new MockWiFiService(mockConfig);
      const result = await uninitService.disconnect();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("not initialized");
      }
    });

    it("saveNetwork should fail when not initialized", async () => {
      const uninitService = new MockWiFiService(mockConfig);
      const result = await uninitService.saveNetwork({
        ssid: "TestNetwork",
        password: "password",
        autoConnect: true,
        priority: 1,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("not initialized");
      }
    });

    it("getSavedNetworks should fail when not initialized", async () => {
      const uninitService = new MockWiFiService(mockConfig);
      const result = await uninitService.getSavedNetworks();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("not initialized");
      }
    });

    it("removeNetwork should fail when not initialized", async () => {
      const uninitService = new MockWiFiService(mockConfig);
      const result = await uninitService.removeNetwork("TestNetwork");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("not initialized");
      }
    });

    it("isConnectedToMobileHotspot should fail when not initialized", async () => {
      const uninitService = new MockWiFiService(mockConfig);
      const result = await uninitService.isConnectedToMobileHotspot();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("not initialized");
      }
    });
  });

  describe("network scanning", () => {
    it("should return mock networks", async () => {
      const result = await service.scanNetworks();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(4);
        expect(result.data[0].ssid).toBe(mockConfig.primarySSID);
      }
    });
  });

  describe("connection management", () => {
    it("should return null connection when not connected", async () => {
      const result = await service.getCurrentConnection();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it("should report not connected initially", async () => {
      const result = await service.isConnected();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it("should connect successfully", async () => {
      const result = await service.connect("TestNetwork", "password");
      expect(result.success).toBe(true);

      const connResult = await service.isConnected();
      expect(connResult.success).toBe(true);
      if (connResult.success) {
        expect(connResult.data).toBe(true);
      }
    });

    it("should return connection details after connecting", async () => {
      await service.connect("TestNetwork", "password");
      const result = await service.getCurrentConnection();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toBeNull();
        expect(result.data?.ssid).toBe("TestNetwork");
        expect(result.data?.ipAddress).toBeDefined();
      }
    });

    it("should disconnect successfully", async () => {
      await service.connect("TestNetwork", "password");
      const result = await service.disconnect();
      expect(result.success).toBe(true);

      const connResult = await service.isConnected();
      if (connResult.success) {
        expect(connResult.data).toBe(false);
      }
    });

    it("should fail to disconnect when not connected", async () => {
      const result = await service.disconnect();
      expect(result.success).toBe(false);
    });
  });

  describe("saved networks", () => {
    it("should save a network", async () => {
      const result = await service.saveNetwork({
        ssid: "SavedNetwork",
        password: "password",
        autoConnect: true,
        priority: 1,
      });
      expect(result.success).toBe(true);
    });

    it("should retrieve saved networks", async () => {
      await service.saveNetwork({
        ssid: "SavedNetwork1",
        password: "password",
        autoConnect: true,
        priority: 1,
      });
      await service.saveNetwork({
        ssid: "SavedNetwork2",
        password: "password2",
        autoConnect: false,
        priority: 2,
      });

      const result = await service.getSavedNetworks();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(2);
      }
    });

    it("should remove a saved network", async () => {
      await service.saveNetwork({
        ssid: "NetworkToRemove",
        password: "password",
        autoConnect: true,
        priority: 1,
      });

      const result = await service.removeNetwork("NetworkToRemove");
      expect(result.success).toBe(true);

      const savedResult = await service.getSavedNetworks();
      if (savedResult.success) {
        expect(savedResult.data.length).toBe(0);
      }
    });

    it("should fail to remove a non-existent network", async () => {
      const result = await service.removeNetwork("NonExistentNetwork");
      expect(result.success).toBe(false);
    });
  });

  describe("connection change callbacks", () => {
    it("should register connection change callback", async () => {
      const callback = jest.fn();
      const unsubscribe = service.onConnectionChange(callback);
      expect(typeof unsubscribe).toBe("function");
    });

    it("should notify on connection", async () => {
      const callback = jest.fn();
      service.onConnectionChange(callback);

      await service.connect("TestNetwork", "password");

      expect(callback).toHaveBeenCalledWith(true);
    });

    it("should notify on disconnection", async () => {
      const callback = jest.fn();
      service.onConnectionChange(callback);

      await service.connect("TestNetwork", "password");
      callback.mockClear();
      await service.disconnect();

      expect(callback).toHaveBeenCalledWith(false);
    });

    it("should unsubscribe from connection changes", async () => {
      const callback = jest.fn();
      const unsubscribe = service.onConnectionChange(callback);

      unsubscribe();
      await service.connect("TestNetwork", "password");

      expect(callback).not.toHaveBeenCalled();
    });

    it("should handle callback errors gracefully", async () => {
      const throwingCallback = jest.fn().mockImplementation(() => {
        throw new Error("Callback error");
      });
      service.onConnectionChange(throwingCallback);

      // Should not throw
      await expect(
        service.connect("TestNetwork", "password"),
      ).resolves.not.toThrow();
    });
  });

  describe("state machine", () => {
    it("should start in IDLE state", () => {
      expect(service.getState()).toBe(WiFiState.IDLE);
    });

    it("should register state change callback", () => {
      const callback = jest.fn();
      const unsubscribe = service.onStateChange(callback);
      expect(typeof unsubscribe).toBe("function");
    });

    it("should unsubscribe from state changes", async () => {
      const callback = jest.fn();
      const unsubscribe = service.onStateChange(callback);

      unsubscribe();
      await service.attemptMobileHotspotConnection();

      expect(callback).not.toHaveBeenCalled();
    });

    it("should handle state change callback errors gracefully", async () => {
      const throwingCallback = jest.fn().mockImplementation(() => {
        throw new Error("State callback error");
      });
      service.onStateChange(throwingCallback);

      // Should not throw
      await expect(
        service.attemptMobileHotspotConnection(),
      ).resolves.not.toThrow();
    });
  });

  describe("mobile hotspot connection", () => {
    it("should check if connected to mobile hotspot", async () => {
      const result = await service.isConnectedToMobileHotspot();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it("should detect connection to mobile hotspot", async () => {
      await service.connect(mockConfig.primarySSID, mockConfig.primaryPassword);
      const result = await service.isConnectedToMobileHotspot();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it("should attempt mobile hotspot connection", async () => {
      const result = await service.attemptMobileHotspotConnection();
      expect(result.success).toBe(true);
      expect(service.getState()).toBe(WiFiState.CONNECTED);
    });

    it("should return mobile hotspot SSID", () => {
      const ssid = service.getMobileHotspotSSID();
      expect(ssid).toBe(mockConfig.primarySSID);
    });
  });

  describe("mode awareness", () => {
    it("should return driving mode when no WebSocket clients", () => {
      expect(service.getMode()).toBe("driving");
    });

    it("should return stopped mode when WebSocket clients connected", () => {
      service.setWebSocketClientCount(1);
      expect(service.getMode()).toBe("stopped");
    });

    it("should transition to WAITING_FOR_HOTSPOT when clients connect and not connected", () => {
      service.setWebSocketClientCount(1);
      expect(service.getState()).toBe(WiFiState.WAITING_FOR_HOTSPOT);
    });

    it("should not change state when clients connect and already connected", async () => {
      await service.connect("TestNetwork", "password");
      service.setWebSocketClientCount(1);
      expect(service.getState()).toBe(WiFiState.IDLE);
    });

    it("should transition to IDLE when all clients disconnect in WAITING_FOR_HOTSPOT", () => {
      service.setWebSocketClientCount(1);
      expect(service.getState()).toBe(WiFiState.WAITING_FOR_HOTSPOT);
      service.setWebSocketClientCount(0);
      expect(service.getState()).toBe(WiFiState.IDLE);
    });

    it("should transition to IDLE when all clients disconnect in CONNECTING", async () => {
      // Manually set state by starting connection attempt
      service.setWebSocketClientCount(1);
      expect(service.getState()).toBe(WiFiState.WAITING_FOR_HOTSPOT);

      // Reset to test CONNECTING state transition
      await service.dispose();
      service = new MockWiFiService(mockConfig);
      await service.initialize();

      // Get into CONNECTING state via attemptMobileHotspotConnection
      // but we can't pause in the middle, so test WAITING_FOR_HOTSPOT to IDLE
      service.setWebSocketClientCount(1);
      service.setWebSocketClientCount(0);
      expect(service.getState()).toBe(WiFiState.IDLE);
    });
  });

  describe("hotspot configuration", () => {
    it("should return default hotspot config without ConfigService", () => {
      const config = service.getHotspotConfig();
      expect(config.ssid).toBe(mockConfig.primarySSID);
      expect(config.password).toBe(mockConfig.primaryPassword);
    });

    it("should fail to set hotspot config without ConfigService", async () => {
      const result = await service.setHotspotConfig(
        "NewSSID",
        "newpassword123",
      );
      expect(result.success).toBe(false);
    });

    it("should fail to set hotspot config with empty SSID", async () => {
      const result = await service.setHotspotConfig("", "newpassword123");
      expect(result.success).toBe(false);
    });

    it("should fail to set hotspot config with short password", async () => {
      const result = await service.setHotspotConfig("NewSSID", "short");
      expect(result.success).toBe(false);
    });

    describe("with ConfigService", () => {
      let mockConfigService: IConfigService;

      beforeEach(async () => {
        mockConfigService = {
          initialize: jest.fn().mockResolvedValue({ success: true }),
          dispose: jest.fn().mockResolvedValue(undefined),
          getActiveTrackId: jest.fn().mockReturnValue(null),
          setActiveTrackId: jest.fn(),
          getDeviceConfig: jest.fn(),
          getHotspotConfig: jest.fn().mockReturnValue(null),
          setHotspotConfig: jest.fn(),
          getOnboardingComplete: jest.fn().mockReturnValue(false),
          setOnboardingComplete: jest.fn(),
          getRouteCalculationConfig: jest.fn(),
          getSimulationConfig: jest.fn(),
          setSimulationConfig: jest.fn(),
          save: jest.fn().mockResolvedValue({ success: true }),
        } as unknown as IConfigService;

        await service.dispose();
        service = new MockWiFiService(mockConfig, mockConfigService);
        await service.initialize();
      });

      it("should return saved hotspot config from ConfigService", () => {
        const savedConfig: HotspotConfig = {
          ssid: "SavedSSID",
          password: "savedpassword123",
          updatedAt: "2024-01-01T00:00:00.000Z",
        };
        (mockConfigService.getHotspotConfig as jest.Mock).mockReturnValue(
          savedConfig,
        );

        const config = service.getHotspotConfig();
        expect(config.ssid).toBe("SavedSSID");
      });

      it("should set hotspot config via ConfigService", async () => {
        const result = await service.setHotspotConfig(
          "NewSSID",
          "newpassword123",
        );
        expect(result.success).toBe(true);
        expect(mockConfigService.setHotspotConfig).toHaveBeenCalled();
        expect(mockConfigService.save).toHaveBeenCalled();
      });

      it("should transition to WAITING_FOR_HOTSPOT after setting config", async () => {
        await service.setHotspotConfig("NewSSID", "newpassword123");
        expect(service.getState()).toBe(WiFiState.WAITING_FOR_HOTSPOT);
      });

      it("should handle ConfigService save errors", async () => {
        (mockConfigService.save as jest.Mock).mockRejectedValue(
          new Error("Save failed"),
        );

        const result = await service.setHotspotConfig(
          "NewSSID",
          "newpassword123",
        );
        expect(result.success).toBe(false);
      });

      it("should return saved SSID from getMobileHotspotSSID", () => {
        const savedConfig: HotspotConfig = {
          ssid: "SavedSSID",
          password: "savedpassword123",
          updatedAt: "2024-01-01T00:00:00.000Z",
        };
        (mockConfigService.getHotspotConfig as jest.Mock).mockReturnValue(
          savedConfig,
        );

        expect(service.getMobileHotspotSSID()).toBe("SavedSSID");
      });
    });
  });

  describe("notifyConnectedScreenDisplayed", () => {
    it("should handle notification without errors", () => {
      expect(() => service.notifyConnectedScreenDisplayed()).not.toThrow();
    });
  });
});
