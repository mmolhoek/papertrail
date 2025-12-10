/**
 * Track Turn Analyzer
 *
 * Analyzes GPX track coordinates to detect and classify turns.
 * Calculates bearing changes between consecutive points and identifies
 * significant direction changes as turns.
 */

import { GPXTrack, GPXTrackPoint, ManeuverType } from "@core/types";
import { getLogger } from "@utils/logger";

const logger = getLogger("TrackTurnAnalyzer");

/**
 * A detected turn in a GPX track
 */
export interface TrackTurn {
  /** Index of the turn point in the flattened points array */
  pointIndex: number;
  /** Latitude of the turn point */
  latitude: number;
  /** Longitude of the turn point */
  longitude: number;
  /** Type of maneuver at this turn */
  maneuverType: ManeuverType;
  /** Bearing change in degrees (-180 to 180, positive = right turn) */
  bearingChange: number;
  /** Distance from start of track in meters */
  distanceFromStart: number;
  /** Distance to next turn (or end of track) in meters */
  distanceToNextTurn: number;
  /** Generated instruction text */
  instruction: string;
  /** Bearing after the turn in degrees (0-360) */
  bearingAfter: number;
}

/**
 * Configuration for turn detection
 */
export interface TurnDetectionConfig {
  /** Minimum bearing change to consider as a turn (degrees) */
  minTurnAngle: number;
  /** Minimum distance between turns (meters) to prevent double-detection */
  minDistanceBetweenTurns: number;
  /** Number of points to look ahead for bearing smoothing */
  bearingSmoothingWindow: number;
}

/**
 * Default turn detection configuration
 */
const DEFAULT_CONFIG: TurnDetectionConfig = {
  minTurnAngle: 25, // 25 degrees minimum to count as a turn
  minDistanceBetweenTurns: 20, // At least 20m between detected turns
  bearingSmoothingWindow: 3, // Average bearing over 3 points for smoothing
};

/**
 * Angle thresholds for classifying turn types (in degrees)
 */
const TURN_THRESHOLDS = {
  SLIGHT: 25, // 25-45 degrees
  NORMAL: 45, // 45-110 degrees
  SHARP: 110, // 110-160 degrees
  UTURN: 160, // > 160 degrees
};

/**
 * TrackTurnAnalyzer class
 *
 * Analyzes GPX tracks to detect turns based on bearing changes.
 */
export class TrackTurnAnalyzer {
  private config: TurnDetectionConfig;

  constructor(config: Partial<TurnDetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.debug(
      `TrackTurnAnalyzer initialized with config: minTurnAngle=${this.config.minTurnAngle}°, minDistance=${this.config.minDistanceBetweenTurns}m`,
    );
  }

