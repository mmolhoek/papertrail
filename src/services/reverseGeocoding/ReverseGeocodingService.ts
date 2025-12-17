import * as fs from "fs/promises";
import * as path from "path";
import {
  IReverseGeocodingService,
  LocationData,
  CachedLocationEntry,
  LocationPrefetchProgress,
} from "@core/interfaces";
import {
  Result,
  GPSCoordinate,
  DriveRoute,
  success,
  failure,
} from "@core/types";
import { ReverseGeocodingError } from "@core/errors";
import { getLogger } from "@utils/logger";
import { haversineDistance } from "@utils/geo";

const logger = getLogger("ReverseGeocodingService");

// Nominatim API endpoint
const NOMINATIM_API_URL = "https://nominatim.openstreetmap.org/reverse";

// Rate limiting: minimum time between API requests (ms)
// Nominatim requires max 1 request per second
const MIN_REQUEST_INTERVAL = 1100;

// Cache directory
const CACHE_DIR = "./data/locations";

// Distance threshold for cache lookup (meters)
// Use cached location if within this distance
const CACHE_LOOKUP_DISTANCE = 100;

// Distance between sample points for prefetching (meters)
const PREFETCH_SAMPLE_INTERVAL = 1000;

/**
 * Raw Nominatim API response
 */
