import { IGPSService } from "@core/interfaces";
import {
  Result,
  GPSCoordinate,
  GPSStatus,
  GPSConfig,
  GPSFixQuality,
  success,
  failure,
} from "@core/types";
import { GPSError, GPSErrorCode } from "@core/errors";
import { getLogger } from "@utils/logger";

const logger = getLogger("MockGPSService");

/**
 * Mock GPS Service for development and testing
 * Simulates GPS operations without requiring actual GPS hardware
 *
 * Provides realistic mock data including:
 * - Position updates with configurable coordinates
 * - GPS fix quality simulation
 * - Satellite count simulation
 * - Callback support for position and status updates
 */
export class MockGPSService implements IGPSService {
  private initialized = false;
  private tracking = false;
  private currentPosition: GPSCoordinate | null = null;
  private currentStatus: GPSStatus;
  private positionCallbacks: Array<(position: GPSCoordinate) => void> = [];
  private statusCallbacks: Array<(status: GPSStatus) => void> = [];
  private updateInterval: NodeJS.Timeout | null = null;

  // Mock GPS position (San Francisco, CA by default)
  private mockLatitude = 37.7749;
  private mockLongitude = -122.4194;
  private positionVariation = 0.0001; // Small variation for realistic movement

  constructor(private readonly config: GPSConfig) {
    logger.info("Mock GPS Service created (for development/testing)");

    // Initialize status
    this.currentStatus = {
      fixQuality: GPSFixQuality.GPS_FIX,
      satellitesInUse: 12,
      hdop: 1.2,
      isTracking: false,
    };
  }

  async initialize(): Promise<Result<void>> {
    if (this.initialized) {
      return success(undefined);
    }

    logger.info("Initializing Mock GPS Service...");
    await this.delay(100);

    this.initialized = true;

    // Set initial position
    this.currentPosition = {
      latitude: this.mockLatitude,
      longitude: this.mockLongitude,
      timestamp: new Date(),
    };

    logger.info("Mock GPS Service initialized");
    logger.info(
      `Mock GPS: Initial position: ${this.mockLatitude}, ${this.mockLongitude}`,
    );

    return success(undefined);
  }

  async dispose(): Promise<void> {
    logger.info("Disposing Mock GPS Service...");

    // Stop tracking if active
    if (this.tracking) {
      await this.stopTracking();
    }

    this.initialized = false;
    this.currentPosition = null;
    this.positionCallbacks = [];
    this.statusCallbacks = [];

    logger.info("Mock GPS Service disposed");
  }

  async getCurrentPosition(): Promise<Result<GPSCoordinate>> {
    if (!this.initialized) {
      return failure(
        new GPSError(
          "GPS not initialized",
          GPSErrorCode.DEVICE_NOT_INITIALIZED,
          false,
        ),
      );
    }

    if (!this.currentPosition) {
      return failure(GPSError.noFix(this.currentStatus.satellitesInUse));
    }

    return success(this.currentPosition);
  }

  async getStatus(): Promise<Result<GPSStatus>> {
    if (!this.initialized) {
      return failure(
        new GPSError(
          "GPS not initialized",
          GPSErrorCode.DEVICE_NOT_INITIALIZED,
          false,
        ),
      );
    }

    return success(this.currentStatus);
  }

