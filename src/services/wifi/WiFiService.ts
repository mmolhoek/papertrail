import { exec } from "child_process";
import { promisify } from "util";
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

const execAsync = promisify(exec);
const logger = getLogger("WiFiService");

/**
 * WiFi Service using NetworkManager (nmcli)
 * Manages WiFi connections on Linux/Raspberry Pi OS
 */
export class WiFiService implements IWiFiService {
  private initialized = false;
  private connectionChangeCallbacks: Array<(connected: boolean) => void> = [];
  private connectionCheckInterval?: NodeJS.Timeout;

  constructor(private config: WiFiConfig) {
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

    // Start monitoring connection state
    this.startConnectionMonitoring();

    return success(undefined);
  }

  async dispose(): Promise<void> {
    logger.info("Disposing WiFi Service...");

    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = undefined;
    }

    this.initialized = false;
    this.connectionChangeCallbacks = [];
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
}
