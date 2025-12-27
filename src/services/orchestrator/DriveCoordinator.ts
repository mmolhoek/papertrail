import {
  IDriveNavigationService,
  ISVGService,
  IConfigService,
  ITrackSimulationService,
  ISpeedLimitService,
  IPOIService,
  IReverseGeocodingService,
  IVectorMapService,
  IRoadSurfaceService,
  RoadSurfaceType,
  DriveNavigationInfo,
  NearbyPOI,
  CachedRoad,
  CachedWater,
  CachedLanduse,
  IDisplayService,
} from "@core/interfaces";
import {
  GPSCoordinate,
  Result,
  success,
  failure,
  DriveRoute,
  DriveNavigationUpdate,
  DriveDisplayMode,
  NavigationState,
  ManeuverType,
  ScreenType,
} from "@core/types";
import { OrchestratorError, OrchestratorErrorCode } from "@core/errors";
import { getLogger } from "@utils/logger";
import { DriveDisplayUpdateQueue } from "./DisplayUpdateQueue";
import { GPSCoordinator } from "./GPSCoordinator";
import { OnboardingCoordinator } from "./OnboardingCoordinator";

const logger = getLogger("DriveCoordinator");

/**
 * Coordinates drive navigation display and updates.
 *
 * Responsibilities:
 * - Manages drive navigation subscriptions
 * - Handles callback registration for navigation updates
 * - Renders drive navigation displays (turn screen, map, off-road, arrival)
 * - Queues display updates to prevent concurrent renders
 * - Stores route start position for fallback
 */
export class DriveCoordinator {
  // Drive navigation subscription management
  private driveNavigationUnsubscribe: (() => void) | null = null;
  private driveDisplayUnsubscribe: (() => void) | null = null;

  // Drive navigation callbacks
  private driveNavigationCallbacks: Array<
    (update: DriveNavigationUpdate) => void
  > = [];

  // Route start position (stored at navigation start for fallback)
  private driveRouteStartPosition: GPSCoordinate | null = null;

  // Display update queuing (prevents concurrent renders)
  private driveDisplayUpdateQueue = new DriveDisplayUpdateQueue();

  // Callback for notifying display updates
  private displayUpdateCallback: ((success: boolean) => void) | null = null;

  // Initialized flag
  private isInitialized: boolean = false;

  // Cached speed limit data
  private cachedSpeedLimit: number | null = null;
  private lastSpeedLimitPosition: { lat: number; lon: number } | null = null;

  // Cached nearby POIs
  private cachedNearbyPOIs: NearbyPOI[] = [];
  private lastPOIPosition: { lat: number; lon: number } | null = null;

  // Cached location name
  private cachedLocationName: string | null = null;
  private lastLocationNamePosition: { lat: number; lon: number } | null = null;

  // Background fetch tracking (POI or speed limit prefetch in progress)
  private poiPrefetchActive: boolean = false;
  private speedLimitPrefetchActive: boolean = false;
  private locationPrefetchActive: boolean = false;
  private elevationPrefetchActive: boolean = false;
  private roadPrefetchActive: boolean = false;
  private roadSurfacePrefetchActive: boolean = false;

  // Cached road surface data
  private cachedRoadSurface: RoadSurfaceType | null = null;
  private lastRoadSurfacePosition: { lat: number; lon: number } | null = null;

  // Cached map features for rendering
  private cachedRoads: CachedRoad[] = [];
  private cachedWater: CachedWater[] = [];
  private cachedLanduse: CachedLanduse[] = [];

  constructor(
    private readonly driveNavigationService: IDriveNavigationService | null,
    private readonly svgService: ISVGService,
    private readonly displayService: IDisplayService,
    private readonly configService: IConfigService,
    private readonly simulationService: ITrackSimulationService | null,
    private readonly speedLimitService: ISpeedLimitService | null,
    private readonly poiService: IPOIService | null,
    private readonly reverseGeocodingService: IReverseGeocodingService | null,
    private readonly vectorMapService: IVectorMapService | null,
    private readonly roadSurfaceService: IRoadSurfaceService | null,
    private gpsCoordinator: GPSCoordinator | null,
    private onboardingCoordinator: OnboardingCoordinator | null,
  ) {}

