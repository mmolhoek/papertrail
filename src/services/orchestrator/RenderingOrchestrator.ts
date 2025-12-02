import { IRenderingOrchestrator } from "@core/interfaces";
import {
  IGPSService,
  IMapService,
  ISVGService,
  IEpaperService,
  IConfigService,
  IWiFiService,
  ITextRendererService,
  TextTemplate,
} from "@core/interfaces";
import {
  Result,
  GPSCoordinate,
  GPSStatus,
  SystemStatus,
  WiFiState,
  success,
  failure,
  DisplayUpdateMode,
} from "@core/types";
import { OrchestratorError, OrchestratorErrorCode } from "@core/errors";
import { getLogger } from "@utils/logger";
import * as os from "os";

const logger = getLogger("RenderingOrchestrator");

/**
 * Rendering Orchestrator Implementation
 *
 * Coordinates all services to update the display.
 * This is the main application service that ties everything together.
 */
export class RenderingOrchestrator implements IRenderingOrchestrator {
  private isInitialized: boolean = false;
  private autoUpdateInterval: NodeJS.Timeout | null = null;
  private gpsUpdateCallbacks: Array<(position: GPSCoordinate) => void> = [];
  private gpsStatusCallbacks: Array<(status: GPSStatus) => void> = [];
  private displayUpdateCallbacks: Array<(success: boolean) => void> = [];
  private errorCallbacks: Array<(error: Error) => void> = [];
  private gpsUnsubscribe: (() => void) | null = null;
  private gpsStatusUnsubscribe: (() => void) | null = null;

  // WiFi state management
  private wifiStateCallbacks: Array<
    (state: WiFiState, previousState: WiFiState) => void
  > = [];
  private wifiStateUnsubscribe: (() => void) | null = null;

  // Debouncing for WiFi screen updates (prevent flickering)
  private lastWifiScreenUpdate: number = 0;
  private static readonly WIFI_SCREEN_DEBOUNCE_MS = 5000; // 5 seconds minimum between updates

  // Track if connected screen was successfully displayed (for retry logic)
  private connectedScreenDisplayed: boolean = false;

  constructor(
    private readonly gpsService: IGPSService,
    private readonly mapService: IMapService,
    private readonly svgService: ISVGService,
    private readonly epaperService: IEpaperService,
    private readonly configService: IConfigService,
    private readonly wifiService?: IWiFiService,
    private readonly textRendererService?: ITextRendererService,
  ) {}

