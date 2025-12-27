import { Result, success, failure, GPSCoordinate } from "@core/types";
import {
  IOfflineRoutingService,
  OSRMRegion,
  InstalledRegion,
  OSRMRouteResponse,
  RoutingProfile,
  DownloadProgressCallback,
} from "@core/interfaces";
import { OfflineRoutingError } from "@core/errors";
import { getLogger } from "@utils/logger";

const logger = getLogger("MockOfflineRoutingService");

/**
 * Mock Offline Routing Service
 *
 * Used when OSRM bindings are not available (non-Linux platforms, missing native module).
 * All routing methods return failure indicating offline routing is unavailable.
 * This allows the application to gracefully fall back to online routing.
 */
export class MockOfflineRoutingService implements IOfflineRoutingService {
  private initialized = false;

  async initialize(): Promise<Result<void>> {
    logger.info(
      "MockOfflineRoutingService initialized - offline routing unavailable",
    );
    this.initialized = true;
    return success(undefined);
  }

  isAvailable(): boolean {
    return false;
  }

  hasBindings(): boolean {
    return false;
  }

  async canRoute(_start: GPSCoordinate, _end: GPSCoordinate): Promise<boolean> {
    return false;
  }

  async calculateRoute(
    _start: GPSCoordinate,
    _end: GPSCoordinate,
    _profile: RoutingProfile,
  ): Promise<Result<OSRMRouteResponse>> {
    return failure(OfflineRoutingError.bindingsUnavailable());
  }

  async listAvailableRegions(): Promise<Result<OSRMRegion[]>> {
    // Return empty list - no regions available without bindings
    return success([]);
  }

  listInstalledRegions(): InstalledRegion[] {
    return [];
  }

  async downloadRegion(
    regionId: string,
    _profile?: RoutingProfile,
    _onProgress?: DownloadProgressCallback,
  ): Promise<Result<void>> {
    logger.warn(
      `Cannot download region "${regionId}" - OSRM bindings unavailable`,
    );
    return failure(OfflineRoutingError.bindingsUnavailable());
  }

  async deleteRegion(regionId: string): Promise<Result<void>> {
    logger.warn(
      `Cannot delete region "${regionId}" - OSRM bindings unavailable`,
    );
    return failure(OfflineRoutingError.bindingsUnavailable());
  }

  getRegionForCoordinate(_coord: GPSCoordinate): InstalledRegion | null {
    return null;
  }

  async loadRegion(regionId: string): Promise<Result<void>> {
    logger.warn(`Cannot load region "${regionId}" - OSRM bindings unavailable`);
    return failure(OfflineRoutingError.bindingsUnavailable());
  }

  unloadRegion(_regionId: string): void {
    // No-op
  }

  getLoadedRegions(): string[] {
    return [];
  }

  getDiskUsage(): number {
    return 0;
  }

  getMemoryUsage(): number {
    return 0;
  }

  async dispose(): Promise<void> {
    this.initialized = false;
    logger.info("MockOfflineRoutingService disposed");
  }
}
