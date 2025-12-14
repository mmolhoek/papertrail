import * as fs from "fs/promises";
import * as path from "path";
import {
  ISpeedLimitService,
  SpeedLimitData,
  SpeedLimitSegment,
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
   */
  async prefetchRouteSpeedLimits(route: DriveRoute): Promise<Result<number>> {
    if (!this.isInitialized) {
      return failure(SpeedLimitError.serviceNotInitialized());
    }

    logger.info(
      `Prefetching speed limits for route ${route.id} (${route.geometry.length} points)`,
    );

    const segments: SpeedLimitSegment[] = [];

    try {
      // Sample points along the route (every ~500m)
      const samplePoints = this.sampleRoutePoints(route.geometry, 500);
      logger.info(`Sampling ${samplePoints.length} points along route`);

      // Query each sample point with rate limiting
      for (let i = 0; i < samplePoints.length; i++) {
        const point = samplePoints[i];

        // Rate limiting
        await this.waitForRateLimit();

        try {
          const result = await this.queryOverpassApi(point[0], point[1]);
          if (result.success && result.data.length > 0) {
            // Add segments from this query
            for (const segment of result.data) {
              // Avoid duplicates
              if (!segments.find((s) => s.wayId === segment.wayId)) {
                segments.push(segment);
              }
            }
          }
        } catch (error) {
          // Log but continue - some failures are acceptable
          logger.warn(`Failed to fetch speed limit for point ${i}:`, error);
        }

        // Log progress
        if ((i + 1) % 10 === 0 || i === samplePoints.length - 1) {
          logger.info(
            `Prefetch progress: ${i + 1}/${samplePoints.length} points`,
          );
        }
      }

      // Cache the results
      this.routeCache.set(route.id, segments);
      await this.saveRouteCache(route.id, segments);

      logger.info(
        `Prefetched ${segments.length} speed limit segments for route ${route.id}`,
      );
      return success(segments.length);
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
   * Find speed limit in cached data for a position
   */
  private findSpeedLimitInCache(
    position: GPSCoordinate,
  ): SpeedLimitData | null {
    // Search all cached routes for the nearest segment
    let nearest: { segment: SpeedLimitSegment; distance: number } | null = null;

    for (const segments of this.routeCache.values()) {
      for (const segment of segments) {
        // Calculate distance to segment midpoint
        const midLat = (segment.start.latitude + segment.end.latitude) / 2;
        const midLon = (segment.start.longitude + segment.end.longitude) / 2;
        const distance = haversineDistance(
          position.latitude,
          position.longitude,
          midLat,
          midLon,
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
    // Overpass QL query: find ways with maxspeed tag near the coordinate
    const query = `
      [out:json][timeout:10];
      way(around:${QUERY_RADIUS},${lat},${lon})[highway][maxspeed];
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
        element.tags?.maxspeed &&
        element.geometry &&
        element.geometry.length >= 2
      ) {
        const speedLimit = this.parseMaxspeed(element.tags.maxspeed);
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
   * Sample points along a route at regular intervals
   */
  private sampleRoutePoints(
    geometry: [number, number][],
    intervalMeters: number,
  ): [number, number][] {
    if (geometry.length === 0) {
      return [];
    }

    const samples: [number, number][] = [geometry[0]];
    let accumulatedDistance = 0;

    for (let i = 1; i < geometry.length; i++) {
      const prev = geometry[i - 1];
      const curr = geometry[i];
      const segmentDistance = haversineDistance(
        prev[0],
        prev[1],
        curr[0],
        curr[1],
      );

      accumulatedDistance += segmentDistance;

      if (accumulatedDistance >= intervalMeters) {
        samples.push(curr);
        accumulatedDistance = 0;
      }
    }

    // Always include last point
    const last = geometry[geometry.length - 1];
    if (samples[samples.length - 1] !== last) {
      samples.push(last);
    }

    return samples;
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
