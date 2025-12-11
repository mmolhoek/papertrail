import { IRenderingOrchestrator } from "@core/interfaces";
import {
  IGPSService,
  IMapService,
  ISVGService,
  IEpaperService,
  IConfigService,
  IWiFiService,
  ITextRendererService,
  ITrackSimulationService,
  IDriveNavigationService,
} from "@core/interfaces";
import {
  Result,
  GPSCoordinate,
  GPSStatus,
  SystemStatus,
  WiFiState,
  GPXTrack,
  DriveRoute,
  DriveNavigationUpdate,
  ScreenType,
  success,
  failure,
  DisplayUpdateMode,
} from "@core/types";
import { OrchestratorError, OrchestratorErrorCode } from "@core/errors";
import { getLogger } from "@utils/logger";
import { ActiveGPXQueue } from "./DisplayUpdateQueue";
import { OnboardingCoordinator } from "./OnboardingCoordinator";
import { GPSCoordinator } from "./GPSCoordinator";
import { DriveCoordinator } from "./DriveCoordinator";
import { SimulationCoordinator } from "./SimulationCoordinator";
import { TrackDisplayCoordinator } from "./TrackDisplayCoordinator";
import * as path from "path";

const logger = getLogger("RenderingOrchestrator");

/**
 * Rendering Orchestrator Implementation
 *
 * The central coordinator that ties together all Papertrail services to provide
 * a cohesive GPS tracking and navigation experience. This service:
 *
 * - Initializes and manages the lifecycle of all dependent services
 * - Coordinates GPS position updates with display rendering
 * - Handles track selection and drive navigation
 * - Manages WiFi onboarding and system configuration
 * - Provides event callbacks for GPS, display, and navigation updates
 *
 * The orchestrator delegates specialized tasks to sub-coordinators:
 * - {@link GPSCoordinator} - GPS position and status management
 * - {@link DriveCoordinator} - Turn-by-turn navigation
 * - {@link SimulationCoordinator} - Track simulation for testing
 * - {@link TrackDisplayCoordinator} - Track rendering and display updates
 * - {@link OnboardingCoordinator} - WiFi setup and onboarding flow
 *
 * @example
 * ```typescript
 * // Create and initialize the orchestrator
 * const orchestrator = new RenderingOrchestrator(
 *   gpsService, mapService, svgService, epaperService, configService
 * );
 * await orchestrator.initialize();
 *
 * // Load a track and start following
 * await orchestrator.setActiveGPX('/path/to/track.gpx');
 *
 * // Subscribe to GPS updates
 * const unsubscribe = orchestrator.onGPSUpdate((position) => {
 *   console.log('Position:', position.latitude, position.longitude);
 * });
 * ```
 */
export class RenderingOrchestrator implements IRenderingOrchestrator {
  private isInitialized: boolean = false;
  private autoUpdateInterval: NodeJS.Timeout | null = null;
  private displayUpdateCallbacks: Array<(success: boolean) => void> = [];
  private errorCallbacks: Array<(error: Error) => void> = [];

  // GPS coordinator (handles GPS subscriptions, callbacks, and position/status storage)
  private gpsCoordinator: GPSCoordinator | null = null;

  // Onboarding coordinator (handles WiFi/onboarding screen flow)
  private onboardingCoordinator: OnboardingCoordinator | null = null;

  // Drive coordinator (handles drive navigation display and updates)
  private driveCoordinator: DriveCoordinator | null = null;

  // Simulation coordinator (handles simulation display updates)
  private simulationCoordinator: SimulationCoordinator | null = null;

  // Track display coordinator (handles track rendering and display)
  private trackDisplayCoordinator: TrackDisplayCoordinator | null = null;

  // setActiveGPX queuing (ensures only the last selected track is loaded)
  private activeGPXQueue = new ActiveGPXQueue();

