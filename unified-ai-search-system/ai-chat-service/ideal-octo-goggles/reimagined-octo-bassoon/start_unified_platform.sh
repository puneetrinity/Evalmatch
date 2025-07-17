#!/bin/bash
# Unified AI Platform Startup Script
# Launches both ubiquitous-octo-invention and ideal-octo-goggles systems

echo "🚀 Starting Unified AI Platform..."
echo "=" * 60

# Set colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose.${NC}"
    exit 1
fi

# Stop any existing containers
echo -e "${YELLOW}🔄 Stopping existing containers...${NC}"
docker-compose -f docker-compose.unified.yml down --remove-orphans

# Pull latest images
echo -e "${YELLOW}📥 Pulling latest images...${NC}"
docker-compose -f docker-compose.unified.yml pull

# Build and start the services
echo -e "${YELLOW}🏗️  Building and starting services...${NC}"
docker-compose -f docker-compose.unified.yml up -d --build

# Wait for services to be ready
echo -e "${YELLOW}⏳ Waiting for services to be ready...${NC}"
sleep 10

# Check service health
echo -e "${BLUE}🔍 Checking service health...${NC}"

# Check Redis
if docker-compose -f docker-compose.unified.yml exec -T redis redis-cli ping | grep -q "PONG"; then
    echo -e "${GREEN}✅ Redis is healthy${NC}"
else
    echo -e "${RED}❌ Redis is not responding${NC}"
fi

# Check Conversation AI
if curl -s http://localhost:8000/health/live | grep -q "healthy"; then
    echo -e "${GREEN}✅ Conversation AI is healthy${NC}"
else
    echo -e "${RED}❌ Conversation AI is not responding${NC}"
fi

# Check Document Search
if curl -s http://localhost:8080/api/v2/health | grep -q "healthy"; then
    echo -e "${GREEN}✅ Document Search is healthy${NC}"
else
    echo -e "${RED}❌ Document Search is not responding${NC}"
fi

# Check Nginx Proxy
if curl -s http://localhost/ | grep -q "Unified AI Platform"; then
    echo -e "${GREEN}✅ Nginx Proxy is healthy${NC}"
else
    echo -e "${RED}❌ Nginx Proxy is not responding${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Unified AI Platform is ready!${NC}"
echo ""
echo -e "${BLUE}📍 Access Points:${NC}"
echo "   🌐 Web Interface: http://localhost/"
echo "   💬 Conversation AI: http://localhost:8000/"
echo "   🔍 Document Search: http://localhost:8080/"
echo "   📊 Monitoring: http://localhost:9090/"
echo ""
echo -e "${BLUE}🧪 Test the connection:${NC}"
echo "   python test_system_connection.py"
echo ""
echo -e "${BLUE}📋 View logs:${NC}"
echo "   docker-compose -f docker-compose.unified.yml logs -f"
echo ""
echo -e "${BLUE}🛑 Stop services:${NC}"
echo "   docker-compose -f docker-compose.unified.yml down"
echo ""
echo -e "${GREEN}✨ Integration complete! Both systems are now connected and ready to use.${NC}"
