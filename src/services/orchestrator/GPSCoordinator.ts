import {
  IGPSService,
  ITrackSimulationService,
  IDriveNavigationService,
} from "@core/interfaces";
import {
  GPSCoordinate,
  GPSStatus,
  GPSDebounceConfig,
  Result,
} from "@core/types";
import {
  GPS_DEFAULT_DEBOUNCE_MS,
  GPS_DEFAULT_DISTANCE_THRESHOLD_METERS,
} from "@core/constants";
import { getLogger } from "@utils/logger";
import { distanceBetween } from "@utils/geo";
import { OnboardingCoordinator } from "./OnboardingCoordinator";

const logger = getLogger("GPSCoordinator");

/**
 * Coordinates GPS position and status updates.
 *
 * Responsibilities:
 * - Subscribes to GPS service position and status updates
 * - Filters updates (skip during simulation, skip invalid positions)
 * - Debounces callback notifications (time-based and distance-based)
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

  // Debouncing state
  private debounceConfig: GPSDebounceConfig;
  private lastNotificationTime: number = 0;
  private lastNotifiedPosition: GPSCoordinate | null = null;

  // Debounce statistics (for debugging/monitoring)
  private debounceStats = {
    totalUpdates: 0,
    notifiedUpdates: 0,
    skippedByTime: 0,
    skippedByDistance: 0,
    triggeredByDistance: 0,
  };

  // Error callback
  private errorCallback: ((error: Error) => void) | null = null;

  constructor(
    private readonly gpsService: IGPSService,
    private readonly simulationService: ITrackSimulationService | null,
    private readonly driveNavigationService: IDriveNavigationService | null,
    private onboardingCoordinator: OnboardingCoordinator | null,
    debounceConfig?: Partial<GPSDebounceConfig>,
  ) {
    // Initialize debounce configuration with defaults
    this.debounceConfig = {
      enabled: debounceConfig?.enabled ?? true,
      debounceMs: debounceConfig?.debounceMs ?? GPS_DEFAULT_DEBOUNCE_MS,
      distanceThresholdMeters:
        debounceConfig?.distanceThresholdMeters ??
        GPS_DEFAULT_DISTANCE_THRESHOLD_METERS,
    };
    logger.info(
      `GPSCoordinator initialized with debounce config: ${JSON.stringify(this.debounceConfig)}`,
    );
  }

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
   * Get the current debounce configuration.
   */
  getDebounceConfig(): Readonly<GPSDebounceConfig> {
    return { ...this.debounceConfig };
  }

  /**
   * Update the debounce configuration.
   * Only updates specified fields; others retain their current values.
   * @param config - Partial configuration to update
   */
  setDebounceConfig(config: Partial<GPSDebounceConfig>): void {
    const oldConfig = { ...this.debounceConfig };
    if (config.enabled !== undefined) {
      this.debounceConfig.enabled = config.enabled;
    }
    if (config.debounceMs !== undefined) {
      this.debounceConfig.debounceMs = config.debounceMs;
    }
    if (config.distanceThresholdMeters !== undefined) {
      this.debounceConfig.distanceThresholdMeters =
        config.distanceThresholdMeters;
    }
    logger.info(
      `Debounce config updated: ${JSON.stringify(oldConfig)} -> ${JSON.stringify(this.debounceConfig)}`,
    );
  }

  /**
   * Get debounce statistics for monitoring.
   * Useful for debugging and performance tuning.
   */
  getDebounceStats(): Readonly<{
    totalUpdates: number;
    notifiedUpdates: number;
    skippedByTime: number;
    skippedByDistance: number;
    triggeredByDistance: number;
    hitRate: number;
  }> {
    const hitRate =
      this.debounceStats.totalUpdates > 0
        ? this.debounceStats.notifiedUpdates / this.debounceStats.totalUpdates
        : 1;
    return {
      ...this.debounceStats,
      hitRate: Math.round(hitRate * 100) / 100,
    };
  }

  /**
   * Reset debounce statistics counters.
   * Useful for monitoring debounce effectiveness over specific periods.
   */
  resetDebounceStats(): void {
    this.debounceStats = {
      totalUpdates: 0,
      notifiedUpdates: 0,
      skippedByTime: 0,
      skippedByDistance: 0,
      triggeredByDistance: 0,
    };
    logger.info("Debounce statistics reset");
  }

  /**
   * Reset debounce state (position and timing).
   * Forces the next update to be notified regardless of debounce settings.
   * Useful when switching tracks or modes.
   */
  resetDebounceState(): void {
    this.lastNotificationTime = 0;
    this.lastNotifiedPosition = null;
    logger.info("Debounce state reset");
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

    // Reset debounce state
    this.lastNotificationTime = 0;
    this.lastNotifiedPosition = null;

    logger.info("✓ GPSCoordinator disposed");
  }

  /**
   * Check if an update should be notified based on debounce configuration.
   * @param position - The new GPS position
   * @returns true if the update should be notified, false to skip
   */
  private shouldNotifyUpdate(position: GPSCoordinate): boolean {
    // If debouncing is disabled, always notify
    if (!this.debounceConfig.enabled) {
      return true;
    }

    // First update always notifies (no previous position to compare)
    if (!this.lastNotifiedPosition) {
      return true;
    }

    const now = Date.now();
    const timeSinceLastNotification = now - this.lastNotificationTime;

    // Check time-based debounce
    // If debounceMs is 0, time debouncing is disabled (always passes)
    const timeThresholdExceeded =
      this.debounceConfig.debounceMs === 0 ||
      timeSinceLastNotification >= this.debounceConfig.debounceMs;

    // Check distance-based threshold
    // If distanceThresholdMeters is 0, distance throttling is disabled (never triggers early)
    let distanceThresholdExceeded = false;
    if (this.debounceConfig.distanceThresholdMeters > 0) {
      const distance = distanceBetween(this.lastNotifiedPosition, position);
      distanceThresholdExceeded =
        distance >= this.debounceConfig.distanceThresholdMeters;

      if (distanceThresholdExceeded && !timeThresholdExceeded) {
        // Update triggered by significant movement before time threshold
        this.debounceStats.triggeredByDistance++;
        logger.debug(
          `GPS update triggered by distance (${distance.toFixed(1)}m >= ${this.debounceConfig.distanceThresholdMeters}m)`,
        );
      }
    }

    // Notify if time threshold exceeded OR distance threshold exceeded
    return timeThresholdExceeded || distanceThresholdExceeded;
  }

  /**
   * Notify all GPS update callbacks with debouncing.
   * Updates are suppressed unless:
   * - Debounce time has elapsed since last notification, OR
   * - Position has moved more than the distance threshold
   */
  private notifyGPSUpdateCallbacks(position: GPSCoordinate): void {
    this.debounceStats.totalUpdates++;

    // Check if we should notify based on debounce configuration
    if (!this.shouldNotifyUpdate(position)) {
      // Track why we skipped
      const now = Date.now();
      if (
        now - this.lastNotificationTime < this.debounceConfig.debounceMs &&
        this.lastNotifiedPosition
      ) {
        const distance = distanceBetween(this.lastNotifiedPosition, position);
        if (distance < this.debounceConfig.distanceThresholdMeters) {
          this.debounceStats.skippedByDistance++;
        } else {
          this.debounceStats.skippedByTime++;
        }
      }
      return;
    }

    // Update debounce tracking state
    this.lastNotificationTime = Date.now();
    this.lastNotifiedPosition = position;
    this.debounceStats.notifiedUpdates++;

    // Notify all callbacks using optimized for loop (avoids closure allocation)
    const callbacks = this.gpsUpdateCallbacks;
    for (let i = 0; i < callbacks.length; i++) {
      try {
        callbacks[i](position);
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
    }
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
