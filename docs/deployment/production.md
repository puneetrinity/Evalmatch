# Evalmatch Deployment Guide

## Quick Start

### Development
```bash
# 1. Copy environment template
cp .env.example .env

# 2. Fill in your API keys in .env
# 3. Start development server
docker-compose --profile dev up

# OR without Docker:
npm install
npm run dev
```

### Production
```bash
# 1. Set environment variables
# 2. Start production services
docker-compose --profile prod up -d
```

## Environment Configuration

### Required Variables
- `GROQ_API_KEY` - Primary AI provider (required)
- `FIREBASE_PROJECT_ID` - Firebase project ID
- `FIREBASE_SERVICE_ACCOUNT_KEY` - Firebase admin credentials
- `VITE_FIREBASE_*` - Firebase client configuration

### Optional Variables
- `DATABASE_URL` - PostgreSQL connection (falls back to in-memory)
- `OPENAI_API_KEY` - Secondary AI provider
- `ANTHROPIC_API_KEY` - Secondary AI provider
- `SESSION_SECRET` - Session encryption key

## Deployment Platforms

### Railway
1. Connect your GitHub repository
2. Set environment variables from `railway.env.example`
3. Railway auto-deploys on git push

### Render
1. Connect repository
2. Set build command: `npm run build`
3. Set start command: `node dist/index.js`
4. Add environment variables

### Docker (Self-hosted)
```bash
# Production with nginx proxy
docker-compose --profile prod up -d

# Development with hot reload
docker-compose --profile dev up

# Run tests
docker-compose --profile test run test
```

## Database

### Neon (Recommended)
- Serverless PostgreSQL
- Copy connection string to `DATABASE_URL`
- Auto-scaling and branching

### Railway PostgreSQL
- Add PostgreSQL service in Railway
- `DATABASE_URL` auto-configured

### Local PostgreSQL
```bash
# Start with Docker
docker-compose up postgres

# Connection string:
DATABASE_URL=postgresql://evalmatch:localpassword@localhost:5432/evalmatch
```

## Configuration Summary

### Fixed Issues
✅ **Unified environment variables** - Consistent naming across all platforms
✅ **Single Docker configuration** - Profiles for dev/prod/test
✅ **Standardized deployment** - Works across Railway, Render, Docker
✅ **Clear documentation** - Step-by-step guides

### File Structure
- `.env.example` - Complete environment template
- `railway.env.example` - Railway-specific template  
- `docker-compose.unified.yml` - Single Docker configuration
- `DEPLOYMENT.md` - This deployment guide

### Performance Features
- In-memory fallback when database unavailable
- Hybrid storage with automatic recovery
- AI provider failover (Groq → OpenAI → Anthropic)
- Optimized embedding models and caching