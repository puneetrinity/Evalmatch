# Docker Deployment Guide

This guide covers building and deploying the AI Search System with Ollama integration to RunPod and other platforms.

## 🚀 Quick Start

### Local Build and Test

```bash
# 1. Build the RunPod image
./build-runpod.sh

# 2. Run locally for testing
docker run -d \
  --name ai-search-test \
  --gpus all \
  -p 8000:8000 \
  -p 11434:11434 \
  -e ENVIRONMENT=testing \
  ai-search-system:runpod-latest

# 3. Wait for services to start (2-3 minutes)
sleep 180

# 4. Test the system
curl http://localhost:8000/health
curl -X POST http://localhost:8000/api/v1/chat/complete \
  -H "Content-Type: application/json" \
  -d '{"message": "hello there", "session_id": "test"}'
```

### GitHub Actions Automated Build

The repository includes automated builds that trigger on:
- Push to `main` or `develop` branches
- New tags (for releases)
- Pull requests (for testing)

Images are automatically pushed to GitHub Container Registry:
- `ghcr.io/username/repo:main-runpod` (latest RunPod build)
- `ghcr.io/username/repo:main-production` (production build)
- `ghcr.io/username/repo:v1.0.0-runpod` (tagged releases)

## 🐳 Docker Images

### RunPod Image (`Dockerfile.runpod`)

**Optimized for RunPod deployment with:**
- ✅ Ollama pre-installed and configured
- ✅ GPU support (CUDA)
- ✅ Supervisor process management
- ✅ Automatic model downloading
- ✅ Health checks and monitoring
- ✅ Persistent storage support

**Services included:**
- **Redis** (port 6379) - Caching and session storage
- **Ollama** (port 11434) - Local LLM inference
- **FastAPI** (port 8000) - Main application API
- **Model Init** - Automatic model downloading
- **Health Monitor** - Service monitoring

### Production Image (`Dockerfile.production`)

**For traditional deployment:**
- External Redis required
- External Ollama or API-only mode
- Kubernetes-ready
- Multi-architecture support (AMD64, ARM64)

## 🔧 Configuration

### Environment Variables

```bash
# Core Configuration
ENVIRONMENT=production
REDIS_URL=redis://localhost:6379
OLLAMA_HOST=http://localhost:11434

# Ollama Configuration
OLLAMA_MODELS=/root/.ollama/models
OLLAMA_KEEP_ALIVE=24h
OLLAMA_ORIGINS=*
CUDA_VISIBLE_DEVICES=0

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000
DEFAULT_MODEL=phi3:mini

# Optional: API Keys for enhanced functionality
BRAVE_API_KEY=your_brave_search_key
SCRAPINGBEE_API_KEY=your_scrapingbee_key
```

### Supervisor Configuration

Located in `docker/supervisor-runpod.conf`:

```ini
[program:ollama]
command=/usr/local/bin/ollama serve
autostart=true
autorestart=true
environment=CUDA_VISIBLE_DEVICES="0",OLLAMA_KEEP_ALIVE="24h"
startsecs=30
startretries=999  # Never give up retrying
```

## 🏃‍♂️ RunPod Deployment

### Method 1: Using Pre-built Image

1. **Create RunPod Template:**
   - Image: `ghcr.io/username/repo:main-runpod`
   - GPU: Required (RTX A5000 recommended)
   - CPU: 4+ cores
   - RAM: 16GB+
   - Storage: 50GB+

2. **Port Configuration:**
   ```
   Container Port 8000 → HTTP
   Container Port 11434 → HTTP (optional, for direct Ollama access)
   ```

3. **Environment Variables:**
   ```
   ENVIRONMENT=production
   CUDA_VISIBLE_DEVICES=0
   OLLAMA_KEEP_ALIVE=24h
   ```

### Method 2: Build from Source

1. **Clone repository in RunPod:**
   ```bash
   git clone https://github.com/username/repo.git
   cd repo
   ```

2. **Build and run:**
   ```bash
   ./build-runpod.sh
   docker run -d --gpus all -p 8000:8000 ai-search-system:runpod-latest
   ```

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow

