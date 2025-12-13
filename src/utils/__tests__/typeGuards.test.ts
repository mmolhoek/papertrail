import { GPSFixQuality } from "@core/types/GPSTypes";
import { WebError } from "@core/errors/WebError";
import { GPSError } from "@core/errors/GPSError";
import {
  toError,
  isNodeJSErrnoException,
  isGPSFixQuality,
  toGPSFixQuality,
  isScreenType,
  isBaseError,
  extractErrorInfo,
} from "../typeGuards";

describe("typeGuards", () => {
  describe("toError", () => {
    it("should return Error instances unchanged", () => {
      const error = new Error("test error");
      expect(toError(error)).toBe(error);
    });

    it("should convert string to Error", () => {
      const result = toError("string error");
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("string error");
    });

    it("should convert object with message property to Error", () => {
      const result = toError({ message: "object error" });
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("object error");
    });

    it("should convert number to Error with string representation", () => {
      const result = toError(42);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("42");
    });

    it("should convert null to Error", () => {
      const result = toError(null);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("null");
    });

    it("should convert undefined to Error", () => {
      const result = toError(undefined);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("undefined");
    });

    it("should preserve custom Error subclasses", () => {
      const webError = WebError.invalidRequest("test");
      expect(toError(webError)).toBe(webError);
      expect(toError(webError)).toBeInstanceOf(WebError);
    });
  });

  describe("isNodeJSErrnoException", () => {
    it("should return true for error with code property", () => {
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      expect(isNodeJSErrnoException(error)).toBe(true);
    });

    it("should return true for error with errno property", () => {
      const error = new Error("system error") as NodeJS.ErrnoException;
      error.errno = -2;
      expect(isNodeJSErrnoException(error)).toBe(true);
    });

    it("should return true for error with syscall property", () => {
      const error = new Error("system error") as NodeJS.ErrnoException;
      error.syscall = "open";
      expect(isNodeJSErrnoException(error)).toBe(true);
    });

    it("should return false for plain Error", () => {
      const error = new Error("plain error");
      expect(isNodeJSErrnoException(error)).toBe(false);
    });

    it("should return false for non-Error objects", () => {
      expect(isNodeJSErrnoException({ code: "ENOENT" })).toBe(false);
      expect(isNodeJSErrnoException(null)).toBe(false);
      expect(isNodeJSErrnoException("error")).toBe(false);
    });
  });

  describe("isGPSFixQuality", () => {
    it("should return true for NO_FIX (0)", () => {
      expect(isGPSFixQuality(0)).toBe(true);
    });

    it("should return true for GPS_FIX (1)", () => {
      expect(isGPSFixQuality(1)).toBe(true);
    });

    it("should return true for DGPS_FIX (2)", () => {
      expect(isGPSFixQuality(2)).toBe(true);
    });

    it("should return true for SIMULATION (8)", () => {
      expect(isGPSFixQuality(8)).toBe(true);
    });

    it("should return false for negative values", () => {
      expect(isGPSFixQuality(-1)).toBe(false);
    });

    it("should return false for values above SIMULATION", () => {
      expect(isGPSFixQuality(9)).toBe(false);
      expect(isGPSFixQuality(100)).toBe(false);
    });

    it("should return false for non-integer values", () => {
      expect(isGPSFixQuality(1.5)).toBe(false);
      expect(isGPSFixQuality(NaN)).toBe(false);
    });
  });

  describe("toGPSFixQuality", () => {
    it("should return valid fix quality unchanged", () => {
      expect(toGPSFixQuality(1)).toBe(GPSFixQuality.GPS_FIX);
      expect(toGPSFixQuality(4)).toBe(GPSFixQuality.RTK_FIX);
    });

    it("should return NO_FIX for invalid values", () => {
      expect(toGPSFixQuality(-1)).toBe(GPSFixQuality.NO_FIX);
      expect(toGPSFixQuality(9)).toBe(GPSFixQuality.NO_FIX);
      expect(toGPSFixQuality(100)).toBe(GPSFixQuality.NO_FIX);
    });

    it("should return NO_FIX for non-integer values", () => {
      expect(toGPSFixQuality(1.5)).toBe(GPSFixQuality.NO_FIX);
      expect(toGPSFixQuality(NaN)).toBe(GPSFixQuality.NO_FIX);
    });
  });

  describe("isScreenType", () => {
    it("should return true for TRACK", () => {
      expect(isScreenType("track")).toBe(true);
    });

    it("should return true for TURN_BY_TURN", () => {
      expect(isScreenType("turn_by_turn")).toBe(true);
    });

    it("should return false for invalid screen types", () => {
      expect(isScreenType("invalid")).toBe(false);
      expect(isScreenType("")).toBe(false);
      expect(isScreenType("TRACK")).toBe(false); // case sensitive
    });
  });

  describe("isBaseError", () => {
    it("should return true for WebError", () => {
      const error = WebError.invalidRequest("test");
      expect(isBaseError(error)).toBe(true);
    });

    it("should return true for GPSError", () => {
      const error = GPSError.noFix();
      expect(isBaseError(error)).toBe(true);
    });

    it("should return false for plain Error", () => {
      const error = new Error("plain error");
      expect(isBaseError(error)).toBe(false);
    });

    it("should return false for non-Error objects", () => {
      expect(isBaseError({ code: "TEST", recoverable: false })).toBe(false);
      expect(isBaseError(null)).toBe(false);
    });
  });

  describe("extractErrorInfo", () => {
    it("should extract code and message from BaseError", () => {
      const error = WebError.invalidRequest("test reason");
      const info = extractErrorInfo(error);
      expect(info.code).toBe("WEB_INVALID_REQUEST");
      expect(typeof info.message).toBe("string");
    });

    it("should extract code and message from GPSError", () => {
      const error = GPSError.noFix();
      const info = extractErrorInfo(error);
      expect(info.code).toBe("GPS_NO_FIX");
      expect(typeof info.message).toBe("string");
    });

    it("should return UNKNOWN_ERROR code for plain Error", () => {
      const error = new Error("plain error message");
      const info = extractErrorInfo(error);
      expect(info.code).toBe("UNKNOWN_ERROR");
      expect(info.message).toBe("plain error message");
    });

    it("should handle mock error-like objects", () => {
      const mockError = {
        code: "MOCK_ERROR",
        getUserMessage: () => "Mock error message",
      };
      const info = extractErrorInfo(mockError);
      expect(info.code).toBe("MOCK_ERROR");
      expect(info.message).toBe("Mock error message");
    });

    it("should handle unknown error types", () => {
      const info = extractErrorInfo("string error");
      expect(info.code).toBe("UNKNOWN_ERROR");
      expect(info.message).toBe("string error");
    });
  });
});
