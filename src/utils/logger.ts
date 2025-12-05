import winston from "winston";

/**
 * Extended logger interface that includes timing functionality
 */
export interface Logger extends winston.Logger {
  time(label: string): void;
  timeEnd(label: string): void;
}

/**
 * Get the list of allowed logger prefixes from LOG_ONLY env var
 * Returns null if no filter is set (all loggers allowed)
 */
const getAllowedLoggers = (): Set<string> | null => {
  const logOnly = process.env.LOG_ONLY;
  if (!logOnly) return null;
  return new Set(logOnly.split(",").map((s) => s.trim()));
};

/**
 * Logger instance for logging messages at different log levels.
 * The logger is configured to log to stdout by default.
 * If you want to log to a different transport, you can pass it as an argument.
 * Note that in production, the log level is set to `info` by default.
 * Any log messages with a lower log level will not be logged.
 * @param transport {winston.transport} optional transport to log to
 *
 * @example
 * import { getLogger } from "./logger";
 *
 * const logger = getLogger("MyService");
 * logger.info("This is an info message");
 * logger.debug("This is a debug message");
 * logger.time("operation");
 * // ... do some work
 * logger.timeEnd("operation"); // Logs: operation: 123ms
 *
 * @remarks
 * The logger supports the following log levels:
 * - `error`: For logging error messages
 * - `warn`: For logging warning messages
 * - `info`: For logging informational messages
 * - `verbose`: For logging verbose messages
 * - `debug`: For logging debug messages
 * - `silly`: For logging silly messages
 *
 * Timing functionality:
 * - `time(label)`: Start a timer with the given label
 * - `timeEnd(label)`: End the timer and log the elapsed time
 *
 * Filtering (for debugging):
 * - Set LOG_ONLY=SVGService to only see logs from SVGService
 * - Set LOG_ONLY=SVGService,RenderingOrchestrator for multiple services
 */

export const getLogger = (
  prefix: string,
  transport?: winston.transport,
): Logger => {
  const allowedLoggers = getAllowedLoggers();

  // Create a filter format that silences non-allowed loggers
  const filterFormat = winston.format((info) => {
    if (allowedLoggers && !allowedLoggers.has(info.label as string)) {
      return false; // Filter out this log
    }
    return info;
  });

  const baseLogger = winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: winston.format.combine(
      winston.format.label({ label: prefix }),
      winston.format.timestamp(),
      filterFormat(),
      winston.format.printf(({ label, message }) => {
        return `[${label}] ${message}`;
      }),
    ),

    transports: [
      new winston.transports.Console(), // Log to stdout by default
      ...(transport ? [transport] : []),
    ],
  });

  // Map to store timer start times
  const timers = new Map<string, number>();

  // Extend the logger with timing methods
  const extendedLogger = baseLogger as Logger;

  extendedLogger.time = (label: string): void => {
    timers.set(label, Date.now());
  };

  extendedLogger.timeEnd = (label: string): void => {
    const startTime = timers.get(label);
    if (startTime === undefined) {
      extendedLogger.warn(`Timer '${label}' does not exist`);
      return;
    }

    const duration = Date.now() - startTime;
    extendedLogger.info(`${label}: ${duration}ms`);
    timers.delete(label);
  };

  return extendedLogger;
};
