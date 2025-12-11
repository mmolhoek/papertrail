import { Request, Response } from "express";
import {
  IRenderingOrchestrator,
  IDriveNavigationService,
  ITrackSimulationService,
  IConfigService,
} from "@core/interfaces";
import { isSuccess, DriveRoute, DisplayUpdateMode } from "@core/types";
import { getLogger } from "@utils/logger";

const logger = getLogger("DriveController");

/**
 * Drive Controller
 *
 * Handles drive navigation endpoints including route management,
 * starting/stopping navigation, and drive simulation.
 */
export class DriveController {
  constructor(
    private readonly orchestrator: IRenderingOrchestrator,
    private readonly driveNavigationService?: IDriveNavigationService,
    private readonly simulationService?: ITrackSimulationService,
    private readonly configService?: IConfigService,
  ) {}

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
    const { route, speed = 100 } = req.body;

    logger.info(`Simulate drive route requested at ${speed} km/h`);

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
   * Proxy route calculation to OSRM API
   * This avoids CORS issues when calling OSRM from the browser
   */
  async calculateRoute(req: Request, res: Response): Promise<void> {
    const { startLon, startLat, endLon, endLat } = req.query;

    if (!startLon || !startLat || !endLon || !endLat) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message:
            "Missing required parameters: startLon, startLat, endLon, endLat",
        },
      });
      return;
    }

    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=geojson&steps=true`;

    logger.info(
      `Proxying OSRM request: ${startLon},${startLat} -> ${endLon},${endLat}`,
    );

    try {
      const response = await fetch(osrmUrl);

      if (!response.ok) {
        logger.error(
          `OSRM request failed: ${response.status} ${response.statusText}`,
        );
        res.status(response.status).json({
          success: false,
          error: {
            code: "OSRM_ERROR",
            message: `OSRM request failed: ${response.status} ${response.statusText}`,
          },
        });
        return;
      }

      const data = (await response.json()) as {
        code: string;
        message?: string;
        routes?: unknown[];
      };

      if (data.code !== "Ok") {
        logger.warn(
          `OSRM returned error: ${data.code} - ${data.message || "Unknown"}`,
        );
        res.status(400).json({
          success: false,
          error: {
            code: "OSRM_ROUTING_ERROR",
            message: data.message || `OSRM error: ${data.code}`,
          },
        });
        return;
      }

      res.json({
        success: true,
        data: data,
      });
    } catch (error) {
      logger.error("Failed to proxy OSRM request:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "PROXY_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to calculate route",
        },
      });
    }
  }
}
