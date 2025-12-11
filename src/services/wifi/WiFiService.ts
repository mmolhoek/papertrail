import { exec } from "child_process";
import { promisify } from "util";
import { IWiFiService, WiFiMode, IConfigService } from "@core/interfaces";
import {
  Result,
  WiFiNetwork,
  WiFiConnection,
  WiFiNetworkConfig,
  WiFiConfig,
  HotspotConfig,
  WiFiState,
  success,
  failure,
} from "@core/types";
import { WiFiError } from "@core/errors";
import { getLogger } from "@utils/logger";
import { NetworkScanner } from "./NetworkScanner";
import { ConnectionManager } from "./ConnectionManager";
import { HotspotManager } from "./HotspotManager";
import { WiFiStateMachine } from "./WiFiStateMachine";

const execAsync = promisify(exec);
const logger = getLogger("WiFiService");

/**
 * WiFi Service using NetworkManager (nmcli)
 * Manages WiFi connections on Linux/Raspberry Pi OS.
 * Includes state machine for mobile hotspot connection management.
 *
 * This service acts as a facade, delegating to specialized sub-components:
 * - NetworkScanner: Network discovery and visibility checks
 * - ConnectionManager: Connection operations and monitoring
 * - HotspotManager: Mobile hotspot connection and fallback management
 * - WiFiStateMachine: State transitions and mode awareness
 */
export class WiFiService implements IWiFiService {
  private initialized = false;

  // Sub-components
  private networkScanner: NetworkScanner;
  private connectionManager: ConnectionManager;
  private hotspotManager: HotspotManager;
  private stateMachine: WiFiStateMachine;

  constructor(
    private config: WiFiConfig,
    private configService?: IConfigService,
  ) {
    logger.info("WiFi Service created");
    logger.info(`  Primary SSID: "${config.primarySSID}"`);
    logger.info(`  Connection timeout: ${config.connectionTimeoutMs}ms`);
    logger.info(`  Config service available: ${!!configService}`);

    // Create sub-components
    this.networkScanner = new NetworkScanner(() => this.initialized);
    this.connectionManager = new ConnectionManager(
      config,
      () => this.initialized,
      this.networkScanner,
    );
    this.hotspotManager = new HotspotManager(
      config,
      configService,
      this.networkScanner,
      this.connectionManager,
      (state: WiFiState) => this.stateMachine.setState(state),
    );
    this.stateMachine = new WiFiStateMachine(
      configService,
      this.networkScanner,
      this.connectionManager,
      this.hotspotManager,
    );
  }

  async initialize(): Promise<Result<void>> {
    logger.info("Initializing WiFi Service...");
    logger.info("Checking for nmcli availability...");

    // Check if nmcli is available
    try {
      await execAsync("which nmcli");
      logger.info("nmcli found - NetworkManager is available");
    } catch {
      logger.error("nmcli not found - WiFi management requires NetworkManager");
      return failure(WiFiError.nmcliNotAvailable());
    }

    this.initialized = true;
    logger.info("WiFi Service initialized successfully");

    // Start monitoring connection state (5-second interval for connection callbacks)
    logger.info("Starting connection monitoring (5-second interval)...");
    this.connectionManager.startConnectionMonitoring();

    // Start hotspot check polling (10-second interval for state machine)
    logger.info("Starting hotspot polling (10-second interval)...");
    this.stateMachine.startHotspotPolling();

    // Set initial state based on current connection
    logger.info("Determining initial WiFi state...");
    const connectedToHotspot =
      await this.hotspotManager.isConnectedToMobileHotspot();
    if (connectedToHotspot.success && connectedToHotspot.data) {
      logger.info(
        "Already connected to mobile hotspot - setting state to CONNECTED",
      );
      this.stateMachine.setState(WiFiState.CONNECTED);
    } else {
      const connected = await this.connectionManager.isConnected();
      if (connected.success && connected.data) {
        logger.info("Connected to non-hotspot network - setting state to IDLE");
        this.stateMachine.setState(WiFiState.IDLE);
      } else {
        logger.info(
          "Not connected to any network - setting state to DISCONNECTED",
        );
        this.stateMachine.setState(WiFiState.DISCONNECTED);
      }
    }

    logger.info(
      `WiFi Service initialization complete. Current state: ${this.stateMachine.getState()}`,
    );
    return success(undefined);
  }

