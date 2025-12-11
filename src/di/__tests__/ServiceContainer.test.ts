import { ServiceContainer } from "@di/ServiceContainer";

describe("ServiceContainer", () => {
  beforeEach(() => {
    // Reset the container before each test
    ServiceContainer.reset();
    // Clear environment variables that might affect tests
    delete process.env.USE_MOCK_GPS;
    delete process.env.USE_MOCK_EPAPER;
    delete process.env.GPS_DEVICE_PATH;
    delete process.env.GPS_BAUD_RATE;
    delete process.env.GPS_UPDATE_INTERVAL;
    delete process.env.GPS_MIN_ACCURACY;
    delete process.env.GPX_DIRECTORY;
    delete process.env.GPX_MAX_FILE_SIZE;
    delete process.env.GPX_ENABLE_CACHE;
    delete process.env.GPX_CACHE_DIRECTORY;
    delete process.env.DEFAULT_ZOOM;
    delete process.env.MIN_ZOOM;
    delete process.env.MAX_ZOOM;
    delete process.env.EPAPER_WIDTH;
    delete process.env.EPAPER_HEIGHT;
    delete process.env.EPAPER_SPI_DEVICE;
    delete process.env.EPAPER_PIN_RESET;
    delete process.env.EPAPER_PIN_DC;
    delete process.env.EPAPER_PIN_BUSY;
    delete process.env.EPAPER_PIN_CS;
    delete process.env.EPAPER_REFRESH_MODE;
    delete process.env.EPAPER_ROTATION;
    delete process.env.WEB_PORT;
    delete process.env.WEB_HOST;
    delete process.env.WEB_CORS;
    delete process.env.WEB_API_BASE;
    delete process.env.WEB_STATIC_DIR;
    delete process.env.WEB_WEBSOCKET;
    delete process.env.WEB_WEBSOCKET_PORT;
    delete process.env.WEB_AUTH_ENABLED;
    delete process.env.WEB_AUTH_USERNAME;
    delete process.env.WEB_AUTH_PASSWORD;
    delete process.env.WIFI_ENABLED;
    delete process.env.WIFI_PRIMARY_SSID;
    delete process.env.WIFI_PRIMARY_PASSWORD;
    delete process.env.WIFI_SCAN_INTERVAL_MS;
    delete process.env.WIFI_CONNECTION_TIMEOUT_MS;
  });

  afterEach(() => {
    ServiceContainer.reset();
  });

  describe("Singleton pattern", () => {
    it("should return the same instance", () => {
      const instance1 = ServiceContainer.getInstance();
      const instance2 = ServiceContainer.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should reset the services when reset is called", () => {
      const container = ServiceContainer.getInstance();
      // Get a service to populate the internal services object
      const mapService1 = container.getMapService();
      // Reset and get again
      ServiceContainer.reset();
      const mapService2 = container.getMapService();
      // They should be different instances after reset
      expect(mapService1).not.toBe(mapService2);
    });
  });

  describe("Service getters", () => {
    it("should return a GPS service (mock on non-Linux)", () => {
      const container = ServiceContainer.getInstance();
      const gpsService = container.getGPSService();
      expect(gpsService).toBeDefined();
      expect(typeof gpsService.initialize).toBe("function");
      expect(typeof gpsService.getCurrentPosition).toBe("function");
    });

    it("should return the same GPS service instance on repeated calls", () => {
      const container = ServiceContainer.getInstance();
      const gps1 = container.getGPSService();
      const gps2 = container.getGPSService();
      expect(gps1).toBe(gps2);
    });

    it("should use mock GPS when USE_MOCK_GPS=true", () => {
      process.env.USE_MOCK_GPS = "true";
      const container = ServiceContainer.getInstance();
      const gpsService = container.getGPSService();
      expect(gpsService).toBeDefined();
    });

    it("should return a Map service", () => {
      const container = ServiceContainer.getInstance();
      const mapService = container.getMapService();
      expect(mapService).toBeDefined();
      expect(typeof mapService.loadGPXFile).toBe("function");
    });

    it("should return the same Map service instance on repeated calls", () => {
      const container = ServiceContainer.getInstance();
      const map1 = container.getMapService();
      const map2 = container.getMapService();
      expect(map1).toBe(map2);
    });

    it("should return a SVG service", () => {
      const container = ServiceContainer.getInstance();
      const svgService = container.getSVGService();
      expect(svgService).toBeDefined();
      expect(typeof svgService.renderViewport).toBe("function");
    });

    it("should return the same SVG service instance on repeated calls", () => {
      const container = ServiceContainer.getInstance();
      const svg1 = container.getSVGService();
      const svg2 = container.getSVGService();
      expect(svg1).toBe(svg2);
    });

    it("should return an Epaper service (mock on non-Linux)", () => {
      const container = ServiceContainer.getInstance();
      const epaperService = container.getEpaperService();
      expect(epaperService).toBeDefined();
      expect(typeof epaperService.initialize).toBe("function");
      expect(typeof epaperService.displayBitmap).toBe("function");
    });

    it("should return the same Epaper service instance on repeated calls", () => {
      const container = ServiceContainer.getInstance();
      const epaper1 = container.getEpaperService();
      const epaper2 = container.getEpaperService();
      expect(epaper1).toBe(epaper2);
    });

    it("should use mock Epaper when USE_MOCK_EPAPER=true", () => {
      process.env.USE_MOCK_EPAPER = "true";
      const container = ServiceContainer.getInstance();
      const epaperService = container.getEpaperService();
      expect(epaperService).toBeDefined();
    });

    it("should return a Config service", () => {
      const container = ServiceContainer.getInstance();
      const configService = container.getConfigService();
      expect(configService).toBeDefined();
      expect(typeof configService.initialize).toBe("function");
      expect(typeof configService.getZoomLevel).toBe("function");
    });

    it("should return the same Config service instance on repeated calls", () => {
      const container = ServiceContainer.getInstance();
      const config1 = container.getConfigService();
      const config2 = container.getConfigService();
      expect(config1).toBe(config2);
    });

    it("should return a WiFi service (mock on non-Linux)", () => {
      const container = ServiceContainer.getInstance();
      const wifiService = container.getWiFiService();
      expect(wifiService).toBeDefined();
      expect(typeof wifiService.initialize).toBe("function");
      expect(typeof wifiService.scanNetworks).toBe("function");
    });

    it("should return the same WiFi service instance on repeated calls", () => {
      const container = ServiceContainer.getInstance();
      const wifi1 = container.getWiFiService();
      const wifi2 = container.getWiFiService();
      expect(wifi1).toBe(wifi2);
    });

    it("should return a Text Renderer service", () => {
      const container = ServiceContainer.getInstance();
      const textRenderer = container.getTextRendererService();
      expect(textRenderer).toBeDefined();
      expect(typeof textRenderer.initialize).toBe("function");
    });

    it("should return the same Text Renderer service instance on repeated calls", () => {
      const container = ServiceContainer.getInstance();
      const text1 = container.getTextRendererService();
      const text2 = container.getTextRendererService();
      expect(text1).toBe(text2);
    });

    it("should return a Track Simulation service", () => {
      const container = ServiceContainer.getInstance();
      const simService = container.getTrackSimulationService();
      expect(simService).toBeDefined();
      expect(typeof simService.initialize).toBe("function");
      expect(typeof simService.startSimulation).toBe("function");
    });

    it("should return the same Track Simulation service instance on repeated calls", () => {
      const container = ServiceContainer.getInstance();
      const sim1 = container.getTrackSimulationService();
      const sim2 = container.getTrackSimulationService();
      expect(sim1).toBe(sim2);
    });

    it("should return a Drive Navigation service", () => {
      const container = ServiceContainer.getInstance();
      const driveService = container.getDriveNavigationService();
      expect(driveService).toBeDefined();
      expect(typeof driveService.initialize).toBe("function");
    });

    it("should return the same Drive Navigation service instance on repeated calls", () => {
      const container = ServiceContainer.getInstance();
      const drive1 = container.getDriveNavigationService();
      const drive2 = container.getDriveNavigationService();
      expect(drive1).toBe(drive2);
    });

    it("should return a Rendering Orchestrator", () => {
      const container = ServiceContainer.getInstance();
      const orchestrator = container.getRenderingOrchestrator();
      expect(orchestrator).toBeDefined();
      expect(typeof orchestrator.initialize).toBe("function");
      expect(typeof orchestrator.updateDisplay).toBe("function");
    });

    it("should return the same Rendering Orchestrator instance on repeated calls", () => {
      const container = ServiceContainer.getInstance();
      const orch1 = container.getRenderingOrchestrator();
      const orch2 = container.getRenderingOrchestrator();
      expect(orch1).toBe(orch2);
    });
  });

  describe("Service setters", () => {
    it("should allow setting GPS service", () => {
      const container = ServiceContainer.getInstance();
      const mockGPS = {
        initialize: jest.fn(),
        getCurrentPosition: jest.fn(),
        getStatus: jest.fn(),
        startTracking: jest.fn(),
        stopTracking: jest.fn(),
        isTracking: jest.fn(),
        waitForFix: jest.fn(),
        onPositionUpdate: jest.fn(),
        onStatusChange: jest.fn(),
        dispose: jest.fn(),
      };
      container.setGPSService(mockGPS as any);
      expect(container.getGPSService()).toBe(mockGPS);
    });

    it("should allow setting Map service", () => {
      const container = ServiceContainer.getInstance();
      const mockMap = { loadGPXFile: jest.fn() };
      container.setMapService(mockMap as any);
      expect(container.getMapService()).toBe(mockMap);
    });

    it("should allow setting SVG service", () => {
      const container = ServiceContainer.getInstance();
      const mockSVG = { renderViewport: jest.fn() };
      container.setSVGService(mockSVG as any);
      expect(container.getSVGService()).toBe(mockSVG);
    });

    it("should allow setting Epaper service", () => {
      const container = ServiceContainer.getInstance();
      const mockEpaper = { displayBitmap: jest.fn() };
      container.setEpaperService(mockEpaper as any);
      expect(container.getEpaperService()).toBe(mockEpaper);
    });

    it("should allow setting Config service", () => {
      const container = ServiceContainer.getInstance();
      const mockConfig = { getZoomLevel: jest.fn() };
      container.setConfigService(mockConfig as any);
      expect(container.getConfigService()).toBe(mockConfig);
    });

    it("should allow setting Rendering Orchestrator", () => {
      const container = ServiceContainer.getInstance();
      const mockOrch = { updateDisplay: jest.fn() };
      container.setRenderingOrchestrator(mockOrch as any);
      expect(container.getRenderingOrchestrator()).toBe(mockOrch);
    });

    it("should allow setting WiFi service", () => {
      const container = ServiceContainer.getInstance();
      const mockWiFi = { scanNetworks: jest.fn() };
      container.setWiFiService(mockWiFi as any);
      expect(container.getWiFiService()).toBe(mockWiFi);
    });

    it("should allow setting Text Renderer service", () => {
      const container = ServiceContainer.getInstance();
      const mockTextRenderer = { initialize: jest.fn() };
      container.setTextRendererService(mockTextRenderer as any);
      expect(container.getTextRendererService()).toBe(mockTextRenderer);
    });

    it("should allow setting Track Simulation service", () => {
      const container = ServiceContainer.getInstance();
      const mockSim = { startSimulation: jest.fn() };
      container.setTrackSimulationService(mockSim as any);
      expect(container.getTrackSimulationService()).toBe(mockSim);
    });

    it("should allow setting Drive Navigation service", () => {
      const container = ServiceContainer.getInstance();
      const mockDrive = { initialize: jest.fn() };
      container.setDriveNavigationService(mockDrive as any);
      expect(container.getDriveNavigationService()).toBe(mockDrive);
    });
  });

  describe("Configuration getters", () => {
    describe("getGPSConfig", () => {
      it("should return default GPS configuration", () => {
        const container = ServiceContainer.getInstance();
        const config = container.getGPSConfig();
        expect(config.devicePath).toBe("/dev/ttyAMA0");
        expect(config.baudRate).toBe(9600);
        expect(config.updateInterval).toBe(1000);
        expect(config.minAccuracy).toBe(10);
      });

      it("should use environment variables when set", () => {
        process.env.GPS_DEVICE_PATH = "/dev/custom";
        process.env.GPS_BAUD_RATE = "115200";
        process.env.GPS_UPDATE_INTERVAL = "2000";
        process.env.GPS_MIN_ACCURACY = "5";
        const container = ServiceContainer.getInstance();
        const config = container.getGPSConfig();
        expect(config.devicePath).toBe("/dev/custom");
        expect(config.baudRate).toBe(115200);
        expect(config.updateInterval).toBe(2000);
        expect(config.minAccuracy).toBe(5);
      });
    });

    describe("getMapConfig", () => {
      it("should return default Map configuration", () => {
        const container = ServiceContainer.getInstance();
        const config = container.getMapConfig();
        expect(config.gpxDirectory).toBe("./data/gpx-files");
        expect(config.maxFileSize).toBe(10485760);
        expect(config.enableCache).toBe(true);
        expect(config.cacheDirectory).toBe("./data/cache");
        expect(config.defaultZoomLevel).toBe(14);
        expect(config.minZoomLevel).toBe(1);
        expect(config.maxZoomLevel).toBe(20);
      });

      it("should use environment variables when set", () => {
        process.env.GPX_DIRECTORY = "/custom/gpx";
        process.env.GPX_MAX_FILE_SIZE = "5000000";
        process.env.GPX_ENABLE_CACHE = "false";
        process.env.GPX_CACHE_DIRECTORY = "/custom/cache";
        process.env.DEFAULT_ZOOM = "10";
        process.env.MIN_ZOOM = "5";
        process.env.MAX_ZOOM = "18";
        const container = ServiceContainer.getInstance();
        const config = container.getMapConfig();
        expect(config.gpxDirectory).toBe("/custom/gpx");
        expect(config.maxFileSize).toBe(5000000);
        expect(config.enableCache).toBe(false);
        expect(config.cacheDirectory).toBe("/custom/cache");
        expect(config.defaultZoomLevel).toBe(10);
        expect(config.minZoomLevel).toBe(5);
        expect(config.maxZoomLevel).toBe(18);
      });
    });

    describe("getEpaperConfig", () => {
      it("should return default Epaper configuration", () => {
        const container = ServiceContainer.getInstance();
        const config = container.getEpaperConfig();
        expect(config.width).toBe(800);
        expect(config.height).toBe(480);
        expect(config.spiDevice).toBe("/dev/spidev0.0");
        expect(config.pins.reset).toBe(17);
        expect(config.pins.dc).toBe(25);
        expect(config.pins.busy).toBe(24);
        expect(config.pins.cs).toBe(8);
        expect(config.refreshMode).toBe("full");
        expect(config.rotation).toBe(0);
      });

      it("should use environment variables when set", () => {
        process.env.EPAPER_WIDTH = "1024";
        process.env.EPAPER_HEIGHT = "768";
        process.env.EPAPER_SPI_DEVICE = "/dev/spidev1.0";
        process.env.EPAPER_PIN_RESET = "22";
        process.env.EPAPER_PIN_DC = "23";
        process.env.EPAPER_PIN_BUSY = "26";
        process.env.EPAPER_PIN_CS = "10";
        process.env.EPAPER_REFRESH_MODE = "partial";
        process.env.EPAPER_ROTATION = "90";
        const container = ServiceContainer.getInstance();
        const config = container.getEpaperConfig();
        expect(config.width).toBe(1024);
        expect(config.height).toBe(768);
        expect(config.spiDevice).toBe("/dev/spidev1.0");
        expect(config.pins.reset).toBe(22);
        expect(config.pins.dc).toBe(23);
        expect(config.pins.busy).toBe(26);
        expect(config.pins.cs).toBe(10);
        expect(config.refreshMode).toBe("partial");
        expect(config.rotation).toBe(90);
      });
    });

    describe("getWebConfig", () => {
      it("should return default Web configuration", () => {
        const container = ServiceContainer.getInstance();
        const config = container.getWebConfig();
        expect(config.port).toBe(3000);
        expect(config.host).toBe("0.0.0.0");
        expect(config.cors).toBe(true);
        expect(config.apiBasePath).toBe("/api");
        expect(config.staticDirectory).toBe("./src/web/public");
        expect(config.websocket?.enabled).toBe(true);
        expect(config.auth).toBeUndefined();
      });

      it("should use environment variables when set", () => {
        process.env.WEB_PORT = "8080";
        process.env.WEB_HOST = "127.0.0.1";
        process.env.WEB_CORS = "false";
        process.env.WEB_API_BASE = "/v1";
        process.env.WEB_STATIC_DIR = "/custom/public";
        process.env.WEB_WEBSOCKET = "false";
        process.env.WEB_WEBSOCKET_PORT = "3001";
        const container = ServiceContainer.getInstance();
        const config = container.getWebConfig();
        expect(config.port).toBe(8080);
        expect(config.host).toBe("127.0.0.1");
        expect(config.cors).toBe(false);
        expect(config.apiBasePath).toBe("/v1");
        expect(config.staticDirectory).toBe("/custom/public");
        expect(config.websocket?.enabled).toBe(false);
        expect(config.websocket?.port).toBe(3001);
      });

      it("should include auth config when WEB_AUTH_ENABLED=true", () => {
        process.env.WEB_AUTH_ENABLED = "true";
        process.env.WEB_AUTH_USERNAME = "testuser";
        process.env.WEB_AUTH_PASSWORD = "testpass";
        const container = ServiceContainer.getInstance();
        const config = container.getWebConfig();
        expect(config.auth).toBeDefined();
        expect(config.auth?.enabled).toBe(true);
        expect(config.auth?.username).toBe("testuser");
        expect(config.auth?.password).toBe("testpass");
      });

      it("should use default auth credentials when not specified", () => {
        process.env.WEB_AUTH_ENABLED = "true";
        const container = ServiceContainer.getInstance();
        const config = container.getWebConfig();
        expect(config.auth?.username).toBe("admin");
        expect(config.auth?.password).toBe("papertrail");
      });
    });

    describe("getWiFiConfig", () => {
      it("should return default WiFi configuration", () => {
        const container = ServiceContainer.getInstance();
        const config = container.getWiFiConfig();
        expect(config.enabled).toBe(true);
        expect(config.primarySSID).toBe("Papertrail-Setup");
        expect(config.primaryPassword).toBe("papertrail123");
        expect(config.scanIntervalMs).toBe(30000);
        expect(config.connectionTimeoutMs).toBe(60000);
      });

      it("should use environment variables when set", () => {
        process.env.WIFI_ENABLED = "false";
        process.env.WIFI_PRIMARY_SSID = "MyHotspot";
        process.env.WIFI_PRIMARY_PASSWORD = "mypassword";
        process.env.WIFI_SCAN_INTERVAL_MS = "10000";
        process.env.WIFI_CONNECTION_TIMEOUT_MS = "30000";
        const container = ServiceContainer.getInstance();
        const config = container.getWiFiConfig();
        expect(config.enabled).toBe(false);
        expect(config.primarySSID).toBe("MyHotspot");
        expect(config.primaryPassword).toBe("mypassword");
        expect(config.scanIntervalMs).toBe(10000);
        expect(config.connectionTimeoutMs).toBe(30000);
      });
    });
  });
});
