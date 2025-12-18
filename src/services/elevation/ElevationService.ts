import * as fs from "fs/promises";
import * as path from "path";
import {
  IElevationService,
  ElevationData,
  CachedElevationEntry,
  ElevationPrefetchProgress,
  RouteElevationMetrics,
} from "@core/interfaces";
import {
  Result,
  GPSCoordinate,
  DriveRoute,
  success,
  failure,
} from "@core/types";
import { ElevationError } from "@core/errors";
import { getLogger } from "@utils/logger";
import { haversineDistance } from "@utils/geo";

const logger = getLogger("ElevationService");

// Open-Elevation API endpoint
const OPEN_ELEVATION_API_URL = "https://api.open-elevation.com/api/v1/lookup";

// Rate limiting: minimum time between API requests (ms)
// Open-Elevation is more lenient but let's be respectful
const MIN_REQUEST_INTERVAL = 500;

// Maximum locations per batch request (API limit)
const MAX_BATCH_SIZE = 100;

// Cache directory
const CACHE_DIR = "./data/elevation";

// Distance threshold for cache lookup (meters)
// Use cached elevation if within this distance
const CACHE_LOOKUP_DISTANCE = 100;

// Distance between sample points for prefetching (meters)
// Use smaller interval than other services for better accuracy
const PREFETCH_SAMPLE_INTERVAL = 500;

// Minimum elevation change to count as climb/descent (meters)
// Filters out GPS noise
const MIN_ELEVATION_CHANGE = 2;

/**
 * Open-Elevation API request body
 */
interface OpenElevationRequest {
  locations: Array<{ latitude: number; longitude: number }>;
}

/**
 * Open-Elevation API response
 */
interface OpenElevationResponse {
  results?: Array<{
    latitude: number;
    longitude: number;
    elevation: number;
  }>;
  error?: string;
}

/**
 * Cached route data
 */
interface RouteCacheData {
  routeId: string;
  createdAt: string;
  elevations: CachedElevationEntry[];
  metrics: RouteElevationMetrics;
}

/**
 * Elevation Service Implementation
 *
 * Fetches and caches elevation data from Open-Elevation API.
 * Caches data for offline use during driving.
 */
