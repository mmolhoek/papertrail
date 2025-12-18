import { BaseError } from "./BaseError";

/**
 * Elevation service error codes
 */
export enum ElevationErrorCode {
  // API errors
  API_UNAVAILABLE = "ELEVATION_API_UNAVAILABLE",
  API_RATE_LIMITED = "ELEVATION_API_RATE_LIMITED",
  API_REQUEST_FAILED = "ELEVATION_API_REQUEST_FAILED",
  API_PARSE_FAILED = "ELEVATION_API_PARSE_FAILED",

  // Cache errors
  CACHE_READ_FAILED = "ELEVATION_CACHE_READ_FAILED",
  CACHE_WRITE_FAILED = "ELEVATION_CACHE_WRITE_FAILED",
  CACHE_NOT_FOUND = "ELEVATION_CACHE_NOT_FOUND",

  // Service errors
  SERVICE_NOT_INITIALIZED = "ELEVATION_SERVICE_NOT_INITIALIZED",

  // Generic
  UNKNOWN = "ELEVATION_UNKNOWN_ERROR",
}

/**
 * Elevation Service Error
 */
export class ElevationError extends BaseError {
  constructor(
    message: string,
    code: ElevationErrorCode = ElevationErrorCode.UNKNOWN,
    recoverable: boolean = false,
    context?: Record<string, unknown>,
  ) {
    super(message, code, recoverable, context);
  }

  /**
   * Create error for API unavailable
   */
  static apiUnavailable(error?: Error): ElevationError {
    return new ElevationError(
      `Open-Elevation API unavailable: ${error?.message || "network error"}`,
      ElevationErrorCode.API_UNAVAILABLE,
      true,
      { originalError: error?.message },
    );
  }

  /**
   * Create error for API rate limited
   */
  static apiRateLimited(): ElevationError {
    return new ElevationError(
      "Open-Elevation API rate limit exceeded. Try again later.",
      ElevationErrorCode.API_RATE_LIMITED,
      true,
    );
  }

  /**
   * Create error for API request failure
   */
  static apiRequestFailed(reason: string, error?: Error): ElevationError {
    return new ElevationError(
      `Open-Elevation API request failed: ${reason}`,
      ElevationErrorCode.API_REQUEST_FAILED,
      true,
      { reason, originalError: error?.message },
    );
  }

  /**
   * Create error for API parse failure
   */
  static apiParseFailed(reason: string): ElevationError {
    return new ElevationError(
      `Failed to parse Open-Elevation API response: ${reason}`,
      ElevationErrorCode.API_PARSE_FAILED,
      true,
      { reason },
    );
  }

  /**
   * Create error for cache read failure
   */
  static cacheReadFailed(routeId: string, error?: Error): ElevationError {
    return new ElevationError(
      `Failed to read elevation cache for route ${routeId}`,
      ElevationErrorCode.CACHE_READ_FAILED,
      true,
      { routeId, originalError: error?.message },
    );
  }

  /**
   * Create error for cache write failure
   */
  static cacheWriteFailed(routeId: string, error?: Error): ElevationError {
    return new ElevationError(
      `Failed to write elevation cache for route ${routeId}`,
      ElevationErrorCode.CACHE_WRITE_FAILED,
      true,
      { routeId, originalError: error?.message },
    );
  }

  /**
   * Create error for cache not found
   */
  static cacheNotFound(routeId: string): ElevationError {
    return new ElevationError(
      `Elevation cache not found for route ${routeId}`,
      ElevationErrorCode.CACHE_NOT_FOUND,
      true,
      { routeId },
    );
  }

  /**
   * Create error for service not initialized
   */
  static serviceNotInitialized(): ElevationError {
    return new ElevationError(
      "Elevation service not initialized",
      ElevationErrorCode.SERVICE_NOT_INITIALIZED,
      false,
    );
  }
}
