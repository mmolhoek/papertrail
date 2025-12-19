import * as fs from "fs/promises";
import * as path from "path";
import {
  IVectorMapService,
  CachedRoad,
  RoadPrefetchProgress,
  HighwayType,
} from "@core/interfaces";
import { Result, DriveRoute, success, failure } from "@core/types";
import { VectorMapError } from "@core/errors";
import { getLogger } from "@utils/logger";
import { haversineDistance } from "@utils/geo";

const logger = getLogger("VectorMapService");

// Overpass API endpoint
const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";

// Rate limiting: minimum time between API requests (ms)
const MIN_REQUEST_INTERVAL = 1100; // Slightly over 1 second

// Default corridor radius in meters for road queries
const DEFAULT_CORRIDOR_RADIUS = 5000;

// Sample interval in meters (how often to query along route)
const SAMPLE_INTERVAL = 2000;

// Cache directory
const CACHE_DIR = "./data/roads";

/**
 * Valid highway types to query from OSM
 */
const HIGHWAY_TYPES: HighwayType[] = [
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "residential",
  "unclassified",
];

/**
 * Raw Overpass API response element for roads
 */
interface OverpassRoadElement {
  type: "way";
  id: number;
  geometry?: { lat: number; lon: number }[];
  tags?: {
    highway?: string;
    name?: string;
    [key: string]: string | undefined;
  };
}

/**
 * Overpass API response structure
 */
interface OverpassResponse {
  elements: OverpassRoadElement[];
}

/**
 * Cached route road data
 */
interface RouteRoadCacheData {
  routeId: string;
  createdAt: string;
  corridorRadius: number;
  roads: CachedRoad[];
}

/**
 * Vector Map Service Implementation
 *
 * Fetches road geometry from OpenStreetMap via Overpass API.
 * Caches data for offline rendering during driving.
 */
