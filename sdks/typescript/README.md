# EvalMatch TypeScript SDK

Official TypeScript SDK for the EvalMatch API - AI-powered recruitment platform for intelligent resume analysis and bias-free hiring.

## Features

- 🔥 **Full TypeScript support** with auto-generated types
- 🔐 **Firebase Authentication** integration
- 📱 **Cross-platform** - works in Node.js, browsers, and React Native
- 🛡️ **Built-in error handling** with typed error classes
- ⚡ **Automatic retries** and request optimization
- 📦 **Tree-shakeable** - import only what you need

## Installation

```bash
npm install @evalmatch/sdk
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

### Custom Authentication

```typescript
import { EvalMatchClient } from '@evalmatch/sdk';

// Implement custom auth provider
class CustomAuthProvider {
  async getToken() {
    return localStorage.getItem('jwt-token');
  }
  
  async isAuthenticated() {
    return !!localStorage.getItem('jwt-token');
  }
}

const client = new EvalMatchClient({
  authProvider: new CustomAuthProvider()
});
```

## API Reference

### Client Methods

#### Resumes

```typescript
// List user's resumes
const resumes = await client.resumes.list();

// Upload a resume file
const resume = await client.resumes.upload(file);

// Get specific resume
const resume = await client.resumes.get(resumeId);
```

#### Job Descriptions

```typescript
// Create job description
const job = await client.jobs.create({
  title: 'Software Engineer',
  description: 'Join our team...',
  requirements: ['JavaScript', 'React']
});
```

#### AI Analysis

```typescript
// Analyze resumes against job
const analysis = await client.analysis.analyze(jobId, [resumeId1, resumeId2]);

// Check job description for bias
const biasAnalysis = await client.analysis.analyzeBias(jobId);
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

Commercial License - see [LICENSE](https://evalmatch.app/license) for details.

## Support

- 📧 Email: api-support@evalmatch.app
- 📖 Documentation: https://evalmatch.app/docs/api
- 🐛 Issues: https://github.com/puneetrinity/Evalmatch/issues