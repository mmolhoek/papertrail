import {
  IGPSService,
  IMapService,
  ISVGService,
  IEpaperService,
  IConfigService,
  IRenderingOrchestrator,
  IWiFiService,
  ITextRendererService,
  ITrackSimulationService,
  IDriveNavigationService,
  ISpeedLimitService,
  IPOIService,
  IReverseGeocodingService,
  IElevationService,
  IVectorMapService,
  IDisplayService,
  IDisplayDriver,
  IEpaperDriver,
  IHardwareAdapter,
} from "@core/interfaces";
import {
  WebConfig,
  GPSConfig,
  GPSDebounceConfig,
  EpaperConfig,
  MapConfig,
  WiFiConfig,
} from "@core/types";
import {
  GPS_DEFAULT_DEVICE_PATH,
  GPS_DEFAULT_BAUD_RATE,
  GPS_DEFAULT_UPDATE_INTERVAL_MS,
  GPS_DEFAULT_MIN_ACCURACY_METERS,
  GPS_DEFAULT_DEBOUNCE_MS,
  GPS_DEFAULT_DISTANCE_THRESHOLD_METERS,
  MAP_DEFAULT_GPX_DIRECTORY,
  MAP_DEFAULT_MAX_FILE_SIZE_BYTES,
  MAP_DEFAULT_CACHE_DIRECTORY,
  MAP_DEFAULT_ZOOM_LEVEL,
  MAP_MIN_ZOOM_LEVEL,
  MAP_MAX_ZOOM_LEVEL,
  EPAPER_DEFAULT_WIDTH,
  EPAPER_DEFAULT_HEIGHT,
  EPAPER_DEFAULT_SPI_DEVICE,
  EPAPER_DEFAULT_PIN_RESET,
  EPAPER_DEFAULT_PIN_DC,
  EPAPER_DEFAULT_PIN_BUSY,
  EPAPER_DEFAULT_PIN_CS,
  EPAPER_DEFAULT_PIN_POWER,
  EPAPER_DEFAULT_SPI_BUS,
  EPAPER_DEFAULT_SPI_DEVICE_NUM,
  EPAPER_DEFAULT_SPI_SPEED_HZ,
  EPAPER_DEFAULT_REFRESH_MODE,
  EPAPER_DEFAULT_ROTATION,
  EPAPER_DEFAULT_DRIVER,
  WEB_DEFAULT_PORT,
  WEB_DEFAULT_HOST,
  WEB_DEFAULT_API_BASE_PATH,
  WEB_DEFAULT_STATIC_DIRECTORY,
  WEB_DEFAULT_AUTH_USERNAME,
  WEB_AUTH_PASSWORD_NOT_SET,
  WIFI_DEFAULT_PRIMARY_SSID,
  WIFI_PASSWORD_NOT_SET,
  WIFI_DEFAULT_SCAN_INTERVAL_MS,
  WIFI_DEFAULT_CONNECTION_TIMEOUT_MS,
} from "@core/constants";
import {
  generateSecurePassword,
  isInsecureDefaultPassword,
} from "@utils/crypto";
// Mock services - safe to import (no hardware dependencies)
import { MockGPSService } from "@services/gps/MockGPSService";
import { MockEpaperService } from "@services/epaper/MockEpaperService";
import { MockWiFiService } from "@services/wifi/MockWiFiService";
import { MockAdapter } from "@services/epaper/adapters/MockAdapter";
import { MockDisplayDriver } from "@services/epaper/drivers/MockDisplayDriver";

// Non-hardware services - safe to import
import { MapService } from "@services/map/MapService";
import { SVGService } from "@services/svg/SVGService";
import { ConfigService } from "@services/config/ConfigService";
import { RenderingOrchestrator } from "@services/orchestrator/RenderingOrchestrator";
import { TextRendererService } from "@services/textRenderer/TextRendererService";
import { TrackSimulationService } from "@services/simulation/TrackSimulationService";
import { DriveNavigationService } from "@services/drive/DriveNavigationService";
import { SpeedLimitService } from "@services/speedLimit/SpeedLimitService";
import { POIService } from "@services/poi/POIService";
import { ReverseGeocodingService } from "@services/reverseGeocoding/ReverseGeocodingService";
import { ElevationService } from "@services/elevation/ElevationService";
import { VectorMapService } from "@services/vectorMap/VectorMapService";

