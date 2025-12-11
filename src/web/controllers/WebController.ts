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
import { WebError } from "@core/errors";
import { getLogger } from "@utils/logger";
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
 * Sub-controllers:
 * - GPSController: GPS position and status endpoints
 * - TrackController: GPX file management endpoints
 * - WiFiController: WiFi hotspot configuration endpoints
 * - DriveController: Drive navigation endpoints
 * - SimulationController: Track simulation endpoints
 * - ConfigController: Display and system configuration endpoints
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

  // ============================================================
  // Delegated Endpoints (for backwards compatibility)
  // These delegate to sub-controllers
  // ============================================================

  // GPS endpoints
  async getGPSPosition(req: Request, res: Response): Promise<void> {
    return this.gps.getGPSPosition(req, res);
  }

  async getGPSStatus(req: Request, res: Response): Promise<void> {
    return this.gps.getGPSStatus(req, res);
  }

  async setMockGPSPosition(req: Request, res: Response): Promise<void> {
    return this.gps.setMockGPSPosition(req, res);
  }

  async checkMockGPS(req: Request, res: Response): Promise<void> {
    return this.gps.checkMockGPS(req, res);
  }

  // Track endpoints
  async getGPXFiles(req: Request, res: Response): Promise<void> {
    return this.track.getGPXFiles(req, res);
  }

  async getActiveTrackStart(req: Request, res: Response): Promise<void> {
    return this.track.getActiveTrackStart(req, res);
  }

  async uploadGPXFile(req: Request, res: Response): Promise<void> {
    return this.track.uploadGPXFile(req, res);
  }

  async deleteGPXFile(req: Request, res: Response): Promise<void> {
    return this.track.deleteGPXFile(req, res);
  }

  // WiFi endpoints
  async getHotspotConfig(req: Request, res: Response): Promise<void> {
    return this.wifi.getHotspotConfig(req, res);
  }

  async setHotspotConfig(req: Request, res: Response): Promise<void> {
    return this.wifi.setHotspotConfig(req, res);
  }

  // Drive navigation endpoints
  async saveDriveRoute(req: Request, res: Response): Promise<void> {
    return this.drive.saveDriveRoute(req, res);
  }

  async getActiveDriveRoute(req: Request, res: Response): Promise<void> {
    return this.drive.getActiveDriveRoute(req, res);
  }

  async listDriveRoutes(req: Request, res: Response): Promise<void> {
    return this.drive.listDriveRoutes(req, res);
  }

  async deleteDriveRoute(req: Request, res: Response): Promise<void> {
    return this.drive.deleteDriveRoute(req, res);
  }

  async startDriveNavigation(req: Request, res: Response): Promise<void> {
    return this.drive.startDriveNavigation(req, res);
  }

  async stopDriveNavigation(req: Request, res: Response): Promise<void> {
    return this.drive.stopDriveNavigation(req, res);
  }

  async simulateDriveRoute(req: Request, res: Response): Promise<void> {
    return this.drive.simulateDriveRoute(req, res);
  }

  async getDriveNavigationStatus(req: Request, res: Response): Promise<void> {
    return this.drive.getDriveNavigationStatus(req, res);
  }

  // Simulation endpoints
  async startSimulation(req: Request, res: Response): Promise<void> {
    return this.simulation.startSimulation(req, res);
  }

  async stopSimulation(req: Request, res: Response): Promise<void> {
    return this.simulation.stopSimulation(req, res);
  }

  async pauseSimulation(req: Request, res: Response): Promise<void> {
    return this.simulation.pauseSimulation(req, res);
  }

  async resumeSimulation(req: Request, res: Response): Promise<void> {
    return this.simulation.resumeSimulation(req, res);
  }

  async setSimulationSpeed(req: Request, res: Response): Promise<void> {
    return this.simulation.setSimulationSpeed(req, res);
  }

  async getSimulationStatus(req: Request, res: Response): Promise<void> {
    return this.simulation.getSimulationStatus(req, res);
  }

  // Config endpoints
  async getDisplaySettings(req: Request, res: Response): Promise<void> {
    return this.config.getDisplaySettings(req, res);
  }

  async setZoom(req: Request, res: Response): Promise<void> {
    return this.config.setZoom(req, res);
  }

  async startAutoUpdate(req: Request, res: Response): Promise<void> {
    return this.config.startAutoUpdate(req, res);
  }

  async stopAutoUpdate(req: Request, res: Response): Promise<void> {
    return this.config.stopAutoUpdate(req, res);
  }

  async setAutoCenter(req: Request, res: Response): Promise<void> {
    return this.config.setAutoCenter(req, res);
  }

  async setRotateWithBearing(req: Request, res: Response): Promise<void> {
    return this.config.setRotateWithBearing(req, res);
  }

  async setActiveScreen(req: Request, res: Response): Promise<void> {
    return this.config.setActiveScreen(req, res);
  }

  async getRecentDestinations(req: Request, res: Response): Promise<void> {
    return this.config.getRecentDestinations(req, res);
  }

  async addRecentDestination(req: Request, res: Response): Promise<void> {
    return this.config.addRecentDestination(req, res);
  }

  async removeRecentDestination(req: Request, res: Response): Promise<void> {
    return this.config.removeRecentDestination(req, res);
  }

  async clearRecentDestinations(req: Request, res: Response): Promise<void> {
    return this.config.clearRecentDestinations(req, res);
  }

  async resetSystem(req: Request, res: Response): Promise<void> {
    return this.config.resetSystem(req, res);
  }
}
