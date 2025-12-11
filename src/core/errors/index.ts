/**
 * Core error classes for the Papertrail GPS tracker application
 *
 * All custom errors extend BaseError and include:
 * - Error codes for categorization
 * - Timestamps
 * - Context data
 * - Recoverable flag
 * - User-friendly messages
 *
 * Error messages are centralized in ErrorMessages.ts for:
 * - Easy maintenance
 * - Future i18n support
 * - Consistent user experience
 */

export * from "./BaseError";
export * from "./GPSError";
export * from "./MapError";
export * from "./DisplayError";
export * from "./ConfigError";
export * from "./OrchestratorError";
export * from "./WebError";
export * from "./WiFiError";
export * from "./DriveError";
export * from "./ErrorMessages";
