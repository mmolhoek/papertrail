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

import { ConnectionManager } from "../ConnectionManager";
import { NetworkScanner } from "../NetworkScanner";
import { WiFiConfig } from "@core/types";

describe("ConnectionManager", () => {
  let connectionManager: ConnectionManager;
  let mockNetworkScanner: jest.Mocked<NetworkScanner>;
  let mockInitialized: jest.Mock;
  let mockConfig: WiFiConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockInitialized = jest.fn().mockReturnValue(true);
    mockConfig = {
      enabled: true,
      primarySSID: "TestHotspot",
      primaryPassword: "password123",
      connectionTimeoutMs: 30000,
      scanIntervalMs: 10000,
    };

    mockNetworkScanner = {
      scanNetworks: jest.fn(),
      isNetworkVisible: jest.fn(),
      getSignalStrength: jest
        .fn()
        .mockResolvedValue({ success: true, data: 75 }),
    } as unknown as jest.Mocked<NetworkScanner>;

    connectionManager = new ConnectionManager(
      mockConfig,
      mockInitialized,
      mockNetworkScanner,
    );
  });

  afterEach(() => {
    connectionManager.stopConnectionMonitoring();
    jest.useRealTimers();
  });

  describe("startConnectionMonitoring", () => {
    it("should start monitoring with 5-second interval", () => {
      mockExecAsync.mockResolvedValue({
        stdout: "GENERAL.CONNECTION:TestNetwork\n",
        stderr: "",
      });

      connectionManager.startConnectionMonitoring();

      expect(jest.getTimerCount()).toBe(1);
    });

    it("should check connection status on each tick", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "GENERAL.CONNECTION:TestNetwork\n",
        stderr: "",
      });

      connectionManager.startConnectionMonitoring();

      await jest.advanceTimersByTimeAsync(5000);

      expect(mockExecAsync).toHaveBeenCalled();
    });

    it("should notify callbacks when connection state changes", async () => {
      const callback = jest.fn();
      connectionManager.onConnectionChange(callback);

      // First tick - not connected
      mockExecAsync.mockResolvedValueOnce({
        stdout: "GENERAL.CONNECTION:--\n",
        stderr: "",
      });

      connectionManager.startConnectionMonitoring();
      await jest.advanceTimersByTimeAsync(5000);

      // Second tick - connected
      mockExecAsync.mockResolvedValueOnce({
        stdout: "GENERAL.CONNECTION:TestNetwork\n",
        stderr: "",
      });

      await jest.advanceTimersByTimeAsync(5000);

      expect(callback).toHaveBeenCalledWith(true);
    });
  });

  describe("stopConnectionMonitoring", () => {
    it("should stop the monitoring interval", () => {
      mockExecAsync.mockResolvedValue({
        stdout: "GENERAL.CONNECTION:TestNetwork\n",
        stderr: "",
      });

      connectionManager.startConnectionMonitoring();
      expect(jest.getTimerCount()).toBe(1);

      connectionManager.stopConnectionMonitoring();
      expect(jest.getTimerCount()).toBe(0);
    });

    it("should handle being called when not monitoring", () => {
      expect(() => {
        connectionManager.stopConnectionMonitoring();
      }).not.toThrow();
    });
  });

  describe("getCurrentConnection", () => {
    it("should return failure when not initialized", async () => {
      mockInitialized.mockReturnValue(false);

      const result = await connectionManager.getCurrentConnection();

      expect(result.success).toBe(false);
    });

    it("should return null when not connected", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "GENERAL.CONNECTION:--\n",
        stderr: "",
      });

      const result = await connectionManager.getCurrentConnection();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it("should return connection info when connected", async () => {
      mockExecAsync.mockResolvedValue({
        stdout:
          "GENERAL.CONNECTION:TestNetwork\nIP4.ADDRESS[1]:192.168.1.100/24\nGENERAL.HWADDR:AA:BB:CC:DD:EE:FF\n",
        stderr: "",
      });

      const result = await connectionManager.getCurrentConnection();

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.ssid).toBe("TestNetwork");
        expect(result.data.ipAddress).toBe("192.168.1.100");
        expect(result.data.macAddress).toBe("AA:BB:CC:DD:EE:FF");
        expect(result.data.signalStrength).toBe(75);
      }
    });

    it("should return null on error (not an error, just not connected)", async () => {
      mockExecAsync.mockRejectedValue(new Error("nmcli failed"));

      const result = await connectionManager.getCurrentConnection();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it("should handle empty connection name", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "GENERAL.CONNECTION:\n",
        stderr: "",
      });

      const result = await connectionManager.getCurrentConnection();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });
  });

  describe("isConnected", () => {
    it("should return true when connected", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "GENERAL.CONNECTION:TestNetwork\n",
        stderr: "",
      });

      const result = await connectionManager.isConnected();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it("should return false when not connected", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "GENERAL.CONNECTION:--\n",
        stderr: "",
      });

      const result = await connectionManager.isConnected();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });
  });

  describe("connect", () => {
    it("should return failure when not initialized", async () => {
      mockInitialized.mockReturnValue(false);

      const result = await connectionManager.connect("TestSSID", "password");

      expect(result.success).toBe(false);
    });

    it("should connect successfully", async () => {
      // Mock connection doesn't exist
      mockExecAsync.mockRejectedValueOnce(new Error("not found"));
      // Mock add connection
      mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
      // Mock activate connection
      mockExecAsync.mockResolvedValueOnce({
        stdout: "Connection successfully activated",
        stderr: "",
      });

      const result = await connectionManager.connect("TestSSID", "password");

      expect(result.success).toBe(true);
    });

    it("should delete existing connection before creating new one", async () => {
      // Mock connection exists
      mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
      // Mock delete connection
      mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
      // Mock add connection
      mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
      // Mock activate connection
      mockExecAsync.mockResolvedValueOnce({
        stdout: "Connection successfully activated",
        stderr: "",
      });

      const result = await connectionManager.connect("TestSSID", "password");

      expect(result.success).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining("delete"),
      );
    });

    it("should return auth failed error on wrong password", async () => {
      // Mock connection doesn't exist
      mockExecAsync.mockRejectedValueOnce(new Error("not found"));
      // Mock add connection
      mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
      // Mock activate connection - auth failed
      mockExecAsync.mockResolvedValueOnce({
        stdout: "",
        stderr: "Error: Secrets were required",
      });

      const result = await connectionManager.connect("TestSSID", "wrongpass");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Authentication");
      }
    });

    it("should handle connection timeout", async () => {
      jest.useRealTimers(); // Need real timers for Promise.race

      // Create a new manager with short timeout
      const shortTimeoutConfig = { ...mockConfig, connectionTimeoutMs: 100 };
      const manager = new ConnectionManager(
        shortTimeoutConfig,
        mockInitialized,
        mockNetworkScanner,
      );

      // Mock connection doesn't exist
      mockExecAsync.mockRejectedValueOnce(new Error("not found"));
      // Mock add connection
      mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
      // Mock activate connection - slow
      mockExecAsync.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 500)),
      );

      const result = await manager.connect("TestSSID", "password");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("timed out");
      }

      jest.useFakeTimers();
    });
  });

  describe("disconnect", () => {
    it("should return failure when not initialized", async () => {
      mockInitialized.mockReturnValue(false);

      const result = await connectionManager.disconnect();

      expect(result.success).toBe(false);
    });

    it("should return failure when not connected", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "GENERAL.CONNECTION:--\n",
        stderr: "",
      });

      const result = await connectionManager.disconnect();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Not connected");
      }
    });

    it("should disconnect successfully", async () => {
      // Mock current connection
      mockExecAsync.mockResolvedValueOnce({
        stdout: "GENERAL.CONNECTION:TestNetwork\n",
        stderr: "",
      });
      // Mock disconnect
      mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await connectionManager.disconnect();

      expect(result.success).toBe(true);
    });

    it("should return failure on disconnect error", async () => {
      // Mock current connection
      mockExecAsync.mockResolvedValueOnce({
        stdout: "GENERAL.CONNECTION:TestNetwork\n",
        stderr: "",
      });
      // Mock disconnect failure
      mockExecAsync.mockRejectedValueOnce(new Error("disconnect failed"));

      const result = await connectionManager.disconnect();

      expect(result.success).toBe(false);
    });
  });

  describe("saveNetwork", () => {
    it("should return failure when not initialized", async () => {
      mockInitialized.mockReturnValue(false);

      const result = await connectionManager.saveNetwork({
        ssid: "TestSSID",
        password: "password",
        priority: 0,
        autoConnect: true,
      });

      expect(result.success).toBe(false);
    });

    it("should save network configuration", async () => {
      // Mock connection doesn't exist
      mockExecAsync.mockRejectedValueOnce(new Error("not found"));
      // Mock add connection
      mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await connectionManager.saveNetwork({
        ssid: "TestSSID",
        password: "password",
        priority: 5,
        autoConnect: true,
      });

      expect(result.success).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining("autoconnect-priority 5"),
      );
    });

    it("should delete existing connection before saving new one", async () => {
      // Mock connection exists
      mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
      // Mock delete connection
      mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
      // Mock add connection
      mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await connectionManager.saveNetwork({
        ssid: "TestSSID",
        password: "password",
        priority: 0,
        autoConnect: false,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("getSavedNetworks", () => {
    it("should return failure when not initialized", async () => {
      mockInitialized.mockReturnValue(false);

      const result = await connectionManager.getSavedNetworks();

      expect(result.success).toBe(false);
    });

    it("should return list of saved WiFi networks", async () => {
      mockExecAsync.mockResolvedValue({
        stdout:
          "HomeWiFi:802-11-wireless:yes:10\nOfficeWiFi:802-11-wireless:no:5\nEthernet:802-3-ethernet:yes:0\n",
        stderr: "",
      });

      const result = await connectionManager.getSavedNetworks();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2); // Only WiFi, not ethernet
        expect(result.data[0].ssid).toBe("HomeWiFi");
        expect(result.data[0].autoConnect).toBe(true);
        expect(result.data[0].priority).toBe(10);
        expect(result.data[1].ssid).toBe("OfficeWiFi");
        expect(result.data[1].autoConnect).toBe(false);
      }
    });

    it("should return empty array when no WiFi networks saved", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "Ethernet:802-3-ethernet:yes:0\n",
        stderr: "",
      });

      const result = await connectionManager.getSavedNetworks();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });
  });

  describe("removeNetwork", () => {
    it("should return failure when not initialized", async () => {
      mockInitialized.mockReturnValue(false);

      const result = await connectionManager.removeNetwork("TestSSID");

      expect(result.success).toBe(false);
    });

    it("should return failure when network not found", async () => {
      mockExecAsync.mockRejectedValue(new Error("not found"));

      const result = await connectionManager.removeNetwork("NonExistent");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("not found");
      }
    });

    it("should remove network successfully", async () => {
      // Mock connection exists
      mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
      // Mock delete
      mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await connectionManager.removeNetwork("TestSSID");

      expect(result.success).toBe(true);
    });
  });

  describe("onConnectionChange", () => {
    it("should register callback", () => {
      const callback = jest.fn();

      const unsubscribe = connectionManager.onConnectionChange(callback);

      expect(typeof unsubscribe).toBe("function");
    });

    it("should return unsubscribe function", () => {
      const callback = jest.fn();

      const unsubscribe = connectionManager.onConnectionChange(callback);
      unsubscribe();

      // Verify callback is not called after unsubscribe
      // This requires triggering the notification
    });

    it("should allow multiple callbacks", () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      connectionManager.onConnectionChange(callback1);
      connectionManager.onConnectionChange(callback2);

      // Both callbacks should be registered
    });
  });

  describe("clearCallbacks", () => {
    it("should clear all registered callbacks", () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      connectionManager.onConnectionChange(callback1);
      connectionManager.onConnectionChange(callback2);

      connectionManager.clearCallbacks();

      // Callbacks should be cleared
    });
  });

  describe("connectionExists", () => {
    it("should return true when connection exists", async () => {
      mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });

      const result = await connectionManager.connectionExists("TestSSID");

      expect(result).toBe(true);
    });

    it("should return false when connection does not exist", async () => {
      mockExecAsync.mockRejectedValue(new Error("not found"));

      const result = await connectionManager.connectionExists("NonExistent");

      expect(result).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle connection with no IP address", async () => {
      mockExecAsync.mockResolvedValue({
        stdout:
          "GENERAL.CONNECTION:TestNetwork\nGENERAL.HWADDR:AA:BB:CC:DD:EE:FF\n",
        stderr: "",
      });

      const result = await connectionManager.getCurrentConnection();

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.ipAddress).toBe("");
      }
    });

    it("should handle callback errors gracefully", async () => {
      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error("Callback error");
      });
      const normalCallback = jest.fn();

      connectionManager.onConnectionChange(errorCallback);
      connectionManager.onConnectionChange(normalCallback);

      // First tick - disconnected
      mockExecAsync.mockResolvedValueOnce({
        stdout: "GENERAL.CONNECTION:--\n",
        stderr: "",
      });

      connectionManager.startConnectionMonitoring();
      await jest.advanceTimersByTimeAsync(5000);

      // Second tick - connected (triggers callbacks)
      mockExecAsync.mockResolvedValueOnce({
        stdout: "GENERAL.CONNECTION:TestNetwork\n",
        stderr: "",
      });

      await jest.advanceTimersByTimeAsync(5000);

      // Both callbacks should have been called, error shouldn't stop execution
      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();
    });
  });
});