  async dispose(): Promise<void> {
    logger.info("Disposing WiFi Service...");

    // Stop connection monitoring
    this.connectionManager.stopConnectionMonitoring();

    // Stop hotspot polling
    logger.info("Stopping hotspot polling");
    this.stateMachine.stopHotspotPolling();

    // Abort any in-progress connection attempt
    this.hotspotManager.abortConnectionAttempt();

    // Clear callbacks
    const callbackCount =
      this.connectionManager["connectionChangeCallbacks"].length +
      this.stateMachine["stateChangeCallbacks"].length;
    logger.info(`Clearing ${callbackCount} registered callbacks`);
    this.connectionManager.clearCallbacks();
    this.stateMachine.clearCallbacks();

    this.initialized = false;
    logger.info("WiFi Service disposed successfully");
  }

  // Delegate to NetworkScanner
  async scanNetworks(): Promise<Result<WiFiNetwork[]>> {
    return this.networkScanner.scanNetworks();
  }

  async isNetworkVisible(ssid: string): Promise<Result<boolean>> {
    return this.networkScanner.isNetworkVisible(ssid);
  }

  // Delegate to ConnectionManager
  async getCurrentConnection(): Promise<Result<WiFiConnection | null>> {
    return this.connectionManager.getCurrentConnection();
  }

  async isConnected(): Promise<Result<boolean>> {
    return this.connectionManager.isConnected();
  }

  async connect(ssid: string, password: string): Promise<Result<void>> {
    return this.connectionManager.connect(ssid, password);
  }

  async disconnect(): Promise<Result<void>> {
    return this.connectionManager.disconnect();
  }

  async saveNetwork(config: WiFiNetworkConfig): Promise<Result<void>> {
    return this.connectionManager.saveNetwork(config);
  }

  async getSavedNetworks(): Promise<Result<WiFiNetworkConfig[]>> {
    return this.connectionManager.getSavedNetworks();
  }

  async removeNetwork(ssid: string): Promise<Result<void>> {
    return this.connectionManager.removeNetwork(ssid);
  }

  onConnectionChange(callback: (connected: boolean) => void): () => void {
    return this.connectionManager.onConnectionChange(callback);
  }

  // Delegate to WiFiStateMachine
  getState(): WiFiState {
    return this.stateMachine.getState();
  }

  onStateChange(
    callback: (state: WiFiState, previousState: WiFiState) => void,
  ): () => void {
    return this.stateMachine.onStateChange(callback);
  }

  setWebSocketClientCount(count: number): void {
    this.stateMachine.setWebSocketClientCount(count);
  }

  getMode(): WiFiMode {
    return this.stateMachine.getMode();
  }

  // Delegate to HotspotManager
  async isConnectedToMobileHotspot(): Promise<Result<boolean>> {
    return this.hotspotManager.isConnectedToMobileHotspot();
  }

  async attemptMobileHotspotConnection(): Promise<Result<void>> {
    return this.hotspotManager.attemptMobileHotspotConnection();
  }

  getMobileHotspotSSID(): string {
    return this.hotspotManager.getMobileHotspotSSID();
  }

  getHotspotConfig(): HotspotConfig {
    return this.hotspotManager.getHotspotConfig();
  }

  async setHotspotConfig(
    ssid: string,
    password: string,
  ): Promise<Result<void>> {
    return this.hotspotManager.setHotspotConfig(ssid, password);
  }

  notifyConnectedScreenDisplayed(): void {
    this.hotspotManager.notifyConnectedScreenDisplayed();
  }
}
