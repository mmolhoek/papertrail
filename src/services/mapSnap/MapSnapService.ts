/**
 * Map Snap Service
 *
 * Snaps GPS traces to road networks using OSRM's map matching API.
 */

import {
  IMapSnapService,
  SnapProgress,
  SnapResult,
  SnappedPoint,
} from "@core/interfaces/IMapSnapService";
import { Result, success, failure } from "@core/types";
import { GPXTrack } from "@core/types/MapTypes";
import { GPSCoordinate } from "@core/types/GPSTypes";
import { MapSnapError } from "@core/errors/MapSnapError";
import { getLogger } from "@utils/logger";
import { haversineDistance } from "@utils/geo";

const logger = getLogger("MapSnapService");

/** Rate limit delay between API requests (ms) */
const RATE_LIMIT_DELAY = 1100;

/** Maximum points per API request */
const MAX_POINTS_PER_REQUEST = 100;

/** Overlap between batches for continuity */
const BATCH_OVERLAP = 2;

/** Default search radius for matching (meters) */
const DEFAULT_RADIUS = 25;

/** OSRM server map by profile */
const OSRM_SERVERS: Record<string, string> = {
  car: "routing.openstreetmap.de/routed-car",
  bike: "routing.openstreetmap.de/routed-bike",
  foot: "routing.openstreetmap.de/routed-foot",
};

/**
 * OSRM match API response structure
 */
interface OSRMMatchResponse {
  code: string;
  matchings?: Array<{
    geometry: {
      type: string;
      coordinates: [number, number][];
    };
    distance: number;
    duration: number;
    confidence: number;
  }>;
  tracepoints: Array<{
    location: [number, number];
    name: string;
    matchings_index: number;
    waypoint_index: number;
  } | null>;
}

export class MapSnapService implements IMapSnapService {
  private isInitialized = false;
  private lastRequestTime = 0;

  async initialize(): Promise<Result<void>> {
    if (this.isInitialized) {
      return success(undefined);
    }

    logger.info("Initializing MapSnapService");
    this.isInitialized = true;
    return success(undefined);
  }

  async dispose(): Promise<void> {
    logger.info("Disposing MapSnapService");
    this.isInitialized = false;
  }

  async snapTrack(
    track: GPXTrack,
    profile: "car" | "bike" | "foot" = "car",
    onProgress?: (progress: SnapProgress) => void,
  ): Promise<Result<SnapResult>> {
    // Extract all points from track segments
    const points: GPSCoordinate[] = [];
    for (const segment of track.segments) {
      for (const point of segment.points) {
        points.push({
          latitude: point.latitude,
          longitude: point.longitude,
          timestamp: point.timestamp,
          altitude: point.altitude,
        });
      }
    }

    return this.snapPoints(points, profile, onProgress);
  }

  async snapPoints(
    points: GPSCoordinate[],
    profile: "car" | "bike" | "foot" = "car",
    onProgress?: (progress: SnapProgress) => void,
  ): Promise<Result<SnapResult>> {
    if (!this.isInitialized) {
      return failure(MapSnapError.serviceNotInitialized());
    }

    if (points.length < 2) {
      return failure(MapSnapError.tooFewPoints(points.length, 2));
    }

    logger.info(`Snapping ${points.length} points using ${profile} profile`);

    const allSnappedPoints: SnappedPoint[] = [];
    const allGeometry: [number, number][] = [];
    let totalDistance = 0;
    let matchedSegments = 0;
    let unmatchedCount = 0;

    // Split points into batches
    const batches = this.createBatches(points);
    let processedPoints = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      // Rate limiting
      await this.waitForRateLimit();

      // Call OSRM match API
      const result = await this.matchBatch(batch, profile);

      if (!result.success) {
        // If a batch fails, we can continue with others
        logger.warn(
          `Batch ${i + 1}/${batches.length} failed: ${result.error.message}`,
        );
        unmatchedCount += batch.length;
        processedPoints += batch.length;

        if (onProgress) {
          onProgress({
            phase: "matching",
            processedPoints,
            totalPoints: points.length,
            matchedSegments,
          });
        }
        continue;
      }

      const { snappedPoints, geometry, distance, unmatched } = result.data;

      // Merge results, avoiding duplicates from overlap
      const startIndex = i > 0 ? BATCH_OVERLAP : 0;
      for (let j = startIndex; j < snappedPoints.length; j++) {
        allSnappedPoints.push(snappedPoints[j]);
      }

      // Merge geometry, avoiding duplicates
      if (allGeometry.length > 0 && geometry.length > 0) {
        // Skip first point if it's close to the last point (overlap)
        const lastPoint = allGeometry[allGeometry.length - 1];
        const firstNewPoint = geometry[0];
        const dist = haversineDistance(
          lastPoint[0],
          lastPoint[1],
          firstNewPoint[0],
          firstNewPoint[1],
        );
        if (dist < 10) {
          geometry.shift();
        }
      }
      allGeometry.push(...geometry);

      totalDistance += distance;
      matchedSegments++;
      unmatchedCount += unmatched;
      processedPoints += batch.length - (i > 0 ? BATCH_OVERLAP : 0);

      if (onProgress) {
        onProgress({
          phase: "matching",
          processedPoints: Math.min(processedPoints, points.length),
          totalPoints: points.length,
          matchedSegments,
        });
      }
    }