The `.github/workflows/build-and-push.yml` workflow:

1. **Build Stage:**
   - Builds both RunPod and production images
   - Multi-platform support where applicable
   - Caches layers for faster builds

2. **Test Stage:**
   - Runs health checks on built images
   - Tests API endpoints
   - Validates Ollama integration

3. **Security Stage:**
   - Trivy vulnerability scanning
   - Security report upload to GitHub

4. **Deploy Stage:**
   - Pushes to GitHub Container Registry
   - Tags with branch names and versions

### Manual Registry Push

```bash
# Build the image
./build-runpod.sh

# Tag for your registry
docker tag ai-search-system:runpod-latest your-registry/ai-search-system:runpod-latest

# Push to registry
docker push your-registry/ai-search-system:runpod-latest
```

## 🐛 Troubleshooting

### Common Issues

1. **Ollama Not Starting:**
   ```bash
   # Check supervisor status
   docker exec -it container supervisorctl status
   
   # Check Ollama logs
   docker exec -it container supervisorctl tail ollama stderr
   
   # Manual Ollama start
   docker exec -it container ollama serve
   ```

2. **Model Download Failures:**
   ```bash
   # Check model init logs
   docker exec -it container supervisorctl tail model-init stdout
   
   # Manual model download
   docker exec -it container ollama pull phi3:mini
   ```

3. **Memory Issues:**
   ```bash
   # Check memory usage
   docker stats container
   
   # Check GPU memory
   docker exec -it container nvidia-smi
   ```

### Debug Commands

```bash
# Container shell access
docker exec -it container bash

# Check all service status
docker exec -it container supervisorctl status

# View all logs
docker exec -it container find /var/log/supervisor -name "*.log" -exec tail -5 {} +

# Test Ollama directly
docker exec -it container curl http://localhost:11434/api/tags

# Test API directly
docker exec -it container curl http://localhost:8000/health
```

## 📊 Monitoring

### Health Endpoints

- `/health` - Overall system health
- `/health/live` - Kubernetes liveness probe
- `/health/ready` - Kubernetes readiness probe
- `/system/status` - Detailed component status
- `/metrics` - Prometheus metrics

### Log Locations

```
/var/log/supervisor/
├── supervisord.log      # Supervisor main log
├── redis.err.log        # Redis errors
├── redis.out.log        # Redis output
├── ollama.err.log       # Ollama errors
├── ollama.out.log       # Ollama output
├── api.err.log          # FastAPI errors
├── api.out.log          # FastAPI output
├── model-init.err.log   # Model initialization errors
└── model-init.out.log   # Model initialization output
```

## 🔐 Security

### Best Practices

1. **Use specific image tags** (not `latest`) in production
2. **Enable security scanning** with Trivy or similar tools
3. **Limit container privileges** - run as non-root where possible
4. **Use secrets management** for API keys
5. **Enable network policies** in Kubernetes deployments

### RunPod Security

- Container runs as root (required for GPU access)
- No SSH access by default (use RunPod terminal)
- Environment variables for secrets
- Network isolation between pods

## 📈 Performance Optimization

### GPU Usage

- **Single GPU setup**: `CUDA_VISIBLE_DEVICES=0`
- **Multi-GPU**: Load balancing across devices
- **Memory management**: Monitor with `nvidia-smi`

### Model Management

- **Persistent storage**: Mount `/root/.ollama` volume
- **Pre-download models**: Use model init script
- **Model cleanup**: Automatic unloading after inactivity

### Resource Limits

```yaml
# Docker Compose example
deploy:
  resources:
    limits:
      memory: 16G
      cpus: '4'
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu]
```

## 🚀 Scaling

### Horizontal Scaling

- **Load balancer** in front of multiple containers
- **Shared Redis** for session storage
- **Model caching** strategies
- **API rate limiting** per instance

### Vertical Scaling

- **Increase memory** for larger models
- **Add GPU memory** for concurrent requests
- **CPU cores** for parallel processing

---

**Happy Deploying! 🚀**

For issues or questions, check the troubleshooting section or open a GitHub issue.