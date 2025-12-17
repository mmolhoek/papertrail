import { Request, Response } from "express";
import {
  IRenderingOrchestrator,
  IWiFiService,
  IMapService,
  IConfigService,
  ITrackSimulationService,
  IDriveNavigationService,
} from "@core/interfaces";
import { isSuccess } from "@core/types";
import { getLogger } from "@utils/logger";
import { extractErrorInfo } from "@utils/typeGuards";
import { GPSController } from "./GPSController";
import { TrackController } from "./TrackController";
import { WiFiController } from "./WiFiController";
import { DriveController } from "./DriveController";
import { SimulationController } from "./SimulationController";
import { ConfigController } from "./ConfigController";

const logger = getLogger("WebController");

/**
 * Web Controller
 *
 * Main controller that coordinates sub-controllers and handles
 * core system endpoints. Acts as the integration layer between
 * the web interface and business logic.
 *
 * This controller handles core endpoints directly:
 * - Health check (`GET /health`)
 * - System status (`GET /status`)
 * - Active GPX management (`GET/POST /gpx/active`)
 * - Display control (`POST /display/update`, `POST /display/clear`)
 * - Mock display image (`GET /display/mock`)
 *
 * Specialized endpoints are delegated to sub-controllers:
 * - {@link GPSController} - GPS position and status endpoints
 * - {@link TrackController} - GPX file management endpoints
 * - {@link WiFiController} - WiFi hotspot configuration endpoints
 * - {@link DriveController} - Drive navigation endpoints
 * - {@link SimulationController} - Track simulation endpoints
 * - {@link ConfigController} - Display and system configuration endpoints
 *
 * @example
 * ```typescript
 * const controller = new WebController(
 *   orchestrator, wifiService, mapService, gpxDirectory, configService
 * );
 *
 * // Register routes
 * app.get('/health', (req, res) => controller.getHealth(req, res));
 * app.get('/status', (req, res) => controller.getSystemStatus(req, res));
 * ```
 */
export class WebController {
  // Sub-controllers
  public readonly gps: GPSController;
  public readonly track: TrackController;
  public readonly wifi: WiFiController;
  public readonly drive: DriveController;
  public readonly simulation: SimulationController;
  public readonly config: ConfigController;

  constructor(
    private readonly orchestrator: IRenderingOrchestrator,
    wifiService?: IWiFiService,
    mapService?: IMapService,
    gpxDirectory: string = "./data/gpx-files",
    configService?: IConfigService,
    simulationService?: ITrackSimulationService,
    driveNavigationService?: IDriveNavigationService,
  ) {
    // Initialize sub-controllers
    this.gps = new GPSController(orchestrator);
    this.track = new TrackController(mapService, configService, gpxDirectory);
    this.wifi = new WiFiController(wifiService);
    this.drive = new DriveController(
      orchestrator,
      driveNavigationService,
      simulationService,
      configService,
    );
    this.simulation = new SimulationController(
      orchestrator,
      simulationService,
      mapService,
      configService,
    );
    this.config = new ConfigController(
      orchestrator,
      configService,
      wifiService,
    );
  }

  // ============================================================
  // Core System Endpoints (kept in WebController)
  // ============================================================

