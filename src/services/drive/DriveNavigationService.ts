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
  ManeuverType,
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
  private turnApproachingNotified = false; // Track if we've notified about approaching turn

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

    // Validate route - need either waypoints or geometry
    logger.info(
      `startNavigation: route has ${activeRoute.waypoints?.length ?? 0} waypoints, ${activeRoute.geometry?.length ?? 0} geometry points`,
    );

    // Auto-generate waypoints from geometry if missing
    if (!activeRoute.waypoints || activeRoute.waypoints.length < 2) {
      if (activeRoute.geometry && activeRoute.geometry.length >= 2) {
        logger.info(
          `Auto-generating waypoints from ${activeRoute.geometry.length} geometry points`,
        );
        activeRoute.waypoints = this.generateWaypointsFromGeometry(
          activeRoute.geometry,
          activeRoute.destination,
        );

        // Recalculate totalDistance from geometry to ensure consistency
        activeRoute.totalDistance = this.calculateTotalDistanceFromGeometry(
          activeRoute.geometry,
        );

        // Verify distances match
        const waypointSum = activeRoute.waypoints.reduce(
          (sum, wp) => sum + wp.distance,
          0,
        );
        logger.info(
          `Generated ${activeRoute.waypoints.length} waypoints, ` +
            `totalDistance=${Math.round(activeRoute.totalDistance)}m, ` +
            `waypointSum=${Math.round(waypointSum)}m`,
        );
      } else {
        return failure(
          DriveError.invalidRoute(
            "Route must have at least 2 waypoints or geometry points",
          ),
        );
      }
    }

    logger.info(`Starting navigation to: ${activeRoute.destination}`);

    this.activeRoute = activeRoute;
    this.currentWaypointIndex = 0;
    this.navigationState = NavigationState.NAVIGATING;
    // Always start with MAP_WITH_OVERLAY - the orchestrator will check
    // the activeScreen setting and switch to turn-by-turn if configured
    this.displayMode = DriveDisplayMode.MAP_WITH_OVERLAY;
    this.turnApproachingNotified = false;
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
    return (
      this.navigationState === NavigationState.NAVIGATING ||
      this.navigationState === NavigationState.OFF_ROAD ||
      this.navigationState === NavigationState.ARRIVED
    );
  }

  /**
   * Set simulation mode - when true, off-road detection is skipped
   * since simulation always follows the route exactly
   */
  setSimulationMode(enabled: boolean): void {
    this.isSimulationMode = enabled;
    logger.info(`Simulation mode: ${enabled}`);
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

      // Always use MAP_WITH_OVERLAY - the orchestrator checks the activeScreen
      // setting and switches to turn-by-turn display if that's what the user selected
      this.displayMode = DriveDisplayMode.MAP_WITH_OVERLAY;

      // Notify when approaching a turn (for audio/haptic feedback if implemented)
      if (this.distanceToNextTurn <= DRIVE_THRESHOLDS.TURN_SCREEN_DISTANCE) {
        if (!this.turnApproachingNotified) {
          logger.debug(
            `Approaching turn, ${Math.round(this.distanceToNextTurn)}m to turn`,
          );
          this.notifyNavigationUpdate("turn_approaching");
          this.turnApproachingNotified = true;
        }
      } else {
        // Reset the flag when we're far from the turn again
        this.turnApproachingNotified = false;
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
   * Calculate total distance along a geometry path
   */
  private calculateTotalDistanceFromGeometry(
    geometry: [number, number][],
  ): number {
    let total = 0;
    for (let i = 1; i < geometry.length; i++) {
      total += this.calculateDistance(
        geometry[i - 1][0],
        geometry[i - 1][1],
        geometry[i][0],
        geometry[i][1],
      );
    }
    return total;
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

  /**
   * Generate basic waypoints from geometry when OSRM doesn't provide turn-by-turn data
   * Creates depart/arrive waypoints plus intermediate waypoints for significant turns
   *
   * Uses segment-based bearing comparison: compares bearing of current segment
   * against a reference segment from further back to detect direction changes.
   */
  private generateWaypointsFromGeometry(
    geometry: [number, number][],
    destination?: string,
  ): DriveWaypoint[] {
    const waypoints: DriveWaypoint[] = [];

    if (geometry.length < 2) {
      return waypoints;
    }

    // First point: depart
    waypoints.push({
      latitude: geometry[0][0],
      longitude: geometry[0][1],
      instruction: "Depart",
      maneuverType: ManeuverType.DEPART,
      distance: 0,
      index: 0,
    });

    // Turn detection parameters
    const TURN_THRESHOLD = 25; // degrees - bearing change to trigger waypoint
    const MIN_DISTANCE_BETWEEN_WAYPOINTS = 50; // meters
    const SEGMENT_DISTANCE = 30; // meters - distance for bearing calculation segments

    // Build distance array for quick lookups
    const distances: number[] = [0];
    for (let i = 1; i < geometry.length; i++) {
      const d = this.calculateDistance(
        geometry[i - 1][0],
        geometry[i - 1][1],
        geometry[i][0],
        geometry[i][1],
      );
      distances.push(distances[i - 1] + d);
    }
    const totalDistance = distances[distances.length - 1];

    let lastWaypointDistance = 0;

    // Find index at a given distance from start
    const findIndexAtDistance = (targetDist: number): number => {
      for (let i = 0; i < distances.length; i++) {
        if (distances[i] >= targetDist) return i;
      }
      return distances.length - 1;
    };

    // Calculate bearing between two indices
    const getBearing = (fromIdx: number, toIdx: number): number => {
      if (
        fromIdx === toIdx ||
        fromIdx >= geometry.length ||
        toIdx >= geometry.length
      ) {
        return 0;
      }
      return this.calculateBearing(
        geometry[fromIdx][0],
        geometry[fromIdx][1],
        geometry[toIdx][0],
        geometry[toIdx][1],
      );
    };

    // Scan through the route looking for turns
    for (
      let dist = SEGMENT_DISTANCE * 2;
      dist < totalDistance - SEGMENT_DISTANCE;
      dist += 10
    ) {
      const currentIdx = findIndexAtDistance(dist);
      const behindIdx = findIndexAtDistance(dist - SEGMENT_DISTANCE);
      const aheadIdx = findIndexAtDistance(dist + SEGMENT_DISTANCE);

      // Calculate incoming and outgoing bearings
      const incomingBearing = getBearing(behindIdx, currentIdx);
      const outgoingBearing = getBearing(currentIdx, aheadIdx);

      // Calculate turn angle
      let turnAngle = outgoingBearing - incomingBearing;
      if (turnAngle > 180) turnAngle -= 360;
      if (turnAngle < -180) turnAngle += 360;

      const absTurn = Math.abs(turnAngle);

      // Check if this is a significant turn and far enough from last waypoint
      if (
        absTurn >= TURN_THRESHOLD &&
        dist - lastWaypointDistance >= MIN_DISTANCE_BETWEEN_WAYPOINTS
      ) {
        const turnType = this.getTurnTypeFromChange(turnAngle);
        waypoints.push({
          latitude: geometry[currentIdx][0],
          longitude: geometry[currentIdx][1],
          instruction: this.formatTurnInstruction(turnType),
          maneuverType: turnType,
          distance: dist - lastWaypointDistance,
          index: waypoints.length,
        });

        lastWaypointDistance = dist;
      }
    }

    // Last point: arrive
    waypoints.push({
      latitude: geometry[geometry.length - 1][0],
      longitude: geometry[geometry.length - 1][1],
      instruction: destination ? `Arrive at ${destination}` : "Arrive",
      maneuverType: ManeuverType.ARRIVE,
      distance: totalDistance - lastWaypointDistance,
      index: waypoints.length,
    });

    // Debug: verify waypoint distances sum correctly
    const waypointDistanceSum = waypoints.reduce(
      (sum, wp) => sum + wp.distance,
      0,
    );
    logger.info(
      `Generated ${waypoints.length} waypoints from ${geometry.length} geometry points, ` +
        `waypoint distance sum=${Math.round(waypointDistanceSum)}m, totalDistance=${Math.round(totalDistance)}m`,
    );

    return waypoints;
  }

  /**
   * Determine turn type from signed bearing change
   */
  private getTurnTypeFromChange(bearingChange: number): ManeuverType {
    // bearingChange is positive for right turns, negative for left
    const abs = Math.abs(bearingChange);

    if (abs < 20) return ManeuverType.STRAIGHT;
    if (bearingChange > 0) {
      // Right turns
      if (abs < 50) return ManeuverType.SLIGHT_RIGHT;
      if (abs < 110) return ManeuverType.RIGHT;
      return ManeuverType.SHARP_RIGHT;
    } else {
      // Left turns
      if (abs < 50) return ManeuverType.SLIGHT_LEFT;
      if (abs < 110) return ManeuverType.LEFT;
      return ManeuverType.SHARP_LEFT;
    }
  }

  /**
   * Format turn type into human-readable instruction
   */
  private formatTurnInstruction(turnType: ManeuverType): string {
    const instructions: Record<ManeuverType, string> = {
      [ManeuverType.DEPART]: "Depart",
      [ManeuverType.STRAIGHT]: "Continue straight",
      [ManeuverType.SLIGHT_LEFT]: "Turn slightly left",
      [ManeuverType.LEFT]: "Turn left",
      [ManeuverType.SHARP_LEFT]: "Turn sharp left",
      [ManeuverType.SLIGHT_RIGHT]: "Turn slightly right",
      [ManeuverType.RIGHT]: "Turn right",
      [ManeuverType.SHARP_RIGHT]: "Turn sharp right",
      [ManeuverType.UTURN]: "Make a U-turn",
      [ManeuverType.ARRIVE]: "Arrive",
      [ManeuverType.MERGE]: "Merge",
      [ManeuverType.FORK_LEFT]: "Take left fork",
      [ManeuverType.FORK_RIGHT]: "Take right fork",
      [ManeuverType.RAMP_LEFT]: "Take left ramp",
      [ManeuverType.RAMP_RIGHT]: "Take right ramp",
      [ManeuverType.ROUNDABOUT]: "Enter roundabout",
      [ManeuverType.ROUNDABOUT_EXIT_1]: "Take 1st exit",
      [ManeuverType.ROUNDABOUT_EXIT_2]: "Take 2nd exit",
      [ManeuverType.ROUNDABOUT_EXIT_3]: "Take 3rd exit",
      [ManeuverType.ROUNDABOUT_EXIT_4]: "Take 4th exit",
      [ManeuverType.ROUNDABOUT_EXIT_5]: "Take 5th exit",
      [ManeuverType.ROUNDABOUT_EXIT_6]: "Take 6th exit",
      [ManeuverType.ROUNDABOUT_EXIT_7]: "Take 7th exit",
      [ManeuverType.ROUNDABOUT_EXIT_8]: "Take 8th exit",
    };
    return instructions[turnType] || "Continue";
  }
}
