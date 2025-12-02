import { IWiFiService, WiFiMode, IConfigService } from "../../core/interfaces";
import {
  Result,
  WiFiNetwork,
  WiFiConnection,
  WiFiNetworkConfig,
  WiFiConfig,
  WiFiState,
} from "../../core/types";
import { success, failure } from "../../core/types";
import { WiFiError } from "../../core/errors";
import { getLogger } from "../../utils/logger";

const logger = getLogger("MockWiFiService");

/**
 * Mock WiFi Service for development and testing
 * Simulates WiFi operations without requiring actual WiFi hardware or nmcli.
 * Includes state machine for mobile hotspot connection management.
 */
export class MockWiFiService implements IWiFiService {
  private initialized = false;
  private connected = false;
  private currentConnection: WiFiConnection | null = null;
  private savedNetworks: Map<string, WiFiNetworkConfig> = new Map();
  private connectionChangeCallbacks: Array<(connected: boolean) => void> = [];

  // State machine fields
  private currentState: WiFiState = WiFiState.IDLE;
  private webSocketClientCount = 0;
  private stateChangeCallbacks: Array<
    (state: WiFiState, previousState: WiFiState) => void
  > = [];

  constructor(
    private config: WiFiConfig,
    private configService?: IConfigService,
  ) {
    logger.info("Mock WiFi Service created (for development/testing)");
  }

  async initialize(): Promise<Result<void>> {
    logger.info("Initializing Mock WiFi Service...");
    await this.delay(100);

    this.initialized = true;
    logger.info("Mock WiFi Service initialized");

    return success(undefined);
  }

  async dispose(): Promise<void> {
    logger.info("Disposing Mock WiFi Service...");
    this.initialized = false;
    this.connected = false;
    this.currentConnection = null;
    this.connectionChangeCallbacks = [];
    this.stateChangeCallbacks = [];
    this.currentState = WiFiState.IDLE;
    this.webSocketClientCount = 0;
  }

  async scanNetworks(): Promise<Result<WiFiNetwork[]>> {
    if (!this.initialized) {
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    logger.info("Mock: Scanning for WiFi networks...");
    await this.delay(500);

    // Return mock networks including the primary SSID
    const networks: WiFiNetwork[] = [
      {
        ssid: this.config.primarySSID,
        signalStrength: 85,
        security: "WPA2",
        frequency: 2412,
      },
      {
        ssid: "Home-Network",
        signalStrength: 72,
        security: "WPA2",
        frequency: 2437,
      },
      {
        ssid: "Coffee-Shop-WiFi",
        signalStrength: 45,
        security: "Open",
        frequency: 2462,
      },
      {
        ssid: "Neighbor-5G",
        signalStrength: 60,
        security: "WPA3",
        frequency: 5180,
      },
    ];

    logger.info(`Mock: Found ${networks.length} networks`);
    return success(networks);
  }

  async getCurrentConnection(): Promise<Result<WiFiConnection | null>> {
    if (!this.initialized) {
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    await this.delay(50);
    return success(this.currentConnection);
  }

  async isConnected(): Promise<Result<boolean>> {
    if (!this.initialized) {
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    await this.delay(50);
    return success(this.connected);
  }

  async connect(ssid: string, password: string): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    logger.info(`Mock: Connecting to "${ssid}"...`);
    await this.delay(1000);

    // Simulate successful connection
    this.connected = true;
    this.currentConnection = {
      ssid,
      ipAddress: "192.168.4.2",
      macAddress: "AA:BB:CC:DD:EE:FF",
      signalStrength: 85,
      connectedAt: new Date(),
    };

    logger.info(`Mock: Connected to "${ssid}"`);
    this.notifyConnectionChange(true);

    return success(undefined);
  }

  async disconnect(): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    if (!this.connected) {
      return failure(WiFiError.notConnected());
    }

    logger.info("Mock: Disconnecting from WiFi...");
    await this.delay(300);

    const previousSsid = this.currentConnection?.ssid;
    this.connected = false;
    this.currentConnection = null;

    logger.info(`Mock: Disconnected from "${previousSsid}"`);
    this.notifyConnectionChange(false);

    return success(undefined);
  }

  async saveNetwork(config: WiFiNetworkConfig): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    logger.info(`Mock: Saving network config for "${config.ssid}"`);
    await this.delay(200);

    this.savedNetworks.set(config.ssid, config);
    logger.info(`Mock: Network config saved for "${config.ssid}"`);

    return success(undefined);
  }

