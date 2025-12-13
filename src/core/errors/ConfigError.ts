import { BaseError } from "./BaseError";

/**
 * Config-related error codes
 */
export enum ConfigErrorCode {
  // File errors
  FILE_NOT_FOUND = "CONFIG_FILE_NOT_FOUND",
  FILE_READ_ERROR = "CONFIG_FILE_READ_ERROR",
  FILE_WRITE_ERROR = "CONFIG_FILE_WRITE_ERROR",

  // Parsing errors
  PARSE_ERROR = "CONFIG_PARSE_ERROR",
  INVALID_JSON = "CONFIG_INVALID_JSON",

  // Validation errors
  INVALID_CONFIG = "CONFIG_INVALID_CONFIG",
  MISSING_REQUIRED_FIELD = "CONFIG_MISSING_REQUIRED_FIELD",
  INVALID_VALUE = "CONFIG_INVALID_VALUE",
  OUT_OF_RANGE = "CONFIG_OUT_OF_RANGE",

  // State errors
  NOT_INITIALIZED = "CONFIG_NOT_INITIALIZED",
  ALREADY_INITIALIZED = "CONFIG_ALREADY_INITIALIZED",

  // Generic
  UNKNOWN = "CONFIG_UNKNOWN_ERROR",
}

/**
 * Config Service Error
 */
export class ConfigError extends BaseError {
  constructor(
    message: string,
    code: ConfigErrorCode = ConfigErrorCode.UNKNOWN,
    recoverable: boolean = false,
    context?: Record<string, unknown>,
  ) {
    super(message, code, recoverable, context);
  }

  /**
   * Create error for file not found
   */
  static fileNotFound(filePath: string): ConfigError {
    return new ConfigError(
      `Configuration file not found: ${filePath}`,
      ConfigErrorCode.FILE_NOT_FOUND,
      false,
      { filePath },
    );
  }

  /**
   * Create error for file read failure
   */
  static readError(filePath: string, error: Error): ConfigError {
    return new ConfigError(
      `Failed to read configuration file: ${error.message}`,
      ConfigErrorCode.FILE_READ_ERROR,
      false,
      { filePath, originalError: error.message },
    );
  }

  /**
   * Create error for file write failure
   */
  static writeError(filePath: string, error: Error): ConfigError {
    return new ConfigError(
      `Failed to write configuration file: ${error.message}`,
      ConfigErrorCode.FILE_WRITE_ERROR,
      true,
      { filePath, originalError: error.message },
    );
  }

  /**
   * Create error for invalid JSON
   */
  static invalidJSON(filePath: string, error: Error): ConfigError {
    return new ConfigError(
      `Invalid JSON in configuration file: ${error.message}`,
      ConfigErrorCode.INVALID_JSON,
      false,
      { filePath, originalError: error.message },
    );
  }

  /**
   * Create error for missing required field
   */
  static missingField(field: string): ConfigError {
    return new ConfigError(
      `Missing required configuration field: ${field}`,
      ConfigErrorCode.MISSING_REQUIRED_FIELD,
      false,
      { field },
    );
  }

  /**
   * Create error for invalid value
   */
  static invalidValue(
    field: string,
    value: unknown,
    expected: string,
  ): ConfigError {
    return new ConfigError(
      `Invalid value for ${field}: ${value} (expected: ${expected})`,
      ConfigErrorCode.INVALID_VALUE,
      false,
      { field, value, expected },
    );
  }

  /**
   * Create error for out of range value
   */
  static outOfRange(
    field: string,
    value: number,
    min: number,
    max: number,
  ): ConfigError {
    return new ConfigError(
      `Value for ${field} (${value}) is out of range (${min}-${max})`,
      ConfigErrorCode.OUT_OF_RANGE,
      false,
      { field, value, min, max },
    );
  }

  /**
   * Create error for not initialized
   */
  static notInitialized(): ConfigError {
    return new ConfigError(
      "Configuration service not initialized. Call initialize() first.",
      ConfigErrorCode.NOT_INITIALIZED,
      false,
    );
  }

  /**
   * Create error for parse failure
   */
  static parseError(error: Error): ConfigError {
    return new ConfigError(
      `Failed to parse configuration: ${error.message}`,
      ConfigErrorCode.PARSE_ERROR,
      false,
      { originalError: error.message },
    );
  }
}
