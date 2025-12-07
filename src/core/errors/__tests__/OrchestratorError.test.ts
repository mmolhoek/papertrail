import { OrchestratorError, OrchestratorErrorCode } from "../OrchestratorError";

describe("OrchestratorError", () => {
  describe("constructor", () => {
    it("should create error with message and default code", () => {
      const error = new OrchestratorError("Test error");
      expect(error.message).toBe("Test error");
      expect(error.code).toBe(OrchestratorErrorCode.UNKNOWN);
      expect(error.recoverable).toBe(false);
    });

    it("should create error with all parameters", () => {
      const originalErrors = [new Error("Error 1"), new Error("Error 2")];
      const error = new OrchestratorError(
        "Test error",
        OrchestratorErrorCode.UPDATE_FAILED,
        true,
        { stage: "rendering" },
        originalErrors,
      );
      expect(error.message).toBe("Test error");
      expect(error.code).toBe(OrchestratorErrorCode.UPDATE_FAILED);
      expect(error.recoverable).toBe(true);
      expect(error.errors).toBe(originalErrors);
    });
  });

  describe("static factory methods", () => {
    it("initFailed should create error with service name and original error", () => {
      const original = new Error("Init error");
      const error = OrchestratorError.initFailed("GPSService", original);

      expect(error.message).toContain("GPSService");
      expect(error.message).toContain("Init error");
      expect(error.code).toBe(OrchestratorErrorCode.SERVICE_INIT_FAILED);
      expect(error.recoverable).toBe(false);
      expect(error.errors).toContain(original);
    });

    it("notInitialized should create error for not initialized state", () => {
      const error = OrchestratorError.notInitialized();

      expect(error.message).toContain("not initialized");
      expect(error.code).toBe(OrchestratorErrorCode.NOT_INITIALIZED);
      expect(error.recoverable).toBe(false);
    });

    it("noActiveGPX should create error for missing active track", () => {
      const error = OrchestratorError.noActiveGPX();

      expect(error.message).toContain("No active GPX");
      expect(error.code).toBe(OrchestratorErrorCode.NO_ACTIVE_GPX);
      expect(error.recoverable).toBe(false);
    });

    it("updateFailed should create error with stage and original error", () => {
      const original = new Error("Rendering failed");
      const error = OrchestratorError.updateFailed("rendering", original);

      expect(error.message).toContain("rendering");
      expect(error.message).toContain("Rendering failed");
      expect(error.code).toBe(OrchestratorErrorCode.UPDATE_FAILED);
      expect(error.recoverable).toBe(true);
      expect(error.errors).toContain(original);
    });

    it("multipleErrors should create error with all error messages", () => {
      const errors = [
        new Error("Error 1"),
        new Error("Error 2"),
        new Error("Error 3"),
      ];
      const error = OrchestratorError.multipleErrors(errors);

      expect(error.message).toContain("Error 1");
      expect(error.message).toContain("Error 2");
      expect(error.message).toContain("Error 3");
      expect(error.code).toBe(OrchestratorErrorCode.MULTIPLE_ERRORS);
      expect(error.recoverable).toBe(true);
      expect(error.errors).toBe(errors);
    });

    it("alreadyRunning should create error for already running state", () => {
      const error = OrchestratorError.alreadyRunning();

      expect(error.message).toContain("already running");
      expect(error.code).toBe(OrchestratorErrorCode.ALREADY_RUNNING);
      expect(error.recoverable).toBe(false);
    });

    it("notRunning should create error for not running state", () => {
      const error = OrchestratorError.notRunning();

      expect(error.message).toContain("not running");
      expect(error.code).toBe(OrchestratorErrorCode.NOT_RUNNING);
      expect(error.recoverable).toBe(false);
    });
  });

  describe("toJSON", () => {
    it("should serialize error to JSON", () => {
      const error = new OrchestratorError(
        "Test error",
        OrchestratorErrorCode.UPDATE_FAILED,
        true,
        { stage: "rendering" },
      );

      const json = error.toJSON();

      expect(json.message).toBe("Test error");
      expect(json.code).toBe(OrchestratorErrorCode.UPDATE_FAILED);
      expect(json.recoverable).toBe(true);
    });

    it("should include errors array in JSON when present", () => {
      const errors = [new Error("Error 1")];
      const error = new OrchestratorError(
        "Test error",
        OrchestratorErrorCode.MULTIPLE_ERRORS,
        true,
        {},
        errors,
      );

      const json = error.toJSON();

      expect(json.errors).toBeDefined();
      expect((json.errors as Array<{ message: string }>)[0].message).toBe(
        "Error 1",
      );
    });
  });

  describe("getUserMessage", () => {
    it("should return user message for SERVICE_INIT_FAILED", () => {
      const error = OrchestratorError.initFailed(
        "GPSService",
        new Error("test"),
      );
      expect(error.getUserMessage()).toBe(
        "Failed to start application services. Please restart.",
      );
    });

    it("should return user message for NO_ACTIVE_GPX", () => {
      const error = OrchestratorError.noActiveGPX();
      expect(error.getUserMessage()).toBe(
        "No track selected. Please select a GPX file.",
      );
    });

    it("should return user message for UPDATE_FAILED", () => {
      const error = OrchestratorError.updateFailed(
        "rendering",
        new Error("test"),
      );
      expect(error.getUserMessage()).toBe(
        "Failed to update display. Please try again.",
      );
    });

    it("should return user message for MULTIPLE_ERRORS", () => {
      const error = OrchestratorError.multipleErrors([new Error("test")]);
      expect(error.getUserMessage()).toBe(
        "Multiple errors occurred. Please check system status.",
      );
    });

    it("should return user message for ALREADY_RUNNING", () => {
      const error = OrchestratorError.alreadyRunning();
      expect(error.getUserMessage()).toBe("Auto-update is already active.");
    });

    it("should return user message for NOT_RUNNING", () => {
      const error = OrchestratorError.notRunning();
      expect(error.getUserMessage()).toBe("Auto-update is not active.");
    });

    it("should return default user message for unknown code", () => {
      const error = new OrchestratorError(
        "Test",
        OrchestratorErrorCode.UNKNOWN,
      );
      expect(error.getUserMessage()).toBe(
        "System error occurred. Please try again.",
      );
    });
  });
});
