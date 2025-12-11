/**
 * Default Configuration Constants
 *
 * This file contains all default configuration values used throughout the application.
 * Each section is organized by service/domain and includes JSDoc documentation
 * explaining the purpose and units of each constant.
 */

// =============================================================================
// GPS Configuration Defaults
// =============================================================================

/**
 * Default serial device path for GPS module
 * Standard UART path on Raspberry Pi for the primary UART
 */
export const GPS_DEFAULT_DEVICE_PATH = "/dev/ttyAMA0";

/**
 * Default baud rate for GPS serial communication
 * 9600 is standard for most NMEA GPS modules
 */
export const GPS_DEFAULT_BAUD_RATE = 9600;

/**
 * Default GPS update interval in milliseconds
 * 1000ms (1 second) provides good balance between responsiveness and power
 */
export const GPS_DEFAULT_UPDATE_INTERVAL_MS = 1000;

/**
 * Default minimum GPS accuracy required in meters
 * Positions with horizontal dilution greater than this are considered unreliable
 */
export const GPS_DEFAULT_MIN_ACCURACY_METERS = 10;

// =============================================================================
// Map Configuration Defaults
// =============================================================================

/**
 * Default directory for storing GPX track files
 */
export const MAP_DEFAULT_GPX_DIRECTORY = "./data/gpx-files";

/**
 * Maximum allowed GPX file size in bytes
 * 10MB should accommodate most reasonable track files
 */
export const MAP_DEFAULT_MAX_FILE_SIZE_BYTES = 10485760; // 10MB

/**
 * Default directory for caching parsed GPX data
 */
export const MAP_DEFAULT_CACHE_DIRECTORY = "./data/cache";

/**
 * Default map zoom level (1-20 scale)
 * 14 provides good detail for walking/cycling navigation
 */
export const MAP_DEFAULT_ZOOM_LEVEL = 14;

/**
 * Minimum allowed zoom level (most zoomed out)
 */
export const MAP_MIN_ZOOM_LEVEL = 1;

/**
 * Maximum allowed zoom level (most zoomed in)
 */
export const MAP_MAX_ZOOM_LEVEL = 20;

// =============================================================================
// E-Paper Display Configuration Defaults
// =============================================================================

/**
 * Default e-paper display width in pixels
 * Waveshare 7.5" display native resolution width
 */
export const EPAPER_DEFAULT_WIDTH = 800;

/**
 * Default e-paper display height in pixels
 * Waveshare 7.5" display native resolution height
 */
export const EPAPER_DEFAULT_HEIGHT = 480;

/**
 * Default SPI device path
 */
export const EPAPER_DEFAULT_SPI_DEVICE = "/dev/spidev0.0";

/**
 * Default GPIO pin for display reset
 * BCM pin numbering
 */
export const EPAPER_DEFAULT_PIN_RESET = 17;

/**
 * Default GPIO pin for Data/Command selection
 * BCM pin numbering
 */
export const EPAPER_DEFAULT_PIN_DC = 25;

/**
 * Default GPIO pin for busy status
 * BCM pin numbering
 */
export const EPAPER_DEFAULT_PIN_BUSY = 24;

/**
 * Default GPIO pin for chip select
 * BCM pin numbering
 */
export const EPAPER_DEFAULT_PIN_CS = 8;

/**
 * Default GPIO pin for power control
 * BCM pin numbering
 */
export const EPAPER_DEFAULT_PIN_POWER = 18;

/**
 * Default SPI bus number
 */
export const EPAPER_DEFAULT_SPI_BUS = 0;

/**
 * Default SPI device number
 */
export const EPAPER_DEFAULT_SPI_DEVICE_NUM = 0;

/**
 * Default SPI clock speed in Hz
 * 256kHz is safe for most e-paper displays
 */
export const EPAPER_DEFAULT_SPI_SPEED_HZ = 256000;

/**
 * Default display refresh mode
 * Full refresh clears ghosting but is slower
 */
export const EPAPER_DEFAULT_REFRESH_MODE = "full" as const;

/**
 * Default display rotation in degrees
 */
export const EPAPER_DEFAULT_ROTATION = 0 as const;

/**
 * Default display driver name
 * Waveshare 7.5" black/white is the primary supported display
 */
export const EPAPER_DEFAULT_DRIVER = "waveshare_7in5_bw";

// =============================================================================
// Web Server Configuration Defaults
// =============================================================================

/**
 * Default web server port
 */
export const WEB_DEFAULT_PORT = 3000;

/**
 * Default web server host
 * 0.0.0.0 binds to all network interfaces
 */
export const WEB_DEFAULT_HOST = "0.0.0.0";

/**
 * Default API base path
 */
export const WEB_DEFAULT_API_BASE_PATH = "/api";

/**
 * Default static files directory
 */
export const WEB_DEFAULT_STATIC_DIRECTORY = "./src/web/public";

/**
 * Default web authentication username
 */
export const WEB_DEFAULT_AUTH_USERNAME = "admin";

/**
 * Marker value indicating no password was configured.
 * When this value is used, a secure random password will be generated at startup.
 * The generated password will be logged once for the user to note.
 */
export const WEB_AUTH_PASSWORD_NOT_SET = "__NOT_SET__";

// =============================================================================
// WiFi Configuration Defaults
// =============================================================================

/**
 * Default WiFi access point SSID for device setup
 */
export const WIFI_DEFAULT_PRIMARY_SSID = "Papertrail-Setup";

/**
 * Marker value indicating no WiFi password was configured.
 * When this value is used, a secure random password will be generated at startup.
 * The generated password will be logged once and displayed on the e-paper onboarding screen.
 */
export const WIFI_PASSWORD_NOT_SET = "__NOT_SET__";

/**
 * Default WiFi scan interval in milliseconds
 * 30 seconds provides reasonable network discovery without excessive scanning
 */
export const WIFI_DEFAULT_SCAN_INTERVAL_MS = 30000;

/**
 * Default WiFi connection timeout in milliseconds
 * 60 seconds allows time for authentication and DHCP
 */
export const WIFI_DEFAULT_CONNECTION_TIMEOUT_MS = 60000;

// =============================================================================
// File Upload Configuration Defaults
// =============================================================================

/**
 * Default directory for temporary file uploads
 * Using app-controlled location instead of /tmp for better security
 */
export const UPLOAD_DEFAULT_TEMP_DIRECTORY = "./data/uploads";

/**
 * Maximum age of orphaned upload files in milliseconds
 * Files older than this will be cleaned up (default: 1 hour)
 */
export const UPLOAD_MAX_AGE_MS = 3600000; // 1 hour

/**
 * Interval for orphaned upload cleanup job in milliseconds
 * Runs every 15 minutes to clean up abandoned uploads
 */
export const UPLOAD_CLEANUP_INTERVAL_MS = 900000; // 15 minutes
