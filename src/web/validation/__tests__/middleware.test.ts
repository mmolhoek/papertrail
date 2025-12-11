/**
 * Tests for Validation Middleware
 */

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  validateBody,
  validateParams,
  validateQuery,
  validate,
} from "../middleware";

// Mock logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe("Validation Middleware", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockRequest = {
      method: "POST",
      path: "/test",
      body: {},
      params: {},
      query: {},
    };
    mockResponse = {
      status: statusMock,
      json: jsonMock,
    };
    mockNext = jest.fn();
  });

  describe("validateBody", () => {
    const testSchema = z.object({
      name: z.string().min(1),
      age: z.number().min(0),
    });

    it("should call next() on valid body", () => {
      mockRequest.body = { name: "John", age: 25 };
      const middleware = validateBody(testSchema);

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it("should replace body with parsed data", () => {
      mockRequest.body = { name: "John", age: 25, extra: "field" };
      const middleware = validateBody(testSchema);

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Zod strips unknown keys by default
      expect(mockRequest.body).toEqual({ name: "John", age: 25 });
    });

    it("should return 400 on invalid body", () => {
      mockRequest.body = { name: "", age: 25 };
      const middleware = validateBody(testSchema);

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: "VALIDATION_ERROR",
          }),
        }),
      );
    });

    it("should include field name in error message", () => {
      mockRequest.body = { name: "John", age: -1 };
      const middleware = validateBody(testSchema);

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining("age"),
          }),
        }),
      );
    });

    it("should include details array with all errors", () => {
      mockRequest.body = { name: "", age: -1 };
      const middleware = validateBody(testSchema);

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const response = jsonMock.mock.calls[0][0];
      expect(response.error.details).toHaveLength(2);
      expect(response.error.details[0].field).toBe("name");
      expect(response.error.details[1].field).toBe("age");
    });

    it("should apply transformations", () => {
      const schemaWithTransform = z.object({
        name: z.string().transform((val) => val.toUpperCase()),
      });
      mockRequest.body = { name: "john" };
      const middleware = validateBody(schemaWithTransform);

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.body).toEqual({ name: "JOHN" });
    });

    it("should apply default values", () => {
      const schemaWithDefault = z.object({
        name: z.string(),
        active: z.boolean().default(true),
      });
      mockRequest.body = { name: "John" };
      const middleware = validateBody(schemaWithDefault);

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.body).toEqual({ name: "John", active: true });
    });
  });

  describe("validateParams", () => {
    const paramsSchema = z.object({
      id: z.string().min(1),
    });

    it("should call next() on valid params", () => {
      mockRequest.params = { id: "123" };
      const middleware = validateParams(paramsSchema);

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should return 400 on invalid params", () => {
      mockRequest.params = { id: "" };
      const middleware = validateParams(paramsSchema);

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  describe("validateQuery", () => {
    const querySchema = z.object({
      page: z.string().optional(),
      limit: z.string().optional(),
    });

    it("should call next() on valid query", () => {
      mockRequest.query = { page: "1", limit: "10" };
      const middleware = validateQuery(querySchema);

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should call next() on empty query when all fields optional", () => {
      mockRequest.query = {};
      const middleware = validateQuery(querySchema);

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should return 400 on invalid query", () => {
      const strictSchema = z.object({
        page: z.string().min(1),
      });
      mockRequest.query = { page: "" };
      const middleware = validateQuery(strictSchema);

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  describe("validate", () => {
    const testSchema = z.object({
      name: z.string(),
      value: z.number(),
    });

    it("should return success with parsed data for valid input", () => {
      const result = validate(testSchema, { name: "test", value: 42 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ name: "test", value: 42 });
      }
    });

    it("should return failure with error for invalid input", () => {
      const result = validate(testSchema, {
        name: "test",
        value: "not a number",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.success).toBe(false);
        expect(result.error.error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("should apply transformations on success", () => {
      const schemaWithTransform = z.object({
        name: z.string().toUpperCase(),
      });
      const result = validate(schemaWithTransform, { name: "john" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("JOHN");
      }
    });
  });

  describe("Error response format", () => {
    it("should have consistent error structure", () => {
      const schema = z.object({ required: z.string() });
      mockRequest.body = {};
      const middleware = validateBody(schema);

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const response = jsonMock.mock.calls[0][0];
      expect(response).toEqual({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: expect.any(String),
          details: expect.arrayContaining([
            expect.objectContaining({
              field: expect.any(String),
              message: expect.any(String),
            }),
          ]),
        },
      });
    });

    it("should use 'body' as field for root-level errors", () => {
      const schema = z.string();
      mockRequest.body = 123; // Not a string
      const middleware = validateBody(schema);

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const response = jsonMock.mock.calls[0][0];
      expect(response.error.details[0].field).toBe("body");
    });

    it("should join nested path with dots", () => {
      const schema = z.object({
        user: z.object({
          profile: z.object({
            name: z.string(),
          }),
        }),
      });
      mockRequest.body = { user: { profile: { name: 123 } } };
      const middleware = validateBody(schema);

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const response = jsonMock.mock.calls[0][0];
      expect(response.error.details[0].field).toBe("user.profile.name");
    });
  });
});
