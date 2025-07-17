# Deployment Documentation

## Quick Start

```bash
# 1. Setup environment
cd deploy
make setup  # Creates .env from template

# 2. Edit .env with your API keys (optional but recommended)
nano .env

# 3. Start development environment  
make dev
```

## Deployment Environments

### 🔧 Development
- **Purpose**: Local development and testing
- **Command**: `make dev`
- **Features**: Hot reload, debug logging, all ports exposed
- **URL**: http://localhost:8000

### 🏭 Production
- **Purpose**: Production server deployment
- **Command**: `make prod`
- **Features**: Optimized performance, health monitoring, restart policies
- **Requirements**: Production-grade server with Docker

### 🎮 RunPod GPU Cloud
- **Purpose**: GPU-accelerated inference on RunPod platform
- **Command**: `make runpod`
- **Features**: TTY terminal access, GPU optimization, A5000/A6000 support
- **Requirements**: RunPod GPU instance

## File Structure

```
deploy/
├── README.md                    # Overview and quick start
├── DEPLOYMENT.md               # This file - detailed deployment docs
├── .env.example                # Environment template
├── Makefile                    # Deployment commands
├── docker-compose.yml          # Primary deployment (dev/prod)
└── docker-compose.runpod.yml   # RunPod GPU cloud deployment
```

## Key Features

### ✅ Streamlined Architecture
- **Single container** with supervisor managing all services
- **Model management API** for HTTP-based model downloads
- **Terminal-safe RunPod** deployment with proper TTY handling

### ✅ Cost Optimization
- **85% local inference** using phi3:mini via Ollama
- **API fallbacks** to OpenAI/Claude for complex reasoning
- **Smart caching** with Redis for routing decisions

### ✅ Production Ready
- **Health checks** for Kubernetes/Docker Swarm
- **Graceful shutdown** with proper signal handling
- **Resource limits** and restart policies
- **Structured logging** with correlation IDs

## Environment Variables

Key variables in `.env`:

```bash
# Essential
REDIS_URL=redis://localhost:6379
OLLAMA_HOST=http://localhost:11434
DEFAULT_MODEL=phi3:mini

# API Keys (optional)
BRAVE_API_KEY=your_key_here
SCRAPINGBEE_API_KEY=your_key_here

# Performance
LOG_LEVEL=INFO
ENVIRONMENT=production
```

## Service URLs

| Environment | API | Docs | Ollama |
|-------------|-----|------|--------|
| Development | http://localhost:8000 | http://localhost:8000/docs | http://localhost:11434 |
| Production | https://your-domain.com | https://your-domain.com/docs | Internal only |
| RunPod | https://pod-8000.proxy.runpod.net | https://pod-8000.proxy.runpod.net/docs | https://pod-11434.proxy.runpod.net |

## Monitoring & Health

### Health Endpoints
- `/health` - Overall system health
- `/health/live` - Kubernetes liveness probe
- `/health/ready` - Kubernetes readiness probe
- `/system/status` - Detailed component status

### Useful Commands
```bash
make health     # Check system health
make test       # Run API tests
make logs       # View application logs
make models     # Download default models
make status     # Show container status
```

## Troubleshooting

### Common Issues

**Port conflicts:**
```bash
make clean      # Stop all containers
lsof -i :8000   # Check what's using port 8000
```

**Model download failures:**
```bash
# Use API instead of terminal
curl -X POST "http://localhost:8000/api/v1/models/download" \
  -H "Content-Type: application/json" \
  -d '{"model_name": "phi3:mini"}'
```

**RunPod terminal not responding:**
- Ensure `tty: true` and `stdin_open: true` in compose file
- Use fixed Dockerfile with proper PID 1 management
- Check container logs for startup issues

### Debug Commands
```bash
# Access container shell
make shell

# View detailed logs
docker logs ai-search-system

# Check running processes
docker exec ai-search-system ps aux

# Monitor resource usage
docker stats ai-search-system
```

## Migration from Old Setup

If migrating from the old deployment:

1. **Stop old containers**: `docker-compose down`
2. **Move to deploy directory**: `cd deploy`
3. **Setup environment**: `make setup`
4. **Start new deployment**: `make dev`

Old deployment files are archived in `../archive/old-deployments/` for reference.

## Next Steps

After successful deployment:

1. **Download models**: `make models` or use API endpoints
2. **Test functionality**: `make test`
3. **Configure API keys**: Edit `.env` for full search functionality
4. **Monitor health**: `make health` and check `/docs` for API exploration