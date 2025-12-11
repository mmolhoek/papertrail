import { exec } from "child_process";
import { promisify } from "util";
import { IConfigService } from "@core/interfaces";
import {
  Result,
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

const execAsync = promisify(exec);
const logger = getLogger("HotspotManager");

/** Timeout for mobile hotspot connection attempt (60 seconds) */
const HOTSPOT_CONNECTION_TIMEOUT_MS = 60000;

/**
 * HotspotManager handles mobile hotspot connection and fallback network management.
 * Manages the process of connecting to a user's mobile phone hotspot.
 */
export class HotspotManager {
  private connectionAttemptInProgress = false;
  private connectionAttemptAbortController?: AbortController;
  private connectedScreenDisplayed = false;

  constructor(
    private config: WiFiConfig,
    private configService: IConfigService | undefined,
    private networkScanner: NetworkScanner,
    private connectionManager: ConnectionManager,
    private setState: (state: WiFiState) => void,
  ) {}

  /**
   * Check if currently connected to the configured mobile hotspot
   */
  async isConnectedToMobileHotspot(): Promise<Result<boolean>> {
    logger.info("isConnectedToMobileHotspot() called");
    const connectionResult =
      await this.connectionManager.getCurrentConnection();

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

  /**
   * Attempt to connect to the configured mobile hotspot
   */
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
      const visibleResult =
        await this.networkScanner.isNetworkVisible(effectiveSSID);
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
      const connectPromise = this.connectionManager.connect(
        effectiveSSID,
        effectivePassword,
      );

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

  /**
   * Abort any in-progress connection attempt
   */
  abortConnectionAttempt(): void {
    if (this.connectionAttemptAbortController) {
      logger.info("Aborting in-progress connection attempt");
      this.connectionAttemptAbortController.abort();
      this.connectionAttemptAbortController = undefined;
    }
    this.connectionAttemptInProgress = false;
  }

  /**
   * Check if a connection attempt is in progress
   */
  isConnectionAttemptInProgress(): boolean {
    return this.connectionAttemptInProgress;
  }

  /**
   * Get the configured mobile hotspot SSID
   */
  getMobileHotspotSSID(): string {
    const effectiveSSID = this.getEffectiveHotspotSSID();
    logger.info(`getMobileHotspotSSID() called - returning "${effectiveSSID}"`);
    return effectiveSSID;
  }

  /**
   * Get the current hotspot configuration
   */
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

  /**
   * Set new hotspot configuration and trigger reconnection
   */
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
      await this.connectionManager.disconnect();

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

  /**
   * Notify that the connected screen was displayed
   */
  notifyConnectedScreenDisplayed(): void {
    logger.info(
      "notifyConnectedScreenDisplayed() - connected screen was displayed",
    );
    this.connectedScreenDisplayed = true;
  }

  /**
   * Check if the connected screen has been displayed
   */
  hasConnectedScreenBeenDisplayed(): boolean {
    return this.connectedScreenDisplayed;
  }

  /**
   * Reset the connected screen displayed flag
   */
  resetConnectedScreenDisplayed(): void {
    this.connectedScreenDisplayed = false;
  }

  /**
   * Save the current network as fallback before attempting hotspot connection
   */
  async saveFallbackNetwork(): Promise<void> {
    logger.info("saveFallbackNetwork() called");

    if (!this.configService) {
      logger.warn(
        "saveFallbackNetwork() - No config service available, cannot save fallback",
      );
      return;
    }

    try {
      logger.info("Getting current connection to save as fallback...");
      const connectionResult =
        await this.connectionManager.getCurrentConnection();
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

  /**
   * Clear the saved fallback network
   */
  async clearFallbackNetwork(): Promise<void> {
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

  /**
   * Attempt to reconnect to the saved fallback network
   */
  async reconnectToFallback(): Promise<Result<void>> {
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
      await this.connectionManager.disconnect();

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

  /**
   * Get the effective hotspot SSID (from ConfigService if saved, otherwise from initial config)
   */
  getEffectiveHotspotSSID(): string {
    const savedConfig = this.configService?.getHotspotConfig();
    return savedConfig?.ssid ?? this.config.primarySSID;
  }

  /**
   * Get the effective hotspot password (from ConfigService if saved, otherwise from initial config)
   */
  getEffectiveHotspotPassword(): string {
    const savedConfig = this.configService?.getHotspotConfig();
    return savedConfig?.password ?? this.config.primaryPassword;
  }
}
