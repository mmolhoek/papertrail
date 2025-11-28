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
} from "../../core/types";
import { GPSError, GPSErrorCode } from "../../core/errors";

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
      return success(undefined);
    }

    try {
      // Open serial port
      this.port = new SerialPort({
        path: this.config.devicePath,
        baudRate: this.config.baudRate,
        autoOpen: false,
      });

      // Setup line parser for NMEA sentences
      this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

      // Open the port
      await new Promise<void>((resolve, reject) => {
        this.port!.open((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Setup data listener
      this.setupDataListener();

      // Setup error handler
      this.port.on("error", (err) => {
        console.error("GPS serial port error:", err);
      });

      this.isInitialized = true;

      // Initialize status
      this.currentStatus = {
        fixQuality: GPSFixQuality.NO_FIX,
        satellitesInUse: 0,
        hdop: 99.9,
        isTracking: false,
      };

      return success(undefined);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("No such file")) {
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
      return failure(
        new GPSError(
          "GPS not initialized",
          GPSErrorCode.DEVICE_NOT_INITIALIZED,
          false,
        ),
      );
    }

    if (!this.currentPosition) {
      return failure(GPSError.noFix(this.currentStatus?.satellitesInUse || 0));
    }

    return success(this.currentPosition);
  }

  /**
   * Get detailed GPS status
   */
  async getStatus(): Promise<Result<GPSStatus>> {
    if (!this.isInitialized) {
      return failure(
        new GPSError(
          "GPS not initialized",
          GPSErrorCode.DEVICE_NOT_INITIALIZED,
          false,
        ),
      );
    }

    if (!this.currentStatus) {
      return failure(
        new GPSError("GPS status not available", GPSErrorCode.UNKNOWN, true),
      );
    }

    return success(this.currentStatus);
  }

  /**
   * Start continuous GPS tracking
   */
  async startTracking(): Promise<Result<void>> {
    if (!this.isInitialized) {
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

    this.tracking = true;

    if (this.currentStatus) {
      this.currentStatus.isTracking = true;
      this.updateStatus(this.currentStatus);
    }

    return success(undefined);
  }

  /**
   * Stop GPS tracking
   */
  async stopTracking(): Promise<Result<void>> {
    if (!this.tracking) {
      return failure(
        new GPSError("GPS not tracking", GPSErrorCode.NOT_TRACKING, false),
      );
    }

    this.tracking = false;

    if (this.currentStatus) {
      this.currentStatus.isTracking = false;
      this.updateStatus(this.currentStatus);
    }

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
      return failure(
        new GPSError(
          "GPS not initialized",
          GPSErrorCode.DEVICE_NOT_INITIALIZED,
          false,
        ),
      );
    }

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (this.currentPosition) {
        return success(this.currentPosition);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return failure(GPSError.fixTimeout(timeoutMs));
  }

  /**
   * Register a callback for GPS position updates
   */
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

  /**
   * Register a callback for GPS status changes
   */
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
   * Clean up resources and close GPS connection
   */
  async dispose(): Promise<void> {
    this.tracking = false;
    this.positionCallbacks = [];
    this.statusCallbacks = [];

    if (this.port && this.port.isOpen) {
      await new Promise<void>((resolve) => {
        this.port!.close((err) => {
          if (err) console.error("Error closing GPS port:", err);
          resolve();
        });
      });
    }

    this.port = null;
    this.parser = null;
    this.isInitialized = false;
  }

  /**
   * Setup listener for incoming NMEA data
   */
  private setupDataListener(): void {
    if (!this.parser) return;

    this.parser.on("data", (line: string) => {
      this.processNMEASentence(line.trim());
    });
  }

  /**
   * Process a single NMEA sentence
   * TODO: Implement full NMEA parsing
   */
  private processNMEASentence(sentence: string): void {
    if (!sentence.startsWith("$")) return;

    // Example: $GPGGA sentence contains position data
    // Format: $GPGGA,time,lat,N/S,lon,E/W,quality,satellites,hdop,altitude,M,geoid,M,age,station*checksum
    if (sentence.startsWith("$GPGGA") || sentence.startsWith("$GNGGA")) {
      const parts = sentence.split(",");
      if (parts.length < 15) return;

      // Parse fix quality (index 6)
      const fixQuality = parseInt(parts[6]) || 0;

      // Parse number of satellites (index 7)
      const satellitesInUse = parseInt(parts[7]) || 0;

      // Parse HDOP (index 8)
      const hdop = parseFloat(parts[8]) || 99.9;

      // Check if status has changed
      const statusChanged =
        !this.currentStatus ||
        this.currentStatus.fixQuality !== fixQuality ||
        this.currentStatus.satellitesInUse !== satellitesInUse ||
        Math.abs(this.currentStatus.hdop - hdop) > 0.1;

      if (statusChanged) {
        const newStatus: GPSStatus = {
          fixQuality: fixQuality as GPSFixQuality,
          satellitesInUse,
          hdop,
          isTracking: this.tracking,
        };
        this.updateStatus(newStatus);
      }

      // If we have a valid fix, parse position
      if (fixQuality > 0 && parts[2] && parts[4]) {
        // TODO: Parse full position data from GGA sentence
        // For now, create a mock position for testing
        this.updatePosition({
          latitude: 0,
          longitude: 0,
          timestamp: new Date(),
        });
      }
    }

    // Example: $GPGSA sentence contains satellite status
    if (sentence.startsWith("$GPGSA") || sentence.startsWith("$GNGSA")) {
      // TODO: Parse GSA sentence for PDOP, VDOP
    }
  }

  /**
   * Update current position and notify callbacks
   */
  private updatePosition(position: GPSCoordinate): void {
    this.currentPosition = position;

    // Notify all position callbacks
    this.positionCallbacks.forEach((callback) => {
      try {
        callback(position);
      } catch (error) {
        console.error("Error in position callback:", error);
      }
    });
  }

  /**
   * Update current status and notify callbacks
   */
  private updateStatus(status: GPSStatus): void {
    this.currentStatus = status;

    // Notify all status callbacks
    this.statusCallbacks.forEach((callback) => {
      try {
        callback(status);
      } catch (error) {
        console.error("Error in status callback:", error);
      }
    });
  }
}
