import { GPSCoordinate } from "./GPSTypes";

/**
 * A single point in a GPX track
 */
export type GPXTrackPoint = GPSCoordinate & {
  /** Optional name/description of the waypoint */
  name?: string;

  /** Optional description */
  description?: string;

  /** Heart rate at this point (if available) */
  heartRate?: number;

  /** Cadence at this point (if available) */
  cadence?: number;

  /** Power at this point in watts (if available) */
  power?: number;

  /** Temperature at this point in Celsius (if available) */
  temperature?: number;
};

/**
 * A segment of a GPX track
 */
export type GPXTrackSegment = {
  /** Points in this segment */
  points: GPXTrackPoint[];
};

/**
 * A complete GPX track with metadata
 */
export type GPXTrack = {
  /** Name of the track */
  name: string;

  /** Optional description */
  description?: string;

  /** Track segments (most tracks have one segment) */
  segments: GPXTrackSegment[];

  /** Track type (e.g., 'hiking', 'cycling', 'running') */
  type?: string;

  /** Creation timestamp */
  timestamp?: Date;

  /** Total distance in meters */
  totalDistance?: number;

  /** Total elevation gain in meters */
  elevationGain?: number;

  /** Total elevation loss in meters */
  elevationLoss?: number;

  /** Minimum elevation in meters */
  minElevation?: number;

  /** Maximum elevation in meters */
  maxElevation?: number;
};

/**
 * GPX file metadata
 */
export type GPXMetadata = {
  /** Name of the GPX file */
  name: string;

  /** Description */
  description?: string;

  /** Author information */
  author?: {
    name?: string;
    email?: string;
    link?: string;
  };

  /** Copyright information */
  copyright?: string;

  /** Link to additional information */
  link?: string;

  /** Creation time */
  time?: Date;

  /** Keywords */
  keywords?: string[];

  /** Bounding box */
  bounds?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
};

/**
 * Complete GPX file structure
 */
export type GPXFile = {
  /** File metadata */
  metadata?: GPXMetadata;

  /** Tracks in the file */
  tracks: GPXTrack[];

  /** Waypoints in the file */
  waypoints?: GPXTrackPoint[];

  /** Routes in the file */
  routes?: GPXTrack[];
};

/**
 * GPX file information for listing
 */
export type GPXFileInfo = {
  /** File path */
  path: string;

  /** File name */
  fileName: string;

  /** Track name from GPX metadata */
  trackName?: string;

  /** Number of tracks in the file */
  trackCount: number;

  /** Total number of track points */
  pointCount: number;

  /** Total distance in meters */
  totalDistance: number;

  /** File size in bytes */
  fileSize: number;

  /** Last modified timestamp */
  lastModified: Date;

  /** Creation timestamp from GPX metadata */
  createdAt?: Date;
};

/**
 * Bounds/bounding box for map area
 */
export type Bounds = {
  /** Minimum latitude */
  minLat: number;

  /** Maximum latitude */
  maxLat: number;

  /** Minimum longitude */
  minLon: number;

  /** Maximum longitude */
  maxLon: number;
};
