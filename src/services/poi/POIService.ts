import * as fs from "fs/promises";
import * as path from "path";
import {
  IPOIService,
  POICategory,
  CachedPOI,
  POIPrefetchProgress,
  NearbyPOI,
  POI_CODE_LETTERS,
} from "@core/interfaces";
import {
  Result,
  GPSCoordinate,
  DriveRoute,
  success,
  failure,
} from "@core/types";
import { POIError } from "@core/errors";
import { getLogger } from "@utils/logger";
import {
  haversineDistance,
  calculateBearing,
  findClosestPointOnRoute,
} from "@utils/geo";

const logger = getLogger("POIService");

// Overpass API endpoint
const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";

// Rate limiting: minimum time between API requests (ms)
const MIN_REQUEST_INTERVAL = 1100; // Slightly over 1 second

// Query radius in meters for finding nearby POIs (corridor width around route)
const ROUTE_CORRIDOR_RADIUS = 2000;

// Default max distance for nearby POI queries
const DEFAULT_MAX_DISTANCE = 5000;

// Default max results for nearby POI queries
const DEFAULT_MAX_RESULTS = 10;

// Cache directory
const CACHE_DIR = "./data/poi";

/**
 * OSM tag mappings for each POI category
 */
const POI_OSM_TAGS: Record<POICategory, string[]> = {
  fuel: ["amenity=fuel"],
  charging: ["amenity=charging_station"],
  parking: ["amenity=parking"],
  food: ["amenity=restaurant", "amenity=cafe", "amenity=fast_food"],
  restroom: ["amenity=toilets"],
  viewpoint: ["tourism=viewpoint"],
};

/**
 * Raw Overpass API response element for POI
 */
interface OverpassPOIElement {
  type: "node" | "way";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: {
    name?: string;
    amenity?: string;
    tourism?: string;
    [key: string]: string | undefined;
  };
}

/**
 * Overpass API response structure
 */
interface OverpassResponse {
  elements: OverpassPOIElement[];
}

/**
 * Cached route POI data
 */
interface RoutePOICacheData {
  routeId: string;
  createdAt: string;
  pois: CachedPOI[];
}

/**
 * POI Service Implementation
 *
 * Fetches POI data from OpenStreetMap via Overpass API.
 * Caches data for offline use during driving.
 */
