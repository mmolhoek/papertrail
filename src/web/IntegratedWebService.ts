import express, { Express } from "express";
import http from "http";
import path from "path";
import multer from "multer";
import { Server as SocketIOServer, Socket } from "socket.io";
import { Result, success, failure, WebConfig } from "../core/types";
import {
  IRenderingOrchestrator,
  IWebInterfaceService,
  IWiFiService,
  IMapService,
  IConfigService,
} from "@core/interfaces";
import { WebError, WebErrorCode } from "../core/errors";
import { WebController } from "./controllers/WebController";
import { getLogger } from "../utils/logger";

const logger = getLogger("IntegratedWebService");

/**
 * Integrated Web Interface Service
 *
 * Combines WebInterfaceService with WebController to provide
 * a fully integrated web interface connected to the orchestrator.
 *
 * This service:
 * 1. Serves static files (HTML, CSS, JS)
 * 2. Handles HTTP API requests via WebController
 * 3. Manages WebSocket connections for real-time updates
 * 4. Subscribes to orchestrator events and broadcasts them to clients
 */
export class IntegratedWebService implements IWebInterfaceService {
  private app: Express;
  private server: http.Server | null = null;
  private io: SocketIOServer | null = null;
  private running: boolean = false;
  private controller: WebController;
  private upload: multer.Multer;
  private gpsUpdateUnsubscribe: (() => void) | null = null;
  private gpsStatusUnsubscribe: (() => void) | null = null;
  private displayUpdateUnsubscribe: (() => void) | null = null;
  private errorUnsubscribe: (() => void) | null = null;
  private wifiStateUnsubscribe: (() => void) | null = null;
  private latestGPSStatus: {
    fixQuality: number;
    satellitesInUse: number;
    hdop: number;
  } | null = null;

  // Client count tracking for WiFi mode awareness
  private connectedClientCount = 0;

  constructor(
    private readonly orchestrator: IRenderingOrchestrator,
    private readonly config: WebConfig = {
      port: 3000,
      host: "0.0.0.0",
      cors: true,
      apiBasePath: "/api",
      staticDirectory: path.join(__dirname, "../public"),
      websocket: {
        enabled: true,
      },
    },
    private readonly wifiService?: IWiFiService,
    private readonly mapService?: IMapService,
    private readonly gpxDirectory: string = "./data/gpx-files",
    private readonly configService?: IConfigService,
  ) {
    this.app = express();
    this.controller = new WebController(
      orchestrator,
      wifiService,
      mapService,
      gpxDirectory,
      configService,
    );
    // Configure multer for file uploads
    this.upload = multer({
      dest: "/tmp/papertrail-uploads",
      limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB max
      },
    });
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

