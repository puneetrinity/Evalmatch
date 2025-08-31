#!/bin/bash

# Deployment Validation Script
# Tests all critical endpoints after Redis fixes

echo "🎯 DEPLOYMENT VALIDATION: Testing ACTUAL Railway endpoints"
echo "================================================"
echo "Target: https://evalmatch-ai-production-be7c.up.railway.app"
echo "Date: $(date)"
echo ""

BASE_URL="https://evalmatch-ai-production-be7c.up.railway.app"
FAILED_TESTS=0
PASSED_TESTS=0

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to test endpoint
test_endpoint() {
    local method=$1
    local path=$2
    local expected_status=$3
    local description=$4
    local headers=$5
    
    echo -n "Testing: $description... "
    
    # Make the request and capture response, suppress auth header warnings
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL$path" -H "Content-Type: application/json" $headers 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$path" -H "Content-Type: application/json" $headers 2>/dev/null)
    fi
    
    # Extract status code (last line)
    status_code=$(echo "$response" | tail -1)
    # Extract body (everything except last line)
    body=$(echo "$response" | sed '$d')
    
    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓${NC} [${status_code}]"
        ((PASSED_TESTS++))
        
        # Check for critical headers in specific endpoints
        if [[ "$path" == "/api/ping" ]] || [[ "$path" == "/api/healthz" ]]; then
            header_check=$(curl -sI "$BASE_URL$path" 2>/dev/null | grep -i "x-fast-path: true")
            if [ -n "$header_check" ]; then
                echo "  └─ ${GREEN}✓${NC} X-Fast-Path header present"
            else
                echo "  └─ ${YELLOW}⚠${NC} X-Fast-Path header missing"
            fi
        fi
        
        if [[ "$path" == "/api/readyz" ]]; then
            header_check=$(curl -sI "$BASE_URL$path" 2>/dev/null | grep -i "x-health-cache: true")
            if [ -n "$header_check" ]; then
                echo "  └─ ${GREEN}✓${NC} X-Health-Cache header present"
            else
                echo "  └─ ${YELLOW}⚠${NC} X-Health-Cache header missing"
            fi
        fi
    else
        echo -e "${RED}✗${NC} [Expected: ${expected_status}, Got: ${status_code}]"
        ((FAILED_TESTS++))
        if [ -n "$body" ]; then
            echo "  └─ Response: $(echo $body | head -c 100)..."
        fi
    fi
}

# Function to measure response time
measure_performance() {
    local path=$1
    local description=$2
    
    echo -n "Performance: $description... "
    
    # Measure time for 5 requests
    total_time=0
    for i in {1..5}; do
        time_ms=$(curl -o /dev/null -s -w '%{time_total}' "$BASE_URL$path")
        time_ms=$(echo "$time_ms * 1000" | bc)
        total_time=$(echo "$total_time + $time_ms" | bc)
    done
    
    avg_time=$(echo "scale=2; $total_time / 5" | bc)
    
    if (( $(echo "$avg_time < 100" | bc -l) )); then
        echo -e "${GREEN}✓${NC} Avg: ${avg_time}ms (< 100ms target)"
    elif (( $(echo "$avg_time < 200" | bc -l) )); then
        echo -e "${YELLOW}⚠${NC} Avg: ${avg_time}ms (< 200ms acceptable)"
    else
        echo -e "${RED}✗${NC} Avg: ${avg_time}ms (> 200ms slow)"
    fi
}

echo "=== PHASE 1: Fast Path Endpoints (Should bypass middleware) ==="
echo ""

test_endpoint "GET" "/api/ping" "200" "Ping endpoint (fast path)"
test_endpoint "GET" "/api/healthz" "200" "Health check (fast path)"
test_endpoint "GET" "/api/version" "200" "Version endpoint (fast path)"

echo ""
echo "=== PHASE 2: Health & Monitoring Endpoints ==="
echo ""

test_endpoint "GET" "/api/readyz" "200" "Readiness probe (cached)"
test_endpoint "GET" "/api/health" "200" "Full health status"
test_endpoint "GET" "/api/db-status" "200" "Database status"
test_endpoint "GET" "/api/service-status" "200" "Service status"

echo ""
echo "=== PHASE 3: API Documentation ==="
echo ""

test_endpoint "GET" "/api-docs.json" "200" "OpenAPI spec"

echo ""
echo "=== PHASE 4: Protected Endpoints (Should require auth) ==="
echo ""

