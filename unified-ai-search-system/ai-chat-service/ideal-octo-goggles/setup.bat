@echo off
echo ========================================
echo Ultra Fast Search System - Setup Script
echo ========================================
echo.

:: Check if Docker is running
echo [1/6] Checking Docker installation...
docker --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not installed or not running.
    echo Please install Docker Desktop from https://www.docker.com/get-started
    pause
    exit /b 1
)
echo ✓ Docker found

:: Check if docker-compose is available
echo [2/6] Checking Docker Compose...
docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker Compose is not available.
    echo Please ensure Docker Desktop is properly installed.
    pause
    exit /b 1
)
echo ✓ Docker Compose found

:: Create .env file if it doesn't exist
echo [3/6] Setting up environment configuration...
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo ✓ Created .env file from template
    ) else (
        echo ERROR: .env.example file not found
        pause
        exit /b 1
    )
) else (
    echo ✓ .env file already exists
)

:: Build and start the system
echo [4/6] Building and starting the system...
echo This may take several minutes on first run...
docker-compose up --build -d
if errorlevel 1 (
    echo ERROR: Failed to start the system
    echo Check the logs with: docker-compose logs
    pause
    exit /b 1
)
echo ✓ System started successfully

:: Wait for the system to be ready
echo [5/6] Waiting for system to be ready...
timeout /t 10 /nobreak >nul

:: Check if the system is responding
powershell -Command "try { Invoke-RestMethod -Uri 'http://localhost/api/v2/health' -TimeoutSec 5 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
    echo WARNING: System may still be starting up
    echo You can check status with: docker-compose logs app
) else (
    echo ✓ System is responding
)

:: Build indexes
echo [6/6] Building search indexes...
echo This will process the sample data and may take 1-2 minutes...

powershell -Command "try { $response = Invoke-RestMethod -Uri 'http://localhost/api/v2/admin/build-indexes' -Method POST -ContentType 'application/json' -Body '{\"data_source\": \"data/resumes.json\"}' -TimeoutSec 120; Write-Host '✓ Indexes built successfully'; Write-Host \"Documents processed: $($response.documents_processed)\"; Write-Host \"Processing time: $($response.processing_time)\" } catch { Write-Host 'ERROR: Failed to build indexes'; Write-Host $_.Exception.Message; exit 1 }"

if errorlevel 1 (
    echo.
    echo You can try building indexes manually later with:
    echo curl -X POST -H "Content-Type: application/json" -d "{\"data_source\": \"data/resumes.json\"}" http://localhost/api/v2/admin/build-indexes
)

echo.
echo ========================================
echo 🎉 SETUP COMPLETE!
echo ========================================
echo.
echo Your Ultra Fast Search System is now running!
echo.
echo Quick Test:
echo   powershell -Command "Invoke-RestMethod -Uri 'http://localhost/api/v2/search/ultra-fast' -Method POST -ContentType 'application/json' -Body '{\"query\": \"python developer\"}'"
echo.
echo Web Interfaces:
echo   • API Documentation: http://localhost/docs
echo   • Health Check: http://localhost/api/v2/health
echo   • System Metrics: http://localhost/api/v2/metrics
echo.
echo To stop the system:
echo   docker-compose down
echo.
echo For help and troubleshooting, see QUICK_START_GUIDE.md
echo.
pause
