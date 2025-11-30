import * as path from "path";
import {
  IOnboardingService,
  IConfigService,
  IWiFiService,
  IEpaperService,
} from "../../core/interfaces";
import { Result, Bitmap1Bit, DisplayUpdateMode } from "../../core/types";
import { success, failure } from "../../core/types";
import { OnboardingError } from "../../core/errors";
import { getLogger } from "../../utils/logger";
import { EPD } from "../epaper/EPD";

const logger = getLogger("OnboardingService");

/**
 * Onboarding Service Implementation
 * Manages the first-boot onboarding flow with WiFi setup and display instructions
 */
export class OnboardingService implements IOnboardingService {
  private epd: EPD;

  constructor(
    private configService: IConfigService,
    private wifiService: IWiFiService,
    private epaperService: IEpaperService,
  ) {
    this.epd = new EPD();
  }

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
      }

      // Step 3: Display WiFi instructions
      logger.info("Displaying WiFi instructions...");
      const instructionsResult = await this.displayScreen(
        "onboarding-screens/wifi-instructions.bmp",
      );
      if (!instructionsResult.success) {
        logger.warn("Failed to display WiFi instructions, continuing anyway");
      }

      // Step 4: Wait for WiFi connection
      logger.info("Waiting for WiFi connection...");
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
    try {
      const fullPath = path.join(process.cwd(), screenPath);

      logger.debug(`Loading image from: ${fullPath}`);

      // Use EPD's loadImageInBuffer to load and convert the BMP image
      const imageBuffer = await this.epd.loadImageInBuffer(fullPath);

      const bitmap: Bitmap1Bit = {
        width: 800,
        height: 480,
        data: imageBuffer,
        metadata: {
          createdAt: new Date(),
          description: `Onboarding screen: ${screenPath}`,
        },
      };

      // Display on e-paper
      const displayResult = await this.epaperService.displayBitmap(
        bitmap,
        DisplayUpdateMode.FULL,
      );

      if (!displayResult.success) {
        return failure(
          OnboardingError.displayFailed(
            new Error(displayResult.error.message),
            screenPath,
          ),
        );
      }

      logger.info(`Successfully displayed: ${screenPath}`);
      return success(undefined);
    } catch (error) {
      logger.error(`Failed to display screen ${screenPath}:`, error);

      // Check if image file not found
      if ((error as Error).message.includes("ENOENT")) {
        return failure(OnboardingError.imageNotFound(screenPath));
      }

      return failure(OnboardingError.displayFailed(error as Error, screenPath));
    }
  }

  private async waitForWiFiConnection(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 5000; // Check every 5 seconds

    while (Date.now() - startTime < timeoutMs) {
      const connectedResult = await this.wifiService.isConnected();

      if (connectedResult.success && connectedResult.data) {
        logger.info("WiFi connection detected!");
        return true;
      }

      // Wait before next check
      await this.delay(checkInterval);

      // Log progress every 30 seconds
      if ((Date.now() - startTime) % 30000 < checkInterval) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        logger.info(
          `Still waiting for WiFi connection... (${elapsed}s elapsed)`,
        );
      }
    }

    logger.warn("WiFi connection timeout");
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
