import { BaseError } from "./BaseError";

/**
 * Orchestrator-related error codes
 */
export enum OrchestratorErrorCode {
  // Initialization errors
  INIT_FAILED = "ORCHESTRATOR_INIT_FAILED",
  SERVICE_INIT_FAILED = "ORCHESTRATOR_SERVICE_INIT_FAILED",
  NOT_INITIALIZED = "ORCHESTRATOR_NOT_INITIALIZED",

  // State errors
  NO_ACTIVE_GPX = "ORCHESTRATOR_NO_ACTIVE_GPX",
  INVALID_STATE = "ORCHESTRATOR_INVALID_STATE",
  ALREADY_RUNNING = "ORCHESTRATOR_ALREADY_RUNNING",
  NOT_RUNNING = "ORCHESTRATOR_NOT_RUNNING",

  // Operation errors
  UPDATE_FAILED = "ORCHESTRATOR_UPDATE_FAILED",
  MULTIPLE_ERRORS = "ORCHESTRATOR_MULTIPLE_ERRORS",

  // Generic
  UNKNOWN = "ORCHESTRATOR_UNKNOWN_ERROR",
}

/**
 * Orchestrator Service Error
 */
export class OrchestratorError extends BaseError {
  /**
   * Original errors that caused this orchestrator error
   */
  public readonly errors?: Error[];

  constructor(
    message: string,
    code: OrchestratorErrorCode = OrchestratorErrorCode.UNKNOWN,
    recoverable: boolean = false,
    context?: Record<string, unknown>,
    errors?: Error[],
  ) {
    super(message, code, recoverable, context);
    this.errors = errors;
  }

  /**
   * Create error for initialization failure
   */
  static initFailed(serviceName: string, error: Error): OrchestratorError {
    return new OrchestratorError(
      `Failed to initialize ${serviceName}: ${error.message}`,
      OrchestratorErrorCode.SERVICE_INIT_FAILED,
      false,
      { serviceName, originalError: error.message },
      [error],
    );
  }

  /**
   * Create error for not initialized
   */
  static notInitialized(): OrchestratorError {
    return new OrchestratorError(
      "Orchestrator not initialized. Call initialize() first.",
      OrchestratorErrorCode.NOT_INITIALIZED,
      false,
    );
  }

  /**
   * Create error for no active GPX
   */
  static noActiveGPX(): OrchestratorError {
    return new OrchestratorError(
      "No active GPX file selected. Please select a track first.",
      OrchestratorErrorCode.NO_ACTIVE_GPX,
      false,
    );
  }

  /**
   * Create error for update failure
   */
  static updateFailed(stage: string, error: Error): OrchestratorError {
    return new OrchestratorError(
      `Display update failed at ${stage}: ${error.message}`,
      OrchestratorErrorCode.UPDATE_FAILED,
      true,
      { stage, originalError: error.message },
      [error],
    );
  }

  /**
   * Create error for multiple failures
   */
  static multipleErrors(errors: Error[]): OrchestratorError {
    const messages = errors.map((e) => e.message).join("; ");
    return new OrchestratorError(
      `Multiple errors occurred: ${messages}`,
      OrchestratorErrorCode.MULTIPLE_ERRORS,
      true,
      { errorCount: errors.length },
      errors,
    );
  }

  /**
   * Create error for already running
   */
  static alreadyRunning(): OrchestratorError {
    return new OrchestratorError(
      "Auto-update is already running",
      OrchestratorErrorCode.ALREADY_RUNNING,
      false,
    );
  }

  /**
   * Create error for not running
   */
  static notRunning(): OrchestratorError {
    return new OrchestratorError(
      "Auto-update is not running",
      OrchestratorErrorCode.NOT_RUNNING,
      false,
    );
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      errors: this.errors?.map((e) => ({
        name: e.name,
        message: e.message,
        stack: e.stack,
      })),
    };
  }

  getUserMessage(): string {
    switch (this.code) {
      case OrchestratorErrorCode.SERVICE_INIT_FAILED:
        return "Failed to start application services. Please restart.";
      case OrchestratorErrorCode.NO_ACTIVE_GPX:
        return "No track selected. Please select a GPX file.";
      case OrchestratorErrorCode.UPDATE_FAILED:
        return "Failed to update display. Please try again.";
      case OrchestratorErrorCode.MULTIPLE_ERRORS:
        return "Multiple errors occurred. Please check system status.";
      case OrchestratorErrorCode.ALREADY_RUNNING:
        return "Auto-update is already active.";
      case OrchestratorErrorCode.NOT_RUNNING:
        return "Auto-update is not active.";
      default:
        return "System error occurred. Please try again.";
    }
  }
}
