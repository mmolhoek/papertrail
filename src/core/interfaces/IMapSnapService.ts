/**
 * Map Snap Service Interface
 *
 * Snaps GPS traces to road networks using OSRM's map matching API.
 * Useful for cleaning recorded tracks by aligning points to actual roads.
 */

import { Result } from "@core/types";
import { GPXTrack } from "@core/types/MapTypes";
import { GPSCoordinate } from "@core/types/GPSTypes";

/**
 * Progress information during snap operation
 */
export interface SnapProgress {
  /** Current phase of the operation */
  phase: "matching" | "complete";
  /** Number of points processed so far */
  processedPoints: number;
  /** Total number of points to process */
  totalPoints: number;
  /** Number of successfully matched segments */
  matchedSegments: number;
}

/**
 * A single snapped point with original and matched coordinates
 */
export interface SnappedPoint {
  /** Matched latitude (snapped to road) */
  latitude: number;
  /** Matched longitude (snapped to road) */
  longitude: number;
  /** Original latitude before snapping */
  originalLatitude: number;
  /** Original longitude before snapping */
  originalLongitude: number;
  /** Match confidence (0-1, higher is better) */
  confidence: number;
  /** Name of the road this point was snapped to */
  roadName?: string;
  /** Distance from original point to snapped point in meters */
  distance: number;
}

/**
 * Result of a snap operation
 */
export interface SnapResult {
  /** Array of snapped points with metadata */
  snappedPoints: SnappedPoint[];
  /** Full matched geometry as [latitude, longitude] pairs */
  geometry: [number, number][];
  /** Total distance of matched path in meters */
  matchedDistance: number;
  /** Average confidence across all matched points (0-1) */
  averageConfidence: number;
  /** Number of points that could not be matched */
  unmatchedCount: number;
}

/**
 * Service for snapping GPS traces to road networks
 */
export interface IMapSnapService {
  /**
   * Initialize the service
   */
  initialize(): Promise<Result<void>>;

  /**
   * Dispose of service resources
   */
  dispose(): Promise<void>;

  /**
   * Snap a GPX track to the road network
   * @param track - The GPX track to snap
   * @param profile - Routing profile to use (car, bike, foot)
   * @param onProgress - Optional callback for progress updates
   * @returns The snapped result with matched geometry
   */
  snapTrack(
    track: GPXTrack,
    profile?: "car" | "bike" | "foot",
    onProgress?: (progress: SnapProgress) => void,
  ): Promise<Result<SnapResult>>;

  /**
   * Snap an array of GPS coordinates to the road network
   * @param points - Array of coordinates to snap
   * @param profile - Routing profile to use (car, bike, foot)
   * @param onProgress - Optional callback for progress updates
   * @returns The snapped result with matched geometry
   */
  snapPoints(
    points: GPSCoordinate[],
    profile?: "car" | "bike" | "foot",
    onProgress?: (progress: SnapProgress) => void,
  ): Promise<Result<SnapResult>>;
}