  /**
   * Set initialized flag (should be called after orchestrator initialization)
   */
  setInitialized(initialized: boolean): void {
    this.isInitialized = initialized;
  }

  /**
   * Set the GPS coordinator reference
   */
  setGPSCoordinator(coordinator: GPSCoordinator | null): void {
    this.gpsCoordinator = coordinator;
  }

  /**
   * Set the onboarding coordinator reference
   */
  setOnboardingCoordinator(coordinator: OnboardingCoordinator | null): void {
    this.onboardingCoordinator = coordinator;
  }

  /**
   * Set the callback for display update notifications
   */
  setDisplayUpdateCallback(callback: (success: boolean) => void): void {
    this.displayUpdateCallback = callback;
  }

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

    // Set zoom level to 18 for close-up navigation view
    this.configService.setZoomLevel(18);
    await this.configService.save();
    logger.info("Set zoom level to 18 for drive navigation");

    // Stop GPS info refresh - we don't want select track screen during navigation
    if (this.onboardingCoordinator) {
      this.onboardingCoordinator.stopGPSInfoRefresh();
    }

    // Mark onboarding as complete - drive navigation is a valid app usage
    // This prevents the WiFi screen from showing during navigation
    if (!this.configService.isOnboardingCompleted()) {
      logger.info("Drive navigation started - marking onboarding as complete");
      this.configService.setOnboardingCompleted(true);
      await this.configService.save();
    }

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

    // Unsubscribe from navigation updates
    if (this.driveNavigationUnsubscribe) {
      this.driveNavigationUnsubscribe();
      this.driveNavigationUnsubscribe = null;
    }

    if (this.driveDisplayUnsubscribe) {
      this.driveDisplayUnsubscribe();
      this.driveDisplayUnsubscribe = null;
    }