  constructor(
    private readonly gpsService: IGPSService,
    private readonly mapService: IMapService,
    private readonly svgService: ISVGService,
    private readonly epaperService: IEpaperService,
    private readonly configService: IConfigService,
    private readonly wifiService?: IWiFiService,
    private readonly textRendererService?: ITextRendererService,
    private readonly simulationService?: ITrackSimulationService,
    private readonly driveNavigationService?: IDriveNavigationService,
  ) {
    // Initialize onboarding coordinator
    this.onboardingCoordinator = new OnboardingCoordinator(
      wifiService ?? null,
      configService,
      textRendererService ?? null,
      epaperService,
      simulationService ?? null,
      driveNavigationService ?? null,
    );
    // Wire up error callback
    this.onboardingCoordinator.setErrorCallback((error) => {
      this.notifyError(error);
    });

    // Initialize GPS coordinator
    this.gpsCoordinator = new GPSCoordinator(
      gpsService,
      simulationService ?? null,
      driveNavigationService ?? null,
      this.onboardingCoordinator,
    );
    // Wire up error callback
    this.gpsCoordinator.setErrorCallback((error) => {
      this.notifyError(error);
    });

    // Initialize drive coordinator
    this.driveCoordinator = new DriveCoordinator(
      driveNavigationService ?? null,
      svgService,
      epaperService,
      configService,
      simulationService ?? null,
      this.gpsCoordinator,
      this.onboardingCoordinator,
    );
    // Wire up display update callback
    this.driveCoordinator.setDisplayUpdateCallback((success) => {
      this.notifyDisplayUpdate(success);
    });

    // Initialize simulation coordinator
    this.simulationCoordinator = new SimulationCoordinator(
      simulationService ?? null,
      this.gpsCoordinator,
      this.driveCoordinator,
    );
    // Wire up callbacks
    this.simulationCoordinator.setStopAutoUpdateCallback(() => {
      this.stopAutoUpdate();
    });
    this.simulationCoordinator.setUpdateDisplayCallback(() => {
      return this.updateDisplay();
    });

    // Initialize track display coordinator
    this.trackDisplayCoordinator = new TrackDisplayCoordinator(
      gpsService,
      mapService,
      svgService,
      epaperService,
      configService,
      driveNavigationService ?? null,
      this.simulationCoordinator,
      this.driveCoordinator,
    );
    // Wire up callbacks
    this.trackDisplayCoordinator.setDisplayUpdateCallback((success) => {
      this.notifyDisplayUpdate(success);
    });
    this.trackDisplayCoordinator.setErrorCallback((error) => {
      this.notifyError(error);
    });
  }

  /**
   * Initialize the orchestrator and all dependent services.
   *
   * This method must be called before using any other orchestrator functionality.
   * It initializes services in the correct order:
   * 1. ConfigService - loads saved configuration
   * 2. GPSService - initializes GPS hardware/mock
   * 3. EpaperService - initializes e-paper display and shows logo
   * 4. Starts GPS tracking and subscribes to updates
   * 5. Sets up WiFi and simulation services (if available)
   *
   * @returns Result indicating success or failure with error details
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

      // Subscribe to GPS position and status updates via GPS coordinator
      if (this.gpsCoordinator) {
        logger.info("Subscribing to GPS position updates...");
        this.gpsCoordinator.subscribeToGPSUpdates();
        logger.info("Subscribing to GPS status changes...");
        this.gpsCoordinator.subscribeToGPSStatusChanges();
      }

      // Subscribe to WiFi state changes via onboarding coordinator
      if (this.wifiService && this.onboardingCoordinator) {
        logger.info("Subscribing to WiFi state changes...");
        this.onboardingCoordinator.subscribeToWiFiStateChanges();
      }

      // Initialize and subscribe to simulation service (if provided)
      if (this.simulationService) {
        logger.info("Initializing TrackSimulationService...");
        const simResult = await this.simulationService.initialize();
        if (!simResult.success) {
          logger.error(
            "Failed to initialize TrackSimulationService:",
            simResult.error,
          );
          logger.warn("Track simulation will not be available");
        } else {
          logger.info("✓ TrackSimulationService initialized");
          // Subscribe to simulation updates via coordinator
          if (this.simulationCoordinator) {
            logger.info("Subscribing to simulation state changes...");
            this.simulationCoordinator.subscribeToSimulationUpdates();
          }
        }
      }

      // Initialize drive navigation service (if provided)
      if (this.driveNavigationService) {
        logger.info("Initializing DriveNavigationService...");
        const driveResult = await this.driveNavigationService.initialize();
        if (!driveResult.success) {
          logger.error(
            "Failed to initialize DriveNavigationService:",
            driveResult.error,
          );
          // Non-fatal - drive navigation is optional
          logger.warn("Drive navigation will not be available");
        } else {
          logger.info("✓ DriveNavigationService initialized");
        }
      }

      this.isInitialized = true;

      // Set drive coordinator as initialized
      if (this.driveCoordinator) {
        this.driveCoordinator.setInitialized(true);
      }

      // Set track display coordinator as initialized
      if (this.trackDisplayCoordinator) {
        this.trackDisplayCoordinator.setInitialized(true);
      }

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

  // ============================================
  // Drive Navigation Methods
  // ============================================

  /**
   * Start drive navigation with a route.
   *
   * Begins turn-by-turn navigation using the provided route.
   * The display will switch to navigation mode and show
   * upcoming turns with distance and direction.
   *
   * @param route - The drive route to navigate (from routing API)
   * @returns Result indicating success or failure
   */
  async startDriveNavigation(route: DriveRoute): Promise<Result<void>> {
    if (!this.driveCoordinator) {
      logger.error("Drive coordinator not available");
      return failure(
        new OrchestratorError(
          "Drive coordinator not available",
          OrchestratorErrorCode.SERVICE_UNAVAILABLE,
          false,
        ),
      );
    }
    return this.driveCoordinator.startDriveNavigation(route);
  }

