import { exec } from "child_process";
import { promisify } from "util";
import { Result, WiFiNetwork, success, failure } from "@core/types";
import { WiFiError } from "@core/errors";
import { getLogger } from "@utils/logger";

const execAsync = promisify(exec);
const logger = getLogger("NetworkScanner");

/**
 * NetworkScanner handles WiFi network discovery and visibility checks.
 * Uses nmcli to scan for available networks.
 */
export class NetworkScanner {
  constructor(private initialized: () => boolean) {}

  /**
   * Scan for available WiFi networks.
   * Triggers a fresh scan and returns list of visible networks.
   */
  async scanNetworks(): Promise<Result<WiFiNetwork[]>> {
    logger.info("scanNetworks() called");

    if (!this.initialized()) {
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

  /**
   * Get signal strength for a specific SSID
   */
  async getSignalStrength(ssid: string): Promise<Result<number>> {
    logger.info(`getSignalStrength() called for SSID: "${ssid}"`);
    try {
      const { stdout } = await execAsync(
        `sudo nmcli device wifi rescan && sudo nmcli -t -f SSID,SIGNAL device wifi list | grep "^${ssid}:"`,
      );

      const [, signal] = stdout.trim().split(":");
      const signalStrength = parseInt(signal, 10) || 0;
      logger.info(`Signal strength for "${ssid}": ${signalStrength}%`);
      return success(signalStrength);
    } catch {
      logger.info(
        `Could not get signal strength for "${ssid}" - defaulting to 0`,
      );
      return success(0); // Default to 0 if can't get signal
    }
  }

  /**
   * Parse security string from nmcli into WiFiNetwork security type
   */
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
}
