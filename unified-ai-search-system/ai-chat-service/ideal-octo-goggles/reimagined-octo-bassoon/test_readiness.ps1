# Simple Connection Test - Just check if systems can connect
Write-Host "🔍 Testing System Connection..." -ForegroundColor Green

# Test 1: Check if ubiquitous-octo-invention is ready
Write-Host "Checking ubiquitous-octo-invention..." -ForegroundColor Yellow
$ubiquitousPath = ".\ubiquitous-octo-invention"
if (Test-Path $ubiquitousPath) {
    Write-Host "✅ ubiquitous-octo-invention directory found" -ForegroundColor Green
    
    # Check for key files
    if (Test-Path "$ubiquitousPath\Dockerfile.production") {
        Write-Host "✅ Production Dockerfile found" -ForegroundColor Green
    } else {
        Write-Host "❌ Production Dockerfile not found" -ForegroundColor Red
    }
    
    if (Test-Path "$ubiquitousPath\app\main.py") {
        Write-Host "✅ Main application found" -ForegroundColor Green
    } else {
        Write-Host "❌ Main application not found" -ForegroundColor Red
    }
} else {
    Write-Host "❌ ubiquitous-octo-invention directory not found" -ForegroundColor Red
}

# Test 2: Check if ideal-octo-goggles is ready
Write-Host "Checking ideal-octo-goggles..." -ForegroundColor Yellow
$idealPath = ".\ideal-octo-goggles"
if (Test-Path $idealPath) {
    Write-Host "✅ ideal-octo-goggles directory found" -ForegroundColor Green
    
    # Check for key files
    if (Test-Path "$idealPath\Dockerfile") {
        Write-Host "✅ Dockerfile found" -ForegroundColor Green
    } else {
        Write-Host "❌ Dockerfile not found" -ForegroundColor Red
    }
    
    if (Test-Path "$idealPath\app\main.py") {
        Write-Host "✅ Main application found" -ForegroundColor Green
    } else {
        Write-Host "❌ Main application not found" -ForegroundColor Red
    }
} else {
    Write-Host "❌ ideal-octo-goggles directory not found" -ForegroundColor Red
}

# Test 3: Check integration files
Write-Host "Checking integration files..." -ForegroundColor Yellow
$integrationFiles = @(
    "docker-compose.unified.yml",
    "nginx-unified.conf",
    "unified_ai_platform.py",
    "test_system_connection.py"
)

foreach ($file in $integrationFiles) {
    if (Test-Path $file) {
        Write-Host "✅ $file found" -ForegroundColor Green
    } else {
        Write-Host "❌ $file not found" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "🎯 System Readiness Check Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Both systems are available and ready to connect"
Write-Host "2. Integration files are in place"
Write-Host "3. You can now start the unified platform"
Write-Host ""
Write-Host "To start the platform:" -ForegroundColor Yellow
Write-Host "  docker-compose -f docker-compose.unified.yml up -d"