      // Subscribe to orchestrator events
      this.subscribeToOrchestratorEvents();

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
      logger.info(
        `✓ Web interface started on http://${this.config.host}:${this.config.port}`,
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
      // Unsubscribe from orchestrator events
      this.unsubscribeFromOrchestratorEvents();

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
      logger.info("✓ Web interface stopped");

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
  onWebSocketConnection(handler: (socket: Socket) => void): void {
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
    this.app.use((req, _res, next) => {
      logger.info(`${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup Express routes connected to controller
   */
  private setupRoutes(): void {
    const api = this.config.apiBasePath;

    // Health check
    this.app.get(`${api}/health`, (req, res) =>
      this.controller.getHealth(req, res),
    );

    // GPS endpoints
    this.app.get(`${api}/gps/position`, (req, res) =>
      this.controller.getGPSPosition(req, res),
    );

    this.app.get(`${api}/gps/status`, (req, res) =>
      this.controller.getGPSStatus(req, res),
    );

    // Map endpoints
    this.app.get(`${api}/map/files`, (req, res) =>
      this.controller.getGPXFiles(req, res),
    );

    this.app.get(`${api}/map/active`, (req, res) =>
      this.controller.getActiveGPX(req, res),
    );

    this.app.post(`${api}/map/active`, (req, res) =>
      this.controller.setActiveGPX(req, res),
    );

    // Display endpoints
    this.app.post(`${api}/display/update`, (req, res) =>
      this.controller.updateDisplay(req, res),
    );

    this.app.post(`${api}/display/clear`, (req, res) => {
      logger.info("Clearing display via API");
      this.controller.clearDisplay(req, res);
    });

    // System endpoints
    this.app.get(`${api}/system/status`, (req, res) =>
      this.controller.getSystemStatus(req, res),
    );

    // Config endpoints
    this.app.post(`${api}/config/zoom`, (req, res) =>
      this.controller.setZoom(req, res),
    );

    this.app.post(`${api}/config/auto-center`, (req, res) =>
      this.controller.setAutoCenter(req, res),
    );

    this.app.post(`${api}/config/rotate-bearing`, (req, res) =>
      this.controller.setRotateWithBearing(req, res),
    );

    // Auto-update endpoints
    this.app.post(`${api}/auto-update/start`, (req, res) =>
      this.controller.startAutoUpdate(req, res),
    );

    this.app.post(`${api}/auto-update/stop`, (req, res) =>
      this.controller.stopAutoUpdate(req, res),
    );

    // WiFi configuration endpoints
    this.app.get(`${api}/wifi/hotspot`, (req, res) =>
      this.controller.getHotspotConfig(req, res),
    );

    this.app.post(`${api}/wifi/hotspot`, (req, res) =>
      this.controller.setHotspotConfig(req, res),
    );

    // GPX file management endpoints
    this.app.post(
      `${api}/map/upload`,
      this.upload.single("gpxFile"),
      (req, res) => this.controller.uploadGPXFile(req, res),
    );

    this.app.delete(`${api}/map/files/:fileName`, (req, res) =>
      this.controller.deleteGPXFile(req, res),
    );

    // System reset endpoint
    this.app.post(`${api}/system/reset`, (req, res) =>
      this.controller.resetSystem(req, res),
    );

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Endpoint not found",
          path: req.path,
        },
      });
    });

    // Error handler
    this.app.use((err: Error, _req: any, res: any, _next: any) => {
      logger.error("Express error:", err);
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal server error",
        },
      });
    });
  }

  /**
   * Setup WebSocket handlers
   */
  private setupWebSocket(): void {
    if (!this.io) return;

    this.io.on("connection", (socket: Socket) => {
      logger.debug("Client connected:", socket.id);

      // Track client count for WiFi mode awareness
      this.connectedClientCount++;
      this.notifyWiFiServiceClientCount();
      logger.info(
        `WebSocket client connected. Total clients: ${this.connectedClientCount}`,
      );

      // Handle disconnection
      socket.on("disconnect", () => {
        logger.debug("Client disconnected:", socket.id);

        // Update client count
        this.connectedClientCount = Math.max(0, this.connectedClientCount - 1);
        this.notifyWiFiServiceClientCount();
        logger.info(
          `WebSocket client disconnected. Total clients: ${this.connectedClientCount}`,
        );
      });

      // Ping/pong for connection health
      socket.on("ping", () => {
        socket.emit("pong");
      });

      // GPS subscription
      socket.on("gps:subscribe", () => {
        logger.debug("Client subscribed to GPS updates:", socket.id);
        // Client will receive broadcasts
      });

      socket.on("gps:unsubscribe", () => {
        logger.debug("Client unsubscribed from GPS updates:", socket.id);
      });

      // Display refresh request
      socket.on("display:refresh", async () => {
        logger.debug("Client requested display refresh:", socket.id);
        await this.orchestrator.updateDisplay();
      });
    });
  }

  /**
   * Notify services of current client count
   * - WiFi service: for mode awareness (stopped/driving)
   * - Orchestrator: for "select track" screen display
   */
  private notifyWiFiServiceClientCount(): void {
    if (this.wifiService) {
      this.wifiService.setWebSocketClientCount(this.connectedClientCount);
    }
    // Notify orchestrator to show/hide the "select track" screen
    this.orchestrator.setWebSocketClientCount(this.connectedClientCount);
  }

  /**
   * Subscribe to orchestrator events and broadcast to clients
   *
   * This is the critical link that connects:
   * 1. GPS hardware → GPS Service → RenderingOrchestrator
   * 2. → IntegratedWebService (via onGPSUpdate callback)
   * 3. → WebSocket broadcast to all connected clients
   */
  private subscribeToOrchestratorEvents(): void {
    // Subscribe to GPS position updates
    // When the GPS service gets new position data, it triggers this callback
    this.gpsUpdateUnsubscribe = this.orchestrator.onGPSUpdate((position) => {
      // console.log(
      //   `Broadcasting GPS update: ${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`,
      // );

      // Broadcast to ALL connected WebSocket clients
      // Include the latest GPS status (fix quality, satellites, hdop) with the position
      this.broadcast("gps:update", {
        latitude: position.latitude,
        longitude: position.longitude,
        altitude: position.altitude,
        timestamp: position.timestamp,
        accuracy: position.accuracy,
        speed: position.speed,
        bearing: position.bearing,
        // Include current fix status
        fixQuality: this.latestGPSStatus?.fixQuality ?? 0,
        satellitesInUse: this.latestGPSStatus?.satellitesInUse ?? 0,
        hdop: this.latestGPSStatus?.hdop ?? 99.9,
      });
    });

    // Subscribe to GPS status changes
    // When GPS fix quality, satellites, or HDOP changes, broadcast to clients
    this.gpsStatusUnsubscribe = this.orchestrator.onGPSStatusChange(
      (status) => {
        logger.debug(
          `Broadcasting GPS status: fix=${status.fixQuality}, satellites=${status.satellitesInUse}`,
        );

        // Store the latest status so we can include it in position updates
        this.latestGPSStatus = {
          fixQuality: status.fixQuality,
          satellitesInUse: status.satellitesInUse,
          hdop: status.hdop,
        };

        // Broadcast to ALL connected WebSocket clients
        this.broadcast("gps:status", {
          fixQuality: status.fixQuality,
          satellitesInUse: status.satellitesInUse,
          hdop: status.hdop,
          vdop: status.vdop,
          pdop: status.pdop,
          isTracking: status.isTracking,
        });
      },
    );

    // Subscribe to display updates
    this.displayUpdateUnsubscribe = this.orchestrator.onDisplayUpdate(
      async (success) => {
        this.broadcast("display:updated", { success });

        // Also broadcast updated system status (includes active track)
        if (success) {
          const statusResult = await this.orchestrator.getSystemStatus();
          if (statusResult.success) {
            this.broadcast("status:update", statusResult.data);
          }
        }
      },
    );

    // Subscribe to errors
    this.errorUnsubscribe = this.orchestrator.onError((error) => {
      this.broadcast("error", {
        code: error.name,
        message: error.message,
      });
    });

    // Subscribe to WiFi state changes (if WiFi service provided)
    if (this.wifiService) {
      this.wifiStateUnsubscribe = this.wifiService.onStateChange(
        (state, previousState) => {
          logger.debug(`Broadcasting WiFi state: ${previousState} -> ${state}`);
          this.broadcast("wifi:state", {
            state,
            previousState,
            mode: this.wifiService?.getMode(),
            ssid: this.wifiService?.getMobileHotspotSSID(),
          });
        },
      );
    }
  }

  /**
   * Unsubscribe from orchestrator events
   */
  private unsubscribeFromOrchestratorEvents(): void {
    if (this.gpsUpdateUnsubscribe) {
      this.gpsUpdateUnsubscribe();
      this.gpsUpdateUnsubscribe = null;
    }

    if (this.gpsStatusUnsubscribe) {
      this.gpsStatusUnsubscribe();
      this.gpsStatusUnsubscribe = null;
    }

    if (this.displayUpdateUnsubscribe) {
      this.displayUpdateUnsubscribe();
      this.displayUpdateUnsubscribe = null;
    }

    if (this.errorUnsubscribe) {
      this.errorUnsubscribe();
      this.errorUnsubscribe = null;
    }

    if (this.wifiStateUnsubscribe) {
      this.wifiStateUnsubscribe();
      this.wifiStateUnsubscribe = null;
    }
  }
}
