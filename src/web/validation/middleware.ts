/**
 * Validation Middleware
 *
 * Express middleware for validating request data using Zod schemas.
 * Provides consistent error responses and automatic type inference.
 */

import { Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import { getLogger } from "@utils/logger";

const logger = getLogger("ValidationMiddleware");

/**
 * Validation error response format
 */
interface ValidationErrorResponse {
  success: false;
  error: {
    code: "VALIDATION_ERROR";
    message: string;
    details?: Array<{
      field: string;
      message: string;
    }>;
  };
}

/**
 * Format Zod error into a user-friendly response
 */
function formatZodError(error: z.ZodError): ValidationErrorResponse {
  const issues = error.issues;
  const details = issues.map((issue) => ({
    field: issue.path.join(".") || "body",
    message: issue.message,
  }));

  // Create a summary message from the first error
  const firstIssue = issues[0];
  const fieldPath = firstIssue.path.join(".");
  const message = fieldPath
    ? `${fieldPath}: ${firstIssue.message}`
    : firstIssue.message;

  return {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message,
      details,
    },
  };
}

/**
 * Create middleware that validates request body against a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * app.post('/api/config/zoom',
 *   validateBody(setZoomSchema),
 *   controller.setZoom.bind(controller)
 * );
 * ```
 */
export function validateBody<T>(schema: z.ZodType<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      logger.debug(
        `Body validation failed for ${req.method} ${req.path}:`,
        result.error.issues,
      );
      res.status(400).json(formatZodError(result.error));
      return;
    }

    // Replace body with parsed/transformed data
    req.body = result.data;
    next();
  };
}

/**
 * Create middleware that validates route parameters against a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * app.delete('/api/drive/route/:routeId',
 *   validateParams(deleteDriveRouteParamsSchema),
 *   controller.deleteDriveRoute.bind(controller)
 * );
 * ```
 */
export function validateParams<T>(schema: z.ZodType<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      logger.debug(
        `Params validation failed for ${req.method} ${req.path}:`,
        result.error.issues,
      );
      res.status(400).json(formatZodError(result.error));
      return;
    }

    // Replace params with parsed data
    req.params = result.data as Record<string, string>;
    next();
  };
}

/**
 * Create middleware that validates query parameters against a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * app.get('/api/tracks',
 *   validateQuery(listTracksQuerySchema),
 *   controller.listTracks.bind(controller)
 * );
 * ```
 */
export function validateQuery<T>(schema: z.ZodType<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      logger.debug(
        `Query validation failed for ${req.method} ${req.path}:`,
        result.error.issues,
      );
      res.status(400).json(formatZodError(result.error));
      return;
    }

    // Replace query with parsed data
    req.query = result.data as Record<string, string>;
    next();
  };
}

/**
 * Validate data against a schema and return the result
 * Useful for validation within controller methods
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validation result with parsed data or error
 *
 * @example
 * ```typescript
 * const result = validate(driveRouteSchema, req.body);
 * if (!result.success) {
 *   res.status(400).json(result.error);
 *   return;
 * }
 * const route = result.data;
 * ```
 */
export function validate<T>(
  schema: z.ZodType<T>,
  data: unknown,
):
  | { success: true; data: T }
  | { success: false; error: ValidationErrorResponse } {
  const result = schema.safeParse(data);

  if (!result.success) {
    return {
      success: false,
      error: formatZodError(result.error),
    };
  }

  return {
    success: true,
    data: result.data,
  };
}
