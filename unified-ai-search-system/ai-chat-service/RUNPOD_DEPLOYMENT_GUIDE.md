# RunPod Deployment Guide

## Overview
The AI Search System has been successfully built and pushed to the GitHub Container Registry. This guide provides step-by-step instructions for deploying on RunPod.

## Prerequisites
- RunPod account with credits
- Access to the GitHub Container Registry image: `ghcr.io/puneetrinity/ubiquitous-octo-invention:latest`

## Deployment Steps

### 1. Create RunPod Instance

1. **Log into RunPod** and go to "Serverless" or "Pods"
2. **Select a template** or create a new one:
   - Use a Docker template
   - Recommended: GPU-enabled instance for better performance
   - Minimum specs: 2 vCPU, 4GB RAM

### 2. Configure Docker Container

**Container Image**: `ghcr.io/puneetrinity/ubiquitous-octo-invention:latest`

**Port Configuration**:
- **Container Port**: 8000
- **Expose Port**: 8000

### 3. Set Environment Variables

Add these environment variables in RunPod:

```bash
# RunPod-specific variables (will be auto-set by RunPod)
RUNPOD_POD_ID=$RUNPOD_POD_ID
RUNPOD_TCP_PORT_8000=8000

# Application configuration
OLLAMA_BASE_URL=http://localhost:11434
MODEL_CACHE_DIR=/app/cache
LOG_LEVEL=INFO
PYTHONPATH=/app

# Optional: Model-specific configurations
DEFAULT_MODEL=llama3.2:latest
MODEL_TIMEOUT=300
```

### 4. Deploy and Verify

1. **Start the pod**
2. **Wait for startup** (may take 2-3 minutes for initial model loading)
3. **Check logs** for any errors
4. **Test health endpoints**:
   - `GET /health/live` - Basic liveness check
   - `GET /health/ready` - Ready for requests

### 5. Test the API

**Test the chat endpoint**:
```bash
curl -X POST http://your-runpod-url:8000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "Hello, test the AI system", "stream": false}'
```

**Expected Response**:
```json
{
  "response": "AI generated response text",
  "status": "success",
  "model_used": "llama3.2:latest"
}
```

## RunPod-Specific Commands

Once your pod is running, you can execute these commands in the RunPod terminal:

### Container Management
```bash
# Check running containers
docker ps

# View container logs
docker logs ai-search-system

# Enter the container
docker exec -it ai-search-system bash
```

### Application Commands
```bash
# Run inside the container
docker exec ai-search-system python scripts/validate_startup.py
docker exec ai-search-system python scripts/final-runpod-fix.py

# Check service status (if using supervisor)
docker exec ai-search-system supervisorctl status
```

### Debugging Commands
```bash
# Check model discovery
docker exec ai-search-system python scripts/debug-model-discovery.py

# Test model information
docker exec ai-search-system python scripts/test-model-info.py

# Run comprehensive diagnostics
docker exec ai-search-system python scripts/comprehensive-production-fix.py
```

## Troubleshooting

### Common Issues

1. **Container won't start**:
   - Check environment variables are set correctly
   - Verify the image pulled successfully
   - Check RunPod logs for errors

2. **API returns 500 errors**:
   - Run the validation script: `python scripts/validate_startup.py`
   - Check if models are loading correctly
   - Verify Ollama is accessible

3. **Empty or invalid responses**:
   - This issue has been fixed in the latest image
   - If it persists, run: `python scripts/final-runpod-fix.py`

4. **Model loading issues**:
   - Check available models: `python scripts/debug-model-discovery.py`
   - Verify Ollama connection: `curl http://localhost:11434/api/tags`

### Health Checks

The application provides comprehensive health endpoints:

- `GET /health/live` - Returns 200 if application is running
- `GET /health/ready` - Returns 200 if ready to serve requests
- `GET /health/models` - Returns status of available models

### Performance Optimization

1. **Use GPU instances** for better model performance
2. **Set adequate memory** (minimum 4GB, recommended 8GB+)
3. **Use persistent storage** for model caching
4. **Monitor resource usage** during operation

## Expected Startup Sequence

1. **Container starts** (0-30 seconds)
2. **Python environment loads** (30-60 seconds)
3. **Models are discovered and loaded** (1-3 minutes)
4. **API becomes ready** (health checks pass)
5. **System ready for requests**

## Support and Logs

- **Application logs**: Available in RunPod console
- **Health endpoints**: Monitor system status
- **Validation scripts**: Run diagnostic tools
- **GitHub repository**: [ubiquitous-octo-invention](https://github.com/puneetrinity/ubiquitous-octo-invention)

## Production Considerations

1. **Monitoring**: Set up monitoring for health endpoints
2. **Scaling**: Consider load balancing for high traffic
3. **Updates**: Pull latest image for updates
4. **Backup**: Backup any persistent data/models
5. **Security**: Use environment variables for sensitive data

---

**Ready for Production**: This deployment guide covers a production-ready setup that has been tested and validated. All known issues have been resolved in the latest Docker image.
