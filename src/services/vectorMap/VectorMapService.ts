import * as fs from "fs/promises";
import * as path from "path";
import {
  IVectorMapService,
  CachedRoad,
  CachedWater,
  CachedLanduse,
  RoadPrefetchProgress,
  HighwayType,
  WaterType,
  LanduseType,
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

// Larger sample interval for area features (water, landuse)
const AREA_SAMPLE_INTERVAL = 4000;

// Cache directories
const CACHE_DIR = "./data/roads";
const WATER_CACHE_DIR = "./data/water";
const LANDUSE_CACHE_DIR = "./data/landuse";

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
 * Valid water types to query from OSM
 */
const WATER_TYPES: WaterType[] = [
  "river",
  "stream",
  "canal",
  "lake",
  "pond",
  "reservoir",
  "water",
];

/**
 * Linear water types (rendered as lines, not polygons)
 */
const LINEAR_WATER_TYPES: WaterType[] = ["river", "stream", "canal"];

/**
 * Valid landuse types to query from OSM
 */
const LANDUSE_TYPES: LanduseType[] = [
  "forest",
  "wood",
  "park",
  "meadow",
  "grass",
  "farmland",
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
 * Raw Overpass API response element for water features
 */
interface OverpassWaterElement {
  type: "way" | "relation";
  id: number;
  geometry?: { lat: number; lon: number }[];
  members?: {
    type: "way";
    geometry?: { lat: number; lon: number }[];
    role: string;
  }[];
  tags?: {
    natural?: string;
    water?: string;
    waterway?: string;
    name?: string;
    [key: string]: string | undefined;
  };
}

/**
 * Raw Overpass API response element for landuse features
 */
interface OverpassLanduseElement {
  type: "way" | "relation";
  id: number;
  geometry?: { lat: number; lon: number }[];
  members?: {
    type: "way";
    geometry?: { lat: number; lon: number }[];
    role: string;
  }[];
  tags?: {
    landuse?: string;
    natural?: string;
    leisure?: string;
    name?: string;
    [key: string]: string | undefined;
  };
}

/**
 * Overpass API response structure
 */
interface OverpassResponse {
  elements: (
    | OverpassRoadElement
    | OverpassWaterElement
    | OverpassLanduseElement
  )[];
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
 * Cached route water data
 */
interface RouteWaterCacheData {
  routeId: string;
  createdAt: string;
  corridorRadius: number;
  water: CachedWater[];
}

/**
 * Cached route landuse data
 */
interface RouteLanduseCacheData {
  routeId: string;
  createdAt: string;
  corridorRadius: number;
  landuse: CachedLanduse[];
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
  private waterCache = new Map<string, CachedWater[]>();
  private landuseCache = new Map<string, CachedLanduse[]>();

  /**
   * Initialize the service
   */
  async initialize(): Promise<Result<void>> {
    if (this.isInitialized) {
      return success(undefined);
    }

    try {
      // Ensure cache directories exist
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.mkdir(WATER_CACHE_DIR, { recursive: true });
      await fs.mkdir(LANDUSE_CACHE_DIR, { recursive: true });

      // Load any existing cached routes
      await this.loadCachedRoutes();
      await this.loadCachedWater();
      await this.loadCachedLanduse();

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
    this.waterCache.clear();
    this.landuseCache.clear();

    try {
      // Clear roads
      const roadFiles = await fs.readdir(CACHE_DIR);
      for (const file of roadFiles) {
        if (file.endsWith(".json")) {
          await fs.unlink(path.join(CACHE_DIR, file));
        }
      }

      // Clear water
      const waterFiles = await fs.readdir(WATER_CACHE_DIR);
      for (const file of waterFiles) {
        if (file.endsWith(".json")) {
          await fs.unlink(path.join(WATER_CACHE_DIR, file));
        }
      }

      // Clear landuse
      const landuseFiles = await fs.readdir(LANDUSE_CACHE_DIR);
      for (const file of landuseFiles) {
        if (file.endsWith(".json")) {
          await fs.unlink(path.join(LANDUSE_CACHE_DIR, file));
        }
      }

      logger.info("Cleared all vector map cache");
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
   * Get all cached water features
   */
  getAllCachedWater(): CachedWater[] {
    const allWater: CachedWater[] = [];
    const seenIds = new Set<number>();

    for (const water of this.waterCache.values()) {
      for (const feature of water) {
        if (!seenIds.has(feature.id)) {
          seenIds.add(feature.id);
          allWater.push(feature);
        }
      }
    }

    return allWater;
  }

  /**
   * Get all cached landuse features
   */
  getAllCachedLanduse(): CachedLanduse[] {
    const allLanduse: CachedLanduse[] = [];
    const seenIds = new Set<number>();

    for (const landuse of this.landuseCache.values()) {
      for (const feature of landuse) {
        if (!seenIds.has(feature.id)) {
          seenIds.add(feature.id);
          allLanduse.push(feature);
        }
      }
    }

    return allLanduse;
  }

  /**
   * Prefetch water features along a route corridor for offline use
   */
  async prefetchRouteWater(
    route: DriveRoute,
    corridorRadiusMeters: number = DEFAULT_CORRIDOR_RADIUS,
  ): Promise<Result<number>> {
    if (!this.isInitialized) {
      return failure(VectorMapError.serviceNotInitialized());
    }

    logger.info(
      `Prefetching water for route ${route.id} (${route.geometry.length} points, radius: ${corridorRadiusMeters}m)`,
    );

    const allWater: CachedWater[] = [];
    const seenIds = new Set<number>();

    try {
      // Sample points along the route (larger interval for area features)
      const samplePoints = this.sampleRoutePoints(
        route.geometry,
        AREA_SAMPLE_INTERVAL,
      );
      logger.info(`Sampling ${samplePoints.length} points for water features`);

      // Query each sample point with rate limiting
      for (let i = 0; i < samplePoints.length; i++) {
        const point = samplePoints[i];

        // Rate limiting
        await this.waitForRateLimit();

        try {
          const result = await this.queryWaterApi(
            point[0],
            point[1],
            corridorRadiusMeters,
          );
          if (result.success && result.data.length > 0) {
            for (const water of result.data) {
              if (!seenIds.has(water.id)) {
                seenIds.add(water.id);
                allWater.push(water);
              }
            }
            this.waterCache.set(route.id, [...allWater]);
          }
        } catch (error) {
          logger.warn(`Failed to fetch water for point ${i}:`, error);
        }

        if ((i + 1) % 5 === 0 || i === samplePoints.length - 1) {
          logger.info(
            `Water prefetch progress: ${i + 1}/${samplePoints.length} points, ${allWater.length} features found`,
          );
        }
      }

      // Cache the results
      this.waterCache.set(route.id, allWater);
      await this.saveWaterCache(route.id, allWater, corridorRadiusMeters);

      logger.info(
        `Prefetched ${allWater.length} water features for route ${route.id}`,
      );
      return success(allWater.length);
    } catch (error) {
      logger.error("Failed to prefetch water:", error);
      return failure(
        VectorMapError.apiRequestFailed(
          "water prefetch failed",
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Prefetch landuse features along a route corridor for offline use
   */
  async prefetchRouteLanduse(
    route: DriveRoute,
    corridorRadiusMeters: number = DEFAULT_CORRIDOR_RADIUS,
  ): Promise<Result<number>> {
    if (!this.isInitialized) {
      return failure(VectorMapError.serviceNotInitialized());
    }

    logger.info(
      `Prefetching landuse for route ${route.id} (${route.geometry.length} points, radius: ${corridorRadiusMeters}m)`,
    );

    const allLanduse: CachedLanduse[] = [];
    const seenIds = new Set<number>();

    try {
      // Sample points along the route (larger interval for area features)
      const samplePoints = this.sampleRoutePoints(
        route.geometry,
        AREA_SAMPLE_INTERVAL,
      );
      logger.info(
        `Sampling ${samplePoints.length} points for landuse features`,
      );

      // Query each sample point with rate limiting
      for (let i = 0; i < samplePoints.length; i++) {
        const point = samplePoints[i];

        // Rate limiting
        await this.waitForRateLimit();

        try {
          const result = await this.queryLanduseApi(
            point[0],
            point[1],
            corridorRadiusMeters,
          );
          if (result.success && result.data.length > 0) {
            for (const landuse of result.data) {
              if (!seenIds.has(landuse.id)) {
                seenIds.add(landuse.id);
                allLanduse.push(landuse);
              }
            }
            this.landuseCache.set(route.id, [...allLanduse]);
          }
        } catch (error) {
          logger.warn(`Failed to fetch landuse for point ${i}:`, error);
        }

        if ((i + 1) % 5 === 0 || i === samplePoints.length - 1) {
          logger.info(
            `Landuse prefetch progress: ${i + 1}/${samplePoints.length} points, ${allLanduse.length} features found`,
          );
        }
      }

      // Cache the results
      this.landuseCache.set(route.id, allLanduse);
      await this.saveLanduseCache(route.id, allLanduse, corridorRadiusMeters);

      logger.info(
        `Prefetched ${allLanduse.length} landuse features for route ${route.id}`,
      );
      return success(allLanduse.length);
    } catch (error) {
      logger.error("Failed to prefetch landuse:", error);
      return failure(
        VectorMapError.apiRequestFailed(
          "landuse prefetch failed",
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
    this.waterCache.clear();
    this.landuseCache.clear();
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

  // ============================================
  // Water feature methods
  // ============================================

  /**
   * Build Overpass query for water features
   */
  private buildWaterQuery(lat: number, lon: number, radius: number): string {
    return `
      [out:json][timeout:25];
      (
        way(around:${radius},${lat},${lon})[waterway~"^(river|stream|canal)$"];
        way(around:${radius},${lat},${lon})[natural="water"];
        way(around:${radius},${lat},${lon})[water~"^(lake|pond|reservoir)$"];
        relation(around:${radius},${lat},${lon})[natural="water"];
        relation(around:${radius},${lat},${lon})[water~"^(lake|pond|reservoir)$"];
      );
      out geom;
    `;
  }

  /**
   * Query Overpass API for water features
   */
  private async queryWaterApi(
    lat: number,
    lon: number,
    radius: number,
  ): Promise<Result<CachedWater[]>> {
    const query = this.buildWaterQuery(lat, lon, radius);

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
      const water = this.parseWaterResponse(data);

      return success(water);
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
   * Parse Overpass API response into water data
   */
  private parseWaterResponse(response: OverpassResponse): CachedWater[] {
    const water: CachedWater[] = [];

    for (const element of response.elements) {
      const waterElement = element as OverpassWaterElement;

      // Determine water type
      let waterType: WaterType | undefined;
      let isArea = false;

      if (waterElement.tags?.waterway) {
        const ww = waterElement.tags.waterway;
        if (ww === "river" || ww === "stream" || ww === "canal") {
          waterType = ww as WaterType;
          isArea = false;
        }
      } else if (waterElement.tags?.natural === "water") {
        waterType = "water";
        isArea = true;
        // Check for more specific water type
        if (waterElement.tags?.water) {
          const w = waterElement.tags.water;
          if (WATER_TYPES.includes(w as WaterType)) {
            waterType = w as WaterType;
          }
        }
      } else if (waterElement.tags?.water) {
        const w = waterElement.tags.water;
        if (WATER_TYPES.includes(w as WaterType)) {
          waterType = w as WaterType;
          isArea = !LINEAR_WATER_TYPES.includes(waterType);
        }
      }

      if (!waterType) {
        continue;
      }

      // Extract geometry
      let geometry: [number, number][] = [];

      if (waterElement.type === "way" && waterElement.geometry) {
        geometry = waterElement.geometry.map((point) => [point.lat, point.lon]);
      } else if (waterElement.type === "relation" && waterElement.members) {
        // For relations, use outer ways
        for (const member of waterElement.members) {
          if (member.role === "outer" && member.geometry) {
            const memberGeom = member.geometry.map((point) => [
              point.lat,
              point.lon,
            ]) as [number, number][];
            geometry.push(...memberGeom);
          }
        }
      }

      if (geometry.length < 2) {
        continue;
      }

      water.push({
        id: waterElement.id,
        waterType,
        name: waterElement.tags?.name,
        isArea,
        geometry,
      });
    }

    return water;
  }

  /**
   * Load cached water from disk
   */
  private async loadCachedWater(): Promise<void> {
    try {
      const files = await fs.readdir(WATER_CACHE_DIR);

      for (const file of files) {
        if (file.endsWith(".json")) {
          try {
            const content = await fs.readFile(
              path.join(WATER_CACHE_DIR, file),
              "utf-8",
            );
            const data: RouteWaterCacheData = JSON.parse(content);
            this.waterCache.set(data.routeId, data.water);
            logger.debug(`Loaded cached water for route ${data.routeId}`);
          } catch (error) {
            logger.warn(`Failed to load water cache file ${file}:`, error);
          }
        }
      }

      logger.info(`Loaded ${this.waterCache.size} cached water routes`);
    } catch {
      logger.debug("No cached water routes found");
    }
  }

  /**
   * Save water cache to disk
   */
  private async saveWaterCache(
    routeId: string,
    water: CachedWater[],
    corridorRadius: number,
  ): Promise<void> {
    const cacheData: RouteWaterCacheData = {
      routeId,
      createdAt: new Date().toISOString(),
      corridorRadius,
      water,
    };

    const cachePath = path.join(WATER_CACHE_DIR, `${routeId}.json`);
    await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2), "utf-8");
    logger.debug(`Saved water cache for route ${routeId}`);
  }

  // ============================================
  // Landuse feature methods
  // ============================================

  /**
   * Build Overpass query for landuse features
   */
  private buildLanduseQuery(lat: number, lon: number, radius: number): string {
    return `
      [out:json][timeout:25];
      (
        way(around:${radius},${lat},${lon})[landuse~"^(forest|meadow|grass|farmland)$"];
        way(around:${radius},${lat},${lon})[natural="wood"];
        way(around:${radius},${lat},${lon})[leisure="park"];
        relation(around:${radius},${lat},${lon})[landuse~"^(forest|meadow|grass|farmland)$"];
        relation(around:${radius},${lat},${lon})[natural="wood"];
        relation(around:${radius},${lat},${lon})[leisure="park"];
      );
      out geom;
    `;
  }

  /**
   * Query Overpass API for landuse features
   */
  private async queryLanduseApi(
    lat: number,
    lon: number,
    radius: number,
  ): Promise<Result<CachedLanduse[]>> {
    const query = this.buildLanduseQuery(lat, lon, radius);

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
      const landuse = this.parseLanduseResponse(data);

      return success(landuse);
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
   * Parse Overpass API response into landuse data
   */
  private parseLanduseResponse(response: OverpassResponse): CachedLanduse[] {
    const landuse: CachedLanduse[] = [];

    for (const element of response.elements) {
      const landuseElement = element as OverpassLanduseElement;

      // Determine landuse type
      let landuseType: LanduseType | undefined;

      if (landuseElement.tags?.landuse) {
        const lu = landuseElement.tags.landuse;
        if (LANDUSE_TYPES.includes(lu as LanduseType)) {
          landuseType = lu as LanduseType;
        }
      } else if (landuseElement.tags?.natural === "wood") {
        landuseType = "wood";
      } else if (landuseElement.tags?.leisure === "park") {
        landuseType = "park";
      }

      if (!landuseType) {
        continue;
      }

      // Extract geometry
      let geometry: [number, number][] = [];

      if (landuseElement.type === "way" && landuseElement.geometry) {
        geometry = landuseElement.geometry.map((point) => [
          point.lat,
          point.lon,
        ]);
      } else if (landuseElement.type === "relation" && landuseElement.members) {
        // For relations, use outer ways
        for (const member of landuseElement.members) {
          if (member.role === "outer" && member.geometry) {
            const memberGeom = member.geometry.map((point) => [
              point.lat,
              point.lon,
            ]) as [number, number][];
            geometry.push(...memberGeom);
          }
        }
      }

      if (geometry.length < 3) {
        // Need at least 3 points for a polygon
        continue;
      }

      landuse.push({
        id: landuseElement.id,
        landuseType,
        name: landuseElement.tags?.name,
        geometry,
      });
    }

    return landuse;
  }

  /**
   * Load cached landuse from disk
   */
  private async loadCachedLanduse(): Promise<void> {
    try {
      const files = await fs.readdir(LANDUSE_CACHE_DIR);

      for (const file of files) {
        if (file.endsWith(".json")) {
          try {
            const content = await fs.readFile(
              path.join(LANDUSE_CACHE_DIR, file),
              "utf-8",
            );
            const data: RouteLanduseCacheData = JSON.parse(content);
            this.landuseCache.set(data.routeId, data.landuse);
            logger.debug(`Loaded cached landuse for route ${data.routeId}`);
          } catch (error) {
            logger.warn(`Failed to load landuse cache file ${file}:`, error);
          }
        }
      }

      logger.info(`Loaded ${this.landuseCache.size} cached landuse routes`);
    } catch {
      logger.debug("No cached landuse routes found");
    }
  }

  /**
   * Save landuse cache to disk
   */
  private async saveLanduseCache(
    routeId: string,
    landuse: CachedLanduse[],
    corridorRadius: number,
  ): Promise<void> {
    const cacheData: RouteLanduseCacheData = {
      routeId,
      createdAt: new Date().toISOString(),
      corridorRadius,
      landuse,
    };

    const cachePath = path.join(LANDUSE_CACHE_DIR, `${routeId}.json`);
    await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2), "utf-8");
    logger.debug(`Saved landuse cache for route ${routeId}`);
  }
}