  /**
   * Initialize the orchestrator and all dependent services
   */
  async initialize(): Promise<Result<void>> {
    if (this.isInitialized) {
      logger.info("Orchestrator already initialized");
      return success(undefined);
    }

    logger.info("Initializing RenderingOrchestrator...");

    try {
      // Initialize config service first
      logger.info("Initializing ConfigService...");
      const configResult = await this.configService.initialize();
      if (!configResult.success) {
        logger.error("Failed to initialize ConfigService:", configResult.error);
        return failure(
          OrchestratorError.initFailed("ConfigService", configResult.error),
        );
      }
      logger.info("✓ ConfigService initialized");

      // Initialize GPS service
      logger.info("Initializing GPSService...");
      const gpsResult = await this.gpsService.initialize();
      if (!gpsResult.success) {
        logger.error("Failed to initialize GPSService:", gpsResult.error);
        return failure(
          OrchestratorError.initFailed("GPSService", gpsResult.error),
        );
      }
      logger.info("✓ GPSService initialized");

      // Initialize e-paper service
      logger.info("Initializing EpaperService...");
      const epaperResult = await this.epaperService.initialize();
      if (!epaperResult.success) {
        logger.error("Failed to initialize EpaperService:", epaperResult.error);
        return failure(
          OrchestratorError.initFailed("EpaperService", epaperResult.error),
        );
      }
      logger.info("✓ EpaperService initialized");
      // show the logo on the e-paper display
      logger.info("Displaying startup logo...");
      const logoResult = await this.epaperService.displayLogo();
      if (!logoResult.success) {
        logger.error("Failed to display startup logo:", logoResult.error);
        return failure(
          OrchestratorError.initFailed("StartupLogo", logoResult.error),
        );
      }
      logger.info("✓ Startup logo displayed");

      // Start GPS tracking
      logger.info("Starting GPS tracking...");
      await this.gpsService.startTracking();
      logger.info("✓ GPS tracking started");

      // Subscribe to GPS position updates from the GPS service
      logger.info("Subscribing to GPS position updates...");
      this.subscribeToGPSUpdates();

      // Subscribe to GPS status changes from the GPS service
      logger.info("Subscribing to GPS status changes...");
      this.subscribeToGPSStatusChanges();

      // Subscribe to WiFi state changes (if WiFi service provided)
      if (this.wifiService) {
        logger.info("Subscribing to WiFi state changes...");
        this.subscribeToWiFiStateChanges();
      }

      this.isInitialized = true;
      logger.info("✓ RenderingOrchestrator initialization complete");
      return success(undefined);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        `Orchestrator initialization failed with exception: ${errorMsg}`,
      );
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
   * Subscribe to GPS position updates from the GPS service
   * and forward them to all registered callbacks
   */
  private subscribeToGPSUpdates(): void {
    if (this.gpsUnsubscribe) {
      logger.info("Unsubscribing from existing GPS updates");
      this.gpsUnsubscribe();
    }

    this.gpsUnsubscribe = this.gpsService.onPositionUpdate((position) => {
      // logger.info(
      //   `GPS position update received: ${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`,
      // );

      // Notify all GPS update callbacks
      this.gpsUpdateCallbacks.forEach((callback) => {
        try {
          callback(position);
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          logger.error(`Error in GPS update callback: ${errorMsg}`);
          this.notifyError(
            error instanceof Error
              ? error
              : new Error("Unknown error in GPS update callback"),
          );
        }
      });
    });

    logger.info(
      `Subscribed to GPS position updates (${this.gpsUpdateCallbacks.length} callbacks registered)`,
    );
  }

  /**
   * Subscribe to GPS status changes from the GPS service
   * and forward them to all registered callbacks
   */
  private subscribeToGPSStatusChanges(): void {
    if (this.gpsStatusUnsubscribe) {
      logger.info("Unsubscribing from existing GPS status changes");
      this.gpsStatusUnsubscribe();
    }

    this.gpsStatusUnsubscribe = this.gpsService.onStatusChange((status) => {
      logger.info(
        `GPS status changed: ${status.fixQuality} (${status.satellitesInUse} satellites)`,
      );

      // Notify all GPS status callbacks
      this.gpsStatusCallbacks.forEach((callback) => {
        try {
          callback(status);
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          logger.error(`Error in GPS status callback: ${errorMsg}`);
          this.notifyError(
            error instanceof Error
              ? error
              : new Error("Unknown error in GPS status callback"),
          );
        }
      });
    });

    logger.info(
      `Subscribed to GPS status changes (${this.gpsStatusCallbacks.length} callbacks registered)`,
    );
  }

  /**
   * Update the display with current GPS position and active track
   */
  async updateDisplay(): Promise<Result<void>> {
    if (!this.isInitialized) {
      logger.warn("Cannot update display: orchestrator not initialized");
      return failure(OrchestratorError.notInitialized());
    }

    logger.info("Starting display update...");

    try {
      // Step 1: Get current GPS position
      logger.info("Step 1/5: Getting current GPS position...");
      const positionResult = await this.gpsService.getCurrentPosition();
      if (!positionResult.success) {
        logger.error("Failed to get GPS position:", positionResult.error);
        this.notifyError(positionResult.error);
        return failure(
          OrchestratorError.updateFailed("GPS position", positionResult.error),
        );
      }
      logger.info(
        `✓ GPS position: ${positionResult.data.latitude.toFixed(6)}, ${positionResult.data.longitude.toFixed(6)}`,
      );

      // Step 2: Get active GPX path
      logger.info("Step 2/5: Getting active GPX path...");
      const gpxPath = this.configService.getActiveGPXPath();
      if (!gpxPath) {
        logger.warn("No active GPX file configured");
        return failure(OrchestratorError.noActiveGPX());
      }
      logger.info(`✓ Active GPX: ${gpxPath}`);

      // Step 3: Load GPX track
      logger.info("Step 3/5: Loading GPX track...");
      const trackResult = await this.mapService.getTrack(gpxPath);
      if (!trackResult.success) {
        logger.error("Failed to load GPX track:", trackResult.error);
        this.notifyError(trackResult.error);
        return failure(
          OrchestratorError.updateFailed("GPX track load", trackResult.error),
        );
      }
      const pointCount = trackResult.data.segments.reduce(
        (sum, seg) => sum + seg.points.length,
        0,
      );
      logger.info(
        `✓ GPX track loaded: ${trackResult.data.segments.length} segments, ${pointCount} points`,
      );

      // Step 4: Render viewport
      logger.info("Step 4/5: Rendering viewport to bitmap...");
      const viewport = {
        width: this.configService.getDisplayWidth(),
        height: this.configService.getDisplayHeight(),
        centerPoint: positionResult.data,
        zoomLevel: this.configService.getZoomLevel(),
      };

      logger.info(
        `Viewport: ${viewport.width}x${viewport.height}, zoom ${viewport.zoomLevel}, center: ${viewport.centerPoint.latitude.toFixed(6)}, ${viewport.centerPoint.longitude.toFixed(6)}`,
      );

      const renderOptions = this.configService.getRenderOptions();
      logger.info(
        `Render options: lineWidth=${renderOptions.lineWidth}, showPoints=${renderOptions.showPoints}, highlightCurrentPosition=${renderOptions.highlightCurrentPosition}`,
      );

      const bitmapResult = await this.svgService.renderViewport(
        trackResult.data,
        viewport,
        renderOptions,
      );

      if (!bitmapResult.success) {
        logger.error("Failed to render viewport:", bitmapResult.error);
        this.notifyError(bitmapResult.error);
        return failure(
          OrchestratorError.updateFailed("Viewport render", bitmapResult.error),
        );
      }
      logger.info(
        `✓ Viewport rendered: ${bitmapResult.data.width}x${bitmapResult.data.height}, ${bitmapResult.data.data.length} bytes`,
      );

      // Step 5: Display on e-paper
      logger.info("Step 5/5: Sending bitmap to e-paper display...");
      const displayResult = await this.epaperService.displayBitmap(
        bitmapResult.data,
      );

      if (!displayResult.success) {
        logger.error("Failed to display on e-paper:", displayResult.error);
        this.notifyError(displayResult.error);
        return failure(
          OrchestratorError.updateFailed(
            "E-paper display",
            displayResult.error,
          ),
        );
      }
      logger.info("✓ Display updated successfully");

      // Notify display update callbacks
      logger.info(
        `Notifying ${this.displayUpdateCallbacks.length} display update callbacks`,
      );
      this.notifyDisplayUpdate(true);

      return success(undefined);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Display update failed with exception: ${errorMsg}`);
      const err = error instanceof Error ? error : new Error("Unknown error");
      this.notifyError(err);
      return failure(OrchestratorError.updateFailed("Display update", err));
    }
  }

  /**
   * Set the active GPX file and update display
   */
  async setActiveGPX(filePath: string): Promise<Result<void>> {
    if (!this.isInitialized) {
      logger.warn("Cannot set active GPX: orchestrator not initialized");
      return failure(OrchestratorError.notInitialized());
    }

    logger.info(`Setting active GPX file: ${filePath}`);

    try {
      // Validate the GPX file
      logger.info("Validating GPX file...");
      const validationResult = await this.mapService.validateGPXFile(filePath);
      if (!validationResult.success) {
        logger.error("GPX file validation failed:", validationResult.error);
        return failure(validationResult.error);
      }
      logger.info("✓ GPX file validated");

      // Set as active
      logger.info("Setting as active GPX and saving config...");
      this.configService.setActiveGPXPath(filePath);
      await this.configService.save();
      logger.info("✓ Active GPX saved to config");

      // Update display
      logger.info("Updating display with new GPX...");
      return await this.updateDisplay();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to set active GPX: ${errorMsg}`);
      const err = error instanceof Error ? error : new Error("Unknown error");
      return failure(OrchestratorError.updateFailed("Set active GPX", err));
    }
  }

