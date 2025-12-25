// Mock child_process exec - must be declared before imports
const mockExecAsync = jest.fn();

jest.mock("child_process", () => ({
  exec: jest.fn(),
}));

jest.mock("util", () => {
  const actual = jest.requireActual("util");
  return {
    ...actual,
    promisify: () => mockExecAsync,
  };
});

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

import { HotspotManager } from "../HotspotManager";
import { NetworkScanner } from "../NetworkScanner";
import { ConnectionManager } from "../ConnectionManager";
import { IConfigService } from "@core/interfaces";
import { WiFiConfig, WiFiState, WiFiConnection } from "@core/types";

// Helper to create a mock WiFiConnection
const createMockConnection = (ssid: string): WiFiConnection => ({
  ssid,
  ipAddress: "192.168.1.100",
  macAddress: "AA:BB:CC:DD:EE:FF",
  signalStrength: 75,
  connectedAt: new Date(),
});

describe("HotspotManager", () => {
  let hotspotManager: HotspotManager;
  let mockNetworkScanner: jest.Mocked<NetworkScanner>;
  let mockConnectionManager: jest.Mocked<ConnectionManager>;
  let mockConfigService: jest.Mocked<IConfigService>;
  let mockSetState: jest.Mock;
  let mockConfig: WiFiConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockConfig = {
      enabled: true,
      primarySSID: "MyHotspot",
      primaryPassword: "password123",
      connectionTimeoutMs: 30000,
      scanIntervalMs: 10000,
    };

    mockNetworkScanner = {
      scanNetworks: jest.fn(),
      isNetworkVisible: jest
        .fn()
        .mockResolvedValue({ success: true, data: true }),
      getSignalStrength: jest
        .fn()
        .mockResolvedValue({ success: true, data: 75 }),
    } as unknown as jest.Mocked<NetworkScanner>;

    mockConnectionManager = {
      getCurrentConnection: jest.fn().mockResolvedValue({
        success: true,
        data: createMockConnection("HomeWiFi"),
      }),
      isConnected: jest.fn().mockResolvedValue({ success: true, data: true }),
      connect: jest.fn().mockResolvedValue({ success: true, data: undefined }),
      disconnect: jest
        .fn()
        .mockResolvedValue({ success: true, data: undefined }),
    } as unknown as jest.Mocked<ConnectionManager>;

    mockConfigService = {
      getHotspotConfig: jest.fn().mockReturnValue(undefined),
      setHotspotConfig: jest.fn(),
      getWiFiFallbackNetwork: jest.fn().mockReturnValue(undefined),
      setWiFiFallbackNetwork: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      isOnboardingCompleted: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<IConfigService>;

    mockSetState = jest.fn();

    hotspotManager = new HotspotManager(
      mockConfig,
      mockConfigService,
      mockNetworkScanner,
      mockConnectionManager,
      mockSetState,
    );
  });

  afterEach(() => {
    hotspotManager.abortConnectionAttempt();
    jest.useRealTimers();
  });

  describe("isConnectedToMobileHotspot", () => {
    it("should return true when connected to configured hotspot", async () => {
      mockConnectionManager.getCurrentConnection.mockResolvedValue({
        success: true,
        data: createMockConnection("MyHotspot"),
      });

      const result = await hotspotManager.isConnectedToMobileHotspot();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it("should return false when connected to different network", async () => {
      mockConnectionManager.getCurrentConnection.mockResolvedValue({
        success: true,
        data: createMockConnection("OtherNetwork"),
      });

      const result = await hotspotManager.isConnectedToMobileHotspot();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it("should return false when not connected", async () => {
      mockConnectionManager.getCurrentConnection.mockResolvedValue({
        success: true,
        data: null,
      });

      const result = await hotspotManager.isConnectedToMobileHotspot();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it("should use saved hotspot config when available", async () => {
      mockConfigService.getHotspotConfig.mockReturnValue({
        ssid: "SavedHotspot",
        password: "savedpass",
        updatedAt: new Date().toISOString(),
      });

      mockConnectionManager.getCurrentConnection.mockResolvedValue({
        success: true,
        data: createMockConnection("SavedHotspot"),
      });

      const result = await hotspotManager.isConnectedToMobileHotspot();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it("should return failure when connection check fails", async () => {
      mockConnectionManager.getCurrentConnection.mockResolvedValue({
        success: false,
        error: new Error("Connection check failed"),
      });

      const result = await hotspotManager.isConnectedToMobileHotspot();

      expect(result.success).toBe(false);
    });
  });

  describe("attemptMobileHotspotConnection", () => {
    it("should reject duplicate connection attempts", async () => {
      // Start first connection attempt
      mockNetworkScanner.isNetworkVisible.mockResolvedValue({
        success: true,
        data: true,
      });
      mockConnectionManager.connect.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ success: true, data: undefined }),
              10000,
            ),
          ),
      );

      void hotspotManager.attemptMobileHotspotConnection();

      // Try second attempt immediately
      const promise2 = hotspotManager.attemptMobileHotspotConnection();

      const result2 = await promise2;

      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.error.message).toContain("already in progress");
      }

      // Clean up
      hotspotManager.abortConnectionAttempt();
    });

    it("should return failure when hotspot not visible", async () => {
      mockNetworkScanner.isNetworkVisible.mockResolvedValue({
        success: true,
        data: false,
      });

      const result = await hotspotManager.attemptMobileHotspotConnection();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("not found");
      }
      expect(mockSetState).not.toHaveBeenCalled();
    });

    it("should set state to CONNECTING when hotspot is visible", async () => {
      jest.useRealTimers();

      mockNetworkScanner.isNetworkVisible.mockResolvedValue({
        success: true,
        data: true,
      });
      mockConnectionManager.connect.mockResolvedValue({
        success: true,
        data: undefined,
      });
      mockConnectionManager.getCurrentConnection.mockResolvedValue({
        success: true,
        data: createMockConnection("MyHotspot"),
      });

      await hotspotManager.attemptMobileHotspotConnection();

      expect(mockSetState).toHaveBeenCalledWith(WiFiState.CONNECTING);

      jest.useFakeTimers();
    });

    it("should set state to CONNECTED on successful connection", async () => {
      jest.useRealTimers();

      mockNetworkScanner.isNetworkVisible.mockResolvedValue({
        success: true,
        data: true,
      });
      mockConnectionManager.connect.mockResolvedValue({
        success: true,
        data: undefined,
      });
      mockConnectionManager.getCurrentConnection.mockResolvedValue({
        success: true,
        data: createMockConnection("MyHotspot"),
      });

      const result = await hotspotManager.attemptMobileHotspotConnection();

      expect(result.success).toBe(true);
      expect(mockSetState).toHaveBeenCalledWith(WiFiState.CONNECTED);

      jest.useFakeTimers();
    });

    it("should clear fallback network on successful connection", async () => {
      jest.useRealTimers();

      mockNetworkScanner.isNetworkVisible.mockResolvedValue({
        success: true,
        data: true,
      });
      mockConnectionManager.connect.mockResolvedValue({
        success: true,
        data: undefined,
      });
      mockConnectionManager.getCurrentConnection.mockResolvedValue({
        success: true,
        data: createMockConnection("MyHotspot"),
      });

      await hotspotManager.attemptMobileHotspotConnection();

      expect(mockConfigService.setWiFiFallbackNetwork).toHaveBeenCalledWith(
        null,
      );

      jest.useFakeTimers();
    });
  });

  describe("abortConnectionAttempt", () => {
    it("should abort in-progress connection attempt", () => {
      // Start a connection attempt
      mockNetworkScanner.isNetworkVisible.mockResolvedValue({
        success: true,
        data: true,
      });
      mockConnectionManager.connect.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ success: true, data: undefined }),
              10000,
            ),
          ),
      );

      hotspotManager.attemptMobileHotspotConnection();

      expect(hotspotManager.isConnectionAttemptInProgress()).toBe(true);

      hotspotManager.abortConnectionAttempt();

      expect(hotspotManager.isConnectionAttemptInProgress()).toBe(false);
    });

    it("should handle abort when no connection in progress", () => {
      expect(() => {
        hotspotManager.abortConnectionAttempt();
      }).not.toThrow();
    });
  });

  describe("isConnectionAttemptInProgress", () => {
    it("should return false initially", () => {
      expect(hotspotManager.isConnectionAttemptInProgress()).toBe(false);
    });

    it("should return true during connection attempt", () => {
      mockNetworkScanner.isNetworkVisible.mockResolvedValue({
        success: true,
        data: true,
      });
      mockConnectionManager.connect.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ success: true, data: undefined }),
              10000,
            ),
          ),
      );

      hotspotManager.attemptMobileHotspotConnection();

      expect(hotspotManager.isConnectionAttemptInProgress()).toBe(true);
    });
  });

  describe("getMobileHotspotSSID", () => {
    it("should return default SSID when no saved config", () => {
      mockConfigService.getHotspotConfig.mockReturnValue(undefined);

      const ssid = hotspotManager.getMobileHotspotSSID();

      expect(ssid).toBe("MyHotspot");
    });

    it("should return saved SSID when config exists", () => {
      mockConfigService.getHotspotConfig.mockReturnValue({
        ssid: "SavedHotspot",
        password: "savedpass",
        updatedAt: new Date().toISOString(),
      });

      const ssid = hotspotManager.getMobileHotspotSSID();

      expect(ssid).toBe("SavedHotspot");
    });
  });

  describe("getHotspotConfig", () => {
    it("should return saved config when available", () => {
      const savedConfig = {
        ssid: "SavedHotspot",
        password: "savedpass",
        updatedAt: new Date().toISOString(),
      };
      mockConfigService.getHotspotConfig.mockReturnValue(savedConfig);

      const config = hotspotManager.getHotspotConfig();

      expect(config.ssid).toBe("SavedHotspot");
    });

    it("should return default config when no saved config", () => {
      mockConfigService.getHotspotConfig.mockReturnValue(undefined);

      const config = hotspotManager.getHotspotConfig();

      expect(config.ssid).toBe("MyHotspot");
      expect(config.password).toBe("password123");
    });
  });

  describe("setHotspotConfig", () => {
    it("should reject empty SSID", async () => {
      const result = await hotspotManager.setHotspotConfig("", "password");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("empty");
      }
    });

    it("should reject short password", async () => {
      const result = await hotspotManager.setHotspotConfig("TestSSID", "short");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("8 characters");
      }
    });

    it("should save config and trigger reconnection", async () => {
      const result = await hotspotManager.setHotspotConfig(
        "NewHotspot",
        "newpassword123",
      );

      expect(result.success).toBe(true);
      expect(mockConfigService.setHotspotConfig).toHaveBeenCalled();
      expect(mockConfigService.save).toHaveBeenCalled();
      expect(mockConnectionManager.disconnect).toHaveBeenCalled();
      expect(mockSetState).toHaveBeenCalledWith(WiFiState.WAITING_FOR_HOTSPOT);
    });

    it("should return failure when no config service", async () => {
      const manager = new HotspotManager(
        mockConfig,
        undefined,
        mockNetworkScanner,
        mockConnectionManager,
        mockSetState,
      );

      const result = await manager.setHotspotConfig("TestSSID", "password123");

      expect(result.success).toBe(false);
    });
  });

  describe("connected screen tracking", () => {
    it("should track connected screen display", () => {
      expect(hotspotManager.hasConnectedScreenBeenDisplayed()).toBe(false);

      hotspotManager.notifyConnectedScreenDisplayed();

      expect(hotspotManager.hasConnectedScreenBeenDisplayed()).toBe(true);
    });

    it("should reset connected screen flag", () => {
      hotspotManager.notifyConnectedScreenDisplayed();
      expect(hotspotManager.hasConnectedScreenBeenDisplayed()).toBe(true);

      hotspotManager.resetConnectedScreenDisplayed();

      expect(hotspotManager.hasConnectedScreenBeenDisplayed()).toBe(false);
    });
  });

  describe("saveFallbackNetwork", () => {
    it("should save current connection as fallback", async () => {
      mockConnectionManager.getCurrentConnection.mockResolvedValue({
        success: true,
        data: createMockConnection("HomeWiFi"),
      });

      await hotspotManager.saveFallbackNetwork();

      expect(mockConfigService.setWiFiFallbackNetwork).toHaveBeenCalledWith(
        expect.objectContaining({ ssid: "HomeWiFi" }),
      );
      expect(mockConfigService.save).toHaveBeenCalled();
    });

    it("should not save hotspot as fallback", async () => {
      mockConnectionManager.getCurrentConnection.mockResolvedValue({
        success: true,
        data: createMockConnection("MyHotspot"),
      });

      await hotspotManager.saveFallbackNetwork();

      expect(mockConfigService.setWiFiFallbackNetwork).not.toHaveBeenCalled();
    });

    it("should handle no current connection", async () => {
      mockConnectionManager.getCurrentConnection.mockResolvedValue({
        success: true,
        data: null,
      });

      await hotspotManager.saveFallbackNetwork();

      expect(mockConfigService.setWiFiFallbackNetwork).not.toHaveBeenCalled();
    });

    it("should handle missing config service", async () => {
      const manager = new HotspotManager(
        mockConfig,
        undefined,
        mockNetworkScanner,
        mockConnectionManager,
        mockSetState,
      );

      await expect(manager.saveFallbackNetwork()).resolves.not.toThrow();
    });
  });

  describe("clearFallbackNetwork", () => {
    it("should clear fallback network from config", async () => {
      await hotspotManager.clearFallbackNetwork();

      expect(mockConfigService.setWiFiFallbackNetwork).toHaveBeenCalledWith(
        null,
      );
      expect(mockConfigService.save).toHaveBeenCalled();
    });

    it("should handle missing config service", async () => {
      const manager = new HotspotManager(
        mockConfig,
        undefined,
        mockNetworkScanner,
        mockConnectionManager,
        mockSetState,
      );

      await expect(manager.clearFallbackNetwork()).resolves.not.toThrow();
    });
  });

  describe("reconnectToFallback", () => {
    it("should return success when no fallback network saved", async () => {
      mockConfigService.getWiFiFallbackNetwork.mockReturnValue(undefined);

      const result = await hotspotManager.reconnectToFallback();

      expect(result.success).toBe(true);
    });

    it("should attempt to reconnect to saved fallback", async () => {
      mockConfigService.getWiFiFallbackNetwork.mockReturnValue({
        ssid: "HomeWiFi",
        savedAt: new Date().toISOString(),
      });
      mockExecAsync.mockResolvedValue({
        stdout: "Connection successfully activated",
        stderr: "",
      });

      const result = await hotspotManager.reconnectToFallback();

      expect(result.success).toBe(true);
      expect(mockConnectionManager.disconnect).toHaveBeenCalled();
    });

    it("should return failure when reconnect fails", async () => {
      mockConfigService.getWiFiFallbackNetwork.mockReturnValue({
        ssid: "HomeWiFi",
        savedAt: new Date().toISOString(),
      });
      mockExecAsync.mockRejectedValue(new Error("Connection failed"));

      const result = await hotspotManager.reconnectToFallback();

      expect(result.success).toBe(false);
    });

    it("should return failure when no config service", async () => {
      const manager = new HotspotManager(
        mockConfig,
        undefined,
        mockNetworkScanner,
        mockConnectionManager,
        mockSetState,
      );

      const result = await manager.reconnectToFallback();

      expect(result.success).toBe(false);
    });
  });

  describe("getEffectiveHotspotSSID", () => {
    it("should return default SSID when no saved config", () => {
      mockConfigService.getHotspotConfig.mockReturnValue(undefined);

      const ssid = hotspotManager.getEffectiveHotspotSSID();

      expect(ssid).toBe("MyHotspot");
    });

    it("should return saved SSID when config exists", () => {
      mockConfigService.getHotspotConfig.mockReturnValue({
        ssid: "SavedHotspot",
        password: "savedpass",
        updatedAt: new Date().toISOString(),
      });

      const ssid = hotspotManager.getEffectiveHotspotSSID();

      expect(ssid).toBe("SavedHotspot");
    });
  });

  describe("getEffectiveHotspotPassword", () => {
    it("should return default password when no saved config", () => {
      mockConfigService.getHotspotConfig.mockReturnValue(undefined);

      const password = hotspotManager.getEffectiveHotspotPassword();

      expect(password).toBe("password123");
    });

    it("should return saved password when config exists", () => {
      mockConfigService.getHotspotConfig.mockReturnValue({
        ssid: "SavedHotspot",
        password: "savedpass",
        updatedAt: new Date().toISOString(),
      });

      const password = hotspotManager.getEffectiveHotspotPassword();

      expect(password).toBe("savedpass");
    });
  });
});