    return this.driveNavigationService.stopNavigation();
  }

  /**
   * Check if drive navigation is currently active
   */
  isDriveNavigating(): boolean {
    const hasService = !!this.driveNavigationService;
    const isNav = this.driveNavigationService?.isNavigating() ?? false;
    logger.info(
      `isDriveNavigating: hasService=${hasService}, isNavigating=${isNav}`,
    );
    return isNav;
  }

  /**
   * Register a callback for drive navigation updates
   */
  onDriveNavigationUpdate(
    callback: (update: DriveNavigationUpdate) => void,
  ): () => void {
    this.driveNavigationCallbacks.push(callback);
    logger.info(
      `Drive navigation callback registered (total: ${this.driveNavigationCallbacks.length})`,
    );

    return () => {
      const index = this.driveNavigationCallbacks.indexOf(callback);
      if (index > -1) {
        this.driveNavigationCallbacks.splice(index, 1);
        logger.info(
          `Drive navigation callback unregistered (total: ${this.driveNavigationCallbacks.length})`,
        );
      }
    };
  }

  /**
   * Update the display for drive navigation
   * Can be called externally (e.g., from simulation display update)
   */
  async updateDriveDisplay(
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

    // Queue update if one is already in progress (prevents concurrent renders)
    if (
      !this.driveDisplayUpdateQueue.queueUpdate(() =>
        this.displayService.isBusy(),
      )
    ) {
      return success(undefined);
    }

    logger.info(
      `Updating drive display: mode=${status.displayMode}, state=${status.state}`,
    );

    const width = this.configService.getDisplayWidth();
    const height = this.configService.getDisplayHeight();
    const zoomLevel = this.configService.getZoomLevel();

    // Use current position, or fall back to stored route start (not 0,0)
    let centerPoint = this.gpsCoordinator?.getLastPosition() ?? null;
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

      // Check active screen type - if TURN_BY_TURN, force turn screen mode
      const activeScreen = this.configService.getActiveScreen();
      const effectiveDisplayMode =
        activeScreen === ScreenType.TURN_BY_TURN &&
        status.displayMode === DriveDisplayMode.MAP_WITH_OVERLAY
          ? DriveDisplayMode.TURN_SCREEN
          : status.displayMode;

      logger.info(
        `Drive display: activeScreen=${activeScreen}, original mode=${status.displayMode}, effective mode=${effectiveDisplayMode}`,
      );

      switch (effectiveDisplayMode) {
        case DriveDisplayMode.TURN_SCREEN:
          if (status.nextTurn) {
            logger.info("Starting turn screen render...");

            // Check if there's a turn after the next one
            let nextNextTurn:
              | {
                  maneuverType: ManeuverType;
                  distance: number;
                  instruction: string;
                  streetName?: string;
                }
              | undefined;

            if (
              status.route &&
              status.currentWaypointIndex + 1 < status.route.waypoints.length
            ) {
              const nextWaypoint =
                status.route.waypoints[status.currentWaypointIndex + 1];
              // Only show next-next turn if it's not an arrival
              if (nextWaypoint.maneuverType !== ManeuverType.ARRIVE) {
                nextNextTurn = {
                  maneuverType: nextWaypoint.maneuverType,
                  distance: nextWaypoint.distance,
                  instruction: nextWaypoint.instruction,
                  streetName: nextWaypoint.streetName,
                };
                logger.info(
                  `Including next-next turn: ${nextNextTurn.maneuverType}, ${nextNextTurn.distance}m`,
                );
              }
            }

            renderResult = await this.svgService.renderTurnScreen(
              status.nextTurn.maneuverType,
              status.distanceToNextTurn,
              status.nextTurn.instruction,
              status.nextTurn.streetName,
              viewport,
              nextNextTurn,
              status.progress,
            );
            logger.info(
              `Turn screen render completed in ${Date.now() - renderStartTime}ms`,
            );
          }
          break;

        case DriveDisplayMode.MAP_WITH_OVERLAY: {
          const lastPosition = this.gpsCoordinator?.getLastPosition();
          const lastStatus = this.gpsCoordinator?.getLastStatus();
          if (status.route && status.nextTurn && lastPosition) {
            // Get current speed limit (async but cached)
            const speedLimit = await this.getCurrentSpeedLimit(lastPosition);

            // Calculate distance from route start for POI filtering
            const distanceFromStart =
              status.route.totalDistance - status.distanceRemaining;

            // Get nearby POIs with route context for smart filtering
            // This ensures we only show POIs that are actually on the route
            const nearbyPOIs = await this.getCurrentNearbyPOIs(lastPosition, {
              geometry: status.route.geometry,
              distanceFromStart,
            });

            // Get current location name (async but cached)
            const locationName =
              await this.getCurrentLocationName(lastPosition);

            // Get current road surface (async but cached)
            const roadSurface = await this.getCurrentRoadSurface(lastPosition);

            // Push speed limit to simulation service to adjust simulation speed
            if (this.simulationService?.isSimulating()) {
              this.simulationService.setCurrentSpeedLimit(speedLimit);
            }

            logger.info(
              `Drive info: waypoint=${status.currentWaypointIndex}, streetName=${status.nextTurn.streetName || "NONE"}, instruction=${status.nextTurn.instruction}`,
            );

            const info: DriveNavigationInfo = {
              speed: lastPosition.speed ? lastPosition.speed * 3.6 : 0,
              satellites: lastStatus?.satellitesInUse ?? 0,
              zoomLevel: zoomLevel,
              nextManeuver: status.nextTurn.maneuverType,
              distanceToTurn: status.distanceToNextTurn,
              instruction: status.nextTurn.instruction,
              streetName: status.nextTurn.streetName,
              distanceRemaining: status.distanceRemaining,
              progress: status.progress,
              timeRemaining: status.timeRemaining,
              speedLimit: speedLimit,
              speedUnit: this.configService.getSpeedUnit(),
              routingProfile: this.configService.getRoutingProfile(),
              locationName: locationName,
              nearbyPOIs: nearbyPOIs.map((poi) => ({
                codeLetter: poi.codeLetter,
                name: poi.name,
                latitude: poi.latitude,
                longitude: poi.longitude,
                distance: poi.distance,
                bearing: poi.bearing,
              })),
              isBackgroundFetching: this.isBackgroundFetchActive(),
              roadSurface: roadSurface ?? undefined,
            };

            const renderOptions = {
              ...this.configService.getRenderOptions(),
              rotateWithBearing: this.configService.getRotateWithBearing(),
            };

            // Get map features from vectorMapService cache if available
            const roads = this.getCurrentRoads();
            const water = this.getCurrentWater();
            const landuse = this.getCurrentLanduse();

            logger.info(
              `Starting map screen render (${status.route.geometry?.length ?? 0} geometry points, ${roads.length} roads, ${water.length} water, ${landuse.length} landuse, rotateWithBearing=${renderOptions.rotateWithBearing})...`,
            );
            renderResult = await this.svgService.renderDriveMapScreen(
              status.route,
              lastPosition,
              status.nextTurn,
              viewport,
              info,
              renderOptions,
              roads,
              water,
              landuse,
            );
            logger.info(
              `Map screen render completed in ${Date.now() - renderStartTime}ms`,
            );
          }
          break;
        }

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
        await this.displayService.displayBitmap(renderResult.data);
        logger.info("Drive display updated successfully");
        // Notify display update callback
        if (this.displayUpdateCallback) {
          this.displayUpdateCallback(true);
        }
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
      // Set up handler and complete update (which will process pending if any)
      this.driveDisplayUpdateQueue.setUpdateHandler(async () => {
        await this.updateDriveDisplay();
      });
      this.driveDisplayUpdateQueue.completeUpdate();
    }
  }

  /**
   * Get the active route from the drive navigation service
   */
  getActiveRoute(): DriveRoute | null {
    return this.driveNavigationService?.getActiveRoute() ?? null;
  }

  /**
   * Get the number of registered navigation callbacks
   */
  getCallbackCount(): number {
    return this.driveNavigationCallbacks.length;
  }

  /**
   * Get the cached road surface type
   */
  getCachedRoadSurface(): RoadSurfaceType | null {
    return this.cachedRoadSurface;
  }

  /**
   * Get the cached speed limit
   */
  getCachedSpeedLimit(): number | null {
    return this.cachedSpeedLimit;
  }

  /**
   * Get the cached location name
   */
  getCachedLocationName(): string | null {
    return this.cachedLocationName;
  }

  /**
   * Invalidate the local POI cache.
   *
   * Call this when POI categories change to force a fresh fetch
   * on the next display update.
   */
  invalidatePOICache(): void {
    logger.info("Invalidating local POI cache");
    this.cachedNearbyPOIs = [];
    this.lastPOIPosition = null;
  }

  /**
   * Set POI prefetch active state.
   */
  setPOIPrefetchActive(active: boolean): void {
    this.poiPrefetchActive = active;
    logger.debug(`POI prefetch active: ${active}`);
  }

  /**
   * Set speed limit prefetch active state.
   */
  setSpeedLimitPrefetchActive(active: boolean): void {
    this.speedLimitPrefetchActive = active;
    logger.debug(`Speed limit prefetch active: ${active}`);
  }

  /**
   * Set location prefetch active state.
   */
  setLocationPrefetchActive(active: boolean): void {
    this.locationPrefetchActive = active;
    logger.debug(`Location prefetch active: ${active}`);
  }

  /**
   * Set elevation prefetch active state.
   */
  setElevationPrefetchActive(active: boolean): void {
    this.elevationPrefetchActive = active;
    logger.debug(`Elevation prefetch active: ${active}`);
  }

  /**
   * Check if any background fetch is active (POI, speed limit, location, elevation, roads, or road surfaces).
   */
  isBackgroundFetchActive(): boolean {
    return (
      this.poiPrefetchActive ||
      this.speedLimitPrefetchActive ||
      this.locationPrefetchActive ||
      this.elevationPrefetchActive ||
      this.roadPrefetchActive ||
      this.roadSurfacePrefetchActive
    );
  }

  /**
   * Set road prefetch active state.
   */
  setRoadPrefetchActive(active: boolean): void {
    this.roadPrefetchActive = active;
    logger.debug(`Road prefetch active: ${active}`);
  }

  /**
   * Set road surface prefetch active state.
   */
  setRoadSurfacePrefetchActive(active: boolean): void {
    this.roadSurfacePrefetchActive = active;
    logger.debug(`Road surface prefetch active: ${active}`);
  }

  /**
   * Set cached roads from VectorMapService prefetch.
   */
  setCachedRoads(roads: CachedRoad[]): void {
    this.cachedRoads = roads;
    logger.info(`Cached ${roads.length} roads for rendering`);
  }

  /**
   * Get cached roads for rendering.
   */
  getCachedRoads(): CachedRoad[] {
    return this.cachedRoads;
  }

  /**
   * Set cached water features from VectorMapService prefetch.
   */
  setCachedWater(water: CachedWater[]): void {
    this.cachedWater = water;
    logger.info(`Cached ${water.length} water features for rendering`);
  }

  /**
   * Get cached water features for rendering.
   */
  getCachedWater(): CachedWater[] {
    return this.cachedWater;
  }

  /**
   * Set cached landuse features from VectorMapService prefetch.
   */
  setCachedLanduse(landuse: CachedLanduse[]): void {
    this.cachedLanduse = landuse;
    logger.info(`Cached ${landuse.length} landuse features for rendering`);
  }

  /**
   * Get cached landuse features for rendering.
   */
  getCachedLanduse(): CachedLanduse[] {
    return this.cachedLanduse;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    logger.info("Disposing DriveCoordinator...");

    // Unsubscribe from navigation updates
    if (this.driveNavigationUnsubscribe) {
      this.driveNavigationUnsubscribe();
      this.driveNavigationUnsubscribe = null;
    }

    if (this.driveDisplayUnsubscribe) {
      this.driveDisplayUnsubscribe();
      this.driveDisplayUnsubscribe = null;
    }

    // Clear callbacks
    logger.info(
      `Clearing ${this.driveNavigationCallbacks.length} drive navigation callbacks`,
    );
    this.driveNavigationCallbacks = [];

    // Clear stored data
    this.driveRouteStartPosition = null;
    this.cachedSpeedLimit = null;
    this.lastSpeedLimitPosition = null;
    this.cachedNearbyPOIs = [];
    this.lastPOIPosition = null;
    this.cachedLocationName = null;
    this.lastLocationNamePosition = null;
    this.cachedRoadSurface = null;
    this.lastRoadSurfacePosition = null;
    this.cachedRoads = [];
    this.cachedWater = [];
    this.cachedLanduse = [];

    logger.info("✓ DriveCoordinator disposed");
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
        // Skip display updates when simulation is running
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
   * Get current speed limit for position (uses cache to avoid excessive lookups)
   */
  private async getCurrentSpeedLimit(
    position: GPSCoordinate,
  ): Promise<number | null> {
    // Check if speed limit display is enabled
    if (!this.configService.getShowSpeedLimit()) {
      return null;
    }

    if (!this.speedLimitService) {
      return null;
    }

    // Check if we should update the cache (moved significantly)
    const shouldUpdate =
      !this.lastSpeedLimitPosition ||
      Math.abs(position.latitude - this.lastSpeedLimitPosition.lat) > 0.0005 || // ~50m
      Math.abs(position.longitude - this.lastSpeedLimitPosition.lon) > 0.0005;

    if (shouldUpdate) {
      try {
        const result = await this.speedLimitService.getSpeedLimit(position);
        if (result.success && result.data) {
          this.cachedSpeedLimit = result.data.speedLimit;
          logger.debug(
            `Speed limit updated: ${this.cachedSpeedLimit} km/h (${result.data.roadName || "unknown road"})`,
          );
        } else {
          // Keep previous value if no new data found
          logger.debug("No speed limit data found for position");
        }
        this.lastSpeedLimitPosition = {
          lat: position.latitude,
          lon: position.longitude,
        };
      } catch (error) {
        logger.warn("Failed to fetch speed limit:", error);
      }
    }

    return this.cachedSpeedLimit;
  }

  /**
   * Get nearby POIs for position (uses cache to avoid excessive lookups)
   *
   * When route context is provided, POIs are filtered to only show those
   * that are actually on/near the route (within 200m perpendicular distance)
   * and sorted by distance along route rather than crow-fly distance.
   */
  private async getCurrentNearbyPOIs(
    position: GPSCoordinate,
    routeContext?: {
      geometry: [number, number][];
      distanceFromStart: number;
    },
  ): Promise<NearbyPOI[]> {
    // Only show POIs at zoom level 15+ during navigation
    const zoomLevel = this.configService.getZoomLevel();
    if (zoomLevel < 15) {
      return [];
    }

    // Check if POI display is enabled
    const enabledCategories = this.configService.getEnabledPOICategories();
    if (enabledCategories.length === 0) {
      return [];
    }

    if (!this.poiService) {
      return [];
    }

    // Check if we should update the cache (moved significantly)
    const shouldUpdate =
      !this.lastPOIPosition ||
      Math.abs(position.latitude - this.lastPOIPosition.lat) > 0.001 || // ~100m
      Math.abs(position.longitude - this.lastPOIPosition.lon) > 0.001;

    if (shouldUpdate) {
      try {
        // Build route context for route-aware POI filtering
        // Use 100m threshold - POIs should be directly accessible from route
        const poiRouteContext = routeContext
          ? {
              geometry: routeContext.geometry,
              maxDistanceToRoute: 100, // Only show POIs within 100m of route line
              distanceFromStart: routeContext.distanceFromStart,
            }
          : undefined;

        if (poiRouteContext) {
          logger.info(
            `POI query with route context: ${poiRouteContext.geometry.length} geometry points, ${Math.round(poiRouteContext.distanceFromStart)}m from start`,
          );
        }

        const result = await this.poiService.getNearbyPOIs(
          position,
          enabledCategories,
          5000, // 5km max distance
          5, // Max 5 POIs
          poiRouteContext,
        );
        if (result.success) {
          this.cachedNearbyPOIs = result.data;
          if (this.cachedNearbyPOIs.length > 0) {
            logger.debug(
              `Found ${this.cachedNearbyPOIs.length} nearby POIs: ${this.cachedNearbyPOIs.map((p) => `${p.codeLetter}:${p.name || "unnamed"}${p.distanceAlongRoute !== undefined ? ` (${Math.round(p.distanceAlongRoute)}m along route)` : ""}`).join(", ")}`,
            );
          }
        } else {
          // Keep previous value if no new data found
          logger.debug("No POI data found for position");
        }
        this.lastPOIPosition = {
          lat: position.latitude,
          lon: position.longitude,
        };
      } catch (error) {
        logger.warn("Failed to fetch nearby POIs:", error);
      }
    }

    return this.cachedNearbyPOIs;
  }

  /**
   * Get current roads for rendering (from cached data)
   */
  private getCurrentRoads(): CachedRoad[] {
    // Check if road layer display is enabled
    if (!this.configService.getShowRoads()) {
      return [];
    }

    // First check locally cached roads
    if (this.cachedRoads.length > 0) {
      return this.cachedRoads;
    }

    // Fall back to vectorMapService's cache if available
    if (this.vectorMapService) {
      return this.vectorMapService.getAllCachedRoads();
    }

    return [];
  }

  /**
   * Get current water features for rendering (from cached data)
   * Filters based on showWater (lakes/ponds) and showWaterways (rivers/streams) settings
   */
  private getCurrentWater(): CachedWater[] {
    const showWaterBodies = this.configService.getShowWater();
    const showWaterways = this.configService.getShowWaterways();

    // If neither is enabled, return empty
    if (!showWaterBodies && !showWaterways) {
      return [];
    }

    // Get all water features
    let water: CachedWater[];
    if (this.cachedWater.length > 0) {
      water = this.cachedWater;
    } else if (this.vectorMapService) {
      water = this.vectorMapService.getAllCachedWater();
    } else {
      return [];
    }

    // If both are enabled, return all
    if (showWaterBodies && showWaterways) {
      return water;
    }

    // Filter based on settings:
    // - isArea=true: water bodies (lakes, ponds, reservoirs) - controlled by showWater
    // - isArea=false: waterways (rivers, streams, canals) - controlled by showWaterways
    return water.filter((w) => {
      if (w.isArea) {
        return showWaterBodies;
      } else {
        return showWaterways;
      }
    });
  }

  /**
   * Get current landuse features for rendering (from cached data)
   */
  private getCurrentLanduse(): CachedLanduse[] {
    // Check if landuse display is enabled
    if (!this.configService.getShowLanduse()) {
      return [];
    }

    // First check locally cached landuse
    if (this.cachedLanduse.length > 0) {
      return this.cachedLanduse;
    }

    // Fall back to vectorMapService's cache if available
    if (this.vectorMapService) {
      return this.vectorMapService.getAllCachedLanduse();
    }

    return [];
  }

  /**
   * Get current location name for position (uses cache to avoid excessive lookups)
   */
  private async getCurrentLocationName(
    position: GPSCoordinate,
  ): Promise<string | null> {
    // Check if location name display is enabled
    if (!this.configService.getShowLocationName()) {
      return null;
    }

    if (!this.reverseGeocodingService) {
      return null;
    }

    // Check if we should update the cache (moved significantly)
    // Use a larger threshold (200m) since location names don't change often
    const shouldUpdate =
      !this.lastLocationNamePosition ||
      Math.abs(position.latitude - this.lastLocationNamePosition.lat) > 0.002 ||
      Math.abs(position.longitude - this.lastLocationNamePosition.lon) > 0.002;

    if (shouldUpdate) {
      try {
        const result =
          await this.reverseGeocodingService.getLocationName(position);
        if (result.success && result.data) {
          // Prefer street name only, fall back to full display name if no street
          this.cachedLocationName =
            result.data.street || result.data.displayName;
          logger.debug(`Location name updated: ${this.cachedLocationName}`);
        } else {
          // Keep previous value if no new data found
          logger.debug("No location name found for position");
        }
        this.lastLocationNamePosition = {
          lat: position.latitude,
          lon: position.longitude,
        };
      } catch (error) {
        logger.warn("Failed to fetch location name:", error);
      }
    }

    return this.cachedLocationName;
  }

  /**
   * Get current road surface for position (uses cache to avoid excessive lookups)
   */
  private async getCurrentRoadSurface(
    position: GPSCoordinate,
  ): Promise<RoadSurfaceType | null> {
    // Check if road surface display is enabled
    if (!this.configService.getShowRoadSurface()) {
      return null;
    }

    if (!this.roadSurfaceService) {
      return null;
    }

    // Check if we should update the cache (moved significantly)
    const shouldUpdate =
      !this.lastRoadSurfacePosition ||
      Math.abs(position.latitude - this.lastRoadSurfacePosition.lat) > 0.0005 || // ~50m
      Math.abs(position.longitude - this.lastRoadSurfacePosition.lon) > 0.0005;

    if (shouldUpdate) {
      try {
        const result =
          await this.roadSurfaceService.getCurrentSurface(position);
        if (result.success && result.data) {
          this.cachedRoadSurface = result.data;
          logger.debug(`Road surface updated: ${this.cachedRoadSurface}`);
        } else {
          // Keep previous value if no new data found
          logger.debug("No road surface data found for position");
        }
        this.lastRoadSurfacePosition = {
          lat: position.latitude,
          lon: position.longitude,
        };
      } catch (error) {
        logger.warn("Failed to fetch road surface:", error);
      }
    }

    return this.cachedRoadSurface;
  }
}
