# Integration Setup Script for Ultra Fast Search + ubiquitous-octo-invention
# This script sets up the integrated environment

Write-Host "🚀 Setting up Integrated AI + Search System..." -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if a command exists
function Test-Command($cmdname) {
    return [bool](Get-Command -Name $cmdname -ErrorAction SilentlyContinue)
}

# Function to wait for service to be ready
function Wait-ForService($url, $timeoutSeconds = 60) {
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
    # Step 1: Verify prerequisites
    Write-Host "[1/8] Checking prerequisites..." -ForegroundColor Yellow
    
    if (-not (Test-Command "docker")) {
        throw "Docker is not installed. Please install Docker Desktop."
    }
    
    if (-not (Test-Command "docker-compose")) {
        throw "Docker Compose is not available."
    }
    
    if (-not (Test-Path "..\ubiquitous-octo-invention")) {
        throw "ubiquitous-octo-invention directory not found. Please clone it first."
    }
    
    Write-Host "✓ Prerequisites verified" -ForegroundColor Green

    # Step 2: Create environment file for AI system
    Write-Host "[2/8] Setting up environment configuration..." -ForegroundColor Yellow
    
    $envContent = @"
# AI System Configuration
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
REDIS_URL=redis://redis:6379
DATABASE_URL=postgresql://ai_user:ai_password@postgres:5432/ai_system
ULTRA_FAST_SEARCH_URL=http://ultra-fast-nginx:80

# Ultra Fast Search Integration
SEARCH_SERVICE_ENABLED=true
SEARCH_PROVIDER=ultra_fast_search
SEARCH_TIMEOUT=30

# Logging
LOG_LEVEL=INFO
"@
    
    if (-not (Test-Path "..\ubiquitous-octo-invention\.env")) {
        $envContent | Out-File -FilePath "..\ubiquitous-octo-invention\.env" -Encoding utf8
        Write-Host "✓ Created environment file for AI system" -ForegroundColor Green
    } else {
        Write-Host "✓ Environment file already exists" -ForegroundColor Green
    }

    # Step 3: Copy integration files
    Write-Host "[3/8] Copying integration files..." -ForegroundColor Yellow
    
    # Create directories in the AI system
    $integrationPath = "..\ubiquitous-octo-invention\app\providers\search"
    if (-not (Test-Path $integrationPath)) {
        New-Item -ItemType Directory -Path $integrationPath -Force | Out-Null
    }
    
    # Copy integration files
    Copy-Item "integration\ultra_fast_search_provider.py" "$integrationPath\" -Force
    Copy-Item "integration\langgraph_search_node.py" "$integrationPath\" -Force
    
    # Create __init__.py
    @"
from .ultra_fast_search_provider import UltraFastSearchProvider, create_search_provider
from .langgraph_search_node import UltraFastSearchNode, create_search_graph, extract_search_intent

__all__ = [
    'UltraFastSearchProvider',
    'create_search_provider', 
    'UltraFastSearchNode',
    'create_search_graph',
    'extract_search_intent'
]
"@ | Out-File -FilePath "$integrationPath\__init__.py" -Encoding utf8
    
    Write-Host "✓ Integration files copied" -ForegroundColor Green

    # Step 4: Start Ultra Fast Search System first
    Write-Host "[4/8] Starting Ultra Fast Search System..." -ForegroundColor Yellow
    
    $searchProcess = Start-Process -FilePath "docker-compose" -ArgumentList "up", "-d", "--build" -Wait -PassThru -NoNewWindow
    if ($searchProcess.ExitCode -ne 0) {
        throw "Failed to start Ultra Fast Search System"
    }
    
    Write-Host "✓ Ultra Fast Search System started" -ForegroundColor Green

    # Step 5: Wait for search system to be ready
    Write-Host "[5/8] Waiting for search system to be ready..." -ForegroundColor Yellow
    
    if (Wait-ForService "http://localhost/api/v2/health" 60) {
        Write-Host "✓ Ultra Fast Search System is ready" -ForegroundColor Green
    } else {
        Write-Host "⚠ Search system may still be starting" -ForegroundColor Yellow
    }

    # Step 6: Build search indexes
    Write-Host "[6/8] Building search indexes..." -ForegroundColor Yellow
    
    try {
        $buildBody = '{"data_source": "data/resumes.json"}'
        $response = Invoke-RestMethod -Uri "http://localhost/api/v2/admin/build-indexes" -Method POST -ContentType "application/json" -Body $buildBody -TimeoutSec 120
        Write-Host "✓ Search indexes built successfully" -ForegroundColor Green
        Write-Host "  Documents processed: $($response.documents_processed)" -ForegroundColor Gray
    } catch {
        Write-Host "⚠ Index building failed, but continuing..." -ForegroundColor Yellow
    }

    # Step 7: Start integrated system
    Write-Host "[7/8] Starting integrated AI system..." -ForegroundColor Yellow
    
    Set-Location ".."
    
    $integratedProcess = Start-Process -FilePath "docker-compose" -ArgumentList "-f", "ultra_fast_search_system\integration\docker-compose.integrated.yml", "up", "-d", "--build" -Wait -PassThru -NoNewWindow
    if ($integratedProcess.ExitCode -ne 0) {
        Write-Host "⚠ Some services may have failed to start" -ForegroundColor Yellow
    } else {
        Write-Host "✓ Integrated system started" -ForegroundColor Green
    }

    # Step 8: Verify integration
    Write-Host "[8/8] Verifying integration..." -ForegroundColor Yellow
    
    $services = @(
        @{ Name = "Ultra Fast Search"; Url = "http://localhost:8081/api/v2/health"; Port = "8081" },
        @{ Name = "AI System"; Url = "http://localhost:8000/health"; Port = "8000" },
        @{ Name = "Redis"; Url = "redis://localhost:6379"; Port = "6379" }
    )
    
    foreach ($service in $services) {
        if ($service.Name -eq "Redis") {
            # Skip Redis HTTP check
            Write-Host "✓ $($service.Name) (assumed running on port $($service.Port))" -ForegroundColor Green
        } else {
            if (Wait-ForService $service.Url 30) {
                Write-Host "✓ $($service.Name) is responding" -ForegroundColor Green
            } else {
                Write-Host "⚠ $($service.Name) may still be starting" -ForegroundColor Yellow
            }
        }
    }

    # Success message
    Write-Host ""
    Write-Host "🎉 INTEGRATION SETUP COMPLETE!" -ForegroundColor Green
    Write-Host "=============================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Services Running:" -ForegroundColor Cyan
    Write-Host "• Ultra Fast Search: http://localhost:8081" -ForegroundColor Gray
    Write-Host "• AI Chat System: http://localhost:8000" -ForegroundColor Gray
    Write-Host "• Search API Docs: http://localhost:8081/docs" -ForegroundColor Gray
    Write-Host "• AI API Docs: http://localhost:8000/docs" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Test Integration:" -ForegroundColor Cyan
    Write-Host 'Invoke-RestMethod -Uri "http://localhost:8000/api/v1/chat" -Method POST -ContentType "application/json" -Body ''{"query": "find python developers"}''' -ForegroundColor Gray
    Write-Host ""
    Write-Host "Monitor Services:" -ForegroundColor Cyan
    Write-Host "docker-compose -f ultra_fast_search_system\integration\docker-compose.integrated.yml logs -f" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Stop Services:" -ForegroundColor Cyan
    Write-Host "docker-compose -f ultra_fast_search_system\integration\docker-compose.integrated.yml down" -ForegroundColor Gray

} catch {
    Write-Host ""
    Write-Host "❌ INTEGRATION SETUP FAILED!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Ensure both repositories are cloned in the same parent directory" -ForegroundColor Gray
    Write-Host "2. Check Docker is running: docker ps" -ForegroundColor Gray
    Write-Host "3. Check logs: docker-compose logs" -ForegroundColor Gray
    Write-Host "4. Verify ports are not in use: netstat -ano | findstr :8000" -ForegroundColor Gray
    exit 1
}

Write-Host ""
Write-Host "Press any key to continue..." -ForegroundColor Gray
$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") | Out-Null
