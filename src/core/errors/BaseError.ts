import { getUserMessage as getErrorUserMessage } from "./ErrorMessages";

/**
 * Base error class for all custom errors in the application
 * Extends Error to maintain stack traces and instanceof checks
 */
export abstract class BaseError extends Error {
  /**
   * Error code for categorization
   */
  public readonly code: string;

  /**
   * Timestamp when error occurred
   */
  public readonly timestamp: Date;

  /**
   * Additional context about the error
   */
  public readonly context?: Record<string, unknown>;

  /**
   * Whether this error is recoverable
   */
  public readonly recoverable: boolean;

  constructor(
    message: string,
    code: string,
    recoverable: boolean = false,
    context?: Record<string, unknown>,
  ) {
    super(message);

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);

    // Set the prototype explicitly for instanceof to work
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = new Date();
    this.recoverable = recoverable;
    this.context = context;
  }

  /**
   * Convert error to a plain object for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp.toISOString(),
      recoverable: this.recoverable,
      context: this.context,
      stack: this.stack,
    };
  }

  /**
   * Get a user-friendly error message.
   * Uses centralized error messages from ErrorMessages.ts for consistent
   * user-facing messages. Falls back to the technical message if no
   * user message is defined for this error code.
   */
  getUserMessage(): string {
    return getErrorUserMessage(this.code);
  }
}
