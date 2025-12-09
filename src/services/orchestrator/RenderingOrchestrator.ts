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
  TextTemplate,
  DriveNavigationInfo,
  FollowTrackInfo,
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
  DriveDisplayMode,
  NavigationState,
  success,
  failure,
  DisplayUpdateMode,
} from "@core/types";
import { OrchestratorError, OrchestratorErrorCode } from "@core/errors";
import { getLogger } from "@utils/logger";
import * as os from "os";
import * as path from "path";

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

  // WebSocket client tracking for "select track" screen
  private webSocketClientCount: number = 0;
  private gpsInfoRefreshInterval: NodeJS.Timeout | null = null;
  private lastGPSPosition: GPSCoordinate | null = null;
  private lastGPSStatus: GPSStatus | null = null;
  private lastDisplayedGPSPosition: GPSCoordinate | null = null;
  private lastDisplayedGPSStatus: GPSStatus | null = null;
  private static readonly GPS_INFO_REFRESH_INTERVAL_MS = 15000; // 15 seconds

  // Simulation support
  private simulationPositionUnsubscribe: (() => void) | null = null;
  private simulationDisplayInterval: NodeJS.Timeout | null = null;
  private lastSimulationState: string | null = null;
  private static readonly SIMULATION_DISPLAY_UPDATE_MS = 5000; // Update e-paper every 5s during simulation

  // Drive navigation support
  private driveNavigationUnsubscribe: (() => void) | null = null;
  private driveDisplayUnsubscribe: (() => void) | null = null;
  private driveNavigationCallbacks: Array<
    (update: DriveNavigationUpdate) => void
  > = [];
  private driveRouteStartPosition: GPSCoordinate | null = null; // Stored at navigation start

  // Display update queuing (prevents dropped updates when display is busy)
  private isUpdateInProgress: boolean = false;
  private pendingUpdateMode: DisplayUpdateMode | null = null;

  // Drive display update queuing (prevents concurrent renders that can freeze the app)
  private isDriveUpdateInProgress: boolean = false;
  private pendingDriveUpdate: boolean = false;

  // setActiveGPX queuing (ensures only the last selected track is loaded)
  private isSetActiveGPXInProgress: boolean = false;
  private pendingActiveGPXPath: string | null = null;

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
          logger.info("Subscribing to simulation state changes...");
          this.subscribeToSimulationUpdates();
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
      // Skip real GPS updates when simulation is running or drive nav is in simulation mode
      // to avoid mixing simulated positions with real (often 0,0) positions
      if (this.simulationService?.isSimulating()) {
        return;
      }

      // Also skip invalid (0,0) positions when drive navigation is active
      // Real GPS without fix sends (0,0) which would corrupt distance calculations
      if (this.driveNavigationService?.isNavigating()) {
        if (
          Math.abs(position.latitude) < 0.001 &&
          Math.abs(position.longitude) < 0.001
        ) {
          logger.debug(
            "Skipping invalid (0,0) GPS position during drive navigation",
          );
          return;
        }
      }

      // Store latest position for GPS info screen
      this.lastGPSPosition = position;

      // Forward to drive navigation service if navigating
      if (this.driveNavigationService?.isNavigating()) {
        this.driveNavigationService.updatePosition(position);
      }

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
      // Store latest status for GPS info screen
      this.lastGPSStatus = status;

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
   * Subscribe to simulation state changes to trigger display updates
   */
  private subscribeToSimulationUpdates(): void {
    if (!this.simulationService) {
      return;
    }

    // Subscribe to state changes (start/stop/pause)
    this.simulationService.onStateChange((status) => {
      // Only act on actual state transitions
      if (status.state === this.lastSimulationState) {
        return;
      }

      logger.info(
        `Simulation state changed: ${this.lastSimulationState} -> ${status.state}`,
      );
      this.lastSimulationState = status.state;

      if (status.state === "running") {
        // Stop auto-update during simulation to prevent concurrent updates
        if (this.autoUpdateInterval) {
          logger.info("Stopping auto-update during simulation");
          this.stopAutoUpdate();
        }
        // Start periodic display updates during simulation
        this.startSimulationDisplayUpdates();
      } else if (status.state === "stopped") {
        // Stop periodic display updates when simulation stops
        this.stopSimulationDisplayUpdates();

        // If drive navigation is still active, show final drive display
        if (this.driveNavigationService?.isNavigating()) {
          logger.info(
            "Simulation stopped but drive navigation still active - showing final drive display",
          );
          void this.updateDriveDisplay().catch((error) => {
            logger.error("Failed to show final drive display:", error);
          });
        }
      }
      // Note: "paused" state keeps the interval but updateDisplay won't change position
    });

    // Subscribe to position updates and forward to drive navigation
    this.simulationPositionUnsubscribe =
      this.simulationService.onPositionUpdate((position) => {
        // Store latest position
        this.lastGPSPosition = position;

        const isNav = this.driveNavigationService?.isNavigating() ?? false;
        logger.debug(
          `Sim position: ${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}, isNavigating=${isNav}`,
        );

        // Forward to drive navigation service if navigating
        if (isNav) {
          this.driveNavigationService!.updatePosition(position);
        }

        // Notify all GPS update callbacks (web interface uses these)
        this.gpsUpdateCallbacks.forEach((callback) => {
          try {
            callback(position);
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            logger.error(`Error in simulated GPS update callback: ${errorMsg}`);
          }
        });
      });

    logger.info("Subscribed to simulation state and position changes");
  }

  /**
   * Start periodic display updates during simulation
   */
  private startSimulationDisplayUpdates(): void {
    // Stop any existing interval
    this.stopSimulationDisplayUpdates();

    logger.info(
      `Starting simulation display updates (every ${RenderingOrchestrator.SIMULATION_DISPLAY_UPDATE_MS}ms)`,
    );

    // Helper to perform the appropriate display update
    const doDisplayUpdate = () => {
      // If drive navigation is active, use drive display update instead
      if (this.driveNavigationService?.isNavigating()) {
        logger.info("Simulation display update tick (drive mode)");
        void this.updateDriveDisplay().catch((error) => {
          logger.error("Drive display update failed:", error);
        });
      } else {
        logger.info("Simulation display update tick (track mode)");
        void this.updateDisplay().catch((error) => {
          logger.error("Simulation display update failed:", error);
        });
      }
    };

    // Do an immediate update
    doDisplayUpdate();

    // Set up periodic updates
    this.simulationDisplayInterval = setInterval(() => {
      if (this.simulationService?.isSimulating()) {
        doDisplayUpdate();
      }
    }, RenderingOrchestrator.SIMULATION_DISPLAY_UPDATE_MS);
  }

  /**
   * Stop periodic display updates for simulation
   */
  private stopSimulationDisplayUpdates(): void {
    if (this.simulationDisplayInterval) {
      clearInterval(this.simulationDisplayInterval);
      this.simulationDisplayInterval = null;
      logger.info("Stopped simulation display updates");
    }
  }

  // ============================================
  // Drive Navigation Methods
  // ============================================

  /**
   * Start drive navigation with a route
   */
  async startDriveNavigation(route: DriveRoute): Promise<Result<void>> {
    if (!this.driveNavigationService) {
      logger.error("Drive navigation service not available");
      return failure(
        new OrchestratorError(
          "Drive navigation service not available",
          OrchestratorErrorCode.SERVICE_UNAVAILABLE,
          false,
        ),
      );
    }

    logger.info(`Starting drive navigation to: ${route.destination}`);

    // Stop GPS info refresh - we don't want select track screen during navigation
    this.stopGPSInfoRefresh();

    // Store route start position for fallback during simulation
    if (route.geometry && route.geometry.length > 0) {
      const startPoint = route.geometry[0];
      this.driveRouteStartPosition = {
        latitude: startPoint[0],
        longitude: startPoint[1],
        timestamp: new Date(),
      };
      logger.info(
        `Stored drive route start: ${startPoint[0].toFixed(6)}, ${startPoint[1].toFixed(6)}`,
      );
    }

    // Subscribe to navigation updates
    this.subscribeToDriveNavigation();

    // Start navigation
    const result = await this.driveNavigationService.startNavigation(route);

    if (result.success) {
      // Subscribe to GPS updates for navigation
      this.subscribeGPSToDriveNavigation();
    }

    return result;
  }

  /**
   * Stop current drive navigation
   */
  async stopDriveNavigation(): Promise<Result<void>> {
    if (!this.driveNavigationService) {
      return success(undefined);
    }

    logger.info("Stopping drive navigation");

    // Clear stored route start position
    this.driveRouteStartPosition = null;

    // Unsubscribe from GPS updates
    this.unsubscribeGPSFromDriveNavigation();

    // Unsubscribe from navigation updates
    if (this.driveNavigationUnsubscribe) {
      this.driveNavigationUnsubscribe();
      this.driveNavigationUnsubscribe = null;
    }

    return this.driveNavigationService.stopNavigation();
  }

  /**
   * Check if drive navigation is currently active
   */
  isDriveNavigating(): boolean {
    return this.driveNavigationService?.isNavigating() ?? false;
  }

  /**
   * Register a callback for drive navigation updates
   */
  onDriveNavigationUpdate(
    callback: (update: DriveNavigationUpdate) => void,
  ): () => void {
    this.driveNavigationCallbacks.push(callback);
    return () => {
      const index = this.driveNavigationCallbacks.indexOf(callback);
      if (index > -1) {
        this.driveNavigationCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to drive navigation updates
   */
  private subscribeToDriveNavigation(): void {
    if (!this.driveNavigationService) {
      return;
    }

    // Unsubscribe from any existing subscription
    if (this.driveNavigationUnsubscribe) {
      this.driveNavigationUnsubscribe();
    }

    this.driveNavigationUnsubscribe =
      this.driveNavigationService.onNavigationUpdate((update) => {
        logger.debug(`Drive navigation update: ${update.type}`);

        // Forward to registered callbacks
        for (const callback of this.driveNavigationCallbacks) {
          try {
            callback(update);
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            logger.error(`Error in drive navigation callback: ${errorMsg}`);
          }
        }

        // Skip display updates when simulation is running - the simulation
        // display interval handles display updates during simulation
        if (this.simulationService?.isSimulating()) {
          return;
        }

        // Update display based on navigation state
        void this.updateDriveDisplay(update).catch((error) => {
          logger.error("Failed to update drive display:", error);
        });
      });

    // Also subscribe to display update requests
    if (this.driveDisplayUnsubscribe) {
      this.driveDisplayUnsubscribe();
    }

    this.driveDisplayUnsubscribe = this.driveNavigationService.onDisplayUpdate(
      () => {
        // Skip display updates when simulation is running - the simulation
        // display interval handles display updates during simulation
        if (this.simulationService?.isSimulating()) {
          return;
        }

        void this.updateDriveDisplay().catch((error) => {
          logger.error("Failed to update drive display:", error);
        });
      },
    );

    logger.info("Subscribed to drive navigation updates");
  }

  /**
   * Subscribe GPS position updates to drive navigation
   */
  private subscribeGPSToDriveNavigation(): void {
    // The GPS service is already subscribed at orchestrator initialization
    // The position updates will be forwarded to drive navigation via onPositionUpdate callback
  }

  /**
   * Unsubscribe GPS from drive navigation
   */
  private unsubscribeGPSFromDriveNavigation(): void {
    // GPS is always subscribed via the orchestrator, so nothing specific to unsubscribe
  }

  /**
   * Update the display for drive navigation
   */
  private async updateDriveDisplay(
    update?: DriveNavigationUpdate,
  ): Promise<Result<void>> {
    if (!this.driveNavigationService || !this.isInitialized) {
      return success(undefined);
    }

    const status =
      update?.status ?? this.driveNavigationService.getNavigationStatus();

    if (status.state === NavigationState.IDLE) {
      return success(undefined);
    }

    // Queue update if one is already in progress (prevents concurrent renders that freeze the app)
    if (this.isDriveUpdateInProgress) {
      this.pendingDriveUpdate = true;
      logger.debug("Drive display update queued, current update in progress");
      return success(undefined);
    }

    // Also check if e-paper display is busy (prevents lgpio native module deadlock)
    // The lgpio module doesn't handle concurrent GPIO/SPI access well, which can
    // cause the entire Node.js process to hang if we start rendering while the
    // display is still processing the previous update
    if (this.epaperService.isBusy()) {
      this.pendingDriveUpdate = true;
      logger.debug(
        "Drive display update queued, e-paper display is busy with previous update",
      );
      return success(undefined);
    }

    this.isDriveUpdateInProgress = true;
    logger.info(
      `Updating drive display: mode=${status.displayMode}, state=${status.state}`,
    );

    const width = this.configService.getDisplayWidth();
    const height = this.configService.getDisplayHeight();

    // Use the configured zoom level from display settings
    const zoomLevel = this.configService.getZoomLevel();

    // Use current position, or fall back to stored route start (not 0,0)
    // The stored start position is set when navigation begins and persists
    let centerPoint = this.lastGPSPosition;
    if (!centerPoint && this.driveRouteStartPosition) {
      centerPoint = this.driveRouteStartPosition;
      logger.info(
        `Using stored route start as center: ${centerPoint.latitude.toFixed(6)}, ${centerPoint.longitude.toFixed(6)}`,
      );
    }
    if (!centerPoint) {
      centerPoint = { latitude: 0, longitude: 0, timestamp: new Date() };
    }

    const viewport = {
      width,
      height,
      zoomLevel,
      centerPoint,
    };

    try {
      let renderResult;
      const renderStartTime = Date.now();

      switch (status.displayMode) {
        case DriveDisplayMode.TURN_SCREEN:
          if (status.nextTurn) {
            logger.info("Starting turn screen render...");
            renderResult = await this.svgService.renderTurnScreen(
              status.nextTurn.maneuverType,
              status.distanceToNextTurn,
              status.nextTurn.instruction,
              status.nextTurn.streetName,
              viewport,
            );
            logger.info(
              `Turn screen render completed in ${Date.now() - renderStartTime}ms`,
            );
          }
          break;

        case DriveDisplayMode.MAP_WITH_OVERLAY:
          if (status.route && status.nextTurn && this.lastGPSPosition) {
            const info: DriveNavigationInfo = {
              speed: this.lastGPSPosition.speed
                ? this.lastGPSPosition.speed * 3.6
                : 0, // m/s to km/h
              satellites: this.lastGPSStatus?.satellitesInUse ?? 0,
              nextManeuver: status.nextTurn.maneuverType,
              distanceToTurn: status.distanceToNextTurn,
              instruction: status.nextTurn.instruction,
              streetName: status.nextTurn.streetName,
              distanceRemaining: status.distanceRemaining,
              progress: status.progress,
              timeRemaining: status.timeRemaining,
            };

            // Get render options including map orientation (north-up vs track-up)
            const renderOptions = {
              ...this.configService.getRenderOptions(),
              rotateWithBearing: this.configService.getRotateWithBearing(),
            };

            logger.info(
              `Starting map screen render (${status.route.geometry?.length ?? 0} geometry points, rotateWithBearing=${renderOptions.rotateWithBearing})...`,
            );
            renderResult = await this.svgService.renderDriveMapScreen(
              status.route,
              this.lastGPSPosition,
              status.nextTurn,
              viewport,
              info,
              renderOptions,
            );
            logger.info(
              `Map screen render completed in ${Date.now() - renderStartTime}ms`,
            );
          }
          break;

        case DriveDisplayMode.OFF_ROAD_ARROW:
          if (
            status.bearingToRoute !== undefined &&
            status.distanceToRoute !== undefined
          ) {
            renderResult = await this.svgService.renderOffRoadScreen(
              status.bearingToRoute,
              status.distanceToRoute,
              viewport,
            );
          }
          break;

        case DriveDisplayMode.ARRIVED:
          if (status.route) {
            renderResult = await this.svgService.renderArrivalScreen(
              status.route.destination,
              viewport,
            );
          }
          break;
      }

      if (renderResult?.success) {
        await this.epaperService.displayBitmap(renderResult.data);
        logger.info("Drive display updated successfully");
        // Notify display update callbacks so mock display refreshes
        this.notifyDisplayUpdate(true);
      } else if (renderResult) {
        logger.error("Failed to render drive display:", renderResult.error);
      }

      return success(undefined);
    } catch (error) {
      logger.error("Error updating drive display:", error);
      return failure(
        new OrchestratorError(
          "Failed to update drive display",
          OrchestratorErrorCode.DISPLAY_UPDATE_FAILED,
          true,
        ),
      );
    } finally {
      this.isDriveUpdateInProgress = false;

      // Process any pending update
      if (this.pendingDriveUpdate) {
        this.pendingDriveUpdate = false;
        logger.debug("Processing pending drive display update");
        // Use setImmediate to avoid stack overflow from recursive calls
        setImmediate(() => {
          void this.updateDriveDisplay().catch((err) => {
            logger.error("Error processing pending drive update:", err);
          });
        });
      }
    }
  }

  /**
   * Update the display with current GPS position and active track
   * @param mode Optional display update mode (FULL, PARTIAL, or AUTO)
   */
  async updateDisplay(mode?: DisplayUpdateMode): Promise<Result<void>> {
    if (!this.isInitialized) {
      logger.warn("Cannot update display: orchestrator not initialized");
      return failure(OrchestratorError.notInitialized());
    }

    // During drive simulation, always use drive display instead of track display
    // This prevents flipping between drive and track screens
    if (
      this.simulationService?.isSimulating() &&
      this.driveNavigationService?.isNavigating()
    ) {
      logger.info(
        "Drive simulation active - redirecting to drive display update",
      );
      return this.updateDriveDisplay();
    }

    // Queue update if one is already in progress
    if (this.isUpdateInProgress) {
      // Keep FULL mode if any queued update requests it
      if (
        mode === DisplayUpdateMode.FULL ||
        this.pendingUpdateMode !== DisplayUpdateMode.FULL
      ) {
        this.pendingUpdateMode = mode ?? DisplayUpdateMode.AUTO;
      }
      logger.info(
        `Display update queued (mode: ${this.pendingUpdateMode}), current update in progress`,
      );
      return success(undefined);
    }

    // Also check if e-paper display is busy (prevents lgpio native module deadlock)
    if (this.epaperService.isBusy()) {
      this.pendingUpdateMode = mode ?? DisplayUpdateMode.AUTO;
      logger.info(
        `Display update queued (mode: ${this.pendingUpdateMode}), e-paper display is busy`,
      );
      return success(undefined);
    }

    this.isUpdateInProgress = true;
    logger.info("Starting display update...");

    try {
      let track: GPXTrack;

      // Check if drive navigation is active - use route geometry as track
      if (this.driveNavigationService?.isNavigating()) {
        const activeRoute = this.driveNavigationService.getActiveRoute();
        if (activeRoute && activeRoute.geometry) {
          logger.info("Step 1/5: Using drive route geometry as track...");
          // Convert drive route geometry to GPXTrack format
          track = {
            name: `Drive to ${activeRoute.destination}`,
            segments: [
              {
                points: activeRoute.geometry.map((coord) => ({
                  latitude: coord[0],
                  longitude: coord[1],
                  altitude: 0,
                  timestamp: new Date(),
                })),
              },
            ],
          };
          const pointCount = track.segments[0].points.length;
          logger.info(
            `✓ Drive route track: ${pointCount} points to ${activeRoute.destination}`,
          );
        } else {
          logger.warn("Drive navigation active but no route geometry");
          return failure(OrchestratorError.noActiveGPX());
        }
      } else {
        // Step 1: Get active GPX path first (needed for fallback position)
        logger.info("Step 1/5: Getting active GPX path...");
        const gpxPath = this.configService.getActiveGPXPath();
        if (!gpxPath) {
          logger.warn("No active GPX file configured");
          return failure(OrchestratorError.noActiveGPX());
        }
        logger.info(`✓ Active GPX: ${gpxPath}`);

        // Step 2: Load the track (needed early for fallback position)
        logger.info("Step 2/5: Loading GPX track...");
        const trackResult = await this.mapService.getTrack(gpxPath);
        if (!trackResult.success) {
          logger.error("Failed to load track:", trackResult.error);
          return failure(
            OrchestratorError.updateFailed("GPX track", trackResult.error),
          );
        }
        track = trackResult.data;
        const pointCount = track.segments.reduce(
          (sum, seg) => sum + seg.points.length,
          0,
        );
        logger.info(
          `✓ GPX track loaded: ${track.segments.length} segments, ${pointCount} points`,
        );
      }

      // Step 3: Get current position (simulation > GPS > track start)
      logger.info("Step 3/5: Getting current position...");
      let position: GPSCoordinate;

      if (this.simulationService?.isSimulating()) {
        // Use simulated position
        const simStatus = this.simulationService.getStatus();
        if (simStatus.currentPosition) {
          position = simStatus.currentPosition;
          logger.info(
            `✓ Simulated position: ${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`,
          );
        } else {
          logger.warn("Simulation running but no position available");
          return failure(
            OrchestratorError.updateFailed(
              "GPS position",
              new Error("No simulated position available"),
            ),
          );
        }
      } else {
        // Try real GPS position
        const positionResult = await this.gpsService.getCurrentPosition();
        if (positionResult.success && positionResult.data.latitude !== 0) {
          position = positionResult.data;
          logger.info(
            `✓ GPS position: ${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`,
          );
        } else {
          // Fall back to track's starting point
          const firstPoint = track.segments[0]?.points[0];
          if (firstPoint) {
            position = {
              latitude: firstPoint.latitude,
              longitude: firstPoint.longitude,
              altitude: firstPoint.altitude,
              timestamp: new Date(),
            };
            logger.info(
              `✓ Using track start position: ${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`,
            );
          } else {
            logger.error("No GPS and track has no points");
            return failure(
              OrchestratorError.updateFailed(
                "GPS position",
                new Error("No position available"),
              ),
            );
          }
        }
      }

      // Step 4: Render split view (80% map, 20% info panel)
      logger.info("Step 4/5: Rendering split view to bitmap...");
      const viewport = {
        width: this.configService.getDisplayWidth(),
        height: this.configService.getDisplayHeight(),
        centerPoint: position,
        zoomLevel: this.configService.getZoomLevel(),
      };

      logger.info(
        `Viewport: ${viewport.width}x${viewport.height}, zoom ${viewport.zoomLevel}, center: ${viewport.centerPoint.latitude.toFixed(6)}, ${viewport.centerPoint.longitude.toFixed(6)}`,
      );

      const renderOptions = {
        ...this.configService.getRenderOptions(),
        rotateWithBearing: this.configService.getRotateWithBearing(),
      };
      logger.info(
        `Render options: lineWidth=${renderOptions.lineWidth}, showPoints=${renderOptions.showPoints}, rotateWithBearing=${renderOptions.rotateWithBearing}`,
      );

      // Get satellite count from GPS status
      const gpsStatus = await this.gpsService.getStatus();
      const satellites = gpsStatus.success ? gpsStatus.data.satellitesInUse : 0;

      // Calculate track progress
      const totalDistance = this.mapService.calculateDistance(track);
      const { distanceTraveled, distanceRemaining } =
        this.calculateTrackProgress(track, position, totalDistance);
      const progress =
        totalDistance > 0 ? (distanceTraveled / totalDistance) * 100 : 0;

      // Calculate ETA based on current speed
      const speedMs = position.speed || 0;
      const estimatedTimeRemaining =
        speedMs > 0.5 ? distanceRemaining / speedMs : undefined;

      logger.info(
        `Track progress: ${progress.toFixed(1)}%, ${(distanceTraveled / 1000).toFixed(2)}km traveled, ${(distanceRemaining / 1000).toFixed(2)}km remaining`,
      );

      // Build info for the right panel
      const followTrackInfo: FollowTrackInfo = {
        speed: position.speed ? position.speed * 3.6 : 0, // Convert m/s to km/h
        satellites: satellites,
        bearing: position.bearing,
        progress: progress,
        distanceRemaining: distanceRemaining,
        estimatedTimeRemaining: estimatedTimeRemaining,
      };

      logger.info(
        `Info panel: speed=${followTrackInfo.speed.toFixed(1)} km/h, satellites=${followTrackInfo.satellites}, bearing=${followTrackInfo.bearing || 0}°`,
      );

      const bitmapResult = await this.svgService.renderFollowTrackScreen(
        track,
        position,
        viewport,
        followTrackInfo,
        renderOptions,
      );

      if (!bitmapResult.success) {
        logger.error("Failed to render split view:", bitmapResult.error);
        this.notifyError(bitmapResult.error);
        return failure(
          OrchestratorError.updateFailed(
            "Split view render",
            bitmapResult.error,
          ),
        );
      }
      logger.info(
        `✓ Split view rendered: ${bitmapResult.data.width}x${bitmapResult.data.height}, ${bitmapResult.data.data.length} bytes`,
      );

      // Step 5: Display on e-paper
      logger.info(
        `Step 5/5: Sending bitmap to e-paper display (mode: ${mode || "default"})...`,
      );
      const displayResult = await this.epaperService.displayBitmap(
        bitmapResult.data,
        mode,
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
    } finally {
      this.isUpdateInProgress = false;

      // Process any pending update
      if (this.pendingUpdateMode !== null) {
        const pendingMode = this.pendingUpdateMode;
        this.pendingUpdateMode = null;
        logger.info(`Processing queued display update (mode: ${pendingMode})`);
        // Use setImmediate to avoid stack overflow on rapid updates
        setImmediate(() => {
          void this.updateDisplay(pendingMode);
        });
      }
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

    // Queue if another setActiveGPX is in progress
    if (this.isSetActiveGPXInProgress) {
      this.pendingActiveGPXPath = filePath;
      logger.info(
        `setActiveGPX queued for: ${filePath}, another operation in progress`,
      );
      return success(undefined);
    }

    this.isSetActiveGPXInProgress = true;
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
      this.isSetActiveGPXInProgress = false;

      // Process any pending setActiveGPX request
      if (this.pendingActiveGPXPath !== null) {
        const pendingPath = this.pendingActiveGPXPath;
        this.pendingActiveGPXPath = null;
        logger.info(`Processing queued setActiveGPX for: ${pendingPath}`);
        setImmediate(() => {
          void this.setActiveGPX(pendingPath);
        });
      }
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
   * Calculate zoom level that fits a track's bounds on the display
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
   * Restart the onboarding flow (used after factory reset)
   * Displays the logo, then shows WiFi instructions screen
   */
  async restartOnboarding(): Promise<Result<void>> {
    logger.info("restartOnboarding() called - starting onboarding flow");

    if (!this.isInitialized) {
      logger.warn("Orchestrator not initialized - cannot restart onboarding");
      return failure(OrchestratorError.notInitialized());
    }

    try {
      // Step 1: Display the logo
      logger.info("Step 1: Displaying startup logo...");
      const logoResult = await this.epaperService.displayLogo();
      if (!logoResult.success) {
        logger.error("Failed to display startup logo:", logoResult.error);
        return failure(
          OrchestratorError.updateFailed("Startup logo", logoResult.error),
        );
      }
      logger.info("✓ Startup logo displayed");

      // Wait a moment for the logo to be visible
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Step 2: Show WiFi instructions screen
      logger.info("Step 2: Showing WiFi instructions screen...");
      await this.displayWiFiInstructionsScreen();
      logger.info("✓ WiFi instructions screen displayed");

      // Step 3: Start attempting to connect to the mobile hotspot
      if (this.wifiService) {
        logger.info(
          "Step 3: Starting mobile hotspot connection attempt for onboarding...",
        );
        void this.wifiService
          .attemptMobileHotspotConnection()
          .then((result) => {
            if (result.success) {
              logger.info(
                "Successfully connected to mobile hotspot during onboarding restart!",
              );
            } else {
              logger.warn(
                "Failed to connect to mobile hotspot during onboarding restart:",
                result.error.message,
              );
            }
          });
      }

      return success(undefined);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to restart onboarding: ${errorMsg}`);
      const err = error instanceof Error ? error : new Error("Unknown error");
      return failure(OrchestratorError.updateFailed("Restart onboarding", err));
    }
  }

  /**
   * Set the number of connected WebSocket clients
   * Shows "select track" screen when clients connect, returns to connected screen when all disconnect
   */
  setWebSocketClientCount(count: number): void {
    const previousCount = this.webSocketClientCount;
    this.webSocketClientCount = count;

    logger.info(`WebSocket client count changed: ${previousCount} -> ${count}`);

    // Transition: 0 -> 1+ clients (first client connected)
    if (previousCount === 0 && count > 0) {
      logger.info(
        "First WebSocket client connected - showing select track screen",
      );
      this.startGPSInfoRefresh();
    }

    // Transition: 1+ -> 0 clients (last client disconnected)
    if (previousCount > 0 && count === 0) {
      logger.info(
        "Last WebSocket client disconnected - returning to connected screen",
      );
      this.stopGPSInfoRefresh();
      // Show the connected screen again - skip connection check since we know we were connected
      // (the phone being put away may cause temporary hotspot disconnection)
      void this.displayConnectedScreen(true);
    }
  }

  /**
   * Start the GPS info refresh interval
   */
  private startGPSInfoRefresh(): void {
    // Stop any existing interval
    this.stopGPSInfoRefresh();

    // Reset last displayed data to ensure first update always renders
    this.lastDisplayedGPSPosition = null;
    this.lastDisplayedGPSStatus = null;

    // Display immediately with full update
    void this.displaySelectTrackScreen(true);

    // Set up refresh interval - only update if data has changed
    this.gpsInfoRefreshInterval = setInterval(() => {
      if (this.hasGPSDataChanged()) {
        logger.info(
          "GPS info refresh tick - data changed, updating select track screen",
        );
        void this.displaySelectTrackScreen(true);
      } else {
        logger.debug("GPS info refresh tick - no changes, skipping update");
      }
    }, RenderingOrchestrator.GPS_INFO_REFRESH_INTERVAL_MS);

    logger.info(
      `Started GPS info refresh (every ${RenderingOrchestrator.GPS_INFO_REFRESH_INTERVAL_MS}ms)`,
    );
  }

  /**
   * Check if GPS data has changed since last display update
   */
  private hasGPSDataChanged(): boolean {
    // Check if status changed
    const currentFixQuality = this.lastGPSStatus?.fixQuality ?? null;
    const displayedFixQuality = this.lastDisplayedGPSStatus?.fixQuality ?? null;
    if (currentFixQuality !== displayedFixQuality) {
      return true;
    }

    const currentSatellites = this.lastGPSStatus?.satellitesInUse ?? 0;
    const displayedSatellites =
      this.lastDisplayedGPSStatus?.satellitesInUse ?? 0;
    if (currentSatellites !== displayedSatellites) {
      return true;
    }

    // Check if position changed (null vs non-null)
    const hasCurrentPosition = this.lastGPSPosition !== null;
    const hasDisplayedPosition = this.lastDisplayedGPSPosition !== null;
    if (hasCurrentPosition !== hasDisplayedPosition) {
      return true;
    }

    // If both have position, check if lat/lon changed (within display precision)
    if (this.lastGPSPosition && this.lastDisplayedGPSPosition) {
      // Position is displayed with 5 decimal places, so threshold is 0.000005
      const latDiff = Math.abs(
        this.lastGPSPosition.latitude - this.lastDisplayedGPSPosition.latitude,
      );
      const lonDiff = Math.abs(
        this.lastGPSPosition.longitude -
          this.lastDisplayedGPSPosition.longitude,
      );
      if (latDiff >= 0.000005 || lonDiff >= 0.000005) {
        return true;
      }

      // Check if speed display changed
      // Speed is shown only if > 1 km/h, with 1 decimal place
      const currentSpeedKmh = (this.lastGPSPosition.speed ?? 0) * 3.6;
      const displayedSpeedKmh =
        (this.lastDisplayedGPSPosition.speed ?? 0) * 3.6;
      const currentShowsSpeed = currentSpeedKmh >= 1;
      const displayedShowsSpeed = displayedSpeedKmh >= 1;

      // If visibility changed, update is needed
      if (currentShowsSpeed !== displayedShowsSpeed) {
        return true;
      }

      if (currentShowsSpeed && displayedShowsSpeed) {
        if (Math.abs(currentSpeedKmh - displayedSpeedKmh) >= 0.05) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Stop the GPS info refresh interval
   */
  private stopGPSInfoRefresh(): void {
    if (this.gpsInfoRefreshInterval) {
      clearInterval(this.gpsInfoRefreshInterval);
      this.gpsInfoRefreshInterval = null;
      logger.info("Stopped GPS info refresh");
    }
  }

  /**
   * Display the "select track" screen with GPS info
   * @param fullUpdate Whether to do a full display update (true for first display, false for refresh)
   */
  private async displaySelectTrackScreen(fullUpdate: boolean): Promise<void> {
    if (!this.textRendererService || !this.epaperService) {
      logger.warn(
        "TextRendererService or EpaperService not available for select track screen",
      );
      return;
    }

    // Skip if we have an active track, simulation is running, or drive navigation is active
    // In these cases, the track/navigation display takes priority
    if (
      this.configService.getActiveGPXPath() ||
      this.simulationService?.isSimulating() ||
      this.driveNavigationService?.isNavigating()
    ) {
      logger.info(
        "Skipping select track screen (active track or navigation in progress)",
      );
      return;
    }

    // Build GPS info strings
    const fixQualityStr = this.getFixQualityString();
    const satellitesStr = this.lastGPSStatus
      ? `${this.lastGPSStatus.satellitesInUse} Satellites`
      : "0 Satellites";
    const positionStr = this.getPositionString();
    const speedStr = this.getSpeedString();
    const deviceUrl = this.getDeviceUrl();

    const textBlocks: Array<{
      content: string;
      fontSize: number;
      fontWeight: "normal" | "bold";
      alignment: "left" | "center" | "right";
      marginBottom: number;
    }> = [
      {
        content: "Select a Track",
        fontSize: 32,
        fontWeight: "bold",
        alignment: "center",
        marginBottom: 20,
      },
      {
        content: "Use the web interface to choose a GPX track",
        fontSize: 24,
        fontWeight: "normal",
        alignment: "center",
        marginBottom: 40,
      },
      {
        content: `Fix: ${fixQualityStr}`,
        fontSize: 24,
        fontWeight: "normal",
        alignment: "center",
        marginBottom: 10,
      },
      {
        content: satellitesStr,
        fontSize: 24,
        fontWeight: "normal",
        alignment: "center",
        marginBottom: 10,
      },
    ];

    // Add position if available
    if (positionStr) {
      textBlocks.push({
        content: positionStr,
        fontSize: 24,
        fontWeight: "normal",
        alignment: "center",
        marginBottom: 10,
      });
    }

    // Add speed if available and moving
    if (speedStr) {
      textBlocks.push({
        content: speedStr,
        fontSize: 24,
        fontWeight: "normal",
        alignment: "center",
        marginBottom: 10,
      });
    }

    // Add URL at the bottom
    textBlocks.push({
      content: deviceUrl,
      fontSize: 24,
      fontWeight: "normal",
      alignment: "center",
      marginBottom: 0,
    });

    const template: TextTemplate = {
      version: "1.0",
      title: "Select Track",
      layout: {
        backgroundColor: "white",
        textColor: "black",
        padding: { top: 150, right: 20, bottom: 20, left: 20 },
      },
      textBlocks,
    };

    const width = this.configService.getDisplayWidth();
    const height = this.configService.getDisplayHeight();
    const renderResult = await this.textRendererService.renderTemplate(
      template,
      {},
      width,
      height,
    );

    if (renderResult.success) {
      const updateMode = fullUpdate
        ? DisplayUpdateMode.FULL
        : DisplayUpdateMode.AUTO;
      await this.epaperService.displayBitmap(renderResult.data, updateMode);
      logger.info(
        `Displayed select track screen with GPS info (${fullUpdate ? "full" : "auto"} update)`,
      );

      // Store the data that was displayed for change detection
      this.lastDisplayedGPSPosition = this.lastGPSPosition
        ? { ...this.lastGPSPosition }
        : null;
      this.lastDisplayedGPSStatus = this.lastGPSStatus
        ? { ...this.lastGPSStatus }
        : null;
    } else {
      logger.error("Failed to render select track template");
    }
  }

  /**
   * Get human-readable fix quality string
   */
  private getFixQualityString(): string {
    if (!this.lastGPSStatus) {
      return "No Fix Yet";
    }

    switch (this.lastGPSStatus.fixQuality) {
      case 0: // NO_FIX
        return "No Fix Yet";
      case 1: // GPS_FIX
        return "GPS Fix";
      case 2: // DGPS_FIX
        return "DGPS Fix";
      case 3: // PPS_FIX
        return "PPS Fix";
      case 4: // RTK_FIX
        return "RTK Fix";
      case 5: // FLOAT_RTK
        return "Float RTK";
      default:
        return "Fix Available";
    }
  }

  /**
   * Get formatted position string
   */
  private getPositionString(): string | null {
    if (!this.lastGPSPosition) {
      return null;
    }

    const lat = this.lastGPSPosition.latitude;
    const lon = this.lastGPSPosition.longitude;
    const latDir = lat >= 0 ? "N" : "S";
    const lonDir = lon >= 0 ? "E" : "W";

    return `${Math.abs(lat).toFixed(5)}°${latDir}, ${Math.abs(lon).toFixed(5)}°${lonDir}`;
  }

  /**
   * Get formatted speed string (only if moving)
   */
  private getSpeedString(): string | null {
    if (!this.lastGPSPosition?.speed) {
      return null;
    }

    // Speed is in m/s, convert to km/h
    const speedKmh = this.lastGPSPosition.speed * 3.6;

    // Only show if moving (> 1 km/h)
    if (speedKmh < 1) {
      return null;
    }

    return `Speed: ${speedKmh.toFixed(1)} km/h`;
  }

  /**
   * Clean up resources and shut down all services
   */
  async dispose(): Promise<void> {
    logger.info("Disposing RenderingOrchestrator...");

    // Stop GPS info refresh
    this.stopGPSInfoRefresh();

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

    // Unsubscribe from simulation state changes and stop display updates
    if (this.simulationPositionUnsubscribe) {
      logger.info("Unsubscribing from simulation state changes");
      this.simulationPositionUnsubscribe();
      this.simulationPositionUnsubscribe = null;
    }
    this.stopSimulationDisplayUpdates();

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

    // Skip WiFi screen updates when WebSocket clients are connected
    // The "select track" screen takes priority
    if (this.webSocketClientCount > 0) {
      logger.info(
        `Skipping WiFi screen update (${this.webSocketClientCount} WebSocket clients connected, showing select track screen)`,
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
            logger.info(
              "Retrying connected screen display (previous attempt may have failed)",
            );
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

    const config = this.wifiService.getHotspotConfig();

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
          content: "Please create or activate the following",
          fontSize: 26,
          fontWeight: "normal",
          alignment: "center",
          marginBottom: 15,
        },
        {
          content: "hotspot on your mobile phone",
          fontSize: 26,
          fontWeight: "normal",
          alignment: "center",
          marginBottom: 30,
        },
        {
          content: `Network Name: ${config.ssid}`,
          fontSize: 26,
          fontWeight: "bold",
          alignment: "center",
          marginBottom: 15,
        },
        {
          content: `Password: ${config.password}`,
          fontSize: 26,
          fontWeight: "bold",
          alignment: "center",
          marginBottom: 40,
        },
        {
          content: `...Searching for ${config.ssid}...`,
          fontSize: 26,
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
      config,
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
   * @param skipConnectionCheck - If true, skip the hotspot connection check (used when client disconnects)
   */
  private async displayConnectedScreen(
    skipConnectionCheck: boolean = false,
  ): Promise<void> {
    if (!this.textRendererService) {
      return;
    }

    // Verify we're actually connected to the hotspot before showing
    // Skip this check when called from client disconnect (we know we were connected)
    if (!skipConnectionCheck && this.wifiService) {
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

    const width = this.configService.getDisplayWidth();
    const height = this.configService.getDisplayHeight();
    const qrCodeSize = Math.floor(height / 2);

    const template: TextTemplate = {
      version: "1.0",
      title: "Connected",
      layout: {
        backgroundColor: "white",
        textColor: "black",
        padding: { top: 70, right: 20, bottom: 20, left: 20 },
      },
      textBlocks: [
        {
          content: "Scan to open Papertrail:",
          fontSize: 28,
          fontWeight: "bold",
          alignment: "center",
          marginBottom: 320,
        },
        {
          content: `Or type ${deviceUrl} in your browser`,
          fontSize: 24,
          fontWeight: "bold",
          alignment: "center",
          marginBottom: 20,
        },
      ],
      qrCode: {
        content: deviceUrl,
        size: qrCodeSize,
        position: "center",
      },
    };
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
      // Notify WiFi service to stop retry notifications
      if (this.wifiService) {
        this.wifiService.notifyConnectedScreenDisplayed();
      }
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

  /**
   * Calculate progress along a track based on current position
   * Finds the closest point on track and calculates distance traveled
   */
  private calculateTrackProgress(
    track: GPXTrack,
    position: GPSCoordinate,
    totalDistance: number,
  ): { distanceTraveled: number; distanceRemaining: number } {
    if (
      !track.segments.length ||
      !track.segments[0].points.length ||
      totalDistance === 0
    ) {
      return { distanceTraveled: 0, distanceRemaining: 0 };
    }

    const points = track.segments[0].points;

    // Find the closest point on the track
    let closestIndex = 0;
    let closestDistance = Infinity;

    for (let i = 0; i < points.length; i++) {
      const dist = this.haversineDistance(
        position.latitude,
        position.longitude,
        points[i].latitude,
        points[i].longitude,
      );
      if (dist < closestDistance) {
        closestDistance = dist;
        closestIndex = i;
      }
    }

    // Calculate distance traveled (from start to closest point)
    let distanceTraveled = 0;
    for (let i = 0; i < closestIndex; i++) {
      distanceTraveled += this.haversineDistance(
        points[i].latitude,
        points[i].longitude,
        points[i + 1].latitude,
        points[i + 1].longitude,
      );
    }

    const distanceRemaining = totalDistance - distanceTraveled;

    return {
      distanceTraveled,
      distanceRemaining: Math.max(0, distanceRemaining),
    };
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * Returns distance in meters
   */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Get the mock display image (only available when using MockEpaperService)
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
   * Check if mock display image is available
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
   * Check if GPS service is a mock (for development)
   */
  isMockGPS(): boolean {
    return (
      this.gpsService &&
      typeof this.gpsService.isMock === "function" &&
      this.gpsService.isMock()
    );
  }

  /**
   * Set mock GPS position (only works with MockGPSService)
   * Useful for setting position to track start before drive simulation
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
