import { BaseError } from "./BaseError";

/**
 * Display-related error codes
 */
export enum DisplayErrorCode {
  // E-paper hardware errors
  DEVICE_NOT_FOUND = "DISPLAY_DEVICE_NOT_FOUND",
  DEVICE_INIT_FAILED = "DISPLAY_DEVICE_INIT_FAILED",
  DEVICE_NOT_INITIALIZED = "DISPLAY_DEVICE_NOT_INITIALIZED",
  SPI_ERROR = "DISPLAY_SPI_ERROR",
  GPIO_ERROR = "DISPLAY_GPIO_ERROR",

  // Display state errors
  DISPLAY_BUSY = "DISPLAY_BUSY",
  DISPLAY_TIMEOUT = "DISPLAY_TIMEOUT",
  DISPLAY_SLEEPING = "DISPLAY_SLEEPING",

  // Data errors
  INVALID_BITMAP = "DISPLAY_INVALID_BITMAP",
  BITMAP_SIZE_MISMATCH = "DISPLAY_BITMAP_SIZE_MISMATCH",
  INVALID_DIMENSIONS = "DISPLAY_INVALID_DIMENSIONS",

  // Rendering errors
  RENDER_FAILED = "DISPLAY_RENDER_FAILED",
  PROJECTION_ERROR = "DISPLAY_PROJECTION_ERROR",
  OUT_OF_BOUNDS = "DISPLAY_OUT_OF_BOUNDS",

  // Update errors
  UPDATE_FAILED = "DISPLAY_UPDATE_FAILED",
  REFRESH_FAILED = "DISPLAY_REFRESH_FAILED",

  // Generic
  UNKNOWN = "DISPLAY_UNKNOWN_ERROR",
}

/**
 * Display Service Error
 */
export class DisplayError extends BaseError {
  constructor(
    message: string,
    code: DisplayErrorCode = DisplayErrorCode.UNKNOWN,
    recoverable: boolean = false,
    context?: Record<string, any>,
  ) {
    super(message, code, recoverable, context);
  }

  /**
   * Create error for device not found
   */
  static deviceNotFound(devicePath: string): DisplayError {
    return new DisplayError(
      `E-paper device not found at ${devicePath}`,
      DisplayErrorCode.DEVICE_NOT_FOUND,
      false,
      { devicePath },
    );
  }

  /**
   * Create error for initialization failure
   */
  static initFailed(reason: string, error?: Error): DisplayError {
    return new DisplayError(
      `Failed to initialize e-paper display: ${reason}`,
      DisplayErrorCode.DEVICE_INIT_FAILED,
      false,
      { reason, originalError: error?.message },
    );
  }

  /**
   * Create error for device not initialized
   */
  static notInitialized(): DisplayError {
    return new DisplayError(
      "E-paper display not initialized. Call initialize() first.",
      DisplayErrorCode.DEVICE_NOT_INITIALIZED,
      false,
    );
  }

  /**
   * Create error for display busy
   */
  static displayBusy(): DisplayError {
    return new DisplayError(
      "Display is busy. Wait for current operation to complete.",
      DisplayErrorCode.DISPLAY_BUSY,
      true,
    );
  }

  /**
   * Create error for display timeout
   */
  static timeout(operation: string, timeoutMs: number): DisplayError {
    return new DisplayError(
      `Display timeout during ${operation} after ${timeoutMs}ms`,
      DisplayErrorCode.DISPLAY_TIMEOUT,
      true,
      { operation, timeoutMs },
    );
  }

  /**
   * Create error for invalid bitmap
   */
  static invalidBitmap(reason: string): DisplayError {
    return new DisplayError(
      `Invalid bitmap: ${reason}`,
      DisplayErrorCode.INVALID_BITMAP,
      false,
      { reason },
    );
  }

  /**
   * Create error for bitmap size mismatch
   */
  static sizeMismatch(
    bitmapWidth: number,
    bitmapHeight: number,
    displayWidth: number,
    displayHeight: number,
  ): DisplayError {
    return new DisplayError(
      `Bitmap size (${bitmapWidth}x${bitmapHeight}) does not match display (${displayWidth}x${displayHeight})`,
      DisplayErrorCode.BITMAP_SIZE_MISMATCH,
      false,
      { bitmapWidth, bitmapHeight, displayWidth, displayHeight },
    );
  }

  /**
   * Create error for rendering failure
   */
  static renderFailed(reason: string, error?: Error): DisplayError {
    return new DisplayError(
      `Failed to render viewport: ${reason}`,
      DisplayErrorCode.RENDER_FAILED,
      false,
      { reason, originalError: error?.message },
    );
  }

  /**
   * Create error for projection failure
   */
  static projectionError(
    lat: number,
    lon: number,
    reason: string,
  ): DisplayError {
    return new DisplayError(
      `Failed to project coordinates (${lat}, ${lon}): ${reason}`,
      DisplayErrorCode.PROJECTION_ERROR,
      false,
      { latitude: lat, longitude: lon, reason },
    );
  }

  /**
   * Create error for SPI communication failure
   */
  static spiError(error: Error): DisplayError {
    return new DisplayError(
      `SPI communication error: ${error.message}`,
      DisplayErrorCode.SPI_ERROR,
      true,
      { originalError: error.message },
    );
  }

  /**
   * Create error for GPIO error
   */
  static gpioError(pin: number, operation: string, error: Error): DisplayError {
    return new DisplayError(
      `GPIO error on pin ${pin} during ${operation}: ${error.message}`,
      DisplayErrorCode.GPIO_ERROR,
      true,
      { pin, operation, originalError: error.message },
    );
  }

  /**
   * Create error for update failure
   */
  static updateFailed(error: Error): DisplayError {
    return new DisplayError(
      `Failed to update display: ${error.message}`,
      DisplayErrorCode.UPDATE_FAILED,
      true,
      { originalError: error.message },
    );
  }

  getUserMessage(): string {
    switch (this.code) {
      case DisplayErrorCode.DEVICE_NOT_FOUND:
        return "E-paper display not found. Please check hardware connections.";
      case DisplayErrorCode.DEVICE_INIT_FAILED:
        return "Failed to initialize display. Please restart the device.";
      case DisplayErrorCode.DISPLAY_BUSY:
        return "Display is busy. Please wait.";
      case DisplayErrorCode.DISPLAY_TIMEOUT:
        return "Display operation timed out. Please try again.";
      case DisplayErrorCode.BITMAP_SIZE_MISMATCH:
        return "Image size does not match display. Please check configuration.";
      case DisplayErrorCode.RENDER_FAILED:
        return "Failed to render map. Please try again.";
      default:
        return "Display error occurred. Please try again.";
    }
  }
}