  /**
   * Health check endpoint.
   *
   * Returns a simple status response to verify the server is running.
   *
   * @route GET /health
   * @returns JSON with status "ok" and timestamp
   */
  async getHealth(_req: Request, res: Response): Promise<void> {
    logger.debug("Health check requested");
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get system status.
   *
   * Returns comprehensive status information including GPS, display,
   * active track, and system resource usage.
   *
   * @route GET /status
   * @returns JSON with system status data or error
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
        error: extractErrorInfo(result.error),
      });
    }
  }

  /**
   * Get active GPX file.
   *
   * Returns information about the currently loaded GPX track.
   *
   * @route GET /gpx/active
   * @returns JSON with active track info or null if none loaded
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
        error: extractErrorInfo(result.error),
      });
    }
  }

  /**
   * Set active GPX file.
   *
   * Loads a GPX track from the specified path and updates the display.
   *
   * @route POST /gpx/active
   * @param req.body.path - Path to the GPX file to load
   * @returns JSON with success status
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
        error: extractErrorInfo(result.error),
      });
    }
  }

  /**
   * Update display.
   *
   * Triggers an immediate display refresh with the current track
   * and GPS position.
   *
   * @route POST /display/update
   * @returns JSON with success status
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
        error: extractErrorInfo(result.error),
      });
    }
  }

  /**
   * Clear display.
   *
   * Clears the e-paper display to white.
   *
   * @route POST /display/clear
   * @returns JSON with success status
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
          error: extractErrorInfo(result.error),
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
   * Get mock display image.
   *
   * Returns a PNG image of what would be shown on the e-paper display.
   * Only available when using MockEpaperService (development mode).
   *
   * @route GET /display/mock
   * @returns PNG image or 404 if not available
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
   * Check if mock display is available.
   *
   * Returns whether a mock display image can be retrieved.
   *
   * @route GET /display/mock/status
   * @returns JSON with availability status
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

  // ============================================================
  // Delegated Endpoints
  // These methods delegate to sub-controllers for backwards
  // compatibility with existing route configurations.
  // New code should use sub-controllers directly.
  // ============================================================

  /** @see GPSController.getGPSPosition */
  async getGPSPosition(req: Request, res: Response): Promise<void> {
    return this.gps.getGPSPosition(req, res);
  }

  /** @see GPSController.getGPSStatus */
  async getGPSStatus(req: Request, res: Response): Promise<void> {
    return this.gps.getGPSStatus(req, res);
  }

  /** @see GPSController.setMockGPSPosition */
  async setMockGPSPosition(req: Request, res: Response): Promise<void> {
    return this.gps.setMockGPSPosition(req, res);
  }

  /** @see GPSController.checkMockGPS */
  async checkMockGPS(req: Request, res: Response): Promise<void> {
    return this.gps.checkMockGPS(req, res);
  }

  /** @see TrackController.getGPXFiles */
  async getGPXFiles(req: Request, res: Response): Promise<void> {
    return this.track.getGPXFiles(req, res);
  }

  /** @see TrackController.getActiveTrackStart */
  async getActiveTrackStart(req: Request, res: Response): Promise<void> {
    return this.track.getActiveTrackStart(req, res);
  }

  /** @see TrackController.uploadGPXFile */
  async uploadGPXFile(req: Request, res: Response): Promise<void> {
    return this.track.uploadGPXFile(req, res);
  }

  /** @see TrackController.deleteGPXFile */
  async deleteGPXFile(req: Request, res: Response): Promise<void> {
    return this.track.deleteGPXFile(req, res);
  }

  /** @see WiFiController.getHotspotConfig */
  async getHotspotConfig(req: Request, res: Response): Promise<void> {
    return this.wifi.getHotspotConfig(req, res);
  }

  /** @see WiFiController.setHotspotConfig */
  async setHotspotConfig(req: Request, res: Response): Promise<void> {
    return this.wifi.setHotspotConfig(req, res);
  }

  /** @see DriveController.saveDriveRoute */
  async saveDriveRoute(req: Request, res: Response): Promise<void> {
    return this.drive.saveDriveRoute(req, res);
  }

  /** @see DriveController.getActiveDriveRoute */
  async getActiveDriveRoute(req: Request, res: Response): Promise<void> {
    return this.drive.getActiveDriveRoute(req, res);
  }

  /** @see DriveController.listDriveRoutes */
  async listDriveRoutes(req: Request, res: Response): Promise<void> {
    return this.drive.listDriveRoutes(req, res);
  }

  /** @see DriveController.deleteDriveRoute */
  async deleteDriveRoute(req: Request, res: Response): Promise<void> {
    return this.drive.deleteDriveRoute(req, res);
  }

  /** @see DriveController.startDriveNavigation */
  async startDriveNavigation(req: Request, res: Response): Promise<void> {
    return this.drive.startDriveNavigation(req, res);
  }

  /** @see DriveController.stopDriveNavigation */
  async stopDriveNavigation(req: Request, res: Response): Promise<void> {
    return this.drive.stopDriveNavigation(req, res);
  }

  /** @see DriveController.simulateDriveRoute */
  async simulateDriveRoute(req: Request, res: Response): Promise<void> {
    return this.drive.simulateDriveRoute(req, res);
  }

  /** @see DriveController.getDriveNavigationStatus */
  async getDriveNavigationStatus(req: Request, res: Response): Promise<void> {
    return this.drive.getDriveNavigationStatus(req, res);
  }

  /** @see DriveController.calculateRoute */
  async calculateRoute(req: Request, res: Response): Promise<void> {
    return this.drive.calculateRoute(req, res);
  }

  /** @see DriveController.showFullRoute */
  async showFullRoute(req: Request, res: Response): Promise<void> {
    return this.drive.showFullRoute(req, res);
  }

  /** @see SimulationController.startSimulation */
  async startSimulation(req: Request, res: Response): Promise<void> {
    return this.simulation.startSimulation(req, res);
  }

  /** @see SimulationController.stopSimulation */
  async stopSimulation(req: Request, res: Response): Promise<void> {
    return this.simulation.stopSimulation(req, res);
  }

  /** @see SimulationController.pauseSimulation */
  async pauseSimulation(req: Request, res: Response): Promise<void> {
    return this.simulation.pauseSimulation(req, res);
  }

  /** @see SimulationController.resumeSimulation */
  async resumeSimulation(req: Request, res: Response): Promise<void> {
    return this.simulation.resumeSimulation(req, res);
  }

  /** @see SimulationController.setSimulationSpeed */
  async setSimulationSpeed(req: Request, res: Response): Promise<void> {
    return this.simulation.setSimulationSpeed(req, res);
  }

  /** @see SimulationController.getSimulationStatus */
  async getSimulationStatus(req: Request, res: Response): Promise<void> {
    return this.simulation.getSimulationStatus(req, res);
  }

  /** @see ConfigController.getDisplaySettings */
  async getDisplaySettings(req: Request, res: Response): Promise<void> {
    return this.config.getDisplaySettings(req, res);
  }

  /** @see ConfigController.setZoom */
  async setZoom(req: Request, res: Response): Promise<void> {
    return this.config.setZoom(req, res);
  }

  /** @see ConfigController.startAutoUpdate */
  async startAutoUpdate(req: Request, res: Response): Promise<void> {
    return this.config.startAutoUpdate(req, res);
  }

  /** @see ConfigController.stopAutoUpdate */
  async stopAutoUpdate(req: Request, res: Response): Promise<void> {
    return this.config.stopAutoUpdate(req, res);
  }

  /** @see ConfigController.setAutoCenter */
  async setAutoCenter(req: Request, res: Response): Promise<void> {
    return this.config.setAutoCenter(req, res);
  }

  /** @see ConfigController.setRotateWithBearing */
  async setRotateWithBearing(req: Request, res: Response): Promise<void> {
    return this.config.setRotateWithBearing(req, res);
  }

  /** @see ConfigController.setActiveScreen */
  async setActiveScreen(req: Request, res: Response): Promise<void> {
    return this.config.setActiveScreen(req, res);
  }

  /** @see ConfigController.setSpeedUnit */
  async setSpeedUnit(req: Request, res: Response): Promise<void> {
    return this.config.setSpeedUnit(req, res);
  }

  /** @see ConfigController.setPOICategory */
  async setPOICategory(req: Request, res: Response): Promise<void> {
    return this.config.setPOICategory(req, res);
  }

  /** @see ConfigController.getRecentDestinations */
  async getRecentDestinations(req: Request, res: Response): Promise<void> {
    return this.config.getRecentDestinations(req, res);
  }

  /** @see ConfigController.addRecentDestination */
  async addRecentDestination(req: Request, res: Response): Promise<void> {
    return this.config.addRecentDestination(req, res);
  }

  /** @see ConfigController.removeRecentDestination */
  async removeRecentDestination(req: Request, res: Response): Promise<void> {
    return this.config.removeRecentDestination(req, res);
  }

  /** @see ConfigController.clearRecentDestinations */
  async clearRecentDestinations(req: Request, res: Response): Promise<void> {
    return this.config.clearRecentDestinations(req, res);
  }

  /** @see ConfigController.resolveGoogleMapsLink */
  async resolveGoogleMapsLink(req: Request, res: Response): Promise<void> {
    return this.config.resolveGoogleMapsLink(req, res);
  }

  /** @see ConfigController.resetSystem */
  async resetSystem(req: Request, res: Response): Promise<void> {
    return this.config.resetSystem(req, res);
  }
}
