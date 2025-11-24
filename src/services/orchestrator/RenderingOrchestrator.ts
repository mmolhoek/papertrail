import { IRenderingOrchestrator } from "@core/interfaces";
import {
  IGPSService,
  IMapService,
  ISVGService,
  IEpaperService,
  IConfigService,
} from "@core/interfaces";
import {
  Result,
  GPSCoordinate,
  SystemStatus,
  success,
  failure,
} from "@core/types";
import { OrchestratorError, OrchestratorErrorCode } from "@core/errors";

/**
 * Rendering Orchestrator Implementation
 *
 * Coordinates all services to update the display.
 * This is the main application service that ties everything together.
 */
export class RenderingOrchestrator implements IRenderingOrchestrator {
  private isInitialized: boolean = false;
  private autoUpdateInterval: NodeJS.Timeout | null = null;
  private displayUpdateCallbacks: Array<(success: boolean) => void> = [];
  private errorCallbacks: Array<(error: Error) => void> = [];

  constructor(
    private readonly gpsService: IGPSService,
    private readonly mapService: IMapService,
    private readonly svgService: ISVGService,
    private readonly epaperService: IEpaperService,
    private readonly configService: IConfigService,
  ) {}

  /**
   * Initialize the orchestrator and all dependent services
   */
  async initialize(): Promise<Result<void>> {
    if (this.isInitialized) {
      return success(undefined);
    }

    try {
      // Initialize config service first
      const configResult = await this.configService.initialize();
      if (!configResult.success) {
        return failure(
          OrchestratorError.initFailed("ConfigService", configResult.error),
        );
      }

      // Initialize GPS service
      const gpsResult = await this.gpsService.initialize();
      if (!gpsResult.success) {
        return failure(
          OrchestratorError.initFailed("GPSService", gpsResult.error),
        );
      }

      // Initialize e-paper service
      const epaperResult = await this.epaperService.initialize();
      if (!epaperResult.success) {
        return failure(
          OrchestratorError.initFailed("EpaperService", epaperResult.error),
        );
      }

      // Start GPS tracking
      await this.gpsService.startTracking();

      this.isInitialized = true;
      return success(undefined);
    } catch (error) {
      if (error instanceof Error) {
        return failure(OrchestratorError.initFailed("Orchestrator", error));
      }
      return failure(
        OrchestratorError.initFailed(
          "Orchestrator",
          new Error("Unknown error"),
        ),
      );
    }
  }

  /**
   * Update the display with current GPS position and active track
   */
  async updateDisplay(): Promise<Result<void>> {
    if (!this.isInitialized) {
      return failure(OrchestratorError.notInitialized());
    }

    try {
      // Step 1: Get current GPS position
      const positionResult = await this.gpsService.getCurrentPosition();
      if (!positionResult.success) {
        this.notifyError(positionResult.error);
        return failure(
          OrchestratorError.updateFailed("GPS position", positionResult.error),
        );
      }

      // Step 2: Get active GPX path
      const gpxPath = this.configService.getActiveGPXPath();
      if (!gpxPath) {
        return failure(OrchestratorError.noActiveGPX());
      }

      // Step 3: Load GPX track
      const trackResult = await this.mapService.getTrack(gpxPath);
      if (!trackResult.success) {
        this.notifyError(trackResult.error);
        return failure(
          OrchestratorError.updateFailed("GPX track load", trackResult.error),
        );
      }

      // Step 4: Render viewport
      const viewport = {
        width: this.configService.getDisplayWidth(),
        height: this.configService.getDisplayHeight(),
        centerPoint: positionResult.data,
        zoomLevel: this.configService.getZoomLevel(),
      };

      const renderOptions = this.configService.getRenderOptions();

      const bitmapResult = await this.svgService.renderViewport(
        trackResult.data,
        viewport,
        renderOptions,
      );

      if (!bitmapResult.success) {
        this.notifyError(bitmapResult.error);
        return failure(
          OrchestratorError.updateFailed("Viewport render", bitmapResult.error),
        );
      }

      // Step 5: Display on e-paper
      const displayResult = await this.epaperService.displayBitmap(
        bitmapResult.data,
      );

      if (!displayResult.success) {
        this.notifyError(displayResult.error);
        return failure(
          OrchestratorError.updateFailed(
            "E-paper display",
            displayResult.error,
          ),
        );
      }

      // Notify success
      this.notifyDisplayUpdate(true);
      return success(undefined);
    } catch (error) {
      if (error instanceof Error) {
        this.notifyError(error);
        return failure(OrchestratorError.updateFailed("unknown", error));
      }
      return failure(
        OrchestratorError.updateFailed("unknown", new Error("Unknown error")),
      );
    }
  }

