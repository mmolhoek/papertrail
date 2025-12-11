import {
  getUserMessage,
  getFormattedMessage,
  ERROR_MESSAGES,
  GPS_ERROR_MESSAGES,
  MAP_ERROR_MESSAGES,
  DISPLAY_ERROR_MESSAGES,
  WIFI_ERROR_MESSAGES,
  ORCHESTRATOR_ERROR_MESSAGES,
  WEB_ERROR_MESSAGES,
  CONFIG_ERROR_MESSAGES,
  DRIVE_ERROR_MESSAGES,
  DEFAULT_ERROR_MESSAGES,
} from "@errors/ErrorMessages";

describe("ErrorMessages", () => {
  describe("GPS_ERROR_MESSAGES", () => {
    it("should have messages for all GPS error codes", () => {
      const expectedCodes = [
        "GPS_DEVICE_NOT_FOUND",
        "GPS_DEVICE_OPEN_FAILED",
        "GPS_DEVICE_READ_FAILED",
        "GPS_DEVICE_NOT_INITIALIZED",
        "GPS_NO_FIX",
        "GPS_WEAK_SIGNAL",
        "GPS_FIX_TIMEOUT",
        "GPS_INSUFFICIENT_SATELLITES",
        "GPS_INVALID_DATA",
        "GPS_PARSE_ERROR",
        "GPS_CHECKSUM_ERROR",
        "GPS_ALREADY_TRACKING",
        "GPS_NOT_TRACKING",
        "GPS_UNKNOWN_ERROR",
      ];
      expectedCodes.forEach((code) => {
        expect(GPS_ERROR_MESSAGES[code]).toBeDefined();
        expect(typeof GPS_ERROR_MESSAGES[code]).toBe("string");
        expect(GPS_ERROR_MESSAGES[code].length).toBeGreaterThan(0);
      });
    });

    it("should have user-friendly GPS messages", () => {
      expect(GPS_ERROR_MESSAGES["GPS_DEVICE_NOT_FOUND"]).toBe(
        "GPS device not found. Please check connections.",
      );
      expect(GPS_ERROR_MESSAGES["GPS_NO_FIX"]).toBe(
        "No GPS signal. Please wait for satellite lock.",
      );
    });
  });

  describe("MAP_ERROR_MESSAGES", () => {
    it("should have messages for all Map error codes", () => {
      const expectedCodes = [
        "MAP_FILE_NOT_FOUND",
        "MAP_FILE_READ_ERROR",
        "MAP_FILE_TOO_LARGE",
        "MAP_INVALID_FILE_FORMAT",
        "MAP_PARSE_ERROR",
        "MAP_INVALID_GPX",
        "MAP_NO_TRACKS",
        "MAP_NO_TRACK_POINTS",
        "MAP_INVALID_COORDINATES",
        "MAP_TRACK_NOT_FOUND",
        "MAP_TRACK_INDEX_OUT_OF_BOUNDS",
        "MAP_EMPTY_TRACK",
        "MAP_DIRECTORY_NOT_FOUND",
        "MAP_DIRECTORY_READ_ERROR",
        "MAP_NO_GPX_FILES",
        "MAP_INVALID_BOUNDS",
        "MAP_CALCULATION_ERROR",
        "MAP_UNKNOWN_ERROR",
      ];
      expectedCodes.forEach((code) => {
        expect(MAP_ERROR_MESSAGES[code]).toBeDefined();
        expect(typeof MAP_ERROR_MESSAGES[code]).toBe("string");
      });
    });

    it("should have user-friendly Map messages", () => {
      expect(MAP_ERROR_MESSAGES["MAP_FILE_NOT_FOUND"]).toBe(
        "GPX file not found. Please check the file path.",
      );
      expect(MAP_ERROR_MESSAGES["MAP_NO_GPX_FILES"]).toBe(
        "No GPX files found. Please add GPX files to the directory.",
      );
    });
  });

  describe("DISPLAY_ERROR_MESSAGES", () => {
    it("should have messages for all Display error codes", () => {
      const expectedCodes = [
        "DISPLAY_DEVICE_NOT_FOUND",
        "DISPLAY_DEVICE_INIT_FAILED",
        "DISPLAY_DEVICE_NOT_INITIALIZED",
        "DISPLAY_SPI_ERROR",
        "DISPLAY_GPIO_ERROR",
        "DISPLAY_BUSY",
        "DISPLAY_TIMEOUT",
        "DISPLAY_SLEEPING",
        "DISPLAY_INVALID_BITMAP",
        "DISPLAY_BITMAP_SIZE_MISMATCH",
        "DISPLAY_INVALID_DIMENSIONS",
        "DISPLAY_RENDER_FAILED",
        "DISPLAY_PROJECTION_ERROR",
        "DISPLAY_OUT_OF_BOUNDS",
        "DISPLAY_UPDATE_FAILED",
        "DISPLAY_REFRESH_FAILED",
        "DISPLAY_UNKNOWN_ERROR",
      ];
      expectedCodes.forEach((code) => {
        expect(DISPLAY_ERROR_MESSAGES[code]).toBeDefined();
        expect(typeof DISPLAY_ERROR_MESSAGES[code]).toBe("string");
      });
    });

    it("should have user-friendly Display messages", () => {
      expect(DISPLAY_ERROR_MESSAGES["DISPLAY_DEVICE_NOT_FOUND"]).toBe(
        "E-paper display not found. Please check hardware connections.",
      );
      expect(DISPLAY_ERROR_MESSAGES["DISPLAY_BUSY"]).toBe(
        "Display is busy. Please wait.",
      );
    });
  });

  describe("WIFI_ERROR_MESSAGES", () => {
    it("should have messages for all WiFi error codes", () => {
      const expectedCodes = [
        "WIFI_SCAN_FAILED",
        "WIFI_CONNECTION_FAILED",
        "WIFI_AUTH_FAILED",
        "WIFI_TIMEOUT",
        "NMCLI_NOT_AVAILABLE",
        "WIFI_NETWORK_NOT_FOUND",
        "WIFI_ALREADY_CONNECTED",
        "WIFI_NOT_CONNECTED",
        "WIFI_INVALID_PASSWORD",
        "WIFI_HOTSPOT_CONNECTION_TIMEOUT",
        "WIFI_FALLBACK_RECONNECT_FAILED",
        "WIFI_UNKNOWN",
      ];
      expectedCodes.forEach((code) => {
        expect(WIFI_ERROR_MESSAGES[code]).toBeDefined();
        expect(typeof WIFI_ERROR_MESSAGES[code]).toBe("string");
      });
    });

    it("should have user-friendly WiFi messages", () => {
      expect(WIFI_ERROR_MESSAGES["WIFI_AUTH_FAILED"]).toBe(
        "WiFi authentication failed. Please check your password.",
      );
      expect(WIFI_ERROR_MESSAGES["WIFI_NETWORK_NOT_FOUND"]).toBe(
        "WiFi network not found. Please check if it's in range.",
      );
    });
  });

  describe("ORCHESTRATOR_ERROR_MESSAGES", () => {
    it("should have messages for all Orchestrator error codes", () => {
      const expectedCodes = [
        "ORCHESTRATOR_INIT_FAILED",
        "ORCHESTRATOR_SERVICE_INIT_FAILED",
        "ORCHESTRATOR_NOT_INITIALIZED",
        "ORCHESTRATOR_NO_ACTIVE_GPX",
        "ORCHESTRATOR_INVALID_STATE",
        "ORCHESTRATOR_ALREADY_RUNNING",
        "ORCHESTRATOR_NOT_RUNNING",
        "ORCHESTRATOR_UPDATE_FAILED",
        "ORCHESTRATOR_DISPLAY_UPDATE_FAILED",
        "ORCHESTRATOR_MULTIPLE_ERRORS",
        "ORCHESTRATOR_SERVICE_UNAVAILABLE",
        "ORCHESTRATOR_UNKNOWN_ERROR",
      ];
      expectedCodes.forEach((code) => {
        expect(ORCHESTRATOR_ERROR_MESSAGES[code]).toBeDefined();
        expect(typeof ORCHESTRATOR_ERROR_MESSAGES[code]).toBe("string");
      });
    });

    it("should have user-friendly Orchestrator messages", () => {
      expect(ORCHESTRATOR_ERROR_MESSAGES["ORCHESTRATOR_NO_ACTIVE_GPX"]).toBe(
        "No track selected. Please select a GPX file.",
      );
      expect(ORCHESTRATOR_ERROR_MESSAGES["ORCHESTRATOR_ALREADY_RUNNING"]).toBe(
        "Auto-update is already active.",
      );
    });
  });

  describe("WEB_ERROR_MESSAGES", () => {
    it("should have messages for all Web error codes", () => {
      const expectedCodes = [
        "WEB_SERVER_START_FAILED",
        "WEB_SERVER_STOP_FAILED",
        "WEB_SERVER_NOT_RUNNING",
        "WEB_PORT_IN_USE",
        "WEB_INVALID_REQUEST",
        "WEB_MISSING_PARAMETER",
        "WEB_INVALID_PARAMETER",
        "WEB_UNAUTHORIZED",
        "WEB_FORBIDDEN",
        "WEB_NOT_FOUND",
        "WEB_METHOD_NOT_ALLOWED",
        "WEB_WEBSOCKET_ERROR",
        "WEB_BROADCAST_FAILED",
        "WEB_UNKNOWN_ERROR",
      ];
      expectedCodes.forEach((code) => {
        expect(WEB_ERROR_MESSAGES[code]).toBeDefined();
        expect(typeof WEB_ERROR_MESSAGES[code]).toBe("string");
      });
    });

    it("should have user-friendly Web messages", () => {
      expect(WEB_ERROR_MESSAGES["WEB_UNAUTHORIZED"]).toBe(
        "Authentication required. Please log in.",
      );
      expect(WEB_ERROR_MESSAGES["WEB_NOT_FOUND"]).toBe("Resource not found.");
    });
  });

  describe("CONFIG_ERROR_MESSAGES", () => {
    it("should have messages for all Config error codes", () => {
      const expectedCodes = [
        "CONFIG_FILE_NOT_FOUND",
        "CONFIG_FILE_READ_ERROR",
        "CONFIG_FILE_WRITE_ERROR",
        "CONFIG_PARSE_ERROR",
        "CONFIG_INVALID_JSON",
        "CONFIG_INVALID_CONFIG",
        "CONFIG_MISSING_REQUIRED_FIELD",
        "CONFIG_INVALID_VALUE",
        "CONFIG_OUT_OF_RANGE",
        "CONFIG_NOT_INITIALIZED",
        "CONFIG_ALREADY_INITIALIZED",
        "CONFIG_UNKNOWN_ERROR",
      ];
      expectedCodes.forEach((code) => {
        expect(CONFIG_ERROR_MESSAGES[code]).toBeDefined();
        expect(typeof CONFIG_ERROR_MESSAGES[code]).toBe("string");
      });
    });

    it("should have user-friendly Config messages", () => {
      expect(CONFIG_ERROR_MESSAGES["CONFIG_FILE_NOT_FOUND"]).toBe(
        "Configuration file not found. Using default settings.",
      );
      expect(CONFIG_ERROR_MESSAGES["CONFIG_INVALID_JSON"]).toBe(
        "Configuration file is corrupted. Using default settings.",
      );
    });
  });

  describe("DRIVE_ERROR_MESSAGES", () => {
    it("should have messages for all Drive error codes", () => {
      const expectedCodes = [
        "DRIVE_ROUTE_NOT_FOUND",
        "DRIVE_ROUTE_SAVE_FAILED",
        "DRIVE_ROUTE_LOAD_FAILED",
        "DRIVE_ROUTE_DELETE_FAILED",
        "DRIVE_ROUTE_INVALID",
        "DRIVE_NAVIGATION_NOT_STARTED",
        "DRIVE_NAVIGATION_ALREADY_ACTIVE",
        "DRIVE_NO_GPS_POSITION",
        "DRIVE_SERVICE_NOT_INITIALIZED",
        "DRIVE_UNKNOWN_ERROR",
      ];
      expectedCodes.forEach((code) => {
        expect(DRIVE_ERROR_MESSAGES[code]).toBeDefined();
        expect(typeof DRIVE_ERROR_MESSAGES[code]).toBe("string");
      });
    });

    it("should have user-friendly Drive messages", () => {
      expect(DRIVE_ERROR_MESSAGES["DRIVE_ROUTE_NOT_FOUND"]).toBe(
        "Route not found. Please calculate a new route.",
      );
      expect(DRIVE_ERROR_MESSAGES["DRIVE_NO_GPS_POSITION"]).toBe(
        "Waiting for GPS position...",
      );
    });
  });

  describe("ERROR_MESSAGES combined", () => {
    it("should contain all GPS error codes", () => {
      Object.keys(GPS_ERROR_MESSAGES).forEach((code) => {
        expect(ERROR_MESSAGES[code]).toBeDefined();
      });
    });

    it("should contain all MAP error codes", () => {
      Object.keys(MAP_ERROR_MESSAGES).forEach((code) => {
        expect(ERROR_MESSAGES[code]).toBeDefined();
      });
    });

    it("should contain all DISPLAY error codes", () => {
      Object.keys(DISPLAY_ERROR_MESSAGES).forEach((code) => {
        expect(ERROR_MESSAGES[code]).toBeDefined();
      });
    });

    it("should contain all WIFI error codes", () => {
      Object.keys(WIFI_ERROR_MESSAGES).forEach((code) => {
        expect(ERROR_MESSAGES[code]).toBeDefined();
      });
    });

    it("should contain all ORCHESTRATOR error codes", () => {
      Object.keys(ORCHESTRATOR_ERROR_MESSAGES).forEach((code) => {
        expect(ERROR_MESSAGES[code]).toBeDefined();
      });
    });

    it("should contain all WEB error codes", () => {
      Object.keys(WEB_ERROR_MESSAGES).forEach((code) => {
        expect(ERROR_MESSAGES[code]).toBeDefined();
      });
    });

    it("should contain all CONFIG error codes", () => {
      Object.keys(CONFIG_ERROR_MESSAGES).forEach((code) => {
        expect(ERROR_MESSAGES[code]).toBeDefined();
      });
    });

    it("should contain all DRIVE error codes", () => {
      Object.keys(DRIVE_ERROR_MESSAGES).forEach((code) => {
        expect(ERROR_MESSAGES[code]).toBeDefined();
      });
    });
  });

  describe("DEFAULT_ERROR_MESSAGES", () => {
    it("should have defaults for all error categories", () => {
      const categories = [
        "GPS",
        "MAP",
        "DISPLAY",
        "WIFI",
        "ORCHESTRATOR",
        "WEB",
        "CONFIG",
        "DRIVE",
      ];
      categories.forEach((category) => {
        expect(DEFAULT_ERROR_MESSAGES[category]).toBeDefined();
        expect(typeof DEFAULT_ERROR_MESSAGES[category]).toBe("string");
      });
    });
  });

  describe("getUserMessage", () => {
    it("should return the correct message for known error codes", () => {
      expect(getUserMessage("GPS_DEVICE_NOT_FOUND")).toBe(
        "GPS device not found. Please check connections.",
      );
      expect(getUserMessage("MAP_FILE_NOT_FOUND")).toBe(
        "GPX file not found. Please check the file path.",
      );
      expect(getUserMessage("WIFI_AUTH_FAILED")).toBe(
        "WiFi authentication failed. Please check your password.",
      );
    });

    it("should return category default for unknown codes with known prefix", () => {
      expect(getUserMessage("GPS_SOME_UNKNOWN_ERROR")).toBe(
        "GPS error occurred. Please try again.",
      );
      expect(getUserMessage("MAP_SOME_UNKNOWN_ERROR")).toBe(
        "Error loading map data. Please try again.",
      );
      expect(getUserMessage("WIFI_SOME_UNKNOWN_ERROR")).toBe(
        "WiFi error occurred. Please try again.",
      );
    });

    it("should return ultimate fallback for completely unknown codes", () => {
      expect(getUserMessage("COMPLETELY_UNKNOWN_CODE")).toBe(
        "An error occurred. Please try again.",
      );
      expect(getUserMessage("")).toBe("An error occurred. Please try again.");
    });
  });

  describe("getFormattedMessage", () => {
    it("should return the message without placeholders when none provided", () => {
      expect(getFormattedMessage("GPS_DEVICE_NOT_FOUND")).toBe(
        "GPS device not found. Please check connections.",
      );
    });

    it("should handle messages that do not have placeholders", () => {
      // Even with args, if message has no placeholders, args are ignored
      expect(getFormattedMessage("GPS_DEVICE_NOT_FOUND", "extra", "args")).toBe(
        "GPS device not found. Please check connections.",
      );
    });

    it("should handle unknown error codes gracefully", () => {
      expect(getFormattedMessage("UNKNOWN_CODE")).toBe(
        "An error occurred. Please try again.",
      );
    });
  });
});