// Hardware services use lazy imports to avoid loading native modules on non-Linux platforms
// These are imported dynamically only when needed

/**
 * Display driver factory function type
 */
type DriverFactory = (config: EpaperConfig) => IDisplayDriver;

/**
 * Service Container (Dependency Injection Container)
 *
 * Singleton that manages service instances and their dependencies.
 * Provides factory methods for production and test setters for mocking.
 */
export class ServiceContainer {
  private static instance: ServiceContainer;

  private services: {
    gps?: IGPSService;
    map?: IMapService;
    svg?: ISVGService;
    epaper?: IEpaperService;
    config?: IConfigService;
    orchestrator?: IRenderingOrchestrator;
    wifi?: IWiFiService;
    textRenderer?: ITextRendererService;
    simulation?: ITrackSimulationService;
    driveNavigation?: IDriveNavigationService;
    speedLimit?: ISpeedLimitService;
    poi?: IPOIService;
    reverseGeocoding?: IReverseGeocodingService;
    elevation?: IElevationService;
    vectorMap?: IVectorMapService;
  } = {};

  /**
   * Cache for generated passwords (persists across config calls within same instance)
   */
  private generatedPasswords: {
    webAuth?: string;
    wifiAp?: string;
  } = {};

  /**
   * Track whether passwords were auto-generated (for startup warnings)
   */
  private passwordWarnings: {
    webAuthGenerated: boolean;
    wifiApGenerated: boolean;
    webAuthInsecure: boolean;
    wifiApInsecure: boolean;
  } = {
    webAuthGenerated: false,
    wifiApGenerated: false,
    webAuthInsecure: false,
    wifiApInsecure: false,
  };

  /**
   * Registry of display driver factories
   * Key: driver name (e.g., 'waveshare_7in5_bw')
   * Value: factory function that creates the driver
   */
  private driverFactories: Map<string, DriverFactory> = new Map();

  private constructor() {
    // Register default drivers
    this.registerDefaultDrivers();
  }

