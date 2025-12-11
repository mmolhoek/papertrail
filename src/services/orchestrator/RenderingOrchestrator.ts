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
  DriveWaypoint,
  DriveNavigationUpdate,
  ScreenType,
  ManeuverType,
  success,
  failure,
  DisplayUpdateMode,
} from "@core/types";
import { OrchestratorError, OrchestratorErrorCode } from "@core/errors";
import { getLogger } from "@utils/logger";
import { TrackTurnAnalyzer, TrackTurn } from "@services/map/TrackTurnAnalyzer";
import { DisplayUpdateQueue, ActiveGPXQueue } from "./DisplayUpdateQueue";
import { OnboardingCoordinator } from "./OnboardingCoordinator";
import { GPSCoordinator } from "./GPSCoordinator";
import { DriveCoordinator } from "./DriveCoordinator";
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
  private displayUpdateCallbacks: Array<(success: boolean) => void> = [];
  private errorCallbacks: Array<(error: Error) => void> = [];

  // GPS coordinator (handles GPS subscriptions, callbacks, and position/status storage)
  private gpsCoordinator: GPSCoordinator | null = null;

  // Onboarding coordinator (handles WiFi/onboarding screen flow)
  private onboardingCoordinator: OnboardingCoordinator | null = null;

  // Drive coordinator (handles drive navigation display and updates)
  private driveCoordinator: DriveCoordinator | null = null;

  // Simulation support
  private simulationPositionUnsubscribe: (() => void) | null = null;
  private simulationDisplayInterval: NodeJS.Timeout | null = null;
  private lastSimulationState: string | null = null;
  private static readonly SIMULATION_DISPLAY_UPDATE_MS = 5000; // Update e-paper every 5s during simulation

  // Display update queuing (prevents dropped updates when display is busy)
  private displayUpdateQueue = new DisplayUpdateQueue();

  // setActiveGPX queuing (ensures only the last selected track is loaded)
  private activeGPXQueue = new ActiveGPXQueue();

  // Track turn analysis for turn-by-turn navigation on GPX tracks
  private trackTurnAnalyzer: TrackTurnAnalyzer = new TrackTurnAnalyzer();
  private cachedTrackTurns: TrackTurn[] = [];
  private cachedTrackPath: string | null = null;

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
  }

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

      // Set drive coordinator as initialized
      if (this.driveCoordinator) {
        this.driveCoordinator.setInitialized(true);
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
        if (this.driveCoordinator?.isDriveNavigating()) {
          logger.info(
            "Simulation stopped but drive navigation still active - showing final drive display",
          );
          void this.driveCoordinator.updateDriveDisplay().catch((error) => {
            logger.error("Failed to show final drive display:", error);
          });
        }
      }
      // Note: "paused" state keeps the interval but updateDisplay won't change position
    });

    // Subscribe to position updates and forward via GPS coordinator
    this.simulationPositionUnsubscribe =
      this.simulationService.onPositionUpdate((position) => {
        const isNav = this.driveCoordinator?.isDriveNavigating() ?? false;
        logger.debug(
          `Sim position: ${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}, isNavigating=${isNav}`,
        );

        // Update position via GPS coordinator (stores position, forwards to drive nav, notifies callbacks)
        if (this.gpsCoordinator) {
          this.gpsCoordinator.updatePosition(position);
        }
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
      if (this.driveCoordinator?.isDriveNavigating()) {
        logger.info("Simulation display update tick (drive mode)");
        void this.driveCoordinator.updateDriveDisplay().catch((error) => {
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
   * Stop current drive navigation
   */
  async stopDriveNavigation(): Promise<Result<void>> {
    if (!this.driveCoordinator) {
      return success(undefined);
    }
    return this.driveCoordinator.stopDriveNavigation();
  }

  /**
   * Check if drive navigation is currently active
   */
  isDriveNavigating(): boolean {
    return this.driveCoordinator?.isDriveNavigating() ?? false;
  }

  /**
   * Register a callback for drive navigation updates
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
      this.driveCoordinator?.isDriveNavigating()
    ) {
      logger.info(
        "Drive simulation active - redirecting to drive display update",
      );
      return this.driveCoordinator.updateDriveDisplay();
    }

    // Queue update if one is already in progress
    const canProceed = await this.displayUpdateQueue.queueUpdate(mode, () =>
      this.epaperService.isBusy(),
    );
    if (!canProceed) {
      return success(undefined);
    }
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

      // Analyze turns from the track (cache for performance)
      const gpxPath = this.configService.getActiveGPXPath();
      if (gpxPath && gpxPath !== this.cachedTrackPath) {
        logger.info("Analyzing track turns...");
        this.cachedTrackTurns = this.trackTurnAnalyzer.analyzeTurns(track);
        this.cachedTrackPath = gpxPath;
        logger.info(`Detected ${this.cachedTrackTurns.length} turns in track`);
      }

      // Find the next upcoming turn based on current progress
      const nextTurn = this.trackTurnAnalyzer.findNextTurn(
        this.cachedTrackTurns,
        distanceTraveled,
      );
      const turnAfterNext = this.trackTurnAnalyzer.findTurnAfterNext(
        this.cachedTrackTurns,
        distanceTraveled,
      );

      // Calculate distance to next turn
      const distanceToNextTurn = nextTurn
        ? nextTurn.distanceFromStart - distanceTraveled
        : distanceRemaining;

      if (nextTurn) {
        logger.info(
          `Next turn: ${nextTurn.maneuverType} in ${(distanceToNextTurn / 1000).toFixed(2)}km - "${nextTurn.instruction}"`,
        );
      } else {
        logger.info("No upcoming turns, continue to destination");
      }

      // Build info for the right panel
      const followTrackInfo: FollowTrackInfo = {
        speed: position.speed ? position.speed * 3.6 : 0, // Convert m/s to km/h
        satellites: satellites,
        bearing: position.bearing,
        progress: progress,
        distanceRemaining: distanceRemaining,
        estimatedTimeRemaining: estimatedTimeRemaining,
        nextTurn: nextTurn
          ? {
              maneuverType: nextTurn.maneuverType,
              distanceToTurn: distanceToNextTurn,
              instruction: nextTurn.instruction,
              bearingAfter: nextTurn.bearingAfter,
            }
          : undefined,
        turnAfterNext: turnAfterNext
          ? {
              maneuverType: turnAfterNext.maneuverType,
              distanceFromPrevious: turnAfterNext.distanceToNextTurn,
              instruction: turnAfterNext.instruction,
            }
          : undefined,
      };

      logger.info(
        `Info panel: speed=${followTrackInfo.speed.toFixed(1)} km/h, satellites=${followTrackInfo.satellites}, bearing=${followTrackInfo.bearing || 0}°`,
      );

      // Check active screen type and render accordingly
      const activeScreen = this.configService.getActiveScreen();
      logger.info(`Active screen type: ${activeScreen}`);

      let bitmapResult;

      // Determine the maneuver to display
      const displayManeuver = nextTurn?.maneuverType ?? ManeuverType.STRAIGHT;
      const displayInstruction = nextTurn?.instruction ?? "Continue";
      const displayDistance = distanceToNextTurn;

      if (activeScreen === ScreenType.TURN_BY_TURN) {
        // Render turn-by-turn screen with real turn info from track analysis
        const nextTurnInfo = turnAfterNext
          ? {
              maneuverType: turnAfterNext.maneuverType,
              distance:
                turnAfterNext.distanceFromStart -
                (nextTurn?.distanceFromStart ?? 0),
              instruction: turnAfterNext.instruction,
              streetName: undefined,
            }
          : undefined;

        bitmapResult = await this.svgService.renderTurnScreen(
          displayManeuver,
          displayDistance,
          displayInstruction,
          track.name || "Track",
          viewport,
          nextTurnInfo,
          progress,
        );
      } else {
        // Default: Render drive-style map screen with 70/30 split
        // Convert GPXTrack to DriveRoute format for renderDriveMapScreen
        const trackGeometry: [number, number][] =
          track.segments[0]?.points.map((p) => [p.latitude, p.longitude]) || [];

        const firstPoint = trackGeometry[0] || [
          position.latitude,
          position.longitude,
        ];
        const lastPoint = trackGeometry[trackGeometry.length - 1] || [
          position.latitude,
          position.longitude,
        ];

        const driveRoute: DriveRoute = {
          id: `track-${Date.now()}`,
          destination: track.name || "Track",
          createdAt: new Date(),
          startPoint: { latitude: firstPoint[0], longitude: firstPoint[1] },
          endPoint: { latitude: lastPoint[0], longitude: lastPoint[1] },
          waypoints: [],
          geometry: trackGeometry,
          totalDistance: distanceRemaining,
          estimatedTime: 0,
        };

        // Create waypoint with real turn info from track analysis
        const nextWaypoint: DriveWaypoint = {
          latitude:
            nextTurn?.latitude ?? trackGeometry[1]?.[0] ?? position.latitude,
          longitude:
            nextTurn?.longitude ?? trackGeometry[1]?.[1] ?? position.longitude,
          instruction: displayInstruction,
          maneuverType: displayManeuver,
          distance: displayDistance,
          bearingAfter: nextTurn?.bearingAfter,
          index: 0,
        };

        const driveInfo: DriveNavigationInfo = {
          speed: followTrackInfo.speed,
          satellites: followTrackInfo.satellites,
          nextManeuver: displayManeuver,
          distanceToTurn: displayDistance,
          instruction: displayInstruction,
          streetName: track.name,
          distanceRemaining: distanceRemaining,
          progress: followTrackInfo.progress || 0,
        };

        bitmapResult = await this.svgService.renderDriveMapScreen(
          driveRoute,
          position,
          nextWaypoint,
          viewport,
          driveInfo,
          renderOptions,
        );
      }

      if (!bitmapResult.success) {
        logger.error("Failed to render screen:", bitmapResult.error);
        this.notifyError(bitmapResult.error);
        return failure(
          OrchestratorError.updateFailed("Screen render", bitmapResult.error),
        );
      }
      logger.info(
        `✓ Screen rendered: ${bitmapResult.data.width}x${bitmapResult.data.height}, ${bitmapResult.data.data.length} bytes`,
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
      // Set up handler and complete update (which will process pending if any)
      this.displayUpdateQueue.setUpdateHandler(async (m) => {
        await this.updateDisplay(m);
      });
      this.displayUpdateQueue.completeUpdate();
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
    if (!this.activeGPXQueue.queueOperation(filePath)) {
      return success(undefined);
    }
    logger.info(`Setting active GPX file: ${filePath}`);

    // Clear turn analysis cache for the new track
    this.cachedTrackTurns = [];
    this.cachedTrackPath = null;

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
   * Clear the active GPX file
   */
  async clearActiveGPX(): Promise<Result<void>> {
    logger.info("Clearing active GPX file");
    this.configService.setActiveGPXPath(null);

    // Clear turn analysis cache
    this.cachedTrackTurns = [];
    this.cachedTrackPath = null;

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

    if (!this.gpsCoordinator) {
      logger.warn("GPS coordinator not available");
      return failure(OrchestratorError.notInitialized());
    }

    return this.gpsCoordinator.getCurrentPosition();
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
    // Notify display update callbacks so mock display refreshes
    this.notifyDisplayUpdate(true);
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
   * Set the active screen type for display rendering
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
   * Register a callback for GPS position updates
   */
  onGPSUpdate(callback: (position: GPSCoordinate) => void): () => void {
    if (!this.gpsCoordinator) {
      logger.warn("GPS coordinator not available for GPS update callback");
      return () => {};
    }
    return this.gpsCoordinator.onGPSUpdate(callback);
  }

  /**
   * Register a callback for GPS status changes
   */
  onGPSStatusChange(callback: (status: GPSStatus) => void): () => void {
    if (!this.gpsCoordinator) {
      logger.warn("GPS coordinator not available for GPS status callback");
      return () => {};
    }
    return this.gpsCoordinator.onGPSStatusChange(callback);
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
    if (!this.onboardingCoordinator) {
      logger.warn(
        "OnboardingCoordinator not available for WiFi state callback",
      );
      return () => {};
    }
    return this.onboardingCoordinator.onWiFiStateChange(callback);
  }

  /**
   * Check if onboarding is needed and show appropriate screen
   * Call this after all services are initialized (including WiFi)
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
   * Restart the onboarding flow (used after factory reset)
   * Displays the logo, then shows WiFi instructions screen
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
   * Set the number of connected WebSocket clients
   * Shows "select track" screen when clients connect, returns to connected screen when all disconnect
   */
  setWebSocketClientCount(count: number): void {
    if (this.onboardingCoordinator) {
      this.onboardingCoordinator.setWebSocketClientCount(count);
    }
  }

  /**
   * Clean up resources and shut down all services
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
