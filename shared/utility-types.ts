/**
 * Utility Types and Common Patterns
 * 
 * This file provides reusable utility types, branded types,
 * and common patterns used throughout the application.
 */

// Generic utility types
export type NonEmptyArray<T> = [T, ...T[]];
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type Required<T, K extends keyof T> = T & { [P in K]-?: T[P] };
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
export type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P];
};

// Branded types for domain entities
export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

// ID types with branding
export type UserId = Brand<string, 'UserId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type ResumeId = Brand<number, 'ResumeId'>;
export type JobId = Brand<number, 'JobId'>;
export type AnalysisId = Brand<number, 'AnalysisId'>;
export type InterviewId = Brand<number, 'InterviewId'>;
export type SkillId = Brand<number, 'SkillId'>;
export type CategoryId = Brand<number, 'CategoryId'>;

// Hash and token types
export type FileHash = Brand<string, 'FileHash'>;
export type AuthToken = Brand<string, 'AuthToken'>;
export type RefreshToken = Brand<string, 'RefreshToken'>;
export type ApiKey = Brand<string, 'ApiKey'>;
export type EncryptionKey = Brand<string, 'EncryptionKey'>;

// Email and URL types
export type EmailAddress = Brand<string, 'EmailAddress'>;
export type HttpUrl = Brand<string, 'HttpUrl'>;
export type SecureUrl = Brand<string, 'SecureUrl'>;

// File system types
export type FilePath = Brand<string, 'FilePath'>;
export type FileName = Brand<string, 'FileName'>;
export type MimeType = Brand<string, 'MimeType'>;
export type FileSize = Brand<number, 'FileSize'>;

// Date and time types
export type ISODateString = Brand<string, 'ISODateString'>;
export type UnixTimestamp = Brand<number, 'UnixTimestamp'>;
export type DurationMs = Brand<number, 'DurationMs'>;

// Numeric types with constraints
export type PositiveInteger = Brand<number, 'PositiveInteger'>;
export type NonNegativeInteger = Brand<number, 'NonNegativeInteger'>;
export type Percentage = Brand<number, 'Percentage'>; // 0-100
export type Score = Brand<number, 'Score'>; // 0-100
export type Confidence = Brand<number, 'Confidence'>; // 0-1

// Environment types
export type Environment = 'development' | 'test' | 'production';
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';
export type DatabaseType = 'postgresql' | 'sqlite' | 'memory';

// API related types
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type HttpStatusCode = Brand<number, 'HttpStatusCode'>;
export type ContentType = Brand<string, 'ContentType'>;

// Analysis specific types
export type ConfidenceLevel = 'low' | 'medium' | 'high';
export type SkillImportance = 'critical' | 'important' | 'nice-to-have';
export type MatchSource = 'exact' | 'semantic' | 'inferred';
export type ExperienceLevel = 'entry' | 'junior' | 'mid' | 'senior' | 'lead' | 'executive';

// Interview types
export type QuestionCategory = 'technical' | 'behavioral' | 'situational' | 'cultural' | 'problem-solving';
export type QuestionDifficulty = 'easy' | 'medium' | 'hard';
export type InterviewType = 'phone' | 'video' | 'onsite' | 'technical' | 'panel';

// File processing types
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type UploadStatus = 'uploading' | 'success' | 'error' | 'pending';

// AI Provider types
export type AIProvider = 'openai' | 'anthropic' | 'groq' | 'local';
export type ModelVersion = Brand<string, 'ModelVersion'>;

// Validation result types
export interface ValidationResult<T = unknown> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: unknown;
}

// Result types for operations that can fail
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

// Async result type
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

