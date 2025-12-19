import { BaseError } from "./BaseError";

/**
 * Vector map service error codes
 */
export enum VectorMapErrorCode {
  // API errors
  API_UNAVAILABLE = "VECTORMAP_API_UNAVAILABLE",
  API_RATE_LIMITED = "VECTORMAP_API_RATE_LIMITED",
  API_REQUEST_FAILED = "VECTORMAP_API_REQUEST_FAILED",
  API_PARSE_FAILED = "VECTORMAP_API_PARSE_FAILED",

  // Cache errors
  CACHE_READ_FAILED = "VECTORMAP_CACHE_READ_FAILED",
  CACHE_WRITE_FAILED = "VECTORMAP_CACHE_WRITE_FAILED",
  CACHE_NOT_FOUND = "VECTORMAP_CACHE_NOT_FOUND",

  // Service errors
  SERVICE_NOT_INITIALIZED = "VECTORMAP_SERVICE_NOT_INITIALIZED",

  // Generic
  UNKNOWN = "VECTORMAP_UNKNOWN_ERROR",
}

/**
 * Vector Map Service Error
 */
export class VectorMapError extends BaseError {
  constructor(
    message: string,
    code: VectorMapErrorCode = VectorMapErrorCode.UNKNOWN,
    recoverable: boolean = false,
    context?: Record<string, unknown>,
  ) {
    super(message, code, recoverable, context);
  }

  /**
   * Create error for API unavailable
   */
  static apiUnavailable(error?: Error): VectorMapError {
    return new VectorMapError(
      `Overpass API unavailable: ${error?.message || "network error"}`,
      VectorMapErrorCode.API_UNAVAILABLE,
      true,
      { originalError: error?.message },
    );
  }

  /**
   * Create error for API rate limited
   */
  static apiRateLimited(): VectorMapError {
    return new VectorMapError(
      "Overpass API rate limit exceeded. Try again later.",
      VectorMapErrorCode.API_RATE_LIMITED,
      true,
    );
  }

  /**
   * Create error for API request failure
   */
  static apiRequestFailed(reason: string, error?: Error): VectorMapError {
    return new VectorMapError(
      `Overpass API request failed: ${reason}`,
      VectorMapErrorCode.API_REQUEST_FAILED,
      true,
      { reason, originalError: error?.message },
    );
  }

  /**
   * Create error for API parse failure
   */
  static apiParseFailed(reason: string): VectorMapError {
    return new VectorMapError(
      `Failed to parse Overpass API response: ${reason}`,
      VectorMapErrorCode.API_PARSE_FAILED,
      true,
      { reason },
    );
  }

  /**
   * Create error for cache read failure
   */
  static cacheReadFailed(routeId: string, error?: Error): VectorMapError {
    return new VectorMapError(
      `Failed to read road cache for route ${routeId}`,
      VectorMapErrorCode.CACHE_READ_FAILED,
      true,
      { routeId, originalError: error?.message },
    );
  }

  /**
   * Create error for cache write failure
   */
  static cacheWriteFailed(routeId: string, error?: Error): VectorMapError {
    return new VectorMapError(
      `Failed to write road cache for route ${routeId}`,
      VectorMapErrorCode.CACHE_WRITE_FAILED,
      true,
      { routeId, originalError: error?.message },
    );
  }

  /**
   * Create error for cache not found
   */
  static cacheNotFound(routeId: string): VectorMapError {
    return new VectorMapError(
      `Road cache not found for route ${routeId}`,
      VectorMapErrorCode.CACHE_NOT_FOUND,
      true,
      { routeId },
    );
  }

  /**
   * Create error for service not initialized
   */
  static serviceNotInitialized(): VectorMapError {
    return new VectorMapError(
      "Vector map service not initialized",
      VectorMapErrorCode.SERVICE_NOT_INITIALIZED,
      false,
    );
  }
}
