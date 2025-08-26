# Docker Deployment Guide

This guide covers deploying EvalMatch using Docker containers for development, staging, and production environments.

## 🐳 Quick Start

### Development Environment
```bash
# Clone and setup
git clone https://github.com/puneetrinity/Evalmatch.git
cd Evalmatch

# Copy environment template
cp .env.example .env
# Edit .env with your configuration

# Start with Docker Compose
docker-compose -f docker-compose.dev.yml up --build
```

### Production Environment
```bash
# Build and run production containers
docker-compose -f docker-compose.yml up --build -d
```

## 📋 Available Docker Configurations

### 1. Development (`docker-compose.dev.yml`)
- Hot reload for development
- Development database included
- Debug ports exposed
- Volume mounts for live editing

### 2. Production (`docker-compose.yml`)
- Optimized production build
- Health checks enabled
- Proper resource limits
- Security hardened

### 3. Testing (`docker-compose.test.yml`)
- Isolated test environment
- Test database included
- CI/CD optimized

### 4. Unified (`docker-compose.unified.yml`)
- All services in one stack
- Development and production profiles
- Complete system testing

## 🏗️ Docker Architecture

### Multi-Stage Production Build

```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy source and build
COPY . .
RUN npm run build

# Runtime stage
FROM node:18-alpine AS runner
WORKDIR /app

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Switch to non-root user
USER nextjs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:$PORT/api/health || exit 1

EXPOSE 3000
CMD ["npm", "start"]
```

## ⚙️ Environment Configuration

### Required Environment Variables
```bash
# Database
DATABASE_URL=postgresql://user:password@db:5432/evalmatch

# AI Providers
PR_OPEN_API_KEY=your-openai-key
PR_ANTHROPIC_API_KEY=your-anthropic-key
PR_GROQ_API_KEY=your-groq-key

# Redis (optional)
REDIS_URL=redis://redis:6379

# Firebase
VITE_FIREBASE_API_KEY=your-firebase-key
VITE_FIREBASE_AUTH_DOMAIN=your-domain
VITE_FIREBASE_PROJECT_ID=your-project-id
```

### Docker Compose Environment
```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/evalmatch
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=evalmatch
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

volumes:
  postgres_data:
  redis_data:
```

## 🚀 Production Deployment

### 1. Build Production Image
```bash
# Build optimized production image
docker build -t evalmatch:latest -f Dockerfile .

# Tag for registry
docker tag evalmatch:latest your-registry/evalmatch:v2.1.0
docker push your-registry/evalmatch:v2.1.0
```

### 2. Deploy to Production
```bash
# Deploy with production configuration
docker-compose -f docker-compose.yml up -d

# Check deployment status
docker-compose ps
docker-compose logs app

# Scale if needed
docker-compose up -d --scale app=3
```

### 3. Health Monitoring
```bash
# Check health status
curl http://localhost:3000/api/health

# Monitor container health
docker-compose ps
docker stats

# View logs
docker-compose logs -f app
```

## 🔒 Security Considerations

### Container Security
- **Non-root User**: Application runs as non-privileged user
- **Minimal Base Image**: Alpine Linux for smaller attack surface
- **Security Updates**: Regular base image updates
- **Resource Limits**: CPU and memory constraints

### Network Security
```yaml
# Network isolation
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true

services:
  app:
    networks:
      - frontend
      - backend
  
  db:
    networks:
      - backend  # Database not exposed to frontend network
```

### Secrets Management
```yaml
# Use Docker secrets for sensitive data
secrets:
  openai_key:
    external: true
  db_password:
    external: true

services:
  app:
    secrets:
      - openai_key
      - db_password
    environment:
      - PR_OPEN_API_KEY_FILE=/run/secrets/openai_key
      - DATABASE_PASSWORD_FILE=/run/secrets/db_password
```

## 📊 Performance Optimization

### Resource Limits
```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### Caching Strategy
```yaml
# Multi-layer caching
services:
  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    ports:
      - "80:80"
    depends_on:
      - app

  app:
    build: .
    environment:
      - REDIS_URL=redis://redis:6379
```

## 🧪 Development Workflow

### Local Development
```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up

# Run tests in container
docker-compose -f docker-compose.test.yml run --rm app npm test

# Execute commands in running container
docker-compose exec app npm run db:migrate
docker-compose exec app npm run db:seed
```

### Debugging
```bash
# Access container shell
docker-compose exec app sh

# View container logs
docker-compose logs -f app

# Debug with node inspector
docker-compose -f docker-compose.dev.yml run --rm -p 9229:9229 app \
  node --inspect-brk=0.0.0.0:9229 dist/index.js
```

## 🔄 Database Management

### Migrations
```bash
# Run database migrations
docker-compose exec app npm run db:migrate

# Reset database
docker-compose exec app npm run db:reset

# Backup database
docker-compose exec db pg_dump -U postgres evalmatch > backup.sql
```

### Volume Management
```bash
# Backup data volumes
docker run --rm -v evalmatch_postgres_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/postgres-backup.tar.gz -C /data .

# Restore data volumes
docker run --rm -v evalmatch_postgres_data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/postgres-backup.tar.gz -C /data
```

## 📈 Monitoring & Observability

### Health Checks
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

### Logging Configuration
```yaml
services:
  app:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Metrics Collection
```yaml
# Add monitoring stack
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

## 🛠️ Troubleshooting

### Common Issues

#### 1. Port Conflicts
```bash
# Check port usage
sudo netstat -tulpn | grep :3000

# Use different port
docker-compose run -p 3001:3000 app
```

#### 2. Database Connection Issues
```bash
# Check database container
docker-compose logs db

# Test database connectivity
docker-compose exec app pg_isready -h db -p 5432
```

#### 3. Memory Issues
```bash
# Check memory usage
docker stats

# Increase memory limits
docker-compose up --scale app=1 --memory=2g
```

#### 4. Build Failures
```bash
# Clean build cache
docker system prune -a

# Rebuild with no cache
docker-compose build --no-cache
```

## 📚 Additional Resources

### Docker Commands Reference
```bash
# Container management
docker-compose up -d              # Start in background
docker-compose down              # Stop and remove containers
docker-compose restart app       # Restart specific service
docker-compose logs -f app       # Follow logs

# System maintenance
docker system prune              # Clean unused resources
docker volume prune              # Clean unused volumes
docker image prune               # Clean unused images
```

### Performance Monitoring
```bash
# Container resource usage
docker stats

# System resource usage
docker system df

# Network debugging
docker network ls
docker network inspect evalmatch_default
```

## 🔗 Related Documentation

- [Production Deployment](production.md) - General production deployment
- [Railway Deployment](railway.md) - Railway-specific deployment
- [Architecture Guide](../ARCHITECTURE.md) - System architecture overview
- [Monitoring Setup](../operations/monitoring.md) - Observability configuration

---

**Docker Version Compatibility**: Docker Engine 20.10+, Docker Compose 2.0+  
**Last Updated**: January 2025  
**Maintained By**: EvalMatch DevOps Team