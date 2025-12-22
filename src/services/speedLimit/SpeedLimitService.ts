import * as fs from "fs/promises";
import * as path from "path";
import {
  ISpeedLimitService,
  SpeedLimitData,
  SpeedLimitSegment,
  SpeedLimitPrefetchProgress,
} from "@core/interfaces";
import {
  Result,
  GPSCoordinate,
  DriveRoute,
  success,
  failure,
} from "@core/types";
import { SpeedLimitError } from "@core/errors";
import { getLogger } from "@utils/logger";
import { haversineDistance } from "@utils/geo";

const logger = getLogger("SpeedLimitService");

// Overpass API endpoint
const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";

// Rate limiting: minimum time between API requests (ms)
const MIN_REQUEST_INTERVAL = 1100; // Slightly over 1 second

// Query radius in meters for finding nearby roads
const QUERY_RADIUS = 30;

// Cache directory
const CACHE_DIR = "./data/speed-limits";

/**
 * Raw Overpass API response element
 */
interface OverpassElement {
  type: "way" | "node";
  id: number;
  tags?: {
    maxspeed?: string;
    name?: string;
    highway?: string;
    [key: string]: string | undefined;
  };
  geometry?: Array<{ lat: number; lon: number }>;
  center?: { lat: number; lon: number };
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
  segments: SpeedLimitSegment[];
}

/**
 * Speed Limit Service Implementation
 *
 * Fetches speed limit data from OpenStreetMap via Overpass API.
 * Caches data for offline use during driving.
 */
