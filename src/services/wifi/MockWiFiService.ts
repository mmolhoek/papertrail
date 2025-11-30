import { IWiFiService } from "../../core/interfaces";
import {
  Result,
  WiFiNetwork,
  WiFiConnection,
  WiFiNetworkConfig,
  WiFiConfig,
} from "../../core/types";
import { success, failure } from "../../core/types";
import { WiFiError } from "../../core/errors";
import { getLogger } from "../../utils/logger";

const logger = getLogger("MockWiFiService");

/**
 * Mock WiFi Service for development and testing
 * Simulates WiFi operations without requiring actual WiFi hardware or nmcli
 */
export class MockWiFiService implements IWiFiService {
  private initialized = false;
  private connected = false;
  private currentConnection: WiFiConnection | null = null;
  private savedNetworks: Map<string, WiFiNetworkConfig> = new Map();
  private connectionChangeCallbacks: Array<(connected: boolean) => void> = [];

  constructor(private config: WiFiConfig) {
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
