import { Request, Response } from "express";
import { IRenderingOrchestrator } from "@core/interfaces";
import { isSuccess } from "@core/types";
import { getLogger } from "@utils/logger";
import { extractErrorInfo } from "@utils/typeGuards";

const logger = getLogger("GPSController");

/**
 * GPS Controller
 *
 * Handles GPS-related HTTP endpoints including position, status,
 * and mock GPS functionality for development.
 */
export class GPSController {
  constructor(private readonly orchestrator: IRenderingOrchestrator) {}

  /**
   * Get current GPS position
   */
  async getGPSPosition(_req: Request, res: Response): Promise<void> {
    logger.debug("GPS position requested");
    const result = await this.orchestrator.getCurrentPosition();

    if (isSuccess(result)) {
      logger.debug(
        `GPS position retrieved: ${result.data.latitude}, ${result.data.longitude}`,
      );
      res.json({
        success: true,
        data: {
          latitude: result.data.latitude,
          longitude: result.data.longitude,
          altitude: result.data.altitude,
          timestamp: result.data.timestamp,
          accuracy: result.data.accuracy,
          speed: result.data.speed,
          bearing: result.data.bearing,
        },
      });
    } else {
      logger.error("Failed to get GPS position:", result.error);
      res.status(500).json({
        success: false,
        error: extractErrorInfo(result.error),
      });
    }
  }

  /**
   * Get GPS status
   */
  async getGPSStatus(_req: Request, res: Response): Promise<void> {
    logger.debug("GPS status requested");
    const result = await this.orchestrator.getSystemStatus();

    if (isSuccess(result)) {
      logger.debug(
        `GPS status retrieved: connected=${result.data.gps.connected}, satellites=${result.data.gps.satellitesInUse}`,
      );
      res.json({
        success: true,
        data: {
          connected: result.data.gps.connected,
          tracking: result.data.gps.tracking,
          satellitesInUse: result.data.gps.satellitesInUse,
          lastUpdate: result.data.gps.lastUpdate,
        },
      });
    } else {
      logger.error("Failed to get GPS status:", result.error);
      res.status(500).json({
        success: false,
        error: extractErrorInfo(result.error),
      });
    }
  }

  /**
   * Set mock GPS position (development only)
   * Useful for setting GPS to track start before drive simulation
   */
  async setMockGPSPosition(req: Request, res: Response): Promise<void> {
    const { latitude, longitude } = req.body;

    logger.info(`Set mock GPS position requested: ${latitude}, ${longitude}`);

    // Validate parameters
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "latitude and longitude must be numbers",
        },
      });
      return;
    }

    // Check if mock GPS is available
    if (!this.orchestrator.isMockGPS()) {
      res.status(400).json({
        success: false,
        error: {
          code: "NOT_MOCK_GPS",
          message: "Mock GPS is not available (using real GPS hardware)",
        },
      });
      return;
    }

    // Set the position
    const success = this.orchestrator.setMockGPSPosition(latitude, longitude);

    if (success) {
      logger.info(
        `Mock GPS position set to ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      );
      res.json({
        success: true,
        message: "Mock GPS position updated",
        data: {
          latitude,
          longitude,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: "SET_POSITION_FAILED",
          message: "Failed to set mock GPS position",
        },
      });
    }
  }

  /**
   * Check if using mock GPS (development only)
   */
  async checkMockGPS(_req: Request, res: Response): Promise<void> {
    const isMock = this.orchestrator.isMockGPS();
    res.json({
      success: true,
      data: {
        isMockGPS: isMock,
      },
    });
  }
}
