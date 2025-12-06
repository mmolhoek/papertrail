import { BaseError } from "./BaseError";

/**
 * Drive navigation error codes
 */
export enum DriveErrorCode {
  // Route errors
  ROUTE_NOT_FOUND = "DRIVE_ROUTE_NOT_FOUND",
  ROUTE_SAVE_FAILED = "DRIVE_ROUTE_SAVE_FAILED",
  ROUTE_LOAD_FAILED = "DRIVE_ROUTE_LOAD_FAILED",
  ROUTE_DELETE_FAILED = "DRIVE_ROUTE_DELETE_FAILED",
  ROUTE_INVALID = "DRIVE_ROUTE_INVALID",

  // Navigation errors
  NAVIGATION_NOT_STARTED = "DRIVE_NAVIGATION_NOT_STARTED",
  NAVIGATION_ALREADY_ACTIVE = "DRIVE_NAVIGATION_ALREADY_ACTIVE",
  NO_GPS_POSITION = "DRIVE_NO_GPS_POSITION",

  // Service errors
  SERVICE_NOT_INITIALIZED = "DRIVE_SERVICE_NOT_INITIALIZED",

  // Generic
  UNKNOWN = "DRIVE_UNKNOWN_ERROR",
}

/**
 * Drive Navigation Service Error
 */
export class DriveError extends BaseError {
  constructor(
    message: string,
    code: DriveErrorCode = DriveErrorCode.UNKNOWN,
    recoverable: boolean = false,
    context?: Record<string, unknown>,
  ) {
    super(message, code, recoverable, context);
  }

  /**
   * Create error for route not found
   */
  static routeNotFound(routeId: string): DriveError {
    return new DriveError(
      `Route not found: ${routeId}`,
      DriveErrorCode.ROUTE_NOT_FOUND,
      false,
      { routeId },
    );
  }

  /**
   * Create error for route save failure
   */
  static saveFailed(reason: string, error?: Error): DriveError {
    return new DriveError(
      `Failed to save route: ${reason}`,
      DriveErrorCode.ROUTE_SAVE_FAILED,
      true,
      { reason, originalError: error?.message },
    );
  }

  /**
   * Create error for route load failure
   */
  static loadFailed(routeId: string, error?: Error): DriveError {
    return new DriveError(
      `Failed to load route ${routeId}: ${error?.message || "unknown error"}`,
      DriveErrorCode.ROUTE_LOAD_FAILED,
      true,
      { routeId, originalError: error?.message },
    );
  }

  /**
   * Create error for invalid route data
   */
  static invalidRoute(reason: string): DriveError {
    return new DriveError(
      `Invalid route: ${reason}`,
      DriveErrorCode.ROUTE_INVALID,
      false,
      { reason },
    );
  }

  /**
   * Create error for navigation not started
   */
  static navigationNotStarted(): DriveError {
    return new DriveError(
      "No active navigation",
      DriveErrorCode.NAVIGATION_NOT_STARTED,
      true,
    );
  }

  /**
   * Create error for navigation already active
   */
  static navigationAlreadyActive(): DriveError {
    return new DriveError(
      "Navigation is already active. Stop current navigation first.",
      DriveErrorCode.NAVIGATION_ALREADY_ACTIVE,
      true,
    );
  }

  /**
   * Create error for no GPS position
   */
  static noGPSPosition(): DriveError {
    return new DriveError(
      "No GPS position available for navigation",
      DriveErrorCode.NO_GPS_POSITION,
      true,
    );
  }

  /**
   * Create error for service not initialized
   */
  static serviceNotInitialized(): DriveError {
    return new DriveError(
      "Drive navigation service not initialized",
      DriveErrorCode.SERVICE_NOT_INITIALIZED,
      false,
    );
  }

  getUserMessage(): string {
    switch (this.code) {
      case DriveErrorCode.ROUTE_NOT_FOUND:
        return "Route not found. Please calculate a new route.";
      case DriveErrorCode.ROUTE_INVALID:
        return "Invalid route data. Please calculate a new route.";
      case DriveErrorCode.NAVIGATION_NOT_STARTED:
        return "No navigation is active.";
      case DriveErrorCode.NAVIGATION_ALREADY_ACTIVE:
        return "Navigation is already running. Stop it first.";
      case DriveErrorCode.NO_GPS_POSITION:
        return "Waiting for GPS position...";
      default:
        return "Navigation error occurred. Please try again.";
    }
  }
}
