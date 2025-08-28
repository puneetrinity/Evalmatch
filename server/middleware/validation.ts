/**
 * Request Validation Middleware
 * Provides request body validation using Zod schemas
 */

import { z } from "zod";
import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

/**
 * Validate request body against a Zod schema
 */
export function validateRequest<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const errorMessage = result.error.errors
      .map((err) => `${err.path.join(".")}: ${err.message}`)
      .join(", ");
    throw new Error(`Validation failed: ${errorMessage}`);
  }
  return result.data;
}

/**
 * Express middleware factory for request validation
 */
export function createValidationMiddleware<T>(schema: z.ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.validatedBody = validateRequest(schema, req.body);
      next();
    } catch (error) {
      logger.warn("Request validation failed:", {
        error: error instanceof Error ? error.message : "Unknown error",
        body: req.body,
        endpoint: req.path,
      });

      res.status(400).json({
        error: "Validation Error",
        message:
          error instanceof Error ? error.message : "Invalid request data",
      });
    }
  };
}

// Extend Express Request interface to include validated body
declare global {
  namespace Express {
    interface Request {
      validatedBody?: unknown;
    }
  }
}