export class VectorMapService implements IVectorMapService {
  private isInitialized = false;
  private lastRequestTime = 0;
  private routeCache = new Map<string, CachedRoad[]>();

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
      logger.info("VectorMapService initialized");
      return success(undefined);
    } catch (error) {
      logger.error("Failed to initialize VectorMapService:", error);
      return failure(
        VectorMapError.cacheWriteFailed(
          "initialization",
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Get roads within a bounding box (from cache)
   */
  getRoadsInBounds(
    minLat: number,
    maxLat: number,
    minLon: number,
    maxLon: number,
  ): CachedRoad[] {
    const allRoads = this.getAllCachedRoads();

    // Filter roads that have at least one point in bounds
    return allRoads.filter((road) =>
      road.geometry.some(
        ([lat, lon]) =>
          lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon,
      ),
    );
  }

  /**
   * Get all cached roads for all routes
   */
  getAllCachedRoads(): CachedRoad[] {
    const allRoads: CachedRoad[] = [];
    const seenIds = new Set<number>();

    for (const roads of this.routeCache.values()) {
      for (const road of roads) {
        if (!seenIds.has(road.wayId)) {
          seenIds.add(road.wayId);
          allRoads.push(road);
        }
      }
    }

    return allRoads;
  }

  /**
   * Prefetch roads along a route corridor for offline use
   */
  async prefetchRouteRoads(
    route: DriveRoute,
    corridorRadiusMeters: number = DEFAULT_CORRIDOR_RADIUS,
    onProgress?: (progress: RoadPrefetchProgress) => void,
  ): Promise<Result<number>> {
    if (!this.isInitialized) {
      return failure(VectorMapError.serviceNotInitialized());
    }

    logger.info(
      `Prefetching roads for route ${route.id} (${route.geometry.length} points, radius: ${corridorRadiusMeters}m)`,
    );

    const allRoads: CachedRoad[] = [];
    const seenIds = new Set<number>();

    try {
      // Sample points along the route
      const samplePoints = this.sampleRoutePoints(
        route.geometry,
        SAMPLE_INTERVAL,
      );
      logger.info(`Sampling ${samplePoints.length} points along route`);

      // Notify progress start
      onProgress?.({
        current: 0,
        total: samplePoints.length,
        roadsFound: 0,
        complete: false,
      });

      // Query each sample point with rate limiting
      for (let i = 0; i < samplePoints.length; i++) {
        const point = samplePoints[i];

        // Rate limiting
        await this.waitForRateLimit();

        try {
          const result = await this.queryOverpassApi(
            point[0],
            point[1],
            corridorRadiusMeters,
          );
          if (result.success && result.data.length > 0) {
            // Add roads from this query (avoid duplicates)
            for (const road of result.data) {
              if (!seenIds.has(road.wayId)) {
                seenIds.add(road.wayId);
                allRoads.push(road);
              }
            }
            // Update cache incrementally
            this.routeCache.set(route.id, [...allRoads]);
          }
        } catch (error) {
          // Log but continue - some failures are acceptable
          logger.warn(`Failed to fetch roads for point ${i}:`, error);
        }

        // Notify progress update
        onProgress?.({
          current: i + 1,
          total: samplePoints.length,
          roadsFound: allRoads.length,
          complete: false,
        });

        // Log progress
        if ((i + 1) % 5 === 0 || i === samplePoints.length - 1) {
          logger.info(
            `Road prefetch progress: ${i + 1}/${samplePoints.length} points, ${allRoads.length} roads found`,
          );
        }
      }

      // Cache the results
      this.routeCache.set(route.id, allRoads);
      await this.saveRouteCache(route.id, allRoads, corridorRadiusMeters);

      // Notify completion
      onProgress?.({
        current: samplePoints.length,
        total: samplePoints.length,
        roadsFound: allRoads.length,
        complete: true,
      });

      logger.info(`Prefetched ${allRoads.length} roads for route ${route.id}`);
      return success(allRoads.length);
    } catch (error) {
      logger.error("Failed to prefetch roads:", error);
      return failure(
        VectorMapError.apiRequestFailed(
          "prefetch failed",
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Check if roads are cached for a route
   */
  hasRouteCache(routeId: string): boolean {
    return this.routeCache.has(routeId);
  }

  /**
   * Clear cached road data for a route
   */
  async clearRouteCache(routeId: string): Promise<Result<void>> {
    this.routeCache.delete(routeId);

    try {
      const cachePath = path.join(CACHE_DIR, `${routeId}.json`);
      await fs.unlink(cachePath).catch(() => {
        // Ignore if file doesn't exist
      });
      logger.info(`Cleared road cache for route ${routeId}`);
      return success(undefined);
    } catch (error) {
      return failure(
        VectorMapError.cacheWriteFailed(
          routeId,
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Clear all cached road data
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
      logger.info("Cleared all road cache");
      return success(undefined);
    } catch (error) {
      return failure(
        VectorMapError.cacheWriteFailed(
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
    logger.info("VectorMapService disposed");
  }

  // ============================================
  // Private helper methods
  // ============================================

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
   * Build Overpass query for road geometries
   */
  private buildOverpassQuery(lat: number, lon: number, radius: number): string {
    // Build highway type regex pattern
    const highwayPattern = HIGHWAY_TYPES.join("|");

    return `
      [out:json][timeout:25];
      way(around:${radius},${lat},${lon})
        [highway~"^(${highwayPattern})$"];
      out geom;
    `;
  }

  /**
   * Query Overpass API for roads near a coordinate
   */
  private async queryOverpassApi(
    lat: number,
    lon: number,
    radius: number,
  ): Promise<Result<CachedRoad[]>> {
    const query = this.buildOverpassQuery(lat, lon, radius);

    try {
      const response = await fetch(OVERPASS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (response.status === 429) {
        return failure(VectorMapError.apiRateLimited());
      }

      if (!response.ok) {
        return failure(
          VectorMapError.apiRequestFailed(
            `HTTP ${response.status}: ${response.statusText}`,
          ),
        );
      }

      const data = (await response.json()) as OverpassResponse;
      const roads = this.parseOverpassResponse(data);

      return success(roads);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return failure(VectorMapError.apiRequestFailed("Request timeout"));
      }
      return failure(
        VectorMapError.apiUnavailable(
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Parse Overpass API response into road data
   */
  private parseOverpassResponse(response: OverpassResponse): CachedRoad[] {
    const roads: CachedRoad[] = [];

    for (const element of response.elements) {
      // Only process ways with geometry
      if (element.type !== "way" || !element.geometry) {
        continue;
      }

      // Must have highway tag
      const highwayType = element.tags?.highway as HighwayType | undefined;
      if (!highwayType || !HIGHWAY_TYPES.includes(highwayType)) {
        continue;
      }

      // Must have at least 2 points
      if (element.geometry.length < 2) {
        continue;
      }

      // Convert geometry to [lat, lon] array
      const geometry: [number, number][] = element.geometry.map((point) => [
        point.lat,
        point.lon,
      ]);

      roads.push({
        wayId: element.id,
        highwayType,
        name: element.tags?.name,
        geometry,
      });
    }

    return roads;
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
            const data: RouteRoadCacheData = JSON.parse(content);
            this.routeCache.set(data.routeId, data.roads);
            logger.debug(`Loaded cached roads for route ${data.routeId}`);
          } catch (error) {
            logger.warn(`Failed to load cache file ${file}:`, error);
          }
        }
      }

      logger.info(`Loaded ${this.routeCache.size} cached road routes`);
    } catch {
      // Directory might not exist yet, that's OK
      logger.debug("No cached road routes found");
    }
  }

  /**
   * Save route cache to disk
   */
  private async saveRouteCache(
    routeId: string,
    roads: CachedRoad[],
    corridorRadius: number,
  ): Promise<void> {
    const cacheData: RouteRoadCacheData = {
      routeId,
      createdAt: new Date().toISOString(),
      corridorRadius,
      roads,
    };

    const cachePath = path.join(CACHE_DIR, `${routeId}.json`);
    await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2), "utf-8");
    logger.debug(`Saved road cache for route ${routeId}`);
  }
}