export class ElevationService implements IElevationService {
  private isInitialized = false;
  private lastRequestTime = 0;
  private routeCache = new Map<string, CachedElevationEntry[]>();
  private routeMetrics = new Map<string, RouteElevationMetrics>();

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
      logger.info("ElevationService initialized");
      return success(undefined);
    } catch (error) {
      logger.error("Failed to initialize ElevationService:", error);
      return failure(
        ElevationError.cacheWriteFailed(
          "initialization",
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Get the elevation for a GPS position
   */
  async getElevation(
    position: GPSCoordinate,
  ): Promise<Result<ElevationData | null>> {
    if (!this.isInitialized) {
      return failure(ElevationError.serviceNotInitialized());
    }

    // Try to find elevation from cached route data
    const cachedResult = this.findElevationInCache(position);
    if (cachedResult) {
      logger.debug(`Found cached elevation: ${cachedResult.elevation}m`);
      return success(cachedResult);
    }

    // If no cache hit, return null (we don't query API during driving)
    // Elevations should be prefetched when route is calculated
    logger.debug("No cached elevation found for position");
    return success(null);
  }

  /**
   * Get route elevation metrics
   */
  getRouteMetrics(routeId: string): RouteElevationMetrics | null {
    return this.routeMetrics.get(routeId) || null;
  }

  /**
   * Get remaining climb from current position to route end
   */
  getRemainingClimb(
    routeId: string,
    currentPosition: GPSCoordinate,
  ): number | null {
    const elevations = this.routeCache.get(routeId);
    if (!elevations || elevations.length === 0) {
      return null;
    }

    // Find the closest cached point to current position
    let closestIndex = 0;
    let closestDistance = Infinity;

    for (let i = 0; i < elevations.length; i++) {
      const entry = elevations[i];
      const distance = haversineDistance(
        currentPosition.latitude,
        currentPosition.longitude,
        entry.latitude,
        entry.longitude,
      );

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = i;
      }
    }

    // Calculate remaining climb from current position to end
    let remainingClimb = 0;
    for (let i = closestIndex; i < elevations.length - 1; i++) {
      const diff = elevations[i + 1].elevation - elevations[i].elevation;
      if (diff > MIN_ELEVATION_CHANGE) {
        remainingClimb += diff;
      }
    }

    return Math.round(remainingClimb);
  }

  /**
   * Prefetch elevation data along a route for offline use
   */
  async prefetchRouteElevations(
    route: DriveRoute,
    onProgress?: (progress: ElevationPrefetchProgress) => void,
  ): Promise<Result<number>> {
    if (!this.isInitialized) {
      return failure(ElevationError.serviceNotInitialized());
    }

    logger.info(
      `Prefetching elevations for route ${route.id} (${route.geometry.length} points)`,
    );

    const elevations: CachedElevationEntry[] = [];

    try {
      // Sample points along the route
      const samplePoints = this.sampleRoutePoints(
        route.geometry,
        PREFETCH_SAMPLE_INTERVAL,
      );
      logger.info(`Sampling ${samplePoints.length} points along route`);

      // Split into batches
      const batches: Array<{ point: [number, number]; distance: number }[]> =
        [];
      for (let i = 0; i < samplePoints.length; i += MAX_BATCH_SIZE) {
        batches.push(samplePoints.slice(i, i + MAX_BATCH_SIZE));
      }

      // Notify progress start
      onProgress?.({
        current: 0,
        total: batches.length,
        pointsCached: 0,
        complete: false,
      });

      // Query each batch with rate limiting
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        // Rate limiting
        await this.waitForRateLimit();

        try {
          const result = await this.queryOpenElevationApi(batch);
          if (result.success && result.data) {
            elevations.push(...result.data);
            // Update cache incrementally
            this.routeCache.set(route.id, elevations);
          }
        } catch (error) {
          // Log but continue - some failures are acceptable
          logger.warn(`Failed to fetch elevations for batch ${i}:`, error);
        }

        // Notify progress update
        onProgress?.({
          current: i + 1,
          total: batches.length,
          pointsCached: elevations.length,
          complete: false,
        });

        // Log progress
        logger.info(
          `Prefetch progress: ${i + 1}/${batches.length} batches (${elevations.length} points)`,
        );
      }

      // Calculate route metrics
      const metrics = this.calculateRouteMetrics(elevations);
      this.routeMetrics.set(route.id, metrics);

      // Cache the results
      this.routeCache.set(route.id, elevations);
      await this.saveRouteCache(route.id, elevations, metrics);

      // Notify completion
      onProgress?.({
        current: batches.length,
        total: batches.length,
        pointsCached: elevations.length,
        complete: true,
      });

      logger.info(
        `Prefetched ${elevations.length} elevation points for route ${route.id}`,
      );
      logger.info(
        `Route metrics: +${metrics.totalClimb}m / -${metrics.totalDescent}m`,
      );
      return success(elevations.length);
    } catch (error) {
      logger.error("Failed to prefetch elevations:", error);
      return failure(
        ElevationError.apiRequestFailed(
          "prefetch failed",
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Check if elevations are cached for a route
   */
  hasRouteCache(routeId: string): boolean {
    return this.routeCache.has(routeId);
  }

  /**
   * Clear cached elevation data for a route
   */
  async clearRouteCache(routeId: string): Promise<Result<void>> {
    this.routeCache.delete(routeId);
    this.routeMetrics.delete(routeId);

    try {
      const cachePath = path.join(CACHE_DIR, `${routeId}.json`);
      await fs.unlink(cachePath).catch(() => {
        // Ignore if file doesn't exist
      });
      logger.info(`Cleared elevation cache for route ${routeId}`);
      return success(undefined);
    } catch (error) {
      return failure(
        ElevationError.cacheWriteFailed(
          routeId,
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Clear all cached elevation data
   */
  async clearAllCache(): Promise<Result<void>> {
    this.routeCache.clear();
    this.routeMetrics.clear();

    try {
      const files = await fs.readdir(CACHE_DIR);
      for (const file of files) {
        if (file.endsWith(".json")) {
          await fs.unlink(path.join(CACHE_DIR, file));
        }
      }
      logger.info("Cleared all elevation cache");
      return success(undefined);
    } catch (error) {
      return failure(
        ElevationError.cacheWriteFailed(
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
    this.routeMetrics.clear();
    this.isInitialized = false;
    logger.info("ElevationService disposed");
  }

  // ============================================
  // Private helper methods
  // ============================================

  /**
   * Find elevation in cached data for a position
   */
  private findElevationInCache(position: GPSCoordinate): ElevationData | null {
    // Search all cached routes for the nearest elevation
    let nearest: { entry: CachedElevationEntry; distance: number } | null =
      null;

    for (const elevations of this.routeCache.values()) {
      for (const entry of elevations) {
        const distance = haversineDistance(
          position.latitude,
          position.longitude,
          entry.latitude,
          entry.longitude,
        );

        // Check if within threshold and closer than previous best
        if (
          distance < CACHE_LOOKUP_DISTANCE &&
          (!nearest || distance < nearest.distance)
        ) {
          nearest = { entry, distance };
        }
      }
    }

    if (nearest) {
      return {
        latitude: nearest.entry.latitude,
        longitude: nearest.entry.longitude,
        elevation: nearest.entry.elevation,
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
   * Query Open-Elevation API for batch of coordinates
   */
  private async queryOpenElevationApi(
    points: Array<{ point: [number, number]; distance: number }>,
  ): Promise<Result<CachedElevationEntry[]>> {
    const requestBody: OpenElevationRequest = {
      locations: points.map((p) => ({
        latitude: p.point[0],
        longitude: p.point[1],
      })),
    };

    try {
      const response = await fetch(OPEN_ELEVATION_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (response.status === 429) {
        return failure(ElevationError.apiRateLimited());
      }

      if (!response.ok) {
        return failure(
          ElevationError.apiRequestFailed(
            `HTTP ${response.status}: ${response.statusText}`,
          ),
        );
      }

      const data = (await response.json()) as OpenElevationResponse;

      // Check for API error
      if (data.error) {
        logger.warn(`Open-Elevation returned error: ${data.error}`);
        return failure(ElevationError.apiParseFailed(data.error));
      }

      if (!data.results) {
        return failure(ElevationError.apiParseFailed("No results in response"));
      }

      // Map results back to cached entries with distances
      const elevations: CachedElevationEntry[] = data.results.map(
        (result, index) => ({
          latitude: result.latitude,
          longitude: result.longitude,
          elevation: result.elevation,
          distanceFromStart: points[index].distance,
        }),
      );

      return success(elevations);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return failure(ElevationError.apiRequestFailed("Request timeout"));
      }
      return failure(
        ElevationError.apiUnavailable(
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Calculate route elevation metrics from cached elevations
   */
  private calculateRouteMetrics(
    elevations: CachedElevationEntry[],
  ): RouteElevationMetrics {
    if (elevations.length === 0) {
      return {
        totalClimb: 0,
        totalDescent: 0,
        minElevation: 0,
        maxElevation: 0,
        startElevation: 0,
        endElevation: 0,
      };
    }

    let totalClimb = 0;
    let totalDescent = 0;
    let minElevation = elevations[0].elevation;
    let maxElevation = elevations[0].elevation;

    for (let i = 1; i < elevations.length; i++) {
      const diff = elevations[i].elevation - elevations[i - 1].elevation;

      // Only count significant changes to filter GPS noise
      if (diff > MIN_ELEVATION_CHANGE) {
        totalClimb += diff;
      } else if (diff < -MIN_ELEVATION_CHANGE) {
        totalDescent += Math.abs(diff);
      }

      if (elevations[i].elevation < minElevation) {
        minElevation = elevations[i].elevation;
      }
      if (elevations[i].elevation > maxElevation) {
        maxElevation = elevations[i].elevation;
      }
    }

    return {
      totalClimb: Math.round(totalClimb),
      totalDescent: Math.round(totalDescent),
      minElevation: Math.round(minElevation),
      maxElevation: Math.round(maxElevation),
      startElevation: Math.round(elevations[0].elevation),
      endElevation: Math.round(elevations[elevations.length - 1].elevation),
    };
  }

  /**
   * Sample points along a route at regular intervals with distance tracking
   */
  private sampleRoutePoints(
    geometry: [number, number][],
    intervalMeters: number,
  ): Array<{ point: [number, number]; distance: number }> {
    if (geometry.length === 0) {
      return [];
    }

    const samples: Array<{ point: [number, number]; distance: number }> = [
      { point: geometry[0], distance: 0 },
    ];
    let accumulatedDistance = 0;
    let totalDistance = 0;

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
      totalDistance += segmentDistance;

      if (accumulatedDistance >= intervalMeters) {
        samples.push({ point: curr, distance: totalDistance });
        accumulatedDistance = 0;
      }
    }

    // Always include last point
    const last = geometry[geometry.length - 1];
    const lastSample = samples[samples.length - 1];
    if (lastSample.point !== last) {
      samples.push({ point: last, distance: totalDistance });
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
            this.routeCache.set(data.routeId, data.elevations);
            this.routeMetrics.set(data.routeId, data.metrics);
            logger.debug(`Loaded cached elevations for route ${data.routeId}`);
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
    elevations: CachedElevationEntry[],
    metrics: RouteElevationMetrics,
  ): Promise<void> {
    const cacheData: RouteCacheData = {
      routeId,
      createdAt: new Date().toISOString(),
      elevations,
      metrics,
    };

    const cachePath = path.join(CACHE_DIR, `${routeId}.json`);
    await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2), "utf-8");
    logger.debug(`Saved elevation cache for route ${routeId}`);
  }
}