interface NominatimResponse {
  place_id?: number;
  licence?: string;
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: {
    road?: string;
    house_number?: string;
    village?: string;
    town?: string;
    city?: string;
    municipality?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
  error?: string;
}

/**
 * Cached route data
 */
interface RouteCacheData {
  routeId: string;
  createdAt: string;
  locations: CachedLocationEntry[];
}

/**
 * Reverse Geocoding Service Implementation
 *
 * Converts GPS coordinates to human-readable location names using Nominatim API.
 * Caches data for offline use during driving.
 */
export class ReverseGeocodingService implements IReverseGeocodingService {
  private isInitialized = false;
  private lastRequestTime = 0;
  private routeCache = new Map<string, CachedLocationEntry[]>();

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
      logger.info("ReverseGeocodingService initialized");
      return success(undefined);
    } catch (error) {
      logger.error("Failed to initialize ReverseGeocodingService:", error);
      return failure(
        ReverseGeocodingError.cacheWriteFailed(
          "initialization",
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Get the location name for a GPS position
   */
  async getLocationName(
    position: GPSCoordinate,
  ): Promise<Result<LocationData | null>> {
    if (!this.isInitialized) {
      return failure(ReverseGeocodingError.serviceNotInitialized());
    }

    // Try to find location from cached route data
    const cachedResult = this.findLocationInCache(position);
    if (cachedResult) {
      logger.debug(`Found cached location: ${cachedResult.displayName}`);
      return success(cachedResult);
    }

    // If no cache hit, return null (we don't query API during driving)
    // Locations should be prefetched when route is calculated
    logger.debug("No cached location found for position");
    return success(null);
  }

  /**
   * Prefetch location names along a route for offline use
   */
  async prefetchRouteLocations(
    route: DriveRoute,
    onProgress?: (progress: LocationPrefetchProgress) => void,
  ): Promise<Result<number>> {
    if (!this.isInitialized) {
      return failure(ReverseGeocodingError.serviceNotInitialized());
    }

    logger.info(
      `Prefetching locations for route ${route.id} (${route.geometry.length} points)`,
    );

    const locations: CachedLocationEntry[] = [];

    try {
      // Sample points along the route
      const samplePoints = this.sampleRoutePoints(
        route.geometry,
        PREFETCH_SAMPLE_INTERVAL,
      );
      logger.info(`Sampling ${samplePoints.length} points along route`);

      // Notify progress start
      onProgress?.({
        current: 0,
        total: samplePoints.length,
        locationsCached: 0,
        complete: false,
      });

      // Query each sample point with rate limiting
      for (let i = 0; i < samplePoints.length; i++) {
        const point = samplePoints[i];

        // Rate limiting
        await this.waitForRateLimit();

        try {
          const result = await this.queryNominatimApi(point[0], point[1]);
          if (result.success && result.data) {
            locations.push({
              latitude: point[0],
              longitude: point[1],
              location: result.data,
              cachedAt: Date.now(),
            });
            // Update cache incrementally so locations are available immediately
            this.routeCache.set(route.id, locations);
          }
        } catch (error) {
          // Log but continue - some failures are acceptable
          logger.warn(`Failed to fetch location for point ${i}:`, error);
        }

        // Notify progress update
        onProgress?.({
          current: i + 1,
          total: samplePoints.length,
          locationsCached: locations.length,
          complete: false,
        });

        // Log progress
        if ((i + 1) % 10 === 0 || i === samplePoints.length - 1) {
          logger.info(
            `Prefetch progress: ${i + 1}/${samplePoints.length} points`,
          );
        }
      }

      // Cache the results
      this.routeCache.set(route.id, locations);
      await this.saveRouteCache(route.id, locations);

      // Notify completion
      onProgress?.({
        current: samplePoints.length,
        total: samplePoints.length,
        locationsCached: locations.length,
        complete: true,
      });

      logger.info(
        `Prefetched ${locations.length} locations for route ${route.id}`,
      );
      return success(locations.length);
    } catch (error) {
      logger.error("Failed to prefetch locations:", error);
      return failure(
        ReverseGeocodingError.apiRequestFailed(
          "prefetch failed",
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Check if locations are cached for a route
   */
  hasRouteCache(routeId: string): boolean {
    return this.routeCache.has(routeId);
  }

  /**
   * Clear cached location data for a route
   */
  async clearRouteCache(routeId: string): Promise<Result<void>> {
    this.routeCache.delete(routeId);

    try {
      const cachePath = path.join(CACHE_DIR, `${routeId}.json`);
      await fs.unlink(cachePath).catch(() => {
        // Ignore if file doesn't exist
      });
      logger.info(`Cleared location cache for route ${routeId}`);
      return success(undefined);
    } catch (error) {
      return failure(
        ReverseGeocodingError.cacheWriteFailed(
          routeId,
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Clear all cached location data
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
      logger.info("Cleared all location cache");
      return success(undefined);
    } catch (error) {
      return failure(
        ReverseGeocodingError.cacheWriteFailed(
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
    logger.info("ReverseGeocodingService disposed");
  }

  // ============================================
  // Private helper methods
  // ============================================

  /**
   * Find location in cached data for a position
   */
  private findLocationInCache(position: GPSCoordinate): LocationData | null {
    // Search all cached routes for the nearest location
    let nearest: { entry: CachedLocationEntry; distance: number } | null = null;

    for (const locations of this.routeCache.values()) {
      for (const entry of locations) {
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
        ...nearest.entry.location,
        distance: nearest.distance,
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
   * Query Nominatim API for location at coordinate
   */
  private async queryNominatimApi(
    lat: number,
    lon: number,
  ): Promise<Result<LocationData | null>> {
    const url = `${NOMINATIM_API_URL}?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Papertrail GPS Tracker (https://github.com/papertrail)",
          Accept: "application/json",
        },
      });

      if (response.status === 429) {
        return failure(ReverseGeocodingError.apiRateLimited());
      }

      if (!response.ok) {
        return failure(
          ReverseGeocodingError.apiRequestFailed(
            `HTTP ${response.status}: ${response.statusText}`,
          ),
        );
      }

      const data = (await response.json()) as NominatimResponse;

      // Check for API error
      if (data.error) {
        logger.warn(`Nominatim returned error: ${data.error}`);
        return success(null);
      }

      const location = this.parseNominatimResponse(data);
      return success(location);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return failure(
          ReverseGeocodingError.apiRequestFailed("Request timeout"),
        );
      }
      return failure(
        ReverseGeocodingError.apiUnavailable(
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  /**
   * Parse Nominatim API response into LocationData
   */
  private parseNominatimResponse(
    response: NominatimResponse,
  ): LocationData | null {
    if (!response.display_name) {
      return null;
    }

    const address = response.address || {};

    // Build a shorter display name from address components
    const displayParts: string[] = [];

    // Add street name
    if (address.road) {
      displayParts.push(address.road);
    }

    // Add locality (town/city/village)
    const locality =
      address.city || address.town || address.village || address.municipality;
    if (locality) {
      displayParts.push(locality);
    }

    // Fallback to full display name if we couldn't build one
    const displayName =
      displayParts.length > 0
        ? displayParts.join(", ")
        : response.display_name.split(",").slice(0, 2).join(", ");

    return {
      displayName,
      street: address.road,
      locality,
      region: address.county || address.state,
      country: address.country,
      postcode: address.postcode,
      placeId: response.place_id,
    };
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
            this.routeCache.set(data.routeId, data.locations);
            logger.debug(`Loaded cached locations for route ${data.routeId}`);
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
    locations: CachedLocationEntry[],
  ): Promise<void> {
    const cacheData: RouteCacheData = {
      routeId,
      createdAt: new Date().toISOString(),
      locations,
    };

    const cachePath = path.join(CACHE_DIR, `${routeId}.json`);
    await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2), "utf-8");
    logger.debug(`Saved location cache for route ${routeId}`);
  }
}
