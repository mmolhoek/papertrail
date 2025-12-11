/**
 * Centralized error messages for all error classes.
 *
 * This module provides:
 * - User-friendly error messages for each error code
 * - i18n-ready structure for future localization
 * - Single source of truth for all error messages
 *
 * NOTE: This file uses string literals for error codes to avoid circular
 * dependencies with the error class files. The error codes match the enum
 * values defined in each error class.
 *
 * @example
 * ```typescript
 * import { getUserMessage } from '@errors/ErrorMessages';
 *
 * const message = getUserMessage("GPS_DEVICE_NOT_FOUND");
 * // Returns: "GPS device not found. Please check connections."
 * ```
 */

/**
 * GPS error user messages
 */
export const GPS_ERROR_MESSAGES: Record<string, string> = {
  GPS_DEVICE_NOT_FOUND: "GPS device not found. Please check connections.",
  GPS_DEVICE_OPEN_FAILED:
    "Failed to open GPS device. Please check permissions.",
  GPS_DEVICE_READ_FAILED:
    "Failed to read from GPS device. Please check connections.",
  GPS_DEVICE_NOT_INITIALIZED:
    "GPS device not initialized. Please restart the application.",
  GPS_NO_FIX: "No GPS signal. Please wait for satellite lock.",
  GPS_WEAK_SIGNAL: "Weak GPS signal. Position may be inaccurate.",
  GPS_FIX_TIMEOUT:
    "GPS is taking longer than expected. Please ensure clear sky view.",
  GPS_INSUFFICIENT_SATELLITES:
    "Not enough satellites visible. Move to an open area.",
  GPS_INVALID_DATA: "Received invalid GPS data. Please try again.",
  GPS_PARSE_ERROR:
    "Failed to parse GPS data. Please check device configuration.",
  GPS_CHECKSUM_ERROR: "GPS data checksum error. Please check connections.",
  GPS_ALREADY_TRACKING: "GPS tracking is already active.",
  GPS_NOT_TRACKING: "GPS tracking is not active.",
  GPS_UNKNOWN_ERROR: "GPS error occurred. Please try again.",
};

/**
 * Map error user messages
 */
export const MAP_ERROR_MESSAGES: Record<string, string> = {
  MAP_FILE_NOT_FOUND: "GPX file not found. Please check the file path.",
  MAP_FILE_READ_ERROR:
    "Failed to read GPX file. Please check file permissions.",
  MAP_FILE_TOO_LARGE: "GPX file is too large. Please use a smaller file.",
  MAP_INVALID_FILE_FORMAT: "Invalid file format. Please use a valid GPX file.",
  MAP_PARSE_ERROR: "Failed to parse GPX file. The file may be corrupted.",
  MAP_INVALID_GPX: "Invalid GPX file format. Please use a valid GPX file.",
  MAP_NO_TRACKS: "This GPX file contains no tracks.",
  MAP_NO_TRACK_POINTS: "This track has no points to display.",
  MAP_INVALID_COORDINATES:
    "Invalid coordinates in GPX file. Please check the file.",
  MAP_TRACK_NOT_FOUND: "Track not found in GPX file.",
  MAP_TRACK_INDEX_OUT_OF_BOUNDS:
    "Track index out of bounds. Please select a valid track.",
  MAP_EMPTY_TRACK: "This track is empty and cannot be displayed.",
  MAP_DIRECTORY_NOT_FOUND:
    "GPX directory not found. Please check configuration.",
  MAP_DIRECTORY_READ_ERROR:
    "Failed to read GPX directory. Please check permissions.",
  MAP_NO_GPX_FILES:
    "No GPX files found. Please add GPX files to the directory.",
  MAP_INVALID_BOUNDS: "Invalid map bounds. Please check the track coordinates.",
  MAP_CALCULATION_ERROR: "Map calculation error. Please try again.",
  MAP_UNKNOWN_ERROR: "Error loading map data. Please try again.",
};

/**
 * Display error user messages
 */
export const DISPLAY_ERROR_MESSAGES: Record<string, string> = {
  DISPLAY_DEVICE_NOT_FOUND:
    "E-paper display not found. Please check hardware connections.",
  DISPLAY_DEVICE_INIT_FAILED:
    "Failed to initialize display. Please restart the device.",
  DISPLAY_DEVICE_NOT_INITIALIZED:
    "Display not initialized. Please restart the application.",
  DISPLAY_SPI_ERROR: "Display communication error. Please check connections.",
  DISPLAY_GPIO_ERROR: "Display GPIO error. Please check hardware connections.",
  DISPLAY_BUSY: "Display is busy. Please wait.",
  DISPLAY_TIMEOUT: "Display operation timed out. Please try again.",
  DISPLAY_SLEEPING: "Display is in sleep mode. Please wake it first.",
  DISPLAY_INVALID_BITMAP: "Invalid image data. Please check the source.",
  DISPLAY_BITMAP_SIZE_MISMATCH:
    "Image size does not match display. Please check configuration.",
  DISPLAY_INVALID_DIMENSIONS:
    "Invalid display dimensions. Please check configuration.",
  DISPLAY_RENDER_FAILED: "Failed to render map. Please try again.",
  DISPLAY_PROJECTION_ERROR:
    "Failed to project coordinates. Please check the map data.",
  DISPLAY_OUT_OF_BOUNDS:
    "Coordinates out of display bounds. Please adjust view.",
  DISPLAY_UPDATE_FAILED: "Failed to update display. Please try again.",
  DISPLAY_REFRESH_FAILED: "Failed to refresh display. Please try again.",
  DISPLAY_UNKNOWN_ERROR: "Display error occurred. Please try again.",
};

