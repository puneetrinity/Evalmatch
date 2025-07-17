#!/bin/bash

# Deploy ideal-octo-goggles to Fly.io
echo "🚀 Starting Fly.io deployment for ideal-octo-goggles..."

# Check if fly CLI is installed
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not found. Please install it first:"
    echo "curl -L https://fly.io/install.sh | sh"
    exit 1
fi

# Check if logged in to Fly.io
if ! fly auth whoami &> /dev/null; then
    echo "🔐 Please log in to Fly.io first:"
    echo "fly auth login"
    exit 1
fi

# Create volume for persistent storage
echo "📦 Creating persistent volume for search data..."
fly volumes create search_data --region iad --size 1 || echo "Volume may already exist"

# Deploy the application
echo "🚀 Deploying to Fly.io..."
fly deploy --local-only

# Check app status
echo "📊 Checking deployment status..."
fly status

# Show logs
echo "📝 Recent logs:"
fly logs

echo "✅ Deployment complete!"
echo "🌐 Your app should be available at: https://ideal-octo-goggles.fly.dev"