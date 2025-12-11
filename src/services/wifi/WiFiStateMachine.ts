import { IConfigService, WiFiMode } from "@core/interfaces";
import { WiFiState } from "@core/types";
import { getLogger } from "@utils/logger";
import { NetworkScanner } from "./NetworkScanner";
import { ConnectionManager } from "./ConnectionManager";
import { HotspotManager } from "./HotspotManager";

const logger = getLogger("WiFiStateMachine");

/** Polling interval for checking hotspot connection (10 seconds) */
const HOTSPOT_CHECK_INTERVAL_MS = 10000;

/** Delay before attempting hotspot connection after entering WAITING_FOR_HOTSPOT (5 seconds) */
const HOTSPOT_CONNECTION_DELAY_MS = 5000;

/**
 * WiFiStateMachine manages the WiFi state machine including:
 * - State transitions (IDLE, CONNECTED, WAITING_FOR_HOTSPOT, etc.)
 * - Mode awareness (driving vs stopped based on WebSocket clients)
 * - Periodic polling for hotspot connection
 */
export class WiFiStateMachine {
  private currentState: WiFiState = WiFiState.IDLE;
  private webSocketClientCount = 0;
  private stateChangeCallbacks: Array<
    (state: WiFiState, previousState: WiFiState) => void
  > = [];
  private hotspotCheckInterval?: NodeJS.Timeout;
  private connectedStateEnteredAt?: Date;

  constructor(
    private configService: IConfigService | undefined,
    private networkScanner: NetworkScanner,
    private connectionManager: ConnectionManager,
    private hotspotManager: HotspotManager,
  ) {}

  /**
   * Start hotspot polling (10-second interval)
   */
  startHotspotPolling(): void {
    logger.info(
      `startHotspotPolling() - starting hotspot polling (${HOTSPOT_CHECK_INTERVAL_MS}ms interval)`,
    );

    this.hotspotCheckInterval = setInterval(() => {
      logger.info("Hotspot polling tick triggered");
      void this.handleHotspotPollingTick();
    }, HOTSPOT_CHECK_INTERVAL_MS);

    logger.info("Hotspot polling started");
  }

  /**
   * Stop hotspot polling
   */
  stopHotspotPolling(): void {
    logger.info("stopHotspotPolling() called");
    if (this.hotspotCheckInterval) {
      logger.info("Clearing hotspot polling interval");
      clearInterval(this.hotspotCheckInterval);
      this.hotspotCheckInterval = undefined;
      logger.info("Hotspot polling stopped");
    } else {
      logger.info("Hotspot polling was not running");
    }
  }

  /**
   * Get the current WiFi state
   */
  getState(): WiFiState {
    logger.info(`getState() called - current state: ${this.currentState}`);
    return this.currentState;
  }

  /**
   * Set the WiFi state and notify callbacks
   */
  setState(newState: WiFiState): void {
    logger.info(`setState() called with: ${newState}`);
    if (newState === this.currentState) {
      logger.info(`setState() - state already ${newState}, no change needed`);
      return;
    }

    const previousState = this.currentState;
    this.currentState = newState;

    // Track when we enter CONNECTED state for grace period and reset screen flag
    if (newState === WiFiState.CONNECTED) {
      this.connectedStateEnteredAt = new Date();
      this.hotspotManager.resetConnectedScreenDisplayed();
      logger.info(
        `Entered CONNECTED state at ${this.connectedStateEnteredAt.toISOString()}`,
      );
    } else {
      this.connectedStateEnteredAt = undefined;
    }

    logger.info(`WiFi state transition: ${previousState} -> ${newState}`);
    logger.info(
      `Notifying ${this.stateChangeCallbacks.length} state change callbacks...`,
    );
    this.notifyStateChange(newState, previousState);
  }

