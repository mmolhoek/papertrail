/**
 * WiFi network information returned from scan
 */
export type WiFiNetwork = {
  ssid: string;
  signalStrength: number; // 0-100
  security: "WPA2" | "WPA3" | "WEP" | "Open" | "WPA" | "Unknown";
  frequency: number; // MHz (2400, 5000, etc.)
};

/**
 * Active WiFi connection details
 */
export type WiFiConnection = {
  ssid: string;
  ipAddress: string;
  macAddress: string;
  signalStrength: number;
  connectedAt: Date;
};

/**
 * WiFi network configuration for saving
 */
export type WiFiNetworkConfig = {
  ssid: string;
  password: string;
  priority: number; // 1-999, higher = preferred
  autoConnect: boolean;
};

/**
 * WiFi service configuration
 */
export type WiFiConfig = {
  enabled: boolean;
  primarySSID: string; // Default: "Papertrail-Setup"
  primaryPassword: string; // Default: "papertrail123"
  scanIntervalMs: number;
  connectionTimeoutMs: number;
};

/**
 * WiFi service states for state machine
 */
export enum WiFiState {
  /** Initialized, not actively managing connection */
  IDLE = "IDLE",
  /** Scanning for networks */
  SCANNING = "SCANNING",
  /** Attempting to connect to mobile hotspot */
  CONNECTING = "CONNECTING",
  /** Connected to mobile hotspot */
  CONNECTED = "CONNECTED",
  /** Not connected to any network */
  DISCONNECTED = "DISCONNECTED",
  /** Prompting user to enable mobile hotspot */
  WAITING_FOR_HOTSPOT = "WAITING_FOR_HOTSPOT",
  /** Reconnecting to fallback network after timeout */
  RECONNECTING_FALLBACK = "RECONNECTING_FALLBACK",
  /** Error state */
  ERROR = "ERROR",
}

/**
 * WiFi state change event data
 */
export type WiFiStateChangeEvent = {
  state: WiFiState;
  previousState: WiFiState;
  timestamp: Date;
  details?: {
    ssid?: string;
    error?: string;
    remainingTimeMs?: number;
    ipAddress?: string;
  };
};

/**
 * Fallback network configuration (persisted to config)
 */
export type FallbackNetworkConfig = {
  ssid: string;
  savedAt: string; // ISO timestamp
};

/**
 * Mobile hotspot configuration (persisted to config)
 * This is the hotspot the device connects TO (e.g., user's phone hotspot)
 */
export type HotspotConfig = {
  ssid: string;
  password: string;
  updatedAt: string; // ISO timestamp
};