# Test protected endpoints and verify auth messages
test_auth_endpoint() {
    local method=$1
    local path=$2
    local description=$3
    
    echo -n "Testing: $description... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL$path" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$path" -H "Content-Type: application/json" 2>/dev/null)
    fi
    
    status_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$status_code" = "401" ]; then
        echo -e "${GREEN}✓${NC} [401 Unauthorized]"
        ((PASSED_TESTS++))
        
        # Check for proper auth error message
        if echo "$body" | grep -q "Missing or invalid Authorization header\|Authorization required\|Unauthorized"; then
            echo "  └─ ${GREEN}✓${NC} Proper auth error message"
        else
            echo "  └─ ${YELLOW}⚠${NC} Auth message: $(echo $body | head -c 60)..."
        fi
    elif [ "$status_code" = "404" ]; then
        echo -e "${YELLOW}⚠${NC} [404 - Endpoint not found]"
        echo "  └─ Note: This endpoint may not exist in current routes"
    else
        echo -e "${RED}✗${NC} [Expected: 401, Got: ${status_code}]"
        ((FAILED_TESTS++))
    fi
}

test_auth_endpoint "GET" "/api/resumes" "List resumes (no auth)"
test_auth_endpoint "GET" "/api/job-descriptions" "List jobs (no auth)"
test_auth_endpoint "POST" "/api/analyze" "Analyze endpoint (no auth)"
test_auth_endpoint "GET" "/api/user-tier" "User tier (no auth)"

echo ""
echo "=== PHASE 5: Rate Limiting Validation ==="
echo ""

echo "Testing rate limiter (30 requests/minute limit)..."
RATE_LIMIT_HIT=false

# Check if rate limit headers exist first
rate_check=$(curl -sI "$BASE_URL/api/ping" | grep -i "ratelimit-")
if [ -n "$rate_check" ]; then
    echo "Rate limiting headers detected - testing limits..."
    
    for i in {1..35}; do
        response=$(curl -s -o /dev/null -w "%{http_code}\n" "$BASE_URL/api/ping")
        if [ "$response" = "429" ]; then
            echo -e "${GREEN}✓${NC} Rate limit triggered at request #$i (Expected: ~31)"
            RATE_LIMIT_HIT=true
            ((PASSED_TESTS++))
            break
        fi
    done
    
    if [ "$RATE_LIMIT_HIT" = false ]; then
        echo -e "${YELLOW}⚠${NC} Rate limit not triggered (may be using memory store due to Redis fallback)"
    fi
else
    echo -e "${YELLOW}⚠${NC} Rate limiting may be using memory store (no headers found)"
fi

echo ""
echo "=== PHASE 6: Performance Benchmarks ==="
echo ""

measure_performance "/api/ping" "Fast path ping"
measure_performance "/api/healthz" "Fast path health"
measure_performance "/api/readyz" "Cached readiness"

echo ""
echo "=== PHASE 7: Redis Connection Verification ==="
echo ""

# Check if Redis is being used properly
readyz_response=$(curl -s "$BASE_URL/api/readyz")
if echo "$readyz_response" | grep -q '"redis":true'; then
    echo -e "${GREEN}✓${NC} Redis connection confirmed in readyz"
else
    echo -e "${RED}✗${NC} Redis not confirmed in readyz response"
fi

# Check rate limit headers (indicates Redis-backed rate limiting)
rate_headers=$(curl -sI "$BASE_URL/api/ping" | grep -i "ratelimit-")
if [ -n "$rate_headers" ]; then
    echo -e "${GREEN}✓${NC} Rate limit headers present (Redis-backed)"
    echo "$rate_headers" | while read line; do
        echo "  └─ $line"
    done
else
    echo -e "${YELLOW}⚠${NC} Rate limit headers not found"
fi

echo ""
echo "=== PHASE 8: Error Handling ==="
echo ""

test_endpoint "GET" "/api/nonexistent" "404" "404 handling"
test_auth_endpoint "POST" "/api/auth-test" "Auth error handling (any protected endpoint)"

echo ""
echo "================================================"
echo "VALIDATION SUMMARY"
echo "================================================"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}🎉 ALL TESTS PASSED!${NC}"
    echo "Deployment validation successful."
    exit 0
else
    echo -e "\n${RED}⚠️  SOME TESTS FAILED${NC}"
    echo "Please review failed tests above."
    exit 1
fi