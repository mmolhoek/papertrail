import { WebError, WebErrorCode } from "../WebError";

describe("WebError", () => {
  describe("constructor", () => {
    it("should create error with message and default code", () => {
      const error = new WebError("Test error");
      expect(error.message).toBe("Test error");
      expect(error.code).toBe(WebErrorCode.UNKNOWN);
      expect(error.recoverable).toBe(false);
    });

    it("should create error with all parameters", () => {
      const error = new WebError(
        "Test error",
        WebErrorCode.INVALID_REQUEST,
        true,
        { reason: "test" },
        400,
      );
      expect(error.message).toBe("Test error");
      expect(error.code).toBe(WebErrorCode.INVALID_REQUEST);
      expect(error.recoverable).toBe(true);
      expect(error.statusCode).toBe(400);
    });
  });

  describe("static factory methods", () => {
    it("serverStartFailed should create error with port and original error", () => {
      const original = new Error("EADDRINUSE");
      const error = WebError.serverStartFailed(3000, original);

      expect(error.message).toContain("3000");
      expect(error.message).toContain("EADDRINUSE");
      expect(error.code).toBe(WebErrorCode.SERVER_START_FAILED);
      expect(error.recoverable).toBe(false);
      expect(error.statusCode).toBe(500);
    });

    it("portInUse should create error with port", () => {
      const error = WebError.portInUse(8080);

      expect(error.message).toContain("8080");
      expect(error.message).toContain("already in use");
      expect(error.code).toBe(WebErrorCode.PORT_IN_USE);
      expect(error.statusCode).toBe(500);
    });

    it("serverNotRunning should create error for server not running", () => {
      const error = WebError.serverNotRunning();

      expect(error.message).toContain("not running");
      expect(error.code).toBe(WebErrorCode.SERVER_NOT_RUNNING);
      expect(error.statusCode).toBe(503);
    });

    it("invalidRequest should create error with reason", () => {
      const error = WebError.invalidRequest("Missing body");

      expect(error.message).toContain("Missing body");
      expect(error.code).toBe(WebErrorCode.INVALID_REQUEST);
      expect(error.statusCode).toBe(400);
    });

    it("missingParameter should create error with parameter name", () => {
      const error = WebError.missingParameter("trackId");

      expect(error.message).toContain("trackId");
      expect(error.code).toBe(WebErrorCode.MISSING_PARAMETER);
      expect(error.statusCode).toBe(400);
    });

    it("invalidParameter should create error with parameter details", () => {
      const error = WebError.invalidParameter("zoom", "abc", "number 1-20");

      expect(error.message).toContain("zoom");
      expect(error.message).toContain("abc");
      expect(error.message).toContain("number 1-20");
      expect(error.code).toBe(WebErrorCode.INVALID_PARAMETER);
      expect(error.statusCode).toBe(400);
    });

    it("unauthorized should create error without reason", () => {
      const error = WebError.unauthorized();

      expect(error.message).toBe("Unauthorized access");
      expect(error.code).toBe(WebErrorCode.UNAUTHORIZED);
      expect(error.statusCode).toBe(401);
    });

    it("unauthorized should create error with reason", () => {
      const error = WebError.unauthorized("Token expired");

      expect(error.message).toBe("Token expired");
      expect(error.code).toBe(WebErrorCode.UNAUTHORIZED);
      expect(error.statusCode).toBe(401);
    });

    it("forbidden should create error without reason", () => {
      const error = WebError.forbidden();

      expect(error.message).toBe("Forbidden");
      expect(error.code).toBe(WebErrorCode.FORBIDDEN);
      expect(error.statusCode).toBe(403);
    });

    it("forbidden should create error with reason", () => {
      const error = WebError.forbidden("Admin access required");

      expect(error.message).toBe("Admin access required");
      expect(error.code).toBe(WebErrorCode.FORBIDDEN);
      expect(error.statusCode).toBe(403);
    });

    it("notFound should create error with resource", () => {
      const error = WebError.notFound("/api/tracks/123");

      expect(error.message).toContain("/api/tracks/123");
      expect(error.code).toBe(WebErrorCode.NOT_FOUND);
      expect(error.statusCode).toBe(404);
    });

    it("methodNotAllowed should create error with method and path", () => {
      const error = WebError.methodNotAllowed("PUT", "/api/status");

      expect(error.message).toContain("PUT");
      expect(error.message).toContain("/api/status");
      expect(error.code).toBe(WebErrorCode.METHOD_NOT_ALLOWED);
      expect(error.statusCode).toBe(405);
    });

    it("websocketError should create error with original error", () => {
      const original = new Error("Connection closed");
      const error = WebError.websocketError(original);

      expect(error.message).toContain("Connection closed");
      expect(error.code).toBe(WebErrorCode.WEBSOCKET_ERROR);
      expect(error.recoverable).toBe(true);
      expect(error.statusCode).toBe(500);
    });
  });

  describe("toJSON", () => {
    it("should serialize error to JSON including statusCode", () => {
      const error = new WebError(
        "Test error",
        WebErrorCode.INVALID_REQUEST,
        false,
        { reason: "test" },
        400,
      );

      const json = error.toJSON();

      expect(json.message).toBe("Test error");
      expect(json.code).toBe(WebErrorCode.INVALID_REQUEST);
      expect(json.statusCode).toBe(400);
    });
  });

  describe("getUserMessage", () => {
    it("should return user message for SERVER_START_FAILED", () => {
      const error = WebError.serverStartFailed(3000, new Error("test"));
      expect(error.getUserMessage()).toBe(
        "Failed to start web interface. Please check configuration.",
      );
    });

    it("should return user message for PORT_IN_USE", () => {
      const error = WebError.portInUse(8080);
      expect(error.getUserMessage()).toBe(
        "Web interface port is already in use. Please change the port.",
      );
    });

    it("should return user message for SERVER_NOT_RUNNING", () => {
      const error = WebError.serverNotRunning();
      expect(error.getUserMessage()).toBe("Web interface is not running.");
    });

    it("should return user message for INVALID_REQUEST", () => {
      const error = WebError.invalidRequest("test");
      expect(error.getUserMessage()).toBe(
        "Invalid request. Please check your input.",
      );
    });

    it("should return user message for MISSING_PARAMETER", () => {
      const error = WebError.missingParameter("trackId");
      expect(error.getUserMessage()).toBe(
        "Missing required information. Please check your input.",
      );
    });

    it("should return user message for UNAUTHORIZED", () => {
      const error = WebError.unauthorized();
      expect(error.getUserMessage()).toBe(
        "Authentication required. Please log in.",
      );
    });

    it("should return user message for FORBIDDEN", () => {
      const error = WebError.forbidden();
      expect(error.getUserMessage()).toBe(
        "You do not have permission to access this resource.",
      );
    });

    it("should return user message for NOT_FOUND", () => {
      const error = WebError.notFound("/api/test");
      expect(error.getUserMessage()).toBe("Resource not found.");
    });

    it("should return default user message for unknown code", () => {
      const error = new WebError("Test", WebErrorCode.UNKNOWN);
      expect(error.getUserMessage()).toBe(
        "Web interface error occurred. Please try again.",
      );
    });
  });
});
