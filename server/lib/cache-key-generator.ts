/**
 * Phase 1.2: Enhanced cache key generation with canonicalization and versioning
 * Addresses cache key drift and provides built-in invalidation
 */
import crypto from "crypto";

export type CacheKeyParts = {
  resumeData: unknown;
  jobData: unknown;
  useFullText?: boolean;
  provider: "groq" | "openai" | "anthropic";
  versions: {
    scoring: string;       // e.g. "scoring@2025-08-27"
    prompt: string;        // e.g. "prompt@v7"
    normalization: string; // bump if canonicalization changes
  };
  tenantId?: string;       // tenant-scoped caching
};

// Current system versions - bump these to invalidate cache
export const CURRENT_VERSIONS = {
  scoring: "scoring@2025-08-28",
  prompt: "prompt@v8",
  normalization: "norm@v1"
};

/**
 * Canonicalize data to ensure consistent cache keys regardless of field order
 */
const canonicalize = (v: unknown): unknown => {
  if (Array.isArray(v)) {
    return v
      .map(canonicalize)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  
  if (v && typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    return Object.keys(o)
      .sort()
      .reduce((acc, k) => {
        acc[k] = canonicalize(o[k]);
        return acc;
      }, {} as Record<string, unknown>);
  }
  
  if (typeof v === "string") {
    return v.trim().replace(/\s+/g, " ").toLowerCase();
  }
  
  return v;
};

/**
 * Generate deterministic cache key for match analysis
 */
export function generateMatchAnalysisKey(parts: CacheKeyParts): string {
  const payload = {
    provider: parts.provider,
    versions: parts.versions,
    // Canonicalize to prevent key drift from field reordering
    resume: canonicalize(parts.resumeData),
    job: canonicalize(parts.jobData),
    useFullText: !!parts.useFullText,
    tenant: parts.tenantId ?? "global"
  };
  
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
    
  return `analysis:match:${parts.provider}:${hash}`;
}

/**
 * Generate cache key for resume analysis
 */
export function generateResumeAnalysisKey(
  content: string, 
  provider: string,
  tenantId?: string
): string {
  const payload = {
    provider,
    versions: CURRENT_VERSIONS,
    content: canonicalize(content),
    tenant: tenantId ?? "global"
  };
  
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
    
  return `analysis:resume:${provider}:${hash}`;
}

/**
 * Generate cache key for job analysis
 */
export function generateJobAnalysisKey(
  title: string,
  description: string,
  provider: string,
  tenantId?: string
): string {
  const payload = {
    provider,
    versions: CURRENT_VERSIONS,
    title: canonicalize(title),
    description: canonicalize(description),
    tenant: tenantId ?? "global"
  };
  
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
    
  return `analysis:job:${provider}:${hash}`;
}

/**
 * Generate in-flight lock key to prevent cache stampedes
 */
export function generateInflightLockKey(baseKey: string): string {
  const hash = crypto.createHash("sha256").update(baseKey).digest("hex");
  return `analysis:lock:${hash.substring(0, 16)}`;
}