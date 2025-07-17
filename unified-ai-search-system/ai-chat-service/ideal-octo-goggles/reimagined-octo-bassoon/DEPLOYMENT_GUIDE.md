# AI Search System - Deployment Guide

This guide consolidates the various deployment approaches into clear, standardized instructions.

## Quick Start

### 1. Local Development
```bash
# Use the consolidated configuration
docker-compose -f docker-compose.consolidated.yml --profile development up -d

# Or use the deploy directory for full setup
cd deploy && make dev
```

### 2. Production Deployment
```bash
# Production with consolidated configuration
docker-compose -f docker-compose.consolidated.yml up -d

# Or build and run production image
docker build -f Dockerfile.production -t ai-search-system:latest .
docker run -d -p 8000:8000 ai-search-system:latest
```

## Available Docker Configurations

### Primary Configurations (Use These)

1. **`docker-compose.consolidated.yml`** - ✅ **RECOMMENDED**
   - Single file for all environments
   - Production and development profiles
   - Standardized networking and volumes
   - Health checks and proper dependencies

2. **`deploy/docker-compose.yml`** - ✅ **ALTERNATIVE**
   - Makefile-based development workflow
   - Pre-configured for quick setup
   - Good for team development

### Legacy Configurations (Avoid These)

3. **`docker/docker-compose.yml`** - ⚠️ **LEGACY**
   - Older configuration with different structure
   - Kept for compatibility only

4. **`docker-compose.runpod.yml`** - ⚠️ **SPECIALIZED**
   - RunPod-specific configuration
   - Use only for RunPod deployments

## Environment Setup

### Required Environment Variables

Create a `.env` file:
```bash
# Core settings
ENVIRONMENT=development  # or production
DEBUG=true               # false for production

# Service URLs
REDIS_URL=redis://localhost:6379
OLLAMA_HOST=http://localhost:11434

# API Keys (required for full functionality)
BRAVE_API_KEY=your_brave_search_api_key
SCRAPINGBEE_API_KEY=your_scrapingbee_api_key

# Model settings
DEFAULT_MODEL=phi3:mini
FALLBACK_MODEL=phi3:mini

# Performance
DEFAULT_MONTHLY_BUDGET=20.0
RATE_LIMIT_PER_MINUTE=60
TARGET_RESPONSE_TIME=2.5
```

### Model Initialization

The system requires `phi3:mini` model to be available:
```bash
# If using local Ollama
ollama pull phi3:mini

# If using Docker, models are auto-downloaded on first run
```

## Deployment Scenarios

### Scenario 1: Development with Hot Reload
```bash
# Use development profile
docker-compose -f docker-compose.consolidated.yml --profile development up -d

# Access services:
# API: http://localhost:8001
# Docs: http://localhost:8001/docs
# Redis: localhost:6379
```

### Scenario 2: Production Deployment
```bash
# Production mode
docker-compose -f docker-compose.consolidated.yml up -d

# Access services:
# API: http://localhost:8000
# Health: http://localhost:8000/health
# Metrics: http://localhost:8000/metrics
```

### Scenario 3: Testing Setup
```bash
# Start only dependencies for testing
docker-compose -f docker-compose.consolidated.yml up redis -d

# Run tests against local dependencies
pytest tests/
```

### Scenario 4: RunPod Deployment
```bash
# Use specialized RunPod configuration
docker-compose -f docker-compose.runpod.yml up -d

# Follow RunPod-specific setup in RUNPOD_DEPLOYMENT.md
```

## Health Checks and Monitoring

### Health Endpoints
- `/health` - Overall system health
- `/health/ready` - Kubernetes readiness probe
- `/health/live` - Kubernetes liveness probe
- `/metrics` - Prometheus metrics
- `/system/status` - Detailed component status

### Log Locations
- **Application logs**: `/var/log/supervisor/api.log`
- **Startup logs**: `/var/log/supervisor/startup.log`
- **Supervisor logs**: `/var/log/supervisor/supervisord.log`

### Performance Monitoring
```bash
# Check service health
curl http://localhost:8000/health

# Monitor metrics
curl http://localhost:8000/metrics

# View logs
docker logs ai-search-api
```

## Troubleshooting

### Common Issues

1. **Import errors**: Ensure `__init__.py` files are present (fixed in this version)
2. **Permission errors**: Services now run as `appuser` instead of root
3. **Model loading**: Wait for Ollama to download `phi3:mini` on first run
4. **Redis connection**: Ensure Redis is healthy before starting API

### Debug Mode
```bash
# Start in debug mode
docker-compose -f docker-compose.consolidated.yml --profile development up ai-search-dev

# Access shell for debugging
docker exec -it ai-search-dev /bin/bash
```

### Log Analysis
```bash
# View all service logs
docker-compose -f docker-compose.consolidated.yml logs -f

# View specific service logs
docker-compose -f docker-compose.consolidated.yml logs ai-search-api

# View supervisor logs inside container
docker exec ai-search-api tail -f /var/log/supervisor/api.log
```

## Security Considerations

### Production Security
- ✅ No hardcoded credentials (removed from supervisor configs)
- ✅ Services run as non-root user (`appuser`)
- ✅ No SSH access in production containers
- ✅ Minimal exposed ports
- ✅ Health checks for service monitoring

### Network Security
- All services communicate via private Docker network
- Only necessary ports exposed to host
- Redis not exposed to external networks
- API rate limiting enabled

## Maintenance

### Updates
```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose -f docker-compose.consolidated.yml build --no-cache
docker-compose -f docker-compose.consolidated.yml up -d
```

### Backup
```bash
# Backup Redis data
docker run --rm -v ai-search-redis-data:/data -v $(pwd):/backup alpine tar czf /backup/redis-backup.tar.gz /data

# Backup Ollama models
docker run --rm -v ai-search-ollama-models:/models -v $(pwd):/backup alpine tar czf /backup/models-backup.tar.gz /models
```

This consolidated approach provides a clear, secure, and maintainable deployment strategy for all environments.