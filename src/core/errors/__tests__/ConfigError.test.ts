import { ConfigError, ConfigErrorCode } from "@errors/ConfigError";

describe("ConfigError", () => {
  describe("constructor", () => {
    it("should create error with message and default code", () => {
      const error = new ConfigError("Test error");
      expect(error.message).toBe("Test error");
      expect(error.code).toBe(ConfigErrorCode.UNKNOWN);
      expect(error.recoverable).toBe(false);
    });

    it("should create error with all parameters", () => {
      const error = new ConfigError(
        "Test error",
        ConfigErrorCode.INVALID_CONFIG,
        true,
        { key: "value" },
      );
      expect(error.message).toBe("Test error");
      expect(error.code).toBe(ConfigErrorCode.INVALID_CONFIG);
      expect(error.recoverable).toBe(true);
    });
  });

  describe("static factory methods", () => {
    it("fileNotFound should create error with file path", () => {
      const error = ConfigError.fileNotFound("/path/to/config.json");

      expect(error.message).toContain("/path/to/config.json");
      expect(error.code).toBe(ConfigErrorCode.FILE_NOT_FOUND);
      expect(error.recoverable).toBe(false);
    });

    it("readError should create error with file path and original error", () => {
      const original = new Error("Permission denied");
      const error = ConfigError.readError("/path/to/config.json", original);

      expect(error.message).toContain("Permission denied");
      expect(error.code).toBe(ConfigErrorCode.FILE_READ_ERROR);
      expect(error.recoverable).toBe(false);
    });

    it("writeError should create error with file path and original error", () => {
      const original = new Error("Disk full");
      const error = ConfigError.writeError("/path/to/config.json", original);

      expect(error.message).toContain("Disk full");
      expect(error.code).toBe(ConfigErrorCode.FILE_WRITE_ERROR);
      expect(error.recoverable).toBe(true);
    });

    it("invalidJSON should create error with file path and parse error", () => {
      const original = new Error("Unexpected token");
      const error = ConfigError.invalidJSON("/path/to/config.json", original);

      expect(error.message).toContain("Unexpected token");
      expect(error.code).toBe(ConfigErrorCode.INVALID_JSON);
      expect(error.recoverable).toBe(false);
    });

    it("missingField should create error with field name", () => {
      const error = ConfigError.missingField("apiKey");

      expect(error.message).toContain("apiKey");
      expect(error.code).toBe(ConfigErrorCode.MISSING_REQUIRED_FIELD);
      expect(error.recoverable).toBe(false);
    });

    it("invalidValue should create error with field, value, and expected", () => {
      const error = ConfigError.invalidValue("port", "abc", "number");

      expect(error.message).toContain("port");
      expect(error.message).toContain("abc");
      expect(error.message).toContain("number");
      expect(error.code).toBe(ConfigErrorCode.INVALID_VALUE);
      expect(error.recoverable).toBe(false);
    });

    it("outOfRange should create error with field, value, min and max", () => {
      const error = ConfigError.outOfRange("zoom", 25, 1, 20);

      expect(error.message).toContain("zoom");
      expect(error.message).toContain("25");
      expect(error.message).toContain("1");
      expect(error.message).toContain("20");
      expect(error.code).toBe(ConfigErrorCode.OUT_OF_RANGE);
      expect(error.recoverable).toBe(false);
    });

    it("notInitialized should create error for not initialized state", () => {
      const error = ConfigError.notInitialized();

      expect(error.message).toContain("not initialized");
      expect(error.code).toBe(ConfigErrorCode.NOT_INITIALIZED);
      expect(error.recoverable).toBe(false);
    });

    it("parseError should create error with original error", () => {
      const original = new Error("Invalid schema");
      const error = ConfigError.parseError(original);

      expect(error.message).toContain("Invalid schema");
      expect(error.code).toBe(ConfigErrorCode.PARSE_ERROR);
      expect(error.recoverable).toBe(false);
    });
  });

  describe("getUserMessage", () => {
    it("should return user message for FILE_NOT_FOUND", () => {
      const error = ConfigError.fileNotFound("/path/to/file");
      expect(error.getUserMessage()).toBe(
        "Configuration file not found. Using default settings.",
      );
    });

    it("should return user message for FILE_READ_ERROR", () => {
      const error = ConfigError.readError("/path", new Error("test"));
      expect(error.getUserMessage()).toBe(
        "Failed to read configuration. Using default settings.",
      );
    });

    it("should return user message for FILE_WRITE_ERROR", () => {
      const error = ConfigError.writeError("/path", new Error("test"));
      expect(error.getUserMessage()).toBe(
        "Failed to save configuration. Changes may not persist.",
      );
    });

    it("should return user message for INVALID_JSON", () => {
      const error = ConfigError.invalidJSON("/path", new Error("test"));
      expect(error.getUserMessage()).toBe(
        "Configuration file is corrupted. Using default settings.",
      );
    });

    it("should return user message for MISSING_REQUIRED_FIELD", () => {
      const error = ConfigError.missingField("key");
      expect(error.getUserMessage()).toBe(
        "Configuration is incomplete. Using default settings.",
      );
    });

    it("should return user message for INVALID_VALUE", () => {
      const error = ConfigError.invalidValue("key", "val", "expected");
      expect(error.getUserMessage()).toBe(
        "Configuration contains invalid values. Using defaults.",
      );
    });

    it("should return user message for OUT_OF_RANGE", () => {
      const error = ConfigError.outOfRange("zoom", 25, 1, 20);
      expect(error.getUserMessage()).toBe(
        "Configuration values are out of acceptable range.",
      );
    });

    it("should return default user message for UNKNOWN", () => {
      const error = new ConfigError("Test", ConfigErrorCode.UNKNOWN);
      expect(error.getUserMessage()).toBe(
        "Configuration error occurred. Using default settings.",
      );
    });
  });
});
