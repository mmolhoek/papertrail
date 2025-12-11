import { BaseError } from "./BaseError";
import { getUserMessage } from "./ErrorMessages";

/**
 * Map-related error codes
 */
export enum MapErrorCode {
  // File errors
  FILE_NOT_FOUND = "MAP_FILE_NOT_FOUND",
  FILE_READ_ERROR = "MAP_FILE_READ_ERROR",
  FILE_TOO_LARGE = "MAP_FILE_TOO_LARGE",
  INVALID_FILE_FORMAT = "MAP_INVALID_FILE_FORMAT",
  // GPX parsing errors
  PARSE_ERROR = "MAP_PARSE_ERROR",
  INVALID_GPX = "MAP_INVALID_GPX",
  NO_TRACKS = "MAP_NO_TRACKS",
  NO_TRACK_POINTS = "MAP_NO_TRACK_POINTS",
  INVALID_COORDINATES = "MAP_INVALID_COORDINATES",
  // Track errors
  TRACK_NOT_FOUND = "MAP_TRACK_NOT_FOUND",
  TRACK_INDEX_OUT_OF_BOUNDS = "MAP_TRACK_INDEX_OUT_OF_BOUNDS",
  EMPTY_TRACK = "MAP_EMPTY_TRACK",
  // Directory errors
  DIRECTORY_NOT_FOUND = "MAP_DIRECTORY_NOT_FOUND",
  DIRECTORY_READ_ERROR = "MAP_DIRECTORY_READ_ERROR",
  NO_GPX_FILES = "MAP_NO_GPX_FILES",
  // Validation errors
  INVALID_BOUNDS = "MAP_INVALID_BOUNDS",
  CALCULATION_ERROR = "MAP_CALCULATION_ERROR",
  // Generic
  UNKNOWN = "MAP_UNKNOWN_ERROR",
}

/**
 * Map Service Error
 */
export class MapError extends BaseError {
  constructor(
    message: string,
    code: MapErrorCode = MapErrorCode.UNKNOWN,
    recoverable: boolean = false,
    context?: Record<string, unknown>,
  ) {
    super(message, code, recoverable, context);
  }

  /**
   * Create error for file not found
   */
  static fileNotFound(filePath: string): MapError {
    return new MapError(
      `GPX file not found: ${filePath}`,
      MapErrorCode.FILE_NOT_FOUND,
      false,
      { filePath },
    );
  }

  /**
   * Create error for invalid GPX format
   */
  static invalidGPX(filePath: string, reason: string): MapError {
    return new MapError(
      `Invalid GPX file: ${reason}`,
      MapErrorCode.INVALID_GPX,
      false,
      { filePath, reason },
    );
  }

  /**
   * Create error for GPX with no tracks
   */
  static noTracks(filePath: string): MapError {
    return new MapError(
      `GPX file contains no tracks: ${filePath}`,
      MapErrorCode.NO_TRACKS,
      false,
      { filePath },
    );
  }

  /**
   * Create error for track with no points
   */
  static noTrackPoints(filePath: string, trackIndex: number): MapError {
    return new MapError(
      `Track ${trackIndex} has no points in ${filePath}`,
      MapErrorCode.NO_TRACK_POINTS,
      false,
      { filePath, trackIndex },
    );
  }

  /**
   * Create error for track not found at index
   */
  static trackNotFound(
    filePath: string,
    trackIndex: number,
    trackCount: number,
  ): MapError {
    return new MapError(
      `Track index ${trackIndex} not found in ${filePath} (has ${trackCount} tracks)`,
      MapErrorCode.TRACK_INDEX_OUT_OF_BOUNDS,
      false,
      { filePath, trackIndex, trackCount },
    );
  }

  /**
   * Create error for GPX parse failure
   */
  static parseError(filePath: string, error: Error): MapError {
    return new MapError(
      `Failed to parse GPX file: ${error.message}`,
      MapErrorCode.PARSE_ERROR,
      false,
      { filePath, originalError: error.message },
    );
  }

  /**
   * Create error for file too large
   */
  static fileTooLarge(
    filePath: string,
    size: number,
    maxSize: number,
  ): MapError {
    return new MapError(
      `GPX file too large: ${size} bytes (max: ${maxSize})`,
      MapErrorCode.FILE_TOO_LARGE,
      false,
      { filePath, size, maxSize },
    );
  }

  /**
   * Create error for directory not found
   */
  static directoryNotFound(directory: string): MapError {
    return new MapError(
      `GPX directory not found: ${directory}`,
      MapErrorCode.DIRECTORY_NOT_FOUND,
      false,
      { directory },
    );
  }

  /**
   * Create error for no GPX files in directory
   */
  static noGPXFiles(directory: string): MapError {
    return new MapError(
      `No GPX files found in directory: ${directory}`,
      MapErrorCode.NO_GPX_FILES,
      false,
      { directory },
    );
  }

  /**
   * Create error for invalid coordinates
   */
  static invalidCoordinates(lat: number, lon: number): MapError {
    return new MapError(
      `Invalid coordinates: lat=${lat}, lon=${lon}`,
      MapErrorCode.INVALID_COORDINATES,
      false,
      { latitude: lat, longitude: lon },
    );
  }

  getUserMessage(): string {
    return getUserMessage(this.code);
  }
}
