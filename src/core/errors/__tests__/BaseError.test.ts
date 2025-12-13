import { BaseError } from "@errors/BaseError";

// Create a concrete implementation for testing
class TestError extends BaseError {
  constructor(
    message: string,
    code: string = "TEST_ERROR",
    recoverable: boolean = false,
    context?: Record<string, unknown>,
  ) {
    super(message, code, recoverable, context);
  }
}

describe("BaseError", () => {
  describe("constructor", () => {
    it("should create error with message and code", () => {
      const error = new TestError("Test message", "TEST_CODE");

      expect(error.message).toBe("Test message");
      expect(error.code).toBe("TEST_CODE");
      expect(error.recoverable).toBe(false);
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it("should create error with all parameters", () => {
      const context = { key: "value" };
      const error = new TestError("Test message", "TEST_CODE", true, context);

      expect(error.recoverable).toBe(true);
      expect(error.context).toEqual(context);
    });

    it("should set the error name to the constructor name", () => {
      const error = new TestError("Test message");
      expect(error.name).toBe("TestError");
    });

    it("should be an instance of Error", () => {
      const error = new TestError("Test message");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("toJSON", () => {
    it("should serialize error to JSON", () => {
      const error = new TestError("Test message", "TEST_CODE", true, {
        key: "value",
      });
      const json = error.toJSON();

      expect(json.name).toBe("TestError");
      expect(json.message).toBe("Test message");
      expect(json.code).toBe("TEST_CODE");
      expect(json.recoverable).toBe(true);
      expect(json.context).toEqual({ key: "value" });
      expect(json.timestamp).toBeDefined();
      expect(json.stack).toBeDefined();
    });
  });

  describe("getUserMessage", () => {
    it("should return centralized user message for known error code", () => {
      // Use a known GPS error code
      const error = new TestError("Technical message", "GPS_DEVICE_NOT_FOUND");
      expect(error.getUserMessage()).toBe(
        "GPS device not found. Please check connections.",
      );
    });

    it("should return fallback message for unknown error code", () => {
      const error = new TestError("Technical message", "UNKNOWN_CODE");
      expect(error.getUserMessage()).toBe(
        "An error occurred. Please try again.",
      );
    });

    it("should return category fallback for known category prefix", () => {
      const error = new TestError("Technical message", "GPS_FUTURE_ERROR");
      expect(error.getUserMessage()).toBe(
        "GPS error occurred. Please try again.",
      );
    });
  });
});
