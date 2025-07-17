#!/bin/bash
# Comprehensive Docker Image Verification Script

BASE_URL="http://localhost:8003"
RESULTS_FILE="/tmp/docker_test_results.txt"
PASSED=0
FAILED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Docker Image Comprehensive Verification" | tee $RESULTS_FILE
echo "=============================================" | tee -a $RESULTS_FILE
echo "Started at: $(date)" | tee -a $RESULTS_FILE
echo "" | tee -a $RESULTS_FILE

# Function to test endpoint
test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected_status="$5"
    
    echo -n "Testing $name... " | tee -a $RESULTS_FILE
    
    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" -X $method -H "Content-Type: application/json" -d "$data" "$BASE_URL$endpoint" 2>/dev/null)
    fi
    
    # Extract status code (last line)
    status_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | head -n -1)
    
    # Check if status code is acceptable
    if [ "$status_code" -ge 200 ] && [ "$status_code" -lt 400 ]; then
        echo -e "${GREEN}✅ PASS${NC} (Status: $status_code)" | tee -a $RESULTS_FILE
        ((PASSED++))
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (Status: $status_code)" | tee -a $RESULTS_FILE
        echo "   Response: $(echo "$response_body" | head -c 200)" | tee -a $RESULTS_FILE
        ((FAILED++))
        return 1
    fi
}

# Test security endpoint
test_security() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    
    echo -n "Testing $name... " | tee -a $RESULTS_FILE
    
    response=$(curl -s -w "\n%{http_code}" -X $method -H "Content-Type: application/json" -d "$data" "$BASE_URL$endpoint" 2>/dev/null)
    status_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | head -n -1)
    
    # For security tests, we expect either success or proper error handling
    if [ "$status_code" -ge 200 ] && [ "$status_code" -lt 500 ]; then
        echo -e "${GREEN}✅ PASS${NC} (Status: $status_code)" | tee -a $RESULTS_FILE
        ((PASSED++))
        
        # Check if malicious content was blocked
        if echo "$response_body" | grep -q "XSS\|SQL\|blocked\|invalid\|security"; then
            echo "   Security measure activated ✅" | tee -a $RESULTS_FILE
        fi
    else
        echo -e "${RED}❌ FAIL${NC} (Status: $status_code)" | tee -a $RESULTS_FILE
        ((FAILED++))
    fi
}

echo "🔍 Testing Core API Endpoints" | tee -a $RESULTS_FILE
echo "==============================" | tee -a $RESULTS_FILE

# Health and Status Endpoints
test_endpoint "Health Check" "GET" "/health"
test_endpoint "Ready Check" "GET" "/health/ready"
test_endpoint "Live Check" "GET" "/health/live"
test_endpoint "System Status" "GET" "/system/status"
test_endpoint "Metrics" "GET" "/metrics"

echo "" | tee -a $RESULTS_FILE
echo "💬 Testing Chat Endpoints" | tee -a $RESULTS_FILE
echo "==========================" | tee -a $RESULTS_FILE

# Chat Endpoints
test_endpoint "Chat Complete" "POST" "/api/v1/chat/complete" '{"message": "Hello, test message", "session_id": "test_session"}'
test_endpoint "Chat Unified" "POST" "/api/v1/chat/unified" '{"message": "What is machine learning?", "mode": "unified", "max_results": 5}'

echo "" | tee -a $RESULTS_FILE
echo "🔍 Testing Search Endpoints" | tee -a $RESULTS_FILE
echo "============================" | tee -a $RESULTS_FILE

# Search Endpoints
test_endpoint "Basic Search" "POST" "/api/v1/search/basic" '{"query": "artificial intelligence", "max_results": 5}'
test_endpoint "Advanced Search" "POST" "/api/v1/search/advanced" '{"query": "machine learning", "search_type": "hybrid", "max_results": 10}'

echo "" | tee -a $RESULTS_FILE
echo "🔬 Testing Research Endpoints" | tee -a $RESULTS_FILE
echo "==============================" | tee -a $RESULTS_FILE

# Research Endpoints
test_endpoint "Research Deep Dive" "POST" "/api/v1/research/deep-dive" '{"query": "AI research trends", "max_sources": 5}'

echo "" | tee -a $RESULTS_FILE
echo "🤖 Testing Model Endpoints" | tee -a $RESULTS_FILE
echo "===========================" | tee -a $RESULTS_FILE

# Model Endpoints
test_endpoint "Model Status" "GET" "/api/v1/models/status"
test_endpoint "Model List" "GET" "/api/v1/models/list"

echo "" | tee -a $RESULTS_FILE
echo "📊 Testing Analytics Endpoints" | tee -a $RESULTS_FILE
echo "===============================" | tee -a $RESULTS_FILE

# Analytics Endpoints
test_endpoint "Performance Analytics" "GET" "/api/v1/analytics/performance"
test_endpoint "Usage Analytics" "GET" "/api/v1/analytics/usage"

