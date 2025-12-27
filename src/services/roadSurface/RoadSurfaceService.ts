import * as fs from "fs/promises";
import * as path from "path";
import {
  IRoadSurfaceService,
  RoadSurfaceType,
  RoadSurfaceSegment,
  RoadSurfacePrefetchProgress,
} from "@core/interfaces";
import { Result, GPSCoordinate, success, failure } from "@core/types";
import { RoadSurfaceError } from "@core/errors";
import { getLogger } from "@utils/logger";
import { haversineDistance } from "@utils/geo";

const logger = getLogger("RoadSurfaceService");

// Overpass API endpoint
const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";

// Rate limiting: minimum time between API requests (ms)
const MIN_REQUEST_INTERVAL = 1100; // Slightly over 1 second

// Query radius in meters for finding nearby roads
const QUERY_RADIUS = 30;

// Cache directory
const CACHE_DIR = "./data/road-surfaces";

/**
 * Raw Overpass API response element
 */
interface OverpassElement {
  type: "way" | "node";
  id: number;
  tags?: {
    surface?: string;
    name?: string;
    highway?: string;
    [key: string]: string | undefined;
  };
  geometry?: Array<{ lat: number; lon: number }>;
}

/**
 * Overpass API response structure
 */
interface OverpassResponse {
  elements: OverpassElement[];
}

/**
 * Cached route data
 */
interface RouteCacheData {
  routeId: string;
  createdAt: string;
  segments: RoadSurfaceSegment[];
}

/**
 * Road Surface Service Implementation
 *
 * Fetches road surface data from OpenStreetMap via Overpass API.
 * Caches data for offline use during driving.
 */
export class RoadSurfaceService implements IRoadSurfaceService {
  private isInitialized = false;
  private lastRequestTime = 0;
  private routeCache = new Map<string, RoadSurfaceSegment[]>();

