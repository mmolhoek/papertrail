import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
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
import { NMEAParser } from "./NMEAParser";

const logger = getLogger("GPSService");

/**
 * GPS Service Implementation
 *
 * Reads NMEA sentences from the GPS hardware via serial port
 * and provides current position and status information.
 */
export class GPSService implements IGPSService {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private isInitialized: boolean = false;
  private tracking: boolean = false;

  private currentPosition: GPSCoordinate | null = null;
  private currentStatus: GPSStatus | null = null;

  private positionCallbacks: Array<(position: GPSCoordinate) => void> = [];
  private statusCallbacks: Array<(status: GPSStatus) => void> = [];

  private nmeaParser: NMEAParser = new NMEAParser();

  constructor(
    private readonly config: GPSConfig = {
      devicePath: "/dev/ttyAMA0",
      baudRate: 9600,
      updateInterval: 1000,
      minAccuracy: 10,
    },
  ) {}

  /**
   * Initialize the GPS hardware connection
   */
  async initialize(): Promise<Result<void>> {
    if (this.isInitialized) {
      logger.info("GPS already initialized");
      return success(undefined);
    }

    logger.info("Initializing GPS service...");
    logger.info(
      `GPS config: device=${this.config.devicePath}, baudRate=${this.config.baudRate}, updateInterval=${this.config.updateInterval}ms`,
    );

    try {
      // Open serial port
      logger.info(`Opening GPS serial port: ${this.config.devicePath}`);
      this.port = new SerialPort({
        path: this.config.devicePath,
        baudRate: this.config.baudRate,
        autoOpen: false,
      });

      // Setup line parser for NMEA sentences
      logger.info("Setting up NMEA sentence parser");
      this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

      // Open the port
      logger.info("Opening serial port connection...");
      await new Promise<void>((resolve, reject) => {
        this.port!.open((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      logger.info("✓ Serial port opened successfully");

      // Setup data listener
      logger.info("Setting up GPS data listener");
      this.setupDataListener();

      // Setup error handler
      this.port.on("error", (err) => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`GPS serial port error: ${errorMsg}`);
      });

      this.isInitialized = true;

      // Initialize status
      this.currentStatus = {
        fixQuality: GPSFixQuality.NO_FIX,
        satellitesInUse: 0,
        hdop: 99.9,
        isTracking: false,
      };
      logger.info("✓ GPS status initialized: NO_FIX, 0 satellites");

      logger.info("✓ GPS service initialization complete");
      return success(undefined);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`GPS initialization failed: ${errorMsg}`);
      if (error instanceof Error) {
        if (error.message.includes("No such file")) {
          logger.error(`GPS device not found at ${this.config.devicePath}`);
          return failure(GPSError.deviceNotFound(this.config.devicePath));
        }
        return failure(GPSError.readFailed(error));
      }
      return failure(GPSError.readFailed(new Error("Unknown error")));
    }
  }

  /**
   * Get the current GPS position
   */
  async getCurrentPosition(): Promise<Result<GPSCoordinate>> {
    if (!this.isInitialized) {
      logger.warn("Cannot get position: GPS not initialized");
      return failure(
        new GPSError(
          "GPS not initialized",
          GPSErrorCode.DEVICE_NOT_INITIALIZED,
          false,
        ),
      );
    }

    if (!this.currentPosition) {
      logger.warn(
        `No GPS fix available (${this.currentStatus?.satellitesInUse || 0} satellites)`,
      );
      return failure(GPSError.noFix(this.currentStatus?.satellitesInUse || 0));
    }

    logger.info(
      `GPS position: ${this.currentPosition.latitude.toFixed(6)}, ${this.currentPosition.longitude.toFixed(6)}`,
    );
    return success(this.currentPosition);
  }

  /**
   * Get detailed GPS status
   */
  async getStatus(): Promise<Result<GPSStatus>> {
    if (!this.isInitialized) {
      logger.warn("Cannot get status: GPS not initialized");
      return failure(
        new GPSError(
          "GPS not initialized",
          GPSErrorCode.DEVICE_NOT_INITIALIZED,
          false,
        ),
      );
    }

    if (!this.currentStatus) {
      logger.warn("GPS status not available");
      return failure(
        new GPSError("GPS status not available", GPSErrorCode.UNKNOWN, true),
      );
    }

    logger.info(
      `GPS status: ${this.currentStatus.fixQuality}, ${this.currentStatus.satellitesInUse} satellites, HDOP: ${this.currentStatus.hdop}, tracking: ${this.currentStatus.isTracking}`,
    );
    return success(this.currentStatus);
  }

  /**
   * Start continuous GPS tracking
   */
  async startTracking(): Promise<Result<void>> {
    if (!this.isInitialized) {
      logger.warn("Cannot start tracking: GPS not initialized");
      return failure(
        new GPSError(
          "GPS not initialized",
          GPSErrorCode.DEVICE_NOT_INITIALIZED,
          false,
        ),
      );
    }

    if (this.tracking) {
      logger.warn("GPS already tracking");
      return failure(
        new GPSError(
          "GPS already tracking",
          GPSErrorCode.ALREADY_TRACKING,
          false,
        ),
      );
    }

    logger.info("Starting GPS tracking");
    this.tracking = true;

    if (this.currentStatus) {
      this.currentStatus.isTracking = true;
      this.updateStatus(this.currentStatus);
    }

    logger.info("✓ GPS tracking started");
    return success(undefined);
  }

  /**
   * Stop GPS tracking
   */
  async stopTracking(): Promise<Result<void>> {
    if (!this.tracking) {
      logger.warn("GPS not tracking");
      return failure(
        new GPSError("GPS not tracking", GPSErrorCode.NOT_TRACKING, false),
      );
    }

    logger.info("Stopping GPS tracking");
    this.tracking = false;

    if (this.currentStatus) {
      this.currentStatus.isTracking = false;
      this.updateStatus(this.currentStatus);
    }

    logger.info("✓ GPS tracking stopped");
    return success(undefined);
  }

  /**
   * Check if GPS is currently tracking
   */
  isTracking(): boolean {
    return this.tracking;
  }

  /**
   * Wait for a GPS fix
   */
  async waitForFix(timeoutMs: number = 30000): Promise<Result<GPSCoordinate>> {
    if (!this.isInitialized) {
      logger.warn("Cannot wait for fix: GPS not initialized");
      return failure(
        new GPSError(
          "GPS not initialized",
          GPSErrorCode.DEVICE_NOT_INITIALIZED,
          false,
        ),
      );
    }

    logger.info(`Waiting for GPS fix (timeout: ${timeoutMs}ms)...`);
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (this.currentPosition) {
        const elapsed = Date.now() - startTime;
        logger.info(
          `✓ GPS fix acquired after ${elapsed}ms: ${this.currentPosition.latitude.toFixed(6)}, ${this.currentPosition.longitude.toFixed(6)}`,
        );
        return success(this.currentPosition);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    logger.warn(`GPS fix timeout after ${timeoutMs}ms`);
    return failure(GPSError.fixTimeout(timeoutMs));
  }

  /**
   * Register a callback for GPS position updates
   */
  onPositionUpdate(callback: (position: GPSCoordinate) => void): () => void {
    this.positionCallbacks.push(callback);
    logger.info(
      `Position update callback registered (total: ${this.positionCallbacks.length})`,
    );

    // Return unsubscribe function
    return () => {
      const index = this.positionCallbacks.indexOf(callback);
      if (index > -1) {
        this.positionCallbacks.splice(index, 1);
        logger.info(
          `Position update callback unregistered (total: ${this.positionCallbacks.length})`,
        );
      }
    };
  }

  /**
   * Register a callback for GPS status changes
   */
  onStatusChange(callback: (status: GPSStatus) => void): () => void {
    this.statusCallbacks.push(callback);
    logger.info(
      `Status change callback registered (total: ${this.statusCallbacks.length})`,
    );

    // Return unsubscribe function
    return () => {
      const index = this.statusCallbacks.indexOf(callback);
      if (index > -1) {
        this.statusCallbacks.splice(index, 1);
        logger.info(
          `Status change callback unregistered (total: ${this.statusCallbacks.length})`,
        );
      }
    };
  }

  /**
   * Clean up resources and close GPS connection
   */
  async dispose(): Promise<void> {
    logger.info("Disposing GPS service...");

    logger.info("Stopping GPS tracking");
    this.tracking = false;

    const totalCallbacks =
      this.positionCallbacks.length + this.statusCallbacks.length;
    logger.info(`Clearing ${totalCallbacks} registered callbacks`);
    this.positionCallbacks = [];
    this.statusCallbacks = [];

    if (this.port && this.port.isOpen) {
      logger.info("Closing GPS serial port");
      await new Promise<void>((resolve) => {
        this.port!.close((err) => {
          if (err) {
            logger.error("Error closing GPS port:", err);
          } else {
            logger.info("✓ GPS serial port closed");
          }
          resolve();
        });
      });
    }

    this.port = null;
    this.parser = null;
    this.isInitialized = false;
    logger.info("✓ GPS service disposed successfully");
  }

  /**
   * Setup listener for incoming NMEA data
   */
  private setupDataListener(): void {
    if (!this.parser) return;

    logger.info("Setting up NMEA data listener for GPS sentences");
    this.parser.on("data", (line: string) => {
      this.processNMEASentence(line.trim());
    });
    logger.info("✓ NMEA data listener configured");
  }

  /**
   * Process a single NMEA sentence using NMEAParser
   */
  private processNMEASentence(sentence: string): void {
    const result = this.nmeaParser.parse(sentence);

    // Update position if new position data was parsed
    if (result.hasNewPosition && result.position) {
      // Only update position if we have a valid fix (fix quality > 0)
      const gga = this.nmeaParser.getLastGGA();
      if (gga && gga.fixQuality > GPSFixQuality.NO_FIX) {
        this.updatePosition(result.position);
      }
    }

    // Update status if new status data was parsed
    if (result.hasNewStatus && Object.keys(result.status).length > 0) {
      const statusChanged = this.hasStatusChanged(result.status);

      if (statusChanged) {
        const newStatus: GPSStatus = {
          fixQuality: result.status.fixQuality ?? GPSFixQuality.NO_FIX,
          satellitesInUse: result.status.satellitesInUse ?? 0,
          hdop: result.status.hdop ?? 99.9,
          vdop: result.status.vdop,
          pdop: result.status.pdop,
          isTracking: this.tracking,
        };
        this.updateStatus(newStatus);
      }
    }
  }

  /**
   * Check if GPS status has changed significantly
   */
  private hasStatusChanged(newStatus: Partial<GPSStatus>): boolean {
    if (!this.currentStatus) {
      return true;
    }

    if (
      newStatus.fixQuality !== undefined &&
      this.currentStatus.fixQuality !== newStatus.fixQuality
    ) {
      return true;
    }

    if (
      newStatus.satellitesInUse !== undefined &&
      this.currentStatus.satellitesInUse !== newStatus.satellitesInUse
    ) {
      return true;
    }

    if (
      newStatus.hdop !== undefined &&
      Math.abs(this.currentStatus.hdop - newStatus.hdop) > 0.1
    ) {
      return true;
    }

    if (
      newStatus.pdop !== undefined &&
      (this.currentStatus.pdop === undefined ||
        Math.abs(this.currentStatus.pdop - newStatus.pdop) > 0.1)
    ) {
      return true;
    }

    if (
      newStatus.vdop !== undefined &&
      (this.currentStatus.vdop === undefined ||
        Math.abs(this.currentStatus.vdop - newStatus.vdop) > 0.1)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Update current position and notify callbacks
   */
  private updatePosition(position: GPSCoordinate): void {
    this.currentPosition = position;
    // logger.info(
    //   `Position updated: ${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`,
    // );

    // Notify all position callbacks
    if (this.positionCallbacks.length > 0) {
      // logger.info(
      //   `Broadcasting position update to ${this.positionCallbacks.length} callback(s)`,
      // );
      this.positionCallbacks.forEach((callback) => {
        try {
          callback(position);
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          logger.error(`Error in position callback: ${errorMsg}`);
        }
      });
    }
  }

  /**
   * Update current status and notify callbacks
   */
  private updateStatus(status: GPSStatus): void {
    this.currentStatus = status;
    logger.info(
      `Status updated: fix=${status.fixQuality}, satellites=${status.satellitesInUse}, HDOP=${status.hdop.toFixed(1)}, tracking=${status.isTracking}`,
    );

    // Notify all status callbacks
    if (this.statusCallbacks.length > 0) {
      logger.info(
        `Broadcasting status update to ${this.statusCallbacks.length} callback(s)`,
      );
      this.statusCallbacks.forEach((callback) => {
        try {
          callback(status);
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          logger.error(`Error in status callback: ${errorMsg}`);
        }
      });
    }
  }
}
