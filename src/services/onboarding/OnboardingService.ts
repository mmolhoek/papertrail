import * as path from "path";
import {
  IOnboardingService,
  IConfigService,
  IWiFiService,
  IEpaperService,
} from "../../core/interfaces";
import { Result, DisplayUpdateMode } from "../../core/types";
import { success, failure } from "../../core/types";
import { OnboardingError } from "../../core/errors";
import { getLogger } from "../../utils/logger";

const logger = getLogger("OnboardingService");

/**
 * Onboarding Service Implementation
 * Manages the first-boot onboarding flow with WiFi setup and display instructions
 */
export class OnboardingService implements IOnboardingService {
  constructor(
    private configService: IConfigService,
    private wifiService: IWiFiService,
    private epaperService: IEpaperService,
  ) {}

  async isOnboardingRequired(): Promise<Result<boolean>> {
    try {
      const completed = this.configService.isOnboardingCompleted();
      return success(!completed);
    } catch (error) {
      logger.error("Failed to check onboarding status:", error);
      return failure(OnboardingError.failed((error as Error).message));
    }
  }

  async startOnboarding(options?: {
    wifiTimeoutMs?: number;
    welcomeDelayMs?: number;
  }): Promise<Result<void>> {
    try {
      logger.info("Starting onboarding flow...");

      const wifiTimeoutMs = options?.wifiTimeoutMs ?? 300000; // Default 5 minutes
      const welcomeDelayMs = options?.welcomeDelayMs ?? 5000; // Default 5 seconds

      // Step 1: Display welcome screen
      logger.info("Displaying welcome screen...");
      const welcomeResult = await this.displayScreen(
        "onboarding-screens/welcome.bmp",
      );
      if (!welcomeResult.success) {
        logger.warn("Failed to display welcome screen, continuing anyway");
      }

      // Give user time to read welcome message
      await this.delay(welcomeDelayMs);

      // Step 2: Save primary WiFi network config
      logger.info("Configuring primary WiFi network...");
      const wifiConfig = await this.wifiService.saveNetwork({
        ssid: "Papertrail-Setup",
        password: "papertrail123",
        priority: 999, // Highest priority
        autoConnect: true,
      });

      if (!wifiConfig.success) {
        logger.warn("Failed to save WiFi config:", wifiConfig.error);
      } else {
        logger.info("WiFi config saved successfully");
      }

      // Step 3: Scan for available networks
      logger.info("Scanning for WiFi networks...");
      const scanResult = await this.wifiService.scanNetworks();
      if (scanResult.success) {
        const targetNetwork = scanResult.data.find(
          (net) => net.ssid === "Papertrail-Setup",
        );
        if (targetNetwork) {
          logger.info(
            `✓ Found "Papertrail-Setup" hotspot (signal: ${targetNetwork.signalStrength}%, security: ${targetNetwork.security})`,
          );
        } else {
          logger.warn(
            '⚠ "Papertrail-Setup" hotspot not found in scan. Please ensure your phone\'s hotspot is active.',
          );
          logger.info(
            `Available networks: ${scanResult.data.map((n) => n.ssid).join(", ")}`,
          );
        }
      }

      // Step 4: Display WiFi instructions
      logger.info("Displaying WiFi instructions...");
      const instructionsResult = await this.displayScreen(
        "onboarding-screens/wifi-instructions.bmp",
      );
      if (!instructionsResult.success) {
        logger.warn("Failed to display WiFi instructions, continuing anyway");
      }

      // Step 5: Try to connect to the network
      logger.info('Attempting to connect to "Papertrail-Setup"...');
      const connectResult = await this.wifiService.connect(
        "Papertrail-Setup",
        "papertrail123",
      );

      if (!connectResult.success) {
        logger.warn(
          "Initial connection attempt failed:",
          connectResult.error.message,
        );
        logger.info(
          "Will continue waiting for automatic connection (network has autoconnect enabled)",
        );
      } else {
        logger.info('Successfully initiated connection to "Papertrail-Setup"');
      }

      // Step 6: Wait for WiFi connection to be established
      logger.info("Waiting for WiFi connection to be established...");
      const connected = await this.waitForWiFiConnection(wifiTimeoutMs);

      if (!connected) {
        logger.warn(
          "WiFi connection timeout - user can configure manually via web interface",
        );
        // Don't fail - allow user to configure manually
        return success(undefined);
      }

      // Step 5: Display success screen
      logger.info("WiFi connected! Displaying success screen...");
      const successResult = await this.displayScreen(
        "onboarding-screens/connected.bmp",
      );
      if (!successResult.success) {
        logger.warn("Failed to display success screen");
      }

      logger.info(
        "Onboarding flow initiated. User can complete setup via web interface.",
      );
      return success(undefined);
    } catch (error) {
      logger.error("Onboarding failed:", error);
      return failure(OnboardingError.failed((error as Error).message));
    }
  }