  /**
   * Clear the active GPX file
   */
  async clearActiveGPX(): Promise<Result<void>> {
    logger.info("Clearing active GPX file");
    this.configService.setActiveGPXPath(null);
    await this.configService.save();
    logger.info("✓ Active GPX cleared");
    return success(undefined);
  }

  /**
   * Change zoom level and update display
   */
  async changeZoom(delta: number): Promise<Result<void>> {
    if (!this.isInitialized) {
      logger.warn("Cannot change zoom: orchestrator not initialized");
      return failure(OrchestratorError.notInitialized());
    }

    const currentZoom = this.configService.getZoomLevel();
    const newZoom = currentZoom + delta;

    logger.info(`Changing zoom: ${currentZoom} → ${newZoom} (delta: ${delta})`);
    this.configService.setZoomLevel(newZoom);
    await this.configService.save();
    logger.info("✓ Zoom level saved");

    return await this.updateDisplay();
  }

  /**
   * Set absolute zoom level and update display
   */
  async setZoom(level: number): Promise<Result<void>> {
    if (!this.isInitialized) {
      logger.warn("Cannot set zoom: orchestrator not initialized");
      return failure(OrchestratorError.notInitialized());
    }

    const currentZoom = this.configService.getZoomLevel();
    logger.info(`Setting zoom level: ${currentZoom} → ${level}`);
    this.configService.setZoomLevel(level);
    await this.configService.save();
    logger.info("✓ Zoom level saved");

    return await this.updateDisplay();
  }

