import { DriveError, DriveErrorCode } from "../DriveError";

describe("DriveError", () => {
  describe("constructor", () => {
    it("should create error with message and default code", () => {
      const error = new DriveError("Test error");
      expect(error.message).toBe("Test error");
      expect(error.code).toBe(DriveErrorCode.UNKNOWN);
      expect(error.recoverable).toBe(false);
    });

    it("should create error with all parameters", () => {
      const error = new DriveError(
        "Test error",
        DriveErrorCode.ROUTE_NOT_FOUND,
        true,
        { routeId: "123" },
      );
      expect(error.message).toBe("Test error");
      expect(error.code).toBe(DriveErrorCode.ROUTE_NOT_FOUND);
      expect(error.recoverable).toBe(true);
    });
  });

  describe("static factory methods", () => {
    it("routeNotFound should create error with route ID", () => {
      const error = DriveError.routeNotFound("route-123");

      expect(error.message).toContain("route-123");
      expect(error.code).toBe(DriveErrorCode.ROUTE_NOT_FOUND);
      expect(error.recoverable).toBe(false);
    });

    it("saveFailed should create error with reason", () => {
      const error = DriveError.saveFailed("disk full");

      expect(error.message).toContain("disk full");
      expect(error.code).toBe(DriveErrorCode.ROUTE_SAVE_FAILED);
      expect(error.recoverable).toBe(true);
    });

    it("saveFailed should create error with reason and original error", () => {
      const original = new Error("IO error");
      const error = DriveError.saveFailed("write failed", original);

      expect(error.message).toContain("write failed");
      expect(error.code).toBe(DriveErrorCode.ROUTE_SAVE_FAILED);
      expect(error.recoverable).toBe(true);
    });

    it("loadFailed should create error with route ID", () => {
      const error = DriveError.loadFailed("route-456");

      expect(error.message).toContain("route-456");
      expect(error.message).toContain("unknown error");
      expect(error.code).toBe(DriveErrorCode.ROUTE_LOAD_FAILED);
      expect(error.recoverable).toBe(true);
    });

    it("loadFailed should create error with route ID and original error", () => {
      const original = new Error("File corrupted");
      const error = DriveError.loadFailed("route-456", original);

      expect(error.message).toContain("route-456");
      expect(error.message).toContain("File corrupted");
      expect(error.code).toBe(DriveErrorCode.ROUTE_LOAD_FAILED);
      expect(error.recoverable).toBe(true);
    });

    it("invalidRoute should create error with reason", () => {
      const error = DriveError.invalidRoute("missing waypoints");

      expect(error.message).toContain("missing waypoints");
      expect(error.code).toBe(DriveErrorCode.ROUTE_INVALID);
      expect(error.recoverable).toBe(false);
    });

    it("navigationNotStarted should create error for no active navigation", () => {
      const error = DriveError.navigationNotStarted();

      expect(error.message).toContain("No active navigation");
      expect(error.code).toBe(DriveErrorCode.NAVIGATION_NOT_STARTED);
      expect(error.recoverable).toBe(true);
    });

    it("navigationAlreadyActive should create error for already active navigation", () => {
      const error = DriveError.navigationAlreadyActive();

      expect(error.message).toContain("already active");
      expect(error.code).toBe(DriveErrorCode.NAVIGATION_ALREADY_ACTIVE);
      expect(error.recoverable).toBe(true);
    });

    it("noGPSPosition should create error for no GPS position", () => {
      const error = DriveError.noGPSPosition();

      expect(error.message).toContain("No GPS position");
      expect(error.code).toBe(DriveErrorCode.NO_GPS_POSITION);
      expect(error.recoverable).toBe(true);
    });

    it("serviceNotInitialized should create error for not initialized service", () => {
      const error = DriveError.serviceNotInitialized();

      expect(error.message).toContain("not initialized");
      expect(error.code).toBe(DriveErrorCode.SERVICE_NOT_INITIALIZED);
      expect(error.recoverable).toBe(false);
    });
  });

  describe("getUserMessage", () => {
    it("should return user message for ROUTE_NOT_FOUND", () => {
      const error = DriveError.routeNotFound("123");
      expect(error.getUserMessage()).toBe(
        "Route not found. Please calculate a new route.",
      );
    });

    it("should return user message for ROUTE_INVALID", () => {
      const error = DriveError.invalidRoute("bad data");
      expect(error.getUserMessage()).toBe(
        "Invalid route data. Please calculate a new route.",
      );
    });

    it("should return user message for NAVIGATION_NOT_STARTED", () => {
      const error = DriveError.navigationNotStarted();
      expect(error.getUserMessage()).toBe("No navigation is active.");
    });

    it("should return user message for NAVIGATION_ALREADY_ACTIVE", () => {
      const error = DriveError.navigationAlreadyActive();
      expect(error.getUserMessage()).toBe(
        "Navigation is already running. Stop it first.",
      );
    });

    it("should return user message for NO_GPS_POSITION", () => {
      const error = DriveError.noGPSPosition();
      expect(error.getUserMessage()).toBe("Waiting for GPS position...");
    });

    it("should return default user message for UNKNOWN", () => {
      const error = new DriveError("Test", DriveErrorCode.UNKNOWN);
      expect(error.getUserMessage()).toBe(
        "Navigation error occurred. Please try again.",
      );
    });
  });
});
