import { Request, Response } from "express";
import * as fs from "fs/promises";
import * as path from "path";
import {
  IRenderingOrchestrator,
  IWiFiService,
  IMapService,
  IConfigService,
  ITrackSimulationService,
  SimulationSpeed,
} from "@core/interfaces";
import { isSuccess } from "@core/types";
import { WebError } from "@core/errors";
import { getLogger } from "@utils/logger";

const logger = getLogger("WebController");

/**
 * Web Controller
 *
 * Handles HTTP requests and connects them to the orchestrator.
 * Acts as the integration layer between the web interface and business logic.
 */
export class WebController {
  constructor(
    private readonly orchestrator: IRenderingOrchestrator,
    private readonly wifiService?: IWiFiService,
    private readonly mapService?: IMapService,
    private readonly gpxDirectory: string = "./data/gpx-files",
    private readonly configService?: IConfigService,
    private readonly simulationService?: ITrackSimulationService,
  ) {}

  /**
   * Health check endpoint
   */
  async getHealth(_req: Request, res: Response): Promise<void> {
    logger.debug("Health check requested");
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  }

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
        error: {
          code: (result.error as WebError).code,
          message: (result.error as WebError).getUserMessage(),
        },
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
        error: {
          code: (result.error as WebError).code,
          message: (result.error as WebError).getUserMessage(),
        },
      });
    }
  }

  /**
   * Get list of available GPX files
   */
  async getGPXFiles(_req: Request, res: Response): Promise<void> {
    logger.debug("GPX files list requested");

    if (!this.mapService) {
      logger.warn("MapService not available");
      res.json({
        success: true,
        data: {
          files: [],
        },
      });
      return;
    }

    const result = await this.mapService.getGPXFileInfo();

    if (isSuccess(result)) {
      logger.debug(`Found ${result.data.length} GPX files`);
      res.json({
        success: true,
        data: {
          files: result.data.map((info) => {
            // Use filename if track has no meaningful name
            const hasValidTrackName =
              info.trackName &&
              info.trackName !== "Unnamed Track" &&
              info.trackName.trim() !== "";
            const displayName = hasValidTrackName
              ? info.trackName
              : info.fileName.replace(/\.gpx$/i, "");
            logger.debug(
              `Track: "${info.trackName}" -> display: "${displayName}" (valid=${hasValidTrackName})`,
            );
            return {
              path: info.path,
              fileName: info.fileName,
              trackName: displayName,
              trackCount: info.trackCount,
              pointCount: info.pointCount,
              fileSize: info.fileSize,
              lastModified: info.lastModified,
            };
          }),
        },
      });
    } else {
      // No GPX files is not an error - return empty array
      logger.debug("No GPX files found or error occurred");
      res.json({
        success: true,
        data: {
          files: [],
        },
      });
    }
  }

  /**
   * Get active GPX file
   */
  async getActiveGPX(_req: Request, res: Response): Promise<void> {
    logger.debug("Active GPX file requested");
    const result = await this.orchestrator.getSystemStatus();

    if (isSuccess(result)) {
      logger.debug(`Active GPX: ${result.data.activeTrack || "none"}`);
      res.json({
        success: true,
        data: {
          active: result.data.activeTrack || null,
        },
      });
    } else {
      logger.error("Failed to get active GPX:", result.error);
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
   * Set active GPX file
   */
  async setActiveGPX(req: Request, res: Response): Promise<void> {
    const { path } = req.body;

    if (!path) {
      logger.warn("Set active GPX called without path");
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "GPX file path is required",
        },
      });
      return;
    }

    logger.info(`Setting active GPX to: ${path}`);
    const result = await this.orchestrator.setActiveGPX(path);

    if (isSuccess(result)) {
      logger.info(`GPX file loaded successfully: ${path}`);
      res.json({
        success: true,
        message: "GPX file loaded successfully",
      });
    } else {
      logger.error(`Failed to set active GPX (${path}):`, result.error);
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
   * Update display
   */
  async updateDisplay(_req: Request, res: Response): Promise<void> {
    logger.info("Display update requested");
    const result = await this.orchestrator.updateDisplay();

    if (isSuccess(result)) {
      logger.info("Display updated successfully");
      res.json({
        success: true,
        message: "Display updated successfully",
      });
    } else {
      logger.error("Failed to update display:", result.error);
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
   * Clear display
   */
  async clearDisplay(_req: Request, res: Response): Promise<void> {
    logger.info("Display clear requested");
    try {
      const result = await this.orchestrator.clearDisplay();

      if (isSuccess(result)) {
        logger.info("Display cleared successfully");
        res.json({
          success: true,
          message: "Display cleared successfully",
        });
      } else {
        logger.error("Failed to clear display:", result.error);
        res.status(500).json({
          success: false,
          error: {
            code: (result.error as WebError).code,
            message: (result.error as WebError).getUserMessage(),
          },
        });
      }
    } catch (error) {
      logger.error("Unexpected error while clearing display:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred while clearing the display.",
        },
      });
    }
  }

  /**
   * Get system status
   */
  async getSystemStatus(_req: Request, res: Response): Promise<void> {
    logger.debug("System status requested");
    const result = await this.orchestrator.getSystemStatus();

    if (isSuccess(result)) {
      logger.debug("System status retrieved successfully");
      res.json({
        success: true,
        data: result.data,
      });
    } else {
      logger.error("Failed to get system status:", result.error);
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
    res.json({
      success: true,
      message: `Rotate with bearing ${enabled ? "enabled" : "disabled"}`,
    });
  }

  // WiFi Configuration Endpoints

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

  // GPX File Management Endpoints

  /**
   * Upload a GPX file
   * Expects multipart form data with a 'gpxFile' field
   */
  async uploadGPXFile(req: Request, res: Response): Promise<void> {
    logger.info("GPX file upload requested");

    if (!req.file) {
      logger.warn("Upload requested without file");
      res.status(400).json({
        success: false,
        error: {
          code: "NO_FILE",
          message: "No file was uploaded",
        },
      });
      return;
    }

    const file = req.file;
    const originalName = file.originalname;
    const customName = req.body.trackName as string | undefined;

    // Validate file extension
    if (!originalName.toLowerCase().endsWith(".gpx")) {
      logger.warn(`Invalid file type: ${originalName}`);
      // Clean up uploaded file
      try {
        await fs.unlink(file.path);
      } catch {
        // Ignore cleanup errors
      }
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_FILE_TYPE",
          message: "Only .gpx files are allowed",
        },
      });
      return;
    }

    try {
      // Ensure GPX directory exists
      await fs.mkdir(this.gpxDirectory, { recursive: true });

      // Use custom name if provided, otherwise use original filename
      const baseName = customName
        ? customName.replace(/[^a-zA-Z0-9._-]/g, "_")
        : originalName.replace(/\.gpx$/i, "").replace(/[^a-zA-Z0-9._-]/g, "_");
      const safeFileName = baseName.endsWith(".gpx")
        ? baseName
        : `${baseName}.gpx`;
      const destPath = path.join(this.gpxDirectory, safeFileName);

      // Check if file already exists
      try {
        await fs.access(destPath);
        // File exists - remove uploaded temp file and return error
        await fs.unlink(file.path);
        res.status(409).json({
          success: false,
          error: {
            code: "FILE_EXISTS",
            message: `A file named "${safeFileName}" already exists`,
          },
        });
        return;
      } catch {
        // File doesn't exist, proceed
      }

      // Move file from temp location to GPX directory
      // Use copyFile + unlink instead of rename to handle cross-device moves
      await fs.copyFile(file.path, destPath);
      await fs.unlink(file.path);

      // Validate the GPX file if mapService is available
      if (this.mapService) {
        const validationResult =
          await this.mapService.validateGPXFile(destPath);
        if (!validationResult.success) {
          // Invalid GPX - remove the file
          await fs.unlink(destPath);
          logger.warn(`Invalid GPX file uploaded: ${originalName}`);
          res.status(400).json({
            success: false,
            error: {
              code: "INVALID_GPX",
              message: "The uploaded file is not a valid GPX file",
            },
          });
          return;
        }
        // Clear cache to pick up the new file
        this.mapService.clearCache();
      }

      logger.info(`GPX file uploaded successfully: ${safeFileName}`);
      res.json({
        success: true,
        message: "File uploaded successfully",
        data: {
          fileName: safeFileName,
          path: destPath,
        },
      });
    } catch (error) {
      logger.error("Failed to upload GPX file:", error);
      // Try to clean up the temp file
      try {
        await fs.unlink(file.path);
      } catch {
        // Ignore cleanup errors
      }
      res.status(500).json({
        success: false,
        error: {
          code: "UPLOAD_FAILED",
          message: "Failed to upload file",
        },
      });
    }
  }

  /**
   * Delete a GPX file
   */
  async deleteGPXFile(req: Request, res: Response): Promise<void> {
    const fileName = req.params.fileName;

    if (!fileName) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "File name is required",
        },
      });
      return;
    }

    logger.info(`GPX file deletion requested: ${fileName}`);

    // Validate file extension
    if (!fileName.toLowerCase().endsWith(".gpx")) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_FILE_TYPE",
          message: "Only .gpx files can be deleted through this endpoint",
        },
      });
      return;
    }

    // Sanitize filename to prevent path traversal
    const safeName = path.basename(fileName);
    const filePath = path.join(this.gpxDirectory, safeName);

    try {
      // Check if file exists
      await fs.access(filePath);

      // Delete the file
      await fs.unlink(filePath);

      // Clear cache if mapService is available
      if (this.mapService) {
        this.mapService.clearCache();
      }

      logger.info(`GPX file deleted: ${safeName}`);
      res.json({
        success: true,
        message: "File deleted successfully",
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        res.status(404).json({
          success: false,
          error: {
            code: "FILE_NOT_FOUND",
            message: "File not found",
          },
        });
      } else {
        logger.error("Failed to delete GPX file:", error);
        res.status(500).json({
          success: false,
          error: {
            code: "DELETE_FAILED",
            message: "Failed to delete file",
          },
        });
      }
    }
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

  // Track Simulation Endpoints

  /**
   * Start track simulation
   * Expects { trackPath: string, speed?: 'walk' | 'bicycle' | 'drive' | number }
   */
  async startSimulation(req: Request, res: Response): Promise<void> {
    const { trackPath, speed = "walk" } = req.body;

    logger.info(
      `Starting simulation with track: ${trackPath}, speed: ${speed}`,
    );

    if (!this.simulationService) {
      logger.error("Simulation service not available");
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Simulation service is not available",
        },
      });
      return;
    }

    if (!trackPath) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "trackPath is required",
        },
      });
      return;
    }

    // Load the track
    if (!this.mapService) {
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Map service is not available",
        },
      });
      return;
    }

    const trackResult = await this.mapService.getTrack(trackPath);
    if (!isSuccess(trackResult)) {
      logger.error("Failed to load track:", trackResult.error);
      res.status(400).json({
        success: false,
        error: {
          code: "TRACK_LOAD_FAILED",
          message: "Failed to load track file",
        },
      });
      return;
    }

    // Determine speed value
    let speedValue: number;
    if (typeof speed === "number") {
      speedValue = speed;
    } else {
      const speedMap: Record<string, number> = {
        walk: SimulationSpeed.WALK,
        bicycle: SimulationSpeed.BICYCLE,
        drive: SimulationSpeed.DRIVE,
      };
      speedValue = speedMap[speed] || SimulationSpeed.WALK;
    }

    // Set the track as active for display rendering
    const setActiveResult = await this.orchestrator.setActiveGPX(trackPath);
    if (!isSuccess(setActiveResult)) {
      logger.warn(
        "Failed to set track as active, display may not update:",
        setActiveResult.error,
      );
      // Continue anyway - simulation can still run
    }

    // Initialize and start simulation
    const initResult = await this.simulationService.initialize();
    if (!isSuccess(initResult)) {
      logger.error("Failed to initialize simulation:", initResult.error);
      res.status(500).json({
        success: false,
        error: {
          code: "SIMULATION_INIT_FAILED",
          message: "Failed to initialize simulation",
        },
      });
      return;
    }

    const startResult = await this.simulationService.startSimulation(
      trackResult.data,
      speedValue,
    );

    if (isSuccess(startResult)) {
      logger.info("Simulation started successfully");
      res.json({
        success: true,
        message: "Simulation started",
        data: this.simulationService.getStatus(),
      });
    } else {
      logger.error("Failed to start simulation:", startResult.error);
      res.status(500).json({
        success: false,
        error: {
          code: "SIMULATION_START_FAILED",
          message: startResult.error.message || "Failed to start simulation",
        },
      });
    }
  }

  /**
   * Stop track simulation
   */
  async stopSimulation(_req: Request, res: Response): Promise<void> {
    logger.info("Stopping simulation");

    if (!this.simulationService) {
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Simulation service is not available",
        },
      });
      return;
    }

    const result = await this.simulationService.stopSimulation();

    if (isSuccess(result)) {
      logger.info("Simulation stopped");
      res.json({
        success: true,
        message: "Simulation stopped",
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: "SIMULATION_STOP_FAILED",
          message: result.error.message || "Failed to stop simulation",
        },
      });
    }
  }

  /**
   * Pause track simulation
   */
  async pauseSimulation(_req: Request, res: Response): Promise<void> {
    logger.info("Pausing simulation");

    if (!this.simulationService) {
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Simulation service is not available",
        },
      });
      return;
    }

    const result = await this.simulationService.pauseSimulation();

    if (isSuccess(result)) {
      logger.info("Simulation paused");
      res.json({
        success: true,
        message: "Simulation paused",
        data: this.simulationService.getStatus(),
      });
    } else {
      res.status(400).json({
        success: false,
        error: {
          code: "SIMULATION_PAUSE_FAILED",
          message: result.error.message || "Failed to pause simulation",
        },
      });
    }
  }

  /**
   * Resume track simulation
   */
  async resumeSimulation(_req: Request, res: Response): Promise<void> {
    logger.info("Resuming simulation");

    if (!this.simulationService) {
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Simulation service is not available",
        },
      });
      return;
    }

    const result = await this.simulationService.resumeSimulation();

    if (isSuccess(result)) {
      logger.info("Simulation resumed");
      res.json({
        success: true,
        message: "Simulation resumed",
        data: this.simulationService.getStatus(),
      });
    } else {
      res.status(400).json({
        success: false,
        error: {
          code: "SIMULATION_RESUME_FAILED",
          message: result.error.message || "Failed to resume simulation",
        },
      });
    }
  }

  /**
   * Set simulation speed
   * Expects { speed: 'walk' | 'bicycle' | 'drive' | number }
   */
  async setSimulationSpeed(req: Request, res: Response): Promise<void> {
    const { speed } = req.body;

    logger.info(`Setting simulation speed to: ${speed}`);

    if (!this.simulationService) {
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Simulation service is not available",
        },
      });
      return;
    }

    if (speed === undefined) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "speed is required",
        },
      });
      return;
    }

    let result;
    if (typeof speed === "number") {
      result = await this.simulationService.setSpeed(speed);
    } else if (["walk", "bicycle", "drive"].includes(speed)) {
      result = await this.simulationService.setSpeedPreset(speed);
    } else {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_SPEED",
          message: "Speed must be a number or one of: walk, bicycle, drive",
        },
      });
      return;
    }

    if (isSuccess(result)) {
      logger.info("Simulation speed updated");
      res.json({
        success: true,
        message: "Speed updated",
        data: this.simulationService.getStatus(),
      });
    } else {
      res.status(400).json({
        success: false,
        error: {
          code: "SPEED_UPDATE_FAILED",
          message: result.error.message || "Failed to update speed",
        },
      });
    }
  }

  /**
   * Get simulation status
   */
  async getSimulationStatus(_req: Request, res: Response): Promise<void> {
    logger.debug("Simulation status requested");

    if (!this.simulationService) {
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Simulation service is not available",
        },
      });
      return;
    }

    res.json({
      success: true,
      data: this.simulationService.getStatus(),
    });
  }
}
