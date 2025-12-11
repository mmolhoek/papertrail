import { BaseError } from "./BaseError";
import { getUserMessage } from "./ErrorMessages";

/**
 * WiFi error codes
 */
export enum WiFiErrorCode {
  SCAN_FAILED = "WIFI_SCAN_FAILED",
  CONNECTION_FAILED = "WIFI_CONNECTION_FAILED",
  AUTH_FAILED = "WIFI_AUTH_FAILED",
  TIMEOUT = "WIFI_TIMEOUT",
  NMCLI_NOT_AVAILABLE = "NMCLI_NOT_AVAILABLE",
  NETWORK_NOT_FOUND = "WIFI_NETWORK_NOT_FOUND",
  ALREADY_CONNECTED = "WIFI_ALREADY_CONNECTED",
  NOT_CONNECTED = "WIFI_NOT_CONNECTED",
  INVALID_PASSWORD = "WIFI_INVALID_PASSWORD",
  HOTSPOT_CONNECTION_TIMEOUT = "WIFI_HOTSPOT_CONNECTION_TIMEOUT",
  FALLBACK_RECONNECT_FAILED = "WIFI_FALLBACK_RECONNECT_FAILED",
  UNKNOWN = "WIFI_UNKNOWN",
}

/**
 * WiFi service errors
 */
export class WiFiError extends BaseError {
  constructor(
    message: string,
    public readonly code: WiFiErrorCode,
    recoverable: boolean = false,
    context?: Record<string, unknown>,
  ) {
    super(message, code, recoverable, context);
  }

  /**
   * Network scan failed
   */
  static scanFailed(error: Error): WiFiError {
    return new WiFiError(
      `Failed to scan networks: ${error.message}`,
      WiFiErrorCode.SCAN_FAILED,
      true,
      { originalError: error.message },
    );
  }

  /**
   * Connection to network failed
   */
  static connectionFailed(ssid: string, error: Error): WiFiError {
    return new WiFiError(
      `Failed to connect to "${ssid}": ${error.message}`,
      WiFiErrorCode.CONNECTION_FAILED,
      true,
      { ssid, originalError: error.message },
    );
  }

  /**
   * Authentication failed (wrong password)
   */
  static authFailed(ssid: string): WiFiError {
    return new WiFiError(
      `Authentication failed for "${ssid}"`,
      WiFiErrorCode.AUTH_FAILED,
      true,
      { ssid },
    );
  }

  /**
   * Operation timed out
   */
  static timeout(operation: string, timeoutMs: number): WiFiError {
    return new WiFiError(
      `WiFi operation timed out after ${timeoutMs}ms: ${operation}`,
      WiFiErrorCode.TIMEOUT,
      true,
      { operation, timeoutMs },
    );
  }

  /**
   * NetworkManager (nmcli) not available
   */
  static nmcliNotAvailable(): WiFiError {
    return new WiFiError(
      "NetworkManager (nmcli) not found. WiFi management requires NetworkManager.",
      WiFiErrorCode.NMCLI_NOT_AVAILABLE,
      false,
    );
  }

  /**
   * Network not found in scan results
   */
  static networkNotFound(ssid: string): WiFiError {
    return new WiFiError(
      `Network "${ssid}" not found in scan results`,
      WiFiErrorCode.NETWORK_NOT_FOUND,
      true,
      { ssid },
    );
  }

  /**
   * Already connected to a network
   */
  static alreadyConnected(ssid: string): WiFiError {
    return new WiFiError(
      `Already connected to "${ssid}"`,
      WiFiErrorCode.ALREADY_CONNECTED,
      false,
      { ssid },
    );
  }

  /**
   * Not connected to any network
   */
  static notConnected(): WiFiError {
    return new WiFiError(
      "Not connected to any WiFi network",
      WiFiErrorCode.NOT_CONNECTED,
      true,
    );
  }

  /**
   * Invalid password format
   */
  static invalidPassword(): WiFiError {
    return new WiFiError(
      "Invalid WiFi password format",
      WiFiErrorCode.INVALID_PASSWORD,
      true,
    );
  }

  /**
   * Mobile hotspot connection timed out
   */
  static hotspotConnectionTimeout(ssid: string, timeoutMs: number): WiFiError {
    return new WiFiError(
      `Failed to connect to mobile hotspot "${ssid}" after ${timeoutMs}ms`,
      WiFiErrorCode.HOTSPOT_CONNECTION_TIMEOUT,
      true,
      { ssid, timeoutMs },
    );
  }

  /**
   * Failed to reconnect to fallback network
   */
  static fallbackReconnectFailed(ssid: string, error: Error): WiFiError {
    return new WiFiError(
      `Failed to reconnect to fallback network "${ssid}": ${error.message}`,
      WiFiErrorCode.FALLBACK_RECONNECT_FAILED,
      true,
      { ssid, originalError: error.message },
    );
  }

  /**
   * Unknown WiFi error
   */
  static unknown(message: string): WiFiError {
    return new WiFiError(message, WiFiErrorCode.UNKNOWN, true);
  }

  getUserMessage(): string {
    return getUserMessage(this.code);
  }
}
