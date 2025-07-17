# Docker Hub Push Script
# Tags and pushes the built images to Docker Hub

param(
    [Parameter(Mandatory=$true)]
    [string]$DockerHubUsername,
    
    [Parameter(Mandatory=$false)]
    [string]$Version = "latest"
)

Write-Host "🚀 PUSHING TO DOCKER HUB" -ForegroundColor Green
Write-Host "=" * 40 -ForegroundColor Green

# Configuration
$CONVERSATION_AI_IMAGE = "conversation-ai"
$DOCUMENT_SEARCH_IMAGE = "document-search"
$DOCKER_HUB_CONVERSATION = "${DockerHubUsername}/unified-ai-conversation"
$DOCKER_HUB_DOCUMENT = "${DockerHubUsername}/unified-ai-document-search"

# Step 1: Check if user is logged in to Docker Hub
Write-Host "🔐 Checking Docker Hub login..." -ForegroundColor Yellow
try {
    docker info | Select-String "Username" | Out-Null
    Write-Host "✅ Logged in to Docker Hub" -ForegroundColor Green
} catch {
    Write-Host "❌ Not logged in to Docker Hub" -ForegroundColor Red
    Write-Host "Please run: docker login" -ForegroundColor Yellow
    exit 1
}

# Step 2: Check if images exist locally
Write-Host "🔍 Checking local images..." -ForegroundColor Yellow

$conversationExists = docker images --format "table {{.Repository}}:{{.Tag}}" | Select-String "${CONVERSATION_AI_IMAGE}:${Version}"
$documentExists = docker images --format "table {{.Repository}}:{{.Tag}}" | Select-String "${DOCUMENT_SEARCH_IMAGE}:${Version}"

if (-not $conversationExists) {
    Write-Host "❌ Conversation AI image not found locally" -ForegroundColor Red
    Write-Host "Please run build-and-test.ps1 first" -ForegroundColor Yellow
    exit 1
}

