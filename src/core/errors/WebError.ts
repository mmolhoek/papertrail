import { BaseError } from './BaseError';

/**
 * Web-related error codes
 */
export enum WebErrorCode {
  // Server errors
  SERVER_START_FAILED = 'WEB_SERVER_START_FAILED',
  SERVER_STOP_FAILED = 'WEB_SERVER_STOP_FAILED',
  SERVER_NOT_RUNNING = 'WEB_SERVER_NOT_RUNNING',
  PORT_IN_USE = 'WEB_PORT_IN_USE',
  
  // Request errors
  INVALID_REQUEST = 'WEB_INVALID_REQUEST',
  MISSING_PARAMETER = 'WEB_MISSING_PARAMETER',
  INVALID_PARAMETER = 'WEB_INVALID_PARAMETER',
  
  // Authentication errors
  UNAUTHORIZED = 'WEB_UNAUTHORIZED',
  FORBIDDEN = 'WEB_FORBIDDEN',
  
  // Resource errors
  NOT_FOUND = 'WEB_NOT_FOUND',
  METHOD_NOT_ALLOWED = 'WEB_METHOD_NOT_ALLOWED',
  
  // WebSocket errors
  WEBSOCKET_ERROR = 'WEB_WEBSOCKET_ERROR',
  BROADCAST_FAILED = 'WEB_BROADCAST_FAILED',
  
  // Generic
  UNKNOWN = 'WEB_UNKNOWN_ERROR',
}

/**
 * Web Service Error
 */
export class WebError extends BaseError {
  /**
   * HTTP status code associated with this error
   */
  public readonly statusCode?: number;

  constructor(
    message: string,
    code: WebErrorCode = WebErrorCode.UNKNOWN,
    recoverable: boolean = false,
    context?: Record<string, any>,
    statusCode?: number
  ) {
    super(message, code, recoverable, context);
    this.statusCode = statusCode;
  }

  /**
   * Create error for server start failure
   */
  static serverStartFailed(port: number, error: Error): WebError {
    return new WebError(
      `Failed to start web server on port ${port}: ${error.message}`,
      WebErrorCode.SERVER_START_FAILED,
      false,
      { port, originalError: error.message },
      500
    );
  }

  /**
   * Create error for port in use
   */
  static portInUse(port: number): WebError {
    return new WebError(
      `Port ${port} is already in use`,
      WebErrorCode.PORT_IN_USE,
      false,
      { port },
      500
    );
  }

  /**
   * Create error for server not running
   */
  static serverNotRunning(): WebError {
    return new WebError(
      'Web server is not running',
      WebErrorCode.SERVER_NOT_RUNNING,
      false,
      {},
      503
    );
  }

  /**
   * Create error for invalid request
   */
  static invalidRequest(reason: string): WebError {
    return new WebError(
      `Invalid request: ${reason}`,
      WebErrorCode.INVALID_REQUEST,
      false,
      { reason },
      400
    );
  }

  /**
   * Create error for missing parameter
   */
  static missingParameter(parameter: string): WebError {
    return new WebError(
      `Missing required parameter: ${parameter}`,
      WebErrorCode.MISSING_PARAMETER,
      false,
      { parameter },
      400
    );
  }

  /**
   * Create error for invalid parameter
   */
  static invalidParameter(parameter: string, value: any, expected: string): WebError {
    return new WebError(
      `Invalid parameter ${parameter}: ${value} (expected: ${expected})`,
      WebErrorCode.INVALID_PARAMETER,
      false,
      { parameter, value, expected },
      400
    );
  }

  /**
   * Create error for unauthorized access
   */
  static unauthorized(reason?: string): WebError {
    return new WebError(
      reason || 'Unauthorized access',
      WebErrorCode.UNAUTHORIZED,
      false,
      { reason },
      401
    );
  }

  /**
   * Create error for forbidden access
   */
  static forbidden(reason?: string): WebError {
    return new WebError(
      reason || 'Forbidden',
      WebErrorCode.FORBIDDEN,
      false,
      { reason },
      403
    );
  }

  /**
   * Create error for not found
   */
  static notFound(resource: string): WebError {
    return new WebError(
      `Resource not found: ${resource}`,
      WebErrorCode.NOT_FOUND,
      false,
      { resource },
      404
    );
  }

  /**
   * Create error for method not allowed
   */
  static methodNotAllowed(method: string, path: string): WebError {
    return new WebError(
      `Method ${method} not allowed for ${path}`,
      WebErrorCode.METHOD_NOT_ALLOWED,
      false,
      { method, path },
      405
    );
  }

  /**
   * Create error for WebSocket error
   */
  static websocketError(error: Error): WebError {
    return new WebError(
      `WebSocket error: ${error.message}`,
      WebErrorCode.WEBSOCKET_ERROR,
      true,
      { originalError: error.message },
      500
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      statusCode: this.statusCode,
    };
  }

  getUserMessage(): string {
    switch (this.code) {
      case WebErrorCode.SERVER_START_FAILED:
        return 'Failed to start web interface. Please check configuration.';
      case WebErrorCode.PORT_IN_USE:
        return 'Web interface port is already in use. Please change the port.';
      case WebErrorCode.SERVER_NOT_RUNNING:
        return 'Web interface is not running.';
      case WebErrorCode.INVALID_REQUEST:
        return 'Invalid request. Please check your input.';
      case WebErrorCode.MISSING_PARAMETER:
        return 'Missing required information. Please check your input.';
      case WebErrorCode.UNAUTHORIZED:
        return 'Authentication required. Please log in.';
      case WebErrorCode.FORBIDDEN:
        return 'You do not have permission to access this resource.';
      case WebErrorCode.NOT_FOUND:
        return 'Resource not found.';
      default:
        return 'Web interface error occurred. Please try again.';
    }
  }
}