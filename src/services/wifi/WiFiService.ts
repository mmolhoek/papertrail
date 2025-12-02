import { exec } from "child_process";
import { promisify } from "util";
import { IWiFiService, WiFiMode, IConfigService } from "@core/interfaces";
import {
  Result,
  WiFiNetwork,
  WiFiConnection,
  WiFiNetworkConfig,
  WiFiConfig,
  WiFiState,
  success,
  failure,
} from "@core/types";
import { WiFiError } from "@core/errors";
import { getLogger } from "@utils/logger";

const execAsync = promisify(exec);
const logger = getLogger("WiFiService");

/** Polling interval for checking hotspot connection (10 seconds) */
const HOTSPOT_CHECK_INTERVAL_MS = 10000;

/** Delay before attempting hotspot connection after entering WAITING_FOR_HOTSPOT (5 seconds) */
const HOTSPOT_CONNECTION_DELAY_MS = 5000;

/** Timeout for mobile hotspot connection attempt (60 seconds) */
const HOTSPOT_CONNECTION_TIMEOUT_MS = 60000;

/**
 * WiFi Service using NetworkManager (nmcli)
 * Manages WiFi connections on Linux/Raspberry Pi OS.
 * Includes state machine for mobile hotspot connection management.
 */
export class WiFiService implements IWiFiService {
  private initialized = false;
  private connectionChangeCallbacks: Array<(connected: boolean) => void> = [];
  private connectionCheckInterval?: NodeJS.Timeout;

  // State machine fields
  private currentState: WiFiState = WiFiState.IDLE;
  private webSocketClientCount = 0;
  private stateChangeCallbacks: Array<
    (state: WiFiState, previousState: WiFiState) => void
  > = [];
  private hotspotCheckInterval?: NodeJS.Timeout;
  private connectionAttemptInProgress = false;
  private connectionAttemptAbortController?: AbortController;

  constructor(
    private config: WiFiConfig,
    private configService?: IConfigService,
  ) {
    logger.info("WiFi Service created");
  }

  async initialize(): Promise<Result<void>> {
    logger.info("Initializing WiFi Service...");

    // Check if nmcli is available
    try {
      await execAsync("which nmcli");
    } catch (error) {
      logger.error("nmcli not found - WiFi management requires NetworkManager");
      return failure(WiFiError.nmcliNotAvailable());
    }

    this.initialized = true;
    logger.info("WiFi Service initialized");

    // Start monitoring connection state (5-second interval for connection callbacks)
    this.startConnectionMonitoring();

    // Start hotspot check polling (10-second interval for state machine)
    this.startHotspotPolling();

    // Set initial state based on current connection
    const connectedToHotspot = await this.isConnectedToMobileHotspot();
    if (connectedToHotspot.success && connectedToHotspot.data) {
      this.setState(WiFiState.CONNECTED);
    } else {
      const connected = await this.isConnected();
      if (connected.success && connected.data) {
        this.setState(WiFiState.IDLE);
      } else {
        this.setState(WiFiState.DISCONNECTED);
      }
    }

    return success(undefined);
  }

  async dispose(): Promise<void> {
    logger.info("Disposing WiFi Service...");

    // Stop connection monitoring
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = undefined;
    }

    // Stop hotspot polling
    this.stopHotspotPolling();

    // Abort any in-progress connection attempt
    if (this.connectionAttemptAbortController) {
      this.connectionAttemptAbortController.abort();
      this.connectionAttemptAbortController = undefined;
    }

