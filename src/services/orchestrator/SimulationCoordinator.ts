import { ITrackSimulationService } from "@core/interfaces";
import { GPSCoordinate, Result, success } from "@core/types";
import { getLogger } from "@utils/logger";
import { GPSCoordinator } from "./GPSCoordinator";
import { DriveCoordinator } from "./DriveCoordinator";

const logger = getLogger("SimulationCoordinator");

/**
 * Coordinates track simulation display updates.
 *
 * Responsibilities:
 * - Subscribes to simulation state changes (start/stop/pause)
 * - Subscribes to simulation position updates
 * - Manages periodic display updates during simulation
 * - Forwards simulated positions to GPS coordinator
 * - Coordinates with drive coordinator for navigation display
 */
export class SimulationCoordinator {
  // Simulation subscription management
  private simulationPositionUnsubscribe: (() => void) | null = null;

  // Display update interval during simulation
  private simulationDisplayInterval: NodeJS.Timeout | null = null;

  // Last known simulation state (to detect actual transitions)
  private lastSimulationState: string | null = null;

  // Display update interval (5 seconds)
  private static readonly SIMULATION_DISPLAY_UPDATE_MS = 5000;

  // Callbacks for orchestrator actions
  private stopAutoUpdateCallback: (() => void) | null = null;
  private updateDisplayCallback: (() => Promise<Result<void>>) | null = null;

  constructor(
    private readonly simulationService: ITrackSimulationService | null,
    private gpsCoordinator: GPSCoordinator | null,
    private driveCoordinator: DriveCoordinator | null,
  ) {}

  /**
   * Set the GPS coordinator reference
   */
  setGPSCoordinator(coordinator: GPSCoordinator | null): void {
    this.gpsCoordinator = coordinator;
  }

  /**
   * Set the drive coordinator reference
   */
  setDriveCoordinator(coordinator: DriveCoordinator | null): void {
    this.driveCoordinator = coordinator;
  }

  /**
   * Set the callback to stop auto-update during simulation
   */
  setStopAutoUpdateCallback(callback: () => void): void {
    this.stopAutoUpdateCallback = callback;
  }

  /**
   * Set the callback to update display (for track mode)
   */
  setUpdateDisplayCallback(callback: () => Promise<Result<void>>): void {
    this.updateDisplayCallback = callback;
  }

  /**
   * Subscribe to simulation state and position changes
   */
  subscribeToSimulationUpdates(): void {
    if (!this.simulationService) {
      return;
    }

    // Subscribe to state changes (start/stop/pause)
    this.simulationService.onStateChange((status) => {
      // Only act on actual state transitions
      if (status.state === this.lastSimulationState) {
        return;
      }

      logger.info(
        `Simulation state changed: ${this.lastSimulationState} -> ${status.state}`,
      );
      this.lastSimulationState = status.state;

      if (status.state === "running") {
        // Stop auto-update during simulation to prevent concurrent updates
        if (this.stopAutoUpdateCallback) {
          logger.info("Stopping auto-update during simulation");
          this.stopAutoUpdateCallback();
        }
        // Start periodic display updates during simulation
        this.startSimulationDisplayUpdates();
      } else if (status.state === "stopped") {
        // Stop periodic display updates when simulation stops
        this.stopSimulationDisplayUpdates();

        // If drive navigation is still active, show final drive display
        if (this.driveCoordinator?.isDriveNavigating()) {
          logger.info(
            "Simulation stopped but drive navigation still active - showing final drive display",
          );
          void this.driveCoordinator.updateDriveDisplay().catch((error) => {
            logger.error("Failed to show final drive display:", error);
          });
        }
      }
      // Note: "paused" state keeps the interval but updateDisplay won't change position
    });

    // Subscribe to position updates and forward via GPS coordinator
    this.simulationPositionUnsubscribe =
      this.simulationService.onPositionUpdate((position) => {
        const isNav = this.driveCoordinator?.isDriveNavigating() ?? false;
        logger.debug(
          `Sim position: ${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}, isNavigating=${isNav}`,
        );

        // Update position via GPS coordinator (stores position, forwards to drive nav, notifies callbacks)
        if (this.gpsCoordinator) {
          this.gpsCoordinator.updatePosition(position);
        }
      });

    logger.info("Subscribed to simulation state and position changes");
  }

  /**
   * Check if simulation is currently running
   */
  isSimulating(): boolean {
    return this.simulationService?.isSimulating() ?? false;
  }

  /**
   * Get the simulation service (for direct access if needed)
   */
  getSimulationService(): ITrackSimulationService | null {
    return this.simulationService;
  }

  /**
   * Stop simulation display updates (can be called externally)
   */
  stopSimulationDisplayUpdates(): void {
    if (this.simulationDisplayInterval) {
      clearInterval(this.simulationDisplayInterval);
      this.simulationDisplayInterval = null;
      logger.info("Stopped simulation display updates");
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    logger.info("Disposing SimulationCoordinator...");

    // Stop display updates
    this.stopSimulationDisplayUpdates();

    // Unsubscribe from position updates
    if (this.simulationPositionUnsubscribe) {
      this.simulationPositionUnsubscribe();
      this.simulationPositionUnsubscribe = null;
    }

    // Reset state
    this.lastSimulationState = null;

    logger.info("✓ SimulationCoordinator disposed");
  }

  /**
   * Start periodic display updates during simulation
   */
  private startSimulationDisplayUpdates(): void {
    // Stop any existing interval
    this.stopSimulationDisplayUpdates();

    logger.info(
      `Starting simulation display updates (every ${SimulationCoordinator.SIMULATION_DISPLAY_UPDATE_MS}ms)`,
    );

    // Helper to perform the appropriate display update
    const doDisplayUpdate = () => {
      // If drive navigation is active, use drive display update instead
      if (this.driveCoordinator?.isDriveNavigating()) {
        logger.info("Simulation display update tick (drive mode)");
        void this.driveCoordinator.updateDriveDisplay().catch((error) => {
          logger.error("Drive display update failed:", error);
        });
      } else if (this.updateDisplayCallback) {
        logger.info("Simulation display update tick (track mode)");
        void this.updateDisplayCallback().catch((error) => {
          logger.error("Simulation display update failed:", error);
        });
      }
    };

    // Do an immediate update
    doDisplayUpdate();

    // Set up periodic updates
    this.simulationDisplayInterval = setInterval(() => {
      if (this.simulationService?.isSimulating()) {
        doDisplayUpdate();
      }
    }, SimulationCoordinator.SIMULATION_DISPLAY_UPDATE_MS);
  }
}
