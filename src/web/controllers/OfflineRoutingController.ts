import { Request, Response } from "express";
import {
  IOfflineRoutingService,
  IConfigService,
  RegionDownloadProgress,
} from "@core/interfaces";
import { isSuccess } from "@core/types";
import { getLogger } from "@utils/logger";

const logger = getLogger("OfflineRoutingController");

/**
 * Callback for emitting download progress events via WebSocket
 */
export type DownloadProgressEmitter = (
  progress: RegionDownloadProgress,
) => void;

/**
 * Offline Routing Controller
 *
 * Handles API endpoints for offline routing region management:
 * - List available regions from manifest
 * - List installed regions
 * - Download/delete regions
 * - Get routing status
 */
export class OfflineRoutingController {
  private progressEmitter: DownloadProgressEmitter | null = null;

  constructor(
    private readonly offlineRoutingService?: IOfflineRoutingService,
    private readonly configService?: IConfigService,
  ) {}

  /**
   * Set the WebSocket progress emitter for download progress updates
   */
  setProgressEmitter(emitter: DownloadProgressEmitter): void {
    this.progressEmitter = emitter;
  }

  /**
   * GET /api/routing/status
   * Get offline routing status
   */
  async getStatus(_req: Request, res: Response): Promise<void> {
    if (!this.offlineRoutingService) {
      res.status(503).json({
        success: false,
        error: "Offline routing service not available",
      });
      return;
    }

    const installedRegions = this.offlineRoutingService.listInstalledRegions();
    const loadedRegions = this.offlineRoutingService.getLoadedRegions();

    res.json({
      success: true,
      data: {
        available: this.offlineRoutingService.isAvailable(),
        hasBindings: this.offlineRoutingService.hasBindings(),
        enabled: this.configService?.getOfflineRoutingEnabled() ?? true,
        preferOffline: this.configService?.getPreferOfflineRouting() ?? true,
        installedRegionCount: installedRegions.length,
        loadedRegionCount: loadedRegions.length,
        loadedRegions,
        diskUsage: this.offlineRoutingService.getDiskUsage(),
        memoryUsage: this.offlineRoutingService.getMemoryUsage(),
      },
    });
  }

  /**
   * GET /api/routing/regions/available
   * List available regions from manifest
   */
  async getAvailableRegions(req: Request, res: Response): Promise<void> {
    if (!this.offlineRoutingService) {
      res.status(503).json({
        success: false,
        error: "Offline routing service not available",
      });
      return;
    }

    let manifestUrl = this.configService?.getOfflineRoutingManifestUrl() ?? "";

    // Convert relative URLs to absolute using request host
    if (manifestUrl && manifestUrl.startsWith("/")) {
      const protocol = req.secure ? "https" : "http";
      const host = req.get("host") || "localhost:3000";
      manifestUrl = `${protocol}://${host}${manifestUrl}`;
    }

    const result =
      await this.offlineRoutingService.listAvailableRegions(manifestUrl);

    if (!isSuccess(result)) {
      res.status(500).json({
        success: false,
        error: result.error.message,
      });
      return;
    }

    res.json({
      success: true,
      data: {
        regions: result.data,
        manifestUrl: this.configService?.getOfflineRoutingManifestUrl() ?? "",
      },
    });
  }

  /**
   * GET /api/routing/regions/installed
   * List installed regions
   */
  async getInstalledRegions(_req: Request, res: Response): Promise<void> {
    if (!this.offlineRoutingService) {
      res.status(503).json({
        success: false,
        error: "Offline routing service not available",
      });
      return;
    }

    const regions = this.offlineRoutingService.listInstalledRegions();

    res.json({
      success: true,
      data: {
        regions,
        totalDiskUsage: this.offlineRoutingService.getDiskUsage(),
      },
    });
  }

  /**
   * POST /api/routing/regions/:regionId/download
   * Download a region
   */
  async downloadRegion(req: Request, res: Response): Promise<void> {
    if (!this.offlineRoutingService) {
      res.status(503).json({
        success: false,
        error: "Offline routing service not available",
      });
      return;
    }

    const { regionId } = req.params;
    const { profile = "car" } = req.body;

    if (!regionId) {
      res.status(400).json({
        success: false,
        error: "Region ID is required",
      });
      return;
    }

    logger.info(`Starting download for region: ${regionId} (${profile})`);

    // Start download - emit progress events via WebSocket
    const result = await this.offlineRoutingService.downloadRegion(
      regionId,
      profile,
      (progress) => {
        logger.debug(`Download progress: ${progress.percentage}%`);
        // Emit progress via WebSocket if emitter is configured
        if (this.progressEmitter) {
          this.progressEmitter(progress);
        }
      },
    );

    if (!isSuccess(result)) {
      res.status(500).json({
        success: false,
        error: result.error.message,
      });
      return;
    }

    res.json({
      success: true,
      message: `Region ${regionId} downloaded successfully`,
    });
  }

