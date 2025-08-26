# EvalMatch API Documentation

## 📚 Overview

EvalMatch provides a comprehensive REST API for AI-powered recruitment and candidate analysis. The API enables enterprise customers to integrate intelligent resume screening, bias detection, and candidate matching into their existing recruitment workflows.

## 🚀 Getting Started

### Base URLs
- **Production**: `https://evalmatch.app/api`
- **Scholavar**: `https://recruitment-corner.scholavar.com/api`
- **Development**: `http://localhost:3000/api`

### Authentication
All protected endpoints require Firebase JWT authentication:

```bash
# Include JWT token in Authorization header
curl -H "Authorization: Bearer <jwt-token>" \
  https://evalmatch.app/api/resumes
```

### Interactive Documentation
Visit the interactive Swagger UI for testing and exploring the API:

- **Production**: [https://evalmatch.app/api-docs](https://evalmatch.app/api-docs)
- **Development**: [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
- **Raw OpenAPI Spec**: [https://evalmatch.app/api-docs.json](https://evalmatch.app/api-docs.json)

## 🔑 API Features

### Core Capabilities
- **Multi-format Resume Processing**: PDF, DOCX, TXT with OCR fallback
- **AI-Powered Matching**: 85% accuracy candidate-job matching
- **Bias Detection**: Identifies and suggests fixes for biased language
- **Interview Questions**: AI-generated technical and behavioral questions
- **Enterprise Security**: Comprehensive input validation and threat protection
- **Rate Limiting**: Intelligent limits per endpoint type

### API Endpoints Summary

#### 📄 Resumes
- `POST /resumes` - Upload resume files
- `GET /resumes` - List user resumes with filtering
- `GET /resumes/:id` - Get specific resume details

#### 💼 Job Descriptions  
- `POST /job-descriptions` - Create job with AI analysis
- `GET /job-descriptions` - List user job descriptions
- `GET /job-descriptions/:id` - Get specific job details

#### 🧠 Analysis
- `POST /analysis/analyze/:jobId` - Analyze resumes against job
- `GET /analysis/analyze/:jobId` - Get analysis results
- `POST /analysis/analyze-bias/:jobId` - Detect bias in job description

#### ❓ Interview Questions
- `POST /analysis/interview-questions/:resumeId/:jobId` - Generate questions

## 📊 Response Format

All API responses follow a consistent format:

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data varies by endpoint
  },
  "timestamp": "2025-01-14T10:30:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Detailed error message",
    "details": {
      // Optional additional error context
    }
  },
  "timestamp": "2025-01-14T10:30:00.000Z"
}
```

## 🔒 Security & Rate Limits

### Rate Limits
- **Resume uploads**: 50 requests per 15 minutes
- **Analysis endpoints**: 20 requests per 15 minutes  
- **General endpoints**: 100 requests per 15 minutes

### Security Headers
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642176000
```

### Input Validation
- Comprehensive XSS and SQL injection protection
- File format validation with magic number verification
- Malicious content detection and filtering
- Size limits: 10MB max per file

## 💡 Integration Examples

### JavaScript/Node.js
```javascript
const response = await fetch('https://evalmatch.app/api/resumes', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${firebaseToken}`,
    'Content-Type': 'multipart/form-data'
  },
  body: formData
});

const result = await response.json();
if (result.success) {
  console.log('Resume uploaded:', result.data.resume);
} else {
  console.error('Upload failed:', result.error.message);
}
```

### Python
```python
import requests

headers = {
    'Authorization': f'Bearer {firebase_token}'
}

response = requests.get(
    'https://evalmatch.app/api/resumes',
    headers=headers
)

if response.json()['success']:
    resumes = response.json()['data']['resumes']
    print(f'Found {len(resumes)} resumes')
```

### cURL
```bash
# Upload resume
curl -X POST https://evalmatch.app/api/resumes \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@resume.pdf" \
  -F "autoAnalyze=true"

# Get analysis results
curl -X GET https://evalmatch.app/api/analysis/analyze/456 \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## 🔄 Workflow Examples

### Complete Recruitment Workflow
1. **Upload Resumes**: `POST /resumes`
2. **Create Job Description**: `POST /job-descriptions`
3. **Analyze Matches**: `POST /analysis/analyze/:jobId`
4. **Check for Bias**: `POST /analysis/analyze-bias/:jobId`
5. **Generate Questions**: `POST /analysis/interview-questions/:resumeId/:jobId`

### Batch Processing
```javascript
// Upload multiple resumes with batch tracking
const batchId = 'batch_' + Date.now();

for (const file of resumeFiles) {
  await uploadResume(file, { batchId });
}

// Analyze entire batch
await analyzeResumesBatch(jobId, { batchId });
```

## 📈 Performance & Scalability

### Response Times
- **File uploads**: < 5 seconds for 10MB files
- **AI analysis**: < 30 seconds per resume
- **Bias detection**: < 15 seconds per job description
- **Batch analysis**: Parallel processing for efficiency

### Caching
- Redis caching reduces API calls by 50%
- Smart cache invalidation
- Configurable TTL per operation type

## 🚨 Error Handling

### Common Error Codes
- `AUTH_TOKEN_MISSING`: Authentication required
- `VALIDATION_ERROR`: Invalid input data
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `FILE_TOO_LARGE`: Exceeds 10MB limit
- `UNSUPPORTED_FORMAT`: Invalid file type
- `INSUFFICIENT_PERMISSIONS`: Access denied

### Best Practices
- Always check `success` field in responses
- Implement exponential backoff for rate limits
- Handle network timeouts gracefully
- Log error codes for debugging

## 🛠️ Development Tools

### OpenAPI Specification
The complete OpenAPI 3.0 specification is available at `/api-docs.json` for code generation:

```bash
# Generate client SDK
npx swagger-codegen-cli generate \
  -i https://evalmatch.app/api-docs.json \
  -l typescript-axios \
  -o ./evalmatch-client
```

### Testing
Use the interactive Swagger UI to test endpoints without writing code:
1. Visit `/api-docs`
2. Click "Authorize" and enter your JWT token
3. Try endpoints directly in the browser

### Webhooks (Coming Soon)
- Real-time notifications for analysis completion
- Batch processing status updates
- System health alerts

## 📞 Support

### Documentation Issues
- **GitHub Issues**: [EvalMatch Issues](https://github.com/puneetrinity/Evalmatch/issues)
- **Email**: api-support@evalmatch.app

### Rate Limit Increases
Contact our enterprise team for higher limits:
- **Email**: enterprise@evalmatch.app
- **Mention**: Expected usage patterns and use case

### Status Page
Monitor API availability: [status.evalmatch.app](https://status.evalmatch.app) _(Coming Soon)_

---

**Last Updated**: January 2025  
**API Version**: 2.1.0  
**OpenAPI Spec**: 3.0.0