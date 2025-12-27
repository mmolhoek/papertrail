/**
 * Map Snap Error
 *
 * Custom error class for map snapping operations.
 */

import { BaseError } from "./BaseError";

/**
 * Error codes for map snap operations
 */
export enum MapSnapErrorCode {
  // API errors
  API_UNAVAILABLE = "MAP_SNAP_API_UNAVAILABLE",
  API_RATE_LIMITED = "MAP_SNAP_API_RATE_LIMITED",
  API_REQUEST_FAILED = "MAP_SNAP_API_REQUEST_FAILED",
  API_INVALID_RESPONSE = "MAP_SNAP_API_INVALID_RESPONSE",

  // Matching errors
  NO_MATCH_FOUND = "MAP_SNAP_NO_MATCH_FOUND",
  TOO_FEW_POINTS = "MAP_SNAP_TOO_FEW_POINTS",
  POINTS_TOO_FAR_APART = "MAP_SNAP_POINTS_TOO_FAR_APART",

  // Service errors
  SERVICE_NOT_INITIALIZED = "MAP_SNAP_SERVICE_NOT_INITIALIZED",

  // General errors
  UNKNOWN = "MAP_SNAP_UNKNOWN_ERROR",
}

/**
 * Error class for map snap operations
 */
export class MapSnapError extends BaseError {
  constructor(
    message: string,
    public readonly code: MapSnapErrorCode,
    recoverable: boolean = true,
    context?: Record<string, unknown>,
  ) {
    super(message, code, recoverable, context);
    this.name = "MapSnapError";
  }

  /**
   * OSRM API is unavailable
   */
  static apiUnavailable(error?: Error): MapSnapError {
    return new MapSnapError(
      `OSRM map matching API unavailable: ${error?.message || "network error"}`,
      MapSnapErrorCode.API_UNAVAILABLE,
      true,
      { originalError: error?.message },
    );
  }

  /**
   * API rate limit exceeded
   */
  static apiRateLimited(): MapSnapError {
    return new MapSnapError(
      "OSRM API rate limit exceeded, please try again later",
      MapSnapErrorCode.API_RATE_LIMITED,
      true,
    );
  }

  /**
   * API request failed
   */
  static apiRequestFailed(status: number, message?: string): MapSnapError {
    return new MapSnapError(
      `OSRM API request failed with status ${status}: ${message || "unknown error"}`,
      MapSnapErrorCode.API_REQUEST_FAILED,
      true,
      { status, message },
    );
  }

  /**
   * Invalid response from API
   */
  static apiInvalidResponse(details?: string): MapSnapError {
    return new MapSnapError(
      `Invalid response from OSRM API: ${details || "unexpected format"}`,
      MapSnapErrorCode.API_INVALID_RESPONSE,
      true,
      { details },
    );
  }

  /**
   * No match could be found for the provided points
   */
  static noMatchFound(reason?: string): MapSnapError {
    return new MapSnapError(
      `Could not match GPS trace to road network: ${reason || "points too far from roads"}`,
      MapSnapErrorCode.NO_MATCH_FOUND,
      false,
      { reason },
    );
  }

  /**
   * Too few points provided for matching
   */
  static tooFewPoints(count: number, minimum: number = 2): MapSnapError {
    return new MapSnapError(
      `Too few points for map matching: got ${count}, need at least ${minimum}`,
      MapSnapErrorCode.TOO_FEW_POINTS,
      false,
      { count, minimum },
    );
  }

  /**
   * Points are too far apart for reliable matching
   */
  static pointsTooFarApart(maxGap: number): MapSnapError {
    return new MapSnapError(
      `Points are too far apart for reliable matching (max gap: ${maxGap}m)`,
      MapSnapErrorCode.POINTS_TOO_FAR_APART,
      false,
      { maxGap },
    );
  }

  /**
   * Service not initialized
   */
  static serviceNotInitialized(): MapSnapError {
    return new MapSnapError(
      "Map snap service not initialized",
      MapSnapErrorCode.SERVICE_NOT_INITIALIZED,
      false,
    );
  }

  /**
   * Unknown error
   */
  static unknown(error?: Error): MapSnapError {
    return new MapSnapError(
      `Unknown map snap error: ${error?.message || "no details"}`,
      MapSnapErrorCode.UNKNOWN,
      true,
      { originalError: error?.message },
    );
  }
}
