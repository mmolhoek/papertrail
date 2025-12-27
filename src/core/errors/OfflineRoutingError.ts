import { BaseError } from "./BaseError";

/**
 * Offline routing service error codes
 */
export enum OfflineRoutingErrorCode {
  // Availability errors
  BINDINGS_UNAVAILABLE = "OFFLINE_ROUTING_BINDINGS_UNAVAILABLE",
  NO_REGION_AVAILABLE = "OFFLINE_ROUTING_NO_REGION",
  REGION_NOT_LOADED = "OFFLINE_ROUTING_REGION_NOT_LOADED",
  REGION_NOT_FOUND = "OFFLINE_ROUTING_REGION_NOT_FOUND",

  // Download errors
  DOWNLOAD_FAILED = "OFFLINE_ROUTING_DOWNLOAD_FAILED",
  EXTRACTION_FAILED = "OFFLINE_ROUTING_EXTRACTION_FAILED",
  INSUFFICIENT_STORAGE = "OFFLINE_ROUTING_INSUFFICIENT_STORAGE",
  MANIFEST_FETCH_FAILED = "OFFLINE_ROUTING_MANIFEST_FETCH_FAILED",

  // Routing errors
  ROUTE_CALCULATION_FAILED = "OFFLINE_ROUTING_CALCULATION_FAILED",
  COORDINATES_OUTSIDE_REGION = "OFFLINE_ROUTING_OUTSIDE_REGION",

  // Memory errors
  INSUFFICIENT_MEMORY = "OFFLINE_ROUTING_INSUFFICIENT_MEMORY",
  LOAD_FAILED = "OFFLINE_ROUTING_LOAD_FAILED",

  // Service errors
  SERVICE_NOT_INITIALIZED = "OFFLINE_ROUTING_NOT_INITIALIZED",

  // Generic
  UNKNOWN = "OFFLINE_ROUTING_UNKNOWN_ERROR",
}

/**
 * Offline Routing Service Error
 */
export class OfflineRoutingError extends BaseError {
  constructor(
    message: string,
    code: OfflineRoutingErrorCode = OfflineRoutingErrorCode.UNKNOWN,
    recoverable: boolean = false,
    context?: Record<string, unknown>,
  ) {
    super(message, code, recoverable, context);
  }

  /**
   * Create error for OSRM bindings not available
   */
  static bindingsUnavailable(): OfflineRoutingError {
    return new OfflineRoutingError(
      "OSRM Node.js bindings are not available. Offline routing is disabled.",
      OfflineRoutingErrorCode.BINDINGS_UNAVAILABLE,
      false,
    );
  }

  /**
   * Create error for no region installed
   */
  static noRegionAvailable(): OfflineRoutingError {
    return new OfflineRoutingError(
      "No offline routing regions are installed.",
      OfflineRoutingErrorCode.NO_REGION_AVAILABLE,
      true,
    );
  }

  /**
   * Create error for region not loaded in memory
   */
  static regionNotLoaded(regionId: string): OfflineRoutingError {
    return new OfflineRoutingError(
      `Region "${regionId}" is installed but not loaded in memory.`,
      OfflineRoutingErrorCode.REGION_NOT_LOADED,
      true,
      { regionId },
    );
  }

  /**
   * Create error for region not found
   */
  static regionNotFound(regionId: string): OfflineRoutingError {
    return new OfflineRoutingError(
      `Region "${regionId}" is not installed.`,
      OfflineRoutingErrorCode.REGION_NOT_FOUND,
      true,
      { regionId },
    );
  }

  /**
   * Create error for download failure
   */
  static downloadFailed(regionId: string, error?: Error): OfflineRoutingError {
    return new OfflineRoutingError(
      `Failed to download region "${regionId}": ${error?.message || "unknown error"}`,
      OfflineRoutingErrorCode.DOWNLOAD_FAILED,
      true,
      { regionId, originalError: error?.message },
    );
  }

  /**
   * Create error for extraction failure
   */
  static extractionFailed(
    regionId: string,
    error?: Error,
  ): OfflineRoutingError {
    return new OfflineRoutingError(
      `Failed to extract region "${regionId}": ${error?.message || "unknown error"}`,
      OfflineRoutingErrorCode.EXTRACTION_FAILED,
      true,
      { regionId, originalError: error?.message },
    );
  }

  /**
   * Create error for insufficient storage
   */
  static insufficientStorage(
    required: number,
    available: number,
  ): OfflineRoutingError {
    const requiredMB = Math.ceil(required / 1024 / 1024);
    const availableMB = Math.ceil(available / 1024 / 1024);
    return new OfflineRoutingError(
      `Insufficient storage: ${requiredMB}MB required, ${availableMB}MB available.`,
      OfflineRoutingErrorCode.INSUFFICIENT_STORAGE,
      true,
      { requiredBytes: required, availableBytes: available },
    );
  }

  /**
   * Create error for manifest fetch failure
   */
  static manifestFetchFailed(url: string, error?: Error): OfflineRoutingError {
    return new OfflineRoutingError(
      `Failed to fetch region manifest from ${url}: ${error?.message || "unknown error"}`,
      OfflineRoutingErrorCode.MANIFEST_FETCH_FAILED,
      true,
      { url, originalError: error?.message },
    );
  }

  /**
   * Create error for route calculation failure
   */
  static routeCalculationFailed(
    reason: string,
    error?: Error,
  ): OfflineRoutingError {
    return new OfflineRoutingError(
      `Route calculation failed: ${reason}`,
      OfflineRoutingErrorCode.ROUTE_CALCULATION_FAILED,
      true,
      { reason, originalError: error?.message },
    );
  }

  /**
   * Create error for coordinates outside any region
   */
  static coordinatesOutsideRegion(
    start: { latitude: number; longitude: number },
    end: { latitude: number; longitude: number },
  ): OfflineRoutingError {
    return new OfflineRoutingError(
      "Route coordinates are outside all installed regions.",
      OfflineRoutingErrorCode.COORDINATES_OUTSIDE_REGION,
      true,
      { start, end },
    );
  }

  /**
   * Create error for insufficient memory
   */
  static insufficientMemory(
    required: number,
    available: number,
  ): OfflineRoutingError {
    const requiredMB = Math.ceil(required / 1024 / 1024);
    const availableMB = Math.ceil(available / 1024 / 1024);
    return new OfflineRoutingError(
      `Insufficient memory to load region: ${requiredMB}MB required, ${availableMB}MB available.`,
      OfflineRoutingErrorCode.INSUFFICIENT_MEMORY,
      true,
      { requiredBytes: required, availableBytes: available },
    );
  }

  /**
   * Create error for region load failure
   */
  static loadFailed(regionId: string, error?: Error): OfflineRoutingError {
    return new OfflineRoutingError(
      `Failed to load region "${regionId}": ${error?.message || "unknown error"}`,
      OfflineRoutingErrorCode.LOAD_FAILED,
      true,
      { regionId, originalError: error?.message },
    );
  }

  /**
   * Create error for service not initialized
   */
  static serviceNotInitialized(): OfflineRoutingError {
    return new OfflineRoutingError(
      "Offline routing service not initialized",
      OfflineRoutingErrorCode.SERVICE_NOT_INITIALIZED,
      false,
    );
  }
}
