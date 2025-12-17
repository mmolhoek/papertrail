import { BaseError } from "./BaseError";

/**
 * Reverse geocoding service error codes
 */
export enum ReverseGeocodingErrorCode {
  // API errors
  API_UNAVAILABLE = "GEOCODING_API_UNAVAILABLE",
  API_RATE_LIMITED = "GEOCODING_API_RATE_LIMITED",
  API_REQUEST_FAILED = "GEOCODING_API_REQUEST_FAILED",
  API_PARSE_FAILED = "GEOCODING_API_PARSE_FAILED",

  // Cache errors
  CACHE_READ_FAILED = "GEOCODING_CACHE_READ_FAILED",
  CACHE_WRITE_FAILED = "GEOCODING_CACHE_WRITE_FAILED",
  CACHE_NOT_FOUND = "GEOCODING_CACHE_NOT_FOUND",

  // Service errors
  SERVICE_NOT_INITIALIZED = "GEOCODING_SERVICE_NOT_INITIALIZED",

  // Generic
  UNKNOWN = "GEOCODING_UNKNOWN_ERROR",
}

/**
 * Reverse Geocoding Service Error
 */
export class ReverseGeocodingError extends BaseError {
  constructor(
    message: string,
    code: ReverseGeocodingErrorCode = ReverseGeocodingErrorCode.UNKNOWN,
    recoverable: boolean = false,
    context?: Record<string, unknown>,
  ) {
    super(message, code, recoverable, context);
  }

  /**
   * Create error for API unavailable
   */
  static apiUnavailable(error?: Error): ReverseGeocodingError {
    return new ReverseGeocodingError(
      `Nominatim API unavailable: ${error?.message || "network error"}`,
      ReverseGeocodingErrorCode.API_UNAVAILABLE,
      true,
      { originalError: error?.message },
    );
  }

  /**
   * Create error for API rate limited
   */
  static apiRateLimited(): ReverseGeocodingError {
    return new ReverseGeocodingError(
      "Nominatim API rate limit exceeded. Try again later.",
      ReverseGeocodingErrorCode.API_RATE_LIMITED,
      true,
    );
  }

  /**
   * Create error for API request failure
   */
  static apiRequestFailed(
    reason: string,
    error?: Error,
  ): ReverseGeocodingError {
    return new ReverseGeocodingError(
      `Nominatim API request failed: ${reason}`,
      ReverseGeocodingErrorCode.API_REQUEST_FAILED,
      true,
      { reason, originalError: error?.message },
    );
  }

  /**
   * Create error for API parse failure
   */
  static apiParseFailed(reason: string): ReverseGeocodingError {
    return new ReverseGeocodingError(
      `Failed to parse Nominatim API response: ${reason}`,
      ReverseGeocodingErrorCode.API_PARSE_FAILED,
      true,
      { reason },
    );
  }

  /**
   * Create error for cache read failure
   */
  static cacheReadFailed(
    routeId: string,
    error?: Error,
  ): ReverseGeocodingError {
    return new ReverseGeocodingError(
      `Failed to read geocoding cache for route ${routeId}`,
      ReverseGeocodingErrorCode.CACHE_READ_FAILED,
      true,
      { routeId, originalError: error?.message },
    );
  }

  /**
   * Create error for cache write failure
   */
  static cacheWriteFailed(
    routeId: string,
    error?: Error,
  ): ReverseGeocodingError {
    return new ReverseGeocodingError(
      `Failed to write geocoding cache for route ${routeId}`,
      ReverseGeocodingErrorCode.CACHE_WRITE_FAILED,
      true,
      { routeId, originalError: error?.message },
    );
  }

  /**
   * Create error for cache not found
   */
  static cacheNotFound(routeId: string): ReverseGeocodingError {
    return new ReverseGeocodingError(
      `Geocoding cache not found for route ${routeId}`,
      ReverseGeocodingErrorCode.CACHE_NOT_FOUND,
      true,
      { routeId },
    );
  }

  /**
   * Create error for service not initialized
   */
  static serviceNotInitialized(): ReverseGeocodingError {
    return new ReverseGeocodingError(
      "Reverse geocoding service not initialized",
      ReverseGeocodingErrorCode.SERVICE_NOT_INITIALIZED,
      false,
    );
  }
}