  /**
   * Stop current drive navigation.
   *
   * Ends the active navigation session and returns to
   * normal track following mode (if a track is loaded).
   *
   * @returns Result indicating success or failure
   */
  async stopDriveNavigation(): Promise<Result<void>> {
    if (!this.driveCoordinator) {
      return success(undefined);
    }
    return this.driveCoordinator.stopDriveNavigation();
  }

  /**
   * Check if drive navigation is currently active.
   *
   * @returns true if navigation is in progress, false otherwise
   */
  isDriveNavigating(): boolean {
    return this.driveCoordinator?.isDriveNavigating() ?? false;
  }

  /**
   * Register a callback for drive navigation updates.
   *
   * The callback is invoked whenever navigation state changes,
   * including position updates, turn changes, and arrival events.
   *
   * @param callback - Function called with navigation update data
   * @returns Unsubscribe function to remove the callback
   */
  onDriveNavigationUpdate(
    callback: (update: DriveNavigationUpdate) => void,
  ): () => void {
    if (!this.driveCoordinator) {
      logger.warn("Drive coordinator not available for navigation callback");
      return () => {};
    }
    return this.driveCoordinator.onDriveNavigationUpdate(callback);
  }

  /**
   * Update the display with current GPS position and active track.
   *
   * Renders the current view to the e-paper display. The rendered
   * content depends on the active mode:
   * - Track following: Shows map with track and current position
   * - Drive navigation: Shows turn instructions or route overview
   * - Onboarding: Shows WiFi setup or welcome screens
   *
   * @param mode - Display update mode:
   *   - FULL: Complete display refresh (slower, no ghosting)
   *   - PARTIAL: Fast partial update (faster, may ghost)
   *   - AUTO: Let the system choose based on context
   * @returns Result indicating success or failure
   */
  async updateDisplay(mode?: DisplayUpdateMode): Promise<Result<void>> {
    if (!this.isInitialized) {
      logger.warn("Cannot update display: orchestrator not initialized");
      return failure(OrchestratorError.notInitialized());
    }

    if (!this.trackDisplayCoordinator) {
      logger.error("Track display coordinator not available");
      return failure(OrchestratorError.notInitialized());
    }

    return this.trackDisplayCoordinator.updateDisplay(mode);
  }

