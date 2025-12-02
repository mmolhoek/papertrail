import {
  Result,
  WiFiNetwork,
  WiFiConnection,
  WiFiNetworkConfig,
  WiFiState,
} from "../types";

/**
 * WiFi operating mode based on WebSocket client presence
 */
export type WiFiMode = "stopped" | "driving";

/**
 * WiFi Service Interface
 * Manages WiFi network scanning, connection, credential storage,
 * and mobile hotspot connection state machine.
 */
export interface IWiFiService {
  /**
   * Initialize the WiFi service
   */
  initialize(): Promise<Result<void>>;

  /**
   * Cleanup resources
   */
  dispose(): Promise<void>;

  // Network scanning
  /**
   * Scan for available WiFi networks
   * @returns List of available networks with signal strength and security
   */
  scanNetworks(): Promise<Result<WiFiNetwork[]>>;

  // Connection management
  /**
   * Get current WiFi connection details
   * @returns Connection info if connected, null if not connected
   */
  getCurrentConnection(): Promise<Result<WiFiConnection | null>>;

  /**
   * Check if currently connected to any WiFi network
   * @returns true if connected, false otherwise
   */
  isConnected(): Promise<Result<boolean>>;

  /**
   * Connect to a WiFi network
   * @param ssid Network SSID
   * @param password Network password
   */
  connect(ssid: string, password: string): Promise<Result<void>>;

  /**
   * Disconnect from current WiFi network
   */
  disconnect(): Promise<Result<void>>;

  // Credential management (stored in NetworkManager)
  /**
   * Save a network configuration for auto-connect
   * @param config Network configuration
   */
  saveNetwork(config: WiFiNetworkConfig): Promise<Result<void>>;

  /**
   * Get list of saved network configurations
   * @returns List of saved networks
   */
  getSavedNetworks(): Promise<Result<WiFiNetworkConfig[]>>;

  /**
   * Remove a saved network configuration
   * @param ssid Network SSID to remove
   */
  removeNetwork(ssid: string): Promise<Result<void>>;

  // Event callbacks
  /**
   * Register callback for connection state changes
   * @param callback Function called when connection state changes
   * @returns Unsubscribe function
   */
  onConnectionChange(callback: (connected: boolean) => void): () => void;

  // State machine methods

  /**
   * Get the current WiFi state
   * @returns Current WiFiState
   */
  getState(): WiFiState;

  /**
   * Check if currently connected to the configured mobile hotspot
   * @returns true if connected to the mobile hotspot SSID
   */
  isConnectedToMobileHotspot(): Promise<Result<boolean>>;

  /**
   * Register callback for WiFi state changes
   * @param callback Function called when state changes (receives new state and previous state)
   * @returns Unsubscribe function
   */
  onStateChange(
    callback: (state: WiFiState, previousState: WiFiState) => void,
  ): () => void;

  // Mode awareness methods

  /**
   * Update the WebSocket client count
   * Called by IntegratedWebService when clients connect/disconnect.
   * This determines stopped mode (clients > 0) vs driving mode (clients = 0).
   * @param count Current number of connected WebSocket clients
   */
  setWebSocketClientCount(count: number): void;

  /**
   * Get the current operating mode based on WebSocket client presence
   * @returns "stopped" if clients are connected, "driving" otherwise
   */
  getMode(): WiFiMode;

  /**
   * Manually trigger an attempt to connect to the mobile hotspot
   * Useful for retry scenarios or manual connection requests.
   * @returns Result indicating connection success/failure
   */
  attemptMobileHotspotConnection(): Promise<Result<void>>;

  /**
   * Get the configured mobile hotspot SSID
   * @returns The SSID configured for the mobile hotspot
   */
  getMobileHotspotSSID(): string;
}
