import { BaseError } from "./BaseError";

/**
 * GPS-related error codes
 */
export enum GPSErrorCode {
  // Hardware errors
  DEVICE_NOT_FOUND = "GPS_DEVICE_NOT_FOUND",
  DEVICE_OPEN_FAILED = "GPS_DEVICE_OPEN_FAILED",
  DEVICE_READ_FAILED = "GPS_DEVICE_READ_FAILED",
  DEVICE_NOT_INITIALIZED = "GPS_DEVICE_NOT_INITIALIZED",

  // Fix/signal errors
  NO_FIX = "GPS_NO_FIX",
  WEAK_SIGNAL = "GPS_WEAK_SIGNAL",
  FIX_TIMEOUT = "GPS_FIX_TIMEOUT",
  INSUFFICIENT_SATELLITES = "GPS_INSUFFICIENT_SATELLITES",

  // Data errors
  INVALID_DATA = "GPS_INVALID_DATA",
  PARSE_ERROR = "GPS_PARSE_ERROR",
  CHECKSUM_ERROR = "GPS_CHECKSUM_ERROR",

  // State errors
  ALREADY_TRACKING = "GPS_ALREADY_TRACKING",
  NOT_TRACKING = "GPS_NOT_TRACKING",

  // Generic
  UNKNOWN = "GPS_UNKNOWN_ERROR",
}

/**
 * GPS Service Error
 */
export class GPSError extends BaseError {
  constructor(
    message: string,
    code: GPSErrorCode = GPSErrorCode.UNKNOWN,
    recoverable: boolean = false,
    context?: Record<string, unknown>,
  ) {
    super(message, code, recoverable, context);
  }

  /**
   * Create error for device not found
   */
  static deviceNotFound(devicePath: string): GPSError {
    return new GPSError(
      `GPS device not found at ${devicePath}`,
      GPSErrorCode.DEVICE_NOT_FOUND,
      false,
      { devicePath },
    );
  }

  /**
   * Create error for no GPS fix
   */
  static noFix(satellitesInUse: number = 0): GPSError {
    return new GPSError(
      `No GPS fix available (satellites: ${satellitesInUse})`,
      GPSErrorCode.NO_FIX,
      true,
      { satellitesInUse },
    );
  }

  /**
   * Create error for fix timeout
   */
  static fixTimeout(timeoutMs: number): GPSError {
    return new GPSError(
      `GPS fix timeout after ${timeoutMs}ms`,
      GPSErrorCode.FIX_TIMEOUT,
      true,
      { timeoutMs },
    );
  }

  /**
   * Create error for invalid NMEA data
   */
  static invalidData(data: string, reason?: string): GPSError {
    return new GPSError(
      `Invalid GPS data: ${reason || "unknown reason"}`,
      GPSErrorCode.INVALID_DATA,
      true,
      { data: data.substring(0, 100), reason },
    );
  }

  /**
   * Create error for parse failure
   */
  static parseError(sentence: string, error: Error): GPSError {
    return new GPSError(
      `Failed to parse GPS sentence: ${error.message}`,
      GPSErrorCode.PARSE_ERROR,
      true,
      { sentence, originalError: error.message },
    );
  }

  /**
   * Create error for device read failure
   */
  static readFailed(error: Error): GPSError {
    return new GPSError(
      `Failed to read from GPS device: ${error.message}`,
      GPSErrorCode.DEVICE_READ_FAILED,
      true,
      { originalError: error.message },
    );
  }

  getUserMessage(): string {
    switch (this.code) {
      case GPSErrorCode.DEVICE_NOT_FOUND:
        return "GPS device not found. Please check connections.";
      case GPSErrorCode.NO_FIX:
        return "No GPS signal. Please wait for satellite lock.";
      case GPSErrorCode.FIX_TIMEOUT:
        return "GPS is taking longer than expected. Please ensure clear sky view.";
      case GPSErrorCode.WEAK_SIGNAL:
        return "Weak GPS signal. Position may be inaccurate.";
      default:
        return "GPS error occurred. Please try again.";
    }
  }
}
