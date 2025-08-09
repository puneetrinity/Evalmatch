/**
 * API Version Information Routes
 * Provides information about API versions, deprecations, and migration guides
 */

import { Router, Request, Response } from "express";

const router = Router();

/**
 * Get API version information
 * Available on both /api/version and /api/v1/version
 */
router.get("/version", async (req: Request, res: Response) => {
  const currentVersion = "v1";
  const supportedVersions = ["v1"];
  const deprecatedVersions = ["legacy"];

  res.json({
    status: "ok",
    api: {
      currentVersion,
      supportedVersions,
      deprecatedVersions,
      defaultVersion: currentVersion
    },
    versioning: {
      scheme: "path-based",
      pattern: "/api/{version}/*",
      example: {
        v1: "/api/v1/resumes",
        legacy: "/api/resumes (deprecated)"
      }
    },
    migration: {
      legacySupport: {
        enabled: true,
        deprecated: true,
        sunsetDate: "2025-12-31",
        migrationGuide: "https://docs.evalmatch.ai/api/migration"
      },
      breaking_changes: [],
      recommendations: [
        "Use /api/v1/* endpoints for new integrations",
        "Migrate legacy /api/* endpoints before sunset date",
        "Check deprecation headers in responses"
      ]
    },
    deprecation: {
      legacyRoutes: {
        deprecated: true,
        sunsetDate: "2025-12-31",
        alternativeEndpoints: {
          "/api/resumes": "/api/v1/resumes",
          "/api/job-descriptions": "/api/v1/job-descriptions",
          "/api/analysis": "/api/v1/analysis",
          "/api/admin": "/api/v1/admin"
        }
      }
    },
    headers: {
      version: "API-Version",
      supportedVersions: "X-Supported-Versions",
      deprecation: "Deprecation",
      sunset: "Sunset",
      successor: "Link"
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * Get API health and compatibility information
 */
router.get("/compatibility", async (req: Request, res: Response) => {
  res.json({
    status: "ok",
    compatibility: {
      v1: {
        status: "stable",
        features: ["all endpoints", "full functionality"],
        breaking_changes: [],
        last_updated: "2025-08-09"
      },
      legacy: {
        status: "deprecated",
        features: ["all endpoints", "full functionality"],
        breaking_changes: [],
        sunset_date: "2025-12-31",
        migration_required: true
      }
    },
    client_libraries: {
      javascript: {
        supported_versions: ["v1"],
        migration_notes: "Update base URL to /api/v1"
      },
      curl: {
        supported_versions: ["v1", "legacy"],
        migration_notes: "Add /v1 to URL path"
      }
    },
    timestamp: new Date().toISOString()
  });
});

export default router;