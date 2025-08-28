#!/bin/bash

echo "🐳 Evalmatch Docker Testing Setup"
echo "================================"

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "📝 Creating .env from template..."
    cp .env.docker .env
    echo "✅ Created .env file - Please edit it with your Firebase credentials"
    echo ""
    echo "Required steps:"
    echo "1. Edit .env and add your FIREBASE_SERVICE_ACCOUNT_KEY"
    echo "2. Verify all VITE_FIREBASE_* variables are correct"
    echo "3. Add your GROQ_API_KEY"
    echo "4. Run this script again"
    exit 1
fi

# Check for required environment variables
source .env
if [ -z "$FIREBASE_SERVICE_ACCOUNT_KEY" ] || [ "$FIREBASE_SERVICE_ACCOUNT_KEY" == '{"type":"service_account","project_id":"ealmatch-railway"...}' ]; then
    echo "❌ FIREBASE_SERVICE_ACCOUNT_KEY not configured in .env"
    echo "Please add your complete Firebase service account JSON"
    exit 1
fi

if [ -z "$GROQ_API_KEY" ] || [ "$GROQ_API_KEY" == "your_groq_api_key_here" ]; then
    echo "❌ GROQ_API_KEY not configured in .env"
    echo "Please add your Groq API key"
    exit 1
fi

echo "✅ Environment variables configured"
echo ""

# Choose mode
echo "Select testing mode:"
echo "1) Production build (docker-compose.yml)"
echo "2) Development with hot reload (docker-compose.dev.yml)"
echo -n "Enter choice [1-2]: "
read choice

case $choice in
    1)
        echo "🏗️  Building production Docker image..."
        docker-compose build
        echo ""
        echo "🚀 Starting production server..."
        docker-compose up
        ;;
    2)
        echo "🔧 Starting development server..."
        docker-compose -f docker-compose.dev.yml up
        ;;
    *)
        echo "Invalid choice. Exiting."
        exit 1
        ;;
esac