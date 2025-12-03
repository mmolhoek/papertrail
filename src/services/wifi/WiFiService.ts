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
  HotspotConfig,
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
  private connectedStateEnteredAt?: Date; // Track when we entered CONNECTED state for grace period
  private connectedScreenDisplayed = false; // Track if orchestrator displayed the connected screen

  constructor(
    private config: WiFiConfig,
    private configService?: IConfigService,
  ) {
    logger.info("WiFi Service created");
    logger.info(`  Primary SSID: "${config.primarySSID}"`);
    logger.info(`  Connection timeout: ${config.connectionTimeoutMs}ms`);
    logger.info(`  Config service available: ${!!configService}`);
  }

  async initialize(): Promise<Result<void>> {
    logger.info("Initializing WiFi Service...");
    logger.info("Checking for nmcli availability...");

    // Check if nmcli is available
    try {
      await execAsync("which nmcli");
      logger.info("nmcli found - NetworkManager is available");
    } catch (error) {
      logger.error("nmcli not found - WiFi management requires NetworkManager");
      return failure(WiFiError.nmcliNotAvailable());
    }

    this.initialized = true;
    logger.info("WiFi Service initialized successfully");

    // Start monitoring connection state (5-second interval for connection callbacks)
    logger.info("Starting connection monitoring (5-second interval)...");
    this.startConnectionMonitoring();

    // Start hotspot check polling (10-second interval for state machine)
    logger.info("Starting hotspot polling (10-second interval)...");
    this.startHotspotPolling();

    // Set initial state based on current connection
    logger.info("Determining initial WiFi state...");
    const connectedToHotspot = await this.isConnectedToMobileHotspot();
    if (connectedToHotspot.success && connectedToHotspot.data) {
      logger.info(
        "Already connected to mobile hotspot - setting state to CONNECTED",
      );
      this.setState(WiFiState.CONNECTED);
    } else {
      const connected = await this.isConnected();
      if (connected.success && connected.data) {
        logger.info("Connected to non-hotspot network - setting state to IDLE");
        this.setState(WiFiState.IDLE);
      } else {
        logger.info(
          "Not connected to any network - setting state to DISCONNECTED",
        );
        this.setState(WiFiState.DISCONNECTED);
      }
    }

    logger.info(
      `WiFi Service initialization complete. Current state: ${this.currentState}`,
    );
    return success(undefined);
  }

  async dispose(): Promise<void> {
    logger.info("Disposing WiFi Service...");

    // Stop connection monitoring
    if (this.connectionCheckInterval) {
      logger.info("Stopping connection monitoring interval");
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = undefined;
    }

    // Stop hotspot polling
    logger.info("Stopping hotspot polling");
    this.stopHotspotPolling();

    // Abort any in-progress connection attempt
    if (this.connectionAttemptAbortController) {
      logger.info("Aborting in-progress connection attempt");
      this.connectionAttemptAbortController.abort();
      this.connectionAttemptAbortController = undefined;
    }

    const callbackCount =
      this.connectionChangeCallbacks.length + this.stateChangeCallbacks.length;
    logger.info(`Clearing ${callbackCount} registered callbacks`);

    this.initialized = false;
    this.connectionChangeCallbacks = [];
    this.stateChangeCallbacks = [];
    this.connectionAttemptInProgress = false;

    logger.info("WiFi Service disposed successfully");
  }

  async scanNetworks(): Promise<Result<WiFiNetwork[]>> {
    logger.info("scanNetworks() called");

    if (!this.initialized) {
      logger.info("scanNetworks() failed - service not initialized");
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    try {
      logger.info("Triggering WiFi scan via nmcli...");

      // Request a fresh scan and then get results
      // -t = terse output, -f = fields to display
      const { stdout } = await execAsync(
        "sudo nmcli device wifi rescan && sudo nmcli -t -f SSID,SIGNAL,SECURITY,FREQ device wifi list",
      );

      logger.info("WiFi scan complete, parsing results...");
      const networks: WiFiNetwork[] = [];
      const lines = stdout.trim().split("\n");
      logger.info(`Raw scan returned ${lines.length} lines`);

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

      logger.info(`Found ${networks.length} WiFi networks:`);
      for (const network of networks) {
        logger.info(
          `  - "${network.ssid}" (${network.signalStrength}%, ${network.security}, ${network.frequency}MHz)`,
        );
      }
      return success(networks);
    } catch (error) {
      logger.error("Failed to scan networks:", error);
      return failure(WiFiError.scanFailed(error as Error));
    }
  }

  async getCurrentConnection(): Promise<Result<WiFiConnection | null>> {
    logger.info("getCurrentConnection() called");

    if (!this.initialized) {
      logger.info("getCurrentConnection() failed - service not initialized");
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    try {
      logger.info("Querying wlan0 device info via nmcli...");
      // Get WiFi device info
      const { stdout } = await execAsync(
        "sudo nmcli device wifi rescan && sudo nmcli -t -f GENERAL.CONNECTION,IP4.ADDRESS,GENERAL.HWADDR device show wlan0",
      );

      const lines = stdout.trim().split("\n");
      const data: Record<string, string> = {};

      for (const line of lines) {
        // Split only on first colon to handle values with colons (like MAC addresses)
        const colonIndex = line.indexOf(":");
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex);
          const value = line.substring(colonIndex + 1);
          data[key] = value;
        }
      }

      const connectionName = data["GENERAL.CONNECTION"];
      logger.info(`Current connection name: "${connectionName || "(none)"}"`);

      // Not connected if connection name is empty or "--"
      if (!connectionName || connectionName === "--") {
        logger.info("Not currently connected to any WiFi network");
        return success(null);
      }

      // Get signal strength for current connection
      logger.info(`Getting signal strength for "${connectionName}"...`);
      const signalResult = await this.getSignalStrength(connectionName);
      const signalStrength = signalResult.success ? signalResult.data : 0;

      // Find IP address - nmcli uses IP4.ADDRESS[1], IP4.ADDRESS[2], etc.
      let ipAddress = "";
      for (const key of Object.keys(data)) {
        if (key.startsWith("IP4.ADDRESS")) {
          // Value is like "192.168.1.100/24" - extract just the IP
          ipAddress = data[key].split("/")[0];
          break;
        }
      }

      const connection: WiFiConnection = {
        ssid: connectionName,
        ipAddress,
        macAddress: data["GENERAL.HWADDR"] || "",
        signalStrength,
        connectedAt: new Date(), // nmcli doesn't provide connection time
      };

      logger.info(
        `Current connection: "${connection.ssid}" (IP: ${connection.ipAddress}, Signal: ${connection.signalStrength}%)`,
      );
      return success(connection);
    } catch (error) {
      logger.warn("Failed to get current connection:", error);
      return success(null); // Not connected is not an error
    }
  }

  async isConnected(): Promise<Result<boolean>> {
    logger.info("isConnected() called");
    const connectionResult = await this.getCurrentConnection();

    if (!connectionResult.success) {
      logger.info("isConnected() check failed due to error");
      return failure(connectionResult.error);
    }

    const connected = connectionResult.data !== null;
    logger.info(`isConnected() result: ${connected}`);
    return success(connected);
  }

  async connect(ssid: string, password: string): Promise<Result<void>> {
    logger.info(`connect() called for SSID: "${ssid}"`);

    if (!this.initialized) {
      logger.info("connect() failed - service not initialized");
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    try {
      logger.info(`Attempting to connect to "${ssid}" via nmcli...`);
      logger.info(
        `Connection timeout set to ${this.config.connectionTimeoutMs}ms`,
      );

      // First, check if a connection profile already exists and delete it
      logger.info(`Checking if connection profile "${ssid}" already exists...`);
      const exists = await this.connectionExists(ssid);
      if (exists) {
        logger.info(`Deleting existing connection profile "${ssid}"...`);
        try {
          await execAsync(`sudo nmcli connection delete "${ssid}"`);
        } catch {
          // Ignore errors deleting - might not exist
        }
      }

      // Create connection profile with explicit WPA-PSK settings
      logger.info(`Creating connection profile for "${ssid}"...`);
      const createCommand = [
        "sudo nmcli connection add",
        "type wifi",
        `con-name "${ssid}"`,
        "ifname wlan0",
        `ssid "${ssid}"`,
        "wifi-sec.key-mgmt wpa-psk",
        `wifi-sec.psk "${password}"`,
      ].join(" ");

      await execAsync(createCommand);
      logger.info(`Connection profile created for "${ssid}"`);

      // Activate the connection
      logger.info(`Activating connection "${ssid}"...`);
      const activateCommand = `sudo nmcli connection up "${ssid}"`;

      const { stdout, stderr } = (await Promise.race([
        execAsync(activateCommand),
        this.timeout(this.config.connectionTimeoutMs),
      ])) as { stdout: string; stderr: string };

      if (stdout) {
        logger.info(`nmcli stdout: ${stdout.trim()}`);
      }

      if (stderr && stderr.includes("Error")) {
        if (
          stderr.includes("Secrets were required") ||
          stderr.includes("802-11-wireless-security")
        ) {
          logger.error(
            `Authentication failed for "${ssid}" - invalid password`,
          );
          return failure(WiFiError.authFailed(ssid));
        }

        logger.error(`Connection failed for "${ssid}": ${stderr}`);
        return failure(WiFiError.connectionFailed(ssid, new Error(stderr)));
      }

      logger.info(`Successfully connected to "${ssid}"!`);
      return success(undefined);
    } catch (error) {
      if (error instanceof Error && error.message === "Timeout") {
        logger.error(
          `Connection to "${ssid}" timed out after ${this.config.connectionTimeoutMs}ms`,
        );
        return failure(
          WiFiError.timeout("connect", this.config.connectionTimeoutMs),
        );
      }

      logger.error(`Failed to connect to "${ssid}":`, error);
      return failure(WiFiError.connectionFailed(ssid, error as Error));
    }
  }

  async disconnect(): Promise<Result<void>> {
    logger.info("disconnect() called");

    if (!this.initialized) {
      logger.info("disconnect() failed - service not initialized");
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    logger.info("Checking current connection before disconnect...");
    const connectionResult = await this.getCurrentConnection();
    if (!connectionResult.success) {
      logger.info("disconnect() failed - could not get current connection");
      return failure(connectionResult.error);
    }

    if (!connectionResult.data) {
      logger.info(
        "disconnect() failed - not currently connected to any network",
      );
      return failure(WiFiError.notConnected());
    }

    const currentSSID = connectionResult.data.ssid;
    try {
      logger.info(`Disconnecting from "${currentSSID}" via nmcli...`);

      // Requires sudo to disconnect
      await execAsync("sudo nmcli device disconnect wlan0");

      logger.info(`Successfully disconnected from "${currentSSID}"`);
      return success(undefined);
    } catch (error) {
      logger.error(`Failed to disconnect from "${currentSSID}":`, error);
      return failure(WiFiError.unknown((error as Error).message));
    }
  }

  async saveNetwork(config: WiFiNetworkConfig): Promise<Result<void>> {
    logger.info(`saveNetwork() called for SSID: "${config.ssid}"`);
    logger.info(
      `  Auto-connect: ${config.autoConnect}, Priority: ${config.priority}`,
    );

    if (!this.initialized) {
      logger.info("saveNetwork() failed - service not initialized");
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    try {
      logger.info(
        `Checking if connection for "${config.ssid}" already exists...`,
      );

      // Check if connection already exists
      const existsResult = await this.connectionExists(config.ssid);
      if (existsResult) {
        logger.info(
          `Connection "${config.ssid}" already exists - deleting it first`,
        );
        // Delete existing connection first (requires sudo)
        await execAsync(`sudo nmcli connection delete "${config.ssid}"`);
        logger.info(`Deleted existing connection "${config.ssid}"`);
      } else {
        logger.info(`Connection "${config.ssid}" does not exist yet`);
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

      logger.info(`Creating new connection for "${config.ssid}"...`);
      await execAsync(command);

      logger.info(`Network config saved successfully for "${config.ssid}"`);
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
    logger.info("getSavedNetworks() called");

    if (!this.initialized) {
      logger.info("getSavedNetworks() failed - service not initialized");
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    try {
      logger.info("Querying saved WiFi connections via nmcli...");
      // List all WiFi connections
      const { stdout } = await execAsync(
        "sudo nmcli device wifi rescan &&& sudo nmcli -t -f NAME,TYPE,AUTOCONNECT,AUTOCONNECT-PRIORITY connection show",
      );

      const networks: WiFiNetworkConfig[] = [];
      const lines = stdout.trim().split("\n");
      logger.info(`nmcli returned ${lines.length} total connections`);

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

      logger.info(`Found ${networks.length} saved WiFi networks:`);
      for (const network of networks) {
        logger.info(
          `  - "${network.ssid}" (auto-connect: ${network.autoConnect}, priority: ${network.priority})`,
        );
      }
      return success(networks);
    } catch (error) {
      logger.error("Failed to get saved networks:", error);
      return failure(WiFiError.unknown((error as Error).message));
    }
  }

  async removeNetwork(ssid: string): Promise<Result<void>> {
    logger.info(`removeNetwork() called for SSID: "${ssid}"`);

    if (!this.initialized) {
      logger.info("removeNetwork() failed - service not initialized");
      return failure(WiFiError.unknown("WiFi service not initialized"));
    }

    try {
      logger.info(`Checking if connection "${ssid}" exists...`);

      const exists = await this.connectionExists(ssid);
      if (!exists) {
        logger.info(`Network "${ssid}" not found in saved connections`);
        return failure(WiFiError.networkNotFound(ssid));
      }

      logger.info(`Deleting connection "${ssid}" via nmcli...`);
      // Requires sudo to delete network connections
      await execAsync(`sudo nmcli connection delete "${ssid}"`);

      logger.info(`Network config removed successfully for "${ssid}"`);
      return success(undefined);
    } catch (error) {
      logger.error(`Failed to remove network config for "${ssid}":`, error);
      return failure(WiFiError.unknown((error as Error).message));
    }
  }

  onConnectionChange(callback: (connected: boolean) => void): () => void {
    logger.info(
      `onConnectionChange() - registering new callback (total: ${this.connectionChangeCallbacks.length + 1})`,
    );
    this.connectionChangeCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.connectionChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.connectionChangeCallbacks.splice(index, 1);
        logger.info(
          `onConnectionChange() - unsubscribed callback (remaining: ${this.connectionChangeCallbacks.length})`,
        );
      }
    };
  }

  // State machine methods

  getState(): WiFiState {
    logger.info(`getState() called - current state: ${this.currentState}`);
    return this.currentState;
  }

  async isConnectedToMobileHotspot(): Promise<Result<boolean>> {
    logger.info("isConnectedToMobileHotspot() called");
    const connectionResult = await this.getCurrentConnection();

    if (!connectionResult.success) {
      logger.info(
        "isConnectedToMobileHotspot() - failed to get current connection",
      );
      return failure(connectionResult.error);
    }

    if (!connectionResult.data) {
      logger.info(
        "isConnectedToMobileHotspot() - not connected to any network",
      );
      return success(false);
    }

    const effectiveSSID = this.getEffectiveHotspotSSID();
    const isHotspot = connectionResult.data.ssid === effectiveSSID;
    logger.info(
      `isConnectedToMobileHotspot() - connected to "${connectionResult.data.ssid}", is hotspot: ${isHotspot}`,
    );
    return success(isHotspot);
  }

  onStateChange(
    callback: (state: WiFiState, previousState: WiFiState) => void,
  ): () => void {
    logger.info(
      `onStateChange() - registering new callback (total: ${this.stateChangeCallbacks.length + 1})`,
    );
    this.stateChangeCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
        logger.info(
          `onStateChange() - unsubscribed callback (remaining: ${this.stateChangeCallbacks.length})`,
        );
      }
    };
  }

  // Mode awareness methods

  setWebSocketClientCount(count: number): void {
    const previousCount = this.webSocketClientCount;
    this.webSocketClientCount = count;

    logger.info(
      `setWebSocketClientCount() - count changed: ${previousCount} -> ${count}`,
    );

    // If we just entered stopped mode (clients connected) and not connected to hotspot,
    // trigger the state machine check
    if (previousCount === 0 && count > 0) {
      logger.info(
        "Mode transition: DRIVING -> STOPPED (WebSocket clients connected)",
      );
      logger.info("Triggering immediate hotspot check...");
      // Run a hotspot check immediately
      void this.handleHotspotPollingTick();
    }

    // If we just entered driving mode (no clients), reset state if we were waiting
    if (previousCount > 0 && count === 0) {
      logger.info("Mode transition: STOPPED -> DRIVING (no WebSocket clients)");
      if (
        this.currentState === WiFiState.WAITING_FOR_HOTSPOT ||
        this.currentState === WiFiState.CONNECTING
      ) {
        logger.info("Aborting hotspot connection attempt due to mode change");
        // Abort any in-progress connection attempt
        if (this.connectionAttemptAbortController) {
          logger.info("Sending abort signal to connection attempt");
          this.connectionAttemptAbortController.abort();
        }
        this.connectionAttemptInProgress = false;

        // Go back to idle (we were in the middle of hotspot connection)
        logger.info("Resetting state to IDLE");
        this.setState(WiFiState.IDLE);
      }
    }
  }

  getMode(): WiFiMode {
    const mode = this.webSocketClientCount > 0 ? "stopped" : "driving";
    logger.info(
      `getMode() called - current mode: ${mode} (${this.webSocketClientCount} WebSocket clients)`,
    );
    return mode;
  }

  /**
   * Check if a specific network is visible (without disconnecting from current network)
   */
  async isNetworkVisible(ssid: string): Promise<Result<boolean>> {
    logger.info(`isNetworkVisible() checking for SSID: "${ssid}"`);

    try {
      // Trigger a scan and get results (this doesn't disconnect)
      const { stdout } = await execAsync(
        "sudo nmcli device wifi rescan && sudo nmcli -t -f SSID device wifi list",
      );

      const lines = stdout.trim().split("\n");
      const foundNetworks = lines.filter((line) => line.trim() === ssid);

      if (foundNetworks.length > 0) {
        logger.info(`Network "${ssid}" is visible`);
        return success(true);
      } else {
        logger.info(`Network "${ssid}" is NOT visible`);
        return success(false);
      }
    } catch (error) {
      logger.error(`Failed to scan for network "${ssid}":`, error);
      return success(false); // Assume not visible on error
    }
  }

  async attemptMobileHotspotConnection(): Promise<Result<void>> {
    logger.info("attemptMobileHotspotConnection() called");

    if (this.connectionAttemptInProgress) {
      logger.warn(
        "Connection attempt already in progress - rejecting duplicate request",
      );
      return failure(
        WiFiError.unknown("Connection attempt already in progress"),
      );
    }

    this.connectionAttemptInProgress = true;
    this.connectionAttemptAbortController = new AbortController();
    logger.info("Connection attempt started, abort controller created");

    const effectiveSSID = this.getEffectiveHotspotSSID();
    const effectivePassword = this.getEffectiveHotspotPassword();

    try {
      logger.info(
        `Checking if mobile hotspot "${effectiveSSID}" is visible...`,
      );

      // First check if the hotspot is visible WITHOUT disconnecting
      const visibleResult = await this.isNetworkVisible(effectiveSSID);
      if (!visibleResult.success || !visibleResult.data) {
        logger.info(
          `Mobile hotspot "${effectiveSSID}" is not visible - skipping connection attempt`,
        );
        this.connectionAttemptInProgress = false;
        this.connectionAttemptAbortController = undefined;
        // Stay in current state - don't change anything
        return failure(WiFiError.networkNotFound(effectiveSSID));
      }

      logger.info(
        `Mobile hotspot "${effectiveSSID}" is visible - proceeding with connection`,
      );
      logger.info(`Timeout set to ${HOTSPOT_CONNECTION_TIMEOUT_MS}ms`);

      logger.info("Setting state to CONNECTING");
      this.setState(WiFiState.CONNECTING);

      // Create a timeout promise
      logger.info("Setting up connection timeout...");
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          logger.info("Hotspot connection timeout triggered");
          reject(new Error("HOTSPOT_TIMEOUT"));
        }, HOTSPOT_CONNECTION_TIMEOUT_MS);

        // Clear timeout if aborted
        this.connectionAttemptAbortController?.signal.addEventListener(
          "abort",
          () => {
            logger.info("Abort signal received - clearing timeout");
            clearTimeout(timeoutId);
            reject(new Error("ABORTED"));
          },
        );
      });

      // Try to connect
      logger.info("Initiating connection to mobile hotspot...");
      const connectPromise = this.connect(effectiveSSID, effectivePassword);

      logger.info("Waiting for connection result or timeout...");
      const result = (await Promise.race([
        connectPromise,
        timeoutPromise,
      ])) as Result<void>;

      if (result.success) {
        logger.info(
          `nmcli reports successful connection to "${effectiveSSID}"`,
        );

        // Wait a moment for the connection to stabilize, then verify
        logger.info("Waiting 2 seconds for connection to stabilize...");
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify we're actually connected to the hotspot
        logger.info("Verifying connection to hotspot...");
        const verifyResult = await this.isConnectedToMobileHotspot();

        if (verifyResult.success && verifyResult.data) {
          logger.info(
            `Verified: Successfully connected to mobile hotspot "${effectiveSSID}"!`,
          );
          logger.info("Setting state to CONNECTED");
          this.setState(WiFiState.CONNECTED);
          // Clear fallback network on successful connection
          logger.info("Clearing fallback network from config...");
          await this.clearFallbackNetwork();
          return success(undefined);
        } else {
          logger.warn(
            `Connection verification failed - not actually connected to "${effectiveSSID}"`,
          );
          // Try one more time with a longer wait
          logger.info("Waiting 3 more seconds and retrying verification...");
          await new Promise((resolve) => setTimeout(resolve, 3000));

          const retryVerify = await this.isConnectedToMobileHotspot();
          if (retryVerify.success && retryVerify.data) {
            logger.info(
              `Retry verified: Successfully connected to mobile hotspot "${effectiveSSID}"!`,
            );
            logger.info("Setting state to CONNECTED");
            this.setState(WiFiState.CONNECTED);
            logger.info("Clearing fallback network from config...");
            await this.clearFallbackNetwork();
            return success(undefined);
          } else {
            logger.error(
              `Connection verification failed after retry - connection may have failed`,
            );
            throw new Error("CONNECTION_VERIFY_FAILED");
          }
        }
      } else {
        logger.info("Connection failed - throwing error");
        throw result.error;
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "ABORTED") {
          logger.info("Connection attempt was aborted by user/system");
          return failure(WiFiError.unknown("Connection attempt aborted"));
        }

        if (error.message === "HOTSPOT_TIMEOUT") {
          logger.warn(
            `Mobile hotspot connection timed out after ${HOTSPOT_CONNECTION_TIMEOUT_MS}ms`,
          );

          // Attempt to reconnect to fallback network
          logger.info("Setting state to RECONNECTING_FALLBACK");
          this.setState(WiFiState.RECONNECTING_FALLBACK);
          logger.info("Attempting to reconnect to fallback network...");
          const reconnectResult = await this.reconnectToFallback();

          if (reconnectResult.success) {
            logger.info("Successfully reconnected to fallback network");
            logger.info("Setting state to DISCONNECTED");
            this.setState(WiFiState.DISCONNECTED);
          } else {
            logger.error("Failed to reconnect to fallback network");
            logger.info("Setting state to ERROR");
            this.setState(WiFiState.ERROR);
          }

          return failure(
            WiFiError.hotspotConnectionTimeout(
              effectiveSSID,
              HOTSPOT_CONNECTION_TIMEOUT_MS,
            ),
          );
        }

        if (error.message === "CONNECTION_VERIFY_FAILED") {
          logger.warn(
            "Connection verification failed - nmcli reported success but we couldn't verify the connection",
          );
          // Go back to WAITING_FOR_HOTSPOT to try again on next poll
          logger.info("Setting state to WAITING_FOR_HOTSPOT to retry");
          this.setState(WiFiState.WAITING_FOR_HOTSPOT);
          return failure(WiFiError.connectionFailed(effectiveSSID, error));
        }
      }

      logger.error("Failed to connect to mobile hotspot:", error);
      logger.info("Setting state to ERROR");
      this.setState(WiFiState.ERROR);
      return failure(WiFiError.connectionFailed(effectiveSSID, error as Error));
    } finally {
      logger.info("Connection attempt finished - cleaning up");
      this.connectionAttemptInProgress = false;
      this.connectionAttemptAbortController = undefined;
    }
  }

  getMobileHotspotSSID(): string {
    const effectiveSSID = this.getEffectiveHotspotSSID();
    logger.info(`getMobileHotspotSSID() called - returning "${effectiveSSID}"`);
    return effectiveSSID;
  }

  // Hotspot configuration methods

  getHotspotConfig(): HotspotConfig {
    const savedConfig = this.configService?.getHotspotConfig();
    if (savedConfig) {
      logger.info(
        `getHotspotConfig() - returning saved config: SSID="${savedConfig.ssid}"`,
      );
      return savedConfig;
    }

    // Return default config from environment
    const defaultConfig: HotspotConfig = {
      ssid: this.config.primarySSID,
      password: this.config.primaryPassword,
      updatedAt: new Date().toISOString(),
    };
    logger.info(
      `getHotspotConfig() - returning default config: SSID="${defaultConfig.ssid}"`,
    );
    return defaultConfig;
  }

  async setHotspotConfig(
    ssid: string,
    password: string,
  ): Promise<Result<void>> {
    logger.info(`setHotspotConfig() called - SSID="${ssid}"`);

    if (!ssid || ssid.trim().length === 0) {
      logger.error("setHotspotConfig() - SSID cannot be empty");
      return failure(WiFiError.unknown("SSID cannot be empty"));
    }

    if (!password || password.length < 8) {
      logger.error(
        "setHotspotConfig() - Password must be at least 8 characters",
      );
      return failure(
        WiFiError.unknown("Password must be at least 8 characters for WPA2"),
      );
    }

    if (!this.configService) {
      logger.error("setHotspotConfig() - No config service available");
      return failure(WiFiError.unknown("Config service not available"));
    }

    try {
      const config: HotspotConfig = {
        ssid: ssid.trim(),
        password,
        updatedAt: new Date().toISOString(),
      };

      // Save to ConfigService
      this.configService.setHotspotConfig(config);
      await this.configService.save();

      logger.info(
        `setHotspotConfig() - Saved new hotspot config: SSID="${ssid}"`,
      );

      // Save current network as fallback before disconnecting
      await this.saveFallbackNetwork();

      // Disconnect from current network to trigger reconnection flow
      logger.info(
        "setHotspotConfig() - Disconnecting to trigger reconnection to new hotspot",
      );
      await this.disconnect();

      // Transition to WAITING_FOR_HOTSPOT state to show instruction screen
      logger.info("setHotspotConfig() - Setting state to WAITING_FOR_HOTSPOT");
      this.setState(WiFiState.WAITING_FOR_HOTSPOT);

      // Reset the connected screen flag so the instruction screen shows again
      this.connectedScreenDisplayed = false;

      return success(undefined);
    } catch (error) {
      logger.error("setHotspotConfig() - Failed to save config:", error);
      return failure(WiFiError.unknown((error as Error).message));
    }
  }

  notifyConnectedScreenDisplayed(): void {
    logger.info(
      "notifyConnectedScreenDisplayed() - connected screen was displayed",
    );
    this.connectedScreenDisplayed = true;
  }

  // Private helper methods

  private parseSecurity(security: string): WiFiNetwork["security"] {
    let result: WiFiNetwork["security"];
    if (!security || security === "--") result = "Open";
    else if (security.includes("WPA3")) result = "WPA3";
    else if (security.includes("WPA2")) result = "WPA2";
    else if (security.includes("WPA")) result = "WPA";
    else if (security.includes("WEP")) result = "WEP";
    else result = "Unknown";

    logger.info(`parseSecurity("${security}") -> ${result}`);
    return result;
  }

  private async getSignalStrength(ssid: string): Promise<Result<number>> {
    logger.info(`getSignalStrength() called for SSID: "${ssid}"`);
    try {
      const { stdout } = await execAsync(
        `sudo nmcli device wifi rescan && sudo nmcli -t -f SSID,SIGNAL device wifi list | grep "^${ssid}:"`,
      );

      const [, signal] = stdout.trim().split(":");
      const signalStrength = parseInt(signal, 10) || 0;
      logger.info(`Signal strength for "${ssid}": ${signalStrength}%`);
      return success(signalStrength);
    } catch (error) {
      logger.info(
        `Could not get signal strength for "${ssid}" - defaulting to 0`,
      );
      return success(0); // Default to 0 if can't get signal
    }
  }

  private async connectionExists(ssid: string): Promise<boolean> {
    logger.info(`connectionExists() checking for SSID: "${ssid}"`);
    try {
      await execAsync(`nmcli connection show "${ssid}"`);
      logger.info(`Connection "${ssid}" exists`);
      return true;
    } catch {
      logger.info(`Connection "${ssid}" does not exist`);
      return false;
    }
  }

  private startConnectionMonitoring(): void {
    logger.info(
      "startConnectionMonitoring() - starting connection monitoring (5-second interval)",
    );
    let lastConnected = false;

    this.connectionCheckInterval = setInterval(async () => {
      logger.info("Connection monitoring tick - checking connection status...");
      const connectedResult = await this.isConnected();

      if (connectedResult.success) {
        const connected = connectedResult.data;

        if (connected !== lastConnected) {
          logger.info(
            `WiFi connection state changed: ${lastConnected ? "connected" : "disconnected"} -> ${connected ? "connected" : "disconnected"}`,
          );
          logger.info(
            `Notifying ${this.connectionChangeCallbacks.length} connection change callbacks...`,
          );
          this.notifyConnectionChange(connected);
          lastConnected = connected;
        } else {
          logger.info(
            `Connection status unchanged: ${connected ? "connected" : "disconnected"}`,
          );
        }
      } else {
        logger.info("Failed to check connection status");
      }
    }, 5000); // Check every 5 seconds
  }

  private notifyConnectionChange(connected: boolean): void {
    logger.info(
      `notifyConnectionChange(${connected}) - notifying ${this.connectionChangeCallbacks.length} callbacks`,
    );
    for (let i = 0; i < this.connectionChangeCallbacks.length; i++) {
      try {
        logger.info(
          `  Calling connection change callback ${i + 1}/${this.connectionChangeCallbacks.length}`,
        );
        this.connectionChangeCallbacks[i](connected);
      } catch (error) {
        logger.error(`Error in connection change callback ${i + 1}:`, error);
      }
    }
    logger.info("notifyConnectionChange() complete");
  }

  private timeout(ms: number): Promise<never> {
    logger.info(`timeout() - creating ${ms}ms timeout promise`);
    return new Promise((_, reject) => {
      setTimeout(() => {
        logger.info(`timeout() - ${ms}ms timeout expired`);
        reject(new Error("Timeout"));
      }, ms);
    });
  }

  /**
   * Get the effective hotspot SSID (from ConfigService if saved, otherwise from initial config)
   */
  private getEffectiveHotspotSSID(): string {
    const savedConfig = this.configService?.getHotspotConfig();
    return savedConfig?.ssid ?? this.config.primarySSID;
  }

  /**
   * Get the effective hotspot password (from ConfigService if saved, otherwise from initial config)
   */
  private getEffectiveHotspotPassword(): string {
    const savedConfig = this.configService?.getHotspotConfig();
    return savedConfig?.password ?? this.config.primaryPassword;
  }

  // State machine private methods

  private setState(newState: WiFiState): void {
    logger.info(`setState() called with: ${newState}`);
    if (newState === this.currentState) {
      logger.info(`setState() - state already ${newState}, no change needed`);
      return;
    }

    const previousState = this.currentState;
    this.currentState = newState;

    // Track when we enter CONNECTED state for grace period and reset screen flag
    if (newState === WiFiState.CONNECTED) {
      this.connectedStateEnteredAt = new Date();
      this.connectedScreenDisplayed = false; // Reset - need to display connected screen
      logger.info(
        `Entered CONNECTED state at ${this.connectedStateEnteredAt.toISOString()}`,
      );
    } else {
      this.connectedStateEnteredAt = undefined;
    }

    logger.info(`WiFi state transition: ${previousState} -> ${newState}`);
    logger.info(
      `Notifying ${this.stateChangeCallbacks.length} state change callbacks...`,
    );
    this.notifyStateChange(newState, previousState);
  }

  private notifyStateChange(state: WiFiState, previousState: WiFiState): void {
    logger.info(
      `notifyStateChange(${state}, ${previousState}) - notifying ${this.stateChangeCallbacks.length} callbacks`,
    );
    for (let i = 0; i < this.stateChangeCallbacks.length; i++) {
      try {
        logger.info(
          `  Calling state change callback ${i + 1}/${this.stateChangeCallbacks.length}`,
        );
        this.stateChangeCallbacks[i](state, previousState);
      } catch (error) {
        logger.error(`Error in state change callback ${i + 1}:`, error);
      }
    }
    logger.info("notifyStateChange() complete");
  }

  private startHotspotPolling(): void {
    logger.info(
      `startHotspotPolling() - starting hotspot polling (${HOTSPOT_CHECK_INTERVAL_MS}ms interval)`,
    );

    this.hotspotCheckInterval = setInterval(() => {
      logger.info("Hotspot polling tick triggered");
      void this.handleHotspotPollingTick();
    }, HOTSPOT_CHECK_INTERVAL_MS);

    logger.info("Hotspot polling started");
  }

  private stopHotspotPolling(): void {
    logger.info("stopHotspotPolling() called");
    if (this.hotspotCheckInterval) {
      logger.info("Clearing hotspot polling interval");
      clearInterval(this.hotspotCheckInterval);
      this.hotspotCheckInterval = undefined;
      logger.info("Hotspot polling stopped");
    } else {
      logger.info("Hotspot polling was not running");
    }
  }

  private async handleHotspotPollingTick(): Promise<void> {
    logger.info("handleHotspotPollingTick() - starting polling tick");
    logger.info(`  Current state: ${this.currentState}`);
    logger.info(`  WebSocket client count: ${this.webSocketClientCount}`);
    logger.info(`  Mode: ${this.getMode()}`);

    // Check if connected to mobile hotspot
    logger.info("Checking if connected to mobile hotspot...");
    const connectedToHotspot = await this.isConnectedToMobileHotspot();

    if (connectedToHotspot.success && connectedToHotspot.data) {
      // Already connected to hotspot
      logger.info("Already connected to mobile hotspot");
      if (this.currentState !== WiFiState.CONNECTED) {
        logger.info("Updating state to CONNECTED");
        this.setState(WiFiState.CONNECTED);
      } else if (
        this.webSocketClientCount === 0 &&
        !this.connectedScreenDisplayed
      ) {
        // State is already CONNECTED, no WebSocket clients yet, and screen not displayed.
        // Notify callbacks to retry displaying the connected screen.
        logger.info(
          "State already CONNECTED, screen not displayed yet - notifying for display retry",
        );
        this.notifyStateChange(WiFiState.CONNECTED, WiFiState.CONNECTED);
      } else {
        // State is CONNECTED and either clients are connected or screen was displayed - no action needed
        logger.info("State already CONNECTED, no notification needed");
      }
      logger.info("handleHotspotPollingTick() complete");
      return;
    }

    logger.info("Not connected to mobile hotspot");

    // If we were previously connected to the hotspot but now aren't, we lost connection
    // Use a grace period to avoid false disconnection detection due to timing issues
    if (this.currentState === WiFiState.CONNECTED) {
      const gracePeriodMs = 5000; // 5 seconds grace period after entering CONNECTED
      const now = new Date();
      const connectedDuration = this.connectedStateEnteredAt
        ? now.getTime() - this.connectedStateEnteredAt.getTime()
        : Infinity;

      if (connectedDuration < gracePeriodMs) {
        logger.info(
          `In CONNECTED state for ${connectedDuration}ms (grace period: ${gracePeriodMs}ms) - skipping disconnection check`,
        );
        logger.info(
          "handleHotspotPollingTick() complete (within grace period)",
        );
        return;
      }

      logger.info(
        `Was CONNECTED for ${connectedDuration}ms (past grace period) but now disconnected - transitioning to WAITING_FOR_HOTSPOT`,
      );
      this.setState(WiFiState.WAITING_FOR_HOTSPOT);
      // Don't return - continue to check if we should attempt reconnection
    }

    // Check if we're in stopped mode (WebSocket clients connected)
    if (this.webSocketClientCount > 0) {
      logger.info("In STOPPED mode (WebSocket clients connected)");

      // Allow retry from ERROR state - reset it first
      if (this.currentState === WiFiState.ERROR) {
        logger.info("Resetting from ERROR state to allow retry");
        this.setState(WiFiState.IDLE);
      }

      // If we're actively connecting or reconnecting, don't interfere
      if (
        this.currentState === WiFiState.CONNECTING ||
        this.currentState === WiFiState.RECONNECTING_FALLBACK
      ) {
        logger.info(
          `Already in transitional state (${this.currentState}) - not initiating new connection`,
        );
      } else {
        // We're in IDLE, DISCONNECTED, or WAITING_FOR_HOTSPOT - check if hotspot is visible
        const effectiveSSID = this.getEffectiveHotspotSSID();
        logger.info("Checking if hotspot is visible...");
        const visibleResult = await this.isNetworkVisible(effectiveSSID);

        if (!visibleResult.success || !visibleResult.data) {
          logger.info(
            `Hotspot "${effectiveSSID}" not visible - staying connected to current network`,
          );
          // Make sure we're in WAITING_FOR_HOTSPOT state to show the instruction screen
          if (this.currentState !== WiFiState.WAITING_FOR_HOTSPOT) {
            logger.info(
              "Setting state to WAITING_FOR_HOTSPOT to show instruction screen",
            );
            this.setState(WiFiState.WAITING_FOR_HOTSPOT);
          }
          // Wait for next poll
        } else {
          logger.info("Hotspot is visible - initiating connection sequence");
          // Save current connection as fallback before trying to connect to hotspot
          logger.info("Saving current connection as fallback...");
          await this.saveFallbackNetwork();

          // Enter waiting state if not already
          if (this.currentState !== WiFiState.WAITING_FOR_HOTSPOT) {
            logger.info("Entering WAITING_FOR_HOTSPOT state");
            this.setState(WiFiState.WAITING_FOR_HOTSPOT);
          }

          // Short delay then attempt connection
          logger.info(
            `Scheduling hotspot connection attempt in ${HOTSPOT_CONNECTION_DELAY_MS}ms...`,
          );
          setTimeout(() => {
            logger.info(
              "Hotspot connection delay elapsed - checking conditions...",
            );
            if (
              this.webSocketClientCount > 0 &&
              this.currentState === WiFiState.WAITING_FOR_HOTSPOT
            ) {
              logger.info(
                "Conditions met - initiating hotspot connection attempt",
              );
              void this.attemptMobileHotspotConnection();
            } else {
              logger.info(
                `Conditions not met (clients: ${this.webSocketClientCount}, state: ${this.currentState}) - skipping connection attempt`,
              );
            }
          }, HOTSPOT_CONNECTION_DELAY_MS);
        }
      }
    } else {
      logger.info("In DRIVING mode (no WebSocket clients)");

      // Check if onboarding is not complete - if so, we should still try to connect to hotspot
      const onboardingComplete =
        this.configService?.isOnboardingCompleted() ?? true;
      logger.info(`Onboarding complete: ${onboardingComplete}`);

      if (!onboardingComplete) {
        // During onboarding, we should attempt connection even without WebSocket clients
        logger.info(
          "Onboarding not complete - should attempt hotspot connection",
        );

        // Allow retry from ERROR state - reset it first
        if (this.currentState === WiFiState.ERROR) {
          logger.info("Resetting from ERROR state to allow retry");
          this.setState(WiFiState.IDLE);
        }

        // If we're actively connecting or reconnecting, don't interfere
        if (
          this.currentState === WiFiState.CONNECTING ||
          this.currentState === WiFiState.RECONNECTING_FALLBACK
        ) {
          logger.info(
            `Already in transitional state (${this.currentState}) - not initiating new connection`,
          );
        } else {
          // We're in IDLE, DISCONNECTED, or WAITING_FOR_HOTSPOT - check if hotspot is visible
          const effectiveSSID = this.getEffectiveHotspotSSID();
          logger.info("Checking if hotspot is visible (onboarding)...");
          const visibleResult = await this.isNetworkVisible(effectiveSSID);

          if (!visibleResult.success || !visibleResult.data) {
            logger.info(
              `Hotspot "${effectiveSSID}" not visible - staying connected to current network (onboarding)`,
            );
            // Make sure we're in WAITING_FOR_HOTSPOT state to show the instruction screen
            if (this.currentState !== WiFiState.WAITING_FOR_HOTSPOT) {
              logger.info(
                "Setting state to WAITING_FOR_HOTSPOT to show instruction screen (onboarding)",
              );
              this.setState(WiFiState.WAITING_FOR_HOTSPOT);
            }
            // Wait for next poll
          } else {
            logger.info(
              "Hotspot is visible - initiating connection sequence for onboarding...",
            );
            // Save current connection as fallback
            await this.saveFallbackNetwork();

            // Enter waiting state if not already
            if (this.currentState !== WiFiState.WAITING_FOR_HOTSPOT) {
              logger.info("Entering WAITING_FOR_HOTSPOT state (onboarding)");
              this.setState(WiFiState.WAITING_FOR_HOTSPOT);
            }

            // Wait a few seconds then attempt connection
            logger.info(
              `Scheduling hotspot connection attempt in ${HOTSPOT_CONNECTION_DELAY_MS}ms...`,
            );
            setTimeout(() => {
              logger.info(
                "Hotspot connection delay elapsed (onboarding) - checking conditions...",
              );
              if (this.currentState === WiFiState.WAITING_FOR_HOTSPOT) {
                logger.info(
                  "Conditions met - initiating hotspot connection attempt for onboarding",
                );
                void this.attemptMobileHotspotConnection();
              } else {
                logger.info(
                  `State changed to ${this.currentState} - skipping connection attempt`,
                );
              }
            }, HOTSPOT_CONNECTION_DELAY_MS);
          }
        }
      } else {
        // Normal driving mode - just monitor, don't try to connect
        // Set state based on current connection
        logger.info("Checking general connection status...");
        const connected = await this.isConnected();
        if (connected.success) {
          logger.info(`Connected: ${connected.data}`);
          if (this.currentState === WiFiState.CONNECTED) {
            // We were connected to hotspot but now not
            logger.info(
              "Was connected to hotspot but now disconnected - setting state to DISCONNECTED",
            );
            this.setState(WiFiState.DISCONNECTED);
          } else if (
            this.currentState !== WiFiState.IDLE &&
            this.currentState !== WiFiState.DISCONNECTED
          ) {
            // Reset to idle/disconnected in driving mode
            const newState = connected.data
              ? WiFiState.IDLE
              : WiFiState.DISCONNECTED;
            logger.info(
              `Resetting state in driving mode: ${this.currentState} -> ${newState}`,
            );
            this.setState(newState);
          } else {
            logger.info(
              `State already appropriate (${this.currentState}) for driving mode`,
            );
          }
        } else {
          logger.info("Failed to check connection status in driving mode");
        }
      }
    }
    logger.info("handleHotspotPollingTick() complete");
  }

  private async saveFallbackNetwork(): Promise<void> {
    logger.info("saveFallbackNetwork() called");

    if (!this.configService) {
      logger.warn(
        "saveFallbackNetwork() - No config service available, cannot save fallback",
      );
      return;
    }

    try {
      logger.info("Getting current connection to save as fallback...");
      const connectionResult = await this.getCurrentConnection();
      const effectiveSSID = this.getEffectiveHotspotSSID();

      if (
        connectionResult.success &&
        connectionResult.data &&
        connectionResult.data.ssid !== effectiveSSID
      ) {
        logger.info(`Saving fallback network: "${connectionResult.data.ssid}"`);

        this.configService.setWiFiFallbackNetwork({
          ssid: connectionResult.data.ssid,
          savedAt: new Date().toISOString(),
        });

        // Persist to disk
        logger.info("Persisting fallback network to config file...");
        await this.configService.save();
        logger.info("Fallback network saved successfully");
      } else if (connectionResult.success && !connectionResult.data) {
        logger.info("No current connection to save as fallback");
      } else if (
        connectionResult.success &&
        connectionResult.data?.ssid === effectiveSSID
      ) {
        logger.info(
          "Current connection is the primary hotspot - not saving as fallback",
        );
      } else {
        logger.info("Could not get current connection to save as fallback");
      }
    } catch (error) {
      logger.error("Failed to save fallback network:", error);
    }
  }

  private async clearFallbackNetwork(): Promise<void> {
    logger.info("clearFallbackNetwork() called");

    if (!this.configService) {
      logger.info("No config service available - nothing to clear");
      return;
    }

    try {
      logger.info("Clearing fallback network from config...");
      this.configService.setWiFiFallbackNetwork(null);
      await this.configService.save();
      logger.info("Fallback network cleared successfully");
    } catch (error) {
      logger.error("Failed to clear fallback network:", error);
    }
  }

  private async reconnectToFallback(): Promise<Result<void>> {
    logger.info("reconnectToFallback() called");

    if (!this.configService) {
      logger.warn("reconnectToFallback() - No config service available");
      return failure(WiFiError.unknown("No config service available"));
    }

    const fallback = this.configService.getWiFiFallbackNetwork();
    logger.info(
      `Fallback network from config: ${fallback ? `"${fallback.ssid}" (saved at ${fallback.savedAt})` : "(none)"}`,
    );

    if (!fallback) {
      logger.info("No fallback network saved - nothing to reconnect to");
      return success(undefined);
    }

    logger.info(
      `Attempting to reconnect to fallback network: "${fallback.ssid}"`,
    );

    try {
      // First disconnect from any current network
      logger.info("Disconnecting from current network first...");
      await this.disconnect();

      // Try to connect to the saved network (it should be in NetworkManager)
      // We can't use password since NetworkManager doesn't expose it,
      // but if the network is saved, nmcli should auto-connect
      logger.info(`Executing nmcli connection up for "${fallback.ssid}"...`);
      const { stdout } = await execAsync(
        `sudo nmcli connection up "${fallback.ssid}"`,
      );

      logger.info(`nmcli output: ${stdout.trim()}`);

      if (stdout.includes("successfully activated")) {
        logger.info(
          `Successfully reconnected to fallback network "${fallback.ssid}"`,
        );
        return success(undefined);
      }

      logger.info("Connection command completed but activation status unclear");
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
