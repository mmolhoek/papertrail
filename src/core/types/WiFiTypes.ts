/**
 * WiFi network information returned from scan
 */
export type WiFiNetwork = {
  ssid: string;
  signalStrength: number; // 0-100
  security: 'WPA2' | 'WPA3' | 'WEP' | 'Open' | 'WPA' | 'Unknown';
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