export class SpeedLimitService implements ISpeedLimitService {
  private isInitialized = false;
  private lastRequestTime = 0;
  private routeCache = new Map<string, SpeedLimitSegment[]>();

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
      logger.info("SpeedLimitService initialized");
      return success(undefined);
    } catch (error) {
      logger.error("Failed to initialize SpeedLimitService:", error);
      return failure(
        SpeedLimitError.cacheWriteFailed(
          "initialization",
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Get the current speed limit for a GPS position
   */
  async getSpeedLimit(
    position: GPSCoordinate,
  ): Promise<Result<SpeedLimitData | null>> {
    if (!this.isInitialized) {
      return failure(SpeedLimitError.serviceNotInitialized());
    }

    // First, try to find speed limit from cached route data
    const cachedResult = this.findSpeedLimitInCache(position);
    if (cachedResult) {
      logger.debug(
        `Found cached speed limit: ${cachedResult.speedLimit} km/h (way ${cachedResult.wayId})`,
      );
      return success(cachedResult);
    }

    // If no cache hit, return null (we don't query API during driving)
    // Speed limits should be prefetched when route is calculated
    logger.debug("No cached speed limit found for position");
    return success(null);
  }

  /**
   * Prefetch speed limits along a route for offline use
   * Uses 25km segments for faster loading with better progress feedback
   */
  async prefetchRouteSpeedLimits(
    route: DriveRoute,
    onProgress?: (progress: SpeedLimitPrefetchProgress) => void,
  ): Promise<Result<number>> {
    if (!this.isInitialized) {
      return failure(SpeedLimitError.serviceNotInitialized());
    }

    logger.info(
      `Prefetching speed limits for route ${route.id} (${route.geometry.length} points)`,
    );

    const allSegments: SpeedLimitSegment[] = [];

    try {
      // Split route into ~25km segments for smaller, faster queries
      const routeSegments = this.splitRouteIntoSegments(route.geometry, 25000);
      const totalSegments = routeSegments.length;

      logger.info(
        `Split route into ${totalSegments} segments for speed limit queries`,
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
          for (const speedSegment of result.data) {
            if (!allSegments.find((s) => s.wayId === speedSegment.wayId)) {
              allSegments.push(speedSegment);
            }
          }
          // Update cache incrementally
          this.routeCache.set(route.id, allSegments);
        } else if (!result.success) {
          lastError = result.error;
          logger.warn(
            `Speed limit segment ${i + 1}/${totalSegments} failed: ${result.error.message}`,
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
          `Speed limit segment ${i + 1}/${totalSegments}: ${result.success ? result.data.length : 0} ways (total: ${allSegments.length})`,
        );
      }

      // If ALL segments failed, return failure
      if (successfulSegments === 0 && routeSegments.length > 0) {
        return failure(
          SpeedLimitError.apiRequestFailed(
            "all segment queries failed",
            lastError,
          ),
        );
      }

      // Cache the results
      this.routeCache.set(route.id, allSegments);
      await this.saveRouteCache(route.id, allSegments);

      // Notify completion
      onProgress?.({
        current: totalSegments,
        total: totalSegments,
        segmentsFound: allSegments.length,
        complete: true,
      });

      logger.info(
        `Prefetched ${allSegments.length} speed limit segments for route ${route.id}`,
      );
      return success(allSegments.length);
    } catch (error) {
      logger.error("Failed to prefetch speed limits:", error);
      return failure(
        SpeedLimitError.apiRequestFailed(
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
   * Query Overpass API for speed limits along a route segment
   */
  private async querySegmentOverpassApi(
    geometry: [number, number][],
  ): Promise<Result<SpeedLimitSegment[]>> {
    const query = this.buildSegmentOverpassQuery(geometry);
    logger.info(
      `Querying Overpass API for speed limits along segment (${geometry.length} points)...`,
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
        return failure(SpeedLimitError.apiRateLimited());
      }

      if (!response.ok) {
        return failure(
          SpeedLimitError.apiRequestFailed(
            `HTTP ${response.status}: ${response.statusText}`,
          ),
        );
      }

      const data = (await response.json()) as OverpassResponse;
      const segments = this.parseOverpassResponse(data);
      logger.info(`Overpass API returned ${segments.length} road segments`);

      return success(segments);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return failure(SpeedLimitError.apiRequestFailed("Request timeout"));
      }
      return failure(
        SpeedLimitError.apiUnavailable(
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Build Overpass query for speed limits along a route segment polyline
   */
  private buildSegmentOverpassQuery(geometry: [number, number][]): string {
    // Sample the geometry to keep query size reasonable
    // ~30 points is enough for good coverage while keeping query fast
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
      `Building speed limit query with ${sampledPoints.length} sample points (from ${geometry.length} total)`,
    );

    // Build polyline string: lat1,lon1,lat2,lon2,...
    const polyline = sampledPoints
      .map(([lat, lon]) => `${lat.toFixed(5)},${lon.toFixed(5)}`)
      .join(",");

    // Query for ways with highway tag along the polyline
    const query = `
      [out:json][timeout:30];
      way(around:${QUERY_RADIUS},${polyline})[highway~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service)$"];
      out geom;
    `;

    logger.info(`Speed limit query size: ${query.length} bytes`);
    return query;
  }

  /**
   * Check if speed limits are cached for a route
   */
  hasRouteCache(routeId: string): boolean {
    return this.routeCache.has(routeId);
  }

  /**
   * Clear cached speed limit data for a route
   */
  async clearRouteCache(routeId: string): Promise<Result<void>> {
    this.routeCache.delete(routeId);

    try {
      const cachePath = path.join(CACHE_DIR, `${routeId}.json`);
      await fs.unlink(cachePath).catch(() => {
        // Ignore if file doesn't exist
      });
      logger.info(`Cleared speed limit cache for route ${routeId}`);
      return success(undefined);
    } catch (error) {
      return failure(
        SpeedLimitError.cacheWriteFailed(
          routeId,
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Clear all cached speed limit data
   */
  async clearAllCache(): Promise<Result<void>> {
    this.routeCache.clear();

    try {
      const files = await fs.readdir(CACHE_DIR);
      for (const file of files) {
        if (file.endsWith(".json")) {
          await fs.unlink(path.join(CACHE_DIR, file));
        }
      }
      logger.info("Cleared all speed limit cache");
      return success(undefined);
    } catch (error) {
      return failure(
        SpeedLimitError.cacheWriteFailed(
          "all",
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    this.routeCache.clear();
    this.isInitialized = false;
    logger.info("SpeedLimitService disposed");
  }

  // ============================================
  // Private helper methods
  // ============================================

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
    // At the equator, 1 degree lat ≈ 111km, 1 degree lon ≈ 111km * cos(lat)
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
   * Find speed limit in cached data for a position
   */
  private findSpeedLimitInCache(
    position: GPSCoordinate,
  ): SpeedLimitData | null {
    // Search all cached routes for the nearest segment
    let nearest: { segment: SpeedLimitSegment; distance: number } | null = null;

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

    if (nearest) {
      return {
        speedLimit: nearest.segment.speedLimit,
        wayId: nearest.segment.wayId,
        roadName: nearest.segment.roadName,
        distance: nearest.distance,
        highwayType: nearest.segment.highwayType,
      };
    }

    return null;
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
   * Query Overpass API for speed limits near a coordinate
   */
  private async queryOverpassApi(
    lat: number,
    lon: number,
  ): Promise<Result<SpeedLimitSegment[]>> {
    // Overpass QL query: find ways with highway tag near the coordinate
    // Don't require maxspeed - we'll use defaults based on highway type
    const query = `
      [out:json][timeout:10];
      way(around:${QUERY_RADIUS},${lat},${lon})[highway~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service)$"];
      out geom;
    `;

    try {
      const response = await fetch(OVERPASS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (response.status === 429) {
        return failure(SpeedLimitError.apiRateLimited());
      }

      if (!response.ok) {
        return failure(
          SpeedLimitError.apiRequestFailed(
            `HTTP ${response.status}: ${response.statusText}`,
          ),
        );
      }

      const data = (await response.json()) as OverpassResponse;
      const segments = this.parseOverpassResponse(data);

      return success(segments);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return failure(SpeedLimitError.apiRequestFailed("Request timeout"));
      }
      return failure(
        SpeedLimitError.apiUnavailable(
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Parse Overpass API response into speed limit segments
   */
  private parseOverpassResponse(
    response: OverpassResponse,
  ): SpeedLimitSegment[] {
    const segments: SpeedLimitSegment[] = [];

    for (const element of response.elements) {
      if (
        element.type === "way" &&
        element.tags?.highway &&
        element.geometry &&
        element.geometry.length >= 2
      ) {
        // Use explicit maxspeed if available, otherwise use default for highway type
        let speedLimit: number | null = null;
        if (element.tags.maxspeed) {
          speedLimit = this.parseMaxspeed(element.tags.maxspeed);
        }
        if (speedLimit === null) {
          speedLimit = this.getDefaultSpeedLimit(element.tags.highway);
        }

        if (speedLimit !== null) {
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
            speedLimit,
            wayId: element.id,
            roadName: element.tags.name,
            highwayType: element.tags.highway,
          });
        }
      }
    }

    return segments;
  }

  /**
   * Get default speed limit based on highway type
   * These are typical European defaults - adjust for your region
   */
  private getDefaultSpeedLimit(highwayType: string): number | null {
    const defaults: Record<string, number> = {
      motorway: 120,
      motorway_link: 80,
      trunk: 100,
      trunk_link: 60,
      primary: 80,
      primary_link: 50,
      secondary: 70,
      secondary_link: 50,
      tertiary: 60,
      tertiary_link: 40,
      unclassified: 50,
      residential: 50,
      living_street: 20,
      service: 30,
    };

    return defaults[highwayType] ?? null;
  }

  /**
   * Parse maxspeed tag value to km/h
   * Handles various formats: "50", "30 mph", "50 km/h", "walk", etc.
   */
  private parseMaxspeed(maxspeed: string): number | null {
    // Handle special values
    const specialValues: Record<string, number> = {
      walk: 5,
      none: 999, // No limit (Autobahn)
      signals: 0, // Variable (ignore)
    };

    const lower = maxspeed.toLowerCase().trim();
    if (specialValues[lower] !== undefined) {
      return specialValues[lower] === 0 ? null : specialValues[lower];
    }

    // Extract numeric value
    const numMatch = maxspeed.match(/^(\d+)/);
    if (!numMatch) {
      return null;
    }

    let value = parseInt(numMatch[1], 10);

    // Check for mph
    if (maxspeed.toLowerCase().includes("mph")) {
      // Convert mph to km/h
      value = Math.round(value * 1.60934);
    }

    // Sanity check
    if (value < 5 || value > 300) {
      return null;
    }

    return value;
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
              `Loaded cached speed limits for route ${data.routeId}`,
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
    segments: SpeedLimitSegment[],
  ): Promise<void> {
    const cacheData: RouteCacheData = {
      routeId,
      createdAt: new Date().toISOString(),
      segments,
    };

    const cachePath = path.join(CACHE_DIR, `${routeId}.json`);
    await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2), "utf-8");
    logger.debug(`Saved speed limit cache for route ${routeId}`);
  }
}
