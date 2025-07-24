#!/bin/bash

# Railway deployment start script
echo "🚄 Starting Railway deployment..."

# Set NODE_ENV to production
export NODE_ENV=production

# Check if we're running in Railway
if [ "$RAILWAY_ENVIRONMENT" ]; then
    echo "✅ Running in Railway environment: $RAILWAY_ENVIRONMENT"
    echo "🔗 Railway service: $RAILWAY_SERVICE_NAME"
    
    # Use Railway provided PORT or default to 3000
    export PORT=${PORT:-3000}
    echo "🌐 Server will start on port: $PORT"
    
    # Run database migration if needed
    if [ "$DATABASE_URL" ]; then
        echo "📊 Database URL configured, running migration..."
        npm run db:push 2>/dev/null || echo "⚠️ Database migration skipped (likely memory storage)"
    fi
else
    echo "⚠️ Not running in Railway environment"
fi

# Start the application
echo "🚀 Starting application..."
npm start