  /**
   * Register the default display drivers
   */
  private registerDefaultDrivers(): void {
    // Register mock driver (always available)
    this.registerDisplayDriver(
      "mock_display",
      (config) => new MockDisplayDriver(config.width, config.height),
    );

    // Register Waveshare 7.5" B/W driver (lazy loaded to avoid lgpio on non-Linux)
    this.registerDisplayDriver("waveshare_7in5_bw", (_config) => {
      // Lazy import to avoid loading on non-Linux platforms
      const { Waveshare7in5BWDriver } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("@services/epaper/drivers/Waveshare7in5BWDriver") as typeof import("@services/epaper/drivers/Waveshare7in5BWDriver");
      return new Waveshare7in5BWDriver();
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }

  /**
   * Reset the container (useful for testing)
   */
  static reset(): void {
    if (ServiceContainer.instance) {
      ServiceContainer.instance.services = {};
      ServiceContainer.instance.generatedPasswords = {};
      ServiceContainer.instance.passwordWarnings = {
        webAuthGenerated: false,
        wifiApGenerated: false,
        webAuthInsecure: false,
        wifiApInsecure: false,
      };
      ServiceContainer.instance.driverFactories.clear();
      ServiceContainer.instance.registerDefaultDrivers();
    }
  }

  // Factory methods for production

  /**
   * Get GPS Service
   * Automatically uses mock service on non-Linux platforms or when USE_MOCK_GPS=true
   */
  getGPSService(): IGPSService {
    if (!this.services.gps) {
      const config = this.getGPSConfig();
      // Use mock service on non-Linux systems or when explicitly enabled
      if (process.env.USE_MOCK_GPS === "true" || process.platform !== "linux") {
        this.services.gps = new MockGPSService(config);
      } else {
        // Lazy import to avoid loading serialport on non-Linux platforms
        const { GPSService } =
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require("@services/gps/GPSService") as typeof import("@services/gps/GPSService");
        this.services.gps = new GPSService(config);
      }
    }
    return this.services.gps;
  }

  /**
   * Get Map Service
   */
  getMapService(): IMapService {
    if (!this.services.map) {
      const config = this.getMapConfig();
      this.services.map = new MapService(config);
    }
    return this.services.map;
  }

  /**
   * Get SVG Service
   */
  getSVGService(): ISVGService {
    if (!this.services.svg) {
      this.services.svg = new SVGService();
    }
    return this.services.svg;
  }

  /**
   * Get Display Service (generic interface)
   * Returns the display service as IDisplayService for generic display operations.
   * For e-paper specific operations (sleep/wake), use getEpaperService() instead.
   */
  getDisplayService(): IDisplayService {
    return this.getEpaperService();
  }

  /**
   * Get E-paper Service
   * Automatically uses mock service on non-Linux platforms or when USE_MOCK_EPAPER=true
   */
  getEpaperService(): IEpaperService {
    if (!this.services.epaper) {
      const config = this.getEpaperConfig();
      // Use mock service on non-Linux systems or when explicitly enabled
      if (
        process.env.USE_MOCK_EPAPER === "true" ||
        process.platform !== "linux"
      ) {
        this.services.epaper = new MockEpaperService(config);
      } else {
        // Create driver and adapter for real hardware
        const driverName = config.driver || "waveshare_7in5_bw";
        const driver = this.createDisplayDriver(
          driverName,
          config,
        ) as IEpaperDriver;
        const adapter = this.createHardwareAdapter();

        // Lazy import to avoid loading lgpio on non-Linux platforms
        const { EpaperService } =
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require("@services/epaper/EPaperService") as typeof import("@services/epaper/EPaperService");
        this.services.epaper = new EpaperService(config, driver, adapter);
      }
    }
    return this.services.epaper;
  }

  // Display Driver Management

  /**
   * Register a display driver factory
   * @param name Driver identifier (e.g., 'waveshare_7in5_bw')
   * @param factory Function that creates the driver instance
   */
  registerDisplayDriver(name: string, factory: DriverFactory): void {
    this.driverFactories.set(name, factory);
  }

  /**
   * Get list of registered driver names
   */
  getRegisteredDrivers(): string[] {
    return Array.from(this.driverFactories.keys());
  }

  /**
   * Create a display driver by name
   * @param name Driver identifier
   * @param config E-paper configuration
   * @returns Display driver instance
   * @throws Error if driver not found
   */
  createDisplayDriver(name: string, config: EpaperConfig): IDisplayDriver {
    const factory = this.driverFactories.get(name);
    if (!factory) {
      const available = this.getRegisteredDrivers().join(", ");
      throw new Error(
        `Unknown display driver: '${name}'. Available drivers: ${available}`,
      );
    }
    return factory(config);
  }

  /**
   * Create a hardware adapter for the current platform
   * Returns LgpioAdapter for Linux, MockAdapter for other platforms
   */
  createHardwareAdapter(): IHardwareAdapter {
    if (process.platform !== "linux") {
      return new MockAdapter();
    }

    // Lazy import to avoid loading lgpio on non-Linux platforms
    const { LgpioAdapter } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@services/epaper/adapters/LgpioAdapter") as typeof import("@services/epaper/adapters/LgpioAdapter");
    return new LgpioAdapter();
  }

  /**
   * Get Config Service
   */
  getConfigService(): IConfigService {
    if (!this.services.config) {
      this.services.config = new ConfigService();
    }
    return this.services.config;
  }

  /**
   * Get Rendering Orchestrator
   */
  getRenderingOrchestrator(): IRenderingOrchestrator {
    if (!this.services.orchestrator) {
      this.services.orchestrator = new RenderingOrchestrator(
        this.getGPSService(),
        this.getMapService(),
        this.getSVGService(),
        this.getEpaperService(),
        this.getConfigService(),
        this.getWiFiService(),
        this.getTextRendererService(),
        this.getTrackSimulationService(),
        this.getDriveNavigationService(),
        this.getSpeedLimitService(),
        this.getPOIService(),
        this.getReverseGeocodingService(),
        this.getElevationService(),
        this.getVectorMapService(),
        this.getGPSDebounceConfig(),
      );
    }
    return this.services.orchestrator;
  }

  /**
   * Get WiFi Service
   * Automatically uses mock service on non-Linux platforms
   */
  getWiFiService(): IWiFiService {
    if (!this.services.wifi) {
      const config = this.getWiFiConfig();
      const configService = this.getConfigService();
      // Use mock service on non-Linux systems
      if (process.platform !== "linux") {
        this.services.wifi = new MockWiFiService(config, configService);
      } else {
        // Lazy import to avoid loading nmcli dependencies on non-Linux platforms
        const { WiFiService } =
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require("@services/wifi/WiFiService") as typeof import("@services/wifi/WiFiService");
        this.services.wifi = new WiFiService(config, configService);
      }
    }
    return this.services.wifi;
  }

  /**
   * Get Text Renderer Service
   */
  getTextRendererService(): ITextRendererService {
    if (!this.services.textRenderer) {
      this.services.textRenderer = new TextRendererService();
    }
    return this.services.textRenderer;
  }

  /**
   * Get Track Simulation Service
   */
  getTrackSimulationService(): ITrackSimulationService {
    if (!this.services.simulation) {
      this.services.simulation = new TrackSimulationService();
    }
    return this.services.simulation;
  }

  /**
   * Get Drive Navigation Service
   */
  getDriveNavigationService(): IDriveNavigationService {
    if (!this.services.driveNavigation) {
      this.services.driveNavigation = new DriveNavigationService();
    }
    return this.services.driveNavigation;
  }

  /**
   * Get Speed Limit Service
   */
  getSpeedLimitService(): ISpeedLimitService {
    if (!this.services.speedLimit) {
      this.services.speedLimit = new SpeedLimitService();
    }
    return this.services.speedLimit;
  }

  /**
   * Get POI Service
   */
  getPOIService(): IPOIService {
    if (!this.services.poi) {
      this.services.poi = new POIService();
    }
    return this.services.poi;
  }

  /**
   * Get Reverse Geocoding Service
   */
  getReverseGeocodingService(): IReverseGeocodingService {
    if (!this.services.reverseGeocoding) {
      this.services.reverseGeocoding = new ReverseGeocodingService();
    }
    return this.services.reverseGeocoding;
  }

  /**
   * Get Elevation Service
   */
  getElevationService(): IElevationService {
    if (!this.services.elevation) {
      this.services.elevation = new ElevationService();
    }
    return this.services.elevation;
  }

  /**
   * Get Vector Map Service
   */
  getVectorMapService(): IVectorMapService {
    if (!this.services.vectorMap) {
      this.services.vectorMap = new VectorMapService();
    }
    return this.services.vectorMap;
  }

  // Configuration getters

  /**
   * Get GPS configuration
   */
  getGPSConfig(): GPSConfig {
    return {
      devicePath: process.env.GPS_DEVICE_PATH || GPS_DEFAULT_DEVICE_PATH,
      baudRate: parseInt(
        process.env.GPS_BAUD_RATE || String(GPS_DEFAULT_BAUD_RATE),
      ),
      updateInterval: parseInt(
        process.env.GPS_UPDATE_INTERVAL ||
          String(GPS_DEFAULT_UPDATE_INTERVAL_MS),
      ),
      minAccuracy: parseInt(
        process.env.GPS_MIN_ACCURACY || String(GPS_DEFAULT_MIN_ACCURACY_METERS),
      ),
    };
  }

  /**
   * Get Map configuration
   */
  getMapConfig(): MapConfig {
    return {
      gpxDirectory: process.env.GPX_DIRECTORY || MAP_DEFAULT_GPX_DIRECTORY,
      maxFileSize: parseInt(
        process.env.GPX_MAX_FILE_SIZE ||
          String(MAP_DEFAULT_MAX_FILE_SIZE_BYTES),
      ),
      enableCache: process.env.GPX_ENABLE_CACHE !== "false",
      cacheDirectory:
        process.env.GPX_CACHE_DIRECTORY || MAP_DEFAULT_CACHE_DIRECTORY,
      defaultZoomLevel: parseInt(
        process.env.DEFAULT_ZOOM || String(MAP_DEFAULT_ZOOM_LEVEL),
      ),
      minZoomLevel: parseInt(
        process.env.MIN_ZOOM || String(MAP_MIN_ZOOM_LEVEL),
      ),
      maxZoomLevel: parseInt(
        process.env.MAX_ZOOM || String(MAP_MAX_ZOOM_LEVEL),
      ),
    };
  }

  /**
   * Get E-paper configuration
   */
  getEpaperConfig(): EpaperConfig {
    return {
      width: parseInt(process.env.EPAPER_WIDTH || String(EPAPER_DEFAULT_WIDTH)),
      height: parseInt(
        process.env.EPAPER_HEIGHT || String(EPAPER_DEFAULT_HEIGHT),
      ),
      spiDevice: process.env.EPAPER_SPI_DEVICE || EPAPER_DEFAULT_SPI_DEVICE,
      pins: {
        reset: parseInt(
          process.env.EPAPER_PIN_RESET || String(EPAPER_DEFAULT_PIN_RESET),
        ),
        dc: parseInt(
          process.env.EPAPER_PIN_DC || String(EPAPER_DEFAULT_PIN_DC),
        ),
        busy: parseInt(
          process.env.EPAPER_PIN_BUSY || String(EPAPER_DEFAULT_PIN_BUSY),
        ),
        cs: parseInt(
          process.env.EPAPER_PIN_CS || String(EPAPER_DEFAULT_PIN_CS),
        ),
        power: process.env.EPAPER_PIN_POWER
          ? parseInt(process.env.EPAPER_PIN_POWER)
          : EPAPER_DEFAULT_PIN_POWER,
      },
      spi: {
        bus: parseInt(
          process.env.EPAPER_SPI_BUS || String(EPAPER_DEFAULT_SPI_BUS),
        ),
        device: parseInt(
          process.env.EPAPER_SPI_DEVICE_NUM ||
            String(EPAPER_DEFAULT_SPI_DEVICE_NUM),
        ),
        speed: parseInt(
          process.env.EPAPER_SPI_SPEED || String(EPAPER_DEFAULT_SPI_SPEED_HZ),
        ),
      },
      refreshMode:
        (process.env.EPAPER_REFRESH_MODE as "full" | "partial") ||
        EPAPER_DEFAULT_REFRESH_MODE,
      rotation: (parseInt(
        process.env.EPAPER_ROTATION || String(EPAPER_DEFAULT_ROTATION),
      ) || EPAPER_DEFAULT_ROTATION) as 0 | 90 | 180 | 270,
      driver: process.env.EPAPER_DRIVER || EPAPER_DEFAULT_DRIVER,
      model: process.env.EPAPER_MODEL,
    };
  }

  /**
   * Get Web configuration
   */
  getWebConfig(): WebConfig {
    // Determine password for web auth
    let webAuthPassword: string | undefined;
    if (process.env.WEB_AUTH_ENABLED === "true") {
      const envPassword = process.env.WEB_AUTH_PASSWORD;
      if (envPassword && envPassword !== WEB_AUTH_PASSWORD_NOT_SET) {
        // User provided a password via env var
        webAuthPassword = envPassword;
        // Check if it's an insecure default
        if (isInsecureDefaultPassword(envPassword)) {
          this.passwordWarnings.webAuthInsecure = true;
        }
      } else {
        // No password provided - generate a secure one
        if (!this.generatedPasswords.webAuth) {
          this.generatedPasswords.webAuth = generateSecurePassword();
          this.passwordWarnings.webAuthGenerated = true;
        }
        webAuthPassword = this.generatedPasswords.webAuth;
      }
    }

    // Parse CORS origins from environment variable
    // Format: comma-separated list (e.g., "http://localhost:3000,http://192.168.1.100:3000")
    let corsOrigins: string[] | undefined;
    const corsOriginsEnv = process.env.WEB_CORS_ORIGINS;
    if (corsOriginsEnv) {
      corsOrigins = corsOriginsEnv
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);
      // If empty after filtering, set to undefined
      if (corsOrigins.length === 0) {
        corsOrigins = undefined;
      }
    }

    return {
      port: parseInt(process.env.WEB_PORT || String(WEB_DEFAULT_PORT)),
      host: process.env.WEB_HOST || WEB_DEFAULT_HOST,
      cors: process.env.WEB_CORS !== "false",
      corsOrigins,
      apiBasePath: process.env.WEB_API_BASE || WEB_DEFAULT_API_BASE_PATH,
      staticDirectory:
        process.env.WEB_STATIC_DIR || WEB_DEFAULT_STATIC_DIRECTORY,
      websocket: {
        enabled: process.env.WEB_WEBSOCKET !== "false",
        port: process.env.WEB_WEBSOCKET_PORT
          ? parseInt(process.env.WEB_WEBSOCKET_PORT)
          : undefined,
      },
      auth:
        process.env.WEB_AUTH_ENABLED === "true"
          ? {
              enabled: true,
              username:
                process.env.WEB_AUTH_USERNAME || WEB_DEFAULT_AUTH_USERNAME,
              password: webAuthPassword!,
            }
          : undefined,
    };
  }

  /**
   * Get WiFi configuration
   */
  getWiFiConfig(): WiFiConfig {
    // Determine password for WiFi AP
    let wifiPassword: string;
    const envPassword = process.env.WIFI_PRIMARY_PASSWORD;
    if (envPassword && envPassword !== WIFI_PASSWORD_NOT_SET) {
      // User provided a password via env var
      wifiPassword = envPassword;
      // Check if it's an insecure default
      if (isInsecureDefaultPassword(envPassword)) {
        this.passwordWarnings.wifiApInsecure = true;
      }
    } else {
      // No password provided - generate a secure one
      if (!this.generatedPasswords.wifiAp) {
        this.generatedPasswords.wifiAp = generateSecurePassword(12); // 12 chars for WiFi (easier to type)
        this.passwordWarnings.wifiApGenerated = true;
      }
      wifiPassword = this.generatedPasswords.wifiAp;
    }

    return {
      enabled: process.env.WIFI_ENABLED !== "false",
      primarySSID: process.env.WIFI_PRIMARY_SSID || WIFI_DEFAULT_PRIMARY_SSID,
      primaryPassword: wifiPassword,
      scanIntervalMs: parseInt(
        process.env.WIFI_SCAN_INTERVAL_MS ||
          String(WIFI_DEFAULT_SCAN_INTERVAL_MS),
      ),
      connectionTimeoutMs: parseInt(
        process.env.WIFI_CONNECTION_TIMEOUT_MS ||
          String(WIFI_DEFAULT_CONNECTION_TIMEOUT_MS),
      ),
    };
  }

  /**
   * Get GPS debounce configuration for callback throttling.
   *
   * Debouncing prevents excessive display updates from high-frequency GPS data.
   * Updates are suppressed unless:
   * - Time since last notification exceeds debounceMs, OR
   * - Distance moved exceeds distanceThresholdMeters
   */
  getGPSDebounceConfig(): GPSDebounceConfig {
    return {
      enabled: process.env.GPS_DEBOUNCE_ENABLED !== "false",
      debounceMs: parseInt(
        process.env.GPS_DEBOUNCE_MS || String(GPS_DEFAULT_DEBOUNCE_MS),
      ),
      distanceThresholdMeters: parseInt(
        process.env.GPS_DISTANCE_THRESHOLD_METERS ||
          String(GPS_DEFAULT_DISTANCE_THRESHOLD_METERS),
      ),
    };
  }

  // Test setters (for dependency injection in tests)

  /**
   * Set GPS Service (for testing)
   */
  setGPSService(service: IGPSService): void {
    this.services.gps = service;
  }

  /**
   * Set Map Service (for testing)
   */
  setMapService(service: IMapService): void {
    this.services.map = service;
  }

  /**
   * Set SVG Service (for testing)
   */
  setSVGService(service: ISVGService): void {
    this.services.svg = service;
  }

  /**
   * Set E-paper Service (for testing)
   */
  setEpaperService(service: IEpaperService): void {
    this.services.epaper = service;
  }

  /**
   * Set Config Service (for testing)
   */
  setConfigService(service: IConfigService): void {
    this.services.config = service;
  }

  /**
   * Set Rendering Orchestrator (for testing)
   */
  setRenderingOrchestrator(service: IRenderingOrchestrator): void {
    this.services.orchestrator = service;
  }

  /**
   * Set WiFi Service (for testing)
   */
  setWiFiService(service: IWiFiService): void {
    this.services.wifi = service;
  }

  /**
   * Set Text Renderer Service (for testing)
   */
  setTextRendererService(service: ITextRendererService): void {
    this.services.textRenderer = service;
  }

  /**
   * Set Track Simulation Service (for testing)
   */
  setTrackSimulationService(service: ITrackSimulationService): void {
    this.services.simulation = service;
  }

  /**
   * Set Drive Navigation Service (for testing)
   */
  setDriveNavigationService(service: IDriveNavigationService): void {
    this.services.driveNavigation = service;
  }

  /**
   * Set Speed Limit Service (for testing)
   */
  setSpeedLimitService(service: ISpeedLimitService): void {
    this.services.speedLimit = service;
  }

  /**
   * Set POI Service (for testing)
   */
  setPOIService(service: IPOIService): void {
    this.services.poi = service;
  }

  /**
   * Set Reverse Geocoding Service (for testing)
   */
  setReverseGeocodingService(service: IReverseGeocodingService): void {
    this.services.reverseGeocoding = service;
  }

  /**
   * Set Elevation Service (for testing)
   */
  setElevationService(service: IElevationService): void {
    this.services.elevation = service;
  }

  /**
   * Set Vector Map Service (for testing)
   */
  setVectorMapService(service: IVectorMapService): void {
    this.services.vectorMap = service;
  }

  // Security/Credential helpers

  /**
   * Get security warnings about credentials.
   * Call this after getWebConfig() and getWiFiConfig() have been invoked.
   *
   * @returns Object containing warning flags and generated passwords
   */
  getCredentialSecurityInfo(): {
    warnings: {
      webAuthGenerated: boolean;
      wifiApGenerated: boolean;
      webAuthInsecure: boolean;
      wifiApInsecure: boolean;
    };
    generatedPasswords: {
      webAuth?: string;
      wifiAp?: string;
    };
  } {
    return {
      warnings: { ...this.passwordWarnings },
      generatedPasswords: { ...this.generatedPasswords },
    };
  }

  /**
   * Check if there are any security warnings that should be displayed at startup.
   * Call this after getWebConfig() and getWiFiConfig() have been invoked.
   *
   * @returns true if there are warnings to display
   */
  hasSecurityWarnings(): boolean {
    return (
      this.passwordWarnings.webAuthGenerated ||
      this.passwordWarnings.wifiApGenerated ||
      this.passwordWarnings.webAuthInsecure ||
      this.passwordWarnings.wifiApInsecure
    );
  }
}
