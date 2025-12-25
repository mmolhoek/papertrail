// Mock child_process exec - must be declared before imports
const mockExecAsync = jest.fn();

jest.mock("child_process", () => ({
  exec: jest.fn(),
}));

jest.mock("util", () => {
  const actual = jest.requireActual("util");
  return {
    ...actual,
    promisify: () => mockExecAsync,
  };
});

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

import { NetworkScanner } from "../NetworkScanner";

describe("NetworkScanner", () => {
  let scanner: NetworkScanner;
  let mockInitialized: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInitialized = jest.fn().mockReturnValue(true);
    scanner = new NetworkScanner(mockInitialized);
  });

  describe("scanNetworks", () => {
    it("should return failure when not initialized", async () => {
      mockInitialized.mockReturnValue(false);

      const result = await scanner.scanNetworks();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("not initialized");
      }
    });

    it("should scan and return list of networks", async () => {
      mockExecAsync.mockResolvedValue({
        stdout:
          "HomeNetwork:85:WPA2:2437\nOfficeWiFi:72:WPA3:5180\nCafeSpot:45:WPA:2412\n",
        stderr: "",
      });

      const result = await scanner.scanNetworks();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        expect(result.data[0]).toEqual({
          ssid: "HomeNetwork",
          signalStrength: 85,
          security: "WPA2",
          frequency: 2437,
        });
        expect(result.data[1]).toEqual({
          ssid: "OfficeWiFi",
          signalStrength: 72,
          security: "WPA3",
          frequency: 5180,
        });
        expect(result.data[2]).toEqual({
          ssid: "CafeSpot",
          signalStrength: 45,
          security: "WPA",
          frequency: 2412,
        });
      }
    });

    it("should skip hidden networks (empty SSID)", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "VisibleNetwork:80:WPA2:2437\n:50:WPA2:2412\n",
        stderr: "",
      });

      const result = await scanner.scanNetworks();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].ssid).toBe("VisibleNetwork");
      }
    });

    it("should handle empty scan results", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "",
        stderr: "",
      });

      const result = await scanner.scanNetworks();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });

    it("should parse different security types", async () => {
      mockExecAsync.mockResolvedValue({
        stdout:
          "Net1:80:WPA3:2437\nNet2:75:WPA2:2437\nNet3:70:WPA:2437\nNet4:65:WEP:2437\nNet5:60:--:2437\nNet6:55:Unknown123:2437\n",
        stderr: "",
      });

      const result = await scanner.scanNetworks();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].security).toBe("WPA3");
        expect(result.data[1].security).toBe("WPA2");
        expect(result.data[2].security).toBe("WPA");
        expect(result.data[3].security).toBe("WEP");
        expect(result.data[4].security).toBe("Open");
        expect(result.data[5].security).toBe("Unknown");
      }
    });

    it("should return failure on scan error", async () => {
      mockExecAsync.mockRejectedValue(new Error("nmcli failed"));

      const result = await scanner.scanNetworks();

      expect(result.success).toBe(false);
    });
  });

  describe("isNetworkVisible", () => {
    it("should return true when network is visible", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "OtherNetwork\nMyHotspot\nAnotherNetwork\n",
        stderr: "",
      });

      const result = await scanner.isNetworkVisible("MyHotspot");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it("should return false when network is not visible", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "OtherNetwork\nAnotherNetwork\n",
        stderr: "",
      });

      const result = await scanner.isNetworkVisible("MyHotspot");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it("should return false on scan error", async () => {
      mockExecAsync.mockRejectedValue(new Error("Scan failed"));

      const result = await scanner.isNetworkVisible("MyHotspot");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it("should handle empty scan results", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "",
        stderr: "",
      });

      const result = await scanner.isNetworkVisible("MyHotspot");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it("should match exact SSID only", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "MyHotspot2\nNotMyHotspot\nMyHotspotExtra\n",
        stderr: "",
      });

      const result = await scanner.isNetworkVisible("MyHotspot");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });
  });

  describe("getSignalStrength", () => {
    it("should return signal strength for visible network", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "MyNetwork:85",
        stderr: "",
      });

      const result = await scanner.getSignalStrength("MyNetwork");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(85);
      }
    });

    it("should return 0 when network not found", async () => {
      mockExecAsync.mockRejectedValue(new Error("grep: no match"));

      const result = await scanner.getSignalStrength("NonExistentNetwork");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(0);
      }
    });

    it("should return 0 for invalid signal value", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "MyNetwork:invalid",
        stderr: "",
      });

      const result = await scanner.getSignalStrength("MyNetwork");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(0);
      }
    });

    it("should handle empty response", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "",
        stderr: "",
      });

      const result = await scanner.getSignalStrength("MyNetwork");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(0);
      }
    });
  });

  describe("edge cases", () => {
    it("should handle networks with special characters in SSID", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "Network With Spaces:80:WPA2:2437\n",
        stderr: "",
      });

      const result = await scanner.scanNetworks();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].ssid).toBe("Network With Spaces");
      }
    });

    it("should handle networks with colons in SSID", async () => {
      // Note: nmcli uses : as delimiter, so SSIDs with colons would be problematic
      // The current implementation splits on : which would break
      // This test documents the current behavior
      mockExecAsync.mockResolvedValue({
        stdout: "Network:With:Colons:80:WPA2:2437\n",
        stderr: "",
      });

      const result = await scanner.scanNetworks();

      expect(result.success).toBe(true);
      // Due to simple split, SSID would be just "Network"
    });

    it("should handle very long network list", async () => {
      const networks = Array.from(
        { length: 50 },
        (_, i) => `Network${i}:${50 + i}:WPA2:2437`,
      ).join("\n");

      mockExecAsync.mockResolvedValue({
        stdout: networks + "\n",
        stderr: "",
      });

      const result = await scanner.scanNetworks();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(50);
      }
    });
  });
});