  /**
   * Initialize the service
   */
  async initialize(): Promise<Result<void>> {
    if (this.isInitialized) {
      return success(undefined);
    }

    try {
      // Ensure cache directory exists
      await fs.mkdir(CACHE_DIR, { recursive: true });

      // Load any existing cached routes
      await this.loadCachedRoutes();

      this.isInitialized = true;
      logger.info("RoadSurfaceService initialized");
      return success(undefined);
    } catch (error) {
      logger.error("Failed to initialize RoadSurfaceService:", error);
      return failure(
        RoadSurfaceError.cacheWriteFailed(
          "initialization",
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Get the current road surface for a GPS position
   */
  async getCurrentSurface(
    position: GPSCoordinate,
  ): Promise<Result<RoadSurfaceType | null>> {
    if (!this.isInitialized) {
      return failure(RoadSurfaceError.serviceNotInitialized());
    }

    // Try to find surface from cached route data
    const cachedResult = this.findSurfaceInCache(position);
    if (cachedResult) {
      logger.debug(
        `Found cached road surface: ${cachedResult.surface} (way ${cachedResult.wayId})`,
      );
      return success(cachedResult.surface);
    }

    // If no cache hit, return null (we don't query API during driving)
    // Surface data should be prefetched when route is calculated
    logger.debug("No cached road surface found for position");
    return success(null);
  }

  /**
   * Prefetch road surfaces along a route for offline use
   * Uses 25km segments for faster loading with better progress feedback
   */
  async prefetchRouteSurfaces(
    routeGeometry: [number, number][],
    routeId: string,
    onProgress?: (progress: RoadSurfacePrefetchProgress) => void,
  ): Promise<Result<void>> {
    if (!this.isInitialized) {
      return failure(RoadSurfaceError.serviceNotInitialized());
    }

    logger.info(
      `Prefetching road surfaces for route ${routeId} (${routeGeometry.length} points)`,
    );

    const allSegments: RoadSurfaceSegment[] = [];

    try {
      // Split route into ~25km segments for smaller, faster queries
      const routeSegments = this.splitRouteIntoSegments(routeGeometry, 25000);
      const totalSegments = routeSegments.length;

      logger.info(
        `Split route into ${totalSegments} segments for road surface queries`,
      );

      // Notify progress start
      onProgress?.({
        current: 0,
        total: totalSegments,
        segmentsFound: 0,
        complete: false,
      });

      let successfulSegments = 0;
      let lastError: Error | undefined;

      // Query each segment
      for (let i = 0; i < routeSegments.length; i++) {
        const segment = routeSegments[i];

        // Rate limiting between segment queries
        if (i > 0) {
          await this.waitForRateLimit();
        }

        const result = await this.querySegmentOverpassApi(segment);

        if (result.success && result.data.length > 0) {
          successfulSegments++;
          // Add segments, avoiding duplicates
          for (const surfaceSegment of result.data) {
            if (!allSegments.find((s) => s.wayId === surfaceSegment.wayId)) {
              allSegments.push(surfaceSegment);
            }
          }
          // Update cache incrementally
          this.routeCache.set(routeId, allSegments);
        } else if (!result.success) {
          lastError = result.error;
          logger.warn(
            `Road surface segment ${i + 1}/${totalSegments} failed: ${result.error.message}`,
          );
        }

        // Notify progress update
        onProgress?.({
          current: i + 1,
          total: totalSegments,
          segmentsFound: allSegments.length,
          complete: false,
        });

        logger.info(
          `Road surface segment ${i + 1}/${totalSegments}: ${result.success ? result.data.length : 0} ways (total: ${allSegments.length})`,
        );
      }

      // If ALL segments failed, return failure
      if (successfulSegments === 0 && routeSegments.length > 0) {
        return failure(
          RoadSurfaceError.apiRequestFailed(
            "all segment queries failed",
            lastError,
          ),
        );
      }

      // Cache the results
      this.routeCache.set(routeId, allSegments);
      await this.saveRouteCache(routeId, allSegments);

      // Notify completion
      onProgress?.({
        current: totalSegments,
        total: totalSegments,
        segmentsFound: allSegments.length,
        complete: true,
      });

      logger.info(
        `Prefetched ${allSegments.length} road surface segments for route ${routeId}`,
      );
      return success(undefined);
    } catch (error) {
      logger.error("Failed to prefetch road surfaces:", error);
      return failure(
        RoadSurfaceError.apiRequestFailed(
          "prefetch failed",
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Split route geometry into segments of approximately the given length
   */
  private splitRouteIntoSegments(
    geometry: [number, number][],
    segmentLengthMeters: number,
  ): [number, number][][] {
    if (geometry.length === 0) {
      return [];
    }

    const segments: [number, number][][] = [];
    let currentSegment: [number, number][] = [geometry[0]];
    let segmentDistance = 0;

    for (let i = 1; i < geometry.length; i++) {
      const prev = geometry[i - 1];
      const curr = geometry[i];
      const distance = haversineDistance(prev[0], prev[1], curr[0], curr[1]);

      segmentDistance += distance;
      currentSegment.push(curr);

      // Start new segment when we exceed the target length
      if (segmentDistance >= segmentLengthMeters) {
        segments.push(currentSegment);
        // Start new segment with overlap (include last point)
        currentSegment = [curr];
        segmentDistance = 0;
      }
    }

    // Add remaining segment if it has more than just the overlap point
    if (currentSegment.length > 1) {
      segments.push(currentSegment);
    } else if (segments.length === 0) {
      // Route is shorter than segment length
      segments.push(geometry);
    }

    return segments;
  }

  /**
   * Query Overpass API for road surfaces along a route segment
   */
  private async querySegmentOverpassApi(
    geometry: [number, number][],
  ): Promise<Result<RoadSurfaceSegment[]>> {
    const query = this.buildSegmentOverpassQuery(geometry);
    logger.info(
      `Querying Overpass API for road surfaces along segment (${geometry.length} points)...`,
    );

    try {
      const response = await fetch(OVERPASS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (response.status === 429) {
        return failure(RoadSurfaceError.apiRateLimited());
      }

      if (!response.ok) {
        return failure(
          RoadSurfaceError.apiRequestFailed(
            `HTTP ${response.status}: ${response.statusText}`,
          ),
        );
      }

      const data = (await response.json()) as OverpassResponse;
      const segments = this.parseOverpassResponse(data);
      logger.info(
        `Overpass API returned ${segments.length} road segments with surface data`,
      );

      return success(segments);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return failure(RoadSurfaceError.apiRequestFailed("Request timeout"));
      }
      return failure(
        RoadSurfaceError.apiUnavailable(
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Build Overpass query for road surfaces along a route segment polyline
   */
  private buildSegmentOverpassQuery(geometry: [number, number][]): string {
    // Sample the geometry to keep query size reasonable
    const maxPoints = 30;
    const step = Math.max(1, Math.floor(geometry.length / maxPoints));
    const sampledPoints: [number, number][] = [];
    for (let i = 0; i < geometry.length; i += step) {
      sampledPoints.push(geometry[i]);
    }
    // Always include the last point
    if (
      sampledPoints[sampledPoints.length - 1] !== geometry[geometry.length - 1]
    ) {
      sampledPoints.push(geometry[geometry.length - 1]);
    }

    logger.info(
      `Building road surface query with ${sampledPoints.length} sample points (from ${geometry.length} total)`,
    );

    // Build polyline string: lat1,lon1,lat2,lon2,...
    const polyline = sampledPoints
      .map(([lat, lon]) => `${lat.toFixed(5)},${lon.toFixed(5)}`)
      .join(",");

    // Query for ways with highway AND surface tags along the polyline
    // Include more highway types for cycling/adventure routes
    const query = `
      [out:json][timeout:30];
      way(around:${QUERY_RADIUS},${polyline})[highway~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service|track|path|cycleway|footway|bridleway)$"][surface];
      out geom;
    `;

    logger.info(`Road surface query size: ${query.length} bytes`);
    return query;
  }

  /**
   * Check if road surfaces are cached for a route
   */
  hasRouteCache(routeId: string): boolean {
    return this.routeCache.has(routeId);
  }

  /**
   * Clear cached road surface data for a route
   */
  clearRouteCache(routeId: string): void {
    this.routeCache.delete(routeId);

    const cachePath = path.join(CACHE_DIR, `${routeId}.json`);
    fs.unlink(cachePath).catch(() => {
      // Ignore if file doesn't exist
    });
    logger.info(`Cleared road surface cache for route ${routeId}`);
  }

  /**
   * Clear all cached road surface data
   */
  async clearAllCache(): Promise<void> {
    this.routeCache.clear();

    try {
      const files = await fs.readdir(CACHE_DIR);
      for (const file of files) {
        if (file.endsWith(".json")) {
          await fs.unlink(path.join(CACHE_DIR, file));
        }
      }
      logger.info("Cleared all road surface cache");
    } catch {
      // Directory might not exist, that's OK
    }
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    this.routeCache.clear();
    this.isInitialized = false;
    logger.info("RoadSurfaceService disposed");
  }

  // ============================================
  // Private helper methods
  // ============================================

  /**
   * Classify raw OSM surface value into simplified category
   */
  private classifySurface(rawSurface: string): RoadSurfaceType {
    const lower = rawSurface.toLowerCase();

    // Paved surfaces
    const paved = [
      "asphalt",
      "concrete",
      "concrete:lanes",
      "concrete:plates",
      "paving_stones",
      "sett",
      "cobblestone",
      "paved",
      "metal",
      "wood",
    ];
    if (paved.some((s) => lower.includes(s))) {
      return "paved";
    }

    // Gravel surfaces
    const gravel = ["gravel", "fine_gravel", "compacted", "pebblestone"];
    if (gravel.some((s) => lower.includes(s))) {
      return "gravel";
    }

    // Dirt surfaces
    const dirt = ["dirt", "earth", "ground", "mud", "clay"];
    if (dirt.some((s) => lower.includes(s))) {
      return "dirt";
    }

    // Unpaved (anything else that's explicitly unpaved)
    const unpaved = [
      "unpaved",
      "grass",
      "sand",
      "grass_paver",
      "stepping_stones",
    ];
    if (unpaved.some((s) => lower.includes(s))) {
      return "unpaved";
    }

    // Default to unknown
    return "unknown";
  }

  /**
   * Calculate the distance from a point to a line segment.
   * Uses flat-Earth approximation (accurate for short distances).
   * Returns distance in meters.
   */
  private distanceToSegment(
    point: GPSCoordinate,
    segmentStart: { latitude: number; longitude: number },
    segmentEnd: { latitude: number; longitude: number },
  ): number {
    // Convert to local flat coordinates (meters) centered on the point
    const latScale = 111320; // meters per degree latitude
    const lonScale = 111320 * Math.cos((point.latitude * Math.PI) / 180);

    // Point in local coordinates (at origin)
    const px = 0;
    const py = 0;

    // Segment start and end in local coordinates relative to point
    const ax = (segmentStart.longitude - point.longitude) * lonScale;
    const ay = (segmentStart.latitude - point.latitude) * latScale;
    const bx = (segmentEnd.longitude - point.longitude) * lonScale;
    const by = (segmentEnd.latitude - point.latitude) * latScale;

    // Vector from A to B
    const abx = bx - ax;
    const aby = by - ay;

    // Vector from A to P
    const apx = px - ax;
    const apy = py - ay;

    // Project P onto line AB, clamped to segment
    const abSquared = abx * abx + aby * aby;
    if (abSquared === 0) {
      // Segment is a point
      return Math.sqrt(ax * ax + ay * ay);
    }

    // Parameter t for projection (0 = at A, 1 = at B)
    let t = (apx * abx + apy * aby) / abSquared;
    t = Math.max(0, Math.min(1, t)); // Clamp to segment

    // Closest point on segment
    const closestX = ax + t * abx;
    const closestY = ay + t * aby;

    // Distance from point to closest point on segment
    return Math.sqrt(closestX * closestX + closestY * closestY);
  }

  /**
   * Find road surface in cached data for a position
   */
  private findSurfaceInCache(
    position: GPSCoordinate,
  ): RoadSurfaceSegment | null {
    // Search all cached routes for the nearest segment
    let nearest: { segment: RoadSurfaceSegment; distance: number } | null =
      null;

    for (const segments of this.routeCache.values()) {
      for (const segment of segments) {
        // Calculate distance to line segment (not midpoint)
        const distance = this.distanceToSegment(
          position,
          segment.start,
          segment.end,
        );

        // Check if this is closer (within reasonable distance)
        if (distance < 50 && (!nearest || distance < nearest.distance)) {
          nearest = { segment, distance };
        }
      }
    }

    return nearest ? nearest.segment : null;
  }

  /**
   * Wait for rate limiting
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < MIN_REQUEST_INTERVAL) {
      const waitTime = MIN_REQUEST_INTERVAL - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Parse Overpass API response into road surface segments
   */
  private parseOverpassResponse(
    response: OverpassResponse,
  ): RoadSurfaceSegment[] {
    const segments: RoadSurfaceSegment[] = [];

    for (const element of response.elements) {
      if (
        element.type === "way" &&
        element.tags?.highway &&
        element.tags?.surface &&
        element.geometry &&
        element.geometry.length >= 2
      ) {
        const rawSurface = element.tags.surface;
        const surfaceType = this.classifySurface(rawSurface);

        // Create segment from way geometry
        const geom = element.geometry;
        segments.push({
          start: {
            latitude: geom[0].lat,
            longitude: geom[0].lon,
          },
          end: {
            latitude: geom[geom.length - 1].lat,
            longitude: geom[geom.length - 1].lon,
          },
          surface: surfaceType,
          rawSurface: rawSurface,
          wayId: element.id,
          roadName: element.tags.name,
          highwayType: element.tags.highway,
        });
      }
    }

    return segments;
  }

  /**
   * Load cached routes from disk
   */
  private async loadCachedRoutes(): Promise<void> {
    try {
      const files = await fs.readdir(CACHE_DIR);

      for (const file of files) {
        if (file.endsWith(".json")) {
          try {
            const content = await fs.readFile(
              path.join(CACHE_DIR, file),
              "utf-8",
            );
            const data: RouteCacheData = JSON.parse(content);
            this.routeCache.set(data.routeId, data.segments);
            logger.debug(
              `Loaded cached road surfaces for route ${data.routeId}`,
            );
          } catch (error) {
            logger.warn(`Failed to load cache file ${file}:`, error);
          }
        }
      }

      logger.info(`Loaded ${this.routeCache.size} cached routes`);
    } catch {
      // Directory might not exist yet, that's OK
      logger.debug("No cached routes found");
    }
  }

  /**
   * Save route cache to disk
   */
  private async saveRouteCache(
    routeId: string,
    segments: RoadSurfaceSegment[],
  ): Promise<void> {
    const cacheData: RouteCacheData = {
      routeId,
      createdAt: new Date().toISOString(),
      segments,
    };

    const cachePath = path.join(CACHE_DIR, `${routeId}.json`);
    await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2), "utf-8");
    logger.debug(`Saved road surface cache for route ${routeId}`);
  }
}
