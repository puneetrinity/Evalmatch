#!/bin/bash
# Simple Load Testing Script for AI Search System APIs
# Tests all endpoints with concurrent requests using curl

BASE_URL="http://localhost:8000"
API_KEY="${API_KEY:-development-key-2024}"  # Use env var or fallback
RESULTS_FILE="load_test_results.txt"

# Check if API key is still using default development key
if [ "$API_KEY" = "development-key-2024" ]; then
    echo "⚠️  WARNING: Using default development API key. Set API_KEY environment variable for production."
fi

echo "🔥 AI Search System - Load Testing" | tee $RESULTS_FILE
echo "=================================================" | tee -a $RESULTS_FILE
echo "Started at: $(date)" | tee -a $RESULTS_FILE
echo "" | tee -a $RESULTS_FILE

# Function to test endpoint
test_endpoint() {
    local name="$1"
    local method="$2" 
    local path="$3"
    local data="$4"
    local requests="$5"
    local concurrent="$6"
    
    echo "🧪 Testing $name..." | tee -a $RESULTS_FILE
    echo "   Method: $method, Path: $path" | tee -a $RESULTS_FILE
    echo "   Requests: $requests, Concurrent: $concurrent" | tee -a $RESULTS_FILE
    
    local start_time=$(date +%s.%N)
    local success_count=0
    local fail_count=0
    local temp_dir=$(mktemp -d)
    
    # Create requests
    for ((i=1; i<=requests; i++)); do
        {
            if [ "$method" = "GET" ]; then
                response=$(curl -s -w "%{http_code}:%{time_total}" \
                    -H "Authorization: Bearer $API_KEY" \
                    "$BASE_URL$path" 2>/dev/null)
            else
                response=$(curl -s -w "%{http_code}:%{time_total}" \
                    -X POST \
                    -H "Content-Type: application/json" \
                    -H "Authorization: Bearer $API_KEY" \
                    -d "$data" \
                    "$BASE_URL$path" 2>/dev/null)
            fi
            
            # Parse response
            if echo "$response" | grep -q "200:"; then
                echo "SUCCESS" > "$temp_dir/result_$i"
                echo "$response" | cut -d':' -f2 > "$temp_dir/time_$i"
            else
                echo "FAIL" > "$temp_dir/result_$i"
                echo "0" > "$temp_dir/time_$i"
            fi
        } &
        
        # Limit concurrent requests
        if (( i % concurrent == 0 )); then
            wait
        fi
    done
    
    # Wait for remaining requests
    wait
    
    local end_time=$(date +%s.%N)
    local total_time=$(echo "$end_time - $start_time" | bc -l)
    
    # Count results
    for file in "$temp_dir"/result_*; do
        if [ -f "$file" ]; then
            if grep -q "SUCCESS" "$file"; then
                ((success_count++))
            else
                ((fail_count++))
            fi
        fi
    done
    
    # Calculate average response time
    local total_response_time=0
    local count=0
    for file in "$temp_dir"/time_*; do
        if [ -f "$file" ]; then
            local time_val=$(cat "$file")
            total_response_time=$(echo "$total_response_time + $time_val" | bc -l)
            ((count++))
        fi
    done
    
    local avg_response_time=0
    if [ "$count" -gt 0 ]; then
        avg_response_time=$(echo "scale=3; $total_response_time / $count" | bc -l)
    fi
    
    local rps=0
    if [ "$(echo "$total_time > 0" | bc -l)" -eq 1 ]; then
        rps=$(echo "scale=2; $requests / $total_time" | bc -l)
    fi
    
    local error_rate=0
    if [ "$requests" -gt 0 ]; then
        error_rate=$(echo "scale=1; $fail_count * 100 / $requests" | bc -l)
    fi
    
    # Print results
    echo "   ✅ Success: $success_count/$requests" | tee -a $RESULTS_FILE
    echo "   ❌ Failed: $fail_count/$requests" | tee -a $RESULTS_FILE
    echo "   ⏱️  Avg Response: ${avg_response_time}s" | tee -a $RESULTS_FILE
    echo "   🚀 RPS: $rps" | tee -a $RESULTS_FILE
    echo "   📊 Error Rate: $error_rate%" | tee -a $RESULTS_FILE
    echo "" | tee -a $RESULTS_FILE
    
    # Cleanup
    rm -rf "$temp_dir"
    
    # Return results for summary
    echo "$name,$requests,$success_count,$fail_count,$avg_response_time,$rps,$error_rate"
}

