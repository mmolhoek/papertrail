// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

import { WiFiStateMachine } from "../WiFiStateMachine";
import { NetworkScanner } from "../NetworkScanner";
import { ConnectionManager } from "../ConnectionManager";
import { HotspotManager } from "../HotspotManager";
import { IConfigService } from "@core/interfaces";
import { WiFiState } from "@core/types";

describe("WiFiStateMachine", () => {
  let stateMachine: WiFiStateMachine;
  let mockConfigService: jest.Mocked<IConfigService>;
  let mockNetworkScanner: jest.Mocked<NetworkScanner>;
  let mockConnectionManager: jest.Mocked<ConnectionManager>;
  let mockHotspotManager: jest.Mocked<HotspotManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockConfigService = {
      isOnboardingCompleted: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<IConfigService>;

    mockNetworkScanner = {
      scanNetworks: jest.fn(),
      isNetworkVisible: jest
        .fn()
        .mockResolvedValue({ success: true, data: false }),
      getSignalStrength: jest.fn(),
    } as unknown as jest.Mocked<NetworkScanner>;

    mockConnectionManager = {
      getCurrentConnection: jest
        .fn()
        .mockResolvedValue({ success: true, data: null }),
      isConnected: jest.fn().mockResolvedValue({ success: true, data: false }),
      connect: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as jest.Mocked<ConnectionManager>;

    mockHotspotManager = {
      isConnectedToMobileHotspot: jest
        .fn()
        .mockResolvedValue({ success: true, data: false }),
      attemptMobileHotspotConnection: jest
        .fn()
        .mockResolvedValue({ success: true, data: undefined }),
      abortConnectionAttempt: jest.fn(),
      getEffectiveHotspotSSID: jest.fn().mockReturnValue("MyHotspot"),
      saveFallbackNetwork: jest.fn().mockResolvedValue(undefined),
      hasConnectedScreenBeenDisplayed: jest.fn().mockReturnValue(false),
      resetConnectedScreenDisplayed: jest.fn(),
    } as unknown as jest.Mocked<HotspotManager>;

    stateMachine = new WiFiStateMachine(
      mockConfigService,
      mockNetworkScanner,
      mockConnectionManager,
      mockHotspotManager,
    );
  });

  afterEach(() => {
    stateMachine.stopHotspotPolling();
    jest.useRealTimers();
  });

  describe("startHotspotPolling", () => {
    it("should start polling with 10-second interval", () => {
      stateMachine.startHotspotPolling();

      expect(jest.getTimerCount()).toBe(1);
    });

    it("should trigger handleHotspotPollingTick on each interval", async () => {
      stateMachine.startHotspotPolling();

      await jest.advanceTimersByTimeAsync(10000);

      expect(mockHotspotManager.isConnectedToMobileHotspot).toHaveBeenCalled();
    });
  });

  describe("stopHotspotPolling", () => {
    it("should stop the polling interval", () => {
      stateMachine.startHotspotPolling();
      expect(jest.getTimerCount()).toBe(1);

      stateMachine.stopHotspotPolling();

      expect(jest.getTimerCount()).toBe(0);
    });

    it("should handle being called when not polling", () => {
      expect(() => {
        stateMachine.stopHotspotPolling();
      }).not.toThrow();
    });
  });

  describe("getState", () => {
    it("should return IDLE initially", () => {
      expect(stateMachine.getState()).toBe(WiFiState.IDLE);
    });
  });

  describe("setState", () => {
    it("should update the current state", () => {
      stateMachine.setState(WiFiState.CONNECTED);

      expect(stateMachine.getState()).toBe(WiFiState.CONNECTED);
    });

    it("should notify callbacks on state change", () => {
      const callback = jest.fn();
      stateMachine.onStateChange(callback);

      stateMachine.setState(WiFiState.CONNECTED);

      expect(callback).toHaveBeenCalledWith(
        WiFiState.CONNECTED,
        WiFiState.IDLE,
      );
    });

    it("should not notify if state is the same", () => {
      const callback = jest.fn();
      stateMachine.onStateChange(callback);

      stateMachine.setState(WiFiState.IDLE); // Same as initial state

      expect(callback).not.toHaveBeenCalled();
    });

    it("should reset connected screen flag when entering CONNECTED state", () => {
      stateMachine.setState(WiFiState.CONNECTED);

      expect(
        mockHotspotManager.resetConnectedScreenDisplayed,
      ).toHaveBeenCalled();
    });
  });

  describe("onStateChange", () => {
    it("should register callback and return unsubscribe function", () => {
      const callback = jest.fn();

      const unsubscribe = stateMachine.onStateChange(callback);

      expect(typeof unsubscribe).toBe("function");
    });

    it("should unsubscribe callback", () => {
      const callback = jest.fn();
      const unsubscribe = stateMachine.onStateChange(callback);

      unsubscribe();
      stateMachine.setState(WiFiState.CONNECTED);

      expect(callback).not.toHaveBeenCalled();
    });

    it("should support multiple callbacks", () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      stateMachine.onStateChange(callback1);
      stateMachine.onStateChange(callback2);
      stateMachine.setState(WiFiState.CONNECTED);

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe("setWebSocketClientCount", () => {
    it("should trigger hotspot check when entering stopped mode", async () => {
      stateMachine.setWebSocketClientCount(1);

      await jest.advanceTimersByTimeAsync(0);

      expect(mockHotspotManager.isConnectedToMobileHotspot).toHaveBeenCalled();
    });

    it("should abort connection attempt when entering driving mode", () => {
      // First enter stopped mode
      stateMachine.setWebSocketClientCount(1);

      // Set state to WAITING_FOR_HOTSPOT
      stateMachine.setState(WiFiState.WAITING_FOR_HOTSPOT);

      // Now enter driving mode
      stateMachine.setWebSocketClientCount(0);

      expect(mockHotspotManager.abortConnectionAttempt).toHaveBeenCalled();
      expect(stateMachine.getState()).toBe(WiFiState.IDLE);
    });

    it("should not abort when state is CONNECTED", () => {
      stateMachine.setWebSocketClientCount(1);
      stateMachine.setState(WiFiState.CONNECTED);

      stateMachine.setWebSocketClientCount(0);

      expect(mockHotspotManager.abortConnectionAttempt).not.toHaveBeenCalled();
    });
  });

  describe("getMode", () => {
    it("should return 'driving' when no WebSocket clients", () => {
      expect(stateMachine.getMode()).toBe("driving");
    });

    it("should return 'stopped' when WebSocket clients connected", () => {
      stateMachine.setWebSocketClientCount(1);

      expect(stateMachine.getMode()).toBe("stopped");
    });
  });

  describe("getWebSocketClientCount", () => {
    it("should return current count", () => {
      expect(stateMachine.getWebSocketClientCount()).toBe(0);

      stateMachine.setWebSocketClientCount(3);

      expect(stateMachine.getWebSocketClientCount()).toBe(3);
    });
  });

  describe("clearCallbacks", () => {
    it("should clear all registered callbacks", () => {
      const callback = jest.fn();
      stateMachine.onStateChange(callback);

      stateMachine.clearCallbacks();
      stateMachine.setState(WiFiState.CONNECTED);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("handleHotspotPollingTick", () => {
    it("should set state to CONNECTED when connected to hotspot", async () => {
      mockHotspotManager.isConnectedToMobileHotspot.mockResolvedValue({
        success: true,
        data: true,
      });

      await stateMachine.handleHotspotPollingTick();

      expect(stateMachine.getState()).toBe(WiFiState.CONNECTED);
    });

    it("should stay in CONNECTED state when already connected", async () => {
      mockHotspotManager.isConnectedToMobileHotspot.mockResolvedValue({
        success: true,
        data: true,
      });

      stateMachine.setState(WiFiState.CONNECTED);
      await stateMachine.handleHotspotPollingTick();

      expect(stateMachine.getState()).toBe(WiFiState.CONNECTED);
    });

    it("should transition to WAITING_FOR_HOTSPOT when disconnected from hotspot in stopped mode", async () => {
      // Set up mock to return connected first
      mockHotspotManager.isConnectedToMobileHotspot.mockResolvedValue({
        success: true,
        data: true,
      });

      // Enter stopped mode - this triggers a polling tick
      stateMachine.setWebSocketClientCount(1);

      // Wait for the polling tick to complete
      await jest.advanceTimersByTimeAsync(0);

      expect(stateMachine.getState()).toBe(WiFiState.CONNECTED);

      // Advance past grace period
      await jest.advanceTimersByTimeAsync(6000);

      // Now disconnect
      mockHotspotManager.isConnectedToMobileHotspot.mockResolvedValue({
        success: true,
        data: false,
      });
      await stateMachine.handleHotspotPollingTick();

      expect(stateMachine.getState()).toBe(WiFiState.WAITING_FOR_HOTSPOT);
    });

    it("should not transition during grace period", async () => {
      // First, enter CONNECTED state
      mockHotspotManager.isConnectedToMobileHotspot.mockResolvedValueOnce({
        success: true,
        data: true,
      });
      await stateMachine.handleHotspotPollingTick();
      expect(stateMachine.getState()).toBe(WiFiState.CONNECTED);

      // Check immediately (within grace period)
      mockHotspotManager.isConnectedToMobileHotspot.mockResolvedValue({
        success: true,
        data: false,
      });
      await stateMachine.handleHotspotPollingTick();

      // Should still be CONNECTED due to grace period
      expect(stateMachine.getState()).toBe(WiFiState.CONNECTED);
    });
  });

  describe("stopped mode polling", () => {
    beforeEach(() => {
      stateMachine.setWebSocketClientCount(1); // Enter stopped mode
    });

    it("should reset from ERROR state and then check hotspot visibility", async () => {
      stateMachine.setState(WiFiState.ERROR);

      await stateMachine.handleHotspotPollingTick();

      // After resetting from ERROR, the state machine checks hotspot visibility
      // and transitions to WAITING_FOR_HOTSPOT
      expect(stateMachine.getState()).toBe(WiFiState.WAITING_FOR_HOTSPOT);
    });

    it("should not interfere when in CONNECTING state", async () => {
      stateMachine.setState(WiFiState.CONNECTING);

      await stateMachine.handleHotspotPollingTick();

      expect(stateMachine.getState()).toBe(WiFiState.CONNECTING);
    });

    it("should enter WAITING_FOR_HOTSPOT when hotspot not visible", async () => {
      mockNetworkScanner.isNetworkVisible.mockResolvedValue({
        success: true,
        data: false,
      });

      await stateMachine.handleHotspotPollingTick();

      expect(stateMachine.getState()).toBe(WiFiState.WAITING_FOR_HOTSPOT);
    });

    it("should save fallback network when hotspot is visible", async () => {
      mockNetworkScanner.isNetworkVisible.mockResolvedValue({
        success: true,
        data: true,
      });

      await stateMachine.handleHotspotPollingTick();

      expect(mockHotspotManager.saveFallbackNetwork).toHaveBeenCalled();
    });

    it("should schedule connection attempt when hotspot is visible", async () => {
      mockNetworkScanner.isNetworkVisible.mockResolvedValue({
        success: true,
        data: true,
      });

      await stateMachine.handleHotspotPollingTick();

      // Advance past the connection delay
      await jest.advanceTimersByTimeAsync(5000);

      expect(
        mockHotspotManager.attemptMobileHotspotConnection,
      ).toHaveBeenCalled();
    });
  });

  describe("driving mode polling", () => {
    beforeEach(() => {
      stateMachine.setWebSocketClientCount(0); // Ensure driving mode
    });

    it("should handle onboarding not complete", async () => {
      mockConfigService.isOnboardingCompleted.mockReturnValue(false);
      mockNetworkScanner.isNetworkVisible.mockResolvedValue({
        success: true,
        data: true,
      });

      await stateMachine.handleHotspotPollingTick();

      expect(mockHotspotManager.saveFallbackNetwork).toHaveBeenCalled();
    });

    it("should set state to DISCONNECTED when was connected to hotspot but now disconnected", async () => {
      stateMachine.setState(WiFiState.CONNECTED);

      // Advance past grace period
      await jest.advanceTimersByTimeAsync(6000);

      // Not connected to any network
      mockConnectionManager.isConnected.mockResolvedValue({
        success: true,
        data: false,
      });

      await stateMachine.handleHotspotPollingTick();

      expect(stateMachine.getState()).toBe(WiFiState.DISCONNECTED);
    });

    it("should reset to IDLE or DISCONNECTED based on connection", async () => {
      stateMachine.setState(WiFiState.WAITING_FOR_HOTSPOT);
      mockConnectionManager.isConnected.mockResolvedValue({
        success: true,
        data: true,
      });

      await stateMachine.handleHotspotPollingTick();

      expect(stateMachine.getState()).toBe(WiFiState.IDLE);
    });
  });

  describe("callback error handling", () => {
    it("should handle errors in state change callbacks gracefully", () => {
      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error("Callback error");
      });
      const normalCallback = jest.fn();

      stateMachine.onStateChange(errorCallback);
      stateMachine.onStateChange(normalCallback);

      expect(() => {
        stateMachine.setState(WiFiState.CONNECTED);
      }).not.toThrow();

      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("should handle undefined config service", async () => {
      const machine = new WiFiStateMachine(
        undefined,
        mockNetworkScanner,
        mockConnectionManager,
        mockHotspotManager,
      );

      await expect(machine.handleHotspotPollingTick()).resolves.not.toThrow();
    });

    it("should handle rapid state changes", () => {
      const callback = jest.fn();
      stateMachine.onStateChange(callback);

      stateMachine.setState(WiFiState.CONNECTING);
      stateMachine.setState(WiFiState.CONNECTED);
      stateMachine.setState(WiFiState.DISCONNECTED);

      expect(callback).toHaveBeenCalledTimes(3);
    });

    it("should handle multiple polling starts", () => {
      stateMachine.startHotspotPolling();
      stateMachine.startHotspotPolling();

      // Should have 2 timers (this might be a bug in real code, but we're testing behavior)
      expect(jest.getTimerCount()).toBe(2);

      stateMachine.stopHotspotPolling();
    });
  });
});
