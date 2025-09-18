# Node.js Upload Support Implementation Plan

## Current Status
The SDK currently supports browser FormData uploads with proper boundary handling. Node.js upload support needs to be added for server-side environments.

## Implementation Requirements

### 1. Environment Detection
```typescript
// Detect if running in Node.js vs Browser
const isNode = typeof window === 'undefined' && typeof process !== 'undefined' && process.versions?.node;
```

### 2. Node.js FormData Polyfill
```typescript
// Use form-data package for Node.js
import FormData from 'form-data'; // Node.js polyfill

// Or dynamic import for environment-specific loading
const FormDataConstructor = isNode 
  ? (await import('form-data')).default 
  : globalThis.FormData;
```

### 3. Upload Method Overloads
```typescript
// Browser: File or Blob
upload(file: File, options?: UploadOptions): Promise<Resume>

// Node.js: Buffer or Readable
upload(file: Buffer | Readable, options: UploadOptions & { filename: string, contentType?: string }): Promise<Resume>
```

### 4. Content-Type Handling
```typescript
// Node.js form-data automatically sets proper headers
const formData = new FormData();
formData.append('file', buffer, {
  filename: options.filename,
  contentType: options.contentType || 'application/octet-stream'
});

// Let axios use formData.getHeaders() - DO NOT manually set Content-Type
const headers = formData.getHeaders(); // Gets multipart boundary
```

### 5. Implementation Strategy
1. **Add form-data dependency**: `npm install form-data @types/form-data`
2. **Create upload factory function**: Environment-aware FormData creation
3. **Extend UploadOptions interface**: Required filename for Node.js
4. **Update client.ts upload method**: Support both File and Buffer/Readable
5. **Add Node.js specific tests**: Buffer upload validation

### 6. Key Principles
- **Never manually set Content-Type**: Let form-data/axios handle boundaries
- **Environment detection**: Gracefully fallback between Node.js and browser
- **Type safety**: Proper overloads for different environments
- **Consistent API**: Same method name, environment-appropriate parameters

## Testing Strategy
```typescript
// Test with actual Buffer
const buffer = Buffer.from('test file content');
await client.resumes.upload(buffer, {
  filename: 'test.pdf',
  contentType: 'application/pdf'
});

// Test with Readable stream
const stream = fs.createReadStream('./test.pdf');
await client.resumes.upload(stream, {
  filename: 'test.pdf',
  contentType: 'application/pdf'
});
```

## Acceptance Criteria
- ✅ Browser FormData uploads work (existing)
- ⏳ Node.js Buffer uploads work 
- ⏳ Node.js Readable stream uploads work
- ⏳ No manual Content-Type setting in any environment
- ⏳ Proper multipart boundary generation
- ⏳ Type safety for environment-specific parameters
- ⏳ Comprehensive test coverage

## Future Enhancement
Consider adding progress tracking for large file uploads using axios onUploadProgress callback.