    this.initialized = false;
    this.connectionChangeCallbacks = [];
    this.stateChangeCallbacks = [];
    this.connectionAttemptInProgress = false;
  }

  async scanNetworks(): Promise<Result<WiFiNetwork[]>> {
    if (!this.initialized) {
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    try {
      logger.info("Scanning for WiFi networks...");

      // Request a fresh scan and then get results
      // -t = terse output, -f = fields to display
      const { stdout } = await execAsync(
        "sudo nmcli device wifi rescan && sudo nmcli -t -f SSID,SIGNAL,SECURITY,FREQ device wifi list",
      );

      const networks: WiFiNetwork[] = [];
      const lines = stdout.trim().split("\n");

      for (const line of lines) {
        if (!line) continue;

        const [ssid, signal, security, freq] = line.split(":");

        // Skip empty SSIDs (hidden networks)
        if (!ssid) continue;

        networks.push({
          ssid,
          signalStrength: parseInt(signal, 10),
          security: this.parseSecurity(security),
          frequency: parseInt(freq, 10),
        });
      }

      logger.info(`Found ${networks.length} WiFi networks`);
      return success(networks);
    } catch (error) {
      logger.error("Failed to scan networks:", error);
      return failure(WiFiError.scanFailed(error as Error));
    }
  }

  async getCurrentConnection(): Promise<Result<WiFiConnection | null>> {
    if (!this.initialized) {
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    try {
      // Get WiFi device info
      const { stdout } = await execAsync(
        "sudo nmcli device wifi rescan && sudo nmcli -t -f GENERAL.CONNECTION,IP4.ADDRESS,GENERAL.HWADDR device show wlan0",
      );

      const lines = stdout.trim().split("\n");
      const data: Record<string, string> = {};

      for (const line of lines) {
        const [key, value] = line.split(":");
        if (key && value) {
          data[key] = value;
        }
      }

      const connectionName = data["GENERAL.CONNECTION"];

      // Not connected if connection name is empty or "--"
      if (!connectionName || connectionName === "--") {
        return success(null);
      }

      // Get signal strength for current connection
      const signalResult = await this.getSignalStrength(connectionName);
      const signalStrength = signalResult.success ? signalResult.data : 0;

      const connection: WiFiConnection = {
        ssid: connectionName,
        ipAddress: data["IP4.ADDRESS"]?.split("/")[0] || "",
        macAddress: data["GENERAL.HWADDR"] || "",
        signalStrength,
        connectedAt: new Date(), // nmcli doesn't provide connection time
      };

      return success(connection);
    } catch (error) {
      logger.warn("Failed to get current connection:", error);
      return success(null); // Not connected is not an error
    }
  }

  async isConnected(): Promise<Result<boolean>> {
    const connectionResult = await this.getCurrentConnection();

    if (!connectionResult.success) {
      return failure(connectionResult.error);
    }

    return success(connectionResult.data !== null);
  }

  async connect(ssid: string, password: string): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    try {
      logger.info(`Connecting to "${ssid}"...`);

      // Use nmcli to connect with a timeout (requires sudo)
      const command = `sudo nmcli device wifi connect "${ssid}" password "${password}"`;

      const { stdout, stderr } = (await Promise.race([
        execAsync(command),
        this.timeout(this.config.connectionTimeoutMs),
      ])) as { stdout: string; stderr: string };

      if (stderr && stderr.includes("Error")) {
        if (
          stderr.includes("Secrets were required") ||
          stderr.includes("802-11-wireless-security")
        ) {
          logger.error(`Authentication failed for "${ssid}"`);
          return failure(WiFiError.authFailed(ssid));
        }

        logger.error(`Connection failed for "${ssid}": ${stderr}`);
        return failure(WiFiError.connectionFailed(ssid, new Error(stderr)));
      }

      logger.info(`Successfully connected to "${ssid}"`);
      return success(undefined);
    } catch (error) {
      if (error instanceof Error && error.message === "Timeout") {
        logger.error(`Connection to "${ssid}" timed out`);
        return failure(
          WiFiError.timeout("connect", this.config.connectionTimeoutMs),
        );
      }

      logger.error(`Failed to connect to "${ssid}":`, error);
      return failure(WiFiError.connectionFailed(ssid, error as Error));
    }
  }

  async disconnect(): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    const connectionResult = await this.getCurrentConnection();
    if (!connectionResult.success) {
      return failure(connectionResult.error);
    }

    if (!connectionResult.data) {
      return failure(WiFiError.notConnected());
    }

    try {
      logger.info("Disconnecting from WiFi...");

      // Requires sudo to disconnect
      await execAsync("sudo nmcli device disconnect wlan0");

      logger.info("Disconnected from WiFi");
      return success(undefined);
    } catch (error) {
      logger.error("Failed to disconnect:", error);
      return failure(WiFiError.unknown((error as Error).message));
    }
  }

  async saveNetwork(config: WiFiNetworkConfig): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    try {
      logger.info(`Saving network config for "${config.ssid}"...`);

      // Check if connection already exists
      const existsResult = await this.connectionExists(config.ssid);
      if (existsResult) {
        // Delete existing connection first (requires sudo)
        await execAsync(`sudo nmcli connection delete "${config.ssid}"`);
      }

      // Create new connection (requires sudo)
      const autoConnect = config.autoConnect ? "yes" : "no";
      const command = [
        "sudo nmcli connection add",
        "type wifi",
        "con-name",
        `"${config.ssid}"`,
        "ifname wlan0",
        "ssid",
        `"${config.ssid}"`,
        "wifi-sec.key-mgmt wpa-psk",
        "wifi-sec.psk",
        `"${config.password}"`,
        `connection.autoconnect ${autoConnect}`,
        `connection.autoconnect-priority ${config.priority}`,
      ].join(" ");

      await execAsync(command);

      logger.info(`Network config saved for "${config.ssid}"`);
      return success(undefined);
    } catch (error) {
      logger.error(
        `Failed to save network config for "${config.ssid}":`,
        error,
      );
      return failure(WiFiError.unknown((error as Error).message));
    }
  }

  async getSavedNetworks(): Promise<Result<WiFiNetworkConfig[]>> {
    if (!this.initialized) {
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    try {
      // List all WiFi connections
      const { stdout } = await execAsync(
        "sudo nmcli device wifi rescan &&& sudo nmcli -t -f NAME,TYPE,AUTOCONNECT,AUTOCONNECT-PRIORITY connection show",
      );

      const networks: WiFiNetworkConfig[] = [];
      const lines = stdout.trim().split("\n");

      for (const line of lines) {
        if (!line) continue;

        const [name, type, autoConnect, priority] = line.split(":");

        // Only include WiFi connections
        if (type !== "802-11-wireless") continue;

        // Note: We can't retrieve passwords from NetworkManager
        networks.push({
          ssid: name,
          password: "", // Not retrievable
          priority: parseInt(priority, 10) || 0,
          autoConnect: autoConnect === "yes",
        });
      }

      logger.info(`Retrieved ${networks.length} saved networks`);
      return success(networks);
    } catch (error) {
      logger.error("Failed to get saved networks:", error);
      return failure(WiFiError.unknown((error as Error).message));
    }
  }

  async removeNetwork(ssid: string): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    try {
      logger.info(`Removing network config for "${ssid}"...`);

      const exists = await this.connectionExists(ssid);
      if (!exists) {
        return failure(WiFiError.networkNotFound(ssid));
      }

      // Requires sudo to delete network connections
      await execAsync(`sudo nmcli connection delete "${ssid}"`);

      logger.info(`Network config removed for "${ssid}"`);
      return success(undefined);
    } catch (error) {
      logger.error(`Failed to remove network config for "${ssid}":`, error);
      return failure(WiFiError.unknown((error as Error).message));
    }
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
    const connectionResult = await this.getCurrentConnection();

    if (!connectionResult.success) {
      return failure(connectionResult.error);
    }

    if (!connectionResult.data) {
      return success(false);
    }

    const isHotspot = connectionResult.data.ssid === this.config.primarySSID;
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
      `WebSocket client count changed: ${previousCount} -> ${count}`,
    );

    // If we just entered stopped mode (clients connected) and not connected to hotspot,
    // trigger the state machine check
    if (previousCount === 0 && count > 0) {
      logger.info("Entered stopped mode (WebSocket clients connected)");
      // Run a hotspot check immediately
      void this.handleHotspotPollingTick();
    }

    // If we just entered driving mode (no clients), reset state if we were waiting
    if (previousCount > 0 && count === 0) {
      logger.info("Entered driving mode (no WebSocket clients)");
      if (
        this.currentState === WiFiState.WAITING_FOR_HOTSPOT ||
        this.currentState === WiFiState.CONNECTING
      ) {
        // Abort any in-progress connection attempt
        if (this.connectionAttemptAbortController) {
          this.connectionAttemptAbortController.abort();
        }
        this.connectionAttemptInProgress = false;

        // Go back to idle (we were in the middle of hotspot connection)
        this.setState(WiFiState.IDLE);
      }
    }
  }

  getMode(): WiFiMode {
    return this.webSocketClientCount > 0 ? "stopped" : "driving";
  }

  async attemptMobileHotspotConnection(): Promise<Result<void>> {
    if (this.connectionAttemptInProgress) {
      logger.warn("Connection attempt already in progress");
      return failure(
        WiFiError.unknown("Connection attempt already in progress"),
      );
    }

    this.connectionAttemptInProgress = true;
    this.connectionAttemptAbortController = new AbortController();

    try {
      logger.info(
        `Attempting to connect to mobile hotspot "${this.config.primarySSID}"...`,
      );

      this.setState(WiFiState.CONNECTING);

      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error("HOTSPOT_TIMEOUT"));
        }, HOTSPOT_CONNECTION_TIMEOUT_MS);

        // Clear timeout if aborted
        this.connectionAttemptAbortController?.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeoutId);
            reject(new Error("ABORTED"));
          },
        );
      });

      // Try to connect
      const connectPromise = this.connect(
        this.config.primarySSID,
        this.config.primaryPassword,
      );

      const result = (await Promise.race([
        connectPromise,
        timeoutPromise,
      ])) as Result<void>;

      if (result.success) {
        logger.info(
          `Successfully connected to mobile hotspot "${this.config.primarySSID}"`,
        );
        this.setState(WiFiState.CONNECTED);
        // Clear fallback network on successful connection
        await this.clearFallbackNetwork();
        return success(undefined);
      } else {
        throw result.error;
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "ABORTED") {
          logger.info("Connection attempt aborted");
          return failure(WiFiError.unknown("Connection attempt aborted"));
        }

        if (error.message === "HOTSPOT_TIMEOUT") {
          logger.warn(
            `Mobile hotspot connection timed out after ${HOTSPOT_CONNECTION_TIMEOUT_MS}ms`,
          );

          // Attempt to reconnect to fallback network
          this.setState(WiFiState.RECONNECTING_FALLBACK);
          const reconnectResult = await this.reconnectToFallback();

          if (reconnectResult.success) {
            logger.info("Reconnected to fallback network");
            this.setState(WiFiState.DISCONNECTED);
          } else {
            logger.error("Failed to reconnect to fallback network");
            this.setState(WiFiState.ERROR);
          }

          return failure(
            WiFiError.hotspotConnectionTimeout(
              this.config.primarySSID,
              HOTSPOT_CONNECTION_TIMEOUT_MS,
            ),
          );
        }
      }

      logger.error("Failed to connect to mobile hotspot:", error);
      this.setState(WiFiState.ERROR);
      return failure(
        WiFiError.connectionFailed(this.config.primarySSID, error as Error),
      );
    } finally {
      this.connectionAttemptInProgress = false;
      this.connectionAttemptAbortController = undefined;
    }
  }

  getMobileHotspotSSID(): string {
    return this.config.primarySSID;
  }

  // Private helper methods

  private parseSecurity(security: string): WiFiNetwork["security"] {
    if (!security || security === "--") return "Open";
    if (security.includes("WPA3")) return "WPA3";
    if (security.includes("WPA2")) return "WPA2";
    if (security.includes("WPA")) return "WPA";
    if (security.includes("WEP")) return "WEP";
    return "Unknown";
  }

  private async getSignalStrength(ssid: string): Promise<Result<number>> {
    try {
      const { stdout } = await execAsync(
        `sudo nmcli device wifi rescan && sudo nmcli -t -f SSID,SIGNAL device wifi list | grep "^${ssid}:"`,
      );

      const [, signal] = stdout.trim().split(":");
      return success(parseInt(signal, 10) || 0);
    } catch (error) {
      return success(0); // Default to 0 if can't get signal
    }
  }

  private async connectionExists(ssid: string): Promise<boolean> {
    try {
      await execAsync(`nmcli connection show "${ssid}"`);
      return true;
    } catch {
      return false;
    }
  }

  private startConnectionMonitoring(): void {
    let lastConnected = false;

    this.connectionCheckInterval = setInterval(async () => {
      const connectedResult = await this.isConnected();

      if (connectedResult.success) {
        const connected = connectedResult.data;

        if (connected !== lastConnected) {
          logger.info(
            `WiFi connection state changed: ${connected ? "connected" : "disconnected"}`,
          );
          this.notifyConnectionChange(connected);
          lastConnected = connected;
        }
      }
    }, 5000); // Check every 5 seconds
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

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Timeout")), ms);
    });
  }

  // State machine private methods

  private setState(newState: WiFiState): void {
    if (newState === this.currentState) {
      return;
    }

    const previousState = this.currentState;
    this.currentState = newState;

    logger.info(`WiFi state changed: ${previousState} -> ${newState}`);
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

  private startHotspotPolling(): void {
    logger.info("Starting hotspot polling (10-second interval)");

    this.hotspotCheckInterval = setInterval(() => {
      void this.handleHotspotPollingTick();
    }, HOTSPOT_CHECK_INTERVAL_MS);
  }

  private stopHotspotPolling(): void {
    if (this.hotspotCheckInterval) {
      logger.info("Stopping hotspot polling");
      clearInterval(this.hotspotCheckInterval);
      this.hotspotCheckInterval = undefined;
    }
  }

  private async handleHotspotPollingTick(): Promise<void> {
    // Check if connected to mobile hotspot
    const connectedToHotspot = await this.isConnectedToMobileHotspot();

    if (connectedToHotspot.success && connectedToHotspot.data) {
      // Already connected to hotspot
      if (this.currentState !== WiFiState.CONNECTED) {
        this.setState(WiFiState.CONNECTED);
      }
      return;
    }

    // Check if we're in stopped mode (WebSocket clients connected)
    if (this.webSocketClientCount > 0) {
      // We're in stopped mode but not connected to hotspot
      if (
        this.currentState !== WiFiState.WAITING_FOR_HOTSPOT &&
        this.currentState !== WiFiState.CONNECTING &&
        this.currentState !== WiFiState.RECONNECTING_FALLBACK &&
        this.currentState !== WiFiState.ERROR
      ) {
        // Save current connection as fallback before trying to connect to hotspot
        await this.saveFallbackNetwork();

        // Enter waiting state
        this.setState(WiFiState.WAITING_FOR_HOTSPOT);

        // Wait a few seconds then attempt connection
        setTimeout(() => {
          // Only attempt if still in stopped mode and waiting state
          if (
            this.webSocketClientCount > 0 &&
            this.currentState === WiFiState.WAITING_FOR_HOTSPOT
          ) {
            void this.attemptMobileHotspotConnection();
          }
        }, HOTSPOT_CONNECTION_DELAY_MS);
      }
    } else {
      // We're in driving mode - just monitor, don't try to connect
      // Set state based on current connection
      const connected = await this.isConnected();
      if (connected.success) {
        if (this.currentState === WiFiState.CONNECTED) {
          // We were connected to hotspot but now not
          this.setState(WiFiState.DISCONNECTED);
        } else if (
          this.currentState !== WiFiState.IDLE &&
          this.currentState !== WiFiState.DISCONNECTED
        ) {
          // Reset to idle/disconnected in driving mode
          this.setState(
            connected.data ? WiFiState.IDLE : WiFiState.DISCONNECTED,
          );
        }
      }
    }
  }

  private async saveFallbackNetwork(): Promise<void> {
    if (!this.configService) {
      logger.warn("No config service - cannot save fallback network");
      return;
    }

    try {
      const connectionResult = await this.getCurrentConnection();

      if (
        connectionResult.success &&
        connectionResult.data &&
        connectionResult.data.ssid !== this.config.primarySSID
      ) {
        logger.info(`Saving fallback network: "${connectionResult.data.ssid}"`);

        this.configService.setWiFiFallbackNetwork({
          ssid: connectionResult.data.ssid,
          savedAt: new Date().toISOString(),
        });

        // Persist to disk
        await this.configService.save();
      }
    } catch (error) {
      logger.error("Failed to save fallback network:", error);
    }
  }

  private async clearFallbackNetwork(): Promise<void> {
    if (!this.configService) {
      return;
    }

    try {
      this.configService.setWiFiFallbackNetwork(null);
      await this.configService.save();
    } catch (error) {
      logger.error("Failed to clear fallback network:", error);
    }
  }

  private async reconnectToFallback(): Promise<Result<void>> {
    if (!this.configService) {
      logger.warn("No config service - cannot reconnect to fallback");
      return failure(WiFiError.unknown("No config service available"));
    }

    const fallback = this.configService.getWiFiFallbackNetwork();

    if (!fallback) {
      logger.info("No fallback network saved - nothing to reconnect to");
      return success(undefined);
    }

    logger.info(
      `Attempting to reconnect to fallback network: "${fallback.ssid}"`,
    );

    try {
      // First disconnect from any current network
      await this.disconnect();

      // Try to connect to the saved network (it should be in NetworkManager)
      // We can't use password since NetworkManager doesn't expose it,
      // but if the network is saved, nmcli should auto-connect
      const { stdout } = await execAsync(
        `sudo nmcli connection up "${fallback.ssid}"`,
      );

      if (stdout.includes("successfully activated")) {
        logger.info(`Reconnected to fallback network "${fallback.ssid}"`);
        return success(undefined);
      }

      return success(undefined);
    } catch (error) {
      logger.error(
        `Failed to reconnect to fallback network "${fallback.ssid}":`,
        error,
      );
      return failure(
        WiFiError.fallbackReconnectFailed(fallback.ssid, error as Error),
      );
    }
  }
}
