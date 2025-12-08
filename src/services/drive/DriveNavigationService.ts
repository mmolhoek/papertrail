import { IDriveNavigationService } from "@core/interfaces";
import {
  Result,
  GPSCoordinate,
  DriveRoute,
  DriveWaypoint,
  DriveNavigationStatus,
  DriveNavigationUpdate,
  NavigationState,
  DriveDisplayMode,
  DRIVE_THRESHOLDS,
  success,
  failure,
} from "@core/types";
import { DriveError } from "@core/errors";
import { getLogger } from "@utils/logger";
import * as fs from "fs/promises";
import * as path from "path";

const logger = getLogger("DriveNavigationService");

/**
 * Drive Navigation Service Implementation
 *
 * Manages turn-by-turn navigation from current GPS position to a destination.
 * Routes are saved as JSON files in data/routes/ for offline use.
 */
export class DriveNavigationService implements IDriveNavigationService {
  private initialized = false;
  private routesDir: string;

  // Navigation state
  private activeRoute: DriveRoute | null = null;
  private navigationState: NavigationState = NavigationState.IDLE;
  private displayMode: DriveDisplayMode = DriveDisplayMode.MAP_WITH_OVERLAY;
  private currentWaypointIndex = 0;
  private currentPosition: GPSCoordinate | null = null;
  private isSimulationMode = false; // Skip off-road detection in simulation mode
  private useMapViewInSimulation = false; // When true, allow MAP_WITH_OVERLAY during simulation (may cause freezing)

  // Callbacks
  private navigationCallbacks: Array<(update: DriveNavigationUpdate) => void> =
    [];
  private displayCallbacks: Array<() => void> = [];

  // Cached calculations
  private distanceToNextTurn = 0;
  private distanceRemaining = 0;
  private bearingToRoute = 0;
  private distanceToRouteStart = 0;
  private updateCount = 0;

  constructor(routesDir?: string) {
    this.routesDir = routesDir || path.join(process.cwd(), "data", "routes");
    logger.info(
      `DriveNavigationService created, routes dir: ${this.routesDir}`,
    );
  }

  async initialize(): Promise<Result<void>> {
    if (this.initialized) {
      return success(undefined);
    }

    logger.info("Initializing DriveNavigationService...");

    try {
      // Ensure routes directory exists
      await fs.mkdir(this.routesDir, { recursive: true });
      this.initialized = true;
      logger.info("DriveNavigationService initialized");
      return success(undefined);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error("Failed to initialize DriveNavigationService:", err);
      return failure(
        DriveError.saveFailed("Failed to create routes directory", err),
      );
    }
  }

  async saveRoute(route: DriveRoute): Promise<Result<string>> {
    if (!this.initialized) {
      return failure(DriveError.serviceNotInitialized());
    }

    // Validate route
    if (!route.waypoints || route.waypoints.length < 2) {
      return failure(
        DriveError.invalidRoute("Route must have at least 2 waypoints"),
      );
    }

    try {
      const routeFile = path.join(this.routesDir, `${route.id}.json`);
      await fs.writeFile(routeFile, JSON.stringify(route, null, 2));
      logger.info(`Route saved: ${route.id} (${route.destination})`);
      return success(route.id);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error("Failed to save route:", err);
      return failure(DriveError.saveFailed(err.message, err));
    }
  }

