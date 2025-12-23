/**
 * Drive Navigation Types
 *
 * Type definitions for turn-by-turn navigation feature.
 */

/**
 * Maneuver types for turn-by-turn navigation
 * Based on OSRM maneuver types
 */
export enum ManeuverType {
  DEPART = "depart",
  STRAIGHT = "straight",
  SLIGHT_LEFT = "slight_left",
  LEFT = "left",
  SHARP_LEFT = "sharp_left",
  SLIGHT_RIGHT = "slight_right",
  RIGHT = "right",
  SHARP_RIGHT = "sharp_right",
  UTURN = "uturn",
  ARRIVE = "arrive",
  MERGE = "merge",
  FORK_LEFT = "fork_left",
  FORK_RIGHT = "fork_right",
  RAMP_LEFT = "ramp_left",
  RAMP_RIGHT = "ramp_right",
  ROUNDABOUT = "roundabout",
  ROUNDABOUT_EXIT_1 = "roundabout_exit_1",
  ROUNDABOUT_EXIT_2 = "roundabout_exit_2",
  ROUNDABOUT_EXIT_3 = "roundabout_exit_3",
  ROUNDABOUT_EXIT_4 = "roundabout_exit_4",
  ROUNDABOUT_EXIT_5 = "roundabout_exit_5",
  ROUNDABOUT_EXIT_6 = "roundabout_exit_6",
  ROUNDABOUT_EXIT_7 = "roundabout_exit_7",
  ROUNDABOUT_EXIT_8 = "roundabout_exit_8",
}

/**
 * A single waypoint in a drive route
 */
export interface DriveWaypoint {
  /** Latitude of the waypoint */
  latitude: number;
  /** Longitude of the waypoint */
  longitude: number;
  /** Human-readable instruction (e.g., "Turn left onto Main St") */
  instruction: string;
  /** Type of maneuver at this waypoint */
  maneuverType: ManeuverType;
  /** Distance in meters from previous waypoint to this one */
  distance: number;
  /** Name of the street after the maneuver */
  streetName?: string;
  /** Bearing after the maneuver in degrees (0-360) */
  bearingAfter?: number;
  /** Index of this waypoint in the route */
  index: number;
}

/**
 * A complete drive route with all waypoints
 */
export interface DriveRoute {
  /** Unique identifier for the route */
  id: string;
  /** Human-readable destination name/address */
  destination: string;
  /** Human-readable source name/address (or "gps" for current position) */
  sourceName?: string;
  /** Routing profile used to calculate this route */
  routingProfile?: "car" | "bike" | "foot";
  /** When the route was created */
  createdAt: Date;
  /** Starting point coordinates */
  startPoint: {
    latitude: number;
    longitude: number;
  };
  /** Destination coordinates */
  endPoint: {
    latitude: number;
    longitude: number;
  };
  /** All waypoints including turns */
  waypoints: DriveWaypoint[];
  /** Full route geometry for drawing on map (array of [lat, lon] pairs) */
  geometry: [number, number][];
  /** Total distance in meters */
  totalDistance: number;
  /** Estimated time in seconds */
  estimatedTime: number;
}

/**
 * Navigation state enum
 */
export enum NavigationState {
  /** No active navigation */
  IDLE = "idle",
  /** Actively navigating along route */
  NAVIGATING = "navigating",
  /** User is off-route, showing arrow to route start */
  OFF_ROAD = "off_road",
  /** User has arrived at destination */
  ARRIVED = "arrived",
  /** Navigation was cancelled */
  CANCELLED = "cancelled",
}

/**
 * Display mode for the e-paper during navigation
 */
export enum DriveDisplayMode {
  /** Full-screen turn arrow with distance (when close to turn) */
  TURN_SCREEN = "turn_screen",
  /** Map view with turn overlay (when far from turn) */
  MAP_WITH_OVERLAY = "map_with_overlay",
  /** Arrow pointing to route start (when off-road) */
  OFF_ROAD_ARROW = "off_road_arrow",
  /** Arrival screen */
  ARRIVED = "arrived",
}

/**
 * Current navigation status
 */
export interface DriveNavigationStatus {
  /** Current navigation state */
  state: NavigationState;
  /** Current display mode */
  displayMode: DriveDisplayMode;
  /** Active route (if any) */
  route?: DriveRoute;
  /** Current waypoint index (next upcoming turn) */
  currentWaypointIndex: number;
  /** Distance in meters to next waypoint/turn */
  distanceToNextTurn: number;
  /** Total remaining distance in meters */
  distanceRemaining: number;
  /** Estimated time remaining in seconds */
  timeRemaining: number;
  /** Next waypoint/turn information */
  nextTurn?: DriveWaypoint;
  /** Bearing to route start (for off-road mode) */
  bearingToRoute?: number;
  /** Distance to route start (for off-road mode) */
  distanceToRoute?: number;
  /** Progress percentage (0-100) */
  progress: number;
}

/**
 * Navigation update event data
 */
export interface DriveNavigationUpdate {
  /** Update type */
  type:
    | "status"
    | "turn_approaching"
    | "waypoint_reached"
    | "off_road"
    | "arrived"
    | "recalculating";
  /** Current navigation status */
  status: DriveNavigationStatus;
  /** Timestamp of the update */
  timestamp: Date;
}

/**
 * Route calculation request from web UI
 */
export interface DriveRouteRequest {
  /** Destination coordinates */
  destination: {
    latitude: number;
    longitude: number;
  };
  /** Optional destination name/address */
  destinationName?: string;
  /** Starting point (defaults to current GPS position) */
  start?: {
    latitude: number;
    longitude: number;
  };
}

/**
 * Distance threshold constants for navigation
 */
export const DRIVE_THRESHOLDS = {
  /** Distance (m) at which to switch to full-screen turn display */
  TURN_SCREEN_DISTANCE: 500,
  /** Distance (m) to consider waypoint reached */
  WAYPOINT_REACHED_DISTANCE: 30,
  /** Distance (m) from route start to show off-road arrow */
  OFF_ROAD_DISTANCE: 500,
  /** Distance (m) to consider arrived at destination */
  ARRIVAL_DISTANCE: 50,
} as const;