  async startTracking(): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(
        new GPSError(
          "GPS not initialized",
          GPSErrorCode.DEVICE_NOT_INITIALIZED,
          false,
        ),
      );
    }

    if (this.tracking) {
      return failure(
        new GPSError(
          "GPS already tracking",
          GPSErrorCode.ALREADY_TRACKING,
          false,
        ),
      );
    }

    logger.info("Mock GPS: Starting tracking...");
    this.tracking = true;

    // Update status
    this.currentStatus = {
      ...this.currentStatus,
      isTracking: true,
    };
    this.notifyStatusChange(this.currentStatus);

    // Start simulating position updates
    this.startPositionUpdates();

    logger.info("Mock GPS: Tracking started");
    return success(undefined);
  }

  async stopTracking(): Promise<Result<void>> {
    if (!this.tracking) {
      return failure(
        new GPSError("GPS not tracking", GPSErrorCode.NOT_TRACKING, false),
      );
    }

    logger.info("Mock GPS: Stopping tracking...");
    this.tracking = false;

    // Stop position updates
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Update status
    this.currentStatus = {
      ...this.currentStatus,
      isTracking: false,
    };
    this.notifyStatusChange(this.currentStatus);

    logger.info("Mock GPS: Tracking stopped");
    return success(undefined);
  }

  isTracking(): boolean {
    return this.tracking;
  }

  async waitForFix(timeoutMs: number = 30000): Promise<Result<GPSCoordinate>> {
    if (!this.initialized) {
      return failure(
        new GPSError(
          "GPS not initialized",
          GPSErrorCode.DEVICE_NOT_INITIALIZED,
          false,
        ),
      );
    }

    logger.info(`Mock GPS: Waiting for fix (timeout: ${timeoutMs}ms)...`);

    // Simulate a short delay to get fix
    await this.delay(500);

    if (this.currentPosition) {
      logger.info("Mock GPS: Fix acquired");
      return success(this.currentPosition);
    }

    return failure(GPSError.fixTimeout(timeoutMs));
  }

  onPositionUpdate(callback: (position: GPSCoordinate) => void): () => void {
    this.positionCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.positionCallbacks.indexOf(callback);
      if (index > -1) {
        this.positionCallbacks.splice(index, 1);
      }
    };
  }

  onStatusChange(callback: (status: GPSStatus) => void): () => void {
    this.statusCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.statusCallbacks.indexOf(callback);
      if (index > -1) {
        this.statusCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Start simulating position updates at the configured interval
   */
  private startPositionUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    const intervalMs = this.config.updateInterval || 1000;
    logger.info(`Mock GPS: Position updates every ${intervalMs}ms`);

    this.updateInterval = setInterval(() => {
      if (this.tracking && this.initialized) {
        this.generateNextPosition();
      }
    }, intervalMs);
  }

  /**
   * Generate a new position with slight variation to simulate movement
   */
  private generateNextPosition(): void {
    if (!this.currentPosition) return;

    // Add small random variation to simulate movement
    const latVariation = (Math.random() - 0.5) * this.positionVariation;
    const lonVariation = (Math.random() - 0.5) * this.positionVariation;

    this.mockLatitude += latVariation;
    this.mockLongitude += lonVariation;

    const newPosition: GPSCoordinate = {
      latitude: this.mockLatitude,
      longitude: this.mockLongitude,
      timestamp: new Date(),
    };

    this.currentPosition = newPosition;

    // Occasionally vary satellite count and HDOP for realism
    if (Math.random() < 0.1) {
      const satellites = 8 + Math.floor(Math.random() * 8); // 8-15 satellites
      const hdop = 0.8 + Math.random() * 1.5; // 0.8-2.3 HDOP

      this.currentStatus = {
        ...this.currentStatus,
        satellitesInUse: satellites,
        hdop: Math.round(hdop * 10) / 10,
      };

      this.notifyStatusChange(this.currentStatus);
    }

    // Notify position callbacks
    this.notifyPositionUpdate(newPosition);
  }

  /**
   * Notify all position callbacks
   */
  private notifyPositionUpdate(position: GPSCoordinate): void {
    for (const callback of this.positionCallbacks) {
      try {
        callback(position);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Error in position callback: ${errorMsg}`);
      }
    }
  }

  /**
   * Notify all status callbacks
   */
  private notifyStatusChange(status: GPSStatus): void {
    for (const callback of this.statusCallbacks) {
      try {
        callback(status);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Error in status callback: ${errorMsg}`);
      }
    }
  }

  /**
   * Simulate async delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Set the mock GPS position
   * Useful for setting position to track start before drive simulation
   */
  setPosition(latitude: number, longitude: number): void {
    logger.info(
      `Mock GPS: Setting position to ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
    );

    this.mockLatitude = latitude;
    this.mockLongitude = longitude;

    this.currentPosition = {
      latitude: this.mockLatitude,
      longitude: this.mockLongitude,
      timestamp: new Date(),
    };

    // Notify callbacks of the new position
    if (this.tracking) {
      this.notifyPositionUpdate(this.currentPosition);
    }
  }

  /**
   * Check if this is a mock GPS service
   */
  isMock(): boolean {
    return true;
  }
}
