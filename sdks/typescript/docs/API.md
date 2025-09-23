# 📚 EvalMatch SDK API Documentation

> **Complete API reference for the EvalMatch TypeScript SDK**

## 🚀 Getting Started

### Installation & Setup

```bash
npm install @airevolabs/evalmatch-sdk
```

```typescript
import { EvalMatchClient } from '@airevolabs/evalmatch-sdk'

// Initialize client
const client = new EvalMatchClient({
  baseUrl: 'https://api.evalmatch.com',
  authProvider: yourAuthProvider,
  timeout: 10000 // optional
})
```

## 🔐 Authentication

### Firebase Authentication
```typescript
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = { /* your config */ }
const app = initializeApp(firebaseConfig)
const auth = getAuth(app)

const authProvider = {
  getToken: async () => {
    const user = auth.currentUser
    return user ? await user.getIdToken() : null
  },
  isAuthenticated: async () => !!auth.currentUser
}
```

### API Token Authentication
```typescript
const authProvider = {
  getToken: async () => 'your-api-token',
  isAuthenticated: async () => true
}
```

## 📋 Core Methods

### Client Configuration

#### `new EvalMatchClient(options)`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `baseUrl` | `string` | ✅ | API base URL |
| `authProvider` | `AuthProvider` | ✅ | Authentication provider |
| `timeout` | `number` | ❌ | Request timeout (ms) |
| `maxRetries` | `number` | ❌ | Max retry attempts |
| `unwrapEnvelope` | `boolean` | ❌ | Auto-unwrap response envelopes |

```typescript
interface ClientOptions {
  baseUrl: string
  authProvider: AuthProvider
  timeout?: number
  maxRetries?: number
  unwrapEnvelope?: boolean
}
```

## 👥 Jobs API

### List Job Descriptions
```typescript
const jobs = await client.jobs.list(options?)
```

**Options:**
```typescript
interface JobListOptions extends RequestOptions {
  page?: number
  limit?: number
  search?: string
}
```

**Response:**
```typescript
interface JobDescription {
  id: number
  title: string
  description: string
  requirements: string[]
  skills: string[]
  createdAt: string
  updatedAt: string
}
```

### Get Job Description
```typescript
const job = await client.jobs.get(id, options?)
```

### Create Job Description
```typescript
const job = await client.jobs.create(data, options?)
```

**Input:**
```typescript
interface JobDescriptionInput {
  title: string
  description: string
  requirements?: string[]
  skills?: string[]
}
```

### Update Job Description
```typescript
const job = await client.jobs.update(id, data, options?)
```

### Delete Job Description
```typescript
const result = await client.jobs.delete(id, options?)
```

## 📄 Resumes API

### List Resumes
```typescript
const resumes = await client.resumes.list(options?)
```

### Get Resume
```typescript
const resume = await client.resumes.get(id, options?)
```

### Upload Resume
```typescript
const result = await client.resumes.upload(file, options?)
```

### Batch Upload Resumes
```typescript
const result = await client.resumes.uploadBatch(files, options?)
```

**Response:**
```typescript
interface BatchUploadResponse {
  batchId: string
  message: string
  results: {
    successful: UploadedResume[]
    failed: FailedUpload[]
  }
  summary: {
    totalFiles: number
    successfulUploads: number
    failedUploads: number
  }
}
```

## 🔍 Analysis API

### Analyze Resume Against Job
```typescript
const analysis = await client.analysis.analyze(resumeId, jobId, options?)
```

### Analyze Job Bias
```typescript
const bias = await client.analysis.bias(jobId, options?)
```

### Analyze Text
```typescript
const analysis = await client.analysis.analyzeText(data, options?)
```

**Input:**
```typescript
interface AnalyzeTextRequest {
  resumeText: string
  jobDescriptionText: string
}
```

**Response:**
```typescript
interface AnalyzeTextResponse {
  matchPercentage: number
  matchedSkills: string[]
  missingSkills: string[]
  candidateStrengths: string[]
  candidateWeaknesses: string[]
  confidenceLevel: string
  recommendations: string[]
}
```

## 💳 Credits API

### Get Balance
```typescript
const balance = await client.credits.balance(options?)
```

### Get History
```typescript
const history = await client.credits.history(options?)
```

### Get Packages
```typescript
const packages = await client.credits.packages(options?)
```

### Grant Beta Credits
```typescript
const result = await client.credits.grantBeta(data?, options?)
```

## 👤 User API

### Get Profile
```typescript
const profile = await client.user.getProfile(options?)
```

## 🔑 Tokens API

### Get Token Status
```typescript
const status = await client.tokens.statusByToken(options?)
```

