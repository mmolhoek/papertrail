import express, { Express, Request, Response, NextFunction } from "express";
import http from "http";
import path from "path";
import { Server as SocketIOServer } from "socket.io";
import { Result, success, failure, WebConfig } from "@core/types";
import { WebError, WebErrorCode } from "@core/errors";
import { IWebInterfaceService } from "core/interfaces";

/**
 * Web Interface Service Implementation
 *
 * Provides HTTP API and WebSocket communication for the mobile interface
 */
export class WebInterfaceService implements IWebInterfaceService {
  private app: Express;
  private server: http.Server | null = null;
  private io: SocketIOServer | null = null;
  private running: boolean = false;

  constructor(
    private readonly config: WebConfig = {
      port: 3000,
      host: "0.0.0.0",
      cors: true,
      apiBasePath: "/api",
      staticDirectory: path.join(__dirname, "../../web/public"),
      websocket: {
        enabled: true,
      },
    },
  ) {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Initialize and start the web server
   */
  async start(): Promise<Result<void>> {
    if (this.running) {
      return success(undefined);
    }

    try {
      this.server = http.createServer(this.app);

      // Setup WebSocket if enabled
      if (this.config.websocket?.enabled) {
        this.io = new SocketIOServer(this.server, {
          cors: this.config.cors
            ? {
                origin: "*",
                methods: ["GET", "POST"],
              }
            : undefined,
        });

        this.setupWebSocket();
      }

      // Start listening
      await new Promise<void>((resolve, reject) => {
        this.server!.listen(this.config.port, this.config.host, () => {
          resolve();
        }).on("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "EADDRINUSE") {
            reject(WebError.portInUse(this.config.port));
          } else {
            reject(err);
          }
        });
      });

      this.running = true;
      console.log(
        `Web server started on http://${this.config.host}:${this.config.port}`,
      );

      return success(undefined);
    } catch (error) {
      if (error instanceof WebError) {
        return failure(error);
      }
      if (error instanceof Error) {
        return failure(WebError.serverStartFailed(this.config.port, error));
      }
      return failure(
        WebError.serverStartFailed(
          this.config.port,
          new Error("Unknown error"),
        ),
      );
    }
  }

  /**
   * Stop the web server
   */
  async stop(): Promise<Result<void>> {
    if (!this.running || !this.server) {
      return failure(WebError.serverNotRunning());
    }

    try {
      // Close WebSocket connections
      if (this.io) {
        this.io.close();
        this.io = null;
      }

      // Close HTTP server
      await new Promise<void>((resolve, reject) => {
        this.server!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      this.server = null;
      this.running = false;
      console.log("Web server stopped");

      return success(undefined);
    } catch (error) {
      if (error instanceof Error) {
        return failure(
          new WebError(
            `Failed to stop server: ${error.message}`,
            WebErrorCode.SERVER_STOP_FAILED,
            false,
            { originalError: error.message },
          ),
        );
      }
      return failure(
        new WebError(
          "Failed to stop server",
          WebErrorCode.SERVER_STOP_FAILED,
          false,
        ),
      );
    }
  }

  /**
   * Check if the web server is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the server URL
   */
  getServerUrl(): string {
    const host =
      this.config.host === "0.0.0.0" ? "localhost" : this.config.host;
    return `http://${host}:${this.config.port}`;
  }

  /**
   * Get the server port
   */
  getPort(): number {
    return this.config.port;
  }

  /**
   * Register a WebSocket connection handler
   */
  onWebSocketConnection(handler: (socket: any) => void): void {
    if (this.io) {
      this.io.on("connection", handler);
    }
  }

  /**
   * Broadcast a message to all connected WebSocket clients
   */
  broadcast(event: string, data: any): void {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS
    if (this.config.cors) {
      this.app.use((req, res, next) => {
        res.header("Access-Control-Allow-Origin", "*");
        res.header(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, DELETE, OPTIONS",
        );
        res.header(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization",
        );

        if (req.method === "OPTIONS") {
          res.sendStatus(200);
        } else {
          next();
        }
      });
    }

    // Static files
    this.app.use(express.static(this.config.staticDirectory));

    // Logging middleware
    this.app.use((req, res, next) => {
      console.log(`${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup Express routes
   */
  private setupRoutes(): void {
    const api = this.config.apiBasePath;

    // Health check
    this.app.get(`${api}/health`, (req, res) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // Placeholder routes - will be connected to orchestrator later
    this.app.get(`${api}/gps/position`, (req, res) => {
      res.json({
        message: "GPS position endpoint",
        // Will return actual GPS data when connected to orchestrator
      });
    });

    this.app.get(`${api}/gps/status`, (req, res) => {
      res.json({
        message: "GPS status endpoint",
      });
    });

    this.app.get(`${api}/map/files`, (req, res) => {
      res.json({
        message: "List GPX files endpoint",
      });
    });

    this.app.get(`${api}/map/active`, (req, res) => {
      res.json({
        message: "Get active GPX file endpoint",
      });
    });

    this.app.post(`${api}/map/active`, (req, res) => {
      res.json({
        message: "Set active GPX file endpoint",
      });
    });

    this.app.post(`${api}/display/update`, (req, res) => {
      res.json({
        message: "Update display endpoint",
      });
    });

    this.app.post(`${api}/display/clear`, (req, res) => {
      res.json({
        message: "Clear display endpoint",
      });
    });

    this.app.get(`${api}/system/status`, (req, res) => {
      res.json({
        message: "System status endpoint",
      });
    });

    this.app.post(`${api}/config/zoom`, (req, res) => {
      res.json({
        message: "Set zoom level endpoint",
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: "Not Found",
        path: req.path,
      });
    });

    // Error handler
    this.app.use(
      (err: Error, req: Request, res: Response, _next: NextFunction) => {
        console.error("Express error:", err);
        res.status(500).json({
          error: "Internal Server Error",
          message: err.message,
        });
      },
    );
  }

  /**
   * Setup WebSocket handlers
   */
  private setupWebSocket(): void {
    if (!this.io) return;

    this.io.on("connection", (socket) => {
      console.log("Client connected:", socket.id);

      // Handle disconnection
      socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
      });

      // Ping/pong for connection health
      socket.on("ping", () => {
        socket.emit("pong");
      });

      // Placeholder event handlers - will be connected to orchestrator later
      socket.on("gps:subscribe", () => {
        console.log("Client subscribed to GPS updates");

        // Will emit GPS updates when connected to orchestrator
      });

      socket.on("gps:unsubscribe", () => {
        console.log("Client unsubscribed from GPS updates");
      });

      socket.on("display:refresh", () => {
        console.log("Client requested display refresh");
        // Will trigger display update when connected to orchestrator
      });
    });
  }
}
