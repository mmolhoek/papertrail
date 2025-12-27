import * as fs from "fs/promises";
import * as path from "path";
import { Result, success, failure, GPSCoordinate } from "@core/types";
import {
  IOfflineRoutingService,
  OSRMRegion,
  InstalledRegion,
  OSRMRouteResponse,
  RoutingProfile,
  DownloadProgressCallback,
  RegionBounds,
} from "@core/interfaces";
import { OfflineRoutingError } from "@core/errors";
import { getLogger } from "@utils/logger";

const logger = getLogger("OfflineRoutingService");

// OSRM bindings type (loaded dynamically)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OSRMInstance = any;

/**
 * Default directory for OSRM region data
 */
const OSRM_REGIONS_DIR = "./data/osrm-regions";

/**
 * Maximum number of regions to keep loaded in memory
 */
const MAX_LOADED_REGIONS = 2;

/**
 * Offline Routing Service Implementation
 *
 * Provides offline route calculation using locally stored OSRM data files.
 * Uses the @project-osrm/osrm Node.js bindings for route calculation.
 */
export class OfflineRoutingService implements IOfflineRoutingService {
  private initialized = false;
  private osrmBindingsAvailable = false;
  private OSRMClass: new (options: { path: string }) => OSRMInstance = null!;

  /** Loaded OSRM instances by region ID */
  private loadedRegions: Map<string, OSRMInstance> = new Map();

  /** Order of region loading for LRU eviction */
  private loadOrder: string[] = [];

  /** Cached installed regions metadata */
  private installedRegionsCache: InstalledRegion[] = [];

  /** Data directory path */
  private readonly regionsDir: string;

  constructor(regionsDir: string = OSRM_REGIONS_DIR) {
    this.regionsDir = regionsDir;
  }

  async initialize(): Promise<Result<void>> {
    if (this.initialized) {
      return success(undefined);
    }

    try {
      // Try to load OSRM bindings
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const osrm = require("@project-osrm/osrm");
      this.OSRMClass = osrm;
      this.osrmBindingsAvailable = true;
      logger.info("OSRM bindings loaded successfully");
    } catch {
      logger.warn("OSRM bindings not available - offline routing disabled");
      this.osrmBindingsAvailable = false;
    }

    // Ensure regions directory exists
    try {
      await fs.mkdir(this.regionsDir, { recursive: true });
    } catch (error) {
      logger.error("Failed to create regions directory", { error });
    }

    // Scan for installed regions
    await this.scanInstalledRegions();

    this.initialized = true;
    logger.info("OfflineRoutingService initialized", {
      bindingsAvailable: this.osrmBindingsAvailable,
      installedRegions: this.installedRegionsCache.length,
    });

    return success(undefined);
  }

  isAvailable(): boolean {
    return this.osrmBindingsAvailable && this.installedRegionsCache.length > 0;
  }

  hasBindings(): boolean {
    return this.osrmBindingsAvailable;
  }

  async canRoute(start: GPSCoordinate, end: GPSCoordinate): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    const startRegion = this.getRegionForCoordinate(start);
    const endRegion = this.getRegionForCoordinate(end);

