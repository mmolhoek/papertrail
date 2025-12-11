import { Request, Response } from "express";
import { IWiFiService } from "@core/interfaces";
import { isSuccess } from "@core/types";
import { getLogger } from "@utils/logger";

const logger = getLogger("WiFiController");

/**
 * WiFi Controller
 *
 * Handles WiFi hotspot configuration endpoints.
 */
export class WiFiController {
  constructor(private readonly wifiService?: IWiFiService) {}

  /**
   * Get current WiFi hotspot configuration
   */
  async getHotspotConfig(_req: Request, res: Response): Promise<void> {
    logger.debug("Hotspot config requested");

    if (!this.wifiService) {
      logger.error("WiFi service not available");
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "WiFi service is not available",
        },
      });
      return;
    }

    try {
      const config = this.wifiService.getHotspotConfig();
      logger.debug(`Hotspot config retrieved: SSID="${config.ssid}"`);
      res.json({
        success: true,
        data: {
          ssid: config.ssid,
          // Don't expose the password for security
          hasPassword: !!config.password,
          updatedAt: config.updatedAt,
        },
      });
    } catch (error) {
      logger.error("Failed to get hotspot config:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to get hotspot configuration",
        },
      });
    }
  }

  /**
   * Update WiFi hotspot configuration
   */
  async setHotspotConfig(req: Request, res: Response): Promise<void> {
    const { ssid, password } = req.body;

    logger.info(`Setting hotspot config - SSID: "${ssid}"`);

    if (!this.wifiService) {
      logger.error("WiFi service not available");
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "WiFi service is not available",
        },
      });
      return;
    }

    // Validate SSID
    if (!ssid || typeof ssid !== "string" || ssid.trim().length === 0) {
      logger.warn("Set hotspot config called without valid SSID");
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "SSID is required and must be a non-empty string",
        },
      });
      return;
    }

    // Validate password
    if (!password || typeof password !== "string" || password.length < 8) {
      logger.warn("Set hotspot config called without valid password");
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message:
            "Password is required and must be at least 8 characters (WPA2 requirement)",
        },
      });
      return;
    }

    const result = await this.wifiService.setHotspotConfig(
      ssid.trim(),
      password,
    );

    if (isSuccess(result)) {
      logger.info(`Hotspot config updated successfully: SSID="${ssid}"`);
      res.json({
        success: true,
        message: "Hotspot configuration updated successfully",
      });
    } else {
      logger.error("Failed to update hotspot config:", result.error);
      res.status(500).json({
        success: false,
        error: {
          code: "CONFIG_UPDATE_FAILED",
          message:
            result.error.message || "Failed to update hotspot configuration",
        },
      });
    }
  }
}
