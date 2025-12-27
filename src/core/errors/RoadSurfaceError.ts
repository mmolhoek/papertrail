import { BaseError } from "./BaseError";

/**
 * Road surface service error codes
 */
export enum RoadSurfaceErrorCode {
  // API errors
  API_UNAVAILABLE = "ROADSURFACE_API_UNAVAILABLE",
  API_RATE_LIMITED = "ROADSURFACE_API_RATE_LIMITED",
  API_REQUEST_FAILED = "ROADSURFACE_API_REQUEST_FAILED",
  API_PARSE_FAILED = "ROADSURFACE_API_PARSE_FAILED",

  // Cache errors
  CACHE_READ_FAILED = "ROADSURFACE_CACHE_READ_FAILED",
  CACHE_WRITE_FAILED = "ROADSURFACE_CACHE_WRITE_FAILED",
  CACHE_NOT_FOUND = "ROADSURFACE_CACHE_NOT_FOUND",

  // Service errors
  SERVICE_NOT_INITIALIZED = "ROADSURFACE_SERVICE_NOT_INITIALIZED",

  // Generic
  UNKNOWN = "ROADSURFACE_UNKNOWN_ERROR",
}

/**
 * Road Surface Service Error
 */
export class RoadSurfaceError extends BaseError {
  constructor(
    message: string,
    code: RoadSurfaceErrorCode = RoadSurfaceErrorCode.UNKNOWN,
    recoverable: boolean = false,
    context?: Record<string, unknown>,
  ) {
    super(message, code, recoverable, context);
  }

  /**
   * Create error for API unavailable
   */
  static apiUnavailable(error?: Error): RoadSurfaceError {
    return new RoadSurfaceError(
      `Overpass API unavailable: ${error?.message || "network error"}`,
      RoadSurfaceErrorCode.API_UNAVAILABLE,
      true,
      { originalError: error?.message },
    );
  }

  /**
   * Create error for API rate limited
   */
  static apiRateLimited(): RoadSurfaceError {
    return new RoadSurfaceError(
      "Overpass API rate limit exceeded. Try again later.",
      RoadSurfaceErrorCode.API_RATE_LIMITED,
      true,
    );
  }

  /**
   * Create error for API request failure
   */
  static apiRequestFailed(reason: string, error?: Error): RoadSurfaceError {
    return new RoadSurfaceError(
      `Overpass API request failed: ${reason}`,
      RoadSurfaceErrorCode.API_REQUEST_FAILED,
      true,
      { reason, originalError: error?.message },
    );
  }

  /**
   * Create error for API parse failure
   */
  static apiParseFailed(reason: string): RoadSurfaceError {
    return new RoadSurfaceError(
      `Failed to parse Overpass API response: ${reason}`,
      RoadSurfaceErrorCode.API_PARSE_FAILED,
      true,
      { reason },
    );
  }

  /**
   * Create error for cache read failure
   */
  static cacheReadFailed(routeId: string, error?: Error): RoadSurfaceError {
    return new RoadSurfaceError(
      `Failed to read road surface cache for route ${routeId}`,
      RoadSurfaceErrorCode.CACHE_READ_FAILED,
      true,
      { routeId, originalError: error?.message },
    );
  }

  /**
   * Create error for cache write failure
   */
  static cacheWriteFailed(routeId: string, error?: Error): RoadSurfaceError {
    return new RoadSurfaceError(
      `Failed to write road surface cache for route ${routeId}`,
      RoadSurfaceErrorCode.CACHE_WRITE_FAILED,
      true,
      { routeId, originalError: error?.message },
    );
  }

  /**
   * Create error for cache not found
   */
  static cacheNotFound(routeId: string): RoadSurfaceError {
    return new RoadSurfaceError(
      `Road surface cache not found for route ${routeId}`,
      RoadSurfaceErrorCode.CACHE_NOT_FOUND,
      true,
      { routeId },
    );
  }

  /**
   * Create error for service not initialized
   */
  static serviceNotInitialized(): RoadSurfaceError {
    return new RoadSurfaceError(
      "Road surface service not initialized",
      RoadSurfaceErrorCode.SERVICE_NOT_INITIALIZED,
      false,
    );
  }
}