  /**
   * Set the active GPX file and update display
   */
  async setActiveGPX(filePath: string): Promise<Result<void>> {
    if (!this.isInitialized) {
      return failure(OrchestratorError.notInitialized());
    }

    try {
      // Validate that the GPX file can be loaded
      const trackResult = await this.mapService.getTrack(filePath);
      if (!trackResult.success) {
        return trackResult;
      }

      // Set as active
      this.configService.setActiveGPXPath(filePath);

      // Save config
      await this.configService.save();

      // Update display
      return await this.updateDisplay();
    } catch (error) {
      if (error instanceof Error) {
        return failure(OrchestratorError.updateFailed("set active GPX", error));
      }
      return failure(
        OrchestratorError.updateFailed(
          "set active GPX",
          new Error("Unknown error"),
        ),
      );
    }
  }

  /**
   * Clear the active GPX file
   */
  async clearActiveGPX(): Promise<Result<void>> {
    this.configService.setActiveGPXPath(null);
    await this.configService.save();
    return success(undefined);
  }

  /**
   * Change zoom level and update display
   */
  async changeZoom(delta: number): Promise<Result<void>> {
    if (!this.isInitialized) {
      return failure(OrchestratorError.notInitialized());
    }

    const currentZoom = this.configService.getZoomLevel();
    const newZoom = currentZoom + delta;

    this.configService.setZoomLevel(newZoom);
    await this.configService.save();

    return await this.updateDisplay();
  }

  /**
   * Set absolute zoom level and update display
   */
  async setZoom(level: number): Promise<Result<void>> {
    if (!this.isInitialized) {
      return failure(OrchestratorError.notInitialized());
    }

    this.configService.setZoomLevel(level);
    await this.configService.save();

    return await this.updateDisplay();
  }

  /**
   * Refresh GPS position and update display
   */
  async refreshGPS(): Promise<Result<void>> {
    return await this.updateDisplay();
  }

  /**
   * Start automatic display updates at configured interval
   */
  async startAutoUpdate(): Promise<Result<void>> {
    if (!this.isInitialized) {
      return failure(OrchestratorError.notInitialized());
    }

    if (this.autoUpdateInterval) {
      return failure(OrchestratorError.alreadyRunning());
    }

    const intervalSeconds = this.configService.getAutoRefreshInterval();

    if (intervalSeconds <= 0) {
      return failure(
        new OrchestratorError(
          "Auto-refresh interval must be greater than 0",
          OrchestratorErrorCode.INVALID_STATE,
        ),
      );
    }

    this.autoUpdateInterval = setInterval(() => {
      this.updateDisplay().catch((error) => {
        console.error("Auto-update failed:", error);
      });
    }, intervalSeconds * 1000);

    return success(undefined);
  }

  /**
   * Stop automatic display updates
   */
  stopAutoUpdate(): void {
    if (this.autoUpdateInterval) {
      clearInterval(this.autoUpdateInterval);
      this.autoUpdateInterval = null;
    }
  }

  /**
   * Check if auto-update is running
   */
  isAutoUpdateRunning(): boolean {
    return this.autoUpdateInterval !== null;
  }

  /**
   * Get current GPS position
   */
  async getCurrentPosition(): Promise<Result<GPSCoordinate>> {
    if (!this.isInitialized) {
      return failure(OrchestratorError.notInitialized());
    }

    return await this.gpsService.getCurrentPosition();
  }