export class POIService implements IPOIService {
  private isInitialized = false;
  private lastRequestTime = 0;
  private routeCache = new Map<string, CachedPOI[]>();

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
      logger.info("POIService initialized");
      return success(undefined);
    } catch (error) {
      logger.error("Failed to initialize POIService:", error);
      return failure(
        POIError.cacheWriteFailed(
          "initialization",
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Get nearby POIs for a GPS position
   */
  async getNearbyPOIs(
    position: GPSCoordinate,
    categories?: POICategory[],
    maxDistance: number = DEFAULT_MAX_DISTANCE,
    maxResults: number = DEFAULT_MAX_RESULTS,
    routeContext?: {
      geometry: [number, number][];
      maxDistanceToRoute?: number;
      distanceFromStart?: number;
    },
  ): Promise<Result<NearbyPOI[]>> {
    if (!this.isInitialized) {
      return failure(POIError.serviceNotInitialized());
    }

    // Collect POIs from all cached routes
    const allCachedPOIs: CachedPOI[] = [];
    for (const pois of this.routeCache.values()) {
      allCachedPOIs.push(...pois);
    }

    // Filter by category if specified
    const filteredPOIs = categories
      ? allCachedPOIs.filter((poi) => categories.includes(poi.category))
      : allCachedPOIs;

    // Default max distance to route (for highway filtering)
    const maxDistanceToRoute = routeContext?.maxDistanceToRoute ?? 200;
    const currentDistanceFromStart = routeContext?.distanceFromStart ?? 0;

    // Calculate distance and bearing for each POI
    const poisWithDistance: NearbyPOI[] = filteredPOIs.map((poi) => {
      const distance = haversineDistance(
        position.latitude,
        position.longitude,
        poi.latitude,
        poi.longitude,
      );
      const bearing = calculateBearing(
        position.latitude,
        position.longitude,
        poi.latitude,
        poi.longitude,
      );

      const result: NearbyPOI = {
        id: poi.id,
        category: poi.category,
        name: poi.name,
        latitude: poi.latitude,
        longitude: poi.longitude,
        distance,
        bearing,
        codeLetter: POI_CODE_LETTERS[poi.category],
      };

      // If route context is provided, calculate route proximity
      if (routeContext?.geometry && routeContext.geometry.length >= 2) {
        const routeProximity = findClosestPointOnRoute(
          poi.latitude,
          poi.longitude,
          routeContext.geometry,
        );
        if (routeProximity) {
          result.distanceToRoute = routeProximity.distanceToRoute;
          // Distance along route from current position = POI's position on route - current position on route
          result.distanceAlongRoute = Math.max(
            0,
            routeProximity.distanceAlongRoute - currentDistanceFromStart,
          );
        }
      }

      return result;
    });

    let nearbyPOIs: NearbyPOI[];

    if (routeContext?.geometry && routeContext.geometry.length >= 2) {
      // Route-aware filtering: only show POIs that are close to the route line
      // and are ahead of current position (positive distanceAlongRoute)

      // Log all POIs with their route distances for debugging
      const poisWithRouteInfo = poisWithDistance.filter(
        (poi) => poi.distanceToRoute !== undefined,
      );
      if (poisWithRouteInfo.length > 0) {
        logger.info(
          `POI route filtering: ${poisWithRouteInfo.length} POIs analyzed. ` +
            `Distances to route: ${poisWithRouteInfo
              .slice(0, 10)
              .map(
                (p) =>
                  `${p.name || "unnamed"}:${Math.round(p.distanceToRoute!)}m`,
              )
              .join(", ")}`,
        );
      }

      nearbyPOIs = poisWithDistance
        .filter((poi) => {
          // Must have route proximity data
          if (
            poi.distanceToRoute === undefined ||
            poi.distanceAlongRoute === undefined
          ) {
            return false;
          }
          // Must be close to the route (not just within corridor)
          // Using strict threshold - POIs should be directly on the route
          if (poi.distanceToRoute > maxDistanceToRoute) {
            logger.debug(
              `Filtered out POI "${poi.name || "unnamed"}": ${Math.round(poi.distanceToRoute)}m from route (max: ${maxDistanceToRoute}m)`,
            );
            return false;
          }
          // Must be ahead on the route (not behind)
          if (poi.distanceAlongRoute < 0) {
            return false;
          }
          // Still respect max distance from current position
          if (poi.distance > maxDistance) {
            return false;
          }
          logger.debug(
            `Accepted POI "${poi.name || "unnamed"}": ${Math.round(poi.distanceToRoute)}m from route, ${Math.round(poi.distanceAlongRoute)}m ahead`,
          );
          return true;
        })
        // Sort by distance along route (next POI first, not closest as the crow flies)
        .sort(
          (a, b) => (a.distanceAlongRoute ?? 0) - (b.distanceAlongRoute ?? 0),
        );

      logger.info(
        `Route-aware filtering result: ${nearbyPOIs.length}/${poisWithDistance.length} POIs within ${maxDistanceToRoute}m of route`,
      );
    } else {
      // No route context: use legacy crow-fly distance filtering
      nearbyPOIs = poisWithDistance
        .filter((poi) => poi.distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance);
    }

    // Deduplicate by ID (same POI might be in multiple route caches)
    const seenIds = new Set<number>();
    const uniquePOIs = nearbyPOIs.filter((poi) => {
      if (seenIds.has(poi.id)) {
        return false;
      }
      seenIds.add(poi.id);
      return true;
    });

    // Limit results
    const limitedPOIs = uniquePOIs.slice(0, maxResults);

    logger.debug(
      `Found ${limitedPOIs.length} nearby POIs within ${maxDistance}m`,
    );
    return success(limitedPOIs);
  }

  /**
   * Get the nearest POI of a specific category
   */
  async getNearestPOI(
    position: GPSCoordinate,
    category: POICategory,
    maxDistance: number = DEFAULT_MAX_DISTANCE,
  ): Promise<Result<NearbyPOI | null>> {
    const result = await this.getNearbyPOIs(
      position,
      [category],
      maxDistance,
      1,
    );

    if (!result.success) {
      return result;
    }

    return success(result.data.length > 0 ? result.data[0] : null);
  }

  /**
   * Prefetch POIs along a route for offline use
   */
  async prefetchRoutePOIs(
    route: DriveRoute,
    categories: POICategory[],
    onProgress?: (progress: POIPrefetchProgress) => void,
  ): Promise<Result<number>> {
    if (!this.isInitialized) {
      return failure(POIError.serviceNotInitialized());
    }

    if (categories.length === 0) {
      logger.info("No POI categories to prefetch");
      return success(0);
    }

    logger.info(
      `Prefetching POIs for route ${route.id} (${route.geometry.length} points, categories: ${categories.join(", ")})`,
    );

    try {
      // Notify progress start
      onProgress?.({
        current: 0,
        total: 1,
        poisFound: 0,
        complete: false,
      });

      // Query entire route in a single request
      const result = await this.queryRouteOverpassApi(
        route.geometry,
        categories,
      );

      if (!result.success) {
        logger.error("Failed to fetch POIs for route:", result.error);
        onProgress?.({
          current: 1,
          total: 1,
          poisFound: 0,
          complete: true,
        });
        return failure(result.error);
      }

      const allPOIs = result.data;

      // Cache the results
      this.routeCache.set(route.id, allPOIs);
      await this.saveRouteCache(route.id, allPOIs);

      // Notify completion
      onProgress?.({
        current: 1,
        total: 1,
        poisFound: allPOIs.length,
        complete: true,
      });

      logger.info(`Prefetched ${allPOIs.length} POIs for route ${route.id}`);
      return success(allPOIs.length);
    } catch (error) {
      logger.error("Failed to prefetch POIs:", error);
      return failure(
        POIError.apiRequestFailed(
          "prefetch failed",
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Check if POIs are cached for a route
   */
  hasRouteCache(routeId: string): boolean {
    return this.routeCache.has(routeId);
  }

  /**
   * Clear cached POI data for a route
   */
  async clearRouteCache(routeId: string): Promise<Result<void>> {
    this.routeCache.delete(routeId);

    try {
      const cachePath = path.join(CACHE_DIR, `${routeId}.json`);
      await fs.unlink(cachePath).catch(() => {
        // Ignore if file doesn't exist
      });
      logger.info(`Cleared POI cache for route ${routeId}`);
      return success(undefined);
    } catch (error) {
      return failure(
        POIError.cacheWriteFailed(
          routeId,
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Clear all cached POI data
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
      logger.info("Cleared all POI cache");
      return success(undefined);
    } catch (error) {
      return failure(
        POIError.cacheWriteFailed(
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
    logger.info("POIService disposed");
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
   * Build Overpass query for POI categories along a route polyline
   */
  private buildRouteOverpassQuery(
    geometry: [number, number][],
    categories: POICategory[],
  ): string {
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
      `Building Overpass query with ${sampledPoints.length} sample points (from ${geometry.length} total)`,
    );

    // Build polyline string: lat1,lon1,lat2,lon2,...
    const polyline = sampledPoints
      .map(([lat, lon]) => `${lat.toFixed(5)},${lon.toFixed(5)}`)
      .join(",");

    // Build tag filters for all categories using the polyline
    const filters: string[] = [];
    for (const category of categories) {
      const tags = POI_OSM_TAGS[category];
      for (const tag of tags) {
        const [key, value] = tag.split("=");
        filters.push(
          `node(around:${ROUTE_CORRIDOR_RADIUS},${polyline})[${key}=${value}];`,
        );
        filters.push(
          `way(around:${ROUTE_CORRIDOR_RADIUS},${polyline})[${key}=${value}];`,
        );
      }
    }

    const query = `
      [out:json][timeout:30];
      (
        ${filters.join("\n        ")}
      );
      out center;
    `;

    logger.info(`Overpass query size: ${query.length} bytes`);
    return query;
  }

  /**
   * Build Overpass query for POI categories at a single point
   */
  private buildOverpassQuery(
    lat: number,
    lon: number,
    categories: POICategory[],
  ): string {
    // Build tag filters for all categories
    const filters: string[] = [];
    for (const category of categories) {
      const tags = POI_OSM_TAGS[category];
      for (const tag of tags) {
        const [key, value] = tag.split("=");
        filters.push(
          `node(around:${ROUTE_CORRIDOR_RADIUS},${lat},${lon})[${key}=${value}];`,
        );
        filters.push(
          `way(around:${ROUTE_CORRIDOR_RADIUS},${lat},${lon})[${key}=${value}];`,
        );
      }
    }

    return `
      [out:json][timeout:10];
      (
        ${filters.join("\n        ")}
      );
      out center;
    `;
  }

  /**
   * Query Overpass API for POIs along an entire route (single request)
   */
  private async queryRouteOverpassApi(
    geometry: [number, number][],
    categories: POICategory[],
  ): Promise<Result<CachedPOI[]>> {
    const query = this.buildRouteOverpassQuery(geometry, categories);
    logger.info(
      `Querying Overpass API for POIs along route (${geometry.length} points)...`,
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
        return failure(POIError.apiRateLimited());
      }

      if (!response.ok) {
        return failure(
          POIError.apiRequestFailed(
            `HTTP ${response.status}: ${response.statusText}`,
          ),
        );
      }

      const data = (await response.json()) as OverpassResponse;
      const pois = this.parseOverpassResponse(data, categories);
      logger.info(`Overpass API returned ${pois.length} POIs`);

      return success(pois);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return failure(POIError.apiRequestFailed("Request timeout"));
      }
      return failure(
        POIError.apiUnavailable(error instanceof Error ? error : undefined),
      );
    }
  }

  /**
   * Query Overpass API for POIs near a coordinate
   */
  private async queryOverpassApi(
    lat: number,
    lon: number,
    categories: POICategory[],
  ): Promise<Result<CachedPOI[]>> {
    const query = this.buildOverpassQuery(lat, lon, categories);

    try {
      const response = await fetch(OVERPASS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (response.status === 429) {
        return failure(POIError.apiRateLimited());
      }

      if (!response.ok) {
        return failure(
          POIError.apiRequestFailed(
            `HTTP ${response.status}: ${response.statusText}`,
          ),
        );
      }

      const data = (await response.json()) as OverpassResponse;
      const pois = this.parseOverpassResponse(data, categories);

      return success(pois);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return failure(POIError.apiRequestFailed("Request timeout"));
      }
      return failure(
        POIError.apiUnavailable(error instanceof Error ? error : undefined),
      );
    }
  }

  /**
   * Parse Overpass API response into POI data
   */
  private parseOverpassResponse(
    response: OverpassResponse,
    categories: POICategory[],
  ): CachedPOI[] {
    const pois: CachedPOI[] = [];

    for (const element of response.elements) {
      // Get coordinates (node has lat/lon, way has center)
      let latitude: number | undefined;
      let longitude: number | undefined;

      if (element.type === "node") {
        latitude = element.lat;
        longitude = element.lon;
      } else if (element.type === "way" && element.center) {
        latitude = element.center.lat;
        longitude = element.center.lon;
      }

      if (latitude === undefined || longitude === undefined) {
        continue;
      }

      // Determine category from tags
      const category = this.determineCategoryFromTags(element.tags, categories);
      if (!category) {
        continue;
      }

      pois.push({
        id: element.id,
        category,
        name: element.tags?.name,
        latitude,
        longitude,
      });
    }

    return pois;
  }

  /**
   * Determine POI category from OSM tags
   */
  private determineCategoryFromTags(
    tags: OverpassPOIElement["tags"],
    requestedCategories: POICategory[],
  ): POICategory | null {
    if (!tags) {
      return null;
    }

    for (const category of requestedCategories) {
      const osmTags = POI_OSM_TAGS[category];
      for (const osmTag of osmTags) {
        const [key, value] = osmTag.split("=");
        if (tags[key] === value) {
          return category;
        }
      }
    }

    return null;
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
            const data: RoutePOICacheData = JSON.parse(content);
            this.routeCache.set(data.routeId, data.pois);
            logger.debug(`Loaded cached POIs for route ${data.routeId}`);
          } catch (error) {
            logger.warn(`Failed to load cache file ${file}:`, error);
          }
        }
      }

      logger.info(`Loaded ${this.routeCache.size} cached POI routes`);
    } catch {
      // Directory might not exist yet, that's OK
      logger.debug("No cached POI routes found");
    }
  }

  /**
   * Save route cache to disk
   */
  private async saveRouteCache(
    routeId: string,
    pois: CachedPOI[],
  ): Promise<void> {
    const cacheData: RoutePOICacheData = {
      routeId,
      createdAt: new Date().toISOString(),
      pois,
    };

    const cachePath = path.join(CACHE_DIR, `${routeId}.json`);
    await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2), "utf-8");
    logger.debug(`Saved POI cache for route ${routeId}`);
  }
}
