# EvalMatchAI – Semantic Matching Suite

EvalMatchAI is an advanced semantic matching platform for analyzing resumes and job descriptions, providing intelligent candidate evaluation, bias detection, and interview question generation.

## Features

- **Resume Analysis**: Extract skills, experience, and education from resumes in various formats
- **Job Description Analysis**: Analyze job requirements and detect potential bias
- **Bias Detection**: Identify and suggest improvements for potentially biased language
- **Candidate Matching**: Compare resumes to job descriptions with detailed skill gap analysis
- **Interview Question Generation**: Create customized interview questions based on candidate profiles
- **Fairness Analysis**: Evaluate AI-generated assessments for potential bias with confidence scoring

## Documentation

- [User Guide](docs/user-guide.md): Comprehensive guide for end users
- [Developer Guide](docs/developer-guide.md): Documentation for developers working on the platform
- [API Documentation](#api-documentation): Reference for available API endpoints

## Technology Stack

- **Frontend**: React, TypeScript, Tailwind CSS, shadcn/ui components
- **Backend**: Express.js, TypeScript, PostgreSQL
- **AI Integration**: OpenAI API (primary), Anthropic Claude API (secondary)
- **Document Processing**: Mammoth for DOCX, PDF parsing

## Production Readiness

### Performance Optimizations

The platform includes several optimizations for handling large datasets:

1. **Caching System**: Implemented in `server/lib/cache.ts`
   - Caches analysis results to avoid redundant API calls
   - Configurable TTL (time-to-live) for cached items
   - Prefix-based cache invalidation

2. **Batch Processing**: Implemented in `server/lib/batch-processor.ts`
   - Processes multiple resumes with controlled concurrency
   - Prevents API rate limiting and memory issues
   - Optimized for large resume sets

3. **Large Document Handling**: 
   - Chunks large documents for processing
   - Combines results from multiple chunks
   - Handles resumes and job descriptions of any size

### User Onboarding

The platform includes comprehensive onboarding features:

1. **Welcome Tutorial**: First-time users receive a guided tour of the platform
2. **Contextual Tooltips**: Feature-specific guidance at relevant points in the UI
3. **Help Center**: Comprehensive documentation and FAQs accessible from any page
4. **User Guide**: Detailed documentation available in Markdown format

### Testing

The platform includes automated tests:

1. **API Testing**: Using Jest and Supertest
   - Test core API endpoints
   - Mock database interactions
   - Verify API response formats

2. **Test Execution**:
   ```bash
   ./test.sh         # Run all tests
   ./test.sh --watch # Run in watch mode
   ```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- OpenAI API key
- (Optional) Anthropic API key

### Environment Setup

1. Create a `.env` file with the following variables:
   ```
   DATABASE_URL=postgresql://user:password@localhost:5432/evalmatch
   PR_OPEN_API_KEY=your_openai_api_key
   PR_ANTHROPIC_API_KEY=your_anthropic_api_key
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run database migrations:
   ```bash
   npm run db:push
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## API Documentation

### Resume Endpoints

- `POST /api/resumes`: Upload a resume
- `GET /api/resumes`: Get all resumes
- `GET /api/resumes/:id`: Get a specific resume

### Job Description Endpoints

- `POST /api/job-descriptions`: Create a job description
- `GET /api/job-descriptions`: Get all job descriptions
- `GET /api/job-descriptions/:id`: Get a specific job description

### Analysis Endpoints

- `GET /api/analyze/:jobDescriptionId`: Analyze resumes against a job description
- `GET /api/analyze/:jobDescriptionId/:resumeId`: Analyze a specific resume against a job description
- `POST /api/bias-analysis/:jobDescriptionId`: Analyze a job description for bias
- `POST /api/interview-questions/:resumeId/:jobDescriptionId`: Generate interview questions

## License

MIT# Force redeploy
