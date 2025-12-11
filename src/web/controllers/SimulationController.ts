import { Request, Response } from "express";
import {
  IRenderingOrchestrator,
  IMapService,
  ITrackSimulationService,
  IConfigService,
  SimulationSpeed,
} from "@core/interfaces";
import { isSuccess } from "@core/types";
import { getLogger } from "@utils/logger";

const logger = getLogger("SimulationController");

/**
 * Simulation Controller
 *
 * Handles track simulation endpoints for testing GPS navigation
 * without actual GPS hardware.
 */
export class SimulationController {
  constructor(
    private readonly orchestrator: IRenderingOrchestrator,
    private readonly simulationService?: ITrackSimulationService,
    private readonly mapService?: IMapService,
    private readonly configService?: IConfigService,
  ) {}

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
}
