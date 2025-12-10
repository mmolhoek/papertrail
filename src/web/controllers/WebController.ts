import { Request, Response } from "express";
import * as fs from "fs/promises";
import * as path from "path";
import {
  IRenderingOrchestrator,
  IWiFiService,
  IMapService,
  IConfigService,
  ITrackSimulationService,
  IDriveNavigationService,
  SimulationSpeed,
} from "@core/interfaces";
import { isSuccess, DriveRoute, DisplayUpdateMode } from "@core/types";
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
    private readonly driveNavigationService?: IDriveNavigationService,
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
            // Always use filename as display name (user controls naming via upload)
            const displayName = info.fileName.replace(/\.gpx$/i, "");
            return {
              path: info.path,
              fileName: info.fileName,
              trackName: displayName,
              trackCount: info.trackCount,
              pointCount: info.pointCount,
              totalDistance: info.totalDistance,
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
   * Get starting point of active track
   * Used as fallback when GPS and browser geolocation are unavailable
   */
  async getActiveTrackStart(_req: Request, res: Response): Promise<void> {
    logger.debug("Active track starting point requested");

    if (!this.mapService) {
      logger.warn("MapService not available");
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Map service not available",
        },
      });
      return;
    }

    if (!this.configService) {
      logger.warn("ConfigService not available");
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Config service not available",
        },
      });
      return;
    }

    const activeGPXPath = this.configService.getActiveGPXPath();

    if (!activeGPXPath) {
      logger.debug("No active track set");
      res.json({
        success: true,
        data: {
          startPoint: null,
          message: "No active track set",
        },
      });
      return;
    }

    const trackResult = await this.mapService.getTrack(activeGPXPath);

    if (!isSuccess(trackResult)) {
      logger.error("Failed to load track:", trackResult.error);
      res.status(500).json({
        success: false,
        error: {
          code: "TRACK_LOAD_FAILED",
          message: "Failed to load track data",
        },
      });
      return;
    }

    const track = trackResult.data;

    // Get first point from first segment
    if (
      track.segments &&
      track.segments.length > 0 &&
      track.segments[0].points &&
      track.segments[0].points.length > 0
    ) {
      const firstPoint = track.segments[0].points[0];
      logger.debug(
        `Active track starting point: ${firstPoint.latitude}, ${firstPoint.longitude}`,
      );
      res.json({
        success: true,
        data: {
          startPoint: {
            lat: firstPoint.latitude,
            lon: firstPoint.longitude,
            altitude: firstPoint.altitude,
          },
          trackName: track.name,
        },
      });
    } else {
      logger.warn("Active track has no points");
      res.json({
        success: true,
        data: {
          startPoint: null,
          message: "Active track has no points",
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
      // Note: setActiveGPX already does a FULL display update, no need to update again

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

    logger.info(`Setting active screen to: ${screenType}`);
    this.orchestrator.setActiveScreen(screenType);
    logger.info(`Active screen set to ${screenType}`);

    // Trigger display refresh to show the change immediately
    const updateResult = await this.orchestrator.updateDisplay();
    if (!updateResult.success) {
      logger.warn("Failed to refresh display after screen change");
    }

    res.json({
      success: true,
      message: `Active screen set to ${screenType}`,
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

      // Validate the GPX file first (while still in temp location)
      if (this.mapService) {
        const validationResult = await this.mapService.validateGPXFile(
          file.path,
        );
        if (!validationResult.success) {
          await fs.unlink(file.path);
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
      }

      // Determine the filename to use
      let baseName: string;
      if (customName) {
        // User provided a custom name (or chose to use filename)
        baseName = customName.replace(/[^a-zA-Z0-9._-]/g, "_");
      } else if (this.mapService) {
        // User chose to use track name from GPX file
        const trackResult = await this.mapService.getTrack(file.path);
        if (
          trackResult.success &&
          trackResult.data.name &&
          trackResult.data.name !== "Unnamed Track"
        ) {
          baseName = trackResult.data.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        } else {
          // Fall back to original filename if no track name
          baseName = originalName
            .replace(/\.gpx$/i, "")
            .replace(/[^a-zA-Z0-9._-]/g, "_");
        }
      } else {
        // No mapService, use original filename
        baseName = originalName
          .replace(/\.gpx$/i, "")
          .replace(/[^a-zA-Z0-9._-]/g, "_");
      }

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
      await fs.copyFile(file.path, destPath);
      await fs.unlink(file.path);

      // Clear cache to pick up the new file
      if (this.mapService) {
        this.mapService.clearCache();
      }

      // Get track info for point count and distance
      let pointCount = 0;
      let totalDistance = 0;
      if (this.mapService) {
        const trackResult = await this.mapService.getTrack(destPath);
        if (trackResult.success && trackResult.data.segments[0]) {
          pointCount = trackResult.data.segments[0].points.length;
          totalDistance = this.mapService.calculateDistance(trackResult.data);
        }
      }

      logger.info(
        `GPX file uploaded successfully: ${safeFileName} (${pointCount} points, ${totalDistance.toFixed(0)}m)`,
      );
      res.json({
        success: true,
        message: "File uploaded successfully",
        data: {
          fileName: safeFileName,
          path: destPath,
          trackName: baseName,
          pointCount,
          totalDistance,
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
        data: {
          ...this.simulationService.getStatus(),
          zoomLevel: this.configService?.getZoomLevel() ?? 14,
        },
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
        data: {
          ...this.simulationService.getStatus(),
          zoomLevel: this.configService?.getZoomLevel() ?? 14,
        },
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

  // Drive Navigation Endpoints

  /**
   * Save a drive route calculated by the browser
   * Expects DriveRoute object in body
   */
  async saveDriveRoute(req: Request, res: Response): Promise<void> {
    logger.info("Save drive route requested");

    if (!this.driveNavigationService) {
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Drive navigation service is not available",
        },
      });
      return;
    }

    const route = req.body as DriveRoute;

    // Validate required fields
    if (!route || !route.destination || !route.waypoints || !route.geometry) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message:
            "Route must include destination, waypoints, and geometry arrays",
        },
      });
      return;
    }

    if (!Array.isArray(route.waypoints) || route.waypoints.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Route must have at least one waypoint",
        },
      });
      return;
    }

    // Ensure required fields are present
    const completeRoute: DriveRoute = {
      id: route.id || `route_${Date.now()}`,
      destination: route.destination,
      createdAt: route.createdAt ? new Date(route.createdAt) : new Date(),
      startPoint: route.startPoint || {
        latitude: route.geometry[0][0],
        longitude: route.geometry[0][1],
      },
      endPoint: route.endPoint || {
        latitude: route.geometry[route.geometry.length - 1][0],
        longitude: route.geometry[route.geometry.length - 1][1],
      },
      waypoints: route.waypoints,
      geometry: route.geometry,
      totalDistance: route.totalDistance || 0,
      estimatedTime: route.estimatedTime || 0,
    };

    const result = await this.driveNavigationService.saveRoute(completeRoute);

    if (isSuccess(result)) {
      logger.info(`Drive route saved with ID: ${result.data}`);
      res.json({
        success: true,
        message: "Route saved successfully",
        data: {
          routeId: result.data,
        },
      });
    } else {
      logger.error("Failed to save drive route:", result.error);
      res.status(500).json({
        success: false,
        error: {
          code: "ROUTE_SAVE_FAILED",
          message: result.error.message || "Failed to save route",
        },
      });
    }
  }

  /**
   * Get the currently active drive route
   */
  async getActiveDriveRoute(_req: Request, res: Response): Promise<void> {
    logger.debug("Get active drive route requested");

    if (!this.driveNavigationService) {
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Drive navigation service is not available",
        },
      });
      return;
    }

    const route = this.driveNavigationService.getActiveRoute();

    res.json({
      success: true,
      data: {
        route: route,
        hasActiveRoute: route !== null,
      },
    });
  }

  /**
   * List all saved drive routes
   */
  async listDriveRoutes(_req: Request, res: Response): Promise<void> {
    logger.debug("List drive routes requested");

    if (!this.driveNavigationService) {
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Drive navigation service is not available",
        },
      });
      return;
    }

    const result = await this.driveNavigationService.listRoutes();

    if (isSuccess(result)) {
      res.json({
        success: true,
        data: {
          routes: result.data,
        },
      });
    } else {
      logger.error("Failed to list drive routes:", result.error);
      res.status(500).json({
        success: false,
        error: {
          code: "ROUTE_LIST_FAILED",
          message: result.error.message || "Failed to list routes",
        },
      });
    }
  }

  /**
   * Delete a drive route
   */
  async deleteDriveRoute(req: Request, res: Response): Promise<void> {
    const routeId = req.params.routeId;

    logger.info(`Delete drive route requested: ${routeId}`);

    if (!this.driveNavigationService) {
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Drive navigation service is not available",
        },
      });
      return;
    }

    if (!routeId) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Route ID is required",
        },
      });
      return;
    }

    const result = await this.driveNavigationService.deleteRoute(routeId);

    if (isSuccess(result)) {
      logger.info(`Drive route deleted: ${routeId}`);
      res.json({
        success: true,
        message: "Route deleted successfully",
      });
    } else {
      logger.error("Failed to delete drive route:", result.error);
      res.status(404).json({
        success: false,
        error: {
          code: "ROUTE_NOT_FOUND",
          message: result.error.message || "Route not found",
        },
      });
    }
  }

  /**
   * Start drive navigation
   * Expects { routeId: string } or complete route object in body
   */
  async startDriveNavigation(req: Request, res: Response): Promise<void> {
    const { routeId, route } = req.body;

    logger.info(
      `Start drive navigation requested: ${routeId || "with inline route"}`,
    );

    if (!this.driveNavigationService) {
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Drive navigation service is not available",
        },
      });
      return;
    }

    if (!routeId && !route) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Either routeId or route object is required",
        },
      });
      return;
    }

    // Stop any active simulation first
    if (this.simulationService) {
      const status = this.simulationService.getStatus();
      if (status.state === "running" || status.state === "paused") {
        logger.info("Stopping simulation before starting drive navigation");
        await this.simulationService.stopSimulation();
      }
    }

    // Start navigation using orchestrator (which coordinates services)
    let result;
    if (route) {
      result = await this.orchestrator.startDriveNavigation(route);
    } else {
      // Load route by ID first
      const loadResult = await this.driveNavigationService.loadRoute(routeId);
      if (!isSuccess(loadResult)) {
        res.status(404).json({
          success: false,
          error: {
            code: "ROUTE_NOT_FOUND",
            message: "Route not found",
          },
        });
        return;
      }
      result = await this.orchestrator.startDriveNavigation(loadResult.data);
    }

    if (isSuccess(result)) {
      logger.info("Drive navigation started successfully");
      res.json({
        success: true,
        message: "Navigation started",
        data: {
          state: this.driveNavigationService.getNavigationState(),
          status: this.driveNavigationService.getNavigationStatus(),
        },
      });
    } else {
      logger.error("Failed to start drive navigation:", result.error);
      res.status(500).json({
        success: false,
        error: {
          code: "NAVIGATION_START_FAILED",
          message: result.error.message || "Failed to start navigation",
        },
      });
    }
  }

  /**
   * Stop drive navigation
   */
  async stopDriveNavigation(_req: Request, res: Response): Promise<void> {
    logger.info("Stop drive navigation requested");

    if (!this.driveNavigationService) {
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Drive navigation service is not available",
        },
      });
      return;
    }

    // Disable simulation mode when stopping navigation
    this.driveNavigationService.setSimulationMode(false);

    const result = await this.orchestrator.stopDriveNavigation();

    if (isSuccess(result)) {
      logger.info("Drive navigation stopped successfully");
      res.json({
        success: true,
        message: "Navigation stopped",
      });
    } else {
      logger.error("Failed to stop drive navigation:", result.error);
      res.status(500).json({
        success: false,
        error: {
          code: "NAVIGATION_STOP_FAILED",
          message: result.error.message || "Failed to stop navigation",
        },
      });
    }
  }

  /**
   * Simulate driving along a calculated route at 100 km/h
   * Converts the drive route geometry to a GPX track and runs simulation
   */
  async simulateDriveRoute(req: Request, res: Response): Promise<void> {
    const { route, speed = 100, useMapView = false } = req.body;

    logger.info(
      `Simulate drive route requested at ${speed} km/h, useMapView: ${useMapView}`,
    );

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

    if (!route || !route.geometry || route.geometry.length < 2) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Route with geometry is required",
        },
      });
      return;
    }

    try {
      // Clear any active GPX track to prevent interference with drive simulation
      if (this.orchestrator) {
        logger.info("Clearing active GPX track for drive simulation");
        await this.orchestrator.clearActiveGPX();
      }

      // Convert drive route geometry to GPX track format
      // geometry is [[lat, lon], [lat, lon], ...]
      logger.info(
        `Creating GPX track from ${route.geometry.length} geometry points`,
      );

      const gpxTrack = {
        name: `Drive to ${route.destination || "destination"}`,
        segments: [
          {
            points: route.geometry.map(
              (coord: [number, number], index: number) => ({
                latitude: coord[0],
                longitude: coord[1],
                altitude: 0,
                timestamp: new Date(Date.now() + index * 1000),
              }),
            ),
          },
        ],
      };

      const pointCount = gpxTrack.segments[0].points.length;
      const firstPt = gpxTrack.segments[0].points[0];
      const lastPt = gpxTrack.segments[0].points[pointCount - 1];
      logger.info(
        `GPX track created with ${pointCount} points, from (${firstPt.latitude.toFixed(5)}, ${firstPt.longitude.toFixed(5)}) to (${lastPt.latitude.toFixed(5)}, ${lastPt.longitude.toFixed(5)})`,
      );

      // Start simulation at drive speed (100 km/h)
      logger.info(`Starting simulation service at ${speed} km/h`);
      const result = await this.simulationService.startSimulation(
        gpxTrack,
        speed,
      );
      logger.info(`Simulation start result: ${result.success}`);

      if (isSuccess(result)) {
        // Also start drive navigation so it tracks progress
        if (this.driveNavigationService && this.orchestrator) {
          // Enable simulation mode to skip off-road detection
          this.driveNavigationService.setSimulationMode(true);
          // Set map view preference (default to turn-only view for stability)
          this.driveNavigationService.setUseMapViewInSimulation(
            Boolean(useMapView),
          );

          logger.info(
            "Starting drive navigation for tracking (simulation mode)",
          );
          const navResult = await this.orchestrator.startDriveNavigation(route);
          logger.info(`Drive navigation start result: ${navResult.success}`);
          if (!navResult.success) {
            logger.error("Drive navigation failed:", navResult.error);
          }
        }

        // Trigger a full e-paper display refresh
        logger.info("Triggering full display refresh for drive simulation");
        const displayResult = await this.orchestrator.updateDisplay(
          DisplayUpdateMode.FULL,
        );
        logger.info(`Display update result: ${displayResult.success}`);

        logger.info(`Drive simulation started at ${speed} km/h`);
        res.json({
          success: true,
          message: `Drive simulation started at ${speed} km/h`,
          data: {
            speed,
            destination: route.destination,
            totalDistance: route.totalDistance,
          },
        });
      } else {
        logger.error("Failed to start drive simulation:", result.error);
        res.status(500).json({
          success: false,
          error: {
            code: "SIMULATION_START_FAILED",
            message: result.error.message || "Failed to start simulation",
          },
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("Error starting drive simulation:", errorMsg);
      res.status(500).json({
        success: false,
        error: {
          code: "SIMULATION_ERROR",
          message: errorMsg,
        },
      });
    }
  }

  /**
   * Get drive navigation status
   */
  async getDriveNavigationStatus(_req: Request, res: Response): Promise<void> {
    logger.debug("Drive navigation status requested");

    if (!this.driveNavigationService) {
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Drive navigation service is not available",
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        state: this.driveNavigationService.getNavigationState(),
        status: this.driveNavigationService.getNavigationStatus(),
        isNavigating: this.driveNavigationService.isNavigating(),
        activeRoute: this.driveNavigationService.getActiveRoute(),
      },
    });
  }

  /**
   * Get mock display image
   * Returns a PNG image of what would be shown on the e-paper display
   * Only available when using MockEpaperService (development mode)
   */
  async getMockDisplayImage(_req: Request, res: Response): Promise<void> {
    logger.debug("Mock display image requested");

    if (!this.orchestrator.hasMockDisplayImage()) {
      logger.debug("No mock display image available");
      res.status(404).json({
        success: false,
        error: {
          code: "NOT_AVAILABLE",
          message:
            "Mock display image not available. Either not using mock e-paper service or no image has been rendered yet.",
        },
      });
      return;
    }

    const imageBuffer = this.orchestrator.getMockDisplayImage();
    if (!imageBuffer) {
      res.status(404).json({
        success: false,
        error: {
          code: "NO_IMAGE",
          message: "No image has been rendered to the mock display yet.",
        },
      });
      return;
    }

    logger.debug(`Serving mock display image (${imageBuffer.length} bytes)`);
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(imageBuffer);
  }

  /**
   * Check if mock display is available
   */
  async getMockDisplayStatus(_req: Request, res: Response): Promise<void> {
    logger.debug("Mock display status requested");

    const available = this.orchestrator.hasMockDisplayImage();

    res.json({
      success: true,
      data: {
        available,
        message: available
          ? "Mock display image is available"
          : "Mock display image not available",
      },
    });
  }
}
