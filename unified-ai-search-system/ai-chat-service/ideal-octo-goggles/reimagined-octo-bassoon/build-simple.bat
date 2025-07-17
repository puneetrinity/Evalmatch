@echo off
echo 🐳 Building Unified AI Platform...
echo ==================================

echo Step 1: Cleaning up...
docker-compose -f docker-compose.simple.yml down --remove-orphans
docker system prune -f

echo Step 2: Building conversation AI...
cd ubiquitous-octo-invention
docker build -f Dockerfile.simple -t conversation-ai:latest .
if %ERRORLEVEL% equ 0 (
    echo ✅ Conversation AI built successfully
) else (
    echo ❌ Failed to build Conversation AI
    exit /b 1
)
cd ..

echo Step 3: Building document search...
cd ideal-octo-goggles
docker build -f Dockerfile.simple -t document-search:latest .
if %ERRORLEVEL% equ 0 (
    echo ✅ Document Search built successfully
) else (
    echo ❌ Failed to build Document Search
    exit /b 1
)
cd ..

echo Step 4: Starting services...
docker-compose -f docker-compose.simple.yml up -d

echo Step 5: Waiting for services...
timeout /t 30 /nobreak

echo Step 6: Testing services...
echo Testing Redis...
docker exec ai-redis redis-cli ping

echo Testing services with curl...
curl -s http://localhost:8000/health/live
curl -s http://localhost:8080/api/v2/health
curl -s http://localhost/status

echo.
echo 🎉 Build complete!
echo Access points:
echo   🌐 Main: http://localhost/
echo   💬 Chat: http://localhost:8000/
echo   🔍 Search: http://localhost:8080/
echo.
echo View logs: docker-compose -f docker-compose.simple.yml logs -f
echo Stop: docker-compose -f docker-compose.simple.yml down