  /**
   * DELETE /api/routing/regions/:regionId
   * Delete an installed region
   */
  async deleteRegion(req: Request, res: Response): Promise<void> {
    if (!this.offlineRoutingService) {
      res.status(503).json({
        success: false,
        error: "Offline routing service not available",
      });
      return;
    }

    const { regionId } = req.params;

    if (!regionId) {
      res.status(400).json({
        success: false,
        error: "Region ID is required",
      });
      return;
    }

    logger.info(`Deleting region: ${regionId}`);

    const result = await this.offlineRoutingService.deleteRegion(regionId);

    if (!isSuccess(result)) {
      res.status(500).json({
        success: false,
        error: result.error.message,
      });
      return;
    }

    // Update config
    this.configService?.removeInstalledOfflineRegion(regionId);
    await this.configService?.save();

    res.json({
      success: true,
      message: `Region ${regionId} deleted successfully`,
    });
  }

  /**
   * POST /api/routing/regions/:regionId/load
   * Load a region into memory
   */
  async loadRegion(req: Request, res: Response): Promise<void> {
    if (!this.offlineRoutingService) {
      res.status(503).json({
        success: false,
        error: "Offline routing service not available",
      });
      return;
    }

    const { regionId } = req.params;

    if (!regionId) {
      res.status(400).json({
        success: false,
        error: "Region ID is required",
      });
      return;
    }

    logger.info(`Loading region: ${regionId}`);

    const result = await this.offlineRoutingService.loadRegion(regionId);

    if (!isSuccess(result)) {
      res.status(500).json({
        success: false,
        error: result.error.message,
      });
      return;
    }

    res.json({
      success: true,
      message: `Region ${regionId} loaded successfully`,
      loadedRegions: this.offlineRoutingService.getLoadedRegions(),
    });
  }

  /**
   * POST /api/routing/regions/:regionId/unload
   * Unload a region from memory
   */
  async unloadRegion(req: Request, res: Response): Promise<void> {
    if (!this.offlineRoutingService) {
      res.status(503).json({
        success: false,
        error: "Offline routing service not available",
      });
      return;
    }

    const { regionId } = req.params;

    if (!regionId) {
      res.status(400).json({
        success: false,
        error: "Region ID is required",
      });
      return;
    }

    logger.info(`Unloading region: ${regionId}`);

    this.offlineRoutingService.unloadRegion(regionId);

    res.json({
      success: true,
      message: `Region ${regionId} unloaded successfully`,
      loadedRegions: this.offlineRoutingService.getLoadedRegions(),
    });
  }

  /**
   * POST /api/routing/config/enabled
   * Enable/disable offline routing
   */
  async setEnabled(req: Request, res: Response): Promise<void> {
    if (!this.configService) {
      res.status(503).json({
        success: false,
        error: "Config service not available",
      });
      return;
    }

    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      res.status(400).json({
        success: false,
        error: "enabled must be a boolean",
      });
      return;
    }

    this.configService.setOfflineRoutingEnabled(enabled);
    await this.configService.save();

    res.json({
      success: true,
      message: `Offline routing ${enabled ? "enabled" : "disabled"}`,
    });
  }

  /**
   * POST /api/routing/config/prefer-offline
   * Set prefer offline routing preference
   */
  async setPreferOffline(req: Request, res: Response): Promise<void> {
    if (!this.configService) {
      res.status(503).json({
        success: false,
        error: "Config service not available",
      });
      return;
    }

    const { prefer } = req.body;

    if (typeof prefer !== "boolean") {
      res.status(400).json({
        success: false,
        error: "prefer must be a boolean",
      });
      return;
    }

    this.configService.setPreferOfflineRouting(prefer);
    await this.configService.save();

    res.json({
      success: true,
      message: `Prefer offline routing ${prefer ? "enabled" : "disabled"}`,
    });
  }

  /**
   * POST /api/routing/config/manifest-url
   * Set the region manifest URL
   */
  async setManifestUrl(req: Request, res: Response): Promise<void> {
    if (!this.configService) {
      res.status(503).json({
        success: false,
        error: "Config service not available",
      });
      return;
    }

    const { url } = req.body;

    if (typeof url !== "string" || !url) {
      res.status(400).json({
        success: false,
        error: "url must be a non-empty string",
      });
      return;
    }

    this.configService.setOfflineRoutingManifestUrl(url);
    await this.configService.save();

    res.json({
      success: true,
      message: "Manifest URL updated",
    });
  }
}