  async loadRoute(id: string): Promise<Result<DriveRoute>> {
    if (!this.initialized) {
      return failure(DriveError.serviceNotInitialized());
    }

    try {
      const routeFile = path.join(this.routesDir, `${id}.json`);
      const data = await fs.readFile(routeFile, "utf-8");
      const route = JSON.parse(data) as DriveRoute;
      // Convert date string back to Date object
      route.createdAt = new Date(route.createdAt);
      logger.info(`Route loaded: ${id}`);
      return success(route);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return failure(DriveError.routeNotFound(id));
      }
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error("Failed to load route:", err);
      return failure(DriveError.loadFailed(id, err));
    }
  }

  async deleteRoute(id: string): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DriveError.serviceNotInitialized());
    }

    try {
      const routeFile = path.join(this.routesDir, `${id}.json`);
      await fs.unlink(routeFile);
      logger.info(`Route deleted: ${id}`);
      return success(undefined);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return failure(DriveError.routeNotFound(id));
      }
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error("Failed to delete route:", err);
      return failure(
        new DriveError(
          `Failed to delete route: ${err.message}`,
          undefined,
          true,
        ),
      );
    }
  }

  async listRoutes(): Promise<
    Result<Array<{ id: string; destination: string; createdAt: Date }>>
  > {
    if (!this.initialized) {
      return failure(DriveError.serviceNotInitialized());
    }

    try {
      const files = await fs.readdir(this.routesDir);
      const routes: Array<{
        id: string;
        destination: string;
        createdAt: Date;
      }> = [];

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        try {
          const data = await fs.readFile(
            path.join(this.routesDir, file),
            "utf-8",
          );
          const route = JSON.parse(data);
          routes.push({
            id: route.id,
            destination: route.destination,
            createdAt: new Date(route.createdAt),
          });
        } catch {
          logger.warn(`Failed to parse route file: ${file}`);
        }
      }

      // Sort by creation date, newest first
      routes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return success(routes);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error("Failed to list routes:", err);
      return failure(DriveError.loadFailed("list", err));
    }
  }

  async startNavigation(route: DriveRoute | string): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DriveError.serviceNotInitialized());
    }

    if (this.navigationState === NavigationState.NAVIGATING) {
      return failure(DriveError.navigationAlreadyActive());
    }

    // Load route if ID provided
    let activeRoute: DriveRoute;
    if (typeof route === "string") {
      const loadResult = await this.loadRoute(route);
      if (!loadResult.success) {
        return loadResult;
      }
      activeRoute = loadResult.data;
    } else {
      activeRoute = route;
    }

    // Validate route
    if (!activeRoute.waypoints || activeRoute.waypoints.length < 2) {
      return failure(
        DriveError.invalidRoute("Route must have at least 2 waypoints"),
      );
    }

    logger.info(`Starting navigation to: ${activeRoute.destination}`);

    this.activeRoute = activeRoute;
    this.currentWaypointIndex = 0;
    this.navigationState = NavigationState.NAVIGATING;
    // In simulation mode, use TURN_SCREEN to avoid Sharp text rendering issues
    // (unless user explicitly opted for map view)
    this.displayMode =
      this.isSimulationMode && !this.useMapViewInSimulation
        ? DriveDisplayMode.TURN_SCREEN
        : DriveDisplayMode.MAP_WITH_OVERLAY;
    this.updateCount = 0;

    // Check if we're off-road at start
    if (this.currentPosition) {
      this.checkOffRoad();
    }

    this.notifyNavigationUpdate("status");
    this.notifyDisplayUpdate();

    return success(undefined);
  }

  async stopNavigation(): Promise<Result<void>> {
    if (this.navigationState === NavigationState.IDLE) {
      return success(undefined);
    }

    logger.info("Stopping navigation");

    this.activeRoute = null;
    this.navigationState = NavigationState.CANCELLED;
    this.currentWaypointIndex = 0;
    this.distanceToNextTurn = 0;
    this.distanceRemaining = 0;

    this.notifyNavigationUpdate("status");

    // Reset to idle after notification
    this.navigationState = NavigationState.IDLE;
    this.displayMode = DriveDisplayMode.MAP_WITH_OVERLAY;

    return success(undefined);
  }

  getActiveRoute(): DriveRoute | null {
    return this.activeRoute;
  }

  getNavigationState(): NavigationState {
    return this.navigationState;
  }

  getNavigationStatus(): DriveNavigationStatus {
    const status: DriveNavigationStatus = {
      state: this.navigationState,
      displayMode: this.displayMode,
      currentWaypointIndex: this.currentWaypointIndex,
      distanceToNextTurn: this.distanceToNextTurn,
      distanceRemaining: this.distanceRemaining,
      timeRemaining: this.calculateTimeRemaining(),
      progress: this.calculateProgress(),
    };

    if (this.activeRoute) {
      status.route = this.activeRoute;
      if (this.currentWaypointIndex < this.activeRoute.waypoints.length) {
        status.nextTurn = this.activeRoute.waypoints[this.currentWaypointIndex];
      }
    }

    if (this.navigationState === NavigationState.OFF_ROAD) {
      status.bearingToRoute = this.bearingToRoute;
      status.distanceToRoute = this.distanceToRouteStart;
    }

    return status;
  }

  isNavigating(): boolean {
    // Include ARRIVED state so drive display stays active until user dismisses
    const result =
      this.navigationState === NavigationState.NAVIGATING ||
      this.navigationState === NavigationState.OFF_ROAD ||
      this.navigationState === NavigationState.ARRIVED;
    return result;
  }

  /**
   * Set simulation mode - when true, off-road detection is skipped
   * since simulation always follows the route exactly
   */
  setSimulationMode(enabled: boolean): void {
    this.isSimulationMode = enabled;
    logger.info(`Simulation mode: ${enabled}`);
  }

  /**
   * Set whether to use map view during simulation
   * When true, MAP_WITH_OVERLAY will be used (may cause freezing due to Sharp text rendering)
   * When false, TURN_SCREEN will be used (safer, no freezing)
   */
  setUseMapViewInSimulation(enabled: boolean): void {
    this.useMapViewInSimulation = enabled;
    logger.info(`Use map view in simulation: ${enabled}`);
  }

  updatePosition(position: GPSCoordinate): void {
    // In simulation mode, reject obviously invalid positions (0,0 means no GPS fix)
    // This prevents real GPS (0,0) from overwriting valid simulated positions
    if (this.isSimulationMode) {
      if (
        Math.abs(position.latitude) < 0.001 &&
        Math.abs(position.longitude) < 0.001
      ) {
        logger.warn(
          `Rejecting invalid (0,0) position during simulation: ${position.latitude}, ${position.longitude}`,
        );
        return;
      }
    }

    this.currentPosition = position;

    if (!this.isNavigating() || !this.activeRoute) {
      return;
    }

    // Check if we're off-road
    if (this.checkOffRoad()) {
      // Still notify with updated off-road bearing/distance
      this.notifyNavigationUpdate("status");
      return;
    }

    // Find the current waypoint and calculate distances
    this.updateNavigationState();

    // Always notify with updated status so web interface gets continuous updates
    this.notifyNavigationUpdate("status");
  }

  onNavigationUpdate(
    callback: (update: DriveNavigationUpdate) => void,
  ): () => void {
    this.navigationCallbacks.push(callback);
    return () => {
      const index = this.navigationCallbacks.indexOf(callback);
      if (index > -1) {
        this.navigationCallbacks.splice(index, 1);
      }
    };
  }

  onDisplayUpdate(callback: () => void): () => void {
    this.displayCallbacks.push(callback);
    return () => {
      const index = this.displayCallbacks.indexOf(callback);
      if (index > -1) {
        this.displayCallbacks.splice(index, 1);
      }
    };
  }

  async dispose(): Promise<void> {
    logger.info("Disposing DriveNavigationService...");
    await this.stopNavigation();
    this.navigationCallbacks = [];
    this.displayCallbacks = [];
    this.initialized = false;
    logger.info("DriveNavigationService disposed");
  }

  // Private methods

  /**
   * Check if user is off-road (far from route start)
   * @returns true if off-road
   */
  private checkOffRoad(): boolean {
    // Skip off-road detection in simulation mode - simulation always follows route exactly
    if (this.isSimulationMode) {
      return false;
    }

    if (!this.currentPosition || !this.activeRoute) {
      return false;
    }

    // Check distance to route start
    const routeStart = this.activeRoute.startPoint;
    const distanceToStart = this.calculateDistance(
      this.currentPosition.latitude,
      this.currentPosition.longitude,
      routeStart.latitude,
      routeStart.longitude,
    );

    if (distanceToStart > DRIVE_THRESHOLDS.OFF_ROAD_DISTANCE) {
      // User is off-road
      if (this.navigationState !== NavigationState.OFF_ROAD) {
        logger.info(
          `User is off-road, ${Math.round(distanceToStart)}m from route start`,
        );
        this.navigationState = NavigationState.OFF_ROAD;
        this.displayMode = DriveDisplayMode.OFF_ROAD_ARROW;

        // Calculate bearing to route start
        this.bearingToRoute = this.calculateBearing(
          this.currentPosition.latitude,
          this.currentPosition.longitude,
          routeStart.latitude,
          routeStart.longitude,
        );
        this.distanceToRouteStart = distanceToStart;

        this.notifyNavigationUpdate("off_road");
        this.notifyDisplayUpdate();
      } else {
        // Update bearing and distance
        this.bearingToRoute = this.calculateBearing(
          this.currentPosition.latitude,
          this.currentPosition.longitude,
          routeStart.latitude,
          routeStart.longitude,
        );
        this.distanceToRouteStart = distanceToStart;
      }
      return true;
    }

    // User is back on route
    if (this.navigationState === NavigationState.OFF_ROAD) {
      logger.info("User is back on route");
      this.navigationState = NavigationState.NAVIGATING;
      this.notifyNavigationUpdate("status");
    }

    return false;
  }

  /**
   * Update navigation state based on current position
   */
  private updateNavigationState(): void {
    if (!this.currentPosition || !this.activeRoute) {
      return;
    }

    const waypoints = this.activeRoute.waypoints;
    const prevWaypointIndex = this.currentWaypointIndex;
    const prevDisplayMode = this.displayMode;

    // Check if we've reached the current waypoint
    while (this.currentWaypointIndex < waypoints.length) {
      const waypoint = waypoints[this.currentWaypointIndex];
      const distanceToWaypoint = this.calculateDistance(
        this.currentPosition.latitude,
        this.currentPosition.longitude,
        waypoint.latitude,
        waypoint.longitude,
      );

      if (distanceToWaypoint <= DRIVE_THRESHOLDS.WAYPOINT_REACHED_DISTANCE) {
        // Waypoint reached
        logger.info(
          `Waypoint ${this.currentWaypointIndex} reached: ${waypoint.instruction}`,
        );
        this.notifyNavigationUpdate("waypoint_reached");
        this.currentWaypointIndex++;

        // Check if arrived
        if (this.currentWaypointIndex >= waypoints.length) {
          logger.info(
            `Destination reached! waypointIndex=${this.currentWaypointIndex}, totalWaypoints=${waypoints.length}`,
          );
          this.navigationState = NavigationState.ARRIVED;
          this.displayMode = DriveDisplayMode.ARRIVED;
          this.notifyNavigationUpdate("arrived");
          this.notifyDisplayUpdate();
          return;
        }
      } else {
        break;
      }
    }

    // Calculate distance to next turn
    if (this.currentWaypointIndex < waypoints.length) {
      const nextWaypoint = waypoints[this.currentWaypointIndex];
      this.distanceToNextTurn = this.calculateDistance(
        this.currentPosition.latitude,
        this.currentPosition.longitude,
        nextWaypoint.latitude,
        nextWaypoint.longitude,
      );

      // Update display mode based on distance
      // In simulation mode, prefer TURN_SCREEN to avoid expensive map renders
      // that can cause Sharp to hang
      if (this.distanceToNextTurn <= DRIVE_THRESHOLDS.TURN_SCREEN_DISTANCE) {
        this.displayMode = DriveDisplayMode.TURN_SCREEN;
        if (prevDisplayMode !== DriveDisplayMode.TURN_SCREEN) {
          logger.debug(
            `Switching to turn screen, ${Math.round(this.distanceToNextTurn)}m to turn`,
          );
          this.notifyNavigationUpdate("turn_approaching");
        }
      } else if (this.isSimulationMode && !this.useMapViewInSimulation) {
        // During simulation, use turn screen even for long distances
        // to avoid Sharp text rendering issues (unless user opted for map view)
        this.displayMode = DriveDisplayMode.TURN_SCREEN;
      } else {
        this.displayMode = DriveDisplayMode.MAP_WITH_OVERLAY;
      }
    }

    // Calculate total remaining distance
    this.distanceRemaining = this.calculateRemainingDistance();

    // Notify if waypoint changed or display mode changed
    if (
      this.currentWaypointIndex !== prevWaypointIndex ||
      this.displayMode !== prevDisplayMode
    ) {
      this.notifyDisplayUpdate();
    }
  }

  /**
   * Calculate total remaining distance from current position
   */
  private calculateRemainingDistance(): number {
    if (!this.currentPosition || !this.activeRoute) {
      return 0;
    }

    let remaining = this.distanceToNextTurn;

    // Add distances of remaining waypoints
    for (
      let i = this.currentWaypointIndex + 1;
      i < this.activeRoute.waypoints.length;
      i++
    ) {
      remaining += this.activeRoute.waypoints[i].distance;
    }

    return remaining;
  }

  /**
   * Calculate estimated time remaining in seconds
   */
  private calculateTimeRemaining(): number {
    if (!this.activeRoute || this.distanceRemaining === 0) {
      return 0;
    }

    // Assume average speed of 50 km/h for driving
    const avgSpeedMs = 50 / 3.6; // ~13.9 m/s
    return Math.round(this.distanceRemaining / avgSpeedMs);
  }

  /**
   * Calculate progress percentage (0-100)
   */
  private calculateProgress(): number {
    if (!this.activeRoute || this.activeRoute.totalDistance === 0) {
      return 0;
    }

    const covered = this.activeRoute.totalDistance - this.distanceRemaining;
    return Math.round((covered / this.activeRoute.totalDistance) * 100);
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  private calculateDistance(
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
   * Calculate bearing between two coordinates
   */
  private calculateBearing(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const lat1Rad = (lat1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;

    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x =
      Math.cos(lat1Rad) * Math.sin(lat2Rad) -
      Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearing + 360) % 360;
  }

  /**
   * Notify all navigation update callbacks
   */
  private notifyNavigationUpdate(type: DriveNavigationUpdate["type"]): void {
    this.updateCount++;
    const update: DriveNavigationUpdate = {
      type,
      status: this.getNavigationStatus(),
      timestamp: new Date(),
    };

    // Log every 10th update or on state changes
    if (this.updateCount % 10 === 0 || type !== "status") {
      logger.info(
        `Nav update #${this.updateCount}: type=${type}, state=${update.status.state}, waypoint=${update.status.currentWaypointIndex}, dist=${Math.round(update.status.distanceToNextTurn)}m, callbacks=${this.navigationCallbacks.length}`,
      );
    }

    for (const callback of this.navigationCallbacks) {
      try {
        callback(update);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Error in navigation callback: ${errorMsg}`);
      }
    }
  }

  /**
   * Notify all display update callbacks
   */
  private notifyDisplayUpdate(): void {
    for (const callback of this.displayCallbacks) {
      try {
        callback();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Error in display callback: ${errorMsg}`);
      }
    }
  }
}
