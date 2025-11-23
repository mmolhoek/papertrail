import { GPSConfig } from "./GPSTypes";
import { EpaperConfig } from "./DisplayTypes";
import { RenderOptions } from "./DisplayTypes";

/**
 * Application-wide configuration
 */
export type AppConfig = {
  /** Application version */
  version: string;

  /** Environment (development, production) */
  environment: "development" | "production";

  /** GPS service configuration */
  gps: GPSConfig;

  /** E-paper display configuration */
  display: EpaperConfig;

  /** Rendering configuration */
  rendering: RenderOptions;

  /** Map service configuration */
  map: MapConfig;

  /** Web interface configuration */
  web: WebConfig;

  /** Logging configuration */
  logging: LoggingConfig;
};

/**
 * Map service configuration
 */
export type MapConfig = {
  /** Directory containing GPX files */
  gpxDirectory: string;

  /** Maximum file size for GPX files in bytes */
  maxFileSize: number;

  /** Whether to cache parsed GPX files */
  enableCache: boolean;

  /** Cache directory */
  cacheDirectory?: string;

  /** Default zoom level */
  defaultZoomLevel: number;

  /** Minimum zoom level */
  minZoomLevel: number;

  /** Maximum zoom level */
  maxZoomLevel: number;
};

/**
 * Web interface configuration
 */
export type WebConfig = {
  /** Server port */
  port: number;

  /** Server host */
  host: string;

  /** Enable CORS */
  cors: boolean;

  /** API base path */
  apiBasePath: string;

  /** Static files directory */
  staticDirectory: string;

  /** WebSocket configuration for live updates */
  websocket?: {
    enabled: boolean;
    port?: number;
  };

  /** Authentication settings */
  auth?: {
    enabled: boolean;
    username: string;
    password: string;
  };
};

/**
 * Logging configuration
 */
export type LoggingConfig = {
  /** Log level */
  level: "debug" | "info" | "warn" | "error";

  /** Log directory */
  directory: string;

  /** Whether to log to console */
  console: boolean;

  /** Whether to log to file */
  file: boolean;

  /** Maximum log file size in bytes */
  maxFileSize: number;

  /** Maximum number of log files to keep */
  maxFiles: number;
};

/**
 * User preferences/state (persisted)
 */
export type UserState = {
  /** Currently active GPX file path */
  activeGPXPath: string | null;

  /** Current zoom level */
  zoomLevel: number;

  /** Last known GPS position */
  lastKnownPosition?: {
    latitude: number;
    longitude: number;
    timestamp: string; // ISO string for JSON serialization
  };

  /** Display preferences */
  displayPreferences: {
    /** Whether to auto-center on GPS position */
    autoCenter: boolean;

    /** Whether to rotate map based on bearing */
    rotateWithBearing: boolean;

    /** Display brightness (0-100) */
    brightness: number;

    /** Auto-refresh interval in seconds (0 = disabled) */
    autoRefreshInterval: number;
  };

  /** Recently used GPX files */
  recentFiles: string[];

  /** User-defined waypoints */
  customWaypoints: Array<{
    name: string;
    latitude: number;
    longitude: number;
    createdAt: string;
  }>;
};

/**
 * System status information
 */
export type SystemStatus = {
  /** Application uptime in seconds */
  uptime: number;

  /** GPS service status */
  gps: {
    connected: boolean;
    tracking: boolean;
    satellitesInUse: number;
    lastUpdate?: Date;
  };

  /** Display service status */
  display: {
    initialized: boolean;
    busy: boolean;
    lastUpdate?: Date;
    refreshCount: number;
  };

  /** Active GPX track info */
  activeTrack?: {
    name: string;
    pointCount: number;
    distance: number;
  };

  /** System resources */
  system: {
    cpuUsage: number;
    memoryUsage: number;
    temperature?: number;
  };
};
