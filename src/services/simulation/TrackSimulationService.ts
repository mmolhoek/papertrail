import {
  ITrackSimulationService,
  SimulationSpeed,
  SimulationState,
  SimulationStatus,
} from "@core/interfaces";
import {
  Result,
  GPSCoordinate,
  GPXTrack,
  GPXTrackPoint,
  success,
  failure,
} from "@core/types";
import { GPSError, GPSErrorCode } from "@core/errors";
import { getLogger } from "@utils/logger";

const logger = getLogger("TrackSimulationService");

/**
 * Track Simulation Service
 *
 * Simulates GPS movement along a GPX track for testing and demonstration.
 * Interpolates between track points to create smooth movement at specified speeds.
 */
export class TrackSimulationService implements ITrackSimulationService {
  private initialized = false;
  private state: SimulationState = SimulationState.STOPPED;
  private currentTrack: GPXTrack | null = null;
  private currentPointIndex = 0;
  private currentPosition: GPSCoordinate | null = null;
  private speed: number = SimulationSpeed.WALK;
  private speedPreset: "walk" | "bicycle" | "drive" | "custom" = "walk";

  private updateInterval: NodeJS.Timeout | null = null;
  private positionCallbacks: Array<(position: GPSCoordinate) => void> = [];
  private stateCallbacks: Array<(status: SimulationStatus) => void> = [];
  private completeCallbacks: Array<() => void> = [];

  // Distance tracking
  private totalDistance = 0;
  private coveredDistance = 0;
  private segmentDistances: number[] = [];

  // Update interval in ms (for smooth movement)
  private readonly UPDATE_INTERVAL_MS = 500;

  constructor() {
    logger.info("TrackSimulationService created");
  }

  async initialize(): Promise<Result<void>> {
    if (this.initialized) {
      return success(undefined);
    }

    logger.info("Initializing TrackSimulationService...");
    this.initialized = true;
    logger.info("TrackSimulationService initialized");

    return success(undefined);
  }