**Response:**
```typescript
interface TokenStatusResponse {
  token: {
    id: string
    name: string
    partial: string
    status: 'active' | 'expired' | 'revoked'
    permissions: string[]
    createdAt: string
    expiresAt: string
    lastUsedAt: string
  }
  usage: {
    requestsToday: number
    requestsThisMonth: number
    totalRequests: number
  }
}
```

## 🏥 Health API

### Get Status
```typescript
const health = await client.health.status(options?)
```

### Get System Health
```typescript
const system = await client.health.system(options?)
```

## ⚙️ Request Options

All API methods accept an optional `RequestOptions` parameter:

```typescript
interface RequestOptions {
  signal?: AbortSignal        // Request cancellation
  timeout?: number           // Override default timeout
  throwOnError?: boolean     // Control error handling
  retries?: number          // Override retry count
}
```

### Error Handling Options

```typescript
// Throw errors (default)
const data = await client.jobs.list()

// Return error envelope
const result = await client.jobs.list({ throwOnError: false })
if (result.success) {
  console.log(result.data)
} else {
  console.error(result.error)
}
```

## 🚨 Error Types

### EvalMatchError
Base error class with rich context:

```typescript
interface EvalMatchError extends Error {
  code: ErrorCode
  context: {
    statusCode?: number
    endpoint?: string
    method?: string
    requestId?: string
    timestamp: string
  }
  recoveryActions?: string[]
}
```

### Error Codes
```typescript
enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  SERVER_ERROR = 'SERVER_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN'
}
```

## 🔄 Advanced Features

### Circuit Breaker
Automatic failure detection and recovery:

```typescript
// Circuit breaker opens after 5 failures
// Attempts recovery after 60 seconds
// Provides graceful degradation
```

### Retry Logic
Exponential backoff with jitter:

```typescript
// Base delay: 100ms
// Max delay: 30s
// Backoff factor: 2
// Automatic retry on 5xx errors
```

### Request Deduplication
Prevents duplicate API calls:

```typescript
// Multiple identical requests = single API call
// Shared response across all requesters
// Automatic promise coalescence
```

## 📊 TypeScript Support

### Full Type Safety
```typescript
// All responses are fully typed
const jobs: JobDescription[] = await client.jobs.list()

// Input validation with TypeScript
const job = await client.jobs.create({
  title: "Senior Developer",     // ✅ Required
  description: "Great role...",  // ✅ Required
  requirements: ["React", "TS"]  // ✅ Optional array
})
```

### Branded Types
```typescript
type ResumeId = number & { __brand: 'ResumeId' }
type JobId = number & { __brand: 'JobId' }
```

## 🔧 Configuration Examples

### Production Setup
```typescript
const client = new EvalMatchClient({
  baseUrl: 'https://api.evalmatch.com',
  authProvider: firebaseAuthProvider,
  timeout: 30000,
  maxRetries: 3,
  unwrapEnvelope: true
})
```

### Development Setup
```typescript
const client = new EvalMatchClient({
  baseUrl: 'https://api.staging.evalmatch.com',
  authProvider: devAuthProvider,
  timeout: 10000,
  maxRetries: 1,
  unwrapEnvelope: false // Keep full response structure
})
```

### React Hook Example
```typescript
function useEvalMatch() {
  const [client] = useState(() => new EvalMatchClient({
    baseUrl: process.env.REACT_APP_API_URL,
    authProvider: firebaseAuthProvider
  }))
  
  return client
}
```

## 🧪 Testing

### Mock Auth Provider
```typescript
const mockAuth = {
  getToken: async () => 'mock-token',
  isAuthenticated: async () => true
}

const testClient = new EvalMatchClient({
  baseUrl: 'https://api.test.evalmatch.com',
  authProvider: mockAuth
})
```

## 📈 Performance Tips

### Optimize Bundle Size
```typescript
// Tree-shake unused methods
import { EvalMatchClient } from '@airevolabs/evalmatch-sdk'

// Only import specific error types if needed
import { EvalMatchError, ErrorCode } from '@airevolabs/evalmatch-sdk/errors'
```

### Request Optimization
```typescript
// Use AbortController for cancellation
const controller = new AbortController()
const jobs = await client.jobs.list({ 
  signal: controller.signal 
})

// Batch operations when possible
const files = [file1, file2, file3]
const result = await client.resumes.uploadBatch(files)
```

## 🆘 Support

- **📧 Email:** hello@airevolabs.co.in
- **📖 Documentation:** Complete guides and examples
- **🐛 Issues:** Report bugs and feature requests
- **💬 Community:** Developer discussions and Q&A

---

*Last Updated: January 2025*

*For the latest updates and examples, visit our [GitHub repository](https://github.com/puneetrinity/Evalmatch).*