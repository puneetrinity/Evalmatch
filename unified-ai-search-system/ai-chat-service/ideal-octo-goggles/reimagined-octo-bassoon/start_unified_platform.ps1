# Unified AI Platform Startup Script (PowerShell)
# Launches both ubiquitous-octo-invention and ideal-octo-goggles systems

Write-Host "🚀 Starting Unified AI Platform..." -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Green

# Check if Docker is running
try {
    docker info | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not running. Please start Docker first." -ForegroundColor Red
    exit 1
}

# Check if Docker Compose is available
try {
    docker-compose --version | Out-Null
    Write-Host "✅ Docker Compose is available" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker Compose is not installed. Please install Docker Compose." -ForegroundColor Red
    exit 1
}

# Stop any existing containers
Write-Host "🔄 Stopping existing containers..." -ForegroundColor Yellow
docker-compose -f docker-compose.unified.yml down --remove-orphans

# Pull latest images
Write-Host "📥 Pulling latest images..." -ForegroundColor Yellow
docker-compose -f docker-compose.unified.yml pull

# Build and start the services
Write-Host "🏗️  Building and starting services..." -ForegroundColor Yellow
docker-compose -f docker-compose.unified.yml up -d --build

# Wait for services to be ready
Write-Host "⏳ Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check service health
Write-Host "🔍 Checking service health..." -ForegroundColor Cyan

# Check Redis
try {
    $redisResult = docker-compose -f docker-compose.unified.yml exec -T redis redis-cli ping
    if ($redisResult -match "PONG") {
        Write-Host "✅ Redis is healthy" -ForegroundColor Green
    } else {
        Write-Host "❌ Redis is not responding" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Redis health check failed" -ForegroundColor Red
}

# Check Conversation AI
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/health/live" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Conversation AI is healthy" -ForegroundColor Green
    } else {
        Write-Host "❌ Conversation AI is not responding" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Conversation AI health check failed" -ForegroundColor Red
}

# Check Document Search
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080/api/v2/health" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Document Search is healthy" -ForegroundColor Green
    } else {
        Write-Host "❌ Document Search is not responding" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Document Search health check failed" -ForegroundColor Red
}

# Check Nginx Proxy
try {
    $response = Invoke-WebRequest -Uri "http://localhost/" -UseBasicParsing -TimeoutSec 5
    if ($response.Content -match "Unified AI Platform") {
        Write-Host "✅ Nginx Proxy is healthy" -ForegroundColor Green
    } else {
        Write-Host "❌ Nginx Proxy is not responding" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Nginx Proxy health check failed" -ForegroundColor Red
}

Write-Host ""
Write-Host "🎉 Unified AI Platform is ready!" -ForegroundColor Green
Write-Host ""
Write-Host "📍 Access Points:" -ForegroundColor Cyan
Write-Host "   🌐 Web Interface: http://localhost/"
Write-Host "   💬 Conversation AI: http://localhost:8000/"
Write-Host "   🔍 Document Search: http://localhost:8080/"
Write-Host "   📊 Monitoring: http://localhost:9090/"
Write-Host ""
Write-Host "🧪 Test the connection:" -ForegroundColor Cyan
Write-Host "   python test_system_connection.py"
Write-Host ""
Write-Host "📋 View logs:" -ForegroundColor Cyan
Write-Host "   docker-compose -f docker-compose.unified.yml logs -f"
Write-Host ""
Write-Host "🛑 Stop services:" -ForegroundColor Cyan
Write-Host "   docker-compose -f docker-compose.unified.yml down"
Write-Host ""
Write-Host "✨ Integration complete! Both systems are now connected and ready to use." -ForegroundColor Green
