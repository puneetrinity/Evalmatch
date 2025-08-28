# Railway Testing Guide for EvalMatchAI

This guide provides comprehensive instructions for testing the EvalMatchAI application on Railway.

## Overview

The testing setup includes:
- **Environment Configuration**: Railway-specific environment variables
- **Automated Setup**: Scripts to validate deployment readiness
- **Comprehensive Tests**: Health checks, API functionality, performance validation
- **CI/CD Integration**: GitHub Actions workflow for automated testing

## Quick Start

### 1. Local Railway Testing

```bash
# Setup Railway test environment
npm run test:railway:setup

# Run Railway deployment tests
npm run test:railway

# Run complete Railway test suite
npm run test:railway:full
```

### 2. Manual Railway Deployment Testing

1. **Deploy to Railway**:
   ```bash
   railway up
   ```

2. **Set test URL**:
   ```bash
   export RAILWAY_TEST_URL=https://your-app.railway.app
   ```

3. **Run tests against live deployment**:
   ```bash
   npm run test:railway
   ```

## Test Files and Scripts

### Core Test Files

1. **`.env.railway.test`**
   - Railway-specific environment variables
   - Safe placeholder values for testing
   - Memory and performance optimizations

2. **`scripts/railway-test-setup.js`**
   - Validates environment configuration
   - Tests database connectivity
   - Checks AI provider connections
   - Verifies application startup

3. **`tests/railway-deployment.test.js`**
   - Health and status checks
   - Core API functionality tests
   - Performance and scalability validation
   - Error handling verification
   - Memory usage monitoring

### GitHub Actions Workflow

**`.github/workflows/railway-deploy.yml`**
- Automated testing on push/PR
- Railway deployment
- Post-deployment validation
- Status notifications

## Test Categories

### 1. Health and Status Tests
- Basic health check response time
- Detailed system health validation
- Database migration status
- AI provider connectivity

### 2. Core API Functionality
- Job description CRUD operations
- Resume upload and processing
- Bias analysis functionality
- Interview question generation

### 3. Performance and Scalability
- Concurrent request handling
- Large payload processing
- Memory usage stability
- Response time validation

### 4. Error Handling
- Invalid endpoint handling
- Request validation
- Graceful error responses
- Rate limiting behavior

## Environment Variables for Railway

### Required Variables
```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Firebase Authentication
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account"...}
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id

# AI Providers (at least one required)
GROQ_API_KEY=gsk_your_groq_key
OPENAI_API_KEY=sk-your_openai_key
ANTHROPIC_API_KEY=sk-ant-your_anthropic_key

# Security
SESSION_SECRET=your-session-secret-min-32-chars
```

### Optional Variables
```env
# Performance Optimization
ENABLE_LOCAL_EMBEDDINGS=true
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
MAX_CONCURRENT_EMBEDDINGS=3
NODE_OPTIONS=--max-old-space-size=4096

# Feature Flags
AUTH_BYPASS_MODE=false
SERVE_STATIC=true
LOG_LEVEL=info
```

## Test Commands Reference

| Command | Description |
|---------|-------------|
| `npm run test:railway:setup` | Validate Railway environment setup |
| `npm run test:railway` | Run Railway deployment tests |
| `npm run test:railway:full` | Complete Railway test suite |
| `npm run railway:test:predeploy` | Pre-deployment validation |

## Expected Test Results

### Successful Test Output
```bash
🚂 Railway Test Setup Starting...

📋 Testing Environment Configuration...
✅ Environment variables validated

🗄️ Testing Database Connection...
✅ Database connection successful

🤖 Testing AI Provider Connections...
✅ AI providers tested: { groq: 'connected', openai: 'connected' }

🚀 Testing Application Startup...
✅ Application started successfully

🔗 Testing API Endpoints...
✅ API endpoints tested

📊 Railway Test Setup Report
================================
✅ environment: true
✅ database: true
✅ aiProviders: {...}
✅ application: true
✅ apis: true

🎉 Railway test setup completed successfully!
```

### Test Performance Expectations
- Health check response: < 5 seconds
- API endpoint response: < 10 seconds
- Concurrent requests: 5+ simultaneous
- Memory usage: Stable under load
- Application startup: < 2 minutes

## Troubleshooting

### Common Issues

1. **Database Connection Failures**
   ```bash
   # Check Railway PostgreSQL service
   railway logs
   railway variables
   ```

2. **AI Provider Connection Issues**
   ```bash
   # Verify API keys in Railway dashboard
   # Check environment variable format
   ```

3. **Memory Issues**
   ```bash
   # Increase Railway service memory
   # Check NODE_OPTIONS configuration
   ```

4. **Timeout Issues**
   ```bash
   # Increase TEST_TIMEOUT in environment
   # Check Railway service startup time
   ```

### Debug Commands

```bash
# Check Railway service status
railway status

# View application logs
railway logs --tail

# Check environment variables
railway variables

# Connect to Railway shell
railway shell
```

## Integration with CI/CD

The GitHub Actions workflow automatically:
1. Runs local tests before deployment
2. Deploys to Railway on main branch
3. Validates deployment with comprehensive tests
4. Reports status and uploads artifacts

### Required GitHub Secrets
- `RAILWAY_TOKEN`: Railway API token
- `RAILWAY_TEST_URL`: Deployed application URL

## Best Practices

1. **Environment Management**
   - Use Railway environment groups
   - Separate staging and production
   - Validate all required variables

2. **Testing Strategy**
   - Run setup validation before tests
   - Test both success and failure scenarios
   - Monitor memory usage during tests

3. **Performance Monitoring**
   - Set reasonable timeout values
   - Monitor response times
   - Track memory usage trends

4. **Error Handling**
   - Graceful test failures
   - Comprehensive error logging
   - Automated cleanup procedures

## Support and Debugging

For issues with Railway testing:
1. Check the test report: `railway-test-report.json`
2. Review Railway logs: `railway logs`
3. Validate environment variables
4. Ensure all services are running

The testing setup is designed to be robust and provide clear feedback on any deployment issues.