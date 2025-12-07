import { GPSError, GPSErrorCode } from "../GPSError";

describe("GPSError", () => {
  describe("constructor", () => {
    it("should create error with message and default code", () => {
      const error = new GPSError("Test error");
      expect(error.message).toBe("Test error");
      expect(error.code).toBe(GPSErrorCode.UNKNOWN);
      expect(error.recoverable).toBe(false);
    });

    it("should create error with all parameters", () => {
      const error = new GPSError("Test error", GPSErrorCode.NO_FIX, true, {
        satellites: 3,
      });
      expect(error.message).toBe("Test error");
      expect(error.code).toBe(GPSErrorCode.NO_FIX);
      expect(error.recoverable).toBe(true);
    });
  });

  describe("static factory methods", () => {
    it("deviceNotFound should create error with device path", () => {
      const error = GPSError.deviceNotFound("/dev/ttyAMA0");

      expect(error.message).toContain("/dev/ttyAMA0");
      expect(error.code).toBe(GPSErrorCode.DEVICE_NOT_FOUND);
      expect(error.recoverable).toBe(false);
    });

    it("noFix should create error with default satellites", () => {
      const error = GPSError.noFix();

      expect(error.message).toContain("satellites: 0");
      expect(error.code).toBe(GPSErrorCode.NO_FIX);
      expect(error.recoverable).toBe(true);
    });

    it("noFix should create error with specified satellites", () => {
      const error = GPSError.noFix(3);

      expect(error.message).toContain("satellites: 3");
      expect(error.code).toBe(GPSErrorCode.NO_FIX);
      expect(error.recoverable).toBe(true);
    });

    it("fixTimeout should create error with timeout", () => {
      const error = GPSError.fixTimeout(30000);

      expect(error.message).toContain("30000");
      expect(error.code).toBe(GPSErrorCode.FIX_TIMEOUT);
      expect(error.recoverable).toBe(true);
    });

    it("invalidData should create error with reason", () => {
      const error = GPSError.invalidData("$GPGGA,invalid", "checksum mismatch");

      expect(error.message).toContain("checksum mismatch");
      expect(error.code).toBe(GPSErrorCode.INVALID_DATA);
      expect(error.recoverable).toBe(true);
    });

    it("invalidData should create error without reason", () => {
      const error = GPSError.invalidData("$GPGGA,invalid");

      expect(error.message).toContain("unknown reason");
      expect(error.code).toBe(GPSErrorCode.INVALID_DATA);
      expect(error.recoverable).toBe(true);
    });

    it("parseError should create error with sentence and original error", () => {
      const original = new Error("Unexpected format");
      const error = GPSError.parseError("$GPGGA,data", original);

      expect(error.message).toContain("Unexpected format");
      expect(error.code).toBe(GPSErrorCode.PARSE_ERROR);
      expect(error.recoverable).toBe(true);
    });

    it("readFailed should create error with original error", () => {
      const original = new Error("Device disconnected");
      const error = GPSError.readFailed(original);

      expect(error.message).toContain("Device disconnected");
      expect(error.code).toBe(GPSErrorCode.DEVICE_READ_FAILED);
      expect(error.recoverable).toBe(true);
    });
  });

  describe("getUserMessage", () => {
    it("should return user message for DEVICE_NOT_FOUND", () => {
      const error = GPSError.deviceNotFound("/dev/tty");
      expect(error.getUserMessage()).toBe(
        "GPS device not found. Please check connections.",
      );
    });

    it("should return user message for NO_FIX", () => {
      const error = GPSError.noFix(2);
      expect(error.getUserMessage()).toBe(
        "No GPS signal. Please wait for satellite lock.",
      );
    });

    it("should return user message for FIX_TIMEOUT", () => {
      const error = GPSError.fixTimeout(30000);
      expect(error.getUserMessage()).toBe(
        "GPS is taking longer than expected. Please ensure clear sky view.",
      );
    });

    it("should return user message for WEAK_SIGNAL", () => {
      const error = new GPSError("Weak signal", GPSErrorCode.WEAK_SIGNAL, true);
      expect(error.getUserMessage()).toBe(
        "Weak GPS signal. Position may be inaccurate.",
      );
    });

    it("should return default user message for UNKNOWN", () => {
      const error = new GPSError("Test", GPSErrorCode.UNKNOWN);
      expect(error.getUserMessage()).toBe(
        "GPS error occurred. Please try again.",
      );
    });
  });
});
