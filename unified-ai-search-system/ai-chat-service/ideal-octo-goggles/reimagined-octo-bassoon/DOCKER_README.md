# Docker Deployment Guide

## Quick Start

1. **Prerequisites**
   ```powershell
   # Install Docker Desktop for Windows
   # Make sure both repositories are in the same parent directory
   ```

2. **Build and Run**
   ```powershell
   # Build the unified container
   docker-compose -f docker-compose.unified.yml build

   # Start all services
   docker-compose -f docker-compose.unified.yml up -d

   # View logs
   docker-compose -f docker-compose.unified.yml logs -f
   ```

3. **Access the Application**
   - Main Chat UI: http://localhost:8000
   - Unified Chat: http://localhost:8000/chat
   - Search API: http://localhost:8001
   - Health Check: http://localhost:8000/health

## Services Overview

### unified-ai-system
- **Ports**: 8000 (ubiquitous), 8001 (ideal-octo-goggles)
- **Features**: 
  - Unified chat interface
  - Combined AI orchestration
  - Fast document search
  - Real-time monitoring

### redis (Optional)
- **Port**: 6379
- **Purpose**: Caching layer for improved performance

### nginx (Optional)
- **Ports**: 80, 443
- **Purpose**: Reverse proxy and load balancing

## Development Mode

For development with live code reloading:

```powershell
# Set environment variables
$env:ENVIRONMENT = "development"
$env:DEBUG = "true"

# Run with volume mounts for live editing
docker-compose -f docker-compose.unified.yml up --build
```

## Monitoring

### Health Checks
```powershell
# Check service health
curl http://localhost:8000/health
curl http://localhost:8001/health

# View container status
docker-compose -f docker-compose.unified.yml ps

# View detailed logs
docker-compose -f docker-compose.unified.yml logs unified-ai-system
```

### Service Management
```powershell
# Restart services
docker-compose -f docker-compose.unified.yml restart

# Stop services
docker-compose -f docker-compose.unified.yml down

# Clean up
docker-compose -f docker-compose.unified.yml down -v --rmi all
```

## Configuration

### Environment Variables
- `PORT`: Main service port (default: 8000)
- `SEARCH_PORT`: Search service port (default: 8001)
- `ENVIRONMENT`: development/production
- `DEBUG`: Enable debug logging

### Volume Mounts
- Source code: `/app/ubiquitous-octo-invention` and `/app/ideal-octo-goggles`
- Logs: `/var/log/unified-ai-system`
- Redis data: Persistent volume

## Troubleshooting

### Common Issues

1. **Port Conflicts**
   ```powershell
   # Check what's using ports 8000/8001
   netstat -ano | findstr ":8000"
   netstat -ano | findstr ":8001"
   ```

2. **Container Build Errors**
   ```powershell
   # Clean rebuild
   docker-compose -f docker-compose.unified.yml build --no-cache
   ```

3. **Service Not Starting**
   ```powershell
   # Check container logs
   docker-compose -f docker-compose.unified.yml logs unified-ai-system
   
   # Check supervisor status
   docker-compose -f docker-compose.unified.yml exec unified-ai-system supervisorctl status
   ```

4. **Memory Issues**
   ```powershell
   # Increase Docker Desktop memory allocation
   # Docker Desktop -> Settings -> Resources -> Memory
   ```

### Debug Mode

```powershell
# Run with debug output
docker-compose -f docker-compose.unified.yml up --build

# Access container shell
docker-compose -f docker-compose.unified.yml exec unified-ai-system bash

# Check supervisor status
docker-compose -f docker-compose.unified.yml exec unified-ai-system supervisorctl status all
```

## Production Deployment

For production deployment:

1. **Security**
   - Remove debug flags
   - Use environment-specific configs
   - Enable HTTPS in nginx
   - Set proper resource limits

2. **Performance**
   - Use production WSGI server
   - Enable caching with Redis
   - Configure proper logging levels
   - Set up monitoring

3. **Scaling**
   - Use Docker Swarm or Kubernetes
   - Configure load balancing
   - Set up database clustering
   - Implement auto-scaling

## API Endpoints

### Unified Chat API
- `POST /api/chat/unified` - Multi-modal chat
- `GET /api/chat/status` - Service status
- `GET /health` - Health check

### Search API (Port 8001)
- `POST /search` - Document search
- `GET /health` - Search service health

### UI Endpoints
- `GET /` - Main interface
- `GET /chat` - Unified chat UI
- `GET /demo` - Integration demo

## Data Persistence

The Redis container uses a named volume for data persistence. To backup:

```powershell
# Create backup
docker-compose -f docker-compose.unified.yml exec redis redis-cli SAVE

# Copy backup file
docker cp container_name:/data/dump.rdb ./backup/
```

## Network Architecture

```
Internet -> Nginx (80/443) -> unified-ai-system (8000/8001)
                           -> Redis (6379)
```

All services communicate through the `ai-network` bridge network for isolation and security.