/**
 * WiFi error user messages
 */
export const WIFI_ERROR_MESSAGES: Record<string, string> = {
  WIFI_SCAN_FAILED: "Failed to scan for WiFi networks. Please try again.",
  WIFI_CONNECTION_FAILED:
    "Failed to connect to WiFi network. Please check password.",
  WIFI_AUTH_FAILED: "WiFi authentication failed. Please check your password.",
  WIFI_TIMEOUT: "WiFi operation timed out. Please try again.",
  NMCLI_NOT_AVAILABLE: "WiFi management not available on this system.",
  WIFI_NETWORK_NOT_FOUND:
    "WiFi network not found. Please check if it's in range.",
  WIFI_ALREADY_CONNECTED: "Already connected to this WiFi network.",
  WIFI_NOT_CONNECTED: "Not connected to any WiFi network.",
  WIFI_INVALID_PASSWORD:
    "Invalid WiFi password format. Password must be 8-63 characters.",
  WIFI_HOTSPOT_CONNECTION_TIMEOUT:
    "Mobile hotspot connection timed out. Please try again.",
  WIFI_FALLBACK_RECONNECT_FAILED:
    "Failed to reconnect to previous network. Please reconnect manually.",
  WIFI_UNKNOWN: "WiFi error occurred. Please try again.",
};

/**
 * Orchestrator error user messages
 */
export const ORCHESTRATOR_ERROR_MESSAGES: Record<string, string> = {
  ORCHESTRATOR_INIT_FAILED: "Failed to initialize application. Please restart.",
  ORCHESTRATOR_SERVICE_INIT_FAILED:
    "Failed to start application services. Please restart.",
  ORCHESTRATOR_NOT_INITIALIZED:
    "Application not fully initialized. Please wait.",
  ORCHESTRATOR_NO_ACTIVE_GPX: "No track selected. Please select a GPX file.",
  ORCHESTRATOR_INVALID_STATE: "Invalid application state. Please restart.",
  ORCHESTRATOR_ALREADY_RUNNING: "Auto-update is already active.",
  ORCHESTRATOR_NOT_RUNNING: "Auto-update is not active.",
  ORCHESTRATOR_UPDATE_FAILED: "Failed to update display. Please try again.",
  ORCHESTRATOR_DISPLAY_UPDATE_FAILED:
    "Failed to update display. Please try again.",
  ORCHESTRATOR_MULTIPLE_ERRORS:
    "Multiple errors occurred. Please check system status.",
  ORCHESTRATOR_SERVICE_UNAVAILABLE:
    "Required service is not available. Please restart.",
  ORCHESTRATOR_UNKNOWN_ERROR: "System error occurred. Please try again.",
};

/**
 * Web error user messages
 */
export const WEB_ERROR_MESSAGES: Record<string, string> = {
  WEB_SERVER_START_FAILED:
    "Failed to start web interface. Please check configuration.",
  WEB_SERVER_STOP_FAILED: "Failed to stop web interface gracefully.",
  WEB_SERVER_NOT_RUNNING: "Web interface is not running.",
  WEB_PORT_IN_USE:
    "Web interface port is already in use. Please change the port.",
  WEB_INVALID_REQUEST: "Invalid request. Please check your input.",
  WEB_MISSING_PARAMETER:
    "Missing required information. Please check your input.",
  WEB_INVALID_PARAMETER: "Invalid parameter value. Please check your input.",
  WEB_UNAUTHORIZED: "Authentication required. Please log in.",
  WEB_FORBIDDEN: "You do not have permission to access this resource.",
  WEB_NOT_FOUND: "Resource not found.",
  WEB_METHOD_NOT_ALLOWED: "This action is not allowed for this resource.",
  WEB_WEBSOCKET_ERROR: "Real-time connection error. Please refresh the page.",
  WEB_BROADCAST_FAILED: "Failed to send update to connected clients.",
  WEB_UNKNOWN_ERROR: "Web interface error occurred. Please try again.",
};

/**
 * Config error user messages
 */