    if (allSnappedPoints.length === 0) {
      return failure(MapSnapError.noMatchFound("All batches failed to match"));
    }

    // Calculate average confidence
    const totalConfidence = allSnappedPoints.reduce(
      (sum, p) => sum + p.confidence,
      0,
    );
    const averageConfidence =
      allSnappedPoints.length > 0
        ? totalConfidence / allSnappedPoints.length
        : 0;

    if (onProgress) {
      onProgress({
        phase: "complete",
        processedPoints: points.length,
        totalPoints: points.length,
        matchedSegments,
      });
    }

    logger.info(
      `Snapped ${allSnappedPoints.length} points, ${unmatchedCount} unmatched, avg confidence: ${averageConfidence.toFixed(2)}`,
    );

    return success({
      snappedPoints: allSnappedPoints,
      geometry: allGeometry,
      matchedDistance: totalDistance,
      averageConfidence,
      unmatchedCount,
    });
  }

  /**
   * Create batches of points for API requests
   */
  private createBatches(points: GPSCoordinate[]): GPSCoordinate[][] {
    const batches: GPSCoordinate[][] = [];
    let start = 0;

    while (start < points.length) {
      const end = Math.min(start + MAX_POINTS_PER_REQUEST, points.length);
      batches.push(points.slice(start, end));

      // Next batch starts with overlap for continuity
      start = end - BATCH_OVERLAP;
      if (start >= points.length - BATCH_OVERLAP) {
        break;
      }
    }

    return batches;
  }

  /**
   * Wait for rate limit if needed
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
      const waitTime = RATE_LIMIT_DELAY - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Match a batch of points using OSRM API
   */
  private async matchBatch(
    points: GPSCoordinate[],
    profile: string,
  ): Promise<
    Result<{
      snappedPoints: SnappedPoint[];
      geometry: [number, number][];
      distance: number;
      unmatched: number;
    }>
  > {
    const server = OSRM_SERVERS[profile] || OSRM_SERVERS.car;

    // Build coordinates string (lon,lat;lon,lat;...)
    const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(";");

    // Build radiuses string (same radius for all points)
    const radiuses = points.map(() => DEFAULT_RADIUS).join(";");

    const url = `https://${server}/match/v1/driving/${coords}?geometries=geojson&overview=full&radiuses=${radiuses}`;

    try {
      const response = await fetch(url);

      if (response.status === 429) {
        return failure(MapSnapError.apiRateLimited());
      }

      if (!response.ok) {
        return failure(
          MapSnapError.apiRequestFailed(response.status, response.statusText),
        );
      }

      const data = (await response.json()) as OSRMMatchResponse;

      if (data.code !== "Ok") {
        if (data.code === "NoMatch") {
          return failure(
            MapSnapError.noMatchFound("OSRM could not find a match"),
          );
        }
        return failure(MapSnapError.apiInvalidResponse(data.code));
      }

      if (!data.matchings || data.matchings.length === 0) {
        return failure(MapSnapError.noMatchFound("No matchings in response"));
      }

      // Process tracepoints
      const snappedPoints: SnappedPoint[] = [];
      let unmatched = 0;

      for (let i = 0; i < data.tracepoints.length; i++) {
        const tp = data.tracepoints[i];
        const original = points[i];

        if (tp === null) {
          // Point could not be matched
          unmatched++;
          continue;
        }

        const snappedLat = tp.location[1];
        const snappedLon = tp.location[0];
        const distance = haversineDistance(
          original.latitude,
          original.longitude,
          snappedLat,
          snappedLon,
        );

        // Get confidence from the matching this point belongs to
        const matchingIndex = tp.matchings_index;
        const confidence = data.matchings[matchingIndex]?.confidence ?? 0.5;

        snappedPoints.push({
          latitude: snappedLat,
          longitude: snappedLon,
          originalLatitude: original.latitude,
          originalLongitude: original.longitude,
          confidence,
          roadName: tp.name || undefined,
          distance,
        });
      }

      // Extract geometry from first matching
      const geometry: [number, number][] =
        data.matchings[0].geometry.coordinates.map(
          (coord) => [coord[1], coord[0]], // Convert [lon, lat] to [lat, lon]
        );

      // Sum up total distance from all matchings
      const totalDistance = data.matchings.reduce(
        (sum, m) => sum + m.distance,
        0,
      );

      return success({
        snappedPoints,
        geometry,
        distance: totalDistance,
        unmatched,
      });
    } catch (error) {
      logger.error("OSRM match API error:", error);
      return failure(
        MapSnapError.apiUnavailable(error instanceof Error ? error : undefined),
      );
    }
  }
}
