import express, { Express } from "express";
import http from "http";
import https from "https";
import path from "path";
import * as fs from "fs/promises";
import multer from "multer";
import { Server as SocketIOServer, Socket } from "socket.io";
import { Result, success, failure, WebConfig } from "../core/types";
import {
  IRenderingOrchestrator,
  IWebInterfaceService,
  IWiFiService,
  IMapService,
  IConfigService,
  ITrackSimulationService,
  IDriveNavigationService,
  IMapSnapService,
  IOfflineRoutingService,
} from "@core/interfaces";
import { WebError, WebErrorCode } from "../core/errors";
import { WebController } from "./controllers/WebController";
import { getLogger } from "../utils/logger";
import { isNodeJSErrnoException } from "@utils/typeGuards";
import {
  UPLOAD_DEFAULT_TEMP_DIRECTORY,
  UPLOAD_MAX_AGE_MS,
  UPLOAD_CLEANUP_INTERVAL_MS,
} from "@core/constants";
import {
  validateBody,
  validateParams,
  setMockPositionSchema,
  setZoomSchema,
  setAutoCenterSchema,
  setCenterOverrideSchema,
  setRotateWithBearingSchema,
  setActiveScreenSchema,
  setSpeedUnitSchema,
  setPOICategorySchema,
  setShowLocationNameSchema,
  setShowRoadsSchema,
  setShowWaterSchema,
  setShowWaterwaysSchema,
  setShowLanduseSchema,
  setShowSpeedLimitSchema,
  setShowElevationSchema,
  setShowRoadSurfaceSchema,
  setRoutingProfileSchema,
  addRecentDestinationSchema,
  removeRecentDestinationSchema,
  resolveGoogleMapsLinkSchema,
  setHotspotConfigSchema,
  startSimulationSchema,
  setSimulationSpeedSchema,
  saveDriveRouteSchema,
  startDriveNavigationSchema,
  simulateDriveRouteSchema,
  setActiveMapSchema,
  deleteGPXFileParamsSchema,
  deleteDriveRouteParamsSchema,
} from "@web/validation";

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
  private simulationPositionUnsubscribe: (() => void) | null = null;
  private simulationStateUnsubscribe: (() => void) | null = null;
  private driveNavigationUnsubscribe: (() => void) | null = null;
  private speedLimitPrefetchUnsubscribe: (() => void) | null = null;
  private poiPrefetchUnsubscribe: (() => void) | null = null;
  private locationPrefetchUnsubscribe: (() => void) | null = null;
  private elevationPrefetchUnsubscribe: (() => void) | null = null;
  private roadSurfacePrefetchUnsubscribe: (() => void) | null = null;
  private latestGPSStatus: {
    fixQuality: number;
    satellitesInUse: number;
    hdop: number;
  } | null = null;

  // Client count tracking for WiFi mode awareness
  private connectedClientCount = 0;

  // Track if we've already emitted the arrived event to avoid duplicates
  private hasEmittedArrived = false;

  // Upload cleanup timer
  private uploadCleanupTimer: NodeJS.Timeout | null = null;
  private readonly uploadDirectory: string;

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
    private readonly simulationService?: ITrackSimulationService,
    private readonly driveNavigationService?: IDriveNavigationService,
    private readonly mapSnapService?: IMapSnapService,
    private readonly offlineRoutingService?: IOfflineRoutingService,
  ) {
    this.app = express();
    this.controller = new WebController(
      orchestrator,
      wifiService,
      mapService,
      gpxDirectory,
      configService,
      simulationService,
      driveNavigationService,
      mapSnapService,
      offlineRoutingService,
    );
    // Use app-controlled upload directory instead of /tmp for better security
    this.uploadDirectory = path.resolve(UPLOAD_DEFAULT_TEMP_DIRECTORY);
    // Configure multer for file uploads
    this.upload = multer({
      dest: this.uploadDirectory,
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
      // Ensure upload directory exists
      await this.ensureUploadDirectory();

      // Start orphaned upload cleanup timer
      this.startUploadCleanupTimer();

      // Create HTTP or HTTPS server based on SSL configuration
      if (this.config.ssl?.enabled) {
        const sslOptions = {
          key: await fs.readFile(this.config.ssl.keyPath),
          cert: await fs.readFile(this.config.ssl.certPath),
        };
        this.server = https.createServer(sslOptions, this.app);
      } else {
        this.server = http.createServer(this.app);
      }

      // Setup WebSocket if enabled
      if (this.config.websocket?.enabled) {
        this.io = new SocketIOServer(this.server, {
          cors: this.config.cors
            ? {
                // Use configured origins if specified, otherwise allow all (*).
                // Allowing all origins is intentional for local device use - the GPS tracker
                // needs to be controlled from mobile phones/tablets on the same network.
                origin:
                  this.config.corsOrigins && this.config.corsOrigins.length > 0
                    ? this.config.corsOrigins
                    : "*",
                methods: ["GET", "POST"],
              }
            : undefined,
        });

        this.setupWebSocket();

        // Configure download progress emitter for offline routing
        this.setupDownloadProgressEmitter();
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
      const protocol = this.config.ssl?.enabled ? "https" : "http";
      logger.info(
        `✓ Web interface started on ${protocol}://${this.config.host}:${this.config.port}`,
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
      // Stop upload cleanup timer
      this.stopUploadCleanupTimer();

      // Clean up any remaining temp files on shutdown
      await this.cleanupAllTempFiles();

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
    const protocol = this.config.ssl?.enabled ? "https" : "http";
    return `${protocol}://${host}:${this.config.port}`;
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
  broadcast(event: string, data: unknown): void {
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

    // CORS (Cross-Origin Resource Sharing)
    // By default, allows all origins (*) to enable the mobile web interface to work
    // from any device on the local network. This is intentional for a GPS tracker
    // device that needs to be controlled from phones/tablets.
    // For restricted environments, use WEB_CORS_ORIGINS to specify allowed origins.
    if (this.config.cors) {
      this.app.use((req, res, next) => {
        // Determine allowed origin
        let allowedOrigin = "*";
        if (
          this.config.corsOrigins &&
          this.config.corsOrigins.length > 0 &&
          req.headers.origin
        ) {
          // Check if the request origin is in the allowed list
          const requestOrigin = req.headers.origin;
          if (this.config.corsOrigins.includes(requestOrigin)) {
            allowedOrigin = requestOrigin;
          } else {
            // Origin not allowed - don't set CORS headers, browser will block
            allowedOrigin = "";
          }
        }

        if (allowedOrigin) {
          res.header("Access-Control-Allow-Origin", allowedOrigin);
          res.header(
            "Access-Control-Allow-Methods",
            "GET, POST, PUT, DELETE, OPTIONS",
          );
          res.header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization",
          );
        }

        if (req.method === "OPTIONS") {
          res.sendStatus(allowedOrigin ? 200 : 403);
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

    // Mock GPS endpoints (development only)
    this.app.get(`${api}/gps/mock`, (req, res) =>
      this.controller.checkMockGPS(req, res),
    );

    this.app.post(
      `${api}/gps/mock/position`,
      validateBody(setMockPositionSchema),
      (req, res) => this.controller.setMockGPSPosition(req, res),
    );

    // Map endpoints
    this.app.get(`${api}/map/files`, (req, res) =>
      this.controller.getGPXFiles(req, res),
    );

    this.app.get(`${api}/map/active`, (req, res) =>
      this.controller.getActiveGPX(req, res),
    );

    this.app.get(`${api}/map/track/start`, (req, res) =>
      this.controller.getActiveTrackStart(req, res),
    );

    this.app.post(
      `${api}/map/active`,
      validateBody(setActiveMapSchema),
      (req, res) => this.controller.setActiveGPX(req, res),
    );

    // Display endpoints
    this.app.post(`${api}/display/update`, (req, res) =>
      this.controller.updateDisplay(req, res),
    );

    this.app.post(`${api}/display/clear`, (req, res) => {
      logger.info("Clearing display via API");
      this.controller.clearDisplay(req, res);
    });

    this.app.post(`${api}/display/logo`, (req, res) => {
      logger.info("Displaying logo via API");
      this.controller.displayLogo(req, res);
    });

    // System endpoints
    this.app.get(`${api}/system/status`, (req, res) =>
      this.controller.getSystemStatus(req, res),
    );

    // Config endpoints
    this.app.get(`${api}/config/display`, (req, res) =>
      this.controller.getDisplaySettings(req, res),
    );

    this.app.post(
      `${api}/config/zoom`,
      validateBody(setZoomSchema),
      (req, res) => this.controller.setZoom(req, res),
    );

    this.app.post(
      `${api}/config/auto-center`,
      validateBody(setAutoCenterSchema),
      (req, res) => this.controller.setAutoCenter(req, res),
    );

    this.app.post(
      `${api}/config/center-override`,
      validateBody(setCenterOverrideSchema),
      (req, res) => this.controller.setCenterOverride(req, res),
    );

    this.app.delete(`${api}/config/center-override`, (req, res) =>
      this.controller.clearCenterOverride(req, res),
    );

    this.app.post(
      `${api}/config/rotate-bearing`,
      validateBody(setRotateWithBearingSchema),
      (req, res) => this.controller.setRotateWithBearing(req, res),
    );

    this.app.post(
      `${api}/config/screen`,
      validateBody(setActiveScreenSchema),
      (req, res) => this.controller.setActiveScreen(req, res),
    );

    this.app.post(
      `${api}/config/speed-unit`,
      validateBody(setSpeedUnitSchema),
      (req, res) => this.controller.setSpeedUnit(req, res),
    );

    this.app.post(
      `${api}/config/poi-category`,
      validateBody(setPOICategorySchema),
      (req, res) => this.controller.setPOICategory(req, res),
    );

    this.app.post(
      `${api}/config/show-location-name`,
      validateBody(setShowLocationNameSchema),
      (req, res) => this.controller.setShowLocationName(req, res),
    );

    this.app.post(
      `${api}/config/show-roads`,
      validateBody(setShowRoadsSchema),
      (req, res) => this.controller.setShowRoads(req, res),
    );

    this.app.post(
      `${api}/config/show-water`,
      validateBody(setShowWaterSchema),
      (req, res) => this.controller.setShowWater(req, res),
    );

    this.app.post(
      `${api}/config/show-waterways`,
      validateBody(setShowWaterwaysSchema),
      (req, res) => this.controller.setShowWaterways(req, res),
    );

    this.app.post(
      `${api}/config/show-landuse`,
      validateBody(setShowLanduseSchema),
      (req, res) => this.controller.setShowLanduse(req, res),
    );

    this.app.post(
      `${api}/config/show-speed-limit`,
      validateBody(setShowSpeedLimitSchema),
      (req, res) => this.controller.setShowSpeedLimit(req, res),
    );

    this.app.post(
      `${api}/config/show-elevation`,
      validateBody(setShowElevationSchema),
      (req, res) => this.controller.setShowElevation(req, res),
    );

    this.app.post(
      `${api}/config/show-road-surface`,
      validateBody(setShowRoadSurfaceSchema),
      (req, res) => this.controller.setShowRoadSurface(req, res),
    );

    // Track mode map feature routes
    this.app.post(
      `${api}/config/show-roads-track-mode`,
      validateBody(setShowRoadsSchema),
      (req, res) => this.controller.setShowRoadsInTrackMode(req, res),
    );

    this.app.post(
      `${api}/config/show-water-track-mode`,
      validateBody(setShowWaterSchema),
      (req, res) => this.controller.setShowWaterInTrackMode(req, res),
    );

    this.app.post(
      `${api}/config/show-waterways-track-mode`,
      validateBody(setShowWaterwaysSchema),
      (req, res) => this.controller.setShowWaterwaysInTrackMode(req, res),
    );

    this.app.post(
      `${api}/config/show-landuse-track-mode`,
      validateBody(setShowLanduseSchema),
      (req, res) => this.controller.setShowLanduseInTrackMode(req, res),
    );

    this.app.post(
      `${api}/config/routing-profile`,
      validateBody(setRoutingProfileSchema),
      (req, res) => this.controller.setRoutingProfile(req, res),
    );

    // Recent destinations endpoints
    this.app.get(`${api}/destinations/recent`, (req, res) =>
      this.controller.getRecentDestinations(req, res),
    );

    this.app.post(
      `${api}/destinations/recent`,
      validateBody(addRecentDestinationSchema),
      (req, res) => this.controller.addRecentDestination(req, res),
    );

    this.app.delete(
      `${api}/destinations/recent`,
      validateBody(removeRecentDestinationSchema),
      (req, res) => this.controller.removeRecentDestination(req, res),
    );

    this.app.delete(`${api}/destinations/recent/all`, (req, res) =>
      this.controller.clearRecentDestinations(req, res),
    );

    this.app.post(
      `${api}/destinations/resolve-google-maps`,
      validateBody(resolveGoogleMapsLinkSchema),
      (req, res) => this.controller.resolveGoogleMapsLink(req, res),
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

    this.app.post(
      `${api}/wifi/hotspot`,
      validateBody(setHotspotConfigSchema),
      (req, res) => this.controller.setHotspotConfig(req, res),
    );

    // GPX file management endpoints
    this.app.post(
      `${api}/map/upload`,
      this.upload.single("gpxFile"),
      (req, res) => this.controller.uploadGPXFile(req, res),
    );

    this.app.delete(
      `${api}/map/files/:fileName`,
      validateParams(deleteGPXFileParamsSchema),
      (req, res) => this.controller.deleteGPXFile(req, res),
    );

    // Track snap endpoint (map matching)
    this.app.post(`${api}/map/snap`, (req, res) =>
      this.controller.snapActiveTrack(req, res),
    );

    // System reset endpoint
    this.app.post(`${api}/system/reset`, (req, res) =>
      this.controller.resetSystem(req, res),
    );

    // Track simulation endpoints
    this.app.post(
      `${api}/simulation/start`,
      validateBody(startSimulationSchema),
      (req, res) => this.controller.startSimulation(req, res),
    );

    this.app.post(`${api}/simulation/stop`, (req, res) =>
      this.controller.stopSimulation(req, res),
    );

    this.app.post(`${api}/simulation/pause`, (req, res) =>
      this.controller.pauseSimulation(req, res),
    );

    this.app.post(`${api}/simulation/resume`, (req, res) =>
      this.controller.resumeSimulation(req, res),
    );

    this.app.post(
      `${api}/simulation/speed`,
      validateBody(setSimulationSpeedSchema),
      (req, res) => this.controller.setSimulationSpeed(req, res),
    );

    this.app.get(`${api}/simulation/status`, (req, res) =>
      this.controller.getSimulationStatus(req, res),
    );

    // Drive navigation endpoints
    this.app.post(
      `${api}/drive/route`,
      validateBody(saveDriveRouteSchema),
      (req, res) => this.controller.saveDriveRoute(req, res),
    );

    this.app.get(`${api}/drive/route`, (req, res) =>
      this.controller.getActiveDriveRoute(req, res),
    );

    this.app.get(`${api}/drive/routes`, (req, res) =>
      this.controller.listDriveRoutes(req, res),
    );

    this.app.delete(
      `${api}/drive/route/:routeId`,
      validateParams(deleteDriveRouteParamsSchema),
      (req, res) => this.controller.deleteDriveRoute(req, res),
    );

    this.app.post(
      `${api}/drive/start`,
      validateBody(startDriveNavigationSchema),
      (req, res) => this.controller.startDriveNavigation(req, res),
    );

    this.app.post(`${api}/drive/stop`, (req, res) =>
      this.controller.stopDriveNavigation(req, res),
    );

    this.app.get(`${api}/drive/status`, (req, res) =>
      this.controller.getDriveNavigationStatus(req, res),
    );

    this.app.get(`${api}/drive/calculate`, (req, res) =>
      this.controller.calculateRoute(req, res),
    );

    this.app.post(
      `${api}/drive/simulate`,
      validateBody(simulateDriveRouteSchema),
      (req, res) => this.controller.simulateDriveRoute(req, res),
    );

    this.app.post(`${api}/drive/show-route`, (req, res) =>
      this.controller.showFullRoute(req, res),
    );

    // Mock display endpoints (for development)
    this.app.get(`${api}/mock-display/image`, (req, res) =>
      this.controller.getMockDisplayImage(req, res),
    );

    this.app.get(`${api}/mock-display/status`, (req, res) =>
      this.controller.getMockDisplayStatus(req, res),
    );

    // Offline routing endpoints
    // Serve local sample manifest for testing
    this.app.get(`${api}/routing/sample-manifest`, (_req, res) => {
      const manifestPath = path.join(
        process.cwd(),
        "data/osrm-regions/manifest.json",
      );
      res.sendFile(manifestPath, (err) => {
        if (err) {
          res.status(404).json({
            success: false,
            error: "Sample manifest not found",
          });
        }
      });
    });

    this.app.get(`${api}/routing/status`, (req, res) =>
      this.controller.offlineRouting.getStatus(req, res),
    );

    this.app.get(`${api}/routing/regions/available`, (req, res) =>
      this.controller.offlineRouting.getAvailableRegions(req, res),
    );

    this.app.get(`${api}/routing/regions/installed`, (req, res) =>
      this.controller.offlineRouting.getInstalledRegions(req, res),
    );

    this.app.post(`${api}/routing/regions/:regionId/download`, (req, res) =>
      this.controller.offlineRouting.downloadRegion(req, res),
    );

    this.app.delete(`${api}/routing/regions/:regionId`, (req, res) =>
      this.controller.offlineRouting.deleteRegion(req, res),
    );

    this.app.post(`${api}/routing/regions/:regionId/load`, (req, res) =>
      this.controller.offlineRouting.loadRegion(req, res),
    );

    this.app.post(`${api}/routing/regions/:regionId/unload`, (req, res) =>
      this.controller.offlineRouting.unloadRegion(req, res),
    );

    this.app.post(`${api}/routing/config/enabled`, (req, res) =>
      this.controller.offlineRouting.setEnabled(req, res),
    );

    this.app.post(`${api}/routing/config/prefer-offline`, (req, res) =>
      this.controller.offlineRouting.setPreferOffline(req, res),
    );

    this.app.post(`${api}/routing/config/manifest-url`, (req, res) =>
      this.controller.offlineRouting.setManifestUrl(req, res),
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
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
   * Setup the download progress emitter for offline routing
   * This allows the controller to broadcast download progress via WebSocket
   */
  private setupDownloadProgressEmitter(): void {
    this.controller.offlineRouting.setProgressEmitter((progress) => {
      this.broadcast("offline-routing:download-progress", progress);
    });
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
      // Skip real GPS updates when simulation is running
      // to avoid flickering between real (no fix) and simulated positions
      if (this.simulationService?.isSimulating()) {
        return;
      }

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

    // Subscribe to simulation position updates (if simulation service provided)
    if (this.simulationService) {
      this.simulationPositionUnsubscribe =
        this.simulationService.onPositionUpdate((position) => {
          // Broadcast simulated GPS position to all clients
          // Mark fixQuality as SIMULATION (8) to indicate this is simulated data
          logger.debug(
            `Simulation position update: ${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`,
          );
          this.broadcast("gps:update", {
            latitude: position.latitude,
            longitude: position.longitude,
            altitude: position.altitude,
            timestamp: position.timestamp,
            speed: position.speed,
            bearing: position.bearing,
            fixQuality: 8, // SIMULATION
            satellitesInUse: 12,
            hdop: 0.5,
          });
        });

      this.simulationStateUnsubscribe = this.simulationService.onStateChange(
        (status) => {
          // Broadcast simulation state changes
          this.broadcast("simulation:status", status);
        },
      );
    }

    // Subscribe to drive navigation updates (if drive navigation service provided)
    if (this.driveNavigationService) {
      logger.info("Subscribing to DriveNavigationService updates");
      this.driveNavigationUnsubscribe =
        this.driveNavigationService.onNavigationUpdate((update) => {
          const status = update.status;
          const clientCount = this.io?.engine?.clientsCount ?? 0;
          // Broadcast drive navigation updates to all clients
          logger.info(
            `Broadcasting drive:update to ${clientCount} clients: state=${status.state}, waypoint=${status.currentWaypointIndex}, dist=${Math.round(status.distanceToNextTurn)}m`,
          );
          this.broadcast("drive:update", {
            state: status.state,
            displayMode: status.displayMode,
            currentWaypointIndex: status.currentWaypointIndex,
            distanceToNextTurn: status.distanceToNextTurn,
            bearingToNextTurn: status.bearingToRoute,
            nextManeuver: status.nextTurn?.maneuverType,
            instruction: status.nextTurn?.instruction,
            streetName: status.nextTurn?.streetName,
            progress: status.progress,
            distanceRemaining: status.distanceRemaining,
            timeRemaining: status.timeRemaining,
            isOffRoad: status.state === "off_road",
            distanceToRouteStart: status.distanceToRoute,
            bearingToRouteStart: status.bearingToRoute,
            // Extra info from DriveCoordinator cache
            roadSurface: this.orchestrator.getCurrentRoadSurface(),
            speedLimit: this.orchestrator.getCurrentSpeedLimit(),
            locationName: this.orchestrator.getCurrentLocationName(),
          });

          // Also emit specific events for key state changes
          if (status.state === "arrived" && !this.hasEmittedArrived) {
            this.hasEmittedArrived = true;
            this.broadcast("drive:arrived", {
              destination:
                this.driveNavigationService?.getActiveRoute()?.destination,
            });
          } else if (status.state !== "arrived") {
            // Reset the flag when not in arrived state
            this.hasEmittedArrived = false;
          }
          if (status.state === "off_road") {
            this.broadcast("drive:off-road", {
              distance: status.distanceToRoute,
              bearing: status.bearingToRoute,
            });
          }
        });
    }

    // Subscribe to speed limit prefetch progress updates
    this.speedLimitPrefetchUnsubscribe =
      this.orchestrator.onSpeedLimitPrefetchProgress((progress) => {
        logger.debug(
          `Speed limit prefetch progress: ${progress.current}/${progress.total} (${progress.segmentsFound} segments)`,
        );
        this.broadcast("speedlimit:prefetch", {
          current: progress.current,
          total: progress.total,
          segmentsFound: progress.segmentsFound,
          complete: progress.complete,
        });
      });

    // Subscribe to POI prefetch progress updates
    this.poiPrefetchUnsubscribe = this.orchestrator.onPOIPrefetchProgress(
      (progress) => {
        logger.debug(
          `POI prefetch progress: ${progress.current}/${progress.total} (${progress.poisFound} POIs)`,
        );
        this.broadcast("poi:prefetch", {
          current: progress.current,
          total: progress.total,
          poisFound: progress.poisFound,
          complete: progress.complete,
        });
      },
    );

    // Subscribe to location prefetch progress updates
    this.locationPrefetchUnsubscribe =
      this.orchestrator.onLocationPrefetchProgress((progress) => {
        logger.debug(
          `Location prefetch progress: ${progress.current}/${progress.total} (${progress.locationsCached} locations)`,
        );
        this.broadcast("location:prefetch", {
          current: progress.current,
          total: progress.total,
          locationsCached: progress.locationsCached,
          complete: progress.complete,
        });
      });

    // Subscribe to elevation prefetch progress updates
    this.elevationPrefetchUnsubscribe =
      this.orchestrator.onElevationPrefetchProgress((progress) => {
        logger.debug(
          `Elevation prefetch progress: ${progress.current}/${progress.total} (${progress.pointsCached} points)`,
        );
        this.broadcast("elevation:prefetch", {
          current: progress.current,
          total: progress.total,
          pointsCached: progress.pointsCached,
          complete: progress.complete,
        });
      });

    // Subscribe to road surface prefetch progress updates
    this.roadSurfacePrefetchUnsubscribe =
      this.orchestrator.onRoadSurfacePrefetchProgress((progress) => {
        logger.debug(
          `Road surface prefetch progress: ${progress.current}/${progress.total} (${progress.segmentsFound} segments)`,
        );
        this.broadcast("roadsurface:prefetch", {
          current: progress.current,
          total: progress.total,
          segmentsFound: progress.segmentsFound,
          complete: progress.complete,
        });
      });
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

    if (this.simulationPositionUnsubscribe) {
      this.simulationPositionUnsubscribe();
      this.simulationPositionUnsubscribe = null;
    }

    if (this.simulationStateUnsubscribe) {
      this.simulationStateUnsubscribe();
      this.simulationStateUnsubscribe = null;
    }

    if (this.driveNavigationUnsubscribe) {
      this.driveNavigationUnsubscribe();
      this.driveNavigationUnsubscribe = null;
    }

    if (this.speedLimitPrefetchUnsubscribe) {
      this.speedLimitPrefetchUnsubscribe();
      this.speedLimitPrefetchUnsubscribe = null;
    }

    if (this.poiPrefetchUnsubscribe) {
      this.poiPrefetchUnsubscribe();
      this.poiPrefetchUnsubscribe = null;
    }

    if (this.locationPrefetchUnsubscribe) {
      this.locationPrefetchUnsubscribe();
      this.locationPrefetchUnsubscribe = null;
    }

    if (this.elevationPrefetchUnsubscribe) {
      this.elevationPrefetchUnsubscribe();
      this.elevationPrefetchUnsubscribe = null;
    }

    if (this.roadSurfacePrefetchUnsubscribe) {
      this.roadSurfacePrefetchUnsubscribe();
      this.roadSurfacePrefetchUnsubscribe = null;
    }
  }

  // ==========================================================================
  // Upload Directory Management
  // ==========================================================================

  /**
   * Ensure the upload directory exists
   */
  private async ensureUploadDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.uploadDirectory, { recursive: true });
      logger.debug(`Upload directory ready: ${this.uploadDirectory}`);
    } catch (error) {
      logger.error("Failed to create upload directory:", error);
      throw error;
    }
  }

  /**
   * Start the periodic cleanup timer for orphaned uploads
   */
  private startUploadCleanupTimer(): void {
    // Run initial cleanup
    this.cleanupOrphanedUploads().catch((err) =>
      logger.error("Initial upload cleanup failed:", err),
    );

    // Schedule periodic cleanup
    this.uploadCleanupTimer = setInterval(() => {
      this.cleanupOrphanedUploads().catch((err) =>
        logger.error("Scheduled upload cleanup failed:", err),
      );
    }, UPLOAD_CLEANUP_INTERVAL_MS);

    logger.debug(
      `Upload cleanup timer started (interval: ${UPLOAD_CLEANUP_INTERVAL_MS}ms)`,
    );
  }

  /**
   * Stop the upload cleanup timer
   */
  private stopUploadCleanupTimer(): void {
    if (this.uploadCleanupTimer) {
      clearInterval(this.uploadCleanupTimer);
      this.uploadCleanupTimer = null;
      logger.debug("Upload cleanup timer stopped");
    }
  }

  /**
   * Clean up orphaned upload files (older than UPLOAD_MAX_AGE_MS)
   */
  private async cleanupOrphanedUploads(): Promise<void> {
    try {
      const files = await fs.readdir(this.uploadDirectory);
      const now = Date.now();
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.uploadDirectory, file);
        try {
          const stats = await fs.stat(filePath);
          const age = now - stats.mtimeMs;

          if (age > UPLOAD_MAX_AGE_MS) {
            await fs.unlink(filePath);
            cleanedCount++;
            logger.debug(
              `Cleaned up orphaned upload: ${file} (age: ${Math.round(age / 1000)}s)`,
            );
          }
        } catch (error) {
          // File may have been deleted by another process
          logger.debug(`Could not process file ${file}:`, error);
        }
      }

      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} orphaned upload file(s)`);
      }
    } catch (error) {
      // Directory may not exist yet
      if (!isNodeJSErrnoException(error) || error.code !== "ENOENT") {
        logger.error("Failed to cleanup orphaned uploads:", error);
      }
    }
  }

  /**
   * Clean up all temp files in the upload directory (called on shutdown)
   */
  private async cleanupAllTempFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.uploadDirectory);
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.uploadDirectory, file);
        try {
          await fs.unlink(filePath);
          cleanedCount++;
        } catch (error) {
          logger.debug(`Could not delete file ${file}:`, error);
        }
      }

      if (cleanedCount > 0) {
        logger.info(
          `Cleaned up ${cleanedCount} temp upload file(s) on shutdown`,
        );
      }
    } catch (error) {
      if (!isNodeJSErrnoException(error) || error.code !== "ENOENT") {
        logger.error("Failed to cleanup temp files on shutdown:", error);
      }
    }
  }
}