  /**
   * Analyze a GPX track and detect all turns
   * @param track The GPX track to analyze
   * @returns Array of detected turns
   */
  analyzeTurns(track: GPXTrack): TrackTurn[] {
    const points = this.flattenTrackPoints(track);

    if (points.length < 3) {
      logger.debug("Track has fewer than 3 points, no turns to detect");
      return [];
    }

    logger.info(`Analyzing ${points.length} track points for turns...`);

    const turns: TrackTurn[] = [];
    const distances = this.calculateCumulativeDistances(points);
    const totalDistance = distances[distances.length - 1];
    let lastTurnDistance = -this.config.minDistanceBetweenTurns;

    // Analyze each point (except first and last)
    for (let i = 1; i < points.length - 1; i++) {
      const bearingBefore = this.calculateSmoothedBearing(
        points,
        i,
        -this.config.bearingSmoothingWindow,
      );
      const bearingAfter = this.calculateSmoothedBearing(
        points,
        i,
        this.config.bearingSmoothingWindow,
      );

      const bearingChange = this.normalizeBearingChange(
        bearingAfter - bearingBefore,
      );
      const absBearingChange = Math.abs(bearingChange);

      // Check if this is a significant turn
      if (absBearingChange >= this.config.minTurnAngle) {
        // Check minimum distance from last turn
        const distanceFromStart = distances[i];
        if (
          distanceFromStart - lastTurnDistance >=
          this.config.minDistanceBetweenTurns
        ) {
          const maneuverType = this.classifyTurn(bearingChange);
          const instruction = this.generateInstruction(maneuverType);

          turns.push({
            pointIndex: i,
            latitude: points[i].latitude,
            longitude: points[i].longitude,
            maneuverType,
            bearingChange,
            distanceFromStart,
            distanceToNextTurn: 0, // Will be calculated after
            instruction,
            bearingAfter: this.normalizeBearing(bearingAfter),
          });

          lastTurnDistance = distanceFromStart;

          logger.debug(
            `Turn detected at point ${i}: ${maneuverType} (${bearingChange.toFixed(1)}°) at ${distanceFromStart.toFixed(0)}m`,
          );
        }
      }
    }

    // Calculate distance to next turn for each turn
    for (let i = 0; i < turns.length; i++) {
      if (i < turns.length - 1) {
        turns[i].distanceToNextTurn =
          turns[i + 1].distanceFromStart - turns[i].distanceFromStart;
      } else {
        // Last turn - distance to end of track
        turns[i].distanceToNextTurn =
          totalDistance - turns[i].distanceFromStart;
      }
    }

    logger.info(`Detected ${turns.length} turns in track`);
    return turns;
  }

  /**
   * Find the next upcoming turn based on current position and distance traveled
   * @param turns Array of detected turns
   * @param distanceAlongTrack Current distance traveled along the track in meters
   * @returns The next upcoming turn, or null if no more turns
   */
  findNextTurn(
    turns: TrackTurn[],
    distanceAlongTrack: number,
  ): TrackTurn | null {
    for (const turn of turns) {
      if (turn.distanceFromStart > distanceAlongTrack) {
        return turn;
      }
    }
    return null;
  }

  /**
   * Find the turn after the next one (for "then turn..." display)
   * @param turns Array of detected turns
   * @param distanceAlongTrack Current distance traveled along the track in meters
   * @returns The turn after next, or null if not available
   */
  findTurnAfterNext(
    turns: TrackTurn[],
    distanceAlongTrack: number,
  ): TrackTurn | null {
    let foundFirst = false;
    for (const turn of turns) {
      if (turn.distanceFromStart > distanceAlongTrack) {
        if (foundFirst) {
          return turn;
        }
        foundFirst = true;
      }
    }
    return null;
  }

  /**
   * Flatten all track segments into a single array of points
   */
  private flattenTrackPoints(track: GPXTrack): GPXTrackPoint[] {
    const points: GPXTrackPoint[] = [];
    for (const segment of track.segments) {
      points.push(...segment.points);
    }
    return points;
  }

  /**
   * Calculate cumulative distances from start for each point
   */
  private calculateCumulativeDistances(points: GPXTrackPoint[]): number[] {
    const distances: number[] = [0];
    let totalDistance = 0;

    for (let i = 1; i < points.length; i++) {
      const dist = this.haversineDistance(
        points[i - 1].latitude,
        points[i - 1].longitude,
        points[i].latitude,
        points[i].longitude,
      );
      totalDistance += dist;
      distances.push(totalDistance);
    }

    return distances;
  }

  /**
   * Calculate bearing between two points in degrees (0-360)
   */
  private calculateBearing(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const y = Math.sin(deltaLambda) * Math.cos(phi2);
    const x =
      Math.cos(phi1) * Math.sin(phi2) -
      Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

    const theta = Math.atan2(y, x);
    const bearing = ((theta * 180) / Math.PI + 360) % 360;

    return bearing;
  }

