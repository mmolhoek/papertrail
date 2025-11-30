import { MockWiFiService } from "../MockWiFiService";
import { WiFiConfig } from "@core/types";

describe("MockWiFiService", () => {
  let wifiService: MockWiFiService;
  let config: WiFiConfig;

  beforeEach(() => {
    config = {
      enabled: true,
      primarySSID: "Papertrail-Setup",
      primaryPassword: "papertrail123",
      scanIntervalMs: 30000,
      connectionTimeoutMs: 60000,
    };

    wifiService = new MockWiFiService(config);
  });

  afterEach(async () => {
    await wifiService.dispose();
  });

  describe("initialize", () => {
    it("should initialize successfully", async () => {
      const result = await wifiService.initialize();

      expect(result.success).toBe(true);
    });
  });

  describe("scanNetworks", () => {
    it("should return list of networks including primary SSID", async () => {
      await wifiService.initialize();

      const result = await wifiService.scanNetworks();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBeGreaterThan(0);
        expect(result.data.some((n) => n.ssid === "Papertrail-Setup")).toBe(
          true,
        );
      }
    });

    it("should fail if not initialized", async () => {
      const result = await wifiService.scanNetworks();

      expect(result.success).toBe(false);
    });
  });

  describe("connect", () => {
    it("should connect to a network", async () => {
      await wifiService.initialize();

      const result = await wifiService.connect(
        "Papertrail-Setup",
        "papertrail123",
      );

      expect(result.success).toBe(true);

      const connectedResult = await wifiService.isConnected();
      expect(connectedResult.success).toBe(true);
      if (connectedResult.success) {
        expect(connectedResult.data).toBe(true);
      }
    });

    it("should notify connection change callback", async () => {
      await wifiService.initialize();

      const callback = jest.fn();
      wifiService.onConnectionChange(callback);

      await wifiService.connect("Papertrail-Setup", "papertrail123");

      expect(callback).toHaveBeenCalledWith(true);
    });
  });

  describe("disconnect", () => {
    it("should disconnect from network", async () => {
      await wifiService.initialize();
      await wifiService.connect("Papertrail-Setup", "papertrail123");

      const result = await wifiService.disconnect();

      expect(result.success).toBe(true);

      const connectedResult = await wifiService.isConnected();
      expect(connectedResult.success).toBe(true);
      if (connectedResult.success) {
        expect(connectedResult.data).toBe(false);
      }
    });

    it("should fail if not connected", async () => {
      await wifiService.initialize();

      const result = await wifiService.disconnect();

      expect(result.success).toBe(false);
    });
  });

  describe("saveNetwork", () => {
    it("should save network configuration", async () => {
      await wifiService.initialize();

      const result = await wifiService.saveNetwork({
        ssid: "Test-Network",
        password: "test123",
        priority: 10,
        autoConnect: true,
      });

      expect(result.success).toBe(true);

      const savedResult = await wifiService.getSavedNetworks();
      expect(savedResult.success).toBe(true);
      if (savedResult.success) {
        expect(savedResult.data.some((n) => n.ssid === "Test-Network")).toBe(
          true,
        );
      }
    });
  });

  describe("removeNetwork", () => {
    it("should remove saved network", async () => {
      await wifiService.initialize();

      await wifiService.saveNetwork({
        ssid: "Test-Network",
        password: "test123",
        priority: 10,
        autoConnect: true,
      });

      const result = await wifiService.removeNetwork("Test-Network");

      expect(result.success).toBe(true);

      const savedResult = await wifiService.getSavedNetworks();
      expect(savedResult.success).toBe(true);
      if (savedResult.success) {
        expect(savedResult.data.some((n) => n.ssid === "Test-Network")).toBe(
          false,
        );
      }
    });

    it("should fail if network not found", async () => {
      await wifiService.initialize();

      const result = await wifiService.removeNetwork("NonExistent-Network");

      expect(result.success).toBe(false);
    });
  });

  describe("getCurrentConnection", () => {
    it("should return null when not connected", async () => {
      await wifiService.initialize();

      const result = await wifiService.getCurrentConnection();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it("should return connection details when connected", async () => {
      await wifiService.initialize();
      await wifiService.connect("Papertrail-Setup", "papertrail123");

      const result = await wifiService.getCurrentConnection();

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.ssid).toBe("Papertrail-Setup");
        expect(result.data.ipAddress).toBeDefined();
        expect(result.data.macAddress).toBeDefined();
        expect(result.data.signalStrength).toBeGreaterThan(0);
      }
    });
  });

  describe("onConnectionChange", () => {
    it("should allow unsubscribing from callbacks", async () => {
      await wifiService.initialize();

      const callback = jest.fn();
      const unsubscribe = wifiService.onConnectionChange(callback);

      unsubscribe();

      await wifiService.connect("Papertrail-Setup", "papertrail123");

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
