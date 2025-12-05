import { Result } from "@core/types";

/**
 * Web Interface Service Interface
 *
 * Responsible for serving the web-based control interface.
 * Provides HTTP API and static file serving.
 */
export interface IWebInterfaceService {
  /**
   * Initialize and start the web server
   * @returns Result indicating success or failure
   */
  start(): Promise<Result<void>>;

  /**
   * Stop the web server
   * @returns Result indicating success or failure
   */
  stop(): Promise<Result<void>>;

  /**
   * Check if the web server is running
   * @returns true if server is running
   */
  isRunning(): boolean;

  /**
   * Get the server URL
   * @returns Server URL (e.g., "http://192.168.1.1:3000")
   */
  getServerUrl(): string;

  /**
   * Get the server port
   * @returns Port number
   */
  getPort(): number;

  /**
   * Register a WebSocket connection handler
   * @param event Event name
   * @param handler Handler function
   */
  onWebSocketConnection(handler: (socket: unknown) => void): void;

  /**
   * Broadcast a message to all connected WebSocket clients
   * @param event Event name
   * @param data Data to send
   */
  broadcast(event: string, data: unknown): void;
}