  /**
   * Refresh GPS position and update display
   */
  async refreshGPS(): Promise<Result<void>> {
    logger.info("Refreshing GPS and updating display");
    return await this.updateDisplay();
  }

  /**
   * Start automatic display updates at configured interval
   */
  async startAutoUpdate(): Promise<Result<void>> {
    if (!this.isInitialized) {
      logger.warn("Cannot start auto-update: orchestrator not initialized");
      return failure(OrchestratorError.notInitialized());
    }

    if (this.autoUpdateInterval) {
      logger.warn("Auto-update already running");
      return failure(OrchestratorError.alreadyRunning());
    }

    const intervalSeconds = this.configService.getAutoRefreshInterval();

    if (intervalSeconds <= 0) {
      logger.error(
        `Invalid auto-refresh interval: ${intervalSeconds} (must be > 0)`,
      );
      return failure(
        new OrchestratorError(
          "Auto-refresh interval must be greater than 0",
          OrchestratorErrorCode.INVALID_STATE,
        ),
      );
    }

    logger.info(`Starting auto-update with ${intervalSeconds} second interval`);
    this.autoUpdateInterval = setInterval(() => {
      logger.info("Auto-update triggered");
      this.updateDisplay().catch((error) => {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Auto-update failed: ${errorMsg}`);
      });
    }, intervalSeconds * 1000);

    logger.info("✓ Auto-update started");
    return success(undefined);
  }

  /**
   * Stop automatic display updates
   */
  stopAutoUpdate(): void {
    if (this.autoUpdateInterval) {
      logger.info("Stopping auto-update");
      clearInterval(this.autoUpdateInterval);
      this.autoUpdateInterval = null;
      logger.info("✓ Auto-update stopped");
    } else {
      logger.info("Auto-update not running, nothing to stop");
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
      logger.warn("Cannot get position: orchestrator not initialized");
      return failure(OrchestratorError.notInitialized());
    }

    logger.info("Getting current GPS position");
    return await this.gpsService.getCurrentPosition();
  }

  /**
   * Get system status including all services
   */
  async getSystemStatus(): Promise<Result<SystemStatus>> {
    if (!this.isInitialized) {
      logger.warn("Cannot get system status: orchestrator not initialized");
      return failure(OrchestratorError.notInitialized());
    }

    logger.info("Collecting system status...");

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
          model: epaperStatus.success ? epaperStatus.data.model : undefined,
          width: epaperStatus.success ? epaperStatus.data.width : undefined,
          height: epaperStatus.success ? epaperStatus.data.height : undefined,
          lastUpdate: epaperStatus.success
            ? epaperStatus.data.lastUpdate
            : undefined,
          refreshCount: epaperStatus.success
            ? epaperStatus.data.fullRefreshCount || 0
            : 0,
        },
        activeTrack,
        system: {
          cpuUsage: process.cpuUsage().user / 1000000,
          memoryUsage:
            (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) *
            100,
        },
      };

      return success(status);
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      return failure(OrchestratorError.updateFailed("Get system status", err));
    }
  }

  /**
   * Clear the display
   */
  async clearDisplay(): Promise<Result<void>> {
    if (!this.isInitialized) {
      logger.warn("Cannot clear display: orchestrator not initialized");
      return failure(OrchestratorError.notInitialized());
    }

    logger.info("Clearing e-paper display");
    const result = await this.epaperService.clear();
    if (!result.success) {
      logger.error("Failed to clear display:", result.error);
      return failure(
        OrchestratorError.updateFailed("Clear display", result.error),
      );
    }
    logger.info("✓ Display cleared");
    return success(undefined);
  }

  /**
   * Put the display to sleep
   */
  async sleepDisplay(): Promise<Result<void>> {
    if (!this.isInitialized) {
      logger.warn("Cannot sleep display: orchestrator not initialized");
      return failure(OrchestratorError.notInitialized());
    }

    logger.info("Putting e-paper display to sleep");
    const result = await this.epaperService.sleep();
    if (result.success) {
      logger.info("✓ Display is now sleeping");
    } else {
      logger.error("Failed to put display to sleep:", result.error);
    }
    return result;
  }

  /**
   * Wake the display
   */
  async wakeDisplay(): Promise<Result<void>> {
    if (!this.isInitialized) {
      logger.warn("Cannot wake display: orchestrator not initialized");
      return failure(OrchestratorError.notInitialized());
    }

    logger.info("Waking e-paper display");
    const result = await this.epaperService.wake();
    if (result.success) {
      logger.info("✓ Display is now awake");
    } else {
      logger.error("Failed to wake display:", result.error);
    }
    return result;
  }

  /**
   * Toggle auto-center on GPS position
   */
  setAutoCenter(enabled: boolean): void {
    logger.info(`Auto-center ${enabled ? "enabled" : "disabled"}`);
    this.configService.setAutoCenter(enabled);
  }

  /**
   * Toggle map rotation based on GPS bearing
   */
  setRotateWithBearing(enabled: boolean): void {
    logger.info(`Rotate with bearing ${enabled ? "enabled" : "disabled"}`);
    this.configService.setRotateWithBearing(enabled);
  }

  /**
   * Register a callback for GPS position updates
   */
  onGPSUpdate(callback: (position: GPSCoordinate) => void): () => void {
    this.gpsUpdateCallbacks.push(callback);
    logger.info(
      `GPS update callback registered (total: ${this.gpsUpdateCallbacks.length})`,
    );

    // Return unsubscribe function
    return () => {
      const index = this.gpsUpdateCallbacks.indexOf(callback);
      if (index > -1) {
        this.gpsUpdateCallbacks.splice(index, 1);
        logger.info(
          `GPS update callback unregistered (total: ${this.gpsUpdateCallbacks.length})`,
        );
      }
    };
  }

  /**
   * Register a callback for GPS status changes
   */
  onGPSStatusChange(callback: (status: GPSStatus) => void): () => void {
    this.gpsStatusCallbacks.push(callback);
    logger.info(
      `GPS status callback registered (total: ${this.gpsStatusCallbacks.length})`,
    );

    // Return unsubscribe function
    return () => {
      const index = this.gpsStatusCallbacks.indexOf(callback);
      if (index > -1) {
        this.gpsStatusCallbacks.splice(index, 1);
        logger.info(
          `GPS status callback unregistered (total: ${this.gpsStatusCallbacks.length})`,
        );
      }
    };
  }

  /**
   * Register a callback for display updates
   */
  onDisplayUpdate(callback: (success: boolean) => void): () => void {
    this.displayUpdateCallbacks.push(callback);
    logger.info(
      `Display update callback registered (total: ${this.displayUpdateCallbacks.length})`,
    );

    // Return unsubscribe function
    return () => {
      const index = this.displayUpdateCallbacks.indexOf(callback);
      if (index > -1) {
        this.displayUpdateCallbacks.splice(index, 1);
        logger.info(
          `Display update callback unregistered (total: ${this.displayUpdateCallbacks.length})`,
        );
      }
    };
  }

  /**
   * Register a callback for errors
   */
  onError(callback: (error: Error) => void): () => void {
    this.errorCallbacks.push(callback);
    logger.info(
      `Error callback registered (total: ${this.errorCallbacks.length})`,
    );

    // Return unsubscribe function
    return () => {
      const index = this.errorCallbacks.indexOf(callback);
      if (index > -1) {
        this.errorCallbacks.splice(index, 1);
        logger.info(
          `Error callback unregistered (total: ${this.errorCallbacks.length})`,
        );
      }
    };
  }

  /**
   * Register a callback for WiFi state changes
   */
  onWiFiStateChange(
    callback: (state: WiFiState, previousState: WiFiState) => void,
  ): () => void {
    this.wifiStateCallbacks.push(callback);
    logger.info(
      `WiFi state callback registered (total: ${this.wifiStateCallbacks.length})`,
    );

    // Return unsubscribe function
    return () => {
      const index = this.wifiStateCallbacks.indexOf(callback);
      if (index > -1) {
        this.wifiStateCallbacks.splice(index, 1);
        logger.info(
          `WiFi state callback unregistered (total: ${this.wifiStateCallbacks.length})`,
        );
      }
    };
  }

  /**
   * Check if onboarding is needed and show appropriate screen
   * Call this after all services are initialized (including WiFi)
   */
  async checkAndShowOnboardingScreen(): Promise<Result<void>> {
    logger.info("checkAndShowOnboardingScreen() called");

    if (!this.isInitialized) {
      logger.warn(
        "Orchestrator not initialized - cannot show onboarding screen",
      );
      return failure(OrchestratorError.notInitialized());
    }

    // Check if onboarding is already complete
    const onboardingComplete = this.configService.isOnboardingCompleted();
    logger.info(`Onboarding complete: ${onboardingComplete}`);

    if (onboardingComplete) {
      logger.info("Onboarding already complete - no screen to show");
      return success(undefined);
    }

    // Check if WiFi service is available
    if (!this.wifiService) {
      logger.warn(
        "WiFi service not available - cannot show WiFi onboarding screen",
      );
      return success(undefined);
    }

    // Check if already connected to mobile hotspot
    const connectedToHotspotResult =
      await this.wifiService.isConnectedToMobileHotspot();
    if (connectedToHotspotResult.success && connectedToHotspotResult.data) {
      logger.info(
        "Already connected to mobile hotspot - showing connected screen",
      );
      await this.displayConnectedScreen();
      return success(undefined);
    }

    // Not connected to hotspot - show WiFi instructions
    logger.info(
      "Not connected to mobile hotspot - showing WiFi instructions screen",
    );
    await this.displayWiFiInstructionsScreen();

    // Start attempting to connect to the mobile hotspot
    // This runs in the background while the instructions are displayed
    logger.info("Starting mobile hotspot connection attempt for onboarding...");
    void this.wifiService.attemptMobileHotspotConnection().then((result) => {
      if (result.success) {
        logger.info(
          "Successfully connected to mobile hotspot during onboarding!",
        );
        // The WiFi state change callback will handle displaying the connected screen
      } else {
        logger.warn(
          "Failed to connect to mobile hotspot during onboarding:",
          result.error.message,
        );
        // Will retry on next polling tick if still in onboarding
      }
    });

    return success(undefined);
  }

  /**
   * Clean up resources and shut down all services
   */
  async dispose(): Promise<void> {
    logger.info("Disposing RenderingOrchestrator...");

    // Unsubscribe from GPS updates
    if (this.gpsUnsubscribe) {
      logger.info("Unsubscribing from GPS updates");
      this.gpsUnsubscribe();
      this.gpsUnsubscribe = null;
    }

    // Unsubscribe from GPS status changes
    if (this.gpsStatusUnsubscribe) {
      logger.info("Unsubscribing from GPS status changes");
      this.gpsStatusUnsubscribe();
      this.gpsStatusUnsubscribe = null;
    }

    // Unsubscribe from WiFi state changes
    if (this.wifiStateUnsubscribe) {
      logger.info("Unsubscribing from WiFi state changes");
      this.wifiStateUnsubscribe();
      this.wifiStateUnsubscribe = null;
    }

    // Stop auto-update if running
    logger.info("Stopping auto-update if running");
    this.stopAutoUpdate();

    // Clear all callbacks
    const totalCallbacks =
      this.gpsUpdateCallbacks.length +
      this.gpsStatusCallbacks.length +
      this.displayUpdateCallbacks.length +
      this.errorCallbacks.length +
      this.wifiStateCallbacks.length;
    logger.info(`Clearing ${totalCallbacks} registered callbacks`);
    this.gpsUpdateCallbacks = [];
    this.gpsStatusCallbacks = [];
    this.displayUpdateCallbacks = [];
    this.errorCallbacks = [];
    this.wifiStateCallbacks = [];

    // Dispose all services
    logger.info("Disposing GPS service");
    try {
      await this.gpsService.dispose();
      logger.info("✓ GPS service disposed");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error disposing GPS service: ${errorMsg}`);
    }

    logger.info("Disposing epaper service");
    try {
      await this.epaperService.dispose();
      logger.info("✓ Epaper service disposed");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error disposing epaper service: ${errorMsg}`);
    }

    this.isInitialized = false;
    logger.info("✓ RenderingOrchestrator disposed successfully");
  }

  /**
   * Notify all display update callbacks
   */
  private notifyDisplayUpdate(success: boolean): void {
    this.displayUpdateCallbacks.forEach((callback) => {
      try {
        callback(success);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Error in display update callback: ${errorMsg}`);
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
        logger.error("Error in error callback:", err);
      }
    });
  }

  /**
   * Subscribe to WiFi state changes from the WiFi service
   * and forward them to all registered callbacks
   */
  private subscribeToWiFiStateChanges(): void {
    if (!this.wifiService) {
      return;
    }

    if (this.wifiStateUnsubscribe) {
      logger.info("Unsubscribing from existing WiFi state changes");
      this.wifiStateUnsubscribe();
    }

    this.wifiStateUnsubscribe = this.wifiService.onStateChange(
      (state, previousState) => {
        logger.info(`WiFi state changed: ${previousState} -> ${state}`);

        // Handle display updates based on WiFi state
        void this.handleWiFiStateChange(state, previousState);

        // Notify all WiFi state callbacks
        this.wifiStateCallbacks.forEach((callback) => {
          try {
            callback(state, previousState);
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            logger.error(`Error in WiFi state callback: ${errorMsg}`);
            this.notifyError(
              error instanceof Error
                ? error
                : new Error("Unknown error in WiFi state callback"),
            );
          }
        });
      },
    );

    logger.info(
      `Subscribed to WiFi state changes (${this.wifiStateCallbacks.length} callbacks registered)`,
    );
  }

  /**
   * Handle WiFi state changes by displaying appropriate screens
   */
  private async handleWiFiStateChange(
    state: WiFiState,
    previousState: WiFiState,
  ): Promise<void> {
    if (!this.textRendererService || !this.epaperService) {
      logger.warn(
        "TextRendererService or EpaperService not available for WiFi screens",
      );
      return;
    }

    // Debounce screen updates to prevent flickering
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastWifiScreenUpdate;

    // Allow immediate update for CONNECTED state (important to show URL)
    // But debounce other states to prevent flickering
    if (
      state !== WiFiState.CONNECTED &&
      timeSinceLastUpdate < RenderingOrchestrator.WIFI_SCREEN_DEBOUNCE_MS
    ) {
      logger.info(
        `WiFi screen update debounced (${timeSinceLastUpdate}ms since last update)`,
      );
      return;
    }

    try {
      switch (state) {
        case WiFiState.WAITING_FOR_HOTSPOT:
          await this.displayWiFiInstructionsScreen();
          this.lastWifiScreenUpdate = now;
          break;

        case WiFiState.CONNECTED:
          // Display connected screen on first transition to CONNECTED,
          // or retry if previous display attempt failed (e.g., IP wasn't ready)
          if (previousState !== WiFiState.CONNECTED) {
            // First transition to CONNECTED - reset flag and display
            this.connectedScreenDisplayed = false;
            await this.displayConnectedScreen();
            this.lastWifiScreenUpdate = now;
          } else if (!this.connectedScreenDisplayed) {
            // Retry: state was already CONNECTED but screen wasn't displayed yet
            logger.info("Retrying connected screen display (previous attempt may have failed)");
            await this.displayConnectedScreen();
            this.lastWifiScreenUpdate = now;
          }
          break;

        case WiFiState.RECONNECTING_FALLBACK:
          await this.displayReconnectingScreen();
          this.lastWifiScreenUpdate = now;
          break;

        case WiFiState.ERROR:
          logger.warn("WiFi entered error state");
          // Don't update timestamp for ERROR - let other screens show
          break;

        default:
          // No display action needed for other states
          break;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to display WiFi state screen: ${errorMsg}`);
    }
  }

  /**
   * Display WiFi instructions screen on e-paper
   */
  private async displayWiFiInstructionsScreen(): Promise<void> {
    if (!this.textRendererService || !this.wifiService) {
      return;
    }

    const ssid = this.wifiService.getMobileHotspotSSID();

    const template: TextTemplate = {
      version: "1.0",
      title: "WiFi Setup",
      layout: {
        backgroundColor: "white",
        textColor: "black",
        padding: { top: 150, right: 20, bottom: 20, left: 20 },
      },
      textBlocks: [
        {
          content: "Please create a mobile hotspot",
          fontSize: 28,
          fontWeight: "bold",
          alignment: "center",
          marginBottom: 30,
        },
        {
          content: `Network Name: ${ssid}`,
          fontSize: 22,
          fontWeight: "normal",
          alignment: "center",
          marginBottom: 15,
        },
        {
          content: "Password: papertrail123",
          fontSize: 22,
          fontWeight: "normal",
          alignment: "center",
          marginBottom: 40,
        },
        {
          content: "Connecting...",
          fontSize: 18,
          fontWeight: "normal",
          alignment: "center",
          marginBottom: 0,
        },
      ],
    };

    const width = this.configService.getDisplayWidth();
    const height = this.configService.getDisplayHeight();
    const renderResult = await this.textRendererService.renderTemplate(
      template,
      { ssid },
      width,
      height,
    );

    if (renderResult.success) {
      await this.epaperService.displayBitmap(
        renderResult.data,
        DisplayUpdateMode.FULL,
      );
      logger.info("Displayed WiFi instructions screen");
    } else {
      logger.error("Failed to render WiFi instructions template");
    }
  }

  /**
   * Display connected screen with device URL on e-paper
   */
  private async displayConnectedScreen(): Promise<void> {
    if (!this.textRendererService) {
      return;
    }

    // Verify we're actually connected to the hotspot before showing
    if (this.wifiService) {
      const connectedResult =
        await this.wifiService.isConnectedToMobileHotspot();
      if (!connectedResult.success || !connectedResult.data) {
        logger.warn(
          "displayConnectedScreen called but not connected to hotspot - skipping",
        );
        return;
      }
    }

    const deviceUrl = this.getDeviceUrl();

    // Don't show connected screen if we don't have a valid IP
    if (deviceUrl.includes("localhost")) {
      logger.warn(
        "displayConnectedScreen called but no valid IP address - skipping",
      );
      return;
    }

    const template: TextTemplate = {
      version: "1.0",
      title: "Connected",
      layout: {
        backgroundColor: "white",
        textColor: "black",
        padding: { top: 150, right: 20, bottom: 20, left: 20 },
      },
      textBlocks: [
        {
          content: "Connected!",
          fontSize: 32,
          fontWeight: "bold",
          alignment: "center",
          marginBottom: 40,
        },
        {
          content: "Open your browser and go to:",
          fontSize: 20,
          fontWeight: "normal",
          alignment: "center",
          marginBottom: 20,
        },
        {
          content: deviceUrl,
          fontSize: 24,
          fontWeight: "bold",
          alignment: "center",
          marginBottom: 40,
        },
        {
          content: "to access the Papertrail interface",
          fontSize: 18,
          fontWeight: "normal",
          alignment: "center",
          marginBottom: 0,
        },
      ],
    };

    const width = this.configService.getDisplayWidth();
    const height = this.configService.getDisplayHeight();
    const renderResult = await this.textRendererService.renderTemplate(
      template,
      { url: deviceUrl },
      width,
      height,
    );

    if (renderResult.success) {
      await this.epaperService.displayBitmap(
        renderResult.data,
        DisplayUpdateMode.FULL,
      );
      logger.info(`Displayed connected screen with URL: ${deviceUrl}`);
      // Mark that we successfully displayed the connected screen
      this.connectedScreenDisplayed = true;
    } else {
      logger.error("Failed to render connected template");
    }
  }

  /**
   * Display reconnecting screen on e-paper
   */
  private async displayReconnectingScreen(): Promise<void> {
    if (!this.textRendererService) {
      return;
    }

    const fallback = this.configService.getWiFiFallbackNetwork();
    const ssid = fallback?.ssid || "previous network";

    const template: TextTemplate = {
      version: "1.0",
      title: "Reconnecting",
      layout: {
        backgroundColor: "white",
        textColor: "black",
        padding: { top: 20, right: 20, bottom: 20, left: 20 },
      },
      textBlocks: [
        {
          content: "Connection timed out",
          fontSize: 28,
          fontWeight: "bold",
          alignment: "center",
          marginBottom: 30,
        },
        {
          content: `Reconnecting to: ${ssid}`,
          fontSize: 20,
          fontWeight: "normal",
          alignment: "center",
          marginBottom: 20,
        },
        {
          content: "Please wait...",
          fontSize: 18,
          fontWeight: "normal",
          alignment: "center",
          marginBottom: 0,
        },
      ],
    };

    const width = this.configService.getDisplayWidth();
    const height = this.configService.getDisplayHeight();
    const renderResult = await this.textRendererService.renderTemplate(
      template,
      { ssid },
      width,
      height,
    );

    if (renderResult.success) {
      await this.epaperService.displayBitmap(renderResult.data);
      logger.info("Displayed reconnecting screen");
    } else {
      logger.error("Failed to render reconnecting template");
    }
  }

  /**
   * Get the device URL for web interface access
   */
  private getDeviceUrl(): string {
    const config = this.configService.getConfig();
    const port = config.web.port;

    // Try to get IP address from network interfaces
    const interfaces = os.networkInterfaces();
    logger.info("Getting device URL - scanning network interfaces...");

    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name];
      if (!iface) continue;

      for (const info of iface) {
        // Skip IPv6 and internal (loopback) addresses
        // Note: family can be "IPv4" (string) or 4 (number) depending on Node.js version
        const family = info.family as string | number;
        const isIPv4 = family === "IPv4" || family === 4;
        if (isIPv4 && !info.internal) {
          logger.info(`Found IPv4 address on ${name}: ${info.address}`);
          return `http://${info.address}:${port}`;
        }
      }
    }

    // Fallback to localhost
    logger.warn("No IPv4 address found, using fallback");
    return `http://localhost:${port}`;
  }
}
