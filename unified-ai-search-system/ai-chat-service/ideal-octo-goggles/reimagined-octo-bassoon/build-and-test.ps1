# Docker Build and Test Script
# Builds both systems locally and tests them before pushing to Docker Hub

Write-Host "🐳 UNIFIED AI PLATFORM - DOCKER BUILD & TEST" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Green

# Configuration
$DOCKER_HUB_USERNAME = "your-dockerhub-username"  # Change this to your Docker Hub username
$CONVERSATION_AI_IMAGE = "conversation-ai"
$DOCUMENT_SEARCH_IMAGE = "document-search"
$VERSION = "latest"

# Step 1: Check Docker environment
Write-Host "🔍 Checking Docker Environment..." -ForegroundColor Yellow

try {
    docker --version | Out-Null
    Write-Host "✅ Docker is available" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not installed or not running" -ForegroundColor Red
    exit 1
}

try {
    docker-compose --version | Out-Null
    Write-Host "✅ Docker Compose is available" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker Compose is not installed" -ForegroundColor Red
    exit 1
}

# Step 2: Clean up previous builds
Write-Host "🧹 Cleaning up previous builds..." -ForegroundColor Yellow
docker-compose -f docker-compose.local.yml down --remove-orphans --volumes
docker system prune -f

# Step 3: Build conversation AI image
Write-Host "🏗️  Building Conversation AI image..." -ForegroundColor Yellow
Set-Location "ubiquitous-octo-invention"

try {
    docker build -f Dockerfile.optimized -t ${CONVERSATION_AI_IMAGE}:${VERSION} .
    Write-Host "✅ Conversation AI image built successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to build Conversation AI image" -ForegroundColor Red
    exit 1
}

Set-Location ".."

# Step 4: Build document search image
Write-Host "🏗️  Building Document Search image..." -ForegroundColor Yellow
Set-Location "ideal-octo-goggles"

try {
    docker build -f Dockerfile.optimized -t ${DOCUMENT_SEARCH_IMAGE}:${VERSION} .
    Write-Host "✅ Document Search image built successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to build Document Search image" -ForegroundColor Red
    exit 1
}

Set-Location ".."

# Step 5: List built images
Write-Host "📋 Built Images:" -ForegroundColor Cyan
docker images | Where-Object { $_ -match "conversation-ai|document-search" }

# Step 6: Start services for testing
Write-Host "🚀 Starting services for testing..." -ForegroundColor Yellow
docker-compose -f docker-compose.local.yml up -d

# Step 7: Wait for services to be ready
Write-Host "⏳ Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Step 8: Test services
Write-Host "🧪 Testing Services..." -ForegroundColor Cyan

# Test Redis
try {
    $redisTest = docker-compose -f docker-compose.local.yml exec -T redis redis-cli ping
    if ($redisTest -match "PONG") {
        Write-Host "✅ Redis: HEALTHY" -ForegroundColor Green
    } else {
        Write-Host "❌ Redis: UNHEALTHY" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Redis: CONNECTION FAILED" -ForegroundColor Red
}

# Test Conversation AI
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/health/live" -UseBasicParsing -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Conversation AI: HEALTHY" -ForegroundColor Green
    } else {
        Write-Host "❌ Conversation AI: UNHEALTHY" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Conversation AI: CONNECTION FAILED" -ForegroundColor Red
}

# Test Document Search
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080/api/v2/health" -UseBasicParsing -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Document Search: HEALTHY" -ForegroundColor Green
    } else {
        Write-Host "❌ Document Search: UNHEALTHY" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Document Search: CONNECTION FAILED" -ForegroundColor Red
}

# Test Nginx Proxy
try {
    $response = Invoke-WebRequest -Uri "http://localhost/status" -UseBasicParsing -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Nginx Proxy: HEALTHY" -ForegroundColor Green
    } else {
        Write-Host "❌ Nginx Proxy: UNHEALTHY" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Nginx Proxy: CONNECTION FAILED" -ForegroundColor Red
}

# Step 9: Run comprehensive test
Write-Host "🔬 Running comprehensive connection test..." -ForegroundColor Cyan
try {
    python test_system_connection.py
    Write-Host "✅ Comprehensive test completed" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Comprehensive test had issues (check output above)" -ForegroundColor Yellow
}

# Step 10: Show service information
Write-Host "📊 Service Information:" -ForegroundColor Cyan
Write-Host "🌐 Web Interface: http://localhost/" -ForegroundColor White
Write-Host "💬 Conversation AI: http://localhost:8000/" -ForegroundColor White
Write-Host "🔍 Document Search: http://localhost:8080/" -ForegroundColor White
Write-Host "📊 Monitoring: http://localhost:9090/" -ForegroundColor White

# Step 11: Docker Hub preparation
Write-Host "🎯 Docker Hub Preparation:" -ForegroundColor Cyan
Write-Host "Ready to tag and push images to Docker Hub:" -ForegroundColor White
Write-Host "1. Update DOCKER_HUB_USERNAME in this script" -ForegroundColor Yellow
Write-Host "2. Login to Docker Hub: docker login" -ForegroundColor Yellow
Write-Host "3. Run push script: .\push-to-dockerhub.ps1" -ForegroundColor Yellow

Write-Host ""
Write-Host "🎉 Docker Build and Test Complete!" -ForegroundColor Green
Write-Host "Services are running and ready for testing." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "• Test the services manually at the URLs above" -ForegroundColor White
Write-Host "• If everything works, run push script to upload to Docker Hub" -ForegroundColor White
Write-Host "• Stop services with: docker-compose -f docker-compose.local.yml down" -ForegroundColor White