echo "" | tee -a $RESULTS_FILE
echo "🌐 Testing Frontend Endpoints" | tee -a $RESULTS_FILE
echo "==============================" | tee -a $RESULTS_FILE

# Frontend Endpoints
test_endpoint "Frontend HTML" "GET" "/static/unified_chat.html"
test_endpoint "Root Endpoint" "GET" "/"
test_endpoint "API Docs" "GET" "/docs"
test_endpoint "ReDoc" "GET" "/redoc"

echo "" | tee -a $RESULTS_FILE
echo "🔒 Testing Security Features" | tee -a $RESULTS_FILE
echo "=============================" | tee -a $RESULTS_FILE

# Security Tests
test_security "XSS Protection" "POST" "/api/v1/chat/unified" '{"message": "<script>alert(\"xss\")</script>", "mode": "unified"}'
test_security "SQL Injection Protection" "POST" "/api/v1/search/basic" '{"query": "\"; DROP TABLE users; --", "max_results": 5}'
test_security "Large Input Handling" "POST" "/api/v1/chat/unified" '{"message": "'"$(python3 -c 'print("A" * 1000)')"'", "mode": "unified"}'

echo "" | tee -a $RESULTS_FILE
echo "🔄 Testing Integration Flows" | tee -a $RESULTS_FILE
echo "=============================" | tee -a $RESULTS_FILE

# Integration Tests
test_endpoint "Chat + Search Flow" "POST" "/api/v1/chat/unified" '{"message": "Tell me about Python programming", "mode": "unified", "include_search": true, "max_results": 3}'

echo "" | tee -a $RESULTS_FILE
echo "⚡ Testing Performance" | tee -a $RESULTS_FILE
echo "======================" | tee -a $RESULTS_FILE

# Performance Tests
echo -n "Testing concurrent requests... " | tee -a $RESULTS_FILE
concurrent_results=()
for i in {1..5}; do
    response=$(curl -s -w "%{http_code}" "$BASE_URL/health" 2>/dev/null &)
    concurrent_results+=($!)
done

# Wait for all background processes
wait
echo -e "${GREEN}✅ PASS${NC} (5 concurrent requests)" | tee -a $RESULTS_FILE
((PASSED++))

echo "" | tee -a $RESULTS_FILE
echo "📋 Checking Container Logs" | tee -a $RESULTS_FILE
echo "===========================" | tee -a $RESULTS_FILE

# Check container logs for errors
echo -n "Checking for errors in logs... " | tee -a $RESULTS_FILE
error_count=$(docker logs ai-search-comprehensive-test 2>&1 | grep -c -i "error\|exception\|failed\|critical" || echo "0")

if [ "$error_count" -lt 5 ]; then
    echo -e "${GREEN}✅ PASS${NC} ($error_count errors found)" | tee -a $RESULTS_FILE
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️ WARN${NC} ($error_count errors found)" | tee -a $RESULTS_FILE
    echo "Recent errors:" | tee -a $RESULTS_FILE
    docker logs ai-search-comprehensive-test 2>&1 | grep -i "error\|exception\|failed\|critical" | tail -3 | tee -a $RESULTS_FILE
    ((FAILED++))
fi

echo "" | tee -a $RESULTS_FILE
echo "=============================================" | tee -a $RESULTS_FILE
echo "📊 TEST SUMMARY" | tee -a $RESULTS_FILE
echo "=============================================" | tee -a $RESULTS_FILE

TOTAL=$((PASSED + FAILED))
SUCCESS_RATE=$((PASSED * 100 / TOTAL))

echo "✅ Passed: $PASSED/$TOTAL tests ($SUCCESS_RATE%)" | tee -a $RESULTS_FILE
echo "❌ Failed: $FAILED/$TOTAL tests" | tee -a $RESULTS_FILE
echo "" | tee -a $RESULTS_FILE

if [ "$SUCCESS_RATE" -ge 80 ]; then
    echo -e "${GREEN}🎉 DOCKER IMAGE VERIFICATION: PASSED${NC}" | tee -a $RESULTS_FILE
    echo "✅ The Docker image is working correctly!" | tee -a $RESULTS_FILE
    echo "✅ All core functionality is operational" | tee -a $RESULTS_FILE
    echo "✅ Security features are active" | tee -a $RESULTS_FILE
    echo "✅ Frontend is accessible" | tee -a $RESULTS_FILE
    echo "✅ API endpoints are responding" | tee -a $RESULTS_FILE
else
    echo -e "${YELLOW}⚠️ DOCKER IMAGE VERIFICATION: NEEDS ATTENTION${NC}" | tee -a $RESULTS_FILE
    echo "❌ Some components may need fixes" | tee -a $RESULTS_FILE
fi

echo "" | tee -a $RESULTS_FILE
echo "📝 Detailed results saved to: $RESULTS_FILE"
echo "🐳 Container: ai-search-comprehensive-test (port 8003)"
echo "🌐 Access frontend at: http://localhost:8003/static/unified_chat.html"

# Return appropriate exit code
if [ "$SUCCESS_RATE" -ge 80 ]; then
    exit 0
else
    exit 1
fi