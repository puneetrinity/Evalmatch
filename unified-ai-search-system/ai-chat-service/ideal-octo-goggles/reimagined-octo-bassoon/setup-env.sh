#!/bin/bash
# setup-env.sh
# Quick setup script for environment configuration

echo "🚀 AI Search System - Environment Setup"
echo "======================================="

# Check if .env already exists
if [ -f ".env" ]; then
    echo "✅ .env file already exists"
    echo "   If you need to reconfigure, backup your current .env and run this script again"
else
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env file created from .env.example"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env file and replace placeholder values with your actual API keys:"
    echo "   - BRAVE_API_KEY=your_brave_api_key_here"
    echo "   - SCRAPINGBEE_API_KEY=your_scrapingbee_api_key_here"
fi

echo ""
echo "🐳 Docker Setup:"
echo "   1. Make sure Docker and Docker Compose are installed"
echo "   2. Run: docker-compose up -d"
echo "   3. Wait for services to start (about 30-60 seconds)"
echo "   4. Test: curl http://localhost:8000/health"
echo ""
echo "🔧 Development Setup:"
echo "   1. Create virtual environment: python -m venv venv"
echo "   2. Activate: source venv/bin/activate (Linux/Mac) or venv\\Scripts\\activate (Windows)"
echo "   3. Install dependencies: pip install -r requirements.txt"
echo "   4. Install dev dependencies: pip install -r requirements-dev.txt"
echo ""
echo "📚 API Documentation available at: http://localhost:8000/docs"
echo ""
echo "✨ Setup complete! Happy coding!"