# RunPod Deployment Guide - Terminal Access Fix

## Critical RunPod Configuration Requirements

### 1. Docker Compose Settings (ESSENTIAL)
For RunPod containers to maintain terminal access, you MUST include:

```yaml
services:
  ai-search:
    # ... other config ...
    
    # CRITICAL: These settings are REQUIRED for RunPod terminal access
    tty: true           # Allocate a pseudo-TTY
    stdin_open: true    # Keep stdin open for interactive terminal
```

**Why this matters:**
- `tty: true` - Allocates a pseudo-terminal, required for RunPod's web terminal interface
- `stdin_open: true` - Keeps stdin open, allowing interactive commands in RunPod terminal
- Without these, RunPod terminal will appear frozen/unresponsive

### 2. Container Process Management
Choose ONE of these approaches:

#### Option A: Supervisord as PID 1 (Production)
```dockerfile
CMD ["/app/scripts/runpod-fixed-entrypoint.sh"]
```

#### Option B: Terminal-Keeper Background Services (Development)  
```dockerfile  
CMD ["/app/scripts/runpod-terminal-keeper.sh"]
```

### 3. RunPod Template Configuration

When creating a RunPod template, ensure:

```yaml
# In your RunPod pod configuration
container_config:
  tty: true
  stdin_open: true
  ports:
    - container_port: 8000
      external_port: 8000
    - container_port: 11434
      external_port: 11434
```

## Fixed Files Overview

### ✅ Now Fixed in Repository:
- `docker-compose.runpod.yml` - Added `tty: true` and `stdin_open: true`
- `docker-compose.runpod-simple.yml` - Added TTY settings
- `scripts/runpod-fixed-entrypoint.sh` - Proper PID 1 management
- `scripts/runpod-terminal-keeper.sh` - Terminal-friendly alternative
- `Dockerfile.runpod.fixed` - Updated with proper CMD

## Quick Deployment Steps

### Step 1: Use Fixed Docker Compose
```bash
# Use the updated compose file with TTY settings
docker-compose -f docker-compose.runpod.yml up --build
```

### Step 2: Verify Terminal Access
After deployment, test in RunPod terminal:
```bash
# These should work without hanging:
echo "Hello RunPod"
ps aux | head -5
supervisorctl status
curl localhost:8000/health
```

### Step 3: Test Model Downloads  
```bash
# Via terminal (if working):
ollama pull phi3:mini

# Via API (always works):
curl -X POST "https://your-pod-url/api/v1/models/download" \
  -H "Content-Type: application/json" \
  -d '{"model_name": "phi3:mini"}'
```

## Troubleshooting

### If Terminal Still Freezes:
1. **Check TTY settings** in your compose/config
2. **Verify container is using fixed entrypoint**
3. **Check logs** for process management issues
4. **Use API endpoints** as fallback for model management

### Verification Commands:
```bash
# Check if TTY is allocated
tty

# Check main process (should be supervisord or terminal-keeper)
ps aux | head -2

# Check if services are running
supervisorctl status

# Test API accessibility  
curl localhost:8000/health
```

## Production Recommendations

1. **Always use** `tty: true` and `stdin_open: true` in RunPod deployments
2. **Use supervisord as PID 1** for stability (`runpod-fixed-entrypoint.sh`)
3. **Test locally first** with `docker run -it` to verify terminal behavior
4. **Have API fallback** for critical operations (like model downloads)
5. **Monitor startup logs** to catch early process management issues

## Emergency Recovery

If you're stuck with a non-responsive terminal:

1. **Use RunPod's container restart** feature
2. **Deploy with fixed configuration** using updated compose files
3. **Use API endpoints** for immediate functionality while fixing terminal access
4. **Check RunPod logs** outside the container for diagnostics