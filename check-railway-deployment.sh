#!/bin/bash

# Railway deployment status checker
echo "🚄 Checking Railway Deployment Status..."
echo "======================================="

# Replace with your actual Railway app URL
RAILWAY_URL="https://evalmatch.up.railway.app"

# Health check
echo -n "✅ Health Check: "
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$RAILWAY_URL/api/health")
if [ "$HEALTH_STATUS" = "200" ]; then
    echo "PASS (HTTP $HEALTH_STATUS)"
else
    echo "FAIL (HTTP $HEALTH_STATUS)"
fi

# Debug endpoint
echo -n "🔍 Debug Endpoint: "
DEBUG_RESPONSE=$(curl -s "$RAILWAY_URL/api/debug")
if [ ! -z "$DEBUG_RESPONSE" ]; then
    echo "ACCESSIBLE"
    echo ""
    echo "Debug Information:"
    echo "$DEBUG_RESPONSE" | jq '.' 2>/dev/null || echo "$DEBUG_RESPONSE"
else
    echo "NOT ACCESSIBLE"
fi

# Database status
echo ""
echo -n "💾 Database Status: "
DB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$RAILWAY_URL/api/db-status")
if [ "$DB_STATUS" = "200" ]; then
    echo "CONNECTED"
else
    echo "NOT CONNECTED (HTTP $DB_STATUS)"
fi

# Service status
echo -n "🤖 AI Services: "
SERVICE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$RAILWAY_URL/api/service-status")
if [ "$SERVICE_STATUS" = "200" ]; then
    echo "AVAILABLE"
else
    echo "NOT AVAILABLE (HTTP $SERVICE_STATUS)"
fi

echo ""
echo "======================================="
echo "Check complete. Visit your Railway dashboard for detailed logs."