# Check if server is running
echo "🔍 Checking if server is running..." | tee -a $RESULTS_FILE
if curl -s "$BASE_URL/health" > /dev/null; then
    echo "✅ Server is running!" | tee -a $RESULTS_FILE
else
    echo "❌ Server is not responding. Please start the server first." | tee -a $RESULTS_FILE
    exit 1
fi

echo "" | tee -a $RESULTS_FILE

# Store results for summary
declare -a test_results

# Test 1: Health Check
result=$(test_endpoint "Health Check" "GET" "/health" "" 50 10)
test_results+=("$result")

# Test 2: Basic Chat API  
result=$(test_endpoint "Basic Chat API" "POST" "/api/v1/chat/complete" \
    '{"message": "Hello, this is a load test"}' 20 5)
test_results+=("$result")

# Test 3: Chat Streaming API
result=$(test_endpoint "Chat Streaming API" "POST" "/api/v1/chat/stream" \
    '{"messages": [{"role": "user", "content": "Test streaming"}]}' 15 3)
test_results+=("$result")

# Test 4: Basic Search API
result=$(test_endpoint "Basic Search API" "POST" "/api/v1/search/basic" \
    '{"query": "load test search"}' 30 6)
test_results+=("$result")

# Test 5: Advanced Search API
result=$(test_endpoint "Advanced Search API" "POST" "/api/v1/search/advanced" \
    '{"query": "advanced load test", "max_results": 5}' 20 4)
test_results+=("$result")

# Test 6: Research Deep-Dive API (fewer requests due to longer processing time)
result=$(test_endpoint "Research Deep-Dive API" "POST" "/api/v1/research/deep-dive" \
    '{"research_question": "What is load testing?"}' 5 2)
test_results+=("$result")

# Generate summary
echo "================================================================================" | tee -a $RESULTS_FILE
echo "📊 LOAD TEST SUMMARY" | tee -a $RESULTS_FILE  
echo "================================================================================" | tee -a $RESULTS_FILE
echo "" | tee -a $RESULTS_FILE

printf "%-25s %-8s %-7s %-9s %-6s %-7s\n" "Endpoint" "Requests" "Success" "Avg Time" "RPS" "Error%" | tee -a $RESULTS_FILE
echo "--------------------------------------------------------------------------------" | tee -a $RESULTS_FILE

total_requests=0
total_success=0
total_fail=0

for result in "${test_results[@]}"; do
    IFS=',' read -r name requests success fail avg_time rps error_rate <<< "$result"
    printf "%-25s %-8s %-7s %-9s %-6s %-7s\n" "$name" "$requests" "$success" "$avg_time" "$rps" "$error_rate" | tee -a $RESULTS_FILE
    
    total_requests=$((total_requests + requests))
    total_success=$((total_success + success))
    total_fail=$((total_fail + fail))
done

echo "--------------------------------------------------------------------------------" | tee -a $RESULTS_FILE

overall_error_rate=0
if [ "$total_requests" -gt 0 ]; then
    overall_error_rate=$(echo "scale=1; $total_fail * 100 / $total_requests" | bc -l)
fi

echo "" | tee -a $RESULTS_FILE
echo "🎯 Overall Results:" | tee -a $RESULTS_FILE
echo "   Total Requests: $total_requests" | tee -a $RESULTS_FILE
echo "   Successful: $total_success" | tee -a $RESULTS_FILE
echo "   Failed: $total_fail" | tee -a $RESULTS_FILE
echo "   Overall Error Rate: $overall_error_rate%" | tee -a $RESULTS_FILE
echo "" | tee -a $RESULTS_FILE

# Health assessment
echo "🏥 System Health Assessment:" | tee -a $RESULTS_FILE
if [ "$(echo "$overall_error_rate < 5" | bc -l)" -eq 1 ]; then
    echo "   ✅ EXCELLENT - Error rate < 5%" | tee -a $RESULTS_FILE
elif [ "$(echo "$overall_error_rate < 15" | bc -l)" -eq 1 ]; then
    echo "   ⚠️  GOOD - Error rate < 15%" | tee -a $RESULTS_FILE
else
    echo "   ❌ NEEDS ATTENTION - Error rate > 15%" | tee -a $RESULTS_FILE
fi

echo "" | tee -a $RESULTS_FILE
echo "🎉 Load testing completed at: $(date)" | tee -a $RESULTS_FILE
echo "📄 Full results saved to: $RESULTS_FILE" | tee -a $RESULTS_FILE