  async startSimulation(
    track: GPXTrack,
    speed: number = SimulationSpeed.WALK,
  ): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(
        new GPSError(
          "Simulation service not initialized",
          GPSErrorCode.DEVICE_NOT_INITIALIZED,
          false,
        ),
      );
    }

    if (this.state === SimulationState.RUNNING) {
      logger.warn("Simulation already running, stopping first");
      await this.stopSimulation();
    }

    // Validate track
    if (
      !track.segments ||
      track.segments.length === 0 ||
      track.segments[0].points.length < 2
    ) {
      return failure(
        new GPSError(
          "Track must have at least 2 points",
          GPSErrorCode.NO_FIX,
          false,
        ),
      );
    }

    logger.info(
      `Starting simulation on track "${track.name}" at ${speed} km/h`,
    );

    this.currentTrack = track;
    this.speed = speed;
    this.speedPreset = this.getSpeedPreset(speed);
    this.currentPointIndex = 0;
    this.coveredDistance = 0;

    // Calculate distances between all points
    this.calculateSegmentDistances();

    // Set initial position
    const firstPoint = track.segments[0].points[0];
    this.currentPosition = {
      latitude: firstPoint.latitude,
      longitude: firstPoint.longitude,
      altitude: firstPoint.altitude,
      timestamp: new Date(),
      speed: (speed * 1000) / 3600, // Convert km/h to m/s
    };

    this.state = SimulationState.RUNNING;
    this.notifyStateChange();
    this.notifyPositionUpdate(this.currentPosition);

    // Start the update loop
    this.startUpdateLoop();

    return success(undefined);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async startSimulationFromActive(_speed?: number): Promise<Result<void>> {
    // This will be called by the orchestrator which will provide the track
    return failure(
      new GPSError(
        "Use startSimulation with a track instead",
        GPSErrorCode.NOT_TRACKING,
        false,
      ),
    );
  }

  async stopSimulation(): Promise<Result<void>> {
    if (this.state === SimulationState.STOPPED) {
      return success(undefined);
    }

    logger.info("Stopping simulation");

    this.clearUpdateLoop();
    this.state = SimulationState.STOPPED;
    this.currentTrack = null;
    this.currentPosition = null;
    this.currentPointIndex = 0;
    this.coveredDistance = 0;
    this.totalDistance = 0;
    this.segmentDistances = [];

    this.notifyStateChange();

    return success(undefined);
  }

  async pauseSimulation(): Promise<Result<void>> {
    if (this.state !== SimulationState.RUNNING) {
      return failure(
        new GPSError(
          "Simulation not running",
          GPSErrorCode.NOT_TRACKING,
          false,
        ),
      );
    }

    logger.info("Pausing simulation");
    this.clearUpdateLoop();
    this.state = SimulationState.PAUSED;
    this.notifyStateChange();

    return success(undefined);
  }

  async resumeSimulation(): Promise<Result<void>> {
    if (this.state !== SimulationState.PAUSED) {
      return failure(
        new GPSError("Simulation not paused", GPSErrorCode.NOT_TRACKING, false),
      );
    }

    logger.info("Resuming simulation");
    this.state = SimulationState.RUNNING;
    this.startUpdateLoop();
    this.notifyStateChange();

    return success(undefined);
  }

  async setSpeed(speed: number): Promise<Result<void>> {
    if (speed <= 0 || speed > 200) {
      return failure(
        new GPSError(
          "Speed must be between 0 and 200 km/h",
          GPSErrorCode.PARSE_ERROR,
          false,
        ),
      );
    }

    logger.info(`Setting simulation speed to ${speed} km/h`);
    this.speed = speed;
    this.speedPreset = this.getSpeedPreset(speed);
    this.notifyStateChange();

    return success(undefined);
  }

  async setSpeedPreset(
    preset: "walk" | "bicycle" | "drive",
  ): Promise<Result<void>> {
    const speeds: Record<string, number> = {
      walk: SimulationSpeed.WALK,
      bicycle: SimulationSpeed.BICYCLE,
      drive: SimulationSpeed.DRIVE,
    };

    this.speed = speeds[preset];
    this.speedPreset = preset;
    logger.info(`Setting speed preset to ${preset} (${this.speed} km/h)`);
    this.notifyStateChange();

    return success(undefined);
  }

  getStatus(): SimulationStatus {
    const totalPoints = this.currentTrack?.segments[0]?.points.length || 0;
    const progress =
      totalPoints > 1 ? (this.currentPointIndex / (totalPoints - 1)) * 100 : 0;

    const distanceRemaining = this.totalDistance - this.coveredDistance;
    // Time = distance / speed (speed in m/s)
    const speedMs = (this.speed * 1000) / 3600;
    const estimatedTimeRemaining =
      speedMs > 0 ? distanceRemaining / speedMs : 0;

    return {
      state: this.state,
      speed: this.speed,
      speedPreset: this.speedPreset,
      currentPointIndex: this.currentPointIndex,
      totalPoints,
      progress: Math.round(progress * 10) / 10,
      currentPosition: this.currentPosition || undefined,
      trackName: this.currentTrack?.name,
      estimatedTimeRemaining: Math.round(estimatedTimeRemaining),
      distanceRemaining: Math.round(distanceRemaining),
    };
  }

  isSimulating(): boolean {
    return (
      this.state === SimulationState.RUNNING ||
      this.state === SimulationState.PAUSED
    );
  }

  onPositionUpdate(callback: (position: GPSCoordinate) => void): () => void {
    this.positionCallbacks.push(callback);
    return () => {
      const index = this.positionCallbacks.indexOf(callback);
      if (index > -1) {
        this.positionCallbacks.splice(index, 1);
      }
    };
  }

  onStateChange(callback: (status: SimulationStatus) => void): () => void {
    this.stateCallbacks.push(callback);
    return () => {
      const index = this.stateCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateCallbacks.splice(index, 1);
      }
    };
  }

  onSimulationComplete(callback: () => void): () => void {
    this.completeCallbacks.push(callback);
    return () => {
      const index = this.completeCallbacks.indexOf(callback);
      if (index > -1) {
        this.completeCallbacks.splice(index, 1);
      }
    };
  }

  async dispose(): Promise<void> {
    logger.info("Disposing TrackSimulationService...");

    await this.stopSimulation();
    this.positionCallbacks = [];
    this.stateCallbacks = [];
    this.completeCallbacks = [];
    this.initialized = false;

    logger.info("TrackSimulationService disposed");
  }

  // Private methods

  private getSpeedPreset(
    speed: number,
  ): "walk" | "bicycle" | "drive" | "custom" {
    if (speed === SimulationSpeed.WALK) return "walk";
    if (speed === SimulationSpeed.BICYCLE) return "bicycle";
    if (speed === SimulationSpeed.DRIVE) return "drive";
    return "custom";
  }

  private calculateSegmentDistances(): void {
    if (!this.currentTrack) return;

    const points = this.currentTrack.segments[0].points;
    this.segmentDistances = [];
    this.totalDistance = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const distance = this.calculateDistance(points[i], points[i + 1]);
      this.segmentDistances.push(distance);
      this.totalDistance += distance;
    }

    logger.info(
      `Track has ${points.length} points, total distance: ${Math.round(this.totalDistance)}m`,
    );

    // Log some sample segment distances for debugging
    const nonZeroSegments = this.segmentDistances.filter((d) => d > 0).length;
    const avgDistance =
      nonZeroSegments > 0 ? this.totalDistance / nonZeroSegments : 0;
    logger.info(
      `Segment distances: ${nonZeroSegments} non-zero segments, avg ${Math.round(avgDistance)}m per segment`,
    );
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  private calculateDistance(p1: GPXTrackPoint, p2: GPXTrackPoint): number {
    const R = 6371000; // Earth's radius in meters
    const lat1 = (p1.latitude * Math.PI) / 180;
    const lat2 = (p2.latitude * Math.PI) / 180;
    const deltaLat = ((p2.latitude - p1.latitude) * Math.PI) / 180;
    const deltaLon = ((p2.longitude - p1.longitude) * Math.PI) / 180;

    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(deltaLon / 2) *
        Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Calculate bearing between two points
   */
  private calculateBearing(p1: GPXTrackPoint, p2: GPXTrackPoint): number {
    const lat1 = (p1.latitude * Math.PI) / 180;
    const lat2 = (p2.latitude * Math.PI) / 180;
    const deltaLon = ((p2.longitude - p1.longitude) * Math.PI) / 180;

    const y = Math.sin(deltaLon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearing + 360) % 360;
  }

  /**
   * Interpolate position between two points
   */
  private interpolatePosition(
    p1: GPXTrackPoint,
    p2: GPXTrackPoint,
    fraction: number,
  ): GPSCoordinate {
    const lat = p1.latitude + (p2.latitude - p1.latitude) * fraction;
    const lon = p1.longitude + (p2.longitude - p1.longitude) * fraction;
    const alt =
      p1.altitude !== undefined && p2.altitude !== undefined
        ? p1.altitude + (p2.altitude - p1.altitude) * fraction
        : p1.altitude;

    return {
      latitude: lat,
      longitude: lon,
      altitude: alt,
      timestamp: new Date(),
      speed: (this.speed * 1000) / 3600, // m/s
      bearing: this.calculateBearing(p1, p2),
    };
  }

  private startUpdateLoop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      this.updatePosition();
    }, this.UPDATE_INTERVAL_MS);
  }

  private clearUpdateLoop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Progress fraction tracking within current segment
   */
  private segmentFraction = 0;

  private updatePosition(): void {
    if (
      this.state !== SimulationState.RUNNING ||
      !this.currentTrack ||
      !this.currentPosition
    ) {
      logger.debug(
        `updatePosition skipped: state=${this.state}, track=${!!this.currentTrack}, pos=${!!this.currentPosition}`,
      );
      return;
    }

    const points = this.currentTrack.segments[0].points;
    const totalPoints = points.length;

    if (this.currentPointIndex >= totalPoints - 1) {
      // Reached the end
      logger.info("Simulation complete");
      this.clearUpdateLoop();
      this.state = SimulationState.STOPPED;
      this.notifyStateChange();
      this.notifySimulationComplete();
      return;
    }

    // Calculate how far we move in this update interval
    const speedMs = (this.speed * 1000) / 3600; // m/s
    const distanceThisUpdate = speedMs * (this.UPDATE_INTERVAL_MS / 1000);

    // Get current segment
    const currentSegmentDistance =
      this.segmentDistances[this.currentPointIndex] || 0;

    if (currentSegmentDistance === 0) {
      // Skip zero-distance segments (duplicate points)
      logger.debug(
        `Skipping zero-distance segment at index ${this.currentPointIndex}`,
      );
      this.currentPointIndex++;
      this.segmentFraction = 0;
      return;
    }

    // Log progress periodically (every 10th update)
    if (this.currentPointIndex % 10 === 0) {
      logger.info(
        `Simulation progress: point ${this.currentPointIndex}/${totalPoints}, covered ${Math.round(this.coveredDistance)}m/${Math.round(this.totalDistance)}m`,
      );
    }

    // Update segment fraction
    const fractionThisUpdate = distanceThisUpdate / currentSegmentDistance;
    this.segmentFraction += fractionThisUpdate;
    this.coveredDistance += distanceThisUpdate;

    // Check if we've moved past the current segment
    while (
      this.segmentFraction >= 1 &&
      this.currentPointIndex < totalPoints - 1
    ) {
      this.segmentFraction -= 1;
      this.currentPointIndex++;

      // If we've reached the end
      if (this.currentPointIndex >= totalPoints - 1) {
        this.currentPosition = {
          latitude: points[totalPoints - 1].latitude,
          longitude: points[totalPoints - 1].longitude,
          altitude: points[totalPoints - 1].altitude,
          timestamp: new Date(),
          speed: 0,
        };
        this.notifyPositionUpdate(this.currentPosition);

        logger.info("Simulation complete");
        this.clearUpdateLoop();
        this.state = SimulationState.STOPPED;
        this.notifyStateChange();
        this.notifySimulationComplete();
        return;
      }

      // Apply remaining fraction to next segment
      const nextSegmentDistance =
        this.segmentDistances[this.currentPointIndex] || 0;
      if (nextSegmentDistance > 0) {
        const remainingDistance = this.segmentFraction * currentSegmentDistance;
        this.segmentFraction = remainingDistance / nextSegmentDistance;
      }
    }

    // Interpolate position within current segment
    const p1 = points[this.currentPointIndex];
    const p2 = points[this.currentPointIndex + 1];
    this.currentPosition = this.interpolatePosition(
      p1,
      p2,
      Math.min(this.segmentFraction, 1),
    );

    this.notifyPositionUpdate(this.currentPosition);
    // Note: Don't call notifyStateChange() here - state hasn't changed, only position has.
    // State change notifications should only happen when state actually transitions.
  }

  private notifyPositionUpdate(position: GPSCoordinate): void {
    for (const callback of this.positionCallbacks) {
      try {
        callback(position);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Error in position callback: ${errorMsg}`);
      }
    }
  }

  private notifyStateChange(): void {
    const status = this.getStatus();
    for (const callback of this.stateCallbacks) {
      try {
        callback(status);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Error in state callback: ${errorMsg}`);
      }
    }
  }

  private notifySimulationComplete(): void {
    for (const callback of this.completeCallbacks) {
      try {
        callback();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Error in complete callback: ${errorMsg}`);
      }
    }
  }
}
