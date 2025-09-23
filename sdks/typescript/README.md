# EvalMatch TypeScript SDK

Official TypeScript SDK for the EvalMatch API - AI-powered recruitment platform for intelligent resume analysis and bias-free hiring.

## Features

- 🔥 **Full TypeScript support** with auto-generated types
- 🔐 **Firebase Authentication** integration
- 📱 **Cross-platform** - works in Node.js, browsers, and React Native
- 🛡️ **Built-in error handling** with typed error classes
- ⚡ **Automatic retries** and request optimization
- 📦 **Tree-shakeable** - import only what you need

> **⚠️ Commercial License Required:** This SDK requires a commercial license for production use. Contact hello@airevolabs.co.in for licensing. See [LICENSE-GUIDE.md](./LICENSE-GUIDE.md) for details.

## Installation

```bash
npm install @airevolabs/evalmatch-sdk
```

## Quick Start

### With Firebase Authentication

```typescript
import { EvalMatchClient, FirebaseAuthProvider } from '@evalmatch/sdk';
import { getAuth } from 'firebase/auth';

// Initialize Firebase Auth Provider
const authProvider = new FirebaseAuthProvider(getAuth());

// Create EvalMatch client
const client = new EvalMatchClient({
  authProvider,
  baseUrl: 'https://evalmatch.app/api' // optional, defaults to production
});

// Upload and analyze a resume
async function analyzeResume() {
  try {
    // Upload resume
    const resumeFile = new File([...], 'resume.pdf', { type: 'application/pdf' });
    const resume = await client.resumes.upload(resumeFile);
    
    // Create job description
    const job = await client.jobs.create({
      title: 'Senior Full Stack Developer',
      description: 'We are looking for an experienced developer...',
      requirements: ['React', 'Node.js', 'TypeScript']
    });
    
    // Analyze resume against job
    const analysis = await client.analysis.analyze(job.data.id, [resume.data.id]);
    
    console.log('Match score:', analysis.data.overallScore);
    console.log('Matched skills:', analysis.data.skillsMatch.matched);
    
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error('Validation failed:', error.details);
    } else if (error instanceof RateLimitError) {
      console.error('Rate limited, retry after:', error.retryAfter);
    } else {
      console.error('Error:', error.message);
    }
  }
}
```

### API Token Authentication (Server-to-Server)

For backend services and automation, use EvalMatch API tokens:

```typescript
import { EvalMatchClient } from '@evalmatch/sdk';

// Simple auth provider using API token
class ApiTokenAuthProvider {
  constructor(private apiToken: string) {}
  
  async getToken() {
    return this.apiToken; // Returns API token (em_<id>_<secret>)
  }
  
  async isAuthenticated() {
    return !!this.apiToken;
  }
}

const client = new EvalMatchClient({
  authProvider: new ApiTokenAuthProvider(process.env.EVALMATCH_API_TOKEN!)
});

// Now you can use all SDK features without Firebase
await client.jobs.list();
await client.tokens.statusByToken(); // Check token usage
```

### Complete Dual-Auth Example

```typescript
import { EvalMatchClient, FirebaseAuthProvider } from '@evalmatch/sdk';
import { getAuth } from 'firebase/auth';

// End-to-end recruitment workflow example
async function completeRecruitmentWorkflow() {
  // 1. Setup client (use Firebase for web apps, API tokens for servers)
  const isServer = typeof window === 'undefined';
  const client = new EvalMatchClient({
    authProvider: isServer 
      ? new ApiTokenAuthProvider(process.env.EVALMATCH_API_TOKEN!)
      : new FirebaseAuthProvider(getAuth())
  });

  // 2. Upload multiple resumes in batch
  const resumeFiles = [resume1, resume2, resume3]; // File objects
  const batchResult = await client.resumes.uploadBatch(resumeFiles);
  console.log(`Uploaded ${batchResult.summary.successful} resumes`);

  // 3. Create and manage job descriptions
  const job = await client.jobs.create({
    title: 'Senior Frontend Developer',
    description: 'React expert with TypeScript experience...',
    requirements: ['React', 'TypeScript', '5+ years experience']
  });

  // 4. Analyze bias in job description
  const biasAnalysis = await client.analysis.analyzeBias(job.id);
  if (biasAnalysis.data.riskLevel === 'high') {
    console.warn('Job description may contain bias:', biasAnalysis.data.issues);
  }

  // 5. Run text-based analysis for quick screening
  const quickAnalysis = await client.analysis.analyzeText({
    resumeText: 'John Doe, Senior React Developer with 6 years...',
    jobDescriptionText: job.description
  });
  console.log(`Quick match: ${quickAnalysis.matchPercentage}%`);

  // 6. Full analysis with ranking
  const resumeIds = batchResult.uploaded.map(r => r.id);
  const fullAnalysis = await client.analysis.analyze(job.id, resumeIds);
  
  // Rank candidates by match percentage
  const rankedCandidates = fullAnalysis.data.results
    .sort((a, b) => b.matchPercentage - a.matchPercentage);
  
  console.log('Top candidates:', rankedCandidates.slice(0, 3));

  // 7. Manage job descriptions
  const allJobs = await client.jobs.list();
  const updatedJob = await client.jobs.update(job.id, {
    requirements: [...job.requirements, 'GraphQL'] // Add new requirement
  });
  
  // 8. Check API usage (for API token users)
  if (isServer) {
    const tokenStatus = await client.tokens.statusByToken();
    console.log(`API calls today: ${tokenStatus.usage.requestsToday}`);
  }
}
```