  /**
   * Set the active GPX file and update display.
   *
   * Loads a GPX track file, validates it, calculates optimal zoom,
   * and renders it to the display. This method also:
   * - Marks onboarding as complete (if this is the first track)
   * - Starts auto-update if configured
   * - Clears any cached turn analysis
   *
   * @param filePath - Path to the GPX file to load
   * @returns Result indicating success or failure
   *
   * @example
   * ```typescript
   * const result = await orchestrator.setActiveGPX('./data/gpx-files/morning-ride.gpx');
   * if (!result.success) {
   *   console.error('Failed to load track:', result.error.message);
   * }
   * ```
   */
  async setActiveGPX(filePath: string): Promise<Result<void>> {
    if (!this.isInitialized) {
      logger.warn("Cannot set active GPX: orchestrator not initialized");
      return failure(OrchestratorError.notInitialized());
    }

    // Queue if another setActiveGPX is in progress
    if (!this.activeGPXQueue.queueOperation(filePath)) {
      return success(undefined);
    }
    logger.info(`Setting active GPX file: ${filePath}`);

    // Clear turn analysis cache for the new track
    if (this.trackDisplayCoordinator) {
      this.trackDisplayCoordinator.clearTurnCache();
    }

    try {
      // Validate the GPX file
      logger.info("Validating GPX file...");
      const validationResult = await this.mapService.validateGPXFile(filePath);
      if (!validationResult.success) {
        logger.error("GPX file validation failed:", validationResult.error);
        return failure(validationResult.error);
      }
      logger.info("✓ GPX file validated");

      // Load the track to calculate fit zoom
      logger.info("Loading track to calculate fit zoom...");
      const trackResult = await this.mapService.getTrack(filePath);
      if (trackResult.success) {
        const fitZoom = this.calculateFitZoom(trackResult.data);
        logger.info(`Setting zoom to fit track: ${fitZoom}`);
        this.configService.setZoomLevel(fitZoom);
      }

      // Set as active
      logger.info("Setting as active GPX and saving config...");
      this.configService.setActiveGPXPath(filePath);

      // Mark onboarding as complete if this is the first track loaded
      if (!this.configService.isOnboardingCompleted()) {
        logger.info("First track loaded - marking onboarding as complete");
        this.configService.setOnboardingCompleted(true);

        // Start auto-update now that onboarding is complete
        const autoRefreshInterval = this.configService.getAutoRefreshInterval();
        if (autoRefreshInterval > 0 && !this.autoUpdateInterval) {
          logger.info(
            `Starting auto-update (interval: ${autoRefreshInterval}s) after onboarding...`,
          );
          void this.startAutoUpdate();
        }
      }

      await this.configService.save();
      logger.info("✓ Active GPX saved to config");

      // Update display with FULL refresh for new track
      logger.info("Updating display with new GPX (FULL refresh)...");
      return await this.updateDisplay(DisplayUpdateMode.FULL);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to set active GPX: ${errorMsg}`);
      const err = error instanceof Error ? error : new Error("Unknown error");
      return failure(OrchestratorError.updateFailed("Set active GPX", err));
    } finally {
      // Set up handler and complete operation (which will process pending if any)
      this.activeGPXQueue.setOperationHandler(async (p) => {
        await this.setActiveGPX(p);
      });
      this.activeGPXQueue.completeOperation();
    }
  }

  /**
   * Clear the active GPX file.
   *
   * Removes the currently loaded track and clears the turn cache.
   * The display will show no track until a new one is loaded.
   *
   * @returns Result indicating success
   */
  async clearActiveGPX(): Promise<Result<void>> {
    logger.info("Clearing active GPX file");
    this.configService.setActiveGPXPath(null);

    // Clear turn analysis cache
    if (this.trackDisplayCoordinator) {
      this.trackDisplayCoordinator.clearTurnCache();
    }

    await this.configService.save();
    logger.info("✓ Active GPX cleared");
    return success(undefined);
  }

  /**
   * Change zoom level and update display.
   *
   * Adjusts the current zoom level by the specified delta.
   * Positive values zoom in, negative values zoom out.
   *
   * @param delta - Amount to change zoom (e.g., +1 to zoom in, -1 to zoom out)
   * @returns Result indicating success or failure
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
   * Set absolute zoom level and update display.
   *
   * Sets the zoom level to a specific value (typically 1-20).
   * Higher values show more detail, lower values show more area.
   *
   * @param level - Zoom level to set (1-20, where 15-17 is typical for cycling)
   * @returns Result indicating success or failure
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
   * Calculate zoom level that fits a track's bounds on the display.
   *
   * Analyzes the track bounds and display dimensions to find the
   * optimal zoom level that shows the entire track with padding.
   *
   * @param track - The GPX track to fit
   * @returns Zoom level (1-20) that fits the track on display
   */
  calculateFitZoom(track: GPXTrack): number {
    const bounds = this.mapService.calculateBounds(track);
    const displayWidth = this.configService.getDisplayWidth();
    const displayHeight = this.configService.getDisplayHeight();

    // Calculate the center latitude for mercator projection
    const centerLat = (bounds.minLat + bounds.maxLat) / 2;

    // Calculate the span in degrees
    const latSpan = bounds.maxLat - bounds.minLat;
    const lonSpan = bounds.maxLon - bounds.minLon;

    // Convert to approximate meters (at center latitude)
    const latMeters = latSpan * 111320; // ~111.32 km per degree latitude
    const lonMeters = lonSpan * 111320 * Math.cos((centerLat * Math.PI) / 180);

    // Calculate meters per pixel needed (with some padding)
    const padding = 0.8; // Use 80% of screen for track
    const metersPerPixelX = lonMeters / (displayWidth * padding);
    const metersPerPixelY = latMeters / (displayHeight * padding);
    const metersPerPixel = Math.max(metersPerPixelX, metersPerPixelY);

    // Earth circumference in meters
    const earthCircumference = 40075016.686;

    // Calculate zoom level
    // At zoom z, meters per pixel = (earthCircumference * cos(lat)) / (256 * 2^z)
    // So: 2^z = (earthCircumference * cos(lat)) / (256 * metersPerPixel)
    const cosLat = Math.cos((centerLat * Math.PI) / 180);
    const zoomExact = Math.log2(
      (earthCircumference * cosLat) / (256 * metersPerPixel),
    );

    // Clamp to valid zoom range and round down for safety
    const zoom = Math.max(1, Math.min(20, Math.floor(zoomExact)));

    logger.info(
      `Calculated fit zoom: bounds=${latSpan.toFixed(4)}°×${lonSpan.toFixed(4)}°, ` +
        `display=${displayWidth}×${displayHeight}, zoom=${zoom}`,
    );

    return zoom;
  }

  /**
   * Calculate zoom level that fits a route's geometry bounds on the display
   * @param geometry Array of [latitude, longitude] coordinates
   */
  private calculateFitZoomFromGeometry(geometry: [number, number][]): number {
    if (geometry.length === 0) {
      return this.configService.getZoomLevel();
    }

    // Calculate bounds from geometry
    let minLat = geometry[0][0];
    let maxLat = geometry[0][0];
    let minLon = geometry[0][1];
    let maxLon = geometry[0][1];

    for (const [lat, lon] of geometry) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
    }

    const displayWidth = this.configService.getDisplayWidth();
    const displayHeight = this.configService.getDisplayHeight();

    // Calculate the center latitude for mercator projection
    const centerLat = (minLat + maxLat) / 2;

    // Calculate the span in degrees
    const latSpan = maxLat - minLat;
    const lonSpan = maxLon - minLon;

    // Convert to approximate meters (at center latitude)
    const latMeters = latSpan * 111320; // ~111.32 km per degree latitude
    const lonMeters = lonSpan * 111320 * Math.cos((centerLat * Math.PI) / 180);

    // Calculate meters per pixel needed (with some padding)
    const padding = 0.8; // Use 80% of screen for route
    const metersPerPixelX = lonMeters / (displayWidth * padding);
    const metersPerPixelY = latMeters / (displayHeight * padding);
    const metersPerPixel = Math.max(metersPerPixelX, metersPerPixelY);

    // Earth circumference in meters
    const earthCircumference = 40075016.686;

    // Calculate zoom level
    const cosLat = Math.cos((centerLat * Math.PI) / 180);
    const zoomExact = Math.log2(
      (earthCircumference * cosLat) / (256 * metersPerPixel),
    );

    // Clamp to valid zoom range and round down for safety
    const zoom = Math.max(1, Math.min(20, Math.floor(zoomExact)));

    logger.info(
      `Calculated drive route fit zoom: bounds=${latSpan.toFixed(4)}°×${lonSpan.toFixed(4)}°, ` +
        `display=${displayWidth}×${displayHeight}, zoom=${zoom}`,
    );

    return zoom;
  }

  /**
   * Refresh GPS position and update display.
   *
   * Forces an immediate display update with the latest GPS position.
   * Useful for manual refresh when auto-update is disabled.
   *
   * @returns Result indicating success or failure
   */
  async refreshGPS(): Promise<Result<void>> {
    logger.info("Refreshing GPS and updating display");
    return await this.updateDisplay();
  }

  /**
   * Start automatic display updates at configured interval.
   *
   * Begins periodic display updates using the interval configured
   * in ConfigService. Useful for keeping the display in sync with
   * GPS position during active tracking.
   *
   * @returns Result indicating success or failure
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
   * Stop automatic display updates.
   *
   * Stops the periodic display update timer. The display will
   * only update on manual refresh or GPS callbacks after this.
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
   * Check if auto-update is running.
   *
   * @returns true if automatic updates are active, false otherwise
   */
  isAutoUpdateRunning(): boolean {
    return this.autoUpdateInterval !== null;
  }

  /**
   * Get current GPS position.
   *
   * Returns the most recently received GPS position from the
   * GPS service or mock service.
   *
   * @returns Result containing the current GPS coordinate or an error
   */
  async getCurrentPosition(): Promise<Result<GPSCoordinate>> {
    if (!this.isInitialized) {
      logger.warn("Cannot get position: orchestrator not initialized");
      return failure(OrchestratorError.notInitialized());
    }

    if (!this.gpsCoordinator) {
      logger.warn("GPS coordinator not available");
      return failure(OrchestratorError.notInitialized());
    }

    return this.gpsCoordinator.getCurrentPosition();
  }

  /**
   * Get system status including all services.
   *
   * Collects status information from all services including:
   * - GPS connection and satellite count
   * - Display initialization and refresh count
   * - Active track information
   * - System resource usage (CPU, memory)
   *
   * @returns Result containing the system status or an error
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
          // Use track name if valid, otherwise fall back to filename
          const hasValidTrackName =
            track.name &&
            track.name !== "Unnamed Track" &&
            track.name.trim() !== "";
          const displayName = hasValidTrackName
            ? track.name
            : path.basename(activeGPXPath).replace(/\.gpx$/i, "");
          activeTrack = {
            name: displayName,
            path: activeGPXPath,
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
   * Clear the display.
   *
   * Clears the e-paper display to white. This is useful before
   * sleep or when switching modes.
   *
   * @returns Result indicating success or failure
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
    // Notify display update callbacks so mock display refreshes
    this.notifyDisplayUpdate(true);
    return success(undefined);
  }

  /**
   * Put the display to sleep.
   *
   * Puts the e-paper display into low-power sleep mode.
   * The display must be woken before any updates can be made.
   *
   * @returns Result indicating success or failure
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
   * Wake the display.
   *
   * Wakes the e-paper display from sleep mode. Must be called
   * before any display updates if the display was put to sleep.
   *
   * @returns Result indicating success or failure
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
   * Toggle auto-center on GPS position.
   *
   * When enabled, the map view automatically centers on the
   * current GPS position during display updates.
   *
   * @param enabled - true to enable auto-centering, false to disable
   */
  setAutoCenter(enabled: boolean): void {
    logger.info(`Auto-center ${enabled ? "enabled" : "disabled"}`);
    this.configService.setAutoCenter(enabled);
  }

  /**
   * Toggle map rotation based on GPS bearing.
   *
   * When enabled, the map rotates so the current direction of
   * travel is always "up" on the display (track-up mode).
   *
   * @param enabled - true to enable bearing rotation, false for north-up mode
   */
  setRotateWithBearing(enabled: boolean): void {
    logger.info(`Rotate with bearing ${enabled ? "enabled" : "disabled"}`);
    this.configService.setRotateWithBearing(enabled);
  }

  /**
   * Set the active screen type for display rendering.
   *
   * Controls which type of screen is rendered on the display.
   *
   * @param screenType - Screen type: "track" for map view or "turn_by_turn" for navigation
   */
  setActiveScreen(screenType: string): void {
    logger.info(`Setting active screen to: ${screenType}`);
    // Import ScreenType and validate
    const validTypes = ["track", "turn_by_turn"];
    if (validTypes.includes(screenType)) {
      this.configService.setActiveScreen(screenType as ScreenType);
    } else {
      logger.warn(`Invalid screen type: ${screenType}`);
    }
  }

  /**
   * Register a callback for GPS position updates.
   *
   * The callback is invoked whenever a new GPS position is received.
   * This is useful for real-time position tracking in the UI.
   *
   * @param callback - Function called with the new GPS position
   * @returns Unsubscribe function to remove the callback
   *
   * @example
   * ```typescript
   * const unsubscribe = orchestrator.onGPSUpdate((position) => {
   *   console.log(`Lat: ${position.latitude}, Lon: ${position.longitude}`);
   * });
   * // Later: unsubscribe() to stop receiving updates
   * ```
   */
  onGPSUpdate(callback: (position: GPSCoordinate) => void): () => void {
    if (!this.gpsCoordinator) {
      logger.warn("GPS coordinator not available for GPS update callback");
      return () => {};
    }
    return this.gpsCoordinator.onGPSUpdate(callback);
  }

  /**
   * Register a callback for GPS status changes.
   *
   * The callback is invoked when GPS status changes (fix acquired/lost,
   * satellite count changes, etc.).
   *
   * @param callback - Function called with the new GPS status
   * @returns Unsubscribe function to remove the callback
   */
  onGPSStatusChange(callback: (status: GPSStatus) => void): () => void {
    if (!this.gpsCoordinator) {
      logger.warn("GPS coordinator not available for GPS status callback");
      return () => {};
    }
    return this.gpsCoordinator.onGPSStatusChange(callback);
  }

  /**
   * Register a callback for display updates.
   *
   * The callback is invoked after each display update attempt,
   * with a boolean indicating success or failure.
   *
   * @param callback - Function called with the update result
   * @returns Unsubscribe function to remove the callback
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
   * Register a callback for errors.
   *
   * The callback is invoked when errors occur during orchestrator
   * operations, useful for error logging and user notification.
   *
   * @param callback - Function called with the error
   * @returns Unsubscribe function to remove the callback
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
   * Register a callback for WiFi state changes.
   *
   * The callback is invoked when WiFi state transitions occur
   * (connected, disconnected, hotspot mode, etc.).
   *
   * @param callback - Function called with current and previous WiFi state
   * @returns Unsubscribe function to remove the callback
   */
  onWiFiStateChange(
    callback: (state: WiFiState, previousState: WiFiState) => void,
  ): () => void {
    if (!this.onboardingCoordinator) {
      logger.warn(
        "OnboardingCoordinator not available for WiFi state callback",
      );
      return () => {};
    }
    return this.onboardingCoordinator.onWiFiStateChange(callback);
  }

  /**
   * Check if onboarding is needed and show appropriate screen.
   *
   * Should be called after all services are initialized. Displays
   * the appropriate onboarding screen based on current state
   * (WiFi setup, track selection, etc.).
   *
   * @returns Result indicating success or failure
   */
  async checkAndShowOnboardingScreen(): Promise<Result<void>> {
    if (!this.isInitialized) {
      logger.warn(
        "Orchestrator not initialized - cannot show onboarding screen",
      );
      return failure(OrchestratorError.notInitialized());
    }

    if (!this.onboardingCoordinator) {
      logger.warn("OnboardingCoordinator not available");
      return success(undefined);
    }

    return this.onboardingCoordinator.checkAndShowOnboardingScreen();
  }

  /**
   * Restart the onboarding flow (used after factory reset).
   *
   * Resets the onboarding state and displays the startup logo
   * followed by WiFi setup instructions. Called when the user
   * performs a factory reset.
   *
   * @returns Result indicating success or failure
   */
  async restartOnboarding(): Promise<Result<void>> {
    if (!this.isInitialized) {
      logger.warn("Orchestrator not initialized - cannot restart onboarding");
      return failure(OrchestratorError.notInitialized());
    }

    if (!this.onboardingCoordinator) {
      logger.warn("OnboardingCoordinator not available");
      return success(undefined);
    }

    return this.onboardingCoordinator.restartOnboarding();
  }

  /**
   * Set the number of connected WebSocket clients.
   *
   * Updates the onboarding coordinator with the current WebSocket
   * client count. Shows "select track" screen when clients connect,
   * returns to connected screen when all disconnect.
   *
   * @param count - Number of currently connected WebSocket clients
   */
  setWebSocketClientCount(count: number): void {
    if (this.onboardingCoordinator) {
      this.onboardingCoordinator.setWebSocketClientCount(count);
    }
  }

  /**
   * Clean up resources and shut down all services.
   *
   * Disposes all sub-coordinators, stops auto-update, clears callbacks,
   * and disposes GPS and e-paper services. Should be called during
   * application shutdown.
   */
  async dispose(): Promise<void> {
    logger.info("Disposing RenderingOrchestrator...");

    // Dispose onboarding coordinator (stops GPS refresh, WiFi subscriptions)
    if (this.onboardingCoordinator) {
      logger.info("Disposing OnboardingCoordinator...");
      this.onboardingCoordinator.dispose();
      this.onboardingCoordinator = null;
      logger.info("✓ OnboardingCoordinator disposed");
    }

    // Dispose GPS coordinator (stops GPS subscriptions, clears callbacks)
    if (this.gpsCoordinator) {
      logger.info("Disposing GPSCoordinator...");
      this.gpsCoordinator.dispose();
      this.gpsCoordinator = null;
      logger.info("✓ GPSCoordinator disposed");
    }

    // Dispose drive coordinator (stops drive navigation subscriptions)
    if (this.driveCoordinator) {
      logger.info("Disposing DriveCoordinator...");
      this.driveCoordinator.dispose();
      this.driveCoordinator = null;
      logger.info("✓ DriveCoordinator disposed");
    }

    // Dispose simulation coordinator (stops simulation subscriptions)
    if (this.simulationCoordinator) {
      logger.info("Disposing SimulationCoordinator...");
      this.simulationCoordinator.dispose();
      this.simulationCoordinator = null;
      logger.info("✓ SimulationCoordinator disposed");
    }

    // Dispose track display coordinator (clears turn cache)
    if (this.trackDisplayCoordinator) {
      logger.info("Disposing TrackDisplayCoordinator...");
      this.trackDisplayCoordinator.dispose();
      this.trackDisplayCoordinator = null;
      logger.info("✓ TrackDisplayCoordinator disposed");
    }

    // Stop auto-update if running
    logger.info("Stopping auto-update if running");
    this.stopAutoUpdate();

    // Clear remaining callbacks
    const totalCallbacks =
      this.displayUpdateCallbacks.length + this.errorCallbacks.length;
    logger.info(`Clearing ${totalCallbacks} registered callbacks`);
    this.displayUpdateCallbacks = [];
    this.errorCallbacks = [];

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
   * Get the mock display image (only available when using MockEpaperService).
   *
   * Returns the current display contents as a PNG buffer for
   * development/testing purposes.
   *
   * @returns PNG buffer of the display contents, or null if not available
   */
  getMockDisplayImage(): Buffer | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockService = this.epaperService as any;
    if (mockService && typeof mockService.getMockDisplayImage === "function") {
      return mockService.getMockDisplayImage();
    }
    return null;
  }

  /**
   * Check if mock display image is available.
   *
   * @returns true if using MockEpaperService and an image has been rendered
   */
  hasMockDisplayImage(): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockService = this.epaperService as any;
    return (
      mockService &&
      typeof mockService.hasMockDisplayImage === "function" &&
      mockService.hasMockDisplayImage()
    );
  }

  /**
   * Check if GPS service is a mock (for development).
   *
   * @returns true if using MockGPSService, false if using real GPS hardware
   */
  isMockGPS(): boolean {
    return (
      this.gpsService &&
      typeof this.gpsService.isMock === "function" &&
      this.gpsService.isMock()
    );
  }

  /**
   * Set mock GPS position (only works with MockGPSService).
   *
   * Useful for setting position to track start before drive simulation
   * or for development testing.
   *
   * @param latitude - Latitude in decimal degrees
   * @param longitude - Longitude in decimal degrees
   * @returns true if position was set, false if not using mock GPS
   */
  setMockGPSPosition(latitude: number, longitude: number): boolean {
    if (!this.isMockGPS()) {
      logger.warn("Cannot set mock GPS position: not using mock GPS service");
      return false;
    }

    if (typeof this.gpsService.setPosition === "function") {
      logger.info(
        `Setting mock GPS position to ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      );
      this.gpsService.setPosition(latitude, longitude);
      return true;
    }

    return false;
  }
}