// Pagination types
export interface PaginationParams {
  page?: PositiveInteger;
  limit?: PositiveInteger;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: PositiveInteger;
    limit: PositiveInteger;
    total: NonNegativeInteger;
    totalPages: PositiveInteger;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

// Search and filter types
export interface SearchParams {
  query?: string;
  filters?: Record<string, string | string[]>;
  dateRange?: {
    from?: ISODateString;
    to?: ISODateString;
  };
}

// File upload types
export interface FileUploadOptions {
  maxSize?: FileSize;
  allowedTypes?: MimeType[];
  requireAuth?: boolean;
  generateHash?: boolean;
  virusScan?: boolean;
}

export interface UploadedFileInfo {
  id?: ResumeId;
  filename: FileName;
  originalName: FileName;
  mimetype: MimeType;
  size: FileSize;
  hash?: FileHash;
  path?: FilePath;
  uploadedAt: ISODateString;
  uploadedBy?: UserId;
}

// Configuration types
export interface DatabaseConfig {
  type: DatabaseType;
  url?: string;
  host?: string;
  port?: PositiveInteger;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  poolMin?: NonNegativeInteger;
  poolMax?: PositiveInteger;
  connectionTimeout?: DurationMs;
  queryTimeout?: DurationMs;
}

export interface ServerConfig {
  environment: Environment;
  port: PositiveInteger;
  host: string;
  logLevel: LogLevel;
  corsOrigin?: string;
  rateLimit?: {
    windowMs: DurationMs;
    maxRequests: PositiveInteger;
  };
  session?: {
    secret: EncryptionKey;
    maxAge?: DurationMs;
    secure?: boolean;
  };
}

// Performance and monitoring types
export interface PerformanceMetrics {
  requestCount: NonNegativeInteger;
  averageResponseTime: DurationMs;
  errorRate: Percentage;
  memoryUsage: {
    used: number;
    total: number;
    percentage: Percentage;
  };
  cpuUsage: Percentage;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: DurationMs;
  timestamp: ISODateString;
  services: Record<string, ServiceHealth>;
}

export interface ServiceHealth {
  status: 'up' | 'down' | 'degraded';
  responseTime?: DurationMs;
  lastCheck: ISODateString;
  error?: string;
}

// Security types
export interface SecurityContext {
  userId?: UserId;
  sessionId?: SessionId;
  permissions: string[];
  ipAddress?: string;
  userAgent?: string;
  rateLimitInfo?: {
    remaining: NonNegativeInteger;
    reset: UnixTimestamp;
  };
}

export interface AuditLog {
  id: Brand<number, 'AuditLogId'>;
  userId?: UserId;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: ISODateString;
}

// Cache types
export interface CacheEntry<T> {
  key: string;
  value: T;
  expiresAt: UnixTimestamp;
  createdAt: UnixTimestamp;
  accessCount: NonNegativeInteger;
  lastAccessed: UnixTimestamp;
}

export interface CacheStats {
  hitRate: Percentage;
  missRate: Percentage;
  totalHits: NonNegativeInteger;
  totalMisses: NonNegativeInteger;
  size: NonNegativeInteger;
  maxSize: PositiveInteger;
  evictionCount: NonNegativeInteger;
}

// Type predicates and guards
export function isNonEmptyArray<T>(arr: T[]): arr is NonEmptyArray<T> {
  return arr.length > 0;
}

export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isPositiveNumber(value: unknown): value is PositiveInteger {
  return isNumber(value) && value > 0;
}

export function isNonNegativeNumber(value: unknown): value is NonNegativeInteger {
  return isNumber(value) && value >= 0;
}

export function isPercentage(value: unknown): value is Percentage {
  return isNumber(value) && value >= 0 && value <= 100;
}

export function isValidEmail(value: unknown): value is EmailAddress {
  return isString(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidUrl(value: unknown): value is HttpUrl {
  if (!isString(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function isISODateString(value: unknown): value is ISODateString {
  return isString(value) && !isNaN(Date.parse(value));
}

// Branded type creators
export function createUserId(value: string): UserId {
  if (!value || value.trim().length === 0) {
    throw new Error('UserId cannot be empty');
  }
  return value as UserId;
}

export function createSessionId(value: string): SessionId {
  if (!value || value.trim().length === 0) {
    throw new Error('SessionId cannot be empty');
  }
  return value as SessionId;
}

export function createResumeId(value: number): ResumeId {
  if (!isPositiveNumber(value)) {
    throw new Error('ResumeId must be a positive number');
  }
  return value as unknown as ResumeId;
}

export function createJobId(value: number): JobId {
  if (!isPositiveNumber(value)) {
    throw new Error('JobId must be a positive number');
  }
  return value as unknown as JobId;
}

export function createEmailAddress(value: string): EmailAddress {
  if (!isValidEmail(value)) {
    throw new Error('Invalid email address format');
  }
  return value as EmailAddress;
}

export function createHttpUrl(value: string): HttpUrl {
  if (!isValidUrl(value)) {
    throw new Error('Invalid URL format');
  }
  return value as HttpUrl;
}

export function createPercentage(value: number): Percentage {
  if (!isPercentage(value)) {
    throw new Error('Percentage must be between 0 and 100');
  }
  return value as Percentage;
}

export function createScore(value: number): Score {
  if (!isPercentage(value)) {
    throw new Error('Score must be between 0 and 100');
  }
  return value as unknown as Score;
}

export function createFileSize(value: number): FileSize {
  if (!isNonNegativeNumber(value)) {
    throw new Error('File size must be non-negative');
  }
  return value as unknown as FileSize;
}

// Utility functions for working with branded types
export function extractBrandedValue<T extends Brand<any, any>>(branded: T): T extends Brand<infer U, any> ? U : never {
  return branded as any;
}

// Type-safe JSON parsing
export function safeJsonParse<T>(
  json: string,
  validator: (obj: unknown) => obj is T
): Result<T, SyntaxError | TypeError> {
  try {
    const parsed = JSON.parse(json);
    if (validator(parsed)) {
      return { success: true, data: parsed };
    }
    return { success: false, error: new TypeError('Invalid JSON structure') };
  } catch (error) {
    return { success: false, error: error as SyntaxError };
  }
}

// Type-safe property access
export function safeGet<T, K extends keyof T>(obj: T, key: K): T[K] | undefined {
  return obj?.[key];
}

export function safeGetNested<T>(
  obj: T,
  path: string[],
  defaultValue?: any
): any {
  let current = obj as any;
  for (const key of path) {
    if (current?.[key] === undefined) {
      return defaultValue;
    }
    current = current[key];
  }
  return current;
}

// Array utilities with type safety
export function chunk<T>(array: T[], size: PositiveInteger): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function unique<T>(array: T[], keyFn?: (item: T) => string | number): T[] {
  if (!keyFn) {
    return Array.from(new Set(array));
  }
  
  const seen = new Set<string | number>();
  return array.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function groupBy<T, K extends string | number>(
  array: T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  return array.reduce((groups, item) => {
    const key = keyFn(item);
    (groups[key] = groups[key] || []).push(item);
    return groups;
  }, {} as Record<K, T[]>);
}

// Promise utilities
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: DurationMs
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
    )
  ]);
}

export function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: PositiveInteger,
  baseDelayMs: DurationMs = 1000 as DurationMs
): Promise<T> {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    function executeAttempt() {
      attempt++;
      
      fn()
        .then(resolve)
        .catch(error => {
          if (attempt >= maxAttempts) {
            reject(error);
            return;
          }
          
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          setTimeout(executeAttempt, delay);
        });
    }

    executeAttempt();
  });
}