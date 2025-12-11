import { WebInterfaceService } from "@services/web/WebInterfaceService";
import { WebConfig } from "@core/types";
import { WebError } from "@core/errors";
import http from "http";

describe("WebInterfaceService", () => {
  let webService: WebInterfaceService;
  let config: WebConfig;

  beforeEach(() => {
    // Use a random port for testing to avoid conflicts
    const testPort = 3000 + Math.floor(Math.random() * 1000);

    config = {
      port: testPort,
      host: "127.0.0.1",
      cors: true,
      apiBasePath: "/api",
      staticDirectory: "/tmp/papertrail-test-static",
      websocket: {
        enabled: true,
      },
    };

    webService = new WebInterfaceService(config);
  });

  afterEach(async () => {
    if (webService.isRunning()) {
      await webService.stop();
    }
  });

  describe("initialization", () => {
    it("should not be running initially", () => {
      expect(webService.isRunning()).toBe(false);
    });

    it("should return correct port", () => {
      expect(webService.getPort()).toBe(config.port);
    });

    it("should return correct server URL", () => {
      expect(webService.getServerUrl()).toBe(`http://127.0.0.1:${config.port}`);
    });
  });

  describe("start", () => {
    it("should start server successfully", async () => {
      const result = await webService.start();

      expect(result.success).toBe(true);
      expect(webService.isRunning()).toBe(true);
    });

    it("should not start twice", async () => {
      await webService.start();
      const result = await webService.start();

      expect(result.success).toBe(true);
      expect(webService.isRunning()).toBe(true);
    });

    it("should return error if port is in use", async () => {
      // Start first server
      await webService.start();

      // Try to start second server on same port
      const secondService = new WebInterfaceService(config);
      const result = await secondService.start();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as WebError).code).toBe("WEB_PORT_IN_USE");
      }

      await secondService.stop().catch(() => {}); // Clean up even if not started
    });

    it("should be accessible via HTTP after starting", async () => {
      await webService.start();

      const response = await makeRequest(config.port, "/api/health");

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty("status", "ok");
      expect(response.body).toHaveProperty("timestamp");
    });
  });

  describe("stop", () => {
    it("should stop server successfully", async () => {
      await webService.start();
      const result = await webService.stop();

      expect(result.success).toBe(true);
      expect(webService.isRunning()).toBe(false);
    });

    it("should return error if server not running", async () => {
      const result = await webService.stop();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as WebError).code).toBe("WEB_SERVER_NOT_RUNNING");
      }
    });

    it("should not be accessible after stopping", async () => {
      await webService.start();
      await webService.stop();

      await expect(makeRequest(config.port, "/api/health")).rejects.toThrow();
    });
  });

  describe("API endpoints", () => {
    beforeEach(async () => {
      await webService.start();
    });

    it("should respond to health check", async () => {
      const response = await makeRequest(config.port, "/api/health");

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe("ok");
    });

    it("should respond to GPS position endpoint", async () => {
      const response = await makeRequest(config.port, "/api/gps/position");

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty("message");
    });

    it("should respond to GPS status endpoint", async () => {
      const response = await makeRequest(config.port, "/api/gps/status");

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty("message");
    });

    it("should respond to map files endpoint", async () => {
      const response = await makeRequest(config.port, "/api/map/files");

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty("message");
    });

    it("should respond to active map endpoint", async () => {
      const response = await makeRequest(config.port, "/api/map/active");

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty("message");
    });

    it("should respond to system status endpoint", async () => {
      const response = await makeRequest(config.port, "/api/system/status");

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 404 for unknown endpoints", async () => {
      const response = await makeRequest(config.port, "/api/unknown");

      expect(response.statusCode).toBe(404);
      expect(response.body).toHaveProperty("error", "Not Found");
    });

    it("should handle POST requests", async () => {
      const response = await makeRequest(
        config.port,
        "/api/display/update",
        "POST",
        { action: "refresh" },
      );

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("WebSocket", () => {
    it("should have WebSocket enabled by default", async () => {
      await webService.start();

      // WebSocket functionality exists (full testing would require socket.io-client)
      expect(webService.isRunning()).toBe(true);
    });

    it("should support broadcast method", async () => {
      await webService.start();

      // Should not throw
      expect(() => {
        webService.broadcast("test", { data: "test" });
      }).not.toThrow();
    });

    it("should support connection handler registration", async () => {
      await webService.start();

      const handler = jest.fn();

      // Should not throw
      expect(() => {
        webService.onWebSocketConnection(handler);
      }).not.toThrow();
    });
  });

  describe("configuration", () => {
    it("should work without WebSocket", async () => {
      const noWsConfig = {
        ...config,
        websocket: { enabled: false },
      };

      const noWsService = new WebInterfaceService(noWsConfig);
      const result = await noWsService.start();

      expect(result.success).toBe(true);

      await noWsService.stop();
    });

    it("should work without CORS", async () => {
      const noCorsConfig = {
        ...config,
        cors: false,
      };

      const noCorsService = new WebInterfaceService(noCorsConfig);
      const result = await noCorsService.start();

      expect(result.success).toBe(true);

      await noCorsService.stop();
    });
  });
});

/**
 * Helper function to make HTTP requests for testing
 */
function makeRequest(
  port: number,
  path: string,
  method: string = "GET",
  data?: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : undefined;

    const options = {
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: postData
        ? {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
          }
        : {},
    };

    const req = http.request(options, (res) => {
      let body = "";

      res.on("data", (chunk) => {
        body += chunk;
      });

      res.on("end", () => {
        try {
          resolve({
            statusCode: res.statusCode || 500,
            body: JSON.parse(body),
          });
        } catch {
          resolve({
            statusCode: res.statusCode || 500,
            body: {},
          });
        }
      });
    });

    req.on("error", reject);

    if (postData) {
      req.write(postData);
    }

    req.end();
  });
}
