import pino from "pino";
import { Request, Response } from "express";
import { Environment } from "../types/environment";

/**
 * Logger Configuration
 *
 * This module configures Pino logger with appropriate settings for different environments.
 * In development, it uses pino-pretty for human-readable logs.
 * In production, it outputs JSON logs suitable for log aggregation services.
 */

// Define log levels for different environments
const logLevels = {
  [Environment.Development]: "debug",
  [Environment.Test]: "error",
  [Environment.Production]: "info",
};

// Base configuration for all environments
const baseConfig = {
  level: logLevels[process.env.NODE_ENV as keyof typeof logLevels] || "info",
  timestamp: true,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "*.password",
      "*.apiKey",
      "*.secret",
      "*.credentials",
    ],
    censor: "[REDACTED]",
  },
};

// Development-specific configuration with pretty printing
const developmentConfig = {
  ...baseConfig,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  },
};

// Production-specific configuration optimized for log aggregation
const productionConfig = {
  ...baseConfig,
  // Include additional context in production logs
  base: {
    env: process.env.NODE_ENV,
    version: process.env.npm_package_version,
    nodeVersion: process.version,
  },
  formatters: {
    level: (label: string) => {
      return { level: label };
    },
  },
};

// Select the appropriate configuration based on environment
const config =
  process.env.NODE_ENV === Environment.Development
    ? developmentConfig
    : productionConfig;

// Create and export the logger instance
export const logger = pino(config);

// Create HTTP request logger middleware configuration
export const httpLoggerConfig = {
  // Use our configured logger instance
  logger,

  // Auto-generate request IDs for tracing requests through logs
  genReqId: (req: Request) => {
    const headerId = req.headers["x-request-id"] as string | undefined;
    const serializerId = (pino.stdSerializers.req(req) as any)?.id as string | undefined;
    const fallback = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return String(headerId || serializerId || fallback);
  },

  // Custom serializers for request/response objects
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },

  // Customize log level based on response status
  customLogLevel: (req: Request, res: Response, err?: Error) => {
    if (res.statusCode >= 500 || err) {
      return "error";
    } else if (res.statusCode >= 400) {
      return "warn";
    }
    return "info";
  },

  // Skip noisy endpoints in production
  autoLogging: {
    ignore: (req: Request) => {
      return (
        process.env.NODE_ENV === Environment.Production &&
        (req.url === "/api/health" || req.url.includes("/static/"))
      );
    },
  },

  // Add custom request properties
  customProps: (_req: Request, res: Response) => {
    const rt = res.getHeader?.("X-Response-Time");
    const responseTime = typeof rt === "string" ? Number(rt) : Array.isArray(rt) ? Number(rt[0]) : (rt as number | undefined);
    return {
      environment: process.env.NODE_ENV,
      ...(responseTime != null ? { responseTime } : {}),
    };
  },
};