  /**
   * Get system status including all services
   */
  async getSystemStatus(): Promise<Result<SystemStatus>> {
    if (!this.isInitialized) {
      return failure(OrchestratorError.notInitialized());
    }

    try {
      const gpsStatus = await this.gpsService.getStatus();
      const epaperStatus = await this.epaperService.getStatus();
      const activeGPXPath = this.configService.getActiveGPXPath();

      let activeTrack = undefined;
      if (activeGPXPath) {
        const trackResult = await this.mapService.getTrack(activeGPXPath);
        if (trackResult.success) {
          const track = trackResult.data;
          const totalPoints = track.segments.reduce(
            (sum, seg) => sum + seg.points.length,
            0,
          );
          activeTrack = {
            name: track.name,
            pointCount: totalPoints,
            distance: track.totalDistance || 0,
          };
        }
      }

      const status: SystemStatus = {
        uptime: process.uptime(),
        gps: {
          connected: gpsStatus.success,
          tracking: this.gpsService.isTracking(),
          satellitesInUse: gpsStatus.success
            ? gpsStatus.data.satellitesInUse
            : 0,
          lastUpdate: undefined,
        },
        display: {
          initialized: epaperStatus.success,
          busy: epaperStatus.success ? epaperStatus.data.busy : false,
          lastUpdate: epaperStatus.success
            ? epaperStatus.data.lastUpdate
            : undefined,
          refreshCount: epaperStatus.success
            ? epaperStatus.data.fullRefreshCount +
              epaperStatus.data.partialRefreshCount
            : 0,
        },
        activeTrack,
        system: {
          cpuUsage: 0, // TODO: Implement actual CPU monitoring
          memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
          temperature: undefined,
        },
      };

      return success(status);
    } catch (error) {
      if (error instanceof Error) {
        return failure(
          new OrchestratorError(
            `Failed to get system status: ${error.message}`,
            OrchestratorErrorCode.UNKNOWN,
            true,
          ),
        );
      }
      return failure(
        new OrchestratorError(
          "Failed to get system status",
          OrchestratorErrorCode.UNKNOWN,
          true,
        ),
      );
    }
  }

  /**
   * Clear the display
   */
  async clearDisplay(): Promise<Result<void>> {
    if (!this.isInitialized) {
      return failure(OrchestratorError.notInitialized());
    }

    return await this.epaperService.clear();
  }

  /**
   * Put the display to sleep
   */
  async sleepDisplay(): Promise<Result<void>> {
    if (!this.isInitialized) {
      return failure(OrchestratorError.notInitialized());
    }

    return await this.epaperService.sleep();
  }

  /**
   * Wake the display
   */
  async wakeDisplay(): Promise<Result<void>> {
    if (!this.isInitialized) {
      return failure(OrchestratorError.notInitialized());
    }

    return await this.epaperService.wake();
  }

  /**
   * Toggle auto-center on GPS position
   */
  setAutoCenter(enabled: boolean): void {
    this.configService.setAutoCenter(enabled);
  }

  /**
   * Toggle map rotation based on GPS bearing
   */
  setRotateWithBearing(enabled: boolean): void {
    this.configService.setRotateWithBearing(enabled);
  }

  /**
   * Register a callback for display updates
   */
  onDisplayUpdate(callback: (success: boolean) => void): () => void {
    this.displayUpdateCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.displayUpdateCallbacks.indexOf(callback);
      if (index > -1) {
        this.displayUpdateCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Register a callback for errors
   */
  onError(callback: (error: Error) => void): () => void {
    this.errorCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.errorCallbacks.indexOf(callback);
      if (index > -1) {
        this.errorCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Clean up resources and shut down all services
   */
  async dispose(): Promise<void> {
    this.stopAutoUpdate();
    this.displayUpdateCallbacks = [];
    this.errorCallbacks = [];

    await this.gpsService.dispose();
    await this.epaperService.dispose();

    this.isInitialized = false;
  }

  /**
   * Notify all display update callbacks
   */
  private notifyDisplayUpdate(success: boolean): void {
    this.displayUpdateCallbacks.forEach((callback) => {
      try {
        callback(success);
      } catch (error) {
        console.error("Error in display update callback:", error);
      }
    });
  }

  /**
   * Notify all error callbacks
   */
  private notifyError(error: Error): void {
    this.errorCallbacks.forEach((callback) => {
      try {
        callback(error);
      } catch (err) {
        console.error("Error in error callback:", err);
      }
    });
  }
}
