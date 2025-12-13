import {
  IGPSService,
  IMapService,
  ISVGService,
  IEpaperService,
  IConfigService,
  IDriveNavigationService,
  FollowTrackInfo,
  DriveNavigationInfo,
} from "@core/interfaces";
import {
  GPSCoordinate,
  GPXTrack,
  Result,
  success,
  failure,
  DisplayUpdateMode,
  DriveRoute,
  DriveWaypoint,
  ScreenType,
  ManeuverType,
  Bitmap1Bit,
} from "@core/types";
import { OrchestratorError } from "@core/errors";
import { getLogger } from "@utils/logger";
import { haversineDistance } from "@utils/geo";
import { TrackTurnAnalyzer, TrackTurn } from "@services/map/TrackTurnAnalyzer";
import { DisplayUpdateQueue } from "./DisplayUpdateQueue";
import { SimulationCoordinator } from "./SimulationCoordinator";
import { DriveCoordinator } from "./DriveCoordinator";

const logger = getLogger("TrackDisplayCoordinator");

/**
 * Coordinates track display rendering.
 *
 * Responsibilities:
 * - Loads and processes GPX track data
 * - Gets current position (simulation, GPS, or track start fallback)
 * - Calculates track progress and turn analysis
 * - Renders track display (turn-by-turn or map screen)
 * - Manages display update queuing
 */
export class TrackDisplayCoordinator {
  // Track turn analysis (cached for performance)
  private trackTurnAnalyzer: TrackTurnAnalyzer = new TrackTurnAnalyzer();
  private cachedTrackTurns: TrackTurn[] = [];
  private cachedTrackPath: string | null = null;

  // Display update queuing
  private displayUpdateQueue = new DisplayUpdateQueue();

  // Initialized flag
  private isInitialized: boolean = false;

  // Callback for notifying display updates
  private displayUpdateCallback: ((success: boolean) => void) | null = null;

  // Callback for notifying errors
  private errorCallback: ((error: Error) => void) | null = null;

  constructor(
    private readonly gpsService: IGPSService,
    private readonly mapService: IMapService,
    private readonly svgService: ISVGService,
    private readonly epaperService: IEpaperService,
    private readonly configService: IConfigService,
    private readonly driveNavigationService: IDriveNavigationService | null,
    private simulationCoordinator: SimulationCoordinator | null,
    private driveCoordinator: DriveCoordinator | null,
  ) {}

  /**
   * Set initialized flag
   */
  setInitialized(initialized: boolean): void {
    this.isInitialized = initialized;
  }

  /**
   * Set the simulation coordinator reference
   */
  setSimulationCoordinator(coordinator: SimulationCoordinator | null): void {
    this.simulationCoordinator = coordinator;
  }

  /**
   * Set the drive coordinator reference
   */
  setDriveCoordinator(coordinator: DriveCoordinator | null): void {
    this.driveCoordinator = coordinator;
  }

  /**
   * Set the display update callback
   */
  setDisplayUpdateCallback(callback: (success: boolean) => void): void {
    this.displayUpdateCallback = callback;
  }

