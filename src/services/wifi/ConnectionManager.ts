import { exec } from "child_process";
import { promisify } from "util";
import {
  Result,
  WiFiConnection,
  WiFiNetworkConfig,
  WiFiConfig,
  success,
  failure,
} from "@core/types";
import { WiFiError } from "@core/errors";
import { getLogger } from "@utils/logger";
import { NetworkScanner } from "./NetworkScanner";

const execAsync = promisify(exec);
const logger = getLogger("ConnectionManager");

/**
 * ConnectionManager handles WiFi connection operations:
 * connecting, disconnecting, saving networks, and monitoring connection state.
 */
export class ConnectionManager {
  private connectionChangeCallbacks: Array<(connected: boolean) => void> = [];
  private connectionCheckInterval?: NodeJS.Timeout;

  constructor(
    private config: WiFiConfig,
    private initialized: () => boolean,
    private networkScanner: NetworkScanner,
  ) {}

  /**
   * Start monitoring connection state changes (5-second interval)
   */
  startConnectionMonitoring(): void {
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

  /**
   * Stop connection monitoring
   */
  stopConnectionMonitoring(): void {
    if (this.connectionCheckInterval) {
      logger.info("Stopping connection monitoring interval");
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = undefined;
    }
  }

  /**
   * Get the current WiFi connection info
   */
  async getCurrentConnection(): Promise<Result<WiFiConnection | null>> {
    logger.info("getCurrentConnection() called");

    if (!this.initialized()) {
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
      const signalResult =
        await this.networkScanner.getSignalStrength(connectionName);
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

  /**
   * Check if currently connected to any WiFi network
   */
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

  /**
   * Connect to a WiFi network with the given credentials
   */
  async connect(ssid: string, password: string): Promise<Result<void>> {
    logger.info(`connect() called for SSID: "${ssid}"`);

    if (!this.initialized()) {
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

  /**
   * Disconnect from the current WiFi network
   */
  async disconnect(): Promise<Result<void>> {
    logger.info("disconnect() called");

    if (!this.initialized()) {
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

  /**
   * Save a WiFi network configuration
   */
  async saveNetwork(config: WiFiNetworkConfig): Promise<Result<void>> {
    logger.info(`saveNetwork() called for SSID: "${config.ssid}"`);
    logger.info(
      `  Auto-connect: ${config.autoConnect}, Priority: ${config.priority}`,
    );

    if (!this.initialized()) {
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

  /**
   * Get list of saved WiFi network configurations
   */
  async getSavedNetworks(): Promise<Result<WiFiNetworkConfig[]>> {
    logger.info("getSavedNetworks() called");

    if (!this.initialized()) {
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

  /**
   * Remove a saved WiFi network configuration
   */
  async removeNetwork(ssid: string): Promise<Result<void>> {
    logger.info(`removeNetwork() called for SSID: "${ssid}"`);

    if (!this.initialized()) {
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

  /**
   * Register a callback for connection state changes
   */
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

  /**
   * Clear all callbacks (for disposal)
   */
  clearCallbacks(): void {
    const count = this.connectionChangeCallbacks.length;
    logger.info(`Clearing ${count} connection change callbacks`);
    this.connectionChangeCallbacks = [];
  }

  /**
   * Check if a connection profile exists for the given SSID
   */
  async connectionExists(ssid: string): Promise<boolean> {
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

  /**
   * Notify all registered callbacks of connection state change
   */
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

  /**
   * Create a timeout promise for connection operations
   */
  private timeout(ms: number): Promise<never> {
    logger.info(`timeout() - creating ${ms}ms timeout promise`);
    return new Promise((_, reject) => {
      setTimeout(() => {
        logger.info(`timeout() - ${ms}ms timeout expired`);
        reject(new Error("Timeout"));
      }, ms);
    });
  }
}
