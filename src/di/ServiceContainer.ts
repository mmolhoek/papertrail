import {
  IGPSService,
  IMapService,
  ISVGService,
  IEpaperService,
  IConfigService,
  IRenderingOrchestrator,
  IWiFiService,
  IOnboardingService,
} from "@core/interfaces";
import { WebConfig, GPSConfig, EpaperConfig, MapConfig, WiFiConfig } from "@core/types";
import { GPSService } from "../services/gps/GPSService";
// Import other services when they're implemented
import { MapService } from "../services/map/MapService";
import { SVGService } from "../services/svg/SVGService";
import { ConfigService } from "../services/config/ConfigService";
import { RenderingOrchestrator } from "../services/orchestrator/RenderingOrchestrator";
import { EpaperService } from "../services/epaper/EPaperService";
import { WiFiService } from "../services/wifi/WiFiService";
import { MockWiFiService } from "../services/wifi/MockWiFiService";
import { OnboardingService } from "../services/onboarding/OnboardingService";

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
    onboarding?: IOnboardingService;
  } = {};

  private constructor() {}

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
    }
  }

  // Factory methods for production

  /**
   * Get GPS Service
   */
  getGPSService(): IGPSService {
    if (!this.services.gps) {
      const config = this.getGPSConfig();
      this.services.gps = new GPSService(config);
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
   * Get E-paper Service
   */
  getEpaperService(): IEpaperService {
    if (!this.services.epaper) {
      const config = this.getEpaperConfig();
      this.services.epaper = new EpaperService(config);
    }
    return this.services.epaper;
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
      // Use mock service on non-Linux systems
      if (process.platform !== 'linux') {
        this.services.wifi = new MockWiFiService(config);
      } else {
        this.services.wifi = new WiFiService(config);
      }
    }
    return this.services.wifi;
  }

  /**
   * Get Onboarding Service
   */
  getOnboardingService(): IOnboardingService {
    if (!this.services.onboarding) {
      this.services.onboarding = new OnboardingService(
        this.getConfigService(),
        this.getWiFiService(),
        this.getEpaperService(),
      );
    }
    return this.services.onboarding;
  }

  // Configuration getters

  /**
   * Get GPS configuration
   */
  getGPSConfig(): GPSConfig {
    return {
      devicePath: process.env.GPS_DEVICE_PATH || "/dev/ttyAMA0",
      baudRate: parseInt(process.env.GPS_BAUD_RATE || "9600"),
      updateInterval: parseInt(process.env.GPS_UPDATE_INTERVAL || "1000"),
      minAccuracy: parseInt(process.env.GPS_MIN_ACCURACY || "10"),
    };
  }

  /**
   * Get Map configuration
   */
  getMapConfig(): MapConfig {
    return {
      gpxDirectory: process.env.GPX_DIRECTORY || "./data/gpx-files",
      maxFileSize: parseInt(process.env.GPX_MAX_FILE_SIZE || "10485760"), // 10MB
      enableCache: process.env.GPX_ENABLE_CACHE !== "false",
      cacheDirectory: process.env.GPX_CACHE_DIRECTORY || "./data/cache",
      defaultZoomLevel: parseInt(process.env.DEFAULT_ZOOM || "14"),
      minZoomLevel: parseInt(process.env.MIN_ZOOM || "1"),
      maxZoomLevel: parseInt(process.env.MAX_ZOOM || "20"),
    };
  }

  /**
   * Get E-paper configuration
   */
  getEpaperConfig(): EpaperConfig {
    return {
      width: parseInt(process.env.EPAPER_WIDTH || "800"),
      height: parseInt(process.env.EPAPER_HEIGHT || "480"),
      spiDevice: process.env.EPAPER_SPI_DEVICE || "/dev/spidev0.0",
      pins: {
        reset: parseInt(process.env.EPAPER_PIN_RESET || "17"),
        dc: parseInt(process.env.EPAPER_PIN_DC || "25"),
        busy: parseInt(process.env.EPAPER_PIN_BUSY || "24"),
        cs: parseInt(process.env.EPAPER_PIN_CS || "8"),
      },
      refreshMode:
        (process.env.EPAPER_REFRESH_MODE as "full" | "partial") || "full",
      rotation: parseInt(process.env.EPAPER_ROTATION || "0") as
        | 0
        | 90
        | 180
        | 270,
    };
  }

  /**
   * Get Web configuration
   */
  getWebConfig(): WebConfig {
    return {
      port: parseInt(process.env.WEB_PORT || "3000"),
      host: process.env.WEB_HOST || "0.0.0.0",
      cors: process.env.WEB_CORS !== "false",
      apiBasePath: process.env.WEB_API_BASE || "/api",
      staticDirectory: process.env.WEB_STATIC_DIR || "./src/web/public",
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
              username: process.env.WEB_AUTH_USERNAME || "admin",
              password: process.env.WEB_AUTH_PASSWORD || "papertrail",
            }
          : undefined,
    };
  }

  /**
   * Get WiFi configuration
   */
  getWiFiConfig(): WiFiConfig {
    return {
      enabled: process.env.WIFI_ENABLED !== 'false',
      primarySSID: process.env.WIFI_PRIMARY_SSID || 'Papertrail-Setup',
      primaryPassword: process.env.WIFI_PRIMARY_PASSWORD || 'papertrail123',
      scanIntervalMs: parseInt(process.env.WIFI_SCAN_INTERVAL_MS || '30000'),
      connectionTimeoutMs: parseInt(process.env.WIFI_CONNECTION_TIMEOUT_MS || '60000'),
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
   * Set Onboarding Service (for testing)
   */
  setOnboardingService(service: IOnboardingService): void {
    this.services.onboarding = service;
  }
}