    // Both coordinates must be in the same installed region
    return (
      startRegion !== null &&
      endRegion !== null &&
      startRegion.id === endRegion.id
    );
  }

  async calculateRoute(
    start: GPSCoordinate,
    end: GPSCoordinate,
    profile: RoutingProfile,
  ): Promise<Result<OSRMRouteResponse>> {
    if (!this.initialized) {
      return failure(OfflineRoutingError.serviceNotInitialized());
    }

    if (!this.osrmBindingsAvailable) {
      return failure(OfflineRoutingError.bindingsUnavailable());
    }

    // Find region containing both points
    const startRegion = this.getRegionForCoordinate(start);
    const endRegion = this.getRegionForCoordinate(end);

    if (!startRegion || !endRegion || startRegion.id !== endRegion.id) {
      return failure(
        OfflineRoutingError.coordinatesOutsideRegion(
          { latitude: start.latitude, longitude: start.longitude },
          { latitude: end.latitude, longitude: end.longitude },
        ),
      );
    }

    // Check profile matches
    if (startRegion.profile !== profile) {
      return failure(
        OfflineRoutingError.regionNotFound(
          `${startRegion.id} with profile ${profile}`,
        ),
      );
    }

    // Ensure region is loaded
    const loadResult = await this.loadRegion(startRegion.id);
    if (!loadResult.success) {
      return failure(loadResult.error);
    }

    const osrmInstance = this.loadedRegions.get(startRegion.id);
    if (!osrmInstance) {
      return failure(OfflineRoutingError.regionNotLoaded(startRegion.id));
    }

    // Calculate route
    try {
      const routeResult = await this.calculateRouteWithOSRM(
        osrmInstance,
        start,
        end,
      );
      return success(routeResult);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return failure(
        OfflineRoutingError.routeCalculationFailed(err.message, err),
      );
    }
  }

  private calculateRouteWithOSRM(
    osrm: OSRMInstance,
    start: GPSCoordinate,
    end: GPSCoordinate,
  ): Promise<OSRMRouteResponse> {
    return new Promise((resolve, reject) => {
      const options = {
        coordinates: [
          [start.longitude, start.latitude],
          [end.longitude, end.latitude],
        ],
        overview: "full",
        geometries: "geojson",
        steps: true,
      };

      osrm.route(options, (err: Error | null, result: OSRMRouteResponse) => {
        if (err) {
          reject(err);
        } else if (result.code !== "Ok") {
          reject(new Error(`OSRM returned code: ${result.code}`));
        } else {
          resolve(result);
        }
      });
    });
  }

  async listAvailableRegions(): Promise<Result<OSRMRegion[]>> {
    // TODO: Implement manifest fetching from configurable URL
    // For now, return empty array as we don't have a manifest server yet
    logger.warn("listAvailableRegions: Manifest fetching not yet implemented");
    return success([]);
  }

  listInstalledRegions(): InstalledRegion[] {
    return [...this.installedRegionsCache];
  }

  async downloadRegion(
    regionId: string,
    profile: RoutingProfile = "car",
    onProgress?: DownloadProgressCallback,
  ): Promise<Result<void>> {
    if (!this.osrmBindingsAvailable) {
      return failure(OfflineRoutingError.bindingsUnavailable());
    }

    // TODO: Implement region downloading from manifest URL
    // For now, return error as we don't have a manifest server yet
    logger.warn(
      `downloadRegion: Downloading not yet implemented for ${regionId} (${profile})`,
    );

    if (onProgress) {
      onProgress({
        regionId,
        bytesDownloaded: 0,
        totalBytes: 0,
        percentage: 0,
        state: "error",
        error: "Region downloading not yet implemented",
      });
    }

    return failure(
      OfflineRoutingError.downloadFailed(
        regionId,
        new Error("Region downloading not yet implemented"),
      ),
    );
  }

  async deleteRegion(regionId: string): Promise<Result<void>> {
    // Unload if loaded
    this.unloadRegion(regionId);

    // Find region in cache
    const regionIndex = this.installedRegionsCache.findIndex(
      (r) => r.id === regionId,
    );
    if (regionIndex === -1) {
      return failure(OfflineRoutingError.regionNotFound(regionId));
    }

    // Delete region directory
    const regionPath = this.getRegionPath(regionId);
    try {
      await fs.rm(regionPath, { recursive: true, force: true });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to delete region ${regionId}`, { error: err });
      // Continue anyway - remove from cache
    }

    // Remove from cache
    this.installedRegionsCache.splice(regionIndex, 1);

    logger.info(`Deleted region ${regionId}`);
    return success(undefined);
  }

  getRegionForCoordinate(coord: GPSCoordinate): InstalledRegion | null {
    for (const region of this.installedRegionsCache) {
      if (this.isCoordinateInBounds(coord, region.bounds)) {
        return region;
      }
    }
    return null;
  }

  private isCoordinateInBounds(
    coord: GPSCoordinate,
    bounds: RegionBounds,
  ): boolean {
    return (
      coord.latitude >= bounds.south &&
      coord.latitude <= bounds.north &&
      coord.longitude >= bounds.west &&
      coord.longitude <= bounds.east
    );
  }

  async loadRegion(regionId: string): Promise<Result<void>> {
    if (!this.osrmBindingsAvailable) {
      return failure(OfflineRoutingError.bindingsUnavailable());
    }

    // Check if already loaded
    if (this.loadedRegions.has(regionId)) {
      // Move to end of load order (most recently used)
      this.loadOrder = this.loadOrder.filter((id) => id !== regionId);
      this.loadOrder.push(regionId);
      return success(undefined);
    }

    // Check if region exists
    const region = this.installedRegionsCache.find((r) => r.id === regionId);
    if (!region) {
      return failure(OfflineRoutingError.regionNotFound(regionId));
    }

    // Evict oldest region if at capacity
    while (this.loadedRegions.size >= MAX_LOADED_REGIONS) {
      const oldestId = this.loadOrder.shift();
      if (oldestId) {
        this.unloadRegion(oldestId);
      }
    }

    // Load the region
    const osrmPath = path.join(
      this.getRegionPath(regionId),
      `${region.profile}.osrm`,
    );

    try {
      const osrm = new this.OSRMClass({ path: osrmPath });
      this.loadedRegions.set(regionId, osrm);
      this.loadOrder.push(regionId);

      // Update loaded status in cache
      const cacheIndex = this.installedRegionsCache.findIndex(
        (r) => r.id === regionId,
      );
      if (cacheIndex !== -1) {
        this.installedRegionsCache[cacheIndex].loaded = true;
      }

      logger.info(`Loaded region ${regionId}`);
      return success(undefined);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return failure(OfflineRoutingError.loadFailed(regionId, err));
    }
  }

  unloadRegion(regionId: string): void {
    const osrm = this.loadedRegions.get(regionId);
    if (osrm) {
      // OSRM doesn't have a close method, just remove reference
      this.loadedRegions.delete(regionId);
      this.loadOrder = this.loadOrder.filter((id) => id !== regionId);

      // Update loaded status in cache
      const cacheIndex = this.installedRegionsCache.findIndex(
        (r) => r.id === regionId,
      );
      if (cacheIndex !== -1) {
        this.installedRegionsCache[cacheIndex].loaded = false;
      }

      logger.info(`Unloaded region ${regionId}`);
    }
  }

  getLoadedRegions(): string[] {
    return [...this.loadedRegions.keys()];
  }

  getDiskUsage(): number {
    return this.installedRegionsCache.reduce(
      (total, region) => total + region.diskSizeBytes,
      0,
    );
  }

  getMemoryUsage(): number {
    // Estimate memory usage based on disk size (~5x multiplier for OSRM)
    let totalMemory = 0;
    for (const regionId of this.loadedRegions.keys()) {
      const region = this.installedRegionsCache.find((r) => r.id === regionId);
      if (region) {
        totalMemory += region.diskSizeBytes * 5;
      }
    }
    return totalMemory;
  }

  async dispose(): Promise<void> {
    // Unload all regions
    for (const regionId of [...this.loadedRegions.keys()]) {
      this.unloadRegion(regionId);
    }

    this.initialized = false;
    logger.info("OfflineRoutingService disposed");
  }

  // Private helper methods

  private getRegionPath(regionId: string): string {
    // Convert region ID to safe directory name
    const safeName = regionId.replace(/\//g, "-");
    return path.join(this.regionsDir, safeName);
  }

  private async scanInstalledRegions(): Promise<void> {
    this.installedRegionsCache = [];

    try {
      const entries = await fs.readdir(this.regionsDir, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const metadataPath = path.join(
            this.regionsDir,
            entry.name,
            "metadata.json",
          );

          try {
            const metadataContent = await fs.readFile(metadataPath, "utf-8");
            const metadata = JSON.parse(metadataContent) as InstalledRegion;
            metadata.loaded = this.loadedRegions.has(metadata.id);
            this.installedRegionsCache.push(metadata);
          } catch {
            // No valid metadata, skip this directory
            logger.debug(
              `Skipping region directory without metadata: ${entry.name}`,
            );
          }
        }
      }

      logger.info(
        `Found ${this.installedRegionsCache.length} installed regions`,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.error("Failed to scan installed regions", { error });
      }
    }
  }
}
