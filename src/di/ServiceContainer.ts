import {
  IGPSService,
  IMapService,
  ISVGService,
  IEpaperService,
  IConfigService,
  IRenderingOrchestrator,
  IWiFiService,
  ITextRendererService,
} from "@core/interfaces";
import {
  WebConfig,
  GPSConfig,
  EpaperConfig,
  MapConfig,
  WiFiConfig,
} from "@core/types";
// Mock services - safe to import (no hardware dependencies)
import { MockGPSService } from "@services/gps/MockGPSService";
import { MockEpaperService } from "@services/epaper/MockEpaperService";
import { MockWiFiService } from "@services/wifi/MockWiFiService";

// Non-hardware services - safe to import
import { MapService } from "@services/map/MapService";
import { SVGService } from "@services/svg/SVGService";
import { ConfigService } from "@services/config/ConfigService";
import { RenderingOrchestrator } from "@services/orchestrator/RenderingOrchestrator";
import { TextRendererService } from "@services/textRenderer/TextRendererService";

// Hardware services use lazy imports to avoid loading native modules on non-Linux platforms
// These are imported dynamically only when needed

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
        // Lazy import to avoid loading lgpio on non-Linux platforms
        const { EpaperService } =
          require("@services/epaper/EPaperService") as typeof import("@services/epaper/EPaperService");
        this.services.epaper = new EpaperService(config);
      }
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
        this.getWiFiService(),
        this.getTextRendererService(),
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
      enabled: process.env.WIFI_ENABLED !== "false",
      primarySSID: process.env.WIFI_PRIMARY_SSID || "Papertrail-Setup",
      primaryPassword: process.env.WIFI_PRIMARY_PASSWORD || "papertrail123",
      scanIntervalMs: parseInt(process.env.WIFI_SCAN_INTERVAL_MS || "30000"),
      connectionTimeoutMs: parseInt(
        process.env.WIFI_CONNECTION_TIMEOUT_MS || "60000",
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
}
