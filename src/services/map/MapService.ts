import * as fs from "fs/promises";
import * as path from "path";
import { parseString } from "xml2js";
import { IMapService } from "@core/interfaces";
import {
  Result,
  GPXTrack,
  GPXFile,
  GPXFileInfo,
  GPXTrackPoint,
  Bounds,
  success,
  failure,
  MapConfig,
} from "@core/types";
import { MapError, MapErrorCode } from "@core/errors";
import { getLogger } from "@utils/logger";
import { haversineDistance } from "@utils/geo";
import { toError } from "@utils/typeGuards";

const logger = getLogger("MapService");

/**
 * Map Service Implementation
 *
 * Manages GPX files: loading, parsing, and providing track information.
 * Calculates distance, elevation, and bounds for tracks.
 */
export class MapService implements IMapService {
  private cache: Map<string, GPXFile> = new Map();

  constructor(
    private readonly config: MapConfig = {
      gpxDirectory: "./data/gpx-files",
      maxFileSize: 10 * 1024 * 1024, // 10 MB
      enableCache: true,
      defaultZoomLevel: 12,
      minZoomLevel: 1,
      maxZoomLevel: 20,
    },
  ) {}

  /**
   * Load and parse a GPX file
   */
  async loadGPXFile(filePath: string): Promise<Result<GPXFile>> {
    try {
      // Check cache first
      if (this.config.enableCache && this.cache.has(filePath)) {
        return success(this.cache.get(filePath)!);
      }

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        return failure(MapError.fileNotFound(filePath));
      }

      // Check file size
      const stats = await fs.stat(filePath);
      if (stats.size > this.config.maxFileSize) {
        return failure(
          MapError.fileTooLarge(filePath, stats.size, this.config.maxFileSize),
        );
      }

      // Read file
      const content = await fs.readFile(filePath, "utf-8");

      // Parse GPX
      const gpxFile = await this.parseGPX(content, filePath);

      // Cache the result
      if (this.config.enableCache) {
        this.cache.set(filePath, gpxFile);
      }

      return success(gpxFile);
    } catch (error) {
      if (error instanceof MapError) {
        return failure(error);
      }
      if (error instanceof Error) {
        return failure(MapError.parseError(filePath, error));
      }
      return failure(MapError.parseError(filePath, new Error("Unknown error")));
    }
  }

  /**
   * Get a specific track from a GPX file
   */
  async getTrack(
    filePath: string,
    trackIndex: number = 0,
  ): Promise<Result<GPXTrack>> {
    const fileResult = await this.loadGPXFile(filePath);
    if (!fileResult.success) {
      return fileResult;
    }

    const gpxFile = fileResult.data;

    if (gpxFile.tracks.length === 0) {
      return failure(MapError.noTracks(filePath));
    }

    if (trackIndex >= gpxFile.tracks.length) {
      return failure(
        MapError.trackNotFound(filePath, trackIndex, gpxFile.tracks.length),
      );
    }

    const track = gpxFile.tracks[trackIndex];

    // Check if track has points
    const hasPoints = track.segments.some(
      (segment) => segment.points.length > 0,
    );
    if (!hasPoints) {
      return failure(MapError.noTrackPoints(filePath, trackIndex));
    }

    return success(track);
  }

  /**
   * List all available GPX files in the configured directory
   */
  async listAvailableGPXFiles(): Promise<Result<string[]>> {
    try {
      // Check if directory exists
      try {
        await fs.access(this.config.gpxDirectory);
      } catch {
        return failure(MapError.directoryNotFound(this.config.gpxDirectory));
      }

      // Read directory
      const files = await fs.readdir(this.config.gpxDirectory);

      // Filter for .gpx files
      const gpxFiles = files
        .filter((file) => file.toLowerCase().endsWith(".gpx"))
        .map((file) => path.join(this.config.gpxDirectory, file));

      if (gpxFiles.length === 0) {
        return failure(MapError.noGPXFiles(this.config.gpxDirectory));
      }

      return success(gpxFiles);
    } catch (error) {
      if (error instanceof Error) {
        return failure(
          new MapError(
            `Failed to list GPX files: ${error.message}`,
            MapErrorCode.DIRECTORY_READ_ERROR,
            false,
            { directory: this.config.gpxDirectory },
          ),
        );
      }
      return failure(
        new MapError(
          "Failed to list GPX files",
          MapErrorCode.DIRECTORY_READ_ERROR,
          false,
        ),
      );
    }
  }

  /**
   * Get detailed information about GPX files
   */
  async getGPXFileInfo(filePaths?: string[]): Promise<Result<GPXFileInfo[]>> {
    try {
      let files = filePaths;

      // If no paths provided, get all files
      if (!files) {
        const listResult = await this.listAvailableGPXFiles();
        if (!listResult.success) {
          return listResult;
        }
        files = listResult.data;
      }

      const infos: GPXFileInfo[] = [];

      for (const filePath of files) {
        try {
          const stats = await fs.stat(filePath);
          const fileResult = await this.loadGPXFile(filePath);

          if (fileResult.success) {
            const gpxFile = fileResult.data;
            let totalPoints = 0;
            let totalDistance = 0;

            gpxFile.tracks.forEach((track) => {
              track.segments.forEach((segment) => {
                totalPoints += segment.points.length;
              });
              // Calculate distance for each track
              totalDistance += this.calculateDistance(track);
            });

            infos.push({
              path: filePath,
              fileName: path.basename(filePath),
              trackName: gpxFile.tracks[0]?.name,
              trackCount: gpxFile.tracks.length,
              pointCount: totalPoints,
              totalDistance: totalDistance,
              fileSize: stats.size,
              lastModified: stats.mtime,
              createdAt: gpxFile.metadata?.time,
            });
          }
        } catch (error) {
          // Skip files that can't be read
          logger.warn(`Failed to get info for ${filePath}:`, error);
        }
      }

      return success(infos);
    } catch (error) {
      if (error instanceof Error) {
        return failure(
          new MapError(
            `Failed to get file info: ${error.message}`,
            MapErrorCode.UNKNOWN,
            false,
          ),
        );
      }
      return failure(
        new MapError("Failed to get file info", MapErrorCode.UNKNOWN, false),
      );
    }
  }

  /**
   * Calculate the bounding box for a track
   */
  calculateBounds(track: GPXTrack): Bounds {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;

    track.segments.forEach((segment) => {
      segment.points.forEach((point) => {
        minLat = Math.min(minLat, point.latitude);
        maxLat = Math.max(maxLat, point.latitude);
        minLon = Math.min(minLon, point.longitude);
        maxLon = Math.max(maxLon, point.longitude);
      });
    });

    return { minLat, maxLat, minLon, maxLon };
  }

  /**
   * Calculate total distance of a track in meters
   */
  calculateDistance(track: GPXTrack): number {
    let totalDistance = 0;

    track.segments.forEach((segment) => {
      for (let i = 1; i < segment.points.length; i++) {
        const p1 = segment.points[i - 1];
        const p2 = segment.points[i];
        totalDistance += haversineDistance(
          p1.latitude,
          p1.longitude,
          p2.latitude,
          p2.longitude,
        );
      }
    });

    return totalDistance;
  }

  /**
   * Calculate elevation gain and loss for a track
   */
  calculateElevation(track: GPXTrack): {
    gain: number;
    loss: number;
    min: number;
    max: number;
  } {
    let gain = 0;
    let loss = 0;
    let min = Infinity;
    let max = -Infinity;

    track.segments.forEach((segment) => {
      for (let i = 0; i < segment.points.length; i++) {
        const point = segment.points[i];

        if (point.altitude !== undefined) {
          min = Math.min(min, point.altitude);
          max = Math.max(max, point.altitude);

          if (i > 0 && segment.points[i - 1].altitude !== undefined) {
            const elevDiff = point.altitude - segment.points[i - 1].altitude!;
            if (elevDiff > 0) {
              gain += elevDiff;
            } else {
              loss += Math.abs(elevDiff);
            }
          }
        }
      }
    });

    // Handle case where no elevation data exists
    if (min === Infinity) min = 0;
    if (max === -Infinity) max = 0;

    return { gain, loss, min, max };
  }

  /**
   * Simplify a track using Douglas-Peucker algorithm
   */
  simplifyTrack(track: GPXTrack, tolerance: number): GPXTrack {
    const simplifiedSegments = track.segments.map((segment) => ({
      points: this.douglasPeucker(segment.points, tolerance),
    }));

    return {
      ...track,
      segments: simplifiedSegments,
    };
  }

  /**
   * Validate a GPX file
   */
  async validateGPXFile(filePath: string): Promise<Result<boolean>> {
    const result = await this.loadGPXFile(filePath);

    if (!result.success) {
      return result;
    }

    const gpxFile = result.data;

    // Check if there's at least one track
    if (gpxFile.tracks.length === 0) {
      return failure(MapError.noTracks(filePath));
    }

    // Check if tracks have points
    const hasPoints = gpxFile.tracks.some((track) =>
      track.segments.some((segment) => segment.points.length > 0),
    );

    if (!hasPoints) {
      return failure(MapError.noTrackPoints(filePath, 0));
    }

    return success(true);
  }

  /**
   * Clear any cached GPX data
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Parse GPX XML content
   */
  private async parseGPX(content: string, filePath: string): Promise<GPXFile> {
    return new Promise((resolve, reject) => {
      parseString(content, { explicitArray: false }, (err, result) => {
        if (err) {
          reject(MapError.parseError(filePath, err));
          return;
        }

        try {
          const gpx = result.gpx;
          if (!gpx) {
            reject(MapError.invalidGPX(filePath, "Missing gpx root element"));
            return;
          }

          // Parse tracks
          const tracks: GPXTrack[] = [];
          const trkArray = Array.isArray(gpx.trk)
            ? gpx.trk
            : gpx.trk
              ? [gpx.trk]
              : [];

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          trkArray.forEach((trk: any) => {
            const segments = this.parseTrackSegments(trk);

            tracks.push({
              name: trk.name || "Unnamed Track",
              description: trk.desc,
              type: trk.type,
              segments,
            });
          });

          const gpxFile: GPXFile = {
            tracks,
            metadata: gpx.metadata
              ? {
                  name: gpx.metadata.name,
                  description: gpx.metadata.desc,
                  time: gpx.metadata.time
                    ? new Date(gpx.metadata.time)
                    : undefined,
                }
              : undefined,
          };

          resolve(gpxFile);
        } catch (error) {
          reject(MapError.parseError(filePath, toError(error)));
        }
      });
    });
  }

  /**
   * Parse track segments from GPX track
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseTrackSegments(trk: any): Array<{ points: GPXTrackPoint[] }> {
    const segments: Array<{ points: GPXTrackPoint[] }> = [];
    const trksegArray = Array.isArray(trk.trkseg)
      ? trk.trkseg
      : trk.trkseg
        ? [trk.trkseg]
        : [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trksegArray.forEach((trkseg: any) => {
      const points: GPXTrackPoint[] = [];
      const trkptArray = Array.isArray(trkseg.trkpt)
        ? trkseg.trkpt
        : trkseg.trkpt
          ? [trkseg.trkpt]
          : [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      trkptArray.forEach((trkpt: any) => {
        const lat = parseFloat(trkpt.$.lat);
        const lon = parseFloat(trkpt.$.lon);

        if (isNaN(lat) || isNaN(lon)) {
          return; // Skip invalid coordinates
        }

        points.push({
          latitude: lat,
          longitude: lon,
          altitude: trkpt.ele ? parseFloat(trkpt.ele) : undefined,
          timestamp: trkpt.time ? new Date(trkpt.time) : new Date(),
        });
      });

      if (points.length > 0) {
        segments.push({ points });
      }
    });

    return segments;
  }

  /**
   * Douglas-Peucker algorithm for line simplification
   */
  private douglasPeucker(
    points: GPXTrackPoint[],
    tolerance: number,
  ): GPXTrackPoint[] {
    if (points.length <= 2) {
      return points;
    }

    // Find the point with maximum distance
    let maxDistance = 0;
    let maxIndex = 0;

    for (let i = 1; i < points.length - 1; i++) {
      const distance = this.perpendicularDistance(
        points[i],
        points[0],
        points[points.length - 1],
      );

      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    // If max distance is greater than tolerance, recursively simplify
    if (maxDistance > tolerance) {
      const left = this.douglasPeucker(
        points.slice(0, maxIndex + 1),
        tolerance,
      );
      const right = this.douglasPeucker(points.slice(maxIndex), tolerance);

      return [...left.slice(0, -1), ...right];
    } else {
      return [points[0], points[points.length - 1]];
    }
  }

  /**
   * Calculate perpendicular distance from point to line
   */
  private perpendicularDistance(
    point: GPXTrackPoint,
    lineStart: GPXTrackPoint,
    lineEnd: GPXTrackPoint,
  ): number {
    // Convert to meters using Haversine for better accuracy
    const d1 = haversineDistance(
      point.latitude,
      point.longitude,
      lineStart.latitude,
      lineStart.longitude,
    );
    const d2 = haversineDistance(
      point.latitude,
      point.longitude,
      lineEnd.latitude,
      lineEnd.longitude,
    );
    const d3 = haversineDistance(
      lineStart.latitude,
      lineStart.longitude,
      lineEnd.latitude,
      lineEnd.longitude,
    );

    // Use formula for distance from point to line
    if (d3 === 0) return d1;

    const s = (d1 + d2 + d3) / 2;
    const area = Math.sqrt(s * (s - d1) * (s - d2) * (s - d3));

    return (2 * area) / d3;
  }
}
