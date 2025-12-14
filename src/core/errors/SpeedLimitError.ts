import { BaseError } from "./BaseError";

/**
 * Speed limit service error codes
 */
export enum SpeedLimitErrorCode {
  // API errors
  API_UNAVAILABLE = "SPEEDLIMIT_API_UNAVAILABLE",
  API_RATE_LIMITED = "SPEEDLIMIT_API_RATE_LIMITED",
  API_REQUEST_FAILED = "SPEEDLIMIT_API_REQUEST_FAILED",
  API_PARSE_FAILED = "SPEEDLIMIT_API_PARSE_FAILED",

  // Cache errors
  CACHE_READ_FAILED = "SPEEDLIMIT_CACHE_READ_FAILED",
  CACHE_WRITE_FAILED = "SPEEDLIMIT_CACHE_WRITE_FAILED",
  CACHE_NOT_FOUND = "SPEEDLIMIT_CACHE_NOT_FOUND",

  // Service errors
  SERVICE_NOT_INITIALIZED = "SPEEDLIMIT_SERVICE_NOT_INITIALIZED",

  // Generic
  UNKNOWN = "SPEEDLIMIT_UNKNOWN_ERROR",
}

/**
 * Speed Limit Service Error
 */
export class SpeedLimitError extends BaseError {
  constructor(
    message: string,
    code: SpeedLimitErrorCode = SpeedLimitErrorCode.UNKNOWN,
    recoverable: boolean = false,
    context?: Record<string, unknown>,
  ) {
    super(message, code, recoverable, context);
  }

  /**
   * Create error for API unavailable
   */
  static apiUnavailable(error?: Error): SpeedLimitError {
    return new SpeedLimitError(
      `Overpass API unavailable: ${error?.message || "network error"}`,
      SpeedLimitErrorCode.API_UNAVAILABLE,
      true,
      { originalError: error?.message },
    );
  }

  /**
   * Create error for API rate limited
   */
  static apiRateLimited(): SpeedLimitError {
    return new SpeedLimitError(
      "Overpass API rate limit exceeded. Try again later.",
      SpeedLimitErrorCode.API_RATE_LIMITED,
      true,
    );
  }

  /**
   * Create error for API request failure
   */
  static apiRequestFailed(reason: string, error?: Error): SpeedLimitError {
    return new SpeedLimitError(
      `Overpass API request failed: ${reason}`,
      SpeedLimitErrorCode.API_REQUEST_FAILED,
      true,
      { reason, originalError: error?.message },
    );
  }

  /**
   * Create error for API parse failure
   */
  static apiParseFailed(reason: string): SpeedLimitError {
    return new SpeedLimitError(
      `Failed to parse Overpass API response: ${reason}`,
      SpeedLimitErrorCode.API_PARSE_FAILED,
      true,
      { reason },
    );
  }

  /**
   * Create error for cache read failure
   */
  static cacheReadFailed(routeId: string, error?: Error): SpeedLimitError {
    return new SpeedLimitError(
      `Failed to read speed limit cache for route ${routeId}`,
      SpeedLimitErrorCode.CACHE_READ_FAILED,
      true,
      { routeId, originalError: error?.message },
    );
  }

  /**
   * Create error for cache write failure
   */
  static cacheWriteFailed(routeId: string, error?: Error): SpeedLimitError {
    return new SpeedLimitError(
      `Failed to write speed limit cache for route ${routeId}`,
      SpeedLimitErrorCode.CACHE_WRITE_FAILED,
      true,
      { routeId, originalError: error?.message },
    );
  }

  /**
   * Create error for cache not found
   */
  static cacheNotFound(routeId: string): SpeedLimitError {
    return new SpeedLimitError(
      `Speed limit cache not found for route ${routeId}`,
      SpeedLimitErrorCode.CACHE_NOT_FOUND,
      true,
      { routeId },
    );
  }

  /**
   * Create error for service not initialized
   */
  static serviceNotInitialized(): SpeedLimitError {
    return new SpeedLimitError(
      "Speed limit service not initialized",
      SpeedLimitErrorCode.SERVICE_NOT_INITIALIZED,
      false,
    );
  }
}