  async getSavedNetworks(): Promise<Result<WiFiNetworkConfig[]>> {
    if (!this.initialized) {
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    await this.delay(100);

    const networks = Array.from(this.savedNetworks.values());
    logger.info(`Mock: Retrieved ${networks.length} saved networks`);

    return success(networks);
  }

  async removeNetwork(ssid: string): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    logger.info(`Mock: Removing network config for "${ssid}"`);
    await this.delay(200);

    if (!this.savedNetworks.has(ssid)) {
      return failure(WiFiError.networkNotFound(ssid));
    }

    this.savedNetworks.delete(ssid);
    logger.info(`Mock: Network config removed for "${ssid}"`);

    return success(undefined);
  }

  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionChangeCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.connectionChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.connectionChangeCallbacks.splice(index, 1);
      }
    };
  }

  // State machine methods

  getState(): WiFiState {
    return this.currentState;
  }

  async isConnectedToMobileHotspot(): Promise<Result<boolean>> {
    if (!this.initialized) {
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    const isHotspot = this.currentConnection?.ssid === this.config.primarySSID;
    return success(isHotspot);
  }

  onStateChange(
    callback: (state: WiFiState, previousState: WiFiState) => void,
  ): () => void {
    this.stateChangeCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  // Mode awareness methods

  setWebSocketClientCount(count: number): void {
    const previousCount = this.webSocketClientCount;
    this.webSocketClientCount = count;

    logger.debug(
      `Mock: WebSocket client count changed: ${previousCount} -> ${count}`,
    );

    // Simulate mode change behavior
    if (previousCount === 0 && count > 0) {
      logger.info("Mock: Entered stopped mode (WebSocket clients connected)");
      // In mock, we can simulate being connected to hotspot already
      if (!this.connected) {
        this.setState(WiFiState.WAITING_FOR_HOTSPOT);
      }
    }

    if (previousCount > 0 && count === 0) {
      logger.info("Mock: Entered driving mode (no WebSocket clients)");
      if (
        this.currentState === WiFiState.WAITING_FOR_HOTSPOT ||
        this.currentState === WiFiState.CONNECTING
      ) {
        this.setState(WiFiState.IDLE);
      }
    }
  }

  getMode(): WiFiMode {
    return this.webSocketClientCount > 0 ? "stopped" : "driving";
  }

  async attemptMobileHotspotConnection(): Promise<Result<void>> {
    logger.info(
      `Mock: Attempting to connect to mobile hotspot "${this.config.primarySSID}"...`,
    );

    this.setState(WiFiState.CONNECTING);
    await this.delay(1000);

    // Simulate successful connection
    this.connected = true;
    this.currentConnection = {
      ssid: this.config.primarySSID,
      ipAddress: "192.168.4.2",
      macAddress: "AA:BB:CC:DD:EE:FF",
      signalStrength: 85,
      connectedAt: new Date(),
    };

    this.setState(WiFiState.CONNECTED);
    logger.info(
      `Mock: Successfully connected to mobile hotspot "${this.config.primarySSID}"`,
    );

    return success(undefined);
  }

  getMobileHotspotSSID(): string {
    return this.config.primarySSID;
  }

  // Private helper methods

  private setState(newState: WiFiState): void {
    if (newState === this.currentState) {
      return;
    }

    const previousState = this.currentState;
    this.currentState = newState;

    logger.info(`Mock: WiFi state changed: ${previousState} -> ${newState}`);
    this.notifyStateChange(newState, previousState);
  }

  private notifyStateChange(state: WiFiState, previousState: WiFiState): void {
    for (const callback of this.stateChangeCallbacks) {
      try {
        callback(state, previousState);
      } catch (error) {
        logger.error("Error in state change callback:", error);
      }
    }
  }

  private notifyConnectionChange(connected: boolean): void {
    for (const callback of this.connectionChangeCallbacks) {
      try {
        callback(connected);
      } catch (error) {
        logger.error("Error in connection change callback:", error);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
