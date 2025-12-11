import { ConfigService } from "@services/config/ConfigService";
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
  });
});
