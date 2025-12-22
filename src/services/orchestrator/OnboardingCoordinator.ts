import {
  IWiFiService,
  IConfigService,
  ITextRendererService,
  ITrackSimulationService,
  IDriveNavigationService,
  TextTemplate,
  IDisplayService,
} from "@core/interfaces";
import {
  Result,
  WiFiState,
  GPSCoordinate,
  GPSStatus,
  success,
  failure,
  DisplayUpdateMode,
} from "@core/types";
import { OrchestratorError } from "@core/errors";
import { getLogger } from "@utils/logger";
import * as os from "os";

const logger = getLogger("OnboardingCoordinator");

/**
 * Coordinates WiFi onboarding flow and related screen displays.
 *
 * Handles:
 * - WiFi state change subscriptions and callbacks
 * - Onboarding screen flow (WiFi instructions → Connected → Select Track)
 * - WebSocket client tracking for screen transitions
 * - GPS info refresh for "Select Track" screen
 */
export class OnboardingCoordinator {
  // WiFi state management
  private wifiStateCallbacks: Array<
    (state: WiFiState, previousState: WiFiState) => void
  > = [];
  private wifiStateUnsubscribe: (() => void) | null = null;

  // Debouncing for WiFi screen updates (prevent flickering)
  private lastWifiScreenUpdate: number = 0;
  private static readonly WIFI_SCREEN_DEBOUNCE_MS = 5000; // 5 seconds minimum between updates

  // Track if connected screen was successfully displayed (for retry logic)
  private connectedScreenDisplayed: boolean = false;

  // WebSocket client tracking for "select track" screen
  private webSocketClientCount: number = 0;
  private gpsInfoRefreshInterval: NodeJS.Timeout | null = null;
  private static readonly GPS_INFO_REFRESH_INTERVAL_MS = 15000; // 15 seconds

  // GPS data for select track screen (injected from orchestrator)
  private lastGPSPosition: GPSCoordinate | null = null;
  private lastGPSStatus: GPSStatus | null = null;
  private lastDisplayedGPSPosition: GPSCoordinate | null = null;
  private lastDisplayedGPSStatus: GPSStatus | null = null;

  // Error notification callback
  private errorCallback: ((error: Error) => void) | null = null;

  constructor(
    private readonly wifiService: IWiFiService | null,
    private readonly configService: IConfigService,
    private readonly textRendererService: ITextRendererService | null,
    private readonly displayService: IDisplayService,
    private readonly simulationService: ITrackSimulationService | null,
    private readonly driveNavigationService: IDriveNavigationService | null,
  ) {}