if (-not $documentExists) {
    Write-Host "❌ Document Search image not found locally" -ForegroundColor Red
    Write-Host "Please run build-and-test.ps1 first" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Both images found locally" -ForegroundColor Green

# Step 3: Tag images for Docker Hub
Write-Host "🏷️  Tagging images for Docker Hub..." -ForegroundColor Yellow

try {
    docker tag "${CONVERSATION_AI_IMAGE}:${Version}" "${DOCKER_HUB_CONVERSATION}:${Version}"
    docker tag "${CONVERSATION_AI_IMAGE}:${Version}" "${DOCKER_HUB_CONVERSATION}:latest"
    Write-Host "✅ Conversation AI image tagged" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to tag Conversation AI image" -ForegroundColor Red
    exit 1
}

try {
    docker tag "${DOCUMENT_SEARCH_IMAGE}:${Version}" "${DOCKER_HUB_DOCUMENT}:${Version}"
    docker tag "${DOCUMENT_SEARCH_IMAGE}:${Version}" "${DOCKER_HUB_DOCUMENT}:latest"
    Write-Host "✅ Document Search image tagged" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to tag Document Search image" -ForegroundColor Red
    exit 1
}

# Step 4: Push images to Docker Hub
Write-Host "📤 Pushing images to Docker Hub..." -ForegroundColor Yellow

Write-Host "Pushing Conversation AI image..." -ForegroundColor Cyan
try {
    docker push "${DOCKER_HUB_CONVERSATION}:${Version}"
    docker push "${DOCKER_HUB_CONVERSATION}:latest"
    Write-Host "✅ Conversation AI image pushed successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to push Conversation AI image" -ForegroundColor Red
    exit 1
}

Write-Host "Pushing Document Search image..." -ForegroundColor Cyan
try {
    docker push "${DOCKER_HUB_DOCUMENT}:${Version}"
    docker push "${DOCKER_HUB_DOCUMENT}:latest"
    Write-Host "✅ Document Search image pushed successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to push Document Search image" -ForegroundColor Red
    exit 1
}

# Step 5: Create Docker Hub deployment compose file
Write-Host "📝 Creating Docker Hub deployment compose file..." -ForegroundColor Yellow

$dockerHubCompose = @"
# Docker Compose file using images from Docker Hub
# Ready for production deployment

version: '3.8'

services:
  # Redis cache service
  redis:
    image: redis:7-alpine
    container_name: ai-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
    networks:
      - ai-network

  # Conversation AI from Docker Hub
  conversation-ai:
    image: ${DOCKER_HUB_CONVERSATION}:latest
    container_name: conversation-ai
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - ENVIRONMENT=production
      - REDIS_URL=redis://redis:6379
      - PYTHONPATH=/app
      - LOG_LEVEL=info
      - DOCUMENT_SEARCH_URL=http://document-search:8000
      - ENABLE_DOCUMENT_SEARCH=true
    volumes:
      - conversation_logs:/app/logs
    depends_on:
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    networks:
      - ai-network

  # Document Search from Docker Hub
  document-search:
    image: ${DOCKER_HUB_DOCUMENT}:latest
    container_name: document-search
    restart: unless-stopped
    ports:
      - "8080:8000"
    environment:
      - PYTHONUNBUFFERED=1
      - EMBEDDING_MODEL_NAME=all-MiniLM-L6-v2
      - EMBEDDING_DIM=384
      - USE_GPU=false
      - INDEX_PATH=/app/indexes
      - REDIS_URL=redis://redis:6379
      - CONVERSATION_AI_URL=http://conversation-ai:8000
    volumes:
      - document_data:/app/data
      - document_indexes:/app/indexes
      - document_logs:/app/logs
    depends_on:
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v2/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    networks:
      - ai-network

  # Nginx proxy
  nginx-proxy:
    image: nginx:alpine
    container_name: ai-nginx-proxy
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./nginx-unified.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      conversation-ai:
        condition: service_healthy
      document-search:
        condition: service_healthy
    networks:
      - ai-network

volumes:
  redis_data:
  conversation_logs:
  document_data:
  document_indexes:
  document_logs:

networks:
  ai-network:
    driver: bridge
"@

$dockerHubCompose | Out-File -FilePath "docker-compose.dockerhub.yml" -Encoding UTF8
Write-Host "✅ Docker Hub compose file created: docker-compose.dockerhub.yml" -ForegroundColor Green

# Step 6: Show summary
Write-Host ""
Write-Host "🎉 DOCKER HUB PUSH COMPLETE!" -ForegroundColor Green
Write-Host "=" * 40 -ForegroundColor Green
Write-Host ""
Write-Host "📦 Pushed Images:" -ForegroundColor Cyan
Write-Host "• ${DOCKER_HUB_CONVERSATION}:latest" -ForegroundColor White
Write-Host "• ${DOCKER_HUB_CONVERSATION}:${Version}" -ForegroundColor White
Write-Host "• ${DOCKER_HUB_DOCUMENT}:latest" -ForegroundColor White
Write-Host "• ${DOCKER_HUB_DOCUMENT}:${Version}" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Deployment Options:" -ForegroundColor Cyan
Write-Host "1. Local testing: docker-compose -f docker-compose.local.yml up -d" -ForegroundColor White
Write-Host "2. Docker Hub deployment: docker-compose -f docker-compose.dockerhub.yml up -d" -ForegroundColor White
Write-Host ""
Write-Host "🌐 Docker Hub URLs:" -ForegroundColor Cyan
Write-Host "• https://hub.docker.com/r/${DockerHubUsername}/unified-ai-conversation" -ForegroundColor White
Write-Host "• https://hub.docker.com/r/${DockerHubUsername}/unified-ai-document-search" -ForegroundColor White
Write-Host ""
Write-Host "✨ Anyone can now deploy your unified AI platform with:" -ForegroundColor Green
Write-Host "   docker-compose -f docker-compose.dockerhub.yml up -d" -ForegroundColor Yellow
