import { Request, Response } from "express";
import {
  IRenderingOrchestrator,
  IWiFiService,
  IConfigService,
} from "@core/interfaces";
import { isSuccess } from "@core/types";
import { WebError } from "@core/errors";
import { getLogger } from "@utils/logger";

const logger = getLogger("ConfigController");

/**
 * Config Controller
 *
 * Handles configuration endpoints including display settings,
 * auto-update, auto-center, rotate-bearing, active screen,
 * recent destinations, and system reset.
 */
export class ConfigController {
  constructor(
    private readonly orchestrator: IRenderingOrchestrator,
    private readonly configService?: IConfigService,
    private readonly wifiService?: IWiFiService,
  ) {}

  /**
   * Get current display settings
   */
  async getDisplaySettings(_req: Request, res: Response): Promise<void> {
    logger.debug("Getting display settings");

    if (!this.configService) {
      res.status(500).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Config service not available",
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        zoomLevel: this.configService.getZoomLevel(),
        autoCenter: this.configService.getAutoCenter(),
        rotateWithBearing: this.configService.getRotateWithBearing(),
        activeScreen: this.configService.getActiveScreen(),
      },
    });
  }

  /**
   * Set zoom level
   */
  async setZoom(req: Request, res: Response): Promise<void> {
    const { zoom, delta } = req.body;

    let result;
    if (zoom !== undefined) {
      logger.info(`Setting zoom to: ${zoom}`);
      result = await this.orchestrator.setZoom(zoom);
    } else if (delta !== undefined) {
      logger.info(`Changing zoom by delta: ${delta}`);
      result = await this.orchestrator.changeZoom(delta);
    } else {
      logger.warn("Set zoom called without zoom or delta parameter");
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Either zoom or delta parameter is required",
        },
      });
      return;
    }

    if (isSuccess(result)) {
      logger.info("Zoom level updated successfully");
      res.json({
        success: true,
        message: "Zoom level updated",
      });
    } else {
      logger.error("Failed to update zoom level:", result.error);
      res.status(500).json({
        success: false,
        error: {
          code: (result.error as WebError).code,
          message: (result.error as WebError).getUserMessage(),
        },
      });
    }
  }

  /**
   * Start auto-update
   */
  async startAutoUpdate(_req: Request, res: Response): Promise<void> {
    logger.info("Starting auto-update");
    const result = await this.orchestrator.startAutoUpdate();

    if (isSuccess(result)) {
      logger.info("Auto-update started successfully");
      res.json({
        success: true,
        message: "Auto-update started",
      });
    } else {
      logger.error("Failed to start auto-update:", result.error);
      res.status(500).json({
        success: false,
        error: {
          code: (result.error as WebError).code,
          message: (result.error as WebError).getUserMessage(),
        },
      });
    }
  }

  /**
   * Stop auto-update
   */
  async stopAutoUpdate(_req: Request, res: Response): Promise<void> {
    logger.info("Stopping auto-update");
    this.orchestrator.stopAutoUpdate();
    logger.info("Auto-update stopped successfully");
    res.json({
      success: true,
      message: "Auto-update stopped",
    });
  }

  /**
   * Set auto-center preference
   */
  async setAutoCenter(req: Request, res: Response): Promise<void> {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      logger.warn("Set auto-center called with invalid enabled parameter");
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "enabled parameter must be a boolean",
        },
      });
      return;
    }

    logger.info(`Setting auto-center to: ${enabled}`);
    this.orchestrator.setAutoCenter(enabled);
    logger.info(`Auto-center ${enabled ? "enabled" : "disabled"}`);
    res.json({
      success: true,
      message: `Auto-center ${enabled ? "enabled" : "disabled"}`,
    });
  }

  /**
   * Set rotate-with-bearing preference
   */
  async setRotateWithBearing(req: Request, res: Response): Promise<void> {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      logger.warn(
        "Set rotate-with-bearing called with invalid enabled parameter",
      );
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "enabled parameter must be a boolean",
        },
      });
      return;
    }

    logger.info(`Setting rotate-with-bearing to: ${enabled}`);
    this.orchestrator.setRotateWithBearing(enabled);
    logger.info(`Rotate with bearing ${enabled ? "enabled" : "disabled"}`);

    // Trigger display refresh to show the change immediately
    const updateResult = await this.orchestrator.updateDisplay();
    if (!updateResult.success) {
      logger.warn("Failed to refresh display after orientation change");
    }

    res.json({
      success: true,
      message: `Rotate with bearing ${enabled ? "enabled" : "disabled"}`,
    });
  }

  /**
   * Set active screen type for display rendering
   */
  async setActiveScreen(req: Request, res: Response): Promise<void> {
    const { screenType } = req.body;

    if (
      typeof screenType !== "string" ||
      !["track", "turn_by_turn"].includes(screenType)
    ) {
      logger.warn("Set active screen called with invalid screenType parameter");
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "screenType must be 'track' or 'turn_by_turn'",
        },
      });
      return;
    }

    try {
      logger.info(`Setting active screen to: ${screenType}`);
      this.orchestrator.setActiveScreen(screenType);
      logger.info(`Active screen set to ${screenType}`);

      // Save the setting to persist it
      if (this.configService) {
        await this.configService.save();
      }

      // Trigger display refresh to show the change immediately (if there's an active track)
      const updateResult = await this.orchestrator.updateDisplay();
      if (!updateResult.success) {
        logger.warn("Failed to refresh display after screen change");
      }

      res.json({
        success: true,
        message: `Active screen set to ${screenType}`,
      });
    } catch (error) {
      logger.error("Error setting active screen:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to set active screen",
        },
      });
    }
  }

  // Recent Destinations Endpoints

  /**
   * Get recent destinations
   */
  async getRecentDestinations(_req: Request, res: Response): Promise<void> {
    logger.debug("Getting recent destinations");

    if (!this.configService) {
      res.status(500).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Config service not available",
        },
      });
      return;
    }

    res.json({
      success: true,
      data: this.configService.getRecentDestinations(),
    });
  }

  /**
   * Add a recent destination
   */
  async addRecentDestination(req: Request, res: Response): Promise<void> {
    const { name, latitude, longitude } = req.body;

    logger.info(
      `Adding recent destination: ${name} (${latitude}, ${longitude})`,
    );

    if (!this.configService) {
      res.status(500).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Config service not available",
        },
      });
      return;
    }

    if (
      typeof name !== "string" ||
      typeof latitude !== "number" ||
      typeof longitude !== "number"
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message:
            "name (string), latitude (number), and longitude (number) are required",
        },
      });
      return;
    }

    this.configService.addRecentDestination({ name, latitude, longitude });
    await this.configService.save();

    logger.info("Recent destination added and saved");
    res.json({
      success: true,
      message: "Destination added to recent list",
    });
  }

  /**
   * Remove a recent destination
   */
  async removeRecentDestination(req: Request, res: Response): Promise<void> {
    const { latitude, longitude } = req.body;

    logger.info(`Removing recent destination at (${latitude}, ${longitude})`);

    if (!this.configService) {
      res.status(500).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Config service not available",
        },
      });
      return;
    }

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "latitude (number) and longitude (number) are required",
        },
      });
      return;
    }

    this.configService.removeRecentDestination(latitude, longitude);
    await this.configService.save();

    logger.info("Recent destination removed");
    res.json({
      success: true,
      message: "Destination removed from recent list",
    });
  }

  /**
   * Clear all recent destinations
   */
  async clearRecentDestinations(_req: Request, res: Response): Promise<void> {
    logger.info("Clearing all recent destinations");

    if (!this.configService) {
      res.status(500).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Config service not available",
        },
      });
      return;
    }

    this.configService.clearRecentDestinations();
    await this.configService.save();

    logger.info("Recent destinations cleared");
    res.json({
      success: true,
      message: "Recent destinations cleared",
    });
  }

  // System Reset Endpoint

  /**
   * Reset system to factory defaults
   * Clears all user settings, disconnects WiFi, and restarts onboarding
   */
  async resetSystem(_req: Request, res: Response): Promise<void> {
    logger.info("System reset requested");

    try {
      // Reset config to defaults
      if (this.configService) {
        logger.info("Resetting configuration to defaults...");
        const resetResult = await this.configService.resetToDefaults();
        if (!resetResult.success) {
          logger.error("Failed to reset config:", resetResult.error);
          res.status(500).json({
            success: false,
            error: {
              code: "CONFIG_RESET_FAILED",
              message: "Failed to reset configuration",
            },
          });
          return;
        }
        logger.info("Configuration reset successfully");
      } else {
        logger.warn("No config service available - skipping config reset");
      }

      // Disconnect WiFi
      if (this.wifiService) {
        logger.info("Disconnecting WiFi...");
        const disconnectResult = await this.wifiService.disconnect();
        if (!disconnectResult.success) {
          // Log but don't fail - WiFi might not be connected
          logger.warn("WiFi disconnect warning:", disconnectResult.error);
        } else {
          logger.info("WiFi disconnected successfully");
        }
      } else {
        logger.warn("No WiFi service available - skipping WiFi disconnect");
      }

      // Restart onboarding flow (show logo, then WiFi instructions)
      logger.info("Restarting onboarding flow...");
      const onboardingResult = await this.orchestrator.restartOnboarding();
      if (!onboardingResult.success) {
        logger.warn("Failed to restart onboarding:", onboardingResult.error);
        // Don't fail the reset - config was already reset
      } else {
        logger.info("Onboarding flow restarted successfully");
      }

      logger.info("System reset completed successfully");
      res.json({
        success: true,
        message:
          "System reset to factory defaults. Device is restarting setup.",
      });
    } catch (error) {
      logger.error("Failed to reset system:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "RESET_FAILED",
          message: "Failed to reset system",
        },
      });
    }
  }
}
