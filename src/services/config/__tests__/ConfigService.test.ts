import { ConfigService } from "@services/config/ConfigService";
import { ScreenType } from "@core/types";
import * as fs from "fs/promises";

// Mock fs module
jest.mock("fs/promises");

const mockFs = fs as jest.Mocked<typeof fs>;

describe("ConfigService", () => {
  let configService: ConfigService;
  const testConfigPath = "./test-config.json";
  const testStatePath = "./test-state.json";

  beforeEach(() => {
    jest.clearAllMocks();
    configService = new ConfigService(testConfigPath, testStatePath);

    // Mock mkdir to always succeed
    mockFs.mkdir.mockResolvedValue(undefined);
  });

  describe("initialization", () => {
    it("should initialize with default config when files do not exist", async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT: no such file"));

      const result = await configService.initialize();

      expect(result.success).toBe(true);
    });

    it("should load config from file if it exists", async () => {
      const mockConfig = {
        version: "1.0.0",
        environment: "production",
        gps: {
          devicePath: "/dev/ttyUSB0",
          baudRate: 9600,
          updateInterval: 1000,
        },
        display: {
          width: 640,
          height: 384,
          spiDevice: "/dev/spidev0.0",
          pins: { reset: 17, dc: 25, busy: 24 },
          refreshMode: "full",
          rotation: 0,
        },
        rendering: {
          lineWidth: 2,
          pointRadius: 3,
          showPoints: true,
          showLine: true,
          highlightCurrentPosition: true,
          showDirection: false,
          antiAlias: false,
        },
        map: {
          gpxDirectory: "./gpx",
          maxFileSize: 1024,
          enableCache: true,
          defaultZoomLevel: 12,
          minZoomLevel: 1,
          maxZoomLevel: 18,
        },
        web: {
          port: 8080,
          host: "localhost",
          cors: false,
          apiBasePath: "/api",
          staticDirectory: "./public",
        },
        logging: {
          level: "debug",
          directory: "./logs",
          console: true,
          file: false,
          maxFileSize: 1024,
          maxFiles: 3,
        },
      };

      mockFs.readFile.mockImplementation((path) => {
        if (path === testConfigPath) {
          return Promise.resolve(JSON.stringify(mockConfig));
        }
        return Promise.reject(new Error("ENOENT"));
      });

      const result = await configService.initialize();

      expect(result.success).toBe(true);
      expect(configService.getConfig().environment).toBe("production");
      expect(configService.getDisplayWidth()).toBe(640);
    });

    it("should not reinitialize if already initialized", async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));

      await configService.initialize();
      const result = await configService.initialize();

      expect(result.success).toBe(true);
      expect(mockFs.readFile).toHaveBeenCalledTimes(2); // Only called during first init
    });
  });

  describe("display configuration", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should return display width", () => {
      expect(configService.getDisplayWidth()).toBe(800);
    });

    it("should return display height", () => {
      expect(configService.getDisplayHeight()).toBe(480);
    });
  });

  describe("zoom level management", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should return default zoom level", () => {
      expect(configService.getZoomLevel()).toBe(17);
    });

    it("should set zoom level", () => {
      configService.setZoomLevel(16);
      expect(configService.getZoomLevel()).toBe(16);
    });

    it("should clamp zoom level to minimum", () => {
      configService.setZoomLevel(0);
      expect(configService.getZoomLevel()).toBe(1);
    });

    it("should clamp zoom level to maximum", () => {
      configService.setZoomLevel(25);
      expect(configService.getZoomLevel()).toBe(20);
    });

    it("should return min zoom level", () => {
      expect(configService.getMinZoomLevel()).toBe(1);
    });

    it("should return max zoom level", () => {
      expect(configService.getMaxZoomLevel()).toBe(20);
    });
  });

  describe("active GPX path management", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should return null for no act[118;1:3uive GPX", () => {
      expect(configService.getActiveGPXPath()).toBeNull();
    });

    it("should set active GPX path", () => {
      configService.setActiveGPXPath("/path/to/track.gpx");
      expect(configService.getActiveGPXPath()).toBe("/path/to/track.gpx");
    });

    it("should add to recent files when setting active GPX", () => {
      configService.setActiveGPXPath("/path/to/track.gpx");
      expect(configService.getRecentFiles()).toContain("/path/to/track.gpx");
    });

    it("should clear active GPX path", () => {
      configService.setActiveGPXPath("/path/to/track.gpx");
      configService.setActiveGPXPath(null);
      expect(configService.getActiveGPXPath()).toBeNull();
    });
  });

  describe("GPS configuration", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should return GPS update interval", () => {
      expect(configService.getGPSUpdateInterval()).toBe(1000);
    });

    it("should set GPS update interval", () => {
      configService.setGPSUpdateInterval(2000);
      expect(configService.getGPSUpdateInterval()).toBe(2000);
    });

    it("should throw error for invalid update interval", () => {
      expect(() => configService.setGPSUpdateInterval(50)).toThrow();
    });
  });

  describe("rendering options", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should return render options", () => {
      const options = configService.getRenderOptions();
      expect(options).toHaveProperty("lineWidth");
      expect(options).toHaveProperty("pointRadius");
      expect(options.showPoints).toBe(true);
    });

    it("should update render options", () => {
      configService.updateRenderOptions({ lineWidth: 4, showPoints: false });
      const options = configService.getRenderOptions();
      expect(options.lineWidth).toBe(4);
      expect(options.showPoints).toBe(false);
    });
  });

  describe("display preferences", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should return auto center preference", () => {
      expect(configService.getAutoCenter()).toBe(true);
    });

    it("should set auto center preference", () => {
      configService.setAutoCenter(false);
      expect(configService.getAutoCenter()).toBe(false);
    });

    it("should return rotate with bearing preference", () => {
      expect(configService.getRotateWithBearing()).toBe(false);
    });

    it("should set rotate with bearing preference", () => {
      configService.setRotateWithBearing(true);
      expect(configService.getRotateWithBearing()).toBe(true);
    });

    it("should return auto refresh interval", () => {
      expect(configService.getAutoRefreshInterval()).toBe(30);
    });

    it("should set auto refresh interval", () => {
      configService.setAutoRefreshInterval(60);
      expect(configService.getAutoRefreshInterval()).toBe(60);
    });

    it("should throw error for negative refresh interval", () => {
      expect(() => configService.setAutoRefreshInterval(-1)).toThrow();
    });

    it("should return default routing profile as car", () => {
      expect(configService.getRoutingProfile()).toBe("car");
    });

    it("should set routing profile to bike", () => {
      configService.setRoutingProfile("bike");
      expect(configService.getRoutingProfile()).toBe("bike");
    });

    it("should set routing profile to foot", () => {
      configService.setRoutingProfile("foot");
      expect(configService.getRoutingProfile()).toBe("foot");
    });

    it("should persist routing profile across get/set cycles", () => {
      configService.setRoutingProfile("foot");
      configService.setRoutingProfile("bike");
      configService.setRoutingProfile("car");
      expect(configService.getRoutingProfile()).toBe("car");
    });
  });

  describe("recent files", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should return empty recent files initially", () => {
      expect(configService.getRecentFiles()).toEqual([]);
    });

    it("should add recent file", () => {
      configService.addRecentFile("/path/to/file1.gpx");
      expect(configService.getRecentFiles()).toContain("/path/to/file1.gpx");
    });

    it("should add recent file to beginning", () => {
      configService.addRecentFile("/path/to/file1.gpx");
      configService.addRecentFile("/path/to/file2.gpx");
      expect(configService.getRecentFiles()[0]).toBe("/path/to/file2.gpx");
    });

    it("should not duplicate recent files", () => {
      configService.addRecentFile("/path/to/file1.gpx");
      configService.addRecentFile("/path/to/file1.gpx");
      const files = configService.getRecentFiles();
      expect(files.filter((f) => f === "/path/to/file1.gpx").length).toBe(1);
    });

    it("should limit recent files to 10", () => {
      for (let i = 0; i < 15; i++) {
        configService.addRecentFile(`/path/to/file${i}.gpx`);
      }
      expect(configService.getRecentFiles().length).toBe(10);
    });

    it("should clear recent files", () => {
      configService.addRecentFile("/path/to/file1.gpx");
      configService.clearRecentFiles();
      expect(configService.getRecentFiles()).toEqual([]);
    });
  });

  describe("recent destinations", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should return empty recent destinations initially", () => {
      expect(configService.getRecentDestinations()).toEqual([]);
    });

    it("should add recent destination", () => {
      configService.addRecentDestination({
        name: "Test Location",
        latitude: 52.52,
        longitude: 13.405,
      });
      const destinations = configService.getRecentDestinations();
      expect(destinations.length).toBe(1);
      expect(destinations[0].name).toBe("Test Location");
      expect(destinations[0].latitude).toBe(52.52);
      expect(destinations[0].longitude).toBe(13.405);
    });

    it("should add usedAt timestamp to destination", () => {
      configService.addRecentDestination({
        name: "Test Location",
        latitude: 52.52,
        longitude: 13.405,
      });
      const destinations = configService.getRecentDestinations();
      expect(destinations[0].usedAt).toBeDefined();
      expect(new Date(destinations[0].usedAt).getTime()).not.toBeNaN();
    });

    it("should add recent destination to beginning", () => {
      configService.addRecentDestination({
        name: "Location 1",
        latitude: 52.52,
        longitude: 13.405,
      });
      configService.addRecentDestination({
        name: "Location 2",
        latitude: 48.8566,
        longitude: 2.3522,
      });
      expect(configService.getRecentDestinations()[0].name).toBe("Location 2");
    });

    it("should not duplicate recent destinations by coordinates", () => {
      configService.addRecentDestination({
        name: "Location 1",
        latitude: 52.52,
        longitude: 13.405,
      });
      configService.addRecentDestination({
        name: "Same Location Different Name",
        latitude: 52.52,
        longitude: 13.405,
      });
      const destinations = configService.getRecentDestinations();
      expect(destinations.length).toBe(1);
      expect(destinations[0].name).toBe("Same Location Different Name");
    });

    it("should limit recent destinations to 10", () => {
      for (let i = 0; i < 15; i++) {
        configService.addRecentDestination({
          name: `Location ${i}`,
          latitude: 50 + i,
          longitude: 10 + i,
        });
      }
      expect(configService.getRecentDestinations().length).toBe(10);
    });

    it("should remove recent destination by coordinates", () => {
      configService.addRecentDestination({
        name: "Location 1",
        latitude: 52.52,
        longitude: 13.405,
      });
      configService.addRecentDestination({
        name: "Location 2",
        latitude: 48.8566,
        longitude: 2.3522,
      });
      configService.removeRecentDestination(52.52, 13.405);
      const destinations = configService.getRecentDestinations();
      expect(destinations.length).toBe(1);
      expect(destinations[0].name).toBe("Location 2");
    });

    it("should clear recent destinations", () => {
      configService.addRecentDestination({
        name: "Test Location",
        latitude: 52.52,
        longitude: 13.405,
      });
      configService.clearRecentDestinations();
      expect(configService.getRecentDestinations()).toEqual([]);
    });

    it("should return a copy of recent destinations (immutability)", () => {
      configService.addRecentDestination({
        name: "Test Location",
        latitude: 52.52,
        longitude: 13.405,
      });
      const destinations1 = configService.getRecentDestinations();
      const destinations2 = configService.getRecentDestinations();
      expect(destinations1).not.toBe(destinations2);
      expect(destinations1).toEqual(destinations2);
    });
  });

  describe("persistence", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should save user state", async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      configService.setZoomLevel(15);
      const result = await configService.save();

      expect(result.success).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it("should handle save errors", async () => {
      mockFs.writeFile.mockRejectedValue(new Error("Write failed"));

      const result = await configService.save();

      expect(result.success).toBe(false);
    });

    it("should reload configuration", async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));

      const result = await configService.reload();

      expect(result.success).toBe(true);
    });

    it("should reset to defaults", async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      configService.setZoomLevel(18);
      const result = await configService.resetToDefaults();

      expect(result.success).toBe(true);
      expect(configService.getZoomLevel()).toBe(17);
    });
  });

  describe("import/export", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should export config as JSON", () => {
      const exported = configService.exportConfig();
      expect(() => JSON.parse(exported)).not.toThrow();
    });

    it("should import valid config JSON", () => {
      const exported = configService.exportConfig();
      const result = configService.importConfig(exported);
      expect(result.success).toBe(true);
    });

    it("should handle invalid JSON", () => {
      const result = configService.importConfig("invalid json");
      expect(result.success).toBe(false);
    });

    it("should import config with only config section", () => {
      const partialExport = JSON.stringify({ config: { version: "2.0.0" } });
      const result = configService.importConfig(partialExport);
      expect(result.success).toBe(true);
    });

    it("should import config with only userState section", () => {
      const partialExport = JSON.stringify({ userState: { zoomLevel: 15 } });
      const result = configService.importConfig(partialExport);
      expect(result.success).toBe(true);
    });
  });

  describe("getUserState", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should return current user state", () => {
      const state = configService.getUserState();
      expect(state).toHaveProperty("zoomLevel");
      expect(state).toHaveProperty("displayPreferences");
      expect(state).toHaveProperty("recentFiles");
    });
  });

  describe("speed limit preferences", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should return default showSpeedLimit as true", () => {
      expect(configService.getShowSpeedLimit()).toBe(true);
    });

    it("should set showSpeedLimit to false", () => {
      configService.setShowSpeedLimit(false);
      expect(configService.getShowSpeedLimit()).toBe(false);
    });

    it("should set showSpeedLimit back to true", () => {
      configService.setShowSpeedLimit(false);
      configService.setShowSpeedLimit(true);
      expect(configService.getShowSpeedLimit()).toBe(true);
    });
  });

  describe("speed unit preferences", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should return default speed unit as kmh", () => {
      expect(configService.getSpeedUnit()).toBe("kmh");
    });

    it("should set speed unit to mph", () => {
      configService.setSpeedUnit("mph");
      expect(configService.getSpeedUnit()).toBe("mph");
    });

    it("should set speed unit back to kmh", () => {
      configService.setSpeedUnit("mph");
      configService.setSpeedUnit("kmh");
      expect(configService.getSpeedUnit()).toBe("kmh");
    });
  });

  describe("location name preferences", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should return default showLocationName as true", () => {
      expect(configService.getShowLocationName()).toBe(true);
    });

    it("should set showLocationName to false", () => {
      configService.setShowLocationName(false);
      expect(configService.getShowLocationName()).toBe(false);
    });
  });

  describe("elevation preferences", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should return default showElevation as true", () => {
      expect(configService.getShowElevation()).toBe(true);
    });

    it("should set showElevation to false", () => {
      configService.setShowElevation(false);
      expect(configService.getShowElevation()).toBe(false);
    });
  });

  describe("roads layer preferences", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should return default showRoads as true", () => {
      expect(configService.getShowRoads()).toBe(true);
    });

    it("should set showRoads to false", () => {
      configService.setShowRoads(false);
      expect(configService.getShowRoads()).toBe(false);
    });
  });

  describe("POI categories", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should return default enabled POI categories", () => {
      const categories = configService.getEnabledPOICategories();
      expect(categories).toContain("fuel");
      expect(categories).toContain("charging");
      expect(categories).toContain("parking");
      expect(categories).toContain("food");
      expect(categories).toContain("restroom");
      expect(categories).toContain("viewpoint");
    });

    it("should set enabled POI categories", () => {
      configService.setEnabledPOICategories(["fuel", "parking"]);
      const categories = configService.getEnabledPOICategories();
      expect(categories).toEqual(["fuel", "parking"]);
    });

    it("should check if a POI category is enabled", () => {
      expect(configService.isPOICategoryEnabled("fuel")).toBe(true);
      configService.setEnabledPOICategories(["parking"]);
      expect(configService.isPOICategoryEnabled("fuel")).toBe(false);
      expect(configService.isPOICategoryEnabled("parking")).toBe(true);
    });

    it("should enable a specific POI category", () => {
      configService.setEnabledPOICategories(["fuel"]);
      configService.setPOICategoryEnabled("parking", true);
      expect(configService.isPOICategoryEnabled("fuel")).toBe(true);
      expect(configService.isPOICategoryEnabled("parking")).toBe(true);
    });

    it("should disable a specific POI category", () => {
      configService.setEnabledPOICategories(["fuel", "parking"]);
      configService.setPOICategoryEnabled("fuel", false);
      expect(configService.isPOICategoryEnabled("fuel")).toBe(false);
      expect(configService.isPOICategoryEnabled("parking")).toBe(true);
    });

    it("should not duplicate category when enabling already enabled", () => {
      configService.setEnabledPOICategories(["fuel", "parking"]);
      configService.setPOICategoryEnabled("fuel", true);
      const categories = configService.getEnabledPOICategories();
      expect(categories.filter((c) => c === "fuel").length).toBe(1);
    });

    it("should not error when disabling already disabled category", () => {
      configService.setEnabledPOICategories(["parking"]);
      configService.setPOICategoryEnabled("fuel", false);
      expect(configService.isPOICategoryEnabled("fuel")).toBe(false);
    });
  });

  describe("active screen", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should return default active screen as TRACK", () => {
      expect(configService.getActiveScreen()).toBe(ScreenType.TRACK);
    });

    it("should set active screen to TURN_BY_TURN", () => {
      configService.setActiveScreen(ScreenType.TURN_BY_TURN);
      expect(configService.getActiveScreen()).toBe(ScreenType.TURN_BY_TURN);
    });

    it("should set active screen back to TRACK", () => {
      configService.setActiveScreen(ScreenType.TURN_BY_TURN);
      configService.setActiveScreen(ScreenType.TRACK);
      expect(configService.getActiveScreen()).toBe(ScreenType.TRACK);
    });
  });

  describe("onboarding management", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should return onboarding not completed by default", () => {
      expect(configService.isOnboardingCompleted()).toBe(false);
    });

    it("should set onboarding as completed", () => {
      configService.setOnboardingCompleted(true);
      expect(configService.isOnboardingCompleted()).toBe(true);
    });

    it("should set onboarding as not completed", () => {
      configService.setOnboardingCompleted(true);
      configService.setOnboardingCompleted(false);
      expect(configService.isOnboardingCompleted()).toBe(false);
    });

    it("should set timestamp when onboarding is completed", () => {
      configService.setOnboardingCompleted(true);
      const state = configService.getUserState();
      expect(state.onboardingTimestamp).toBeDefined();
      expect(new Date(state.onboardingTimestamp!).getTime()).not.toBeNaN();
    });
  });

  describe("WiFi fallback network", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should return undefined for no fallback network configured", () => {
      expect(configService.getWiFiFallbackNetwork()).toBeUndefined();
    });

    it("should set WiFi fallback network", () => {
      const config = {
        ssid: "TestNetwork",
        savedAt: new Date().toISOString(),
      };
      configService.setWiFiFallbackNetwork(config);
      expect(configService.getWiFiFallbackNetwork()).toEqual(config);
    });

    it("should clear WiFi fallback network with null", () => {
      const config = {
        ssid: "TestNetwork",
        savedAt: new Date().toISOString(),
      };
      configService.setWiFiFallbackNetwork(config);
      configService.setWiFiFallbackNetwork(null);
      expect(configService.getWiFiFallbackNetwork()).toBeUndefined();
    });
  });

  describe("hotspot configuration", () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();
    });

    it("should return undefined for no hotspot config", () => {
      expect(configService.getHotspotConfig()).toBeUndefined();
    });

    it("should set hotspot configuration", () => {
      const config = {
        ssid: "PapertrailHotspot",
        password: "hotspot123",
        updatedAt: new Date().toISOString(),
      };
      configService.setHotspotConfig(config);
      expect(configService.getHotspotConfig()).toEqual(config);
    });

    it("should clear hotspot configuration with null", () => {
      const config = {
        ssid: "PapertrailHotspot",
        password: "hotspot123",
        updatedAt: new Date().toISOString(),
      };
      configService.setHotspotConfig(config);
      configService.setHotspotConfig(null);
      expect(configService.getHotspotConfig()).toBeUndefined();
    });
  });

  describe("backwards compatibility", () => {
    it("should handle missing recentDestinations in loaded state", async () => {
      const userState = {
        zoomLevel: 15,
        displayPreferences: {
          autoCenter: true,
          rotateWithBearing: false,
          brightness: 100,
          autoRefreshInterval: 30,
        },
        recentFiles: [],
        // recentDestinations is missing
      };

      mockFs.readFile.mockImplementation((path) => {
        if (path === testStatePath) {
          return Promise.resolve(JSON.stringify(userState));
        }
        return Promise.reject(new Error("ENOENT"));
      });

      await configService.initialize();

      // Should return empty array, not error
      const destinations = configService.getRecentDestinations();
      expect(destinations).toEqual([]);
    });

    it("should handle adding destination when recentDestinations is undefined", async () => {
      const userState = {
        zoomLevel: 15,
        displayPreferences: {},
        recentFiles: [],
      };

      mockFs.readFile.mockImplementation((path) => {
        if (path === testStatePath) {
          return Promise.resolve(JSON.stringify(userState));
        }
        return Promise.reject(new Error("ENOENT"));
      });

      await configService.initialize();

      // Should not throw
      configService.addRecentDestination({
        name: "New Destination",
        latitude: 51.5,
        longitude: -0.1,
      });

      expect(configService.getRecentDestinations().length).toBe(1);
    });

    it("should handle removeRecentDestination when recentDestinations is undefined", async () => {
      const userState = {
        zoomLevel: 15,
        displayPreferences: {},
        recentFiles: [],
      };

      mockFs.readFile.mockImplementation((path) => {
        if (path === testStatePath) {
          return Promise.resolve(JSON.stringify(userState));
        }
        return Promise.reject(new Error("ENOENT"));
      });

      await configService.initialize();

      // Should not throw
      configService.removeRecentDestination(51.5, -0.1);
    });

    it("should return default for undefined showSpeedLimit", async () => {
      const userState = {
        zoomLevel: 15,
        displayPreferences: {},
        recentFiles: [],
      };

      mockFs.readFile.mockImplementation((path) => {
        if (path === testStatePath) {
          return Promise.resolve(JSON.stringify(userState));
        }
        return Promise.reject(new Error("ENOENT"));
      });

      await configService.initialize();
      expect(configService.getShowSpeedLimit()).toBe(true);
    });

    it("should return default for undefined speedUnit", async () => {
      const userState = {
        zoomLevel: 15,
        displayPreferences: {},
        recentFiles: [],
      };

      mockFs.readFile.mockImplementation((path) => {
        if (path === testStatePath) {
          return Promise.resolve(JSON.stringify(userState));
        }
        return Promise.reject(new Error("ENOENT"));
      });

      await configService.initialize();
      expect(configService.getSpeedUnit()).toBe("kmh");
    });

    it("should return default for undefined showLocationName", async () => {
      const userState = {
        zoomLevel: 15,
        displayPreferences: {},
        recentFiles: [],
      };

      mockFs.readFile.mockImplementation((path) => {
        if (path === testStatePath) {
          return Promise.resolve(JSON.stringify(userState));
        }
        return Promise.reject(new Error("ENOENT"));
      });

      await configService.initialize();
      expect(configService.getShowLocationName()).toBe(true);
    });

    it("should return default for undefined showElevation", async () => {
      const userState = {
        zoomLevel: 15,
        displayPreferences: {},
        recentFiles: [],
      };

      mockFs.readFile.mockImplementation((path) => {
        if (path === testStatePath) {
          return Promise.resolve(JSON.stringify(userState));
        }
        return Promise.reject(new Error("ENOENT"));
      });

      await configService.initialize();
      expect(configService.getShowElevation()).toBe(true);
    });

    it("should return default for undefined showRoads", async () => {
      const userState = {
        zoomLevel: 15,
        displayPreferences: {},
        recentFiles: [],
      };

      mockFs.readFile.mockImplementation((path) => {
        if (path === testStatePath) {
          return Promise.resolve(JSON.stringify(userState));
        }
        return Promise.reject(new Error("ENOENT"));
      });

      await configService.initialize();
      expect(configService.getShowRoads()).toBe(true);
    });

    it("should return default for undefined routingProfile", async () => {
      const userState = {
        zoomLevel: 15,
        displayPreferences: {},
        recentFiles: [],
      };

      mockFs.readFile.mockImplementation((path) => {
        if (path === testStatePath) {
          return Promise.resolve(JSON.stringify(userState));
        }
        return Promise.reject(new Error("ENOENT"));
      });

      await configService.initialize();
      expect(configService.getRoutingProfile()).toBe("car");
    });

    it("should return default for undefined enabledPOICategories", async () => {
      const userState = {
        zoomLevel: 15,
        displayPreferences: {},
        recentFiles: [],
      };

      mockFs.readFile.mockImplementation((path) => {
        if (path === testStatePath) {
          return Promise.resolve(JSON.stringify(userState));
        }
        return Promise.reject(new Error("ENOENT"));
      });

      await configService.initialize();
      const categories = configService.getEnabledPOICategories();
      expect(categories.length).toBe(6);
    });

    it("should return default for undefined activeScreen", async () => {
      const userState = {
        zoomLevel: 15,
        displayPreferences: {},
        recentFiles: [],
      };

      mockFs.readFile.mockImplementation((path) => {
        if (path === testStatePath) {
          return Promise.resolve(JSON.stringify(userState));
        }
        return Promise.reject(new Error("ENOENT"));
      });

      await configService.initialize();
      expect(configService.getActiveScreen()).toBe(ScreenType.TRACK);
    });
  });

  describe("error handling edge cases", () => {
    it("should handle non-Error read failures in loadConfigFile", async () => {
      mockFs.readFile.mockImplementation((path) => {
        if (path === testConfigPath) {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return Promise.reject("string error");
        }
        return Promise.reject(new Error("ENOENT"));
      });

      const result = await configService.initialize();
      // Should still succeed with defaults
      expect(result.success).toBe(true);
    });

    it("should handle non-Error read failures in loadUserState", async () => {
      mockFs.readFile.mockImplementation((path) => {
        if (path === testStatePath) {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return Promise.reject("string error");
        }
        return Promise.reject(new Error("ENOENT"));
      });

      const result = await configService.initialize();
      // Should still succeed with defaults
      expect(result.success).toBe(true);
    });

    it("should handle non-Error write failures in save", async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();

      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      mockFs.writeFile.mockRejectedValue("string error");

      const result = await configService.save();
      expect(result.success).toBe(false);
    });

    it("should handle non-Error failures in reload", async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();

      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      mockFs.readFile.mockRejectedValue("string error");

      const result = await configService.reload();
      // Should still succeed (uses defaults)
      expect(result.success).toBe(true);
    });

    it("should handle non-Error JSON parse failures", async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();

      // Test with a non-Error being thrown
      const result = configService.importConfig("{{invalid");
      expect(result.success).toBe(false);
    });

    it("should handle read errors that are not ENOENT", async () => {
      mockFs.readFile.mockRejectedValue(new Error("Permission denied"));

      const result = await configService.initialize();
      // Initialize succeeds but logs error
      expect(result.success).toBe(true);
    });
  });

  describe("file loading", () => {
    it("should load user state from file when it exists", async () => {
      const mockUserState = {
        activeGPXPath: "/saved/track.gpx",
        zoomLevel: 14,
        onboardingCompleted: true,
        displayPreferences: {
          autoCenter: false,
          rotateWithBearing: true,
          brightness: 80,
          autoRefreshInterval: 60,
        },
        recentFiles: ["/file1.gpx", "/file2.gpx"],
        recentDestinations: [],
      };

      mockFs.readFile.mockImplementation((path) => {
        if (path === testStatePath) {
          return Promise.resolve(JSON.stringify(mockUserState));
        }
        return Promise.reject(new Error("ENOENT"));
      });

      await configService.initialize();

      expect(configService.getZoomLevel()).toBe(14);
      expect(configService.getActiveGPXPath()).toBe("/saved/track.gpx");
      expect(configService.getAutoCenter()).toBe(false);
      expect(configService.getRotateWithBearing()).toBe(true);
    });

    it("should reload config and state from files", async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      await configService.initialize();

      configService.setZoomLevel(10);
      expect(configService.getZoomLevel()).toBe(10);

      // Simulate file being updated
      const updatedState = {
        zoomLevel: 18,
        displayPreferences: {
          autoCenter: true,
          rotateWithBearing: false,
          brightness: 100,
          autoRefreshInterval: 30,
        },
        recentFiles: [],
      };

      mockFs.readFile.mockImplementation((path) => {
        if (path === testStatePath) {
          return Promise.resolve(JSON.stringify(updatedState));
        }
        return Promise.reject(new Error("ENOENT"));
      });

      await configService.reload();

      expect(configService.getZoomLevel()).toBe(18);
    });
  });
});
