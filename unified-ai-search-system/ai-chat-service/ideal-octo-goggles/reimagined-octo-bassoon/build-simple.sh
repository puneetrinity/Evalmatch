echo "🐳 Building Unified AI Platform..."
echo "=================================="

echo "Step 1: Cleaning up..."
docker-compose -f docker-compose.simple.yml down --remove-orphans
docker system prune -f

echo "Step 2: Building conversation AI..."
cd ubiquitous-octo-invention
docker build -f Dockerfile.simple -t conversation-ai:latest .
if [ $? -eq 0 ]; then
    echo "✅ Conversation AI built successfully"
else
    echo "❌ Failed to build Conversation AI"
    exit 1
fi
cd ..

echo "Step 3: Building document search..."
cd ideal-octo-goggles
docker build -f Dockerfile.simple -t document-search:latest .
if [ $? -eq 0 ]; then
    echo "✅ Document Search built successfully"
else
    echo "❌ Failed to build Document Search"
    exit 1
fi
cd ..

echo "Step 4: Starting services..."
docker-compose -f docker-compose.simple.yml up -d

echo "Step 5: Waiting for services..."
sleep 30

echo "Step 6: Testing services..."
echo "Testing Redis..."
docker exec ai-redis redis-cli ping

echo "Testing Conversation AI..."
curl -s http://localhost:8000/health/live || echo "Conversation AI not ready yet"

echo "Testing Document Search..."
curl -s http://localhost:8080/api/v2/health || echo "Document Search not ready yet"

echo "Testing Nginx..."
curl -s http://localhost/status || echo "Nginx not ready yet"

echo ""
echo "🎉 Build complete!"
echo "Access points:"
echo "  🌐 Main: http://localhost/"
echo "  💬 Chat: http://localhost:8000/"
echo "  🔍 Search: http://localhost:8080/"
echo ""
echo "View logs: docker-compose -f docker-compose.simple.yml logs -f"
echo "Stop: docker-compose -f docker-compose.simple.yml down"