  async completeOnboarding(): Promise<Result<void>> {
    try {
      logger.info("Completing onboarding...");

      this.configService.setOnboardingCompleted(true);

      const saveResult = await this.configService.save();
      if (!saveResult.success) {
        logger.error(
          "Failed to save onboarding completion status:",
          saveResult.error,
        );
        return failure(
          OnboardingError.failed("Failed to save onboarding status"),
        );
      }

      logger.info("Onboarding completed successfully!");
      return success(undefined);
    } catch (error) {
      logger.error("Failed to complete onboarding:", error);
      return failure(OnboardingError.failed((error as Error).message));
    }
  }

  async displayInstructions(): Promise<Result<void>> {
    try {
      const result = await this.displayScreen(
        "onboarding-screens/wifi-instructions.bmp",
      );
      return result;
    } catch (error) {
      logger.error("Failed to display instructions:", error);
      return failure(
        OnboardingError.displayFailed(error as Error, "wifi-instructions"),
      );
    }
  }

  // Private helper methods

  private async displayScreen(screenPath: string): Promise<Result<void>> {
    const fullPath = path.join(process.cwd(), screenPath);

    logger.debug(`Displaying image from: ${fullPath}`);

    // Use EpaperService to load and display the BMP image
    const displayResult = await this.epaperService.displayBitmapFromFile(
      fullPath,
      DisplayUpdateMode.FULL,
    );

    if (!displayResult.success) {
      logger.error(`Failed to display screen ${screenPath}:`, displayResult.error);

      // Check if image file not found
      if (displayResult.error.message.includes("not found")) {
        return failure(OnboardingError.imageNotFound(screenPath));
      }

      return failure(
        OnboardingError.displayFailed(
          new Error(displayResult.error.message),
          screenPath,
        ),
      );
    }

    logger.info(`Successfully displayed: ${screenPath}`);
    return success(undefined);
  }

  private async waitForWiFiConnection(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 5000; // Check every 5 seconds
    const targetSSID = "Papertrail-Setup";

    logger.info(`Waiting for connection to "${targetSSID}"...`);

    while (Date.now() - startTime < timeoutMs) {
      // Check current connection details
      const connectionResult = await this.wifiService.getCurrentConnection();

      if (connectionResult.success && connectionResult.data) {
        const currentSSID = connectionResult.data.ssid;
        logger.info(
          `Currently connected to: "${currentSSID}" (IP: ${connectionResult.data.ipAddress})`,
        );

        // Check if connected to the target network
        if (currentSSID === targetSSID) {
          logger.info(
            `✓ Successfully connected to "${targetSSID}" hotspot!`,
          );
          return true;
        } else {
          logger.warn(
            `Connected to "${currentSSID}" but waiting for "${targetSSID}"`,
          );
        }
      } else {
        logger.debug("Not connected to any WiFi network");
      }

      // Wait before next check
      await this.delay(checkInterval);

      // Log progress every 30 seconds
      if ((Date.now() - startTime) % 30000 < checkInterval) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        logger.info(
          `Still waiting for "${targetSSID}" connection... (${elapsed}s elapsed)`,
        );
      }
    }

    logger.warn(
      `WiFi connection timeout - "${targetSSID}" hotspot not found or connection failed`,
    );
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