export const CONFIG_ERROR_MESSAGES: Record<string, string> = {
  CONFIG_FILE_NOT_FOUND:
    "Configuration file not found. Using default settings.",
  CONFIG_FILE_READ_ERROR:
    "Failed to read configuration. Using default settings.",
  CONFIG_FILE_WRITE_ERROR:
    "Failed to save configuration. Changes may not persist.",
  CONFIG_PARSE_ERROR: "Failed to parse configuration. Using default settings.",
  CONFIG_INVALID_JSON:
    "Configuration file is corrupted. Using default settings.",
  CONFIG_INVALID_CONFIG: "Invalid configuration. Using default settings.",
  CONFIG_MISSING_REQUIRED_FIELD:
    "Configuration is incomplete. Using default settings.",
  CONFIG_INVALID_VALUE:
    "Configuration contains invalid values. Using defaults.",
  CONFIG_OUT_OF_RANGE: "Configuration values are out of acceptable range.",
  CONFIG_NOT_INITIALIZED: "Configuration not loaded. Using default settings.",
  CONFIG_ALREADY_INITIALIZED: "Configuration already loaded.",
  CONFIG_UNKNOWN_ERROR: "Configuration error occurred. Using default settings.",
};

/**
 * Drive navigation error user messages
 */
export const DRIVE_ERROR_MESSAGES: Record<string, string> = {
  DRIVE_ROUTE_NOT_FOUND: "Route not found. Please calculate a new route.",
  DRIVE_ROUTE_SAVE_FAILED: "Failed to save route. Please try again.",
  DRIVE_ROUTE_LOAD_FAILED: "Failed to load route. Please try again.",
  DRIVE_ROUTE_DELETE_FAILED: "Failed to delete route. Please try again.",
  DRIVE_ROUTE_INVALID: "Invalid route data. Please calculate a new route.",
  DRIVE_NAVIGATION_NOT_STARTED: "No navigation is active.",
  DRIVE_NAVIGATION_ALREADY_ACTIVE:
    "Navigation is already running. Stop it first.",
  DRIVE_NO_GPS_POSITION: "Waiting for GPS position...",
  DRIVE_SERVICE_NOT_INITIALIZED: "Navigation service not ready. Please wait.",
  DRIVE_UNKNOWN_ERROR: "Navigation error occurred. Please try again.",
};

/**
 * Combined mapping of all error codes to their user messages.
 * This is the primary lookup for getUserMessage().
 */
export const ERROR_MESSAGES: Record<string, string> = {
  ...GPS_ERROR_MESSAGES,
  ...MAP_ERROR_MESSAGES,
  ...DISPLAY_ERROR_MESSAGES,
  ...WIFI_ERROR_MESSAGES,
  ...ORCHESTRATOR_ERROR_MESSAGES,
  ...WEB_ERROR_MESSAGES,
  ...CONFIG_ERROR_MESSAGES,
  ...DRIVE_ERROR_MESSAGES,
};

/**
 * Default fallback messages by error category.
 * Used when a specific error code is not found in the mappings.
 */
export const DEFAULT_ERROR_MESSAGES: Record<string, string> = {
  GPS: "GPS error occurred. Please try again.",
  MAP: "Error loading map data. Please try again.",
  DISPLAY: "Display error occurred. Please try again.",
  WIFI: "WiFi error occurred. Please try again.",
  ORCHESTRATOR: "System error occurred. Please try again.",
  WEB: "Web interface error occurred. Please try again.",
  CONFIG: "Configuration error occurred. Using default settings.",
  DRIVE: "Navigation error occurred. Please try again.",
};

/**
 * Get the user-friendly message for an error code.
 *
 * @param code - The error code to look up
 * @returns The user-friendly message for the error code
 *
 * @example
 * ```typescript
 * getUserMessage("GPS_DEVICE_NOT_FOUND")
 * // Returns: "GPS device not found. Please check connections."
 *
 * getUserMessage("UNKNOWN_CODE")
 * // Returns: "An error occurred. Please try again."
 * ```
 */
export function getUserMessage(code: string): string {
  // Try direct lookup first
  const message = ERROR_MESSAGES[code];
  if (message) {
    return message;
  }

  // Try to find default by category (extract prefix before first underscore)
  const category = code.split("_")[0];
  const defaultMessage = DEFAULT_ERROR_MESSAGES[category];
  if (defaultMessage) {
    return defaultMessage;
  }

  // Ultimate fallback
  return "An error occurred. Please try again.";
}

/**
 * Get error message with placeholder replacement.
 * Supports i18n-style placeholders like {0}, {1}, etc.
 *
 * @param code - The error code to look up
 * @param args - Values to substitute for placeholders
 * @returns The formatted message
 *
 * @example
 * ```typescript
 * // If message was "Failed to connect to {0}"
 * getFormattedMessage("WIFI_CONNECTION_FAILED", "MyNetwork")
 * // Returns: "Failed to connect to MyNetwork"
 * ```
 */
export function getFormattedMessage(code: string, ...args: unknown[]): string {
  let message = getUserMessage(code);

  // Replace placeholders {0}, {1}, etc.
  args.forEach((arg, index) => {
    message = message.replace(new RegExp(`\\{${index}\\}`, "g"), String(arg));
  });

  return message;
}
