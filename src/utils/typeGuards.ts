/**
 * Type guards and utilities for safe type narrowing
 *
 * These utilities replace unsafe `as` type assertions with runtime checks
 * that provide proper type narrowing.
 */

import { GPSFixQuality } from "@core/types/GPSTypes";
import { ScreenType } from "@core/types/DisplayTypes";
import { BaseError } from "@core/errors/BaseError";

/**
 * Convert an unknown caught error to an Error instance.
 *
 * In TypeScript, caught errors are typed as `unknown`. This function
 * safely converts any value to an Error instance for consistent handling.
 *
 * @param error - The caught error value
 * @returns An Error instance
 *
 * @example
 * ```ts
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   const error = toError(err);
 *   logger.error(error.message);
 * }
 * ```
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string") {
    return new Error(error);
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return new Error(String((error as { message: unknown }).message));
  }
  return new Error(String(error));
}

/**
 * Type guard for Node.js ErrnoException.
 *
 * Checks if an error is a Node.js system error with an error code.
 *
 * @param error - The error to check
 * @returns True if the error is an ErrnoException
 *
 * @example
 * ```ts
 * try {
 *   await fs.readFile(path);
 * } catch (err) {
 *   if (isNodeJSErrnoException(err) && err.code === "ENOENT") {
 *     // Handle file not found
 *   }
 * }
 * ```
 */
export function isNodeJSErrnoException(
  error: unknown,
): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    ("code" in error || "errno" in error || "syscall" in error)
  );
}

/**
 * Type guard for GPSFixQuality enum values.
 *
 * Validates that a number is a valid GPS fix quality indicator.
 *
 * @param value - The value to check
 * @returns True if the value is a valid GPSFixQuality
 */
export function isGPSFixQuality(value: number): value is GPSFixQuality {
  return (
    Number.isInteger(value) &&
    value >= GPSFixQuality.NO_FIX &&
    value <= GPSFixQuality.SIMULATION
  );
}

/**
 * Safely convert a number to GPSFixQuality with fallback.
 *
 * @param value - The numeric value from NMEA sentence
 * @returns Valid GPSFixQuality, defaulting to NO_FIX for invalid values
 */
export function toGPSFixQuality(value: number): GPSFixQuality {
  if (isGPSFixQuality(value)) {
    return value;
  }
  return GPSFixQuality.NO_FIX;
}

/**
 * Type guard for ScreenType enum values.
 *
 * Validates that a string is a valid screen type.
 *
 * @param value - The value to check
 * @returns True if the value is a valid ScreenType
 */
export function isScreenType(value: string): value is ScreenType {
  return value === ScreenType.TRACK || value === ScreenType.TURN_BY_TURN;
}

/**
 * Type guard for BaseError instances.
 *
 * Checks if an error extends the BaseError class.
 *
 * @param error - The error to check
 * @returns True if the error is a BaseError
 */
export function isBaseError(error: unknown): error is BaseError {
  return (
    error instanceof Error &&
    "code" in error &&
    "recoverable" in error &&
    "getUserMessage" in error &&
    typeof (error as BaseError).getUserMessage === "function"
  );
}

/**
 * Type guard for error-like objects with code and getUserMessage.
 *
 * Checks if an object has the properties needed for error extraction,
 * even if it's not a true Error instance (e.g., mock objects in tests).
 */
function hasErrorInfo(
  error: unknown,
): error is { code: string; getUserMessage: () => string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    "getUserMessage" in error &&
    typeof (error as { getUserMessage: unknown }).getUserMessage === "function"
  );
}

/**
 * Extract error code and user message from a Result error.
 *
 * Works with BaseError subclasses, plain Error instances, and
 * error-like objects (useful for testing with mocks).
 *
 * @param error - The error from a failed Result
 * @returns Object with code and message for API responses
 */
export function extractErrorInfo(error: unknown): {
  code: string;
  message: string;
} {
  // Handle BaseError and error-like objects with code and getUserMessage
  if (hasErrorInfo(error)) {
    return {
      code: error.code,
      message: error.getUserMessage(),
    };
  }
  // Handle plain Error instances
  if (error instanceof Error) {
    return {
      code: "UNKNOWN_ERROR",
      message: error.message,
    };
  }
  // Fallback for any other type
  return {
    code: "UNKNOWN_ERROR",
    message: String(error),
  };
}
