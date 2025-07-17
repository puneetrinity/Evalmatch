# Ultra Fast Search System - PowerShell Setup Script

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Ultra Fast Search System - Setup Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if a command exists
function Test-Command($cmdname) {
    return [bool](Get-Command -Name $cmdname -ErrorAction SilentlyContinue)
}

# Function to wait for URL to respond
function Wait-ForUrl($url, $timeoutSeconds = 30) {
    $elapsed = 0
    do {
        try {
            Invoke-RestMethod -Uri $url -TimeoutSec 5 | Out-Null
            return $true
        }
        catch {
            Start-Sleep -Seconds 2
            $elapsed += 2
        }
    } while ($elapsed -lt $timeoutSeconds)
    return $false
}

try {
    # Check Docker installation
    Write-Host "[1/6] Checking Docker installation..." -ForegroundColor Yellow
    if (-not (Test-Command "docker")) {
        throw "Docker is not installed or not in PATH. Please install Docker Desktop from https://www.docker.com/get-started"
    }
    
    # Test if Docker daemon is running
    docker version | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker is installed but not running. Please start Docker Desktop."
    }
    Write-Host "✓ Docker found and running" -ForegroundColor Green

    # Check Docker Compose
    Write-Host "[2/6] Checking Docker Compose..." -ForegroundColor Yellow
    if (-not (Test-Command "docker-compose")) {
        throw "Docker Compose is not available. Please ensure Docker Desktop is properly installed."
    }
    Write-Host "✓ Docker Compose found" -ForegroundColor Green

    # Create .env file
    Write-Host "[3/6] Setting up environment configuration..." -ForegroundColor Yellow
    if (-not (Test-Path ".env")) {
        if (Test-Path ".env.example") {
            Copy-Item ".env.example" ".env"
            Write-Host "✓ Created .env file from template" -ForegroundColor Green
        }
        else {
            throw ".env.example file not found"
        }
    }
    else {
        Write-Host "✓ .env file already exists" -ForegroundColor Green
    }

    # Build and start the system
    Write-Host "[4/6] Building and starting the system..." -ForegroundColor Yellow
    Write-Host "This may take several minutes on first run..." -ForegroundColor Gray
    
    $process = Start-Process -FilePath "docker-compose" -ArgumentList "up", "--build", "-d" -Wait -PassThru -NoNewWindow
    if ($process.ExitCode -ne 0) {
        throw "Failed to start the system. Check logs with: docker-compose logs"
    }
    Write-Host "✓ System started successfully" -ForegroundColor Green

    # Wait for system to be ready
    Write-Host "[5/6] Waiting for system to be ready..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
    
    if (Wait-ForUrl "http://localhost/api/v2/health" 30) {
        Write-Host "✓ System is responding" -ForegroundColor Green
    }
    else {
        Write-Host "⚠ System may still be starting up" -ForegroundColor Yellow
        Write-Host "You can check status with: docker-compose logs app" -ForegroundColor Gray
    }

    # Build indexes
    Write-Host "[6/6] Building search indexes..." -ForegroundColor Yellow
    Write-Host "This will process the sample data and may take 1-2 minutes..." -ForegroundColor Gray
    
    try {
        $body = '{"data_source": "data/resumes.json"}'
        $response = Invoke-RestMethod -Uri "http://localhost/api/v2/admin/build-indexes" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 120
        Write-Host "✓ Indexes built successfully" -ForegroundColor Green
        Write-Host "Documents processed: $($response.documents_processed)" -ForegroundColor Gray
        Write-Host "Processing time: $($response.processing_time)" -ForegroundColor Gray
    }
    catch {
        Write-Host "⚠ Failed to build indexes automatically" -ForegroundColor Yellow
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "You can try building indexes manually later with:" -ForegroundColor Gray
        Write-Host 'curl -X POST -H "Content-Type: application/json" -d "{\"data_source\": \"data/resumes.json\"}" http://localhost/api/v2/admin/build-indexes' -ForegroundColor Gray
    }

    # Success message
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "🎉 SETUP COMPLETE!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your Ultra Fast Search System is now running!" -ForegroundColor White
    Write-Host ""
    Write-Host "Quick Test:" -ForegroundColor Cyan
    Write-Host '  Invoke-RestMethod -Uri "http://localhost/api/v2/search/ultra-fast" -Method POST -ContentType "application/json" -Body ''{"query": "python developer"}''' -ForegroundColor Gray
    Write-Host ""
    Write-Host "Web Interfaces:" -ForegroundColor Cyan
    Write-Host "  • API Documentation: http://localhost/docs" -ForegroundColor Gray
    Write-Host "  • Health Check: http://localhost/api/v2/health" -ForegroundColor Gray
    Write-Host "  • System Metrics: http://localhost/api/v2/metrics" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To stop the system:" -ForegroundColor Cyan
    Write-Host "  docker-compose down" -ForegroundColor Gray
    Write-Host ""
    Write-Host "For help and troubleshooting, see QUICK_START_GUIDE.md" -ForegroundColor Gray
}
catch {
    Write-Host ""
    Write-Host "❌ SETUP FAILED!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please check the following:" -ForegroundColor Yellow
    Write-Host "1. Docker Desktop is installed and running" -ForegroundColor Gray
    Write-Host "2. You have internet access for downloading packages" -ForegroundColor Gray
    Write-Host "3. Ports 80 and 8000 are not in use by other applications" -ForegroundColor Gray
    Write-Host ""
    Write-Host "For detailed troubleshooting, see QUICK_START_GUIDE.md" -ForegroundColor Gray
    exit 1
}

Write-Host ""
Write-Host "Press any key to continue..." -ForegroundColor Gray
$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") | Out-Null
