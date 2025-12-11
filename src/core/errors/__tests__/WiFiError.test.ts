import { WiFiError, WiFiErrorCode } from "@errors/WiFiError";

describe("WiFiError", () => {
  describe("constructor", () => {
    it("should create error with message and code", () => {
      const error = new WiFiError("Test error", WiFiErrorCode.UNKNOWN);
      expect(error.message).toBe("Test error");
      expect(error.code).toBe(WiFiErrorCode.UNKNOWN);
      expect(error.recoverable).toBe(false);
    });

    it("should create error with all parameters", () => {
      const error = new WiFiError(
        "Test error",
        WiFiErrorCode.CONNECTION_FAILED,
        true,
        { ssid: "TestNetwork" },
      );
      expect(error.message).toBe("Test error");
      expect(error.code).toBe(WiFiErrorCode.CONNECTION_FAILED);
      expect(error.recoverable).toBe(true);
    });
  });

  describe("static factory methods", () => {
    it("scanFailed should create error with original error", () => {
      const original = new Error("Device not found");
      const error = WiFiError.scanFailed(original);

      expect(error.message).toContain("Device not found");
      expect(error.code).toBe(WiFiErrorCode.SCAN_FAILED);
      expect(error.recoverable).toBe(true);
    });

    it("connectionFailed should create error with SSID and original error", () => {
      const original = new Error("Connection refused");
      const error = WiFiError.connectionFailed("MyNetwork", original);

      expect(error.message).toContain("MyNetwork");
      expect(error.message).toContain("Connection refused");
      expect(error.code).toBe(WiFiErrorCode.CONNECTION_FAILED);
      expect(error.recoverable).toBe(true);
    });

    it("authFailed should create error with SSID", () => {
      const error = WiFiError.authFailed("SecureNetwork");

      expect(error.message).toContain("SecureNetwork");
      expect(error.message).toContain("Authentication failed");
      expect(error.code).toBe(WiFiErrorCode.AUTH_FAILED);
      expect(error.recoverable).toBe(true);
    });

    it("timeout should create error with operation and timeout", () => {
      const error = WiFiError.timeout("connecting", 30000);

      expect(error.message).toContain("connecting");
      expect(error.message).toContain("30000");
      expect(error.code).toBe(WiFiErrorCode.TIMEOUT);
      expect(error.recoverable).toBe(true);
    });

    it("nmcliNotAvailable should create error for missing nmcli", () => {
      const error = WiFiError.nmcliNotAvailable();

      expect(error.message).toContain("nmcli");
      expect(error.message).toContain("NetworkManager");
      expect(error.code).toBe(WiFiErrorCode.NMCLI_NOT_AVAILABLE);
      expect(error.recoverable).toBe(false);
    });

    it("networkNotFound should create error with SSID", () => {
      const error = WiFiError.networkNotFound("HiddenNetwork");

      expect(error.message).toContain("HiddenNetwork");
      expect(error.message).toContain("not found");
      expect(error.code).toBe(WiFiErrorCode.NETWORK_NOT_FOUND);
      expect(error.recoverable).toBe(true);
    });

    it("alreadyConnected should create error with SSID", () => {
      const error = WiFiError.alreadyConnected("CurrentNetwork");

      expect(error.message).toContain("CurrentNetwork");
      expect(error.message).toContain("Already connected");
      expect(error.code).toBe(WiFiErrorCode.ALREADY_CONNECTED);
      expect(error.recoverable).toBe(false);
    });

    it("notConnected should create error for not connected state", () => {
      const error = WiFiError.notConnected();

      expect(error.message).toContain("Not connected");
      expect(error.code).toBe(WiFiErrorCode.NOT_CONNECTED);
      expect(error.recoverable).toBe(true);
    });

    it("invalidPassword should create error for invalid password", () => {
      const error = WiFiError.invalidPassword();

      expect(error.message).toContain("Invalid WiFi password");
      expect(error.code).toBe(WiFiErrorCode.INVALID_PASSWORD);
      expect(error.recoverable).toBe(true);
    });

    it("hotspotConnectionTimeout should create error with SSID and timeout", () => {
      const error = WiFiError.hotspotConnectionTimeout("PhoneHotspot", 60000);

      expect(error.message).toContain("PhoneHotspot");
      expect(error.message).toContain("60000");
      expect(error.code).toBe(WiFiErrorCode.HOTSPOT_CONNECTION_TIMEOUT);
      expect(error.recoverable).toBe(true);
    });

    it("fallbackReconnectFailed should create error with SSID and original error", () => {
      const original = new Error("Network busy");
      const error = WiFiError.fallbackReconnectFailed("HomeWiFi", original);

      expect(error.message).toContain("HomeWiFi");
      expect(error.message).toContain("Network busy");
      expect(error.code).toBe(WiFiErrorCode.FALLBACK_RECONNECT_FAILED);
      expect(error.recoverable).toBe(true);
    });

    it("unknown should create generic error with message", () => {
      const error = WiFiError.unknown("Something went wrong");

      expect(error.message).toBe("Something went wrong");
      expect(error.code).toBe(WiFiErrorCode.UNKNOWN);
      expect(error.recoverable).toBe(true);
    });
  });
});
