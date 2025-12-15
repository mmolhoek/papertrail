import { BaseError } from "./BaseError";

/**
 * POI service error codes
 */
export enum POIErrorCode {
  // API errors
  API_UNAVAILABLE = "POI_API_UNAVAILABLE",
  API_RATE_LIMITED = "POI_API_RATE_LIMITED",
  API_REQUEST_FAILED = "POI_API_REQUEST_FAILED",
  API_PARSE_FAILED = "POI_API_PARSE_FAILED",

  // Cache errors
  CACHE_READ_FAILED = "POI_CACHE_READ_FAILED",
  CACHE_WRITE_FAILED = "POI_CACHE_WRITE_FAILED",
  CACHE_NOT_FOUND = "POI_CACHE_NOT_FOUND",

  // Service errors
  SERVICE_NOT_INITIALIZED = "POI_SERVICE_NOT_INITIALIZED",

  // Generic
  UNKNOWN = "POI_UNKNOWN_ERROR",
}

/**
 * POI Service Error
 */
export class POIError extends BaseError {
  constructor(
    message: string,
    code: POIErrorCode = POIErrorCode.UNKNOWN,
    recoverable: boolean = false,
    context?: Record<string, unknown>,
  ) {
    super(message, code, recoverable, context);
  }

  /**
   * Create error for API unavailable
   */
  static apiUnavailable(error?: Error): POIError {
    return new POIError(
      `Overpass API unavailable: ${error?.message || "network error"}`,
      POIErrorCode.API_UNAVAILABLE,
      true,
      { originalError: error?.message },
    );
  }

  /**
   * Create error for API rate limited
   */
  static apiRateLimited(): POIError {
    return new POIError(
      "Overpass API rate limit exceeded. Try again later.",
      POIErrorCode.API_RATE_LIMITED,
      true,
    );
  }

  /**
   * Create error for API request failure
   */
  static apiRequestFailed(reason: string, error?: Error): POIError {
    return new POIError(
      `Overpass API request failed: ${reason}`,
      POIErrorCode.API_REQUEST_FAILED,
      true,
      { reason, originalError: error?.message },
    );
  }

  /**
   * Create error for API parse failure
   */
  static apiParseFailed(reason: string): POIError {
    return new POIError(
      `Failed to parse Overpass API response: ${reason}`,
      POIErrorCode.API_PARSE_FAILED,
      true,
      { reason },
    );
  }

  /**
   * Create error for cache read failure
   */
  static cacheReadFailed(routeId: string, error?: Error): POIError {
    return new POIError(
      `Failed to read POI cache for route ${routeId}`,
      POIErrorCode.CACHE_READ_FAILED,
      true,
      { routeId, originalError: error?.message },
    );
  }

  /**
   * Create error for cache write failure
   */
  static cacheWriteFailed(routeId: string, error?: Error): POIError {
    return new POIError(
      `Failed to write POI cache for route ${routeId}`,
      POIErrorCode.CACHE_WRITE_FAILED,
      true,
      { routeId, originalError: error?.message },
    );
  }

  /**
   * Create error for cache not found
   */
  static cacheNotFound(routeId: string): POIError {
    return new POIError(
      `POI cache not found for route ${routeId}`,
      POIErrorCode.CACHE_NOT_FOUND,
      true,
      { routeId },
    );
  }

  /**
   * Create error for service not initialized
   */
  static serviceNotInitialized(): POIError {
    return new POIError(
      "POI service not initialized",
      POIErrorCode.SERVICE_NOT_INITIALIZED,
      false,
    );
  }
}
