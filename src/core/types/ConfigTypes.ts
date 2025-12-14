import { GPSConfig } from "./GPSTypes";
import { EpaperConfig, ScreenType } from "./DisplayTypes";
import { RenderOptions } from "./DisplayTypes";
import { FallbackNetworkConfig, HotspotConfig } from "./WiFiTypes";

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

  /**
   * Enable CORS (Cross-Origin Resource Sharing)
   *
   * By default, CORS is enabled with `origin: "*"` to allow the mobile web interface
   * to work from any device on the local network. This is intentional for a GPS tracker
   * device that needs to be controlled from phones/tablets on the same network.
   *
   * For restricted environments, set `cors: false` to disable CORS entirely,
   * or use `corsOrigins` to specify allowed origins.
   */
  cors: boolean;

  /**
   * Allowed CORS origins (optional)
   *
   * When specified, restricts CORS to only these origins instead of allowing all (`*`).
   * This is useful for production deployments where you want to limit access.
   *
   * Examples:
   * - `["http://192.168.1.100:3000"]` - Single origin
   * - `["http://localhost:3000", "http://192.168.1.*"]` - Multiple origins
   * - `undefined` or empty - Allow all origins (`*`)
   *
   * Note: For local device use (the primary use case), leave this undefined to allow
   * connections from any device on the network.
   */
  corsOrigins?: string[];

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

  /** Active screen type for display rendering */
  activeScreen?: ScreenType;

  /** Onboarding completion status */
  onboardingCompleted?: boolean;

  /** Onboarding completion timestamp (ISO string) */
  onboardingTimestamp?: string;

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

    /** Whether to show speed limit during drive navigation */
    showSpeedLimit: boolean;

    /** Speed unit preference: 'kmh' for kilometers per hour, 'mph' for miles per hour */
    speedUnit: "kmh" | "mph";
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

  /** Recent drive destinations */
  recentDestinations: Array<{
    name: string;
    latitude: number;
    longitude: number;
    usedAt: string;
  }>;

  /** WiFi fallback network configuration (persisted) */
  wifiFallbackNetwork?: FallbackNetworkConfig;

  /** Mobile hotspot configuration (the hotspot the device connects TO) */
  hotspotConfig?: HotspotConfig;
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
    model?: string;
    width?: number;
    height?: number;
    lastUpdate?: Date;
    refreshCount: number;
  };

  /** Active GPX track info */
  activeTrack?: {
    name: string;
    path: string;
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
