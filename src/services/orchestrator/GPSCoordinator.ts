import {
  IGPSService,
  ITrackSimulationService,
  IDriveNavigationService,
} from "@core/interfaces";
import {
  GPSCoordinate,
  GPSStatus,
  Result,
  success,
  failure,
} from "@core/types";
import { OrchestratorError, OrchestratorErrorCode } from "@core/errors";
import { getLogger } from "@utils/logger";
import { OnboardingCoordinator } from "./OnboardingCoordinator";

const logger = getLogger("GPSCoordinator");

/**
 * Coordinates GPS position and status updates.
 *
 * Responsibilities:
 * - Subscribes to GPS service position and status updates
 * - Filters updates (skip during simulation, skip invalid positions)
 * - Forwards updates to onboarding coordinator, drive navigation
 * - Manages callback registration for GPS updates and status changes
 * - Stores latest GPS position and status
 */
export class GPSCoordinator {
  // GPS callback management
  private gpsUpdateCallbacks: Array<(position: GPSCoordinate) => void> = [];
  private gpsStatusCallbacks: Array<(status: GPSStatus) => void> = [];

  // GPS subscription management
  private gpsUnsubscribe: (() => void) | null = null;
  private gpsStatusUnsubscribe: (() => void) | null = null;

  // Latest GPS data
  private lastGPSPosition: GPSCoordinate | null = null;
  private lastGPSStatus: GPSStatus | null = null;

  // Error callback
  private errorCallback: ((error: Error) => void) | null = null;

  constructor(
    private readonly gpsService: IGPSService,
    private readonly simulationService: ITrackSimulationService | null,
    private readonly driveNavigationService: IDriveNavigationService | null,
    private onboardingCoordinator: OnboardingCoordinator | null,
  ) {}

