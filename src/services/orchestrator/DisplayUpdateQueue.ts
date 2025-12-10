import { DisplayUpdateMode } from "@core/types";
import { getLogger } from "@utils/logger";

const logger = getLogger("DisplayUpdateQueue");

/**
 * Manages queuing of display updates to prevent concurrent renders.
 *
 * E-paper displays and GPIO/SPI hardware don't handle concurrent access well.
 * This class ensures only one update runs at a time, queuing subsequent requests.
 */
export class DisplayUpdateQueue {
  private isUpdateInProgress: boolean = false;
  private pendingUpdateMode: DisplayUpdateMode | null = null;
  private updateHandler: ((mode?: DisplayUpdateMode) => Promise<void>) | null =
    null;

  /**
   * Set the handler function that performs the actual display update
   */
  setUpdateHandler(handler: (mode?: DisplayUpdateMode) => Promise<void>): void {
    this.updateHandler = handler;
  }

  /**
   * Check if an update is currently in progress
   */
  isInProgress(): boolean {
    return this.isUpdateInProgress;
  }

  /**
   * Check if there's a pending update queued
   */
  hasPendingUpdate(): boolean {
    return this.pendingUpdateMode !== null;
  }

  /**
   * Get the pending update mode (if any)
   */
  getPendingMode(): DisplayUpdateMode | null {
    return this.pendingUpdateMode;
  }

  /**
   * Queue an update request. If no update is in progress, execute immediately.
   * If an update is running, queue this request for later.
   *
   * @param mode The display update mode
   * @param isBusy Optional function to check if display hardware is busy
   * @returns true if update was started immediately, false if queued
   */
  async queueUpdate(
    mode?: DisplayUpdateMode,
    isBusy?: () => boolean,
  ): Promise<boolean> {
    // Queue update if one is already in progress
    if (this.isUpdateInProgress) {
      // Keep FULL mode if any queued update requests it
      if (
        mode === DisplayUpdateMode.FULL ||
        this.pendingUpdateMode !== DisplayUpdateMode.FULL
      ) {
        this.pendingUpdateMode = mode ?? DisplayUpdateMode.AUTO;
      }
      logger.info(
        `Display update queued (mode: ${this.pendingUpdateMode}), current update in progress`,
      );
      return false;
    }

    // Also check if e-paper display is busy (prevents lgpio native module deadlock)
    if (isBusy && isBusy()) {
      this.pendingUpdateMode = mode ?? DisplayUpdateMode.AUTO;
      logger.info(
        `Display update queued (mode: ${this.pendingUpdateMode}), e-paper display is busy`,
      );
      return false;
    }

    // Start the update
    this.isUpdateInProgress = true;
    return true;
  }

  /**
   * Mark the current update as complete and process any pending update
   */
  completeUpdate(): void {
    this.isUpdateInProgress = false;

    // Process any pending update
    if (this.pendingUpdateMode !== null && this.updateHandler) {
      const pendingMode = this.pendingUpdateMode;
      this.pendingUpdateMode = null;
      logger.info(`Processing queued display update (mode: ${pendingMode})`);
      // Use setImmediate to avoid stack overflow on rapid updates
      setImmediate(() => {
        void this.updateHandler!(pendingMode);
      });
    }
  }

  /**
   * Reset the queue state (e.g., during disposal)
   */
  reset(): void {
    this.isUpdateInProgress = false;
    this.pendingUpdateMode = null;
  }
}

/**
 * Manages queuing of drive display updates separately from regular display updates.
 * Drive navigation has its own update cycle that shouldn't interfere with track display.
 */
export class DriveDisplayUpdateQueue {
  private isUpdateInProgress: boolean = false;
  private pendingUpdate: boolean = false;
  private updateHandler: (() => Promise<void>) | null = null;

  /**
   * Set the handler function that performs the actual drive display update
   */
  setUpdateHandler(handler: () => Promise<void>): void {
    this.updateHandler = handler;
  }

  /**
   * Check if an update is currently in progress
   */
  isInProgress(): boolean {
    return this.isUpdateInProgress;
  }

  /**
   * Check if there's a pending update queued
   */
  hasPendingUpdate(): boolean {
    return this.pendingUpdate;
  }

  /**
   * Queue an update request.
   *
   * @param isBusy Optional function to check if display hardware is busy
   * @returns true if update was started immediately, false if queued
   */
  queueUpdate(isBusy?: () => boolean): boolean {
    // Queue update if one is already in progress
    if (this.isUpdateInProgress) {
      this.pendingUpdate = true;
      logger.debug("Drive display update queued, current update in progress");
      return false;
    }

    // Also check if e-paper display is busy
    if (isBusy && isBusy()) {
      this.pendingUpdate = true;
      logger.debug(
        "Drive display update queued, e-paper display is busy with previous update",
      );
      return false;
    }

    this.isUpdateInProgress = true;
    return true;
  }

  /**
   * Mark the current update as complete and process any pending update
   */
  completeUpdate(): void {
    this.isUpdateInProgress = false;

    // Process any pending update
    if (this.pendingUpdate && this.updateHandler) {
      this.pendingUpdate = false;
      logger.debug("Processing pending drive display update");
      // Use setImmediate to avoid stack overflow from recursive calls
      setImmediate(() => {
        void this.updateHandler!().catch((err) => {
          logger.error("Error processing pending drive update:", err);
        });
      });
    }
  }

  /**
   * Reset the queue state
   */
  reset(): void {
    this.isUpdateInProgress = false;
    this.pendingUpdate = false;
  }
}

/**
 * Manages queuing of setActiveGPX operations.
 * Ensures only the last selected track is loaded when rapid selections occur.
 */
export class ActiveGPXQueue {
  private isInProgress: boolean = false;
  private pendingPath: string | null = null;
  private operationHandler: ((path: string) => Promise<void>) | null = null;

  /**
   * Set the handler function that performs the actual GPX loading
   */
  setOperationHandler(handler: (path: string) => Promise<void>): void {
    this.operationHandler = handler;
  }

  /**
   * Check if an operation is currently in progress
   */
  isOperationInProgress(): boolean {
    return this.isInProgress;
  }

  /**
   * Get the pending path (if any)
   */
  getPendingPath(): string | null {
    return this.pendingPath;
  }

  /**
   * Queue a setActiveGPX request.
   *
   * @param path The GPX file path to load
   * @returns true if operation was started immediately, false if queued
   */
  queueOperation(path: string): boolean {
    if (this.isInProgress) {
      this.pendingPath = path;
      logger.info(
        `setActiveGPX queued for: ${path}, another operation in progress`,
      );
      return false;
    }

    this.isInProgress = true;
    return true;
  }

  /**
   * Mark the current operation as complete and process any pending request
   */
  completeOperation(): void {
    this.isInProgress = false;

    // Process any pending request
    if (this.pendingPath !== null && this.operationHandler) {
      const pendingPath = this.pendingPath;
      this.pendingPath = null;
      logger.info(`Processing queued setActiveGPX for: ${pendingPath}`);
      setImmediate(() => {
        void this.operationHandler!(pendingPath);
      });
    }
  }

  /**
   * Reset the queue state
   */
  reset(): void {
    this.isInProgress = false;
    this.pendingPath = null;
  }
}
