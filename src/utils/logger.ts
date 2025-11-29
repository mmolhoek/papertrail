import winston from "winston";

/**
 * Logger instance for logging messages at different log levels.
 * The logger is configured to log to stdout by default.
 * If you want to log to a different transport, you can pass it as an argument.
 * Note that in production, the log level is set to `info` by default.
 * Any log messages with a lower log level will not be logged.
 * @param transport {winston.transport} optional transport to log to
 *
 * @example
 * import { logger } from "./logger";
 *
 * logger.info("This is an info message");
 * logger.debug("This is a debug message");
 *
 * @remarks
 * The logger supports the following log levels:
 * - `error`: For logging error messages
 * - `warn`: For logging warning messages
 * - `info`: For logging informational messages
 * - `verbose`: For logging verbose messages
 * - `debug`: For logging debug messages
 * - `silly`: For logging silly messages
 */

export const getLogger = (
  prefix: string,
  transport?: winston.transport,
): winston.Logger =>
  winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: winston.format.combine(
      winston.format.label({ label: prefix }),
      winston.format.timestamp(),
      winston.format.printf(({ label, message }) => {
        return `[${label}] ${message}`;
      }),
    ),

    transports: [
      new winston.transports.Console(), // Log to stdout by default
      ...(transport ? [transport] : []),
    ],
  });
