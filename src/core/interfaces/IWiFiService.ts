import {
  Result,
  WiFiNetwork,
  WiFiConnection,
  WiFiNetworkConfig,
} from "@core/types";

/**
 * WiFi Service Interface
 * Manages WiFi network scanning, connection, and credential storage
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
}
