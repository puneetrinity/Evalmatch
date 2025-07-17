# Docker Unified AI System Setup Script
# Run this script to build and deploy the unified AI system locally

param(
    [string]$Action = "start",
    [switch]$Build = $false,
    [switch]$Clean = $false,
    [switch]$Logs = $false
)

$ErrorActionPreference = "Stop"

Write-Host "=== Unified AI System Docker Manager ===" -ForegroundColor Cyan
Write-Host "Action: $Action" -ForegroundColor Yellow

# Check if Docker is running
try {
    docker version | Out-Null
    Write-Host "✓ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

# Check if docker-compose file exists
if (!(Test-Path "docker-compose.unified.yml")) {
    Write-Host "✗ docker-compose.unified.yml not found in current directory" -ForegroundColor Red
    exit 1
}

# Check if ideal-octo-goggles exists
if (!(Test-Path "../ideal-octo-goggles")) {
    Write-Host "⚠ ideal-octo-goggles not found at ../ideal-octo-goggles" -ForegroundColor Yellow
    Write-Host "Make sure both repositories are in the same parent directory" -ForegroundColor Yellow
}

switch ($Action.ToLower()) {
    "start" {
        Write-Host "Starting unified AI system..." -ForegroundColor Green
        
        if ($Build) {
            Write-Host "Building containers..." -ForegroundColor Yellow
            docker-compose -f docker-compose.unified.yml build
        }
        
        Write-Host "Starting services..." -ForegroundColor Yellow
        docker-compose -f docker-compose.unified.yml up -d
        
        Write-Host "Waiting for services to be ready..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
        
        # Check health
        try {
            Invoke-RestMethod -Uri "http://localhost:8000/health" -TimeoutSec 30 | Out-Null
            Write-Host "✓ Main service is healthy" -ForegroundColor Green
        } catch {
            Write-Host "⚠ Main service health check failed" -ForegroundColor Yellow
        }
        
        try {
            Invoke-RestMethod -Uri "http://localhost:8001/health" -TimeoutSec 30 | Out-Null
            Write-Host "✓ Search service is healthy" -ForegroundColor Green
        } catch {
            Write-Host "⚠ Search service health check failed" -ForegroundColor Yellow
        }
        
        Write-Host "`n=== Services Ready ===" -ForegroundColor Cyan
        Write-Host "Main Chat UI: http://localhost:8000" -ForegroundColor White
        Write-Host "Unified Chat: http://localhost:8000/chat" -ForegroundColor White
        Write-Host "Search API:   http://localhost:8001" -ForegroundColor White
        Write-Host "Health Check: http://localhost:8000/health" -ForegroundColor White
        
        if ($Logs) {
            Write-Host "`nShowing logs (Ctrl+C to exit)..." -ForegroundColor Yellow
            docker-compose -f docker-compose.unified.yml logs -f
        }
    }
    
    "stop" {
        Write-Host "Stopping unified AI system..." -ForegroundColor Red
        docker-compose -f docker-compose.unified.yml down
        Write-Host "✓ Services stopped" -ForegroundColor Green
    }
    
    "restart" {
        Write-Host "Restarting unified AI system..." -ForegroundColor Yellow
        docker-compose -f docker-compose.unified.yml restart
        Write-Host "✓ Services restarted" -ForegroundColor Green
    }
    
    "status" {
        Write-Host "Service Status:" -ForegroundColor Cyan
        docker-compose -f docker-compose.unified.yml ps
        
        Write-Host "`nContainer Logs (last 20 lines):" -ForegroundColor Cyan
        docker-compose -f docker-compose.unified.yml logs --tail=20
    }
    
    "logs" {
        Write-Host "Showing service logs (Ctrl+C to exit)..." -ForegroundColor Yellow
        docker-compose -f docker-compose.unified.yml logs -f
    }
    
    "build" {
        Write-Host "Building containers..." -ForegroundColor Yellow
        docker-compose -f docker-compose.unified.yml build --no-cache
        Write-Host "✓ Containers built" -ForegroundColor Green
    }
    
    "clean" {
        Write-Host "Cleaning up Docker resources..." -ForegroundColor Red
        docker-compose -f docker-compose.unified.yml down -v --rmi all
        docker system prune -f
        Write-Host "✓ Cleanup complete" -ForegroundColor Green
    }
    
    "shell" {
        Write-Host "Opening shell in unified-ai-system container..." -ForegroundColor Yellow
        docker-compose -f docker-compose.unified.yml exec unified-ai-system bash
    }
    
    default {
        Write-Host "Usage: .\setup-docker.ps1 [action] [options]" -ForegroundColor White
        Write-Host ""
        Write-Host "Actions:" -ForegroundColor Cyan
        Write-Host "  start     - Start the unified AI system (default)" -ForegroundColor White
        Write-Host "  stop      - Stop all services" -ForegroundColor White
        Write-Host "  restart   - Restart all services" -ForegroundColor White
        Write-Host "  status    - Show service status and logs" -ForegroundColor White
        Write-Host "  logs      - Follow service logs" -ForegroundColor White
        Write-Host "  build     - Build containers" -ForegroundColor White
        Write-Host "  clean     - Clean up all Docker resources" -ForegroundColor White
        Write-Host "  shell     - Open shell in container" -ForegroundColor White
        Write-Host ""
        Write-Host "Options:" -ForegroundColor Cyan
        Write-Host "  -Build    - Build containers before starting" -ForegroundColor White
        Write-Host "  -Clean    - Clean up before action" -ForegroundColor White
        Write-Host "  -Logs     - Show logs after starting" -ForegroundColor White
        Write-Host ""
        Write-Host "Examples:" -ForegroundColor Cyan
        Write-Host "  .\setup-docker.ps1 start -Build -Logs" -ForegroundColor White
        Write-Host "  .\setup-docker.ps1 stop" -ForegroundColor White
        Write-Host "  .\setup-docker.ps1 clean" -ForegroundColor White
    }
}