  /**
   * Set the error callback
   */
  setErrorCallback(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  /**
   * Update the display with current GPS position and active track
   */
  async updateDisplay(mode?: DisplayUpdateMode): Promise<Result<void>> {
    if (!this.isInitialized) {
      logger.warn("Cannot update display: coordinator not initialized");
      return failure(OrchestratorError.notInitialized());
    }

    // During drive simulation, always use drive display instead of track display
    if (
      this.simulationCoordinator?.isSimulating() &&
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
        // Step 1: Get active GPX path
        logger.info("Step 1/5: Getting active GPX path...");
        const gpxPath = this.configService.getActiveGPXPath();
        if (!gpxPath) {
          logger.warn("No active GPX file configured");
          return failure(OrchestratorError.noActiveGPX());
        }
        logger.info(`✓ Active GPX: ${gpxPath}`);

        // Step 2: Load the track
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

      // Step 3: Get current position
      logger.info("Step 3/5: Getting current position...");
      const positionResult = await this.getCurrentPosition(track);
      if (!positionResult.success) {
        return positionResult;
      }
      const position = positionResult.data;

      // Step 4: Render the display
      logger.info("Step 4/5: Rendering split view to bitmap...");
      const renderResult = await this.renderTrackDisplay(track, position);
      if (!renderResult.success) {
        return renderResult;
      }
      const bitmapResult = renderResult.data;

      // Step 5: Display on e-paper
      logger.info(
        `Step 5/5: Sending bitmap to e-paper display (mode: ${mode || "default"})...`,
      );
      const displayResult = await this.epaperService.displayBitmap(
        bitmapResult,
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
      this.notifyDisplayUpdate(true);

      return success(undefined);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Display update failed with exception: ${errorMsg}`);
      const err = error instanceof Error ? error : new Error("Unknown error");
      this.notifyError(err);
      return failure(OrchestratorError.updateFailed("Display update", err));
    } finally {
      // Set up handler and complete update
      this.displayUpdateQueue.setUpdateHandler(async (m) => {
        await this.updateDisplay(m);
      });
      this.displayUpdateQueue.completeUpdate();
    }
  }

  /**
   * Get the display update queue (for external access if needed)
   */
  getDisplayUpdateQueue(): DisplayUpdateQueue {
    return this.displayUpdateQueue;
  }

  /**
   * Clear the turn analysis cache (call when switching tracks)
   */
  clearTurnCache(): void {
    logger.info("Clearing turn analysis cache");
    this.cachedTrackTurns = [];
    this.cachedTrackPath = null;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    logger.info("Disposing TrackDisplayCoordinator...");
    this.cachedTrackTurns = [];
    this.cachedTrackPath = null;
    logger.info("✓ TrackDisplayCoordinator disposed");
  }

  /**
   * Get current position (simulation > GPS > track start fallback)
   */
  private async getCurrentPosition(
    track: GPXTrack,
  ): Promise<Result<GPSCoordinate>> {
    const simService = this.simulationCoordinator?.getSimulationService();
    if (simService?.isSimulating()) {
      const simStatus = simService.getStatus();
      if (simStatus.currentPosition) {
        logger.info(
          `✓ Simulated position: ${simStatus.currentPosition.latitude.toFixed(6)}, ${simStatus.currentPosition.longitude.toFixed(6)}`,
        );
        return success(simStatus.currentPosition);
      } else {
        logger.warn("Simulation running but no position available");
        return failure(
          OrchestratorError.updateFailed(
            "GPS position",
            new Error("No simulated position available"),
          ),
        );
      }
    }

    // Try real GPS position
    const positionResult = await this.gpsService.getCurrentPosition();
    if (positionResult.success && positionResult.data.latitude !== 0) {
      logger.info(
        `✓ GPS position: ${positionResult.data.latitude.toFixed(6)}, ${positionResult.data.longitude.toFixed(6)}`,
      );
      return success(positionResult.data);
    }

    // Fall back to track's starting point
    const firstPoint = track.segments[0]?.points[0];
    if (firstPoint) {
      const position: GPSCoordinate = {
        latitude: firstPoint.latitude,
        longitude: firstPoint.longitude,
        altitude: firstPoint.altitude,
        timestamp: new Date(),
      };
      logger.info(
        `✓ Using track start position: ${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`,
      );
      return success(position);
    }

    logger.error("No GPS and track has no points");
    return failure(
      OrchestratorError.updateFailed(
        "GPS position",
        new Error("No position available"),
      ),
    );
  }

  /**
   * Render the track display
   */
  private async renderTrackDisplay(
    track: GPXTrack,
    position: GPSCoordinate,
  ): Promise<Result<Bitmap1Bit>> {
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
    const { distanceTraveled, distanceRemaining } = this.calculateTrackProgress(
      track,
      position,
      totalDistance,
    );
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

    // Find the next upcoming turn
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
      speed: position.speed ? position.speed * 3.6 : 0,
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

    const displayManeuver = nextTurn?.maneuverType ?? ManeuverType.STRAIGHT;
    const displayInstruction = nextTurn?.instruction ?? "Continue";
    const displayDistance = distanceToNextTurn;

    let bitmapResult;

    if (activeScreen === ScreenType.TURN_BY_TURN) {
      // Render turn-by-turn screen
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
      // Default: Render drive-style map screen
      bitmapResult = await this.renderMapScreen(
        track,
        position,
        viewport,
        renderOptions,
        followTrackInfo,
        displayManeuver,
        displayInstruction,
        displayDistance,
        distanceRemaining,
        nextTurn,
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

    return success(bitmapResult.data);
  }

  /**
   * Render the map screen
   */
  private async renderMapScreen(
    track: GPXTrack,
    position: GPSCoordinate,
    viewport: {
      width: number;
      height: number;
      centerPoint: GPSCoordinate;
      zoomLevel: number;
    },
    renderOptions: {
      lineWidth?: number;
      showPoints?: boolean;
      rotateWithBearing?: boolean;
    },
    followTrackInfo: FollowTrackInfo,
    displayManeuver: ManeuverType,
    displayInstruction: string,
    displayDistance: number,
    distanceRemaining: number,
    nextTurn: TrackTurn | null,
  ): Promise<Result<Bitmap1Bit>> {
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

    return this.svgService.renderDriveMapScreen(
      driveRoute,
      position,
      nextWaypoint,
      viewport,
      driveInfo,
      renderOptions,
    );
  }

  /**
   * Calculate track progress
   */
  private calculateTrackProgress(
    track: GPXTrack,
    position: GPSCoordinate,
    totalDistance: number,
  ): { distanceTraveled: number; distanceRemaining: number } {
    if (totalDistance <= 0 || !track.segments.length) {
      return { distanceTraveled: 0, distanceRemaining: 0 };
    }

    // Find closest point on track
    let minDistance = Infinity;
    let closestSegmentIndex = 0;
    let closestPointIndex = 0;

    track.segments.forEach((segment, segIdx) => {
      segment.points.forEach((point, ptIdx) => {
        const dist = haversineDistance(
          position.latitude,
          position.longitude,
          point.latitude,
          point.longitude,
        );
        if (dist < minDistance) {
          minDistance = dist;
          closestSegmentIndex = segIdx;
          closestPointIndex = ptIdx;
        }
      });
    });

    // Calculate distance traveled
    let distanceTraveled = 0;
    for (let s = 0; s <= closestSegmentIndex; s++) {
      const segment = track.segments[s];
      const endPoint =
        s === closestSegmentIndex
          ? closestPointIndex
          : segment.points.length - 1;

      for (let p = 0; p < endPoint; p++) {
        const p1 = segment.points[p];
        const p2 = segment.points[p + 1];
        distanceTraveled += haversineDistance(
          p1.latitude,
          p1.longitude,
          p2.latitude,
          p2.longitude,
        );
      }
    }

    const distanceRemaining = Math.max(0, totalDistance - distanceTraveled);
    return { distanceTraveled, distanceRemaining };
  }

  /**
   * Notify display update callback
   */
  private notifyDisplayUpdate(success: boolean): void {
    if (this.displayUpdateCallback) {
      this.displayUpdateCallback(success);
    }
  }

  /**
   * Notify error callback
   */
  private notifyError(error: Error): void {
    if (this.errorCallback) {
      this.errorCallback(error);
    }
  }
}