### Node.js Specific Examples

For Node.js applications, you can upload files using Buffers or Streams:

```typescript
import fs from 'fs';
import { EvalMatchClient } from '@evalmatch/sdk';

const client = new EvalMatchClient({
  authProvider: new ApiTokenAuthProvider(process.env.EVALMATCH_API_TOKEN!)
});

// Upload from Buffer
const pdfBuffer = fs.readFileSync('./resume.pdf');
const resume = await client.resumes.upload(pdfBuffer);

// Upload multiple files as streams
const streams = ['resume1.pdf', 'resume2.pdf'].map(file => 
  fs.createReadStream(file)
);
const batchResult = await client.resumes.uploadBatch(streams);
console.log(`Batch upload: ${batchResult.summary.successful} successful`);
```

## API Reference

### Client Methods

#### Resumes

```typescript
// List user's resumes
const resumes = await client.resumes.list();

// Upload a single resume file
const resume = await client.resumes.upload(file);

// Upload multiple resumes in batch
const batchResult = await client.resumes.uploadBatch([file1, file2, file3]);

// Get specific resume
const resume = await client.resumes.get(resumeId);
```

#### Job Descriptions (Full CRUD)

```typescript
// Create job description
const job = await client.jobs.create({
  title: 'Software Engineer',
  description: 'Join our team...',
  requirements: ['JavaScript', 'React']
});

// List all job descriptions
const jobs = await client.jobs.list();

// Get specific job description
const job = await client.jobs.get(jobId);

// Update job description
const updatedJob = await client.jobs.update(jobId, {
  title: 'Senior Software Engineer',
  requirements: ['JavaScript', 'React', 'TypeScript']
});

// Delete job description
const result = await client.jobs.delete(jobId);
```

#### AI Analysis

```typescript
// Analyze resumes against job
const analysis = await client.analysis.analyze(jobId, [resumeId1, resumeId2]);

// Check job description for bias
const biasAnalysis = await client.analysis.analyzeBias(jobId);

// Quick text-based analysis (no file upload required)
const textAnalysis = await client.analysis.analyzeText({
  resumeText: 'John Doe, Software Engineer...',
  jobDescriptionText: 'We are looking for a developer...'
});

console.log('Match percentage:', textAnalysis.matchPercentage);
console.log('Matched skills:', textAnalysis.matchedSkills);
console.log('Missing skills:', textAnalysis.missingSkills);
```

#### Token Management (API Token Users)

```typescript
// Get current token status and usage
const tokenStatus = await client.tokens.statusByToken();

console.log('Token status:', tokenStatus.token.status);
console.log('Requests today:', tokenStatus.usage.requestsToday);
console.log('Requests this month:', tokenStatus.usage.requestsThisMonth);
```

#### Credits and User Management

```typescript
// Check credit balance
const balance = await client.credits.balance();

// View credit history
const history = await client.credits.history();

// Get user profile
const profile = await client.user.profile();
```

### Error Handling

The SDK provides typed error classes for better error handling:

```typescript
import { 
  ValidationError, 
  AuthenticationError, 
  RateLimitError, 
  ServerError 
} from '@evalmatch/sdk';

try {
  await client.resumes.upload(file);
} catch (error) {
  if (error instanceof ValidationError) {
    // Handle validation errors (400)
    console.log('Validation details:', error.details);
  } else if (error instanceof AuthenticationError) {
    // Handle auth errors (401)
    console.log('Please log in');
  } else if (error instanceof RateLimitError) {
    // Handle rate limiting (429)
    console.log('Retry after:', error.retryAfter, 'seconds');
  }
}
```

### Configuration Options

```typescript
const client = new EvalMatchClient({
  authProvider: myAuthProvider,
  baseUrl: 'https://custom.api.url',  // Custom API URL
  timeout: 10000,                      // Request timeout (ms)
  headers: {                           // Custom headers
    'X-Custom-Header': 'value'
  },
  debug: true                          // Enable debug logging
});
```

## TypeScript Types

All API types are automatically generated and exported:

```typescript
import type { 
  Resume, 
  JobDescription, 
  AnalysisResult,
  BiasAnalysis 
} from '@evalmatch/sdk';

const resume: Resume = {
  id: 123,
  filename: 'resume.pdf',
  status: 'analyzed',
  // ... fully typed
};
```

## Browser Support

- Chrome 63+
- Firefox 67+
- Safari 13.1+
- Edge 79+

## Node.js Support

- Node.js 18+

## Contributing

This SDK is auto-generated from the EvalMatch OpenAPI specification. For issues or feature requests, please visit our [main repository](https://github.com/puneetrinity/Evalmatch).

## License

**Commercial License Required** - This SDK requires a commercial license for production use.

📄 **License Information:**
- **Type:** Commercial/Proprietary Software
- **Copyright:** © 2025 AiRevoLabs. All rights reserved.
- **Usage:** Commercial license required for production
- **Support:** Included for licensed users

📞 **Get Licensed:**
- **Contact:** hello@airevolabs.co.in
- **Details:** See [LICENSE-GUIDE.md](./LICENSE-GUIDE.md) for complete licensing information
- **Legal:** Full terms in [LICENSE](./LICENSE) file

⚠️ **Important:** Using this SDK in production without a valid commercial license constitutes copyright infringement.

## Support

- 📧 Email: hello@airevolabs.co.in
- 📖 SDK Documentation: [API Reference](./docs/API.md)
- 🌐 Platform Documentation: https://evalmatch.app/docs/api
- 🐛 Issues: https://github.com/puneetrinity/Evalmatch/issues