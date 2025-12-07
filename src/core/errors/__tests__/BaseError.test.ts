import { BaseError } from "../BaseError";

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
    it("should return the error message by default", () => {
      const error = new TestError("User facing message");
      expect(error.getUserMessage()).toBe("User facing message");
    });
  });
});
