import { Request, Response } from "express";
import {
  IRenderingOrchestrator,
  IWiFiService,
  IConfigService,
} from "@core/interfaces";
import { isSuccess } from "@core/types";
import { getLogger } from "@utils/logger";
import { extractErrorInfo } from "@utils/typeGuards";

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
        centerOverride: this.configService.getCenterOverride(),
        rotateWithBearing: this.configService.getRotateWithBearing(),
        activeScreen: this.configService.getActiveScreen(),
        speedUnit: this.configService.getSpeedUnit(),
        enabledPOICategories: this.configService.getEnabledPOICategories(),
        showLocationName: this.configService.getShowLocationName(),
        showRoads: this.configService.getShowRoads(),
        showWater: this.configService.getShowWater(),
        showWaterways: this.configService.getShowWaterways(),
        showLanduse: this.configService.getShowLanduse(),
        showSpeedLimit: this.configService.getShowSpeedLimit(),
        showElevation: this.configService.getShowElevation(),
        routingProfile: this.configService.getRoutingProfile(),
        // Track mode map feature settings
        showRoadsInTrackMode: this.configService.getShowRoadsInTrackMode(),
        showWaterInTrackMode: this.configService.getShowWaterInTrackMode(),
        showWaterwaysInTrackMode:
          this.configService.getShowWaterwaysInTrackMode(),
        showLanduseInTrackMode: this.configService.getShowLanduseInTrackMode(),
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
        error: extractErrorInfo(result.error),
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
        error: extractErrorInfo(result.error),
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
   * Set center override for manual panning
   */
  async setCenterOverride(req: Request, res: Response): Promise<void> {
    if (!this.configService) {
      res.status(500).json({
        success: false,
        error: {
          code: "CONFIG_UNAVAILABLE",
          message: "Config service unavailable",
        },
      });
      return;
    }

    const { latitude, longitude } = req.body;

    logger.info(`Setting center override to: (${latitude}, ${longitude})`);
    this.configService.setCenterOverride({ latitude, longitude });

    // Trigger display update
    const result = await this.orchestrator.updateDisplay();
    if (!result.success) {
      logger.error("Failed to update display after center override change");
    }

    res.json({
      success: true,
      message: `Center override set to (${latitude}, ${longitude})`,
      displayUpdated: result.success,
    });
  }

  /**
   * Clear center override (resume following GPS)
   */
  async clearCenterOverride(_req: Request, res: Response): Promise<void> {
    if (!this.configService) {
      res.status(500).json({
        success: false,
        error: {
          code: "CONFIG_UNAVAILABLE",
          message: "Config service unavailable",
        },
      });
      return;
    }

    logger.info("Clearing center override");
    this.configService.clearCenterOverride();

    // Trigger display update
    const result = await this.orchestrator.updateDisplay();
    if (!result.success) {
      logger.error("Failed to update display after clearing center override");
    }

    res.json({
      success: true,
      message: "Center override cleared, following GPS",
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

  /**
   * Set speed unit preference
   */
  async setSpeedUnit(req: Request, res: Response): Promise<void> {
    const { unit } = req.body;

    if (typeof unit !== "string" || !["kmh", "mph"].includes(unit)) {
      logger.warn("Set speed unit called with invalid unit parameter");
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "unit must be 'kmh' or 'mph'",
        },
      });
      return;
    }

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

    logger.info(`Setting speed unit to: ${unit}`);
    this.configService.setSpeedUnit(unit as "kmh" | "mph");

    // Save the setting to persist it
    await this.configService.save();

    logger.info(`Speed unit set to ${unit}`);
    res.json({
      success: true,
      message: `Speed unit set to ${unit === "kmh" ? "km/h" : "mph"}`,
    });
  }

  /**
   * Set POI category enabled/disabled
   */
  async setPOICategory(req: Request, res: Response): Promise<void> {
    const { category, enabled } = req.body;

    const validCategories = [
      "fuel",
      "charging",
      "parking",
      "food",
      "restroom",
      "viewpoint",
    ];
    if (typeof category !== "string" || !validCategories.includes(category)) {
      logger.warn("Set POI category called with invalid category parameter");
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message:
            "category must be one of: fuel, charging, parking, food, restroom, viewpoint",
        },
      });
      return;
    }

    if (typeof enabled !== "boolean") {
      logger.warn("Set POI category called with invalid enabled parameter");
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "enabled must be a boolean",
        },
      });
      return;
    }

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

    logger.info(`Setting POI category ${category} to: ${enabled}`);
    this.configService.setPOICategoryEnabled(
      category as
        | "fuel"
        | "charging"
        | "parking"
        | "food"
        | "restroom"
        | "viewpoint",
      enabled,
    );

    // Save the setting to persist it
    await this.configService.save();

    // POI cache contains all categories, so no need to refresh when categories change
    // The filtering by enabled categories happens at display time

    logger.info(`POI category ${category} ${enabled ? "enabled" : "disabled"}`);
    res.json({
      success: true,
      message: `POI category ${category} ${enabled ? "enabled" : "disabled"}`,
    });
  }

  /**
   * Set routing profile for OSRM route calculation
   */
  async setRoutingProfile(req: Request, res: Response): Promise<void> {
    const { profile } = req.body;

    if (
      typeof profile !== "string" ||
      !["car", "bike", "foot"].includes(profile)
    ) {
      logger.warn("Set routing profile called with invalid profile parameter");
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "profile must be 'car', 'bike', or 'foot'",
        },
      });
      return;
    }

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

    logger.info(`Setting routing profile to: ${profile}`);
    this.configService.setRoutingProfile(profile as "car" | "bike" | "foot");

    // Save the setting to persist it
    await this.configService.save();

    const profileNames: Record<string, string> = {
      car: "Driving",
      bike: "Bicycle",
      foot: "Walking",
    };

    logger.info(`Routing profile set to ${profile}`);
    res.json({
      success: true,
      message: `Routing profile set to ${profileNames[profile]}`,
    });
  }

  /**
   * Set show location name enabled/disabled
   */
  async setShowLocationName(req: Request, res: Response): Promise<void> {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      logger.warn(
        "Set show location name called with invalid enabled parameter",
      );
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "enabled must be a boolean",
        },
      });
      return;
    }

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

    logger.info(`Setting show location name to: ${enabled}`);
    this.configService.setShowLocationName(enabled);

    // Save the setting to persist it
    await this.configService.save();

    logger.info(`Show location name ${enabled ? "enabled" : "disabled"}`);
    res.json({
      success: true,
      message: `Location name display ${enabled ? "enabled" : "disabled"}`,
    });
  }

  /**
   * Set show roads enabled/disabled
   */
  async setShowRoads(req: Request, res: Response): Promise<void> {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      logger.warn("Set show roads called with invalid enabled parameter");
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "enabled must be a boolean",
        },
      });
      return;
    }

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

    logger.info(`Setting show roads to: ${enabled}`);
    this.configService.setShowRoads(enabled);

    // Save the setting to persist it
    await this.configService.save();

    logger.info(`Show roads ${enabled ? "enabled" : "disabled"}`);
    res.json({
      success: true,
      message: `Road layer ${enabled ? "enabled" : "disabled"}`,
    });
  }

  /**
   * Set show water enabled/disabled
   */
  async setShowWater(req: Request, res: Response): Promise<void> {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      logger.warn("Set show water called with invalid enabled parameter");
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "enabled must be a boolean",
        },
      });
      return;
    }

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

    logger.info(`Setting show water to: ${enabled}`);
    this.configService.setShowWater(enabled);

    // Save the setting to persist it
    await this.configService.save();

    logger.info(`Show water ${enabled ? "enabled" : "disabled"}`);
    res.json({
      success: true,
      message: `Water bodies layer ${enabled ? "enabled" : "disabled"}`,
    });
  }

  /**
   * Set show waterways enabled/disabled (rivers, streams, canals)
   */
  async setShowWaterways(req: Request, res: Response): Promise<void> {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      logger.warn("Set show waterways called with invalid enabled parameter");
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "enabled must be a boolean",
        },
      });
      return;
    }

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

    logger.info(`Setting show waterways to: ${enabled}`);
    this.configService.setShowWaterways(enabled);

    // Save the setting to persist it
    await this.configService.save();

    logger.info(`Show waterways ${enabled ? "enabled" : "disabled"}`);
    res.json({
      success: true,
      message: `Waterways layer ${enabled ? "enabled" : "disabled"}`,
    });
  }

  /**
   * Set show landuse enabled/disabled
   */
  async setShowLanduse(req: Request, res: Response): Promise<void> {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      logger.warn("Set show landuse called with invalid enabled parameter");
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "enabled must be a boolean",
        },
      });
      return;
    }

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

    logger.info(`Setting show landuse to: ${enabled}`);
    this.configService.setShowLanduse(enabled);

    // Save the setting to persist it
    await this.configService.save();

    logger.info(`Show landuse ${enabled ? "enabled" : "disabled"}`);
    res.json({
      success: true,
      message: `Landuse layer ${enabled ? "enabled" : "disabled"}`,
    });
  }

  /**
   * Set show speed limit enabled/disabled
   */
  async setShowSpeedLimit(req: Request, res: Response): Promise<void> {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      logger.warn("Set show speed limit called with invalid enabled parameter");
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "enabled must be a boolean",
        },
      });
      return;
    }

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

    logger.info(`Setting show speed limit to: ${enabled}`);
    this.configService.setShowSpeedLimit(enabled);

    // Save the setting to persist it
    await this.configService.save();

    logger.info(`Show speed limit ${enabled ? "enabled" : "disabled"}`);
    res.json({
      success: true,
      message: `Speed limit display ${enabled ? "enabled" : "disabled"}`,
    });
  }

  /**
   * Set show elevation enabled/disabled
   */
  async setShowElevation(req: Request, res: Response): Promise<void> {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      logger.warn("Set show elevation called with invalid enabled parameter");
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "enabled must be a boolean",
        },
      });
      return;
    }

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

    logger.info(`Setting show elevation to: ${enabled}`);
    this.configService.setShowElevation(enabled);

    // Save the setting to persist it
    await this.configService.save();

    logger.info(`Show elevation ${enabled ? "enabled" : "disabled"}`);
    res.json({
      success: true,
      message: `Elevation display ${enabled ? "enabled" : "disabled"}`,
    });
  }

  /**
   * Set show road surface enabled/disabled
   */
  async setShowRoadSurface(req: Request, res: Response): Promise<void> {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      logger.warn(
        "Set show road surface called with invalid enabled parameter",
      );
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "enabled must be a boolean",
        },
      });
      return;
    }

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

    logger.info(`Setting show road surface to: ${enabled}`);
    this.configService.setShowRoadSurface(enabled);

    // Save the setting to persist it
    await this.configService.save();

    logger.info(`Show road surface ${enabled ? "enabled" : "disabled"}`);
    res.json({
      success: true,
      message: `Road surface display ${enabled ? "enabled" : "disabled"}`,
    });
  }

  // Track Mode Map Feature Endpoints

  /**
   * Set show roads in track mode enabled/disabled
   */
  async setShowRoadsInTrackMode(req: Request, res: Response): Promise<void> {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "enabled must be a boolean",
        },
      });
      return;
    }

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

    logger.info(`Setting show roads in track mode to: ${enabled}`);
    this.configService.setShowRoadsInTrackMode(enabled);
    await this.configService.save();

    res.json({
      success: true,
      message: `Track mode roads ${enabled ? "enabled" : "disabled"}`,
    });
  }

  /**
   * Set show water in track mode enabled/disabled
   */
  async setShowWaterInTrackMode(req: Request, res: Response): Promise<void> {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "enabled must be a boolean",
        },
      });
      return;
    }

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

    logger.info(`Setting show water in track mode to: ${enabled}`);
    this.configService.setShowWaterInTrackMode(enabled);
    await this.configService.save();

    res.json({
      success: true,
      message: `Track mode water ${enabled ? "enabled" : "disabled"}`,
    });
  }

  /**
   * Set show waterways in track mode enabled/disabled
   */
  async setShowWaterwaysInTrackMode(
    req: Request,
    res: Response,
  ): Promise<void> {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "enabled must be a boolean",
        },
      });
      return;
    }

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

    logger.info(`Setting show waterways in track mode to: ${enabled}`);
    this.configService.setShowWaterwaysInTrackMode(enabled);
    await this.configService.save();

    res.json({
      success: true,
      message: `Track mode waterways ${enabled ? "enabled" : "disabled"}`,
    });
  }

  /**
   * Set show landuse in track mode enabled/disabled
   */
  async setShowLanduseInTrackMode(req: Request, res: Response): Promise<void> {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "enabled must be a boolean",
        },
      });
      return;
    }

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

    logger.info(`Setting show landuse in track mode to: ${enabled}`);
    this.configService.setShowLanduseInTrackMode(enabled);
    await this.configService.save();

    res.json({
      success: true,
      message: `Track mode landuse ${enabled ? "enabled" : "disabled"}`,
    });
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

  /**
   * Resolve a Google Maps link to coordinates
   * Handles both shortened URLs (maps.app.goo.gl) and full URLs
   */
  async resolveGoogleMapsLink(req: Request, res: Response): Promise<void> {
    const { url } = req.body;

    logger.info(`Resolving Google Maps link: ${url}`);

    try {
      // Follow redirects to get the final URL
      let finalUrl = url;

      // If it's a shortened URL, we need to follow the redirect
      if (url.includes("goo.gl") || url.includes("maps.app.goo.gl")) {
        try {
          const response = await fetch(url, {
            method: "HEAD",
            redirect: "follow",
          });
          finalUrl = response.url;
          logger.debug(`Shortened URL resolved to: ${finalUrl}`);
        } catch (fetchError) {
          logger.warn(`Failed to follow redirect, trying GET: ${fetchError}`);
          // Try GET if HEAD fails
          const response = await fetch(url, {
            redirect: "follow",
          });
          finalUrl = response.url;
        }
      }

      // Parse coordinates from the URL
      const result = this.parseGoogleMapsUrl(finalUrl);

      if (!result) {
        logger.warn(`Could not parse coordinates from URL: ${finalUrl}`);
        res.status(400).json({
          success: false,
          error: {
            code: "PARSE_FAILED",
            message:
              "Could not extract coordinates from Google Maps link. Please try a different link format.",
          },
        });
        return;
      }

      logger.info(
        `Resolved coordinates: ${result.latitude}, ${result.longitude} (${result.name})`,
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error("Failed to resolve Google Maps link:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "RESOLVE_FAILED",
          message: "Failed to resolve Google Maps link",
        },
      });
    }
  }

  /**
   * Parse a Google Maps URL to extract coordinates and place name
   */
  private parseGoogleMapsUrl(
    url: string,
  ): { latitude: number; longitude: number; name: string } | null {
    try {
      const urlObj = new URL(url);
      const fullUrl = url;

      // Pattern 1: /@lat,lng,zoom in path (most common)
      // Example: /maps/place/Name/@40.7128,-74.0060,15z
      const atPattern = /@(-?\d+\.?\d*),(-?\d+\.?\d*)/;
      const atMatch = fullUrl.match(atPattern);

      if (atMatch) {
        const lat = parseFloat(atMatch[1]);
        const lon = parseFloat(atMatch[2]);

        if (this.isValidCoordinate(lat, lon)) {
          return {
            latitude: lat,
            longitude: lon,
            name:
              this.extractPlaceName(fullUrl) ||
              `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
          };
        }
      }

      // Pattern 2: q=lat,lng in query string
      // Example: ?q=40.7128,-74.0060
      const qParam = urlObj.searchParams.get("q");
      if (qParam) {
        const coordMatch = qParam.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
        if (coordMatch) {
          const lat = parseFloat(coordMatch[1]);
          const lon = parseFloat(coordMatch[2]);

          if (this.isValidCoordinate(lat, lon)) {
            return {
              latitude: lat,
              longitude: lon,
              name: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
            };
          }
        }
      }

      // Pattern 3: ll=lat,lng in query string
      const llParam = urlObj.searchParams.get("ll");
      if (llParam) {
        const coordMatch = llParam.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
        if (coordMatch) {
          const lat = parseFloat(coordMatch[1]);
          const lon = parseFloat(coordMatch[2]);

          if (this.isValidCoordinate(lat, lon)) {
            return {
              latitude: lat,
              longitude: lon,
              name: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
            };
          }
        }
      }

      // Pattern 4: destination parameter for directions
      // Example: destination=40.7128,-74.0060
      const destParam = urlObj.searchParams.get("destination");
      if (destParam) {
        const coordMatch = destParam.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
        if (coordMatch) {
          const lat = parseFloat(coordMatch[1]);
          const lon = parseFloat(coordMatch[2]);

          if (this.isValidCoordinate(lat, lon)) {
            return {
              latitude: lat,
              longitude: lon,
              name: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
            };
          }
        }
      }

      // Pattern 5: data parameter with !3d and !4d markers
      // Example: !3d40.7128!4d-74.0060
      const dataPattern = /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/;
      const dataMatch = fullUrl.match(dataPattern);
      if (dataMatch) {
        const lat = parseFloat(dataMatch[1]);
        const lon = parseFloat(dataMatch[2]);

        if (this.isValidCoordinate(lat, lon)) {
          return {
            latitude: lat,
            longitude: lon,
            name:
              this.extractPlaceName(fullUrl) ||
              `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Validate latitude and longitude values
   */
  private isValidCoordinate(lat: number, lon: number): boolean {
    return (
      !isNaN(lat) &&
      !isNaN(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180
    );
  }

  /**
   * Extract place name from Google Maps URL
   */
  private extractPlaceName(url: string): string | null {
    try {
      // Try to extract from /place/Name/ pattern
      const placeMatch = url.match(/\/place\/([^/@]+)/);
      if (placeMatch) {
        // Decode URL-encoded characters and replace + with space
        return decodeURIComponent(placeMatch[1].replace(/\+/g, " "));
      }

      return null;
    } catch {
      return null;
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
}
