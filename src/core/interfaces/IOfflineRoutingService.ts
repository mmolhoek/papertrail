import { Result, GPSCoordinate } from "@core/types";

/**
 * Routing profile for OSRM
 */
export type RoutingProfile = "car" | "bike" | "foot";

/**
 * Bounding box for a geographic region
 */
export interface RegionBounds {
  /** Northern latitude boundary */
  north: number;
  /** Southern latitude boundary */
  south: number;
  /** Eastern longitude boundary */
  east: number;
  /** Western longitude boundary */
  west: number;
}

/**
 * Available OSRM region from the manifest
 */
export interface OSRMRegion {
  /** Unique identifier (e.g., "europe/netherlands") */
  id: string;
  /** Human-readable name (e.g., "Netherlands") */
  name: string;
  /** Parent region ID (e.g., "europe") */
  parent?: string;
  /** Download size in bytes */
  sizeBytes: number;
  /** Geographic bounding box */
  bounds: RegionBounds;
  /** Last update timestamp (ISO string) */
  lastUpdated: string;
  /** Available routing profiles */
  profiles: RoutingProfile[];
}

/**
 * Installed OSRM region with local metadata
 */
export interface InstalledRegion extends OSRMRegion {
  /** When the region was installed (ISO string) */
  installedAt: string;
  /** Size on disk in bytes */
  diskSizeBytes: number;
  /** Whether the region is currently loaded in memory */
  loaded: boolean;
  /** The profile that was downloaded */
  profile: RoutingProfile;
}

/**
 * Download progress for region installation
 */
export interface RegionDownloadProgress {
  /** Region being downloaded */
  regionId: string;
  /** Bytes downloaded so far */
  bytesDownloaded: number;
  /** Total bytes to download */
  totalBytes: number;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Current state of the download */
  state: "downloading" | "extracting" | "complete" | "error";
  /** Error message if state is "error" */
  error?: string;
}

/**
 * Callback type for download progress updates
 */
export type DownloadProgressCallback = (
  progress: RegionDownloadProgress,
) => void;

/**
 * OSRM route response matching the online OSRM API format
 * This ensures compatibility between online and offline routing
 */
export interface OSRMRouteResponse {
  /** Status code ("Ok" for success) */
  code: string;
  /** Array of calculated routes */
  routes: Array<{
    /** Route geometry in GeoJSON format */
    geometry: {
      type: "LineString";
      coordinates: [number, number][]; // [lon, lat] pairs
    };
    /** Route legs (one per waypoint pair) */
    legs: Array<{
      /** Turn-by-turn steps */
      steps: Array<{
        /** Distance of this step in meters */
        distance: number;
        /** Duration of this step in seconds */
        duration: number;
        /** Street name */
        name: string;
        /** Maneuver information */
        maneuver: {
          /** Type of maneuver */
          type: string;
          /** Modifier (left, right, etc.) */
          modifier?: string;
          /** Location of the maneuver [lon, lat] */
          location: [number, number];
          /** Bearing after the maneuver */
          bearing_after: number;
          /** Bearing before the maneuver */
          bearing_before: number;
        };
      }>;
      /** Total distance for this leg in meters */
      distance: number;
      /** Total duration for this leg in seconds */
      duration: number;
    }>;
    /** Total route distance in meters */
    distance: number;
    /** Total route duration in seconds */
    duration: number;
  }>;
  /** Waypoints used for the route */
  waypoints?: Array<{
    /** Snapped location [lon, lat] */
    location: [number, number];
    /** Name of the location */
    name: string;
  }>;
}

/**
 * Offline Routing Service Interface
 *
 * Provides offline route calculation using locally stored OSRM data files.
 * Supports downloading, managing, and querying regional OSRM data for
 * route calculation without internet connectivity.
 *
 * This service is designed to:
 * 1. Download pre-processed OSRM data files for regions
 * 2. Load regions into memory for fast route calculation
 * 3. Calculate routes that match the online OSRM API format
 * 4. Support seamless fallback between offline and online routing
 */
export interface IOfflineRoutingService {
  /**
   * Initialize the service
   * Loads OSRM bindings and scans for installed regions
   * @returns Result indicating success or failure
   */
  initialize(): Promise<Result<void>>;

  /**
   * Check if offline routing is available
   * Returns true if OSRM bindings are loaded and at least one region is installed
   * @returns true if offline routing can be used
   */
  isAvailable(): boolean;

  /**
   * Check if OSRM Node.js bindings are available
   * Returns true if the @project-osrm/osrm package is installed and loadable
   * @returns true if bindings are available
   */
  hasBindings(): boolean;

  /**
   * Check if a route can be calculated offline between two coordinates
   * Verifies that both coordinates fall within an installed region
   * @param start Starting coordinate
   * @param end Ending coordinate
   * @returns true if both points are within an installed region
   */
  canRoute(start: GPSCoordinate, end: GPSCoordinate): Promise<boolean>;

  /**
   * Calculate a route between two coordinates using local OSRM data
   * @param start Starting coordinate
   * @param end Ending coordinate
   * @param profile Routing profile (car, bike, foot)
   * @returns OSRM-compatible route response
   */
  calculateRoute(
    start: GPSCoordinate,
    end: GPSCoordinate,
    profile: RoutingProfile,
  ): Promise<Result<OSRMRouteResponse>>;

  /**
   * List available regions from the manifest
   * Fetches the region manifest from the configured URL
   * @returns Array of available regions for download
   */
  listAvailableRegions(): Promise<Result<OSRMRegion[]>>;

  /**
   * List locally installed regions
   * @returns Array of installed regions with their status
   */
  listInstalledRegions(): InstalledRegion[];

  /**
   * Download and install a region
   * @param regionId Region ID to download (e.g., "europe/netherlands")
   * @param profile Routing profile to download (defaults to "car")
   * @param onProgress Optional callback for download progress
   * @returns Result indicating success or failure
   */
  downloadRegion(
    regionId: string,
    profile?: RoutingProfile,
    onProgress?: DownloadProgressCallback,
  ): Promise<Result<void>>;

  /**
   * Delete an installed region
   * Removes the region files from disk and unloads from memory
   * @param regionId Region ID to delete
   * @returns Result indicating success or failure
   */
  deleteRegion(regionId: string): Promise<Result<void>>;

  /**
   * Find which installed region contains a coordinate
   * @param coord Coordinate to check
   * @returns The installed region containing the coordinate, or null
   */
  getRegionForCoordinate(coord: GPSCoordinate): InstalledRegion | null;

  /**
   * Load a region into memory for route calculation
   * @param regionId Region ID to load
   * @returns Result indicating success or failure
   */
  loadRegion(regionId: string): Promise<Result<void>>;

  /**
   * Unload a region from memory to free resources
   * @param regionId Region ID to unload
   */
  unloadRegion(regionId: string): void;

  /**
   * Get list of currently loaded region IDs
   * @returns Array of loaded region IDs
   */
  getLoadedRegions(): string[];

  /**
   * Get total disk space used by installed regions in bytes
   * @returns Total disk space used
   */
  getDiskUsage(): number;

  /**
   * Get estimated memory usage of loaded regions in bytes
   * @returns Estimated memory usage
   */
  getMemoryUsage(): number;

  /**
   * Clean up resources
   * Unloads all regions and releases OSRM instances
   */
  dispose(): Promise<void>;
}