  /**
   * Set the error callback for notifying errors
   */
  setErrorCallback(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  /**
   * Update GPS position (called by orchestrator when GPS updates)
   */
  updateGPSPosition(position: GPSCoordinate): void {
    this.lastGPSPosition = position;
  }

  /**
   * Update GPS status (called by orchestrator when GPS status changes)
   */
  updateGPSStatus(status: GPSStatus): void {
    this.lastGPSStatus = status;
  }

  /**
   * Subscribe to WiFi state changes from the WiFi service
   */
  subscribeToWiFiStateChanges(): void {
    if (!this.wifiService) {
      return;
    }

    if (this.wifiStateUnsubscribe) {
      logger.info("Unsubscribing from existing WiFi state changes");
      this.wifiStateUnsubscribe();
    }

    this.wifiStateUnsubscribe = this.wifiService.onStateChange(
      (state, previousState) => {
        logger.info(`WiFi state changed: ${previousState} -> ${state}`);

        // Handle display updates based on WiFi state
        void this.handleWiFiStateChange(state, previousState);

        // Notify all WiFi state callbacks
        this.wifiStateCallbacks.forEach((callback) => {
          try {
            callback(state, previousState);
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            logger.error(`Error in WiFi state callback: ${errorMsg}`);
            if (this.errorCallback) {
              this.errorCallback(
                error instanceof Error
                  ? error
                  : new Error("Unknown error in WiFi state callback"),
              );
            }
          }
        });
      },
    );

    logger.info(
      `Subscribed to WiFi state changes (${this.wifiStateCallbacks.length} callbacks registered)`,
    );
  }

  /**
   * Register a callback for WiFi state changes
   */
  onWiFiStateChange(
    callback: (state: WiFiState, previousState: WiFiState) => void,
  ): () => void {
    this.wifiStateCallbacks.push(callback);
    logger.info(
      `WiFi state callback registered (total: ${this.wifiStateCallbacks.length})`,
    );

    // Return unsubscribe function
    return () => {
      const index = this.wifiStateCallbacks.indexOf(callback);
      if (index > -1) {
        this.wifiStateCallbacks.splice(index, 1);
        logger.info(
          `WiFi state callback unregistered (total: ${this.wifiStateCallbacks.length})`,
        );
      }
    };
  }

  /**
   * Handle WiFi state changes by displaying appropriate screens
   */
  private async handleWiFiStateChange(
    state: WiFiState,
    previousState: WiFiState,
  ): Promise<void> {
    if (!this.textRendererService || !this.displayService) {
      logger.warn(
        "TextRendererService or EpaperService not available for WiFi screens",
      );
      return;
    }

    // Skip WiFi screen updates when WebSocket clients are connected
    // The "select track" screen takes priority
    if (this.webSocketClientCount > 0) {
      logger.info(
        `Skipping WiFi screen update (${this.webSocketClientCount} WebSocket clients connected, showing select track screen)`,
      );
      return;
    }

    // Debounce screen updates to prevent flickering
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastWifiScreenUpdate;

    // Allow immediate update for CONNECTED state (important to show URL)
    // But debounce other states to prevent flickering
    if (
      state !== WiFiState.CONNECTED &&
      timeSinceLastUpdate < OnboardingCoordinator.WIFI_SCREEN_DEBOUNCE_MS
    ) {
      logger.info(
        `WiFi screen update debounced (${timeSinceLastUpdate}ms since last update)`,
      );
      return;
    }

    try {
      switch (state) {
        case WiFiState.WAITING_FOR_HOTSPOT:
          await this.displayWiFiInstructionsScreen();
          this.lastWifiScreenUpdate = now;
          break;

        case WiFiState.CONNECTED:
          // Display connected screen on first transition to CONNECTED,
          // or retry if previous display attempt failed (e.g., IP wasn't ready)
          if (previousState !== WiFiState.CONNECTED) {
            // First transition to CONNECTED - reset flag and display
            this.connectedScreenDisplayed = false;
            await this.displayConnectedScreen();
            this.lastWifiScreenUpdate = now;
          } else if (!this.connectedScreenDisplayed) {
            // Retry: state was already CONNECTED but screen wasn't displayed yet
            logger.info(
              "Retrying connected screen display (previous attempt may have failed)",
            );
            await this.displayConnectedScreen();
            this.lastWifiScreenUpdate = now;
          }
          break;

        case WiFiState.RECONNECTING_FALLBACK:
          await this.displayReconnectingScreen();
          this.lastWifiScreenUpdate = now;
          break;

        case WiFiState.ERROR:
          logger.warn("WiFi entered error state");
          // Don't update timestamp for ERROR - let other screens show
          break;

        default:
          // No display action needed for other states
          break;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to display WiFi state screen: ${errorMsg}`);
    }
  }

  /**
   * Check if onboarding is needed and show appropriate screen
   */
  async checkAndShowOnboardingScreen(): Promise<Result<void>> {
    logger.info("checkAndShowOnboardingScreen() called");

    // Check if onboarding is already complete
    const onboardingComplete = this.configService.isOnboardingCompleted();
    logger.info(`Onboarding complete: ${onboardingComplete}`);

    if (onboardingComplete) {
      logger.info("Onboarding already complete - no screen to show");
      return success(undefined);
    }

    // Check if WiFi service is available
    if (!this.wifiService) {
      logger.warn(
        "WiFi service not available - cannot show WiFi onboarding screen",
      );
      return success(undefined);
    }

    // Check if already connected to mobile hotspot
    const connectedToHotspotResult =
      await this.wifiService.isConnectedToMobileHotspot();
    if (connectedToHotspotResult.success && connectedToHotspotResult.data) {
      logger.info(
        "Already connected to mobile hotspot - showing connected screen",
      );
      await this.displayConnectedScreen();
      return success(undefined);
    }

    // Not connected to hotspot - show WiFi instructions
    logger.info(
      "Not connected to mobile hotspot - showing WiFi instructions screen",
    );
    await this.displayWiFiInstructionsScreen();

    // Start attempting to connect to the mobile hotspot
    // This runs in the background while the instructions are displayed
    logger.info("Starting mobile hotspot connection attempt for onboarding...");
    void this.wifiService.attemptMobileHotspotConnection().then((result) => {
      if (result.success) {
        logger.info(
          "Successfully connected to mobile hotspot during onboarding!",
        );
        // The WiFi state change callback will handle displaying the connected screen
      } else {
        logger.warn(
          "Failed to connect to mobile hotspot during onboarding:",
          result.error.message,
        );
        // Will retry on next polling tick if still in onboarding
      }
    });

    return success(undefined);
  }

  /**
   * Restart the onboarding flow (used after factory reset)
   */
  async restartOnboarding(): Promise<Result<void>> {
    logger.info("restartOnboarding() called - starting onboarding flow");

    try {
      // Step 1: Display the logo
      logger.info("Step 1: Displaying startup logo...");
      const logoResult = await this.displayService.displayLogo();
      if (!logoResult.success) {
        logger.error("Failed to display startup logo:", logoResult.error);
        return failure(
          OrchestratorError.updateFailed("Startup logo", logoResult.error),
        );
      }
      logger.info("✓ Startup logo displayed");

      // Wait a moment for the logo to be visible
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Step 2: Show WiFi instructions screen
      logger.info("Step 2: Showing WiFi instructions screen...");
      await this.displayWiFiInstructionsScreen();
      logger.info("✓ WiFi instructions screen displayed");

      // Step 3: Start attempting to connect to the mobile hotspot
      if (this.wifiService) {
        logger.info(
          "Step 3: Starting mobile hotspot connection attempt for onboarding...",
        );
        void this.wifiService
          .attemptMobileHotspotConnection()
          .then((result) => {
            if (result.success) {
              logger.info(
                "Successfully connected to mobile hotspot during onboarding restart!",
              );
            } else {
              logger.warn(
                "Failed to connect to mobile hotspot during onboarding restart:",
                result.error.message,
              );
            }
          });
      }

      return success(undefined);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to restart onboarding: ${errorMsg}`);
      const err = error instanceof Error ? error : new Error("Unknown error");
      return failure(OrchestratorError.updateFailed("Restart onboarding", err));
    }
  }

  /**
   * Set the number of connected WebSocket clients
   */
  setWebSocketClientCount(count: number): void {
    const previousCount = this.webSocketClientCount;
    this.webSocketClientCount = count;

    logger.info(`WebSocket client count changed: ${previousCount} -> ${count}`);

    // Transition: 0 -> 1+ clients (first client connected)
    if (previousCount === 0 && count > 0) {
      logger.info(
        "First WebSocket client connected - showing select track screen",
      );
      this.startGPSInfoRefresh();
    }

    // Transition: 1+ -> 0 clients (last client disconnected)
    if (previousCount > 0 && count === 0) {
      logger.info(
        "Last WebSocket client disconnected - returning to connected screen",
      );
      this.stopGPSInfoRefresh();
      // Show the connected screen again - skip connection check since we know we were connected
      void this.displayConnectedScreen(true);
    }
  }

  /**
   * Start the GPS info refresh interval
   */
  private startGPSInfoRefresh(): void {
    // Don't start GPS info refresh if simulation, navigation, or active track exists
    // This prevents the "Select a track" screen from showing during active sessions
    if (
      this.configService.getActiveGPXPath() ||
      this.simulationService?.isSimulating() ||
      this.driveNavigationService?.isNavigating()
    ) {
      logger.info(
        "Skipping GPS info refresh start - active track, simulation, or navigation in progress",
      );
      return;
    }

    // Stop any existing interval
    this.stopGPSInfoRefresh();

    // Reset last displayed data to ensure first update always renders
    this.lastDisplayedGPSPosition = null;
    this.lastDisplayedGPSStatus = null;

    // Display immediately with full update
    void this.displaySelectTrackScreen(true);

    // Set up refresh interval - only update if data has changed
    this.gpsInfoRefreshInterval = setInterval(() => {
      if (this.hasGPSDataChanged()) {
        logger.info(
          "GPS info refresh tick - data changed, updating select track screen",
        );
        void this.displaySelectTrackScreen(true);
      } else {
        logger.debug("GPS info refresh tick - no changes, skipping update");
      }
    }, OnboardingCoordinator.GPS_INFO_REFRESH_INTERVAL_MS);

    logger.info(
      `Started GPS info refresh (every ${OnboardingCoordinator.GPS_INFO_REFRESH_INTERVAL_MS}ms)`,
    );
  }

  /**
   * Check if GPS data has changed since last display update
   */
  private hasGPSDataChanged(): boolean {
    // Check if status changed
    const currentFixQuality = this.lastGPSStatus?.fixQuality ?? null;
    const displayedFixQuality = this.lastDisplayedGPSStatus?.fixQuality ?? null;
    if (currentFixQuality !== displayedFixQuality) {
      return true;
    }

    const currentSatellites = this.lastGPSStatus?.satellitesInUse ?? 0;
    const displayedSatellites =
      this.lastDisplayedGPSStatus?.satellitesInUse ?? 0;
    if (currentSatellites !== displayedSatellites) {
      return true;
    }

    // Check if position changed (null vs non-null)
    const hasCurrentPosition = this.lastGPSPosition !== null;
    const hasDisplayedPosition = this.lastDisplayedGPSPosition !== null;
    if (hasCurrentPosition !== hasDisplayedPosition) {
      return true;
    }

    // If both have position, check if lat/lon changed (within display precision)
    if (this.lastGPSPosition && this.lastDisplayedGPSPosition) {
      // Position is displayed with 5 decimal places, so threshold is 0.000005
      const latDiff = Math.abs(
        this.lastGPSPosition.latitude - this.lastDisplayedGPSPosition.latitude,
      );
      const lonDiff = Math.abs(
        this.lastGPSPosition.longitude -
          this.lastDisplayedGPSPosition.longitude,
      );
      if (latDiff >= 0.000005 || lonDiff >= 0.000005) {
        return true;
      }

      // Check if speed display changed
      const currentSpeedKmh = (this.lastGPSPosition.speed ?? 0) * 3.6;
      const displayedSpeedKmh =
        (this.lastDisplayedGPSPosition.speed ?? 0) * 3.6;
      const currentShowsSpeed = currentSpeedKmh >= 1;
      const displayedShowsSpeed = displayedSpeedKmh >= 1;

      if (currentShowsSpeed !== displayedShowsSpeed) {
        return true;
      }

      if (currentShowsSpeed && displayedShowsSpeed) {
        if (Math.abs(currentSpeedKmh - displayedSpeedKmh) >= 0.05) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Stop the GPS info refresh interval
   */
  stopGPSInfoRefresh(): void {
    if (this.gpsInfoRefreshInterval) {
      clearInterval(this.gpsInfoRefreshInterval);
      this.gpsInfoRefreshInterval = null;
      logger.info("Stopped GPS info refresh");
    }
  }

  /**
   * Display WiFi instructions screen on e-paper
   */
  async displayWiFiInstructionsScreen(): Promise<void> {
    if (!this.textRendererService || !this.wifiService) {
      return;
    }

    const config = this.wifiService.getHotspotConfig();

    const template: TextTemplate = {
      version: "1.0",
      title: "WiFi Setup",
      layout: {
        backgroundColor: "white",
        textColor: "black",
        padding: { top: 150, right: 20, bottom: 20, left: 20 },
      },
      textBlocks: [
        {
          content: "Please create or activate the following",
          fontSize: 26,
          fontWeight: "normal",
          alignment: "center",
          marginBottom: 15,
        },
        {
          content: "hotspot on your mobile phone",
          fontSize: 26,
          fontWeight: "normal",
          alignment: "center",
          marginBottom: 30,
        },
        {
          content: `Network Name: ${config.ssid}`,
          fontSize: 26,
          fontWeight: "bold",
          alignment: "center",
          marginBottom: 15,
        },
        {
          content: `Password: ${config.password}`,
          fontSize: 26,
          fontWeight: "bold",
          alignment: "center",
          marginBottom: 40,
        },
        {
          content: `...Searching for ${config.ssid}...`,
          fontSize: 26,
          fontWeight: "normal",
          alignment: "center",
          marginBottom: 0,
        },
      ],
    };

    const width = this.configService.getDisplayWidth();
    const height = this.configService.getDisplayHeight();
    const renderResult = await this.textRendererService.renderTemplate(
      template,
      config,
      width,
      height,
    );

    if (renderResult.success) {
      await this.displayService.displayBitmap(
        renderResult.data,
        DisplayUpdateMode.FULL,
      );
      logger.info("Displayed WiFi instructions screen");
    } else {
      logger.error("Failed to render WiFi instructions template");
    }
  }

  /**
   * Display connected screen with device URL on e-paper
   * @param skipConnectionCheck - If true, skip the hotspot connection check
   */
  async displayConnectedScreen(
    skipConnectionCheck: boolean = false,
  ): Promise<void> {
    if (!this.textRendererService) {
      return;
    }

    // Verify we're actually connected to the hotspot before showing
    if (!skipConnectionCheck && this.wifiService) {
      const connectedResult =
        await this.wifiService.isConnectedToMobileHotspot();
      if (!connectedResult.success || !connectedResult.data) {
        logger.warn(
          "displayConnectedScreen called but not connected to hotspot - skipping",
        );
        return;
      }
    }

    const deviceUrl = this.getDeviceUrl();

    // Don't show connected screen if we don't have a valid IP
    if (deviceUrl.includes("localhost")) {
      logger.warn(
        "displayConnectedScreen called but no valid IP address - skipping",
      );
      return;
    }

    const width = this.configService.getDisplayWidth();
    const height = this.configService.getDisplayHeight();
    const qrCodeSize = Math.floor(height / 2);

    const template: TextTemplate = {
      version: "1.0",
      title: "Connected",
      layout: {
        backgroundColor: "white",
        textColor: "black",
        padding: { top: 70, right: 20, bottom: 20, left: 20 },
      },
      textBlocks: [
        {
          content: "Scan to open Papertrail:",
          fontSize: 28,
          fontWeight: "bold",
          alignment: "center",
          marginBottom: 320,
        },
        {
          content: `Or type ${deviceUrl} in your browser`,
          fontSize: 24,
          fontWeight: "bold",
          alignment: "center",
          marginBottom: 20,
        },
      ],
      qrCode: {
        content: deviceUrl,
        size: qrCodeSize,
        position: "center",
      },
    };
    const renderResult = await this.textRendererService.renderTemplate(
      template,
      { url: deviceUrl },
      width,
      height,
    );

    if (renderResult.success) {
      await this.displayService.displayBitmap(
        renderResult.data,
        DisplayUpdateMode.FULL,
      );
      logger.info(`Displayed connected screen with URL: ${deviceUrl}`);
      // Mark that we successfully displayed the connected screen
      this.connectedScreenDisplayed = true;
      // Notify WiFi service to stop retry notifications
      if (this.wifiService) {
        this.wifiService.notifyConnectedScreenDisplayed();
      }
    } else {
      logger.error("Failed to render connected template");
    }
  }

  /**
   * Display reconnecting screen on e-paper
   */
  private async displayReconnectingScreen(): Promise<void> {
    if (!this.textRendererService) {
      return;
    }

    const fallback = this.configService.getWiFiFallbackNetwork();
    const ssid = fallback?.ssid || "previous network";

    const template: TextTemplate = {
      version: "1.0",
      title: "Reconnecting",
      layout: {
        backgroundColor: "white",
        textColor: "black",
        padding: { top: 20, right: 20, bottom: 20, left: 20 },
      },
      textBlocks: [
        {
          content: "Connection timed out",
          fontSize: 28,
          fontWeight: "bold",
          alignment: "center",
          marginBottom: 30,
        },
        {
          content: `Reconnecting to: ${ssid}`,
          fontSize: 20,
          fontWeight: "normal",
          alignment: "center",
          marginBottom: 20,
        },
        {
          content: "Please wait...",
          fontSize: 18,
          fontWeight: "normal",
          alignment: "center",
          marginBottom: 0,
        },
      ],
    };

    const width = this.configService.getDisplayWidth();
    const height = this.configService.getDisplayHeight();
    const renderResult = await this.textRendererService.renderTemplate(
      template,
      { ssid },
      width,
      height,
    );

    if (renderResult.success) {
      await this.displayService.displayBitmap(renderResult.data);
      logger.info("Displayed reconnecting screen");
    } else {
      logger.error("Failed to render reconnecting template");
    }
  }

  /**
   * Display the "select track" screen with GPS info
   */
  private async displaySelectTrackScreen(fullUpdate: boolean): Promise<void> {
    if (!this.textRendererService || !this.displayService) {
      logger.warn(
        "TextRendererService or EpaperService not available for select track screen",
      );
      return;
    }

    // Skip if we have an active track, simulation is running, or drive navigation is active
    if (
      this.configService.getActiveGPXPath() ||
      this.simulationService?.isSimulating() ||
      this.driveNavigationService?.isNavigating()
    ) {
      logger.info(
        "Skipping select track screen (active track or navigation in progress)",
      );
      return;
    }

    // Build GPS info strings
    const fixQualityStr = this.getFixQualityString();
    const satellitesStr = this.lastGPSStatus
      ? `${this.lastGPSStatus.satellitesInUse} Satellites`
      : "0 Satellites";
    const positionStr = this.getPositionString();
    const speedStr = this.getSpeedString();
    const deviceUrl = this.getDeviceUrl();

    const textBlocks: Array<{
      content: string;
      fontSize: number;
      fontWeight: "normal" | "bold";
      alignment: "left" | "center" | "right";
      marginBottom: number;
    }> = [
      {
        content: "Select a Track",
        fontSize: 32,
        fontWeight: "bold",
        alignment: "center",
        marginBottom: 20,
      },
      {
        content: "Use the web interface to choose a GPX track",
        fontSize: 24,
        fontWeight: "normal",
        alignment: "center",
        marginBottom: 40,
      },
      {
        content: `Fix: ${fixQualityStr}`,
        fontSize: 24,
        fontWeight: "normal",
        alignment: "center",
        marginBottom: 10,
      },
      {
        content: satellitesStr,
        fontSize: 24,
        fontWeight: "normal",
        alignment: "center",
        marginBottom: 10,
      },
    ];

    // Add position if available
    if (positionStr) {
      textBlocks.push({
        content: positionStr,
        fontSize: 24,
        fontWeight: "normal",
        alignment: "center",
        marginBottom: 10,
      });
    }

    // Add speed if available and moving
    if (speedStr) {
      textBlocks.push({
        content: speedStr,
        fontSize: 24,
        fontWeight: "normal",
        alignment: "center",
        marginBottom: 10,
      });
    }

    // Add URL at the bottom
    textBlocks.push({
      content: deviceUrl,
      fontSize: 24,
      fontWeight: "normal",
      alignment: "center",
      marginBottom: 0,
    });

    const template: TextTemplate = {
      version: "1.0",
      title: "Select Track",
      layout: {
        backgroundColor: "white",
        textColor: "black",
        padding: { top: 150, right: 20, bottom: 20, left: 20 },
      },
      textBlocks,
    };

    const width = this.configService.getDisplayWidth();
    const height = this.configService.getDisplayHeight();
    const renderResult = await this.textRendererService.renderTemplate(
      template,
      {},
      width,
      height,
    );

    if (renderResult.success) {
      const updateMode = fullUpdate
        ? DisplayUpdateMode.FULL
        : DisplayUpdateMode.AUTO;
      await this.displayService.displayBitmap(renderResult.data, updateMode);
      logger.info(
        `Displayed select track screen with GPS info (${fullUpdate ? "full" : "auto"} update)`,
      );

      // Store the data that was displayed for change detection
      this.lastDisplayedGPSPosition = this.lastGPSPosition
        ? { ...this.lastGPSPosition }
        : null;
      this.lastDisplayedGPSStatus = this.lastGPSStatus
        ? { ...this.lastGPSStatus }
        : null;
    } else {
      logger.error("Failed to render select track template");
    }
  }

  /**
   * Get human-readable fix quality string
   */
  private getFixQualityString(): string {
    if (!this.lastGPSStatus) {
      return "No Fix Yet";
    }

    switch (this.lastGPSStatus.fixQuality) {
      case 0:
        return "No Fix Yet";
      case 1:
        return "GPS Fix";
      case 2:
        return "DGPS Fix";
      case 3:
        return "PPS Fix";
      case 4:
        return "RTK Fix";
      case 5:
        return "Float RTK";
      default:
        return "Fix Available";
    }
  }

  /**
   * Get formatted position string
   */
  private getPositionString(): string | null {
    if (!this.lastGPSPosition) {
      return null;
    }

    const lat = this.lastGPSPosition.latitude;
    const lon = this.lastGPSPosition.longitude;
    const latDir = lat >= 0 ? "N" : "S";
    const lonDir = lon >= 0 ? "E" : "W";

    return `${Math.abs(lat).toFixed(5)}°${latDir}, ${Math.abs(lon).toFixed(5)}°${lonDir}`;
  }

  /**
   * Get formatted speed string (only if moving)
   */
  private getSpeedString(): string | null {
    if (!this.lastGPSPosition?.speed) {
      return null;
    }

    const speedKmh = this.lastGPSPosition.speed * 3.6;

    if (speedKmh < 1) {
      return null;
    }

    return `Speed: ${speedKmh.toFixed(1)} km/h`;
  }

  /**
   * Get the device URL for web interface access
   */
  getDeviceUrl(): string {
    const config = this.configService.getConfig();
    const port = config.web.port;
    const protocol = process.env.WEB_SSL_ENABLED === "true" ? "https" : "http";

    // Try to get IP address from network interfaces
    const interfaces = os.networkInterfaces();
    logger.info("Getting device URL - scanning network interfaces...");

    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name];
      if (!iface) continue;

      for (const info of iface) {
        const family = info.family as string | number;
        const isIPv4 = family === "IPv4" || family === 4;
        if (isIPv4 && !info.internal) {
          logger.info(`Found IPv4 address on ${name}: ${info.address}`);
          return `${protocol}://${info.address}:${port}`;
        }
      }
    }

    logger.warn("No IPv4 address found, using fallback");
    return `${protocol}://localhost:${port}`;
  }

  /**
   * Dispose and clean up resources
   */
  dispose(): void {
    this.stopGPSInfoRefresh();

    if (this.wifiStateUnsubscribe) {
      logger.info("Unsubscribing from WiFi state changes");
      this.wifiStateUnsubscribe();
      this.wifiStateUnsubscribe = null;
    }

    this.wifiStateCallbacks = [];
    logger.info("OnboardingCoordinator disposed");
  }
}