  /**
   * Set the error callback for reporting errors to the orchestrator
   */
  setErrorCallback(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  /**
   * Set the onboarding coordinator reference (for GPS forwarding)
   */
  setOnboardingCoordinator(coordinator: OnboardingCoordinator | null): void {
    this.onboardingCoordinator = coordinator;
  }

  /**
   * Subscribe to GPS position updates from the GPS service
   */
  subscribeToGPSUpdates(): void {
    if (this.gpsUnsubscribe) {
      logger.info("Unsubscribing from existing GPS updates");
      this.gpsUnsubscribe();
    }

    this.gpsUnsubscribe = this.gpsService.onPositionUpdate((position) => {
      // Skip real GPS updates when simulation is running
      // to avoid mixing simulated positions with real (often 0,0) positions
      if (this.simulationService?.isSimulating()) {
        return;
      }

      // Also skip invalid (0,0) positions when drive navigation is active
      // Real GPS without fix sends (0,0) which would corrupt distance calculations
      if (this.driveNavigationService?.isNavigating()) {
        if (
          Math.abs(position.latitude) < 0.001 &&
          Math.abs(position.longitude) < 0.001
        ) {
          logger.debug(
            "Skipping invalid (0,0) GPS position during drive navigation",
          );
          return;
        }
      }

      // Store latest position
      this.lastGPSPosition = position;

      // Forward to onboarding coordinator for select track screen
      if (this.onboardingCoordinator) {
        this.onboardingCoordinator.updateGPSPosition(position);
      }

      // Forward to drive navigation service if navigating
      if (this.driveNavigationService?.isNavigating()) {
        this.driveNavigationService.updatePosition(position);
      }

      // Notify all GPS update callbacks
      this.notifyGPSUpdateCallbacks(position);
    });

    logger.info(
      `Subscribed to GPS position updates (${this.gpsUpdateCallbacks.length} callbacks registered)`,
    );
  }

  /**
   * Subscribe to GPS status changes from the GPS service
   */
  subscribeToGPSStatusChanges(): void {
    if (this.gpsStatusUnsubscribe) {
      logger.info("Unsubscribing from existing GPS status changes");
      this.gpsStatusUnsubscribe();
    }

    this.gpsStatusUnsubscribe = this.gpsService.onStatusChange((status) => {
      // Store latest status
      this.lastGPSStatus = status;

      // Forward to onboarding coordinator for select track screen
      if (this.onboardingCoordinator) {
        this.onboardingCoordinator.updateGPSStatus(status);
      }

      logger.info(
        `GPS status changed: ${status.fixQuality} (${status.satellitesInUse} satellites)`,
      );

      // Notify all GPS status callbacks
      this.notifyGPSStatusCallbacks(status);
    });

    logger.info(
      `Subscribed to GPS status changes (${this.gpsStatusCallbacks.length} callbacks registered)`,
    );
  }

  /**
   * Register a callback for GPS position updates
   */
  onGPSUpdate(callback: (position: GPSCoordinate) => void): () => void {
    this.gpsUpdateCallbacks.push(callback);
    logger.info(
      `GPS update callback registered (total: ${this.gpsUpdateCallbacks.length})`,
    );

    // Return unsubscribe function
    return () => {
      const index = this.gpsUpdateCallbacks.indexOf(callback);
      if (index > -1) {
        this.gpsUpdateCallbacks.splice(index, 1);
        logger.info(
          `GPS update callback unregistered (total: ${this.gpsUpdateCallbacks.length})`,
        );
      }
    };
  }

  /**
   * Register a callback for GPS status changes
   */
  onGPSStatusChange(callback: (status: GPSStatus) => void): () => void {
    this.gpsStatusCallbacks.push(callback);
    logger.info(
      `GPS status callback registered (total: ${this.gpsStatusCallbacks.length})`,
    );

    // Return unsubscribe function
    return () => {
      const index = this.gpsStatusCallbacks.indexOf(callback);
      if (index > -1) {
        this.gpsStatusCallbacks.splice(index, 1);
        logger.info(
          `GPS status callback unregistered (total: ${this.gpsStatusCallbacks.length})`,
        );
      }
    };
  }

  /**
   * Get current GPS position from the GPS service
   */
  async getCurrentPosition(): Promise<Result<GPSCoordinate>> {
    logger.info("Getting current GPS position");
    return await this.gpsService.getCurrentPosition();
  }

  /**
   * Update the position externally (used by simulation)
   * This stores the position, forwards to drive navigation, and notifies all callbacks
   */
  updatePosition(position: GPSCoordinate): void {
    this.lastGPSPosition = position;

    // Forward to drive navigation service if navigating
    if (this.driveNavigationService?.isNavigating()) {
      this.driveNavigationService.updatePosition(position);
    }

    this.notifyGPSUpdateCallbacks(position);
  }

  /**
   * Update the status externally
   * This stores the status and notifies all callbacks
   */
  updateStatus(status: GPSStatus): void {
    this.lastGPSStatus = status;
    this.notifyGPSStatusCallbacks(status);
  }

  /**
   * Get the last known GPS position
   */
  getLastPosition(): GPSCoordinate | null {
    return this.lastGPSPosition;
  }

  /**
   * Get the last known GPS status
   */
  getLastStatus(): GPSStatus | null {
    return this.lastGPSStatus;
  }

  /**
   * Get the number of registered GPS update callbacks
   */
  getGPSUpdateCallbackCount(): number {
    return this.gpsUpdateCallbacks.length;
  }

  /**
   * Get the number of registered GPS status callbacks
   */
  getGPSStatusCallbackCount(): number {
    return this.gpsStatusCallbacks.length;
  }

  /**
   * Dispose of resources and unsubscribe from GPS service
   */
  dispose(): void {
    logger.info("Disposing GPSCoordinator...");

    // Unsubscribe from GPS position updates
    if (this.gpsUnsubscribe) {
      logger.info("Unsubscribing from GPS position updates");
      this.gpsUnsubscribe();
      this.gpsUnsubscribe = null;
    }

    // Unsubscribe from GPS status changes
    if (this.gpsStatusUnsubscribe) {
      logger.info("Unsubscribing from GPS status changes");
      this.gpsStatusUnsubscribe();
      this.gpsStatusUnsubscribe = null;
    }

    // Clear all callbacks
    const totalCallbacks =
      this.gpsUpdateCallbacks.length + this.gpsStatusCallbacks.length;
    logger.info(`Clearing ${totalCallbacks} GPS callbacks`);
    this.gpsUpdateCallbacks = [];
    this.gpsStatusCallbacks = [];

    // Clear stored data
    this.lastGPSPosition = null;
    this.lastGPSStatus = null;

    logger.info("✓ GPSCoordinator disposed");
  }

  /**
   * Notify all GPS update callbacks
   */
  private notifyGPSUpdateCallbacks(position: GPSCoordinate): void {
    this.gpsUpdateCallbacks.forEach((callback) => {
      try {
        callback(position);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Error in GPS update callback: ${errorMsg}`);
        if (this.errorCallback) {
          this.errorCallback(
            error instanceof Error
              ? error
              : new Error("Unknown error in GPS update callback"),
          );
        }
      }
    });
  }

  /**
   * Notify all GPS status callbacks
   */
  private notifyGPSStatusCallbacks(status: GPSStatus): void {
    this.gpsStatusCallbacks.forEach((callback) => {
      try {
        callback(status);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Error in GPS status callback: ${errorMsg}`);
        if (this.errorCallback) {
          this.errorCallback(
            error instanceof Error
              ? error
              : new Error("Unknown error in GPS status callback"),
          );
        }
      }
    });
  }
}