  /**
   * Calculate smoothed bearing by averaging over multiple points
   * @param points Track points
   * @param centerIndex Center point index
   * @param direction Positive for forward, negative for backward
   */
  private calculateSmoothedBearing(
    points: GPXTrackPoint[],
    centerIndex: number,
    direction: number,
  ): number {
    const windowSize = Math.abs(direction);
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    if (direction < 0) {
      // Look backward: calculate bearing from previous points to center
      for (let i = 1; i <= windowSize && centerIndex - i >= 0; i++) {
        const from = points[centerIndex - i];
        const to = points[centerIndex];
        const bearing = this.calculateBearing(
          from.latitude,
          from.longitude,
          to.latitude,
          to.longitude,
        );
        sumX += Math.cos((bearing * Math.PI) / 180);
        sumY += Math.sin((bearing * Math.PI) / 180);
        count++;
      }
    } else {
      // Look forward: calculate bearing from center to next points
      for (let i = 1; i <= windowSize && centerIndex + i < points.length; i++) {
        const from = points[centerIndex];
        const to = points[centerIndex + i];
        const bearing = this.calculateBearing(
          from.latitude,
          from.longitude,
          to.latitude,
          to.longitude,
        );
        sumX += Math.cos((bearing * Math.PI) / 180);
        sumY += Math.sin((bearing * Math.PI) / 180);
        count++;
      }
    }

    if (count === 0) {
      return 0;
    }

    const avgBearing = (Math.atan2(sumY / count, sumX / count) * 180) / Math.PI;
    return this.normalizeBearing(avgBearing);
  }

  /**
   * Normalize bearing change to -180 to 180 range
   * Positive = right turn, Negative = left turn
   */
  private normalizeBearingChange(change: number): number {
    while (change > 180) change -= 360;
    while (change < -180) change += 360;
    return change;
  }

  /**
   * Normalize bearing to 0-360 range
   */
  private normalizeBearing(bearing: number): number {
    while (bearing < 0) bearing += 360;
    while (bearing >= 360) bearing -= 360;
    return bearing;
  }

  /**
   * Classify a bearing change into a ManeuverType
   */
  private classifyTurn(bearingChange: number): ManeuverType {
    const absChange = Math.abs(bearingChange);
    const isRight = bearingChange > 0;

    if (absChange >= TURN_THRESHOLDS.UTURN) {
      return ManeuverType.UTURN;
    } else if (absChange >= TURN_THRESHOLDS.SHARP) {
      return isRight ? ManeuverType.SHARP_RIGHT : ManeuverType.SHARP_LEFT;
    } else if (absChange >= TURN_THRESHOLDS.NORMAL) {
      return isRight ? ManeuverType.RIGHT : ManeuverType.LEFT;
    } else if (absChange >= TURN_THRESHOLDS.SLIGHT) {
      return isRight ? ManeuverType.SLIGHT_RIGHT : ManeuverType.SLIGHT_LEFT;
    }

    return ManeuverType.STRAIGHT;
  }

  /**
   * Generate a human-readable instruction for a maneuver type
   */
  private generateInstruction(maneuverType: ManeuverType): string {
    switch (maneuverType) {
      case ManeuverType.SLIGHT_LEFT:
        return "Bear left";
      case ManeuverType.LEFT:
        return "Turn left";
      case ManeuverType.SHARP_LEFT:
        return "Sharp left";
      case ManeuverType.SLIGHT_RIGHT:
        return "Bear right";
      case ManeuverType.RIGHT:
        return "Turn right";
      case ManeuverType.SHARP_RIGHT:
        return "Sharp right";
      case ManeuverType.UTURN:
        return "U-turn";
      case ManeuverType.STRAIGHT:
      default:
        return "Continue straight";
    }
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) *
        Math.cos(phi2) *
        Math.sin(deltaLambda / 2) *
        Math.sin(deltaLambda / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}

/**
 * Singleton instance for convenience
 */
let analyzerInstance: TrackTurnAnalyzer | null = null;

/**
 * Get the default TrackTurnAnalyzer instance
 */
export function getTrackTurnAnalyzer(
  config?: Partial<TurnDetectionConfig>,
): TrackTurnAnalyzer {
  if (!analyzerInstance || config) {
    analyzerInstance = new TrackTurnAnalyzer(config);
  }
  return analyzerInstance;
}
