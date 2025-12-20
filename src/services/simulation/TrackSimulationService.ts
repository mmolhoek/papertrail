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
import {
  haversineDistance,
  calculateBearing,
  calculateCurvature,
  calculateCorneringSpeed,
  calculateSpeedForUpcomingCurve,
} from "@utils/geo";

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
  private currentSpeedLimit: number | null = null;

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

  // Curve speed adjustment settings
  private readonly LOOKAHEAD_DISTANCE_M = 200; // Look ahead 200m for curves
  private readonly LATERAL_ACCEL_LIMIT = 2.5; // m/s², comfortable lateral acceleration
  private readonly DECELERATION_RATE = 2.0; // m/s², comfortable braking

  // Current curve-adjusted speed (km/h)
  private curveAdjustedSpeed: number | null = null;

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

    // Set initial position with bearing towards second point
    const firstPoint = track.segments[0].points[0];
    const secondPoint = track.segments[0].points[1];
    this.currentPosition = {
      latitude: firstPoint.latitude,
      longitude: firstPoint.longitude,
      altitude: firstPoint.altitude,
      timestamp: new Date(),
      speed: (speed * 1000) / 3600, // Convert km/h to m/s
      bearing: calculateBearing(
        firstPoint.latitude,
        firstPoint.longitude,
        secondPoint.latitude,
        secondPoint.longitude,
      ),
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
    this.currentSpeedLimit = null;
    this.curveAdjustedSpeed = null;

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

  setCurrentSpeedLimit(limit: number | null): void {
    if (this.currentSpeedLimit !== limit) {
      this.currentSpeedLimit = limit;
      if (limit !== null) {
        logger.info(`Speed limit set to ${limit} km/h`);
      } else {
        logger.info("Speed limit cleared");
      }
    }
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
      const distance = haversineDistance(
        points[i].latitude,
        points[i].longitude,
        points[i + 1].latitude,
        points[i + 1].longitude,
      );
      this.segmentDistances.push(distance);
      this.totalDistance += distance;
    }

    logger.info(
      `Track has ${points.length} points, total distance: ${Math.round(this.totalDistance)}m`,
    );

    // Log segment distance statistics for debugging
    const nonZeroSegments = this.segmentDistances.filter((d) => d > 0);
    const avgDistance =
      nonZeroSegments.length > 0
        ? this.totalDistance / nonZeroSegments.length
        : 0;
    const minDistance =
      nonZeroSegments.length > 0 ? Math.min(...nonZeroSegments) : 0;
    const maxDistance =
      nonZeroSegments.length > 0 ? Math.max(...nonZeroSegments) : 0;
    const shortSegments = nonZeroSegments.filter((d) => d < 5).length;

    logger.info(
      `Segment stats: ${nonZeroSegments.length} segments, avg=${Math.round(avgDistance)}m, min=${minDistance.toFixed(1)}m, max=${Math.round(maxDistance)}m, short(<5m)=${shortSegments}`,
    );
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

    // Use minimum of: base speed, speed limit, and curve-adjusted speed
    let effectiveSpeed = this.speed;
    if (this.currentSpeedLimit !== null) {
      effectiveSpeed = Math.min(effectiveSpeed, this.currentSpeedLimit);
    }
    if (this.curveAdjustedSpeed !== null) {
      effectiveSpeed = Math.min(effectiveSpeed, this.curveAdjustedSpeed);
    }

    return {
      latitude: lat,
      longitude: lon,
      altitude: alt,
      timestamp: new Date(),
      speed: (effectiveSpeed * 1000) / 3600, // m/s
      bearing: calculateBearing(
        p1.latitude,
        p1.longitude,
        p2.latitude,
        p2.longitude,
      ),
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
      logger.info(
        `Simulation complete: reached point ${this.currentPointIndex} of ${totalPoints}, covered ${Math.round(this.coveredDistance)}m`,
      );
      this.clearUpdateLoop();
      this.state = SimulationState.STOPPED;
      this.notifyStateChange();
      this.notifySimulationComplete();
      return;
    }

    // Calculate curve-adjusted speed based on upcoming turns
    this.curveAdjustedSpeed = this.calculateCurveSpeed();

    // Calculate how far we move in this update interval
    // Use minimum of: base speed, speed limit, and curve-adjusted speed
    let effectiveSpeed = this.speed;
    if (this.currentSpeedLimit !== null) {
      effectiveSpeed = Math.min(effectiveSpeed, this.currentSpeedLimit);
    }
    if (this.curveAdjustedSpeed !== null) {
      effectiveSpeed = Math.min(effectiveSpeed, this.curveAdjustedSpeed);
    }
    const speedMs = (effectiveSpeed * 1000) / 3600; // m/s
    const distanceThisUpdate = speedMs * (this.UPDATE_INTERVAL_MS / 1000);

    // Get current segment
    const currentSegmentDistance =
      this.segmentDistances[this.currentPointIndex] || 0;

    if (currentSegmentDistance === 0) {
      // Skip zero-distance segments (duplicate points)
      logger.info(
        `Skipping zero-distance segment at index ${this.currentPointIndex}/${totalPoints}`,
      );
      this.currentPointIndex++;
      this.segmentFraction = 0;
      return;
    }

    // Log progress on every update for debugging
    logger.debug(
      `Simulation tick: point ${this.currentPointIndex}/${totalPoints}, covered ${Math.round(this.coveredDistance)}m/${Math.round(this.totalDistance)}m, segmentDist=${Math.round(currentSegmentDistance)}m`,
    );

    // Update segment fraction
    const fractionThisUpdate = distanceThisUpdate / currentSegmentDistance;
    this.segmentFraction += fractionThisUpdate;
    this.coveredDistance += distanceThisUpdate;

    // Check if we've moved past the current segment
    // Limit to max 5 segment advances per tick to prevent runaway on short segments
    let segmentsAdvanced = 0;
    const maxSegmentsPerTick = 5;

    while (
      this.segmentFraction >= 1 &&
      this.currentPointIndex < totalPoints - 1 &&
      segmentsAdvanced < maxSegmentsPerTick
    ) {
      this.segmentFraction -= 1;
      this.currentPointIndex++;
      segmentsAdvanced++;

      // If we've reached the end
      if (this.currentPointIndex >= totalPoints - 1) {
        // Calculate final bearing from second-to-last to last point
        const lastPoint = points[totalPoints - 1];
        const prevPoint = points[totalPoints - 2];
        this.currentPosition = {
          latitude: lastPoint.latitude,
          longitude: lastPoint.longitude,
          altitude: lastPoint.altitude,
          timestamp: new Date(),
          speed: 0,
          bearing: calculateBearing(
            prevPoint.latitude,
            prevPoint.longitude,
            lastPoint.latitude,
            lastPoint.longitude,
          ),
        };
        this.notifyPositionUpdate(this.currentPosition);

        logger.info(
          `Simulation complete: reached point ${this.currentPointIndex} of ${totalPoints}, covered ${Math.round(this.coveredDistance)}m`,
        );
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
        // Convert remaining distance to fraction of next segment
        const prevSegmentDist =
          this.segmentDistances[this.currentPointIndex - 1] || 1;
        const remainingDistance = this.segmentFraction * prevSegmentDist;
        this.segmentFraction = remainingDistance / nextSegmentDistance;
      }
    }

    // Log if we hit the segment limit (indicates very short segments)
    if (segmentsAdvanced >= maxSegmentsPerTick) {
      logger.debug(
        `Hit max segments per tick limit at point ${this.currentPointIndex}, fraction=${this.segmentFraction.toFixed(2)}`,
      );
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

  /**
   * Calculate speed adjustment based on upcoming curves.
   * Looks ahead on the track to find curves and calculates appropriate speed
   * to navigate them comfortably.
   */
  private calculateCurveSpeed(): number {
    if (!this.currentTrack) return this.speed;

    const points = this.currentTrack.segments[0].points;
    const startIdx = this.currentPointIndex;

    // Need at least 3 points ahead for curvature calculation
    if (startIdx >= points.length - 2) return this.speed;

    // Build points array for lookahead analysis
    let accumulatedDistance = 0;
    let maxCurvature = 0;
    let distanceToMaxCurvature = 0;

    // Account for current position within segment
    if (startIdx < points.length - 1) {
      const segmentDistance = this.segmentDistances[startIdx] || 0;
      const remainingInSegment = segmentDistance * (1 - this.segmentFraction);
      accumulatedDistance = -remainingInSegment; // Start negative to account for partial segment
    }

    // Scan ahead for curves
    for (let i = startIdx; i < points.length - 2; i++) {
      const dist = this.segmentDistances[i] || 0;
      accumulatedDistance += dist;

      // Stop if we've looked far enough ahead
      if (accumulatedDistance > this.LOOKAHEAD_DISTANCE_M) break;

      // Calculate curvature at this point (using 3 consecutive points)
      const curvature = calculateCurvature(
        points[i].latitude,
        points[i].longitude,
        points[i + 1].latitude,
        points[i + 1].longitude,
        points[i + 2].latitude,
        points[i + 2].longitude,
      );

      if (curvature > maxCurvature) {
        maxCurvature = curvature;
        distanceToMaxCurvature = Math.max(0, accumulatedDistance);
      }
    }

    // If no significant curvature found, return base speed
    // 0.05 deg/m threshold = ~1146m radius curve (gentle highway curve)
    if (maxCurvature < 0.05) {
      // Log occasionally to verify curve detection is working
      if (this.currentPointIndex % 20 === 0) {
        logger.debug(
          `Curve scan at point ${this.currentPointIndex}: max curvature=${maxCurvature.toFixed(4)} deg/m (below threshold)`,
        );
      }
      return this.speed;
    }

    // Calculate the safe cornering speed for the curve
    const corneringSpeed = calculateCorneringSpeed(
      maxCurvature,
      this.speed,
      this.LATERAL_ACCEL_LIMIT,
    );

    // Calculate what speed we need now to decelerate in time
    const speedNow = calculateSpeedForUpcomingCurve(
      this.speed,
      corneringSpeed,
      distanceToMaxCurvature,
      this.DECELERATION_RATE,
    );

    // Log speed reductions for debugging
    if (speedNow < this.speed) {
      logger.info(
        `Curve speed: ${Math.round(speedNow)} km/h (base ${this.speed}), ` +
          `curve=${maxCurvature.toFixed(3)} deg/m at ${Math.round(distanceToMaxCurvature)}m, ` +
          `cornering=${Math.round(corneringSpeed)} km/h`,
      );
    }

    return speedNow;
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