  /**
   * Register a callback for state changes
   */
  onStateChange(
    callback: (state: WiFiState, previousState: WiFiState) => void,
  ): () => void {
    logger.info(
      `onStateChange() - registering new callback (total: ${this.stateChangeCallbacks.length + 1})`,
    );
    this.stateChangeCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
        logger.info(
          `onStateChange() - unsubscribed callback (remaining: ${this.stateChangeCallbacks.length})`,
        );
      }
    };
  }

  /**
   * Set the WebSocket client count (affects mode: driving vs stopped)
   */
  setWebSocketClientCount(count: number): void {
    const previousCount = this.webSocketClientCount;
    this.webSocketClientCount = count;

    logger.info(
      `setWebSocketClientCount() - count changed: ${previousCount} -> ${count}`,
    );

    // If we just entered stopped mode (clients connected) and not connected to hotspot,
    // trigger the state machine check
    if (previousCount === 0 && count > 0) {
      logger.info(
        "Mode transition: DRIVING -> STOPPED (WebSocket clients connected)",
      );
      logger.info("Triggering immediate hotspot check...");
      // Run a hotspot check immediately
      void this.handleHotspotPollingTick();
    }

    // If we just entered driving mode (no clients), reset state if we were waiting
    if (previousCount > 0 && count === 0) {
      logger.info("Mode transition: STOPPED -> DRIVING (no WebSocket clients)");
      if (
        this.currentState === WiFiState.WAITING_FOR_HOTSPOT ||
        this.currentState === WiFiState.CONNECTING
      ) {
        logger.info("Aborting hotspot connection attempt due to mode change");
        // Abort any in-progress connection attempt
        this.hotspotManager.abortConnectionAttempt();

        // Go back to idle (we were in the middle of hotspot connection)
        logger.info("Resetting state to IDLE");
        this.setState(WiFiState.IDLE);
      }
    }
  }

  /**
   * Get the current mode (driving or stopped)
   */
  getMode(): WiFiMode {
    const mode = this.webSocketClientCount > 0 ? "stopped" : "driving";
    logger.info(
      `getMode() called - current mode: ${mode} (${this.webSocketClientCount} WebSocket clients)`,
    );
    return mode;
  }

  /**
   * Get the WebSocket client count
   */
  getWebSocketClientCount(): number {
    return this.webSocketClientCount;
  }

  /**
   * Clear all callbacks (for disposal)
   */
  clearCallbacks(): void {
    const count = this.stateChangeCallbacks.length;
    logger.info(`Clearing ${count} state change callbacks`);
    this.stateChangeCallbacks = [];
  }

  /**
   * Notify all registered callbacks of state change
   */
  private notifyStateChange(state: WiFiState, previousState: WiFiState): void {
    logger.info(
      `notifyStateChange(${state}, ${previousState}) - notifying ${this.stateChangeCallbacks.length} callbacks`,
    );
    for (let i = 0; i < this.stateChangeCallbacks.length; i++) {
      try {
        logger.info(
          `  Calling state change callback ${i + 1}/${this.stateChangeCallbacks.length}`,
        );
        this.stateChangeCallbacks[i](state, previousState);
      } catch (error) {
        logger.error(`Error in state change callback ${i + 1}:`, error);
      }
    }
    logger.info("notifyStateChange() complete");
  }

  /**
   * Handle a hotspot polling tick - check connection status and manage state transitions
   */
  async handleHotspotPollingTick(): Promise<void> {
    logger.info("handleHotspotPollingTick() - starting polling tick");
    logger.info(`  Current state: ${this.currentState}`);
    logger.info(`  WebSocket client count: ${this.webSocketClientCount}`);
    logger.info(`  Mode: ${this.getMode()}`);

    // Check if connected to mobile hotspot
    logger.info("Checking if connected to mobile hotspot...");
    const connectedToHotspot =
      await this.hotspotManager.isConnectedToMobileHotspot();

    if (connectedToHotspot.success && connectedToHotspot.data) {
      // Already connected to hotspot
      logger.info("Already connected to mobile hotspot");
      if (this.currentState !== WiFiState.CONNECTED) {
        logger.info("Updating state to CONNECTED");
        this.setState(WiFiState.CONNECTED);
      } else if (
        this.webSocketClientCount === 0 &&
        !this.hotspotManager.hasConnectedScreenBeenDisplayed()
      ) {
        // State is already CONNECTED, no WebSocket clients yet, and screen not displayed.
        // Notify callbacks to retry displaying the connected screen.
        logger.info(
          "State already CONNECTED, screen not displayed yet - notifying for display retry",
        );
        this.notifyStateChange(WiFiState.CONNECTED, WiFiState.CONNECTED);
      } else {
        // State is CONNECTED and either clients are connected or screen was displayed - no action needed
        logger.info("State already CONNECTED, no notification needed");
      }
      logger.info("handleHotspotPollingTick() complete");
      return;
    }

    logger.info("Not connected to mobile hotspot");

    // If we were previously connected to the hotspot but now aren't, we lost connection
    // Use a grace period to avoid false disconnection detection due to timing issues
    if (this.currentState === WiFiState.CONNECTED) {
      const gracePeriodMs = 5000; // 5 seconds grace period after entering CONNECTED
      const now = new Date();
      const connectedDuration = this.connectedStateEnteredAt
        ? now.getTime() - this.connectedStateEnteredAt.getTime()
        : Infinity;

      if (connectedDuration < gracePeriodMs) {
        logger.info(
          `In CONNECTED state for ${connectedDuration}ms (grace period: ${gracePeriodMs}ms) - skipping disconnection check`,
        );
        logger.info(
          "handleHotspotPollingTick() complete (within grace period)",
        );
        return;
      }

      logger.info(
        `Was CONNECTED for ${connectedDuration}ms (past grace period) but now disconnected - transitioning to WAITING_FOR_HOTSPOT`,
      );
      this.setState(WiFiState.WAITING_FOR_HOTSPOT);
      // Don't return - continue to check if we should attempt reconnection
    }

    // Check if we're in stopped mode (WebSocket clients connected)
    if (this.webSocketClientCount > 0) {
      logger.info("In STOPPED mode (WebSocket clients connected)");
      await this.handleStoppedModePolling();
    } else {
      logger.info("In DRIVING mode (no WebSocket clients)");
      await this.handleDrivingModePolling();
    }
    logger.info("handleHotspotPollingTick() complete");
  }

  /**
   * Handle polling in stopped mode (WebSocket clients connected)
   */
  private async handleStoppedModePolling(): Promise<void> {
    // Allow retry from ERROR state - reset it first
    if (this.currentState === WiFiState.ERROR) {
      logger.info("Resetting from ERROR state to allow retry");
      this.setState(WiFiState.IDLE);
    }

    // If we're actively connecting or reconnecting, don't interfere
    if (
      this.currentState === WiFiState.CONNECTING ||
      this.currentState === WiFiState.RECONNECTING_FALLBACK
    ) {
      logger.info(
        `Already in transitional state (${this.currentState}) - not initiating new connection`,
      );
      return;
    }

    // We're in IDLE, DISCONNECTED, or WAITING_FOR_HOTSPOT - check if hotspot is visible
    const effectiveSSID = this.hotspotManager.getEffectiveHotspotSSID();
    logger.info("Checking if hotspot is visible...");
    const visibleResult =
      await this.networkScanner.isNetworkVisible(effectiveSSID);

    if (!visibleResult.success || !visibleResult.data) {
      logger.info(
        `Hotspot "${effectiveSSID}" not visible - staying connected to current network`,
      );
      // Make sure we're in WAITING_FOR_HOTSPOT state to show the instruction screen
      if (this.currentState !== WiFiState.WAITING_FOR_HOTSPOT) {
        logger.info(
          "Setting state to WAITING_FOR_HOTSPOT to show instruction screen",
        );
        this.setState(WiFiState.WAITING_FOR_HOTSPOT);
      }
      return;
    }

    logger.info("Hotspot is visible - initiating connection sequence");
    // Save current connection as fallback before trying to connect to hotspot
    logger.info("Saving current connection as fallback...");
    await this.hotspotManager.saveFallbackNetwork();

    // Enter waiting state if not already
    if (this.currentState !== WiFiState.WAITING_FOR_HOTSPOT) {
      logger.info("Entering WAITING_FOR_HOTSPOT state");
      this.setState(WiFiState.WAITING_FOR_HOTSPOT);
    }

    // Short delay then attempt connection
    logger.info(
      `Scheduling hotspot connection attempt in ${HOTSPOT_CONNECTION_DELAY_MS}ms...`,
    );
    setTimeout(() => {
      logger.info("Hotspot connection delay elapsed - checking conditions...");
      if (
        this.webSocketClientCount > 0 &&
        this.currentState === WiFiState.WAITING_FOR_HOTSPOT
      ) {
        logger.info("Conditions met - initiating hotspot connection attempt");
        void this.hotspotManager.attemptMobileHotspotConnection();
      } else {
        logger.info(
          `Conditions not met (clients: ${this.webSocketClientCount}, state: ${this.currentState}) - skipping connection attempt`,
        );
      }
    }, HOTSPOT_CONNECTION_DELAY_MS);
  }

  /**
   * Handle polling in driving mode (no WebSocket clients)
   */
  private async handleDrivingModePolling(): Promise<void> {
    // Check if onboarding is not complete - if so, we should still try to connect to hotspot
    const onboardingComplete =
      this.configService?.isOnboardingCompleted() ?? true;
    logger.info(`Onboarding complete: ${onboardingComplete}`);

    if (!onboardingComplete) {
      // During onboarding, we should attempt connection even without WebSocket clients
      logger.info(
        "Onboarding not complete - should attempt hotspot connection",
      );
      await this.handleOnboardingPolling();
      return;
    }

    // Normal driving mode - just monitor, don't try to connect
    // Set state based on current connection
    logger.info("Checking general connection status...");
    const connected = await this.connectionManager.isConnected();
    if (connected.success) {
      logger.info(`Connected: ${connected.data}`);
      if (this.currentState === WiFiState.CONNECTED) {
        // We were connected to hotspot but now not
        logger.info(
          "Was connected to hotspot but now disconnected - setting state to DISCONNECTED",
        );
        this.setState(WiFiState.DISCONNECTED);
      } else if (
        this.currentState !== WiFiState.IDLE &&
        this.currentState !== WiFiState.DISCONNECTED
      ) {
        // Reset to idle/disconnected in driving mode
        const newState = connected.data
          ? WiFiState.IDLE
          : WiFiState.DISCONNECTED;
        logger.info(
          `Resetting state in driving mode: ${this.currentState} -> ${newState}`,
        );
        this.setState(newState);
      } else {
        logger.info(
          `State already appropriate (${this.currentState}) for driving mode`,
        );
      }
    } else {
      logger.info("Failed to check connection status in driving mode");
    }
  }

  /**
   * Handle polling during onboarding (before onboarding is complete)
   */
  private async handleOnboardingPolling(): Promise<void> {
    // Allow retry from ERROR state - reset it first
    if (this.currentState === WiFiState.ERROR) {
      logger.info("Resetting from ERROR state to allow retry");
      this.setState(WiFiState.IDLE);
    }

    // If we're actively connecting or reconnecting, don't interfere
    if (
      this.currentState === WiFiState.CONNECTING ||
      this.currentState === WiFiState.RECONNECTING_FALLBACK
    ) {
      logger.info(
        `Already in transitional state (${this.currentState}) - not initiating new connection`,
      );
      return;
    }

    // We're in IDLE, DISCONNECTED, or WAITING_FOR_HOTSPOT - check if hotspot is visible
    const effectiveSSID = this.hotspotManager.getEffectiveHotspotSSID();
    logger.info("Checking if hotspot is visible (onboarding)...");
    const visibleResult =
      await this.networkScanner.isNetworkVisible(effectiveSSID);

    if (!visibleResult.success || !visibleResult.data) {
      logger.info(
        `Hotspot "${effectiveSSID}" not visible - staying connected to current network (onboarding)`,
      );
      // Make sure we're in WAITING_FOR_HOTSPOT state to show the instruction screen
      if (this.currentState !== WiFiState.WAITING_FOR_HOTSPOT) {
        logger.info(
          "Setting state to WAITING_FOR_HOTSPOT to show instruction screen (onboarding)",
        );
        this.setState(WiFiState.WAITING_FOR_HOTSPOT);
      }
      return;
    }

    logger.info(
      "Hotspot is visible - initiating connection sequence for onboarding...",
    );
    // Save current connection as fallback
    await this.hotspotManager.saveFallbackNetwork();

    // Enter waiting state if not already
    if (this.currentState !== WiFiState.WAITING_FOR_HOTSPOT) {
      logger.info("Entering WAITING_FOR_HOTSPOT state (onboarding)");
      this.setState(WiFiState.WAITING_FOR_HOTSPOT);
    }

    // Wait a few seconds then attempt connection
    logger.info(
      `Scheduling hotspot connection attempt in ${HOTSPOT_CONNECTION_DELAY_MS}ms...`,
    );
    setTimeout(() => {
      logger.info(
        "Hotspot connection delay elapsed (onboarding) - checking conditions...",
      );
      if (this.currentState === WiFiState.WAITING_FOR_HOTSPOT) {
        logger.info(
          "Conditions met - initiating hotspot connection attempt for onboarding",
        );
        void this.hotspotManager.attemptMobileHotspotConnection();
      } else {
        logger.info(
          `State changed to ${this.currentState} - skipping connection attempt`,
        );
      }
    }, HOTSPOT_CONNECTION_DELAY_MS);
  }
}
