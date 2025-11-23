import { Result, GPXTrack, GPXFile, GPXFileInfo, Bounds } from '@core/types';

/**
 * Map Service Interface
 * 
 * Responsible for loading, parsing, and managing GPX files.
 * Does not maintain state - uses ConfigService for active track.
 */
export interface IMapService {
  /**
   * Load and parse a GPX file
   * @param filePath Path to the GPX file
   * @returns Result containing parsed GPX file or error
   */
  loadGPXFile(filePath: string): Promise<Result<GPXFile>>;
  
  /**
   * Get a specific track from a GPX file
   * @param filePath Path to the GPX file
   * @param trackIndex Index of the track (default: 0)
   * @returns Result containing the track or error
   */
  getTrack(filePath: string, trackIndex?: number): Promise<Result<GPXTrack>>;
  
  /**
   * List all available GPX files in the configured directory
   * @returns Result containing array of file paths or error
   */
  listAvailableGPXFiles(): Promise<Result<string[]>>;
  
  /**
   * Get detailed information about GPX files
   * @param filePaths Optional array of specific files to get info for
   * @returns Result containing array of file information or error
   */
  getGPXFileInfo(filePaths?: string[]): Promise<Result<GPXFileInfo[]>>;
  
  /**
   * Calculate the bounding box for a track
   * @param track The GPX track
   * @returns Bounds containing min/max coordinates
   */
  calculateBounds(track: GPXTrack): Bounds;
  
  /**
   * Calculate total distance of a track in meters
   * @param track The GPX track
   * @returns Distance in meters
   */
  calculateDistance(track: GPXTrack): number;
  
  /**
   * Calculate elevation gain and loss for a track
   * @param track The GPX track
   * @returns Object with gain and loss in meters
   */
  calculateElevation(track: GPXTrack): {
    gain: number;
    loss: number;
    min: number;
    max: number;
  };
  
  /**
   * Simplify a track by reducing the number of points
   * Uses Douglas-Peucker algorithm
   * @param track The GPX track
   * @param tolerance Tolerance in meters
   * @returns Simplified track
   */
  simplifyTrack(track: GPXTrack, tolerance: number): GPXTrack;
  
  /**
   * Validate a GPX file
   * @param filePath Path to the GPX file
   * @returns Result indicating if file is valid
   */
  validateGPXFile(filePath: string): Promise<Result<boolean>>;
  
  /**
   * Clear any cached GPX data
   */
  clearCache(): void;
}