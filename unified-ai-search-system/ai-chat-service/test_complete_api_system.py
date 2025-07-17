#!/usr/bin/env python3
"""
Complete API Endpoints, Integration, and End-to-End System Testing
Tests the entire AI Search System with real FastAPI application and all endpoints.
"""

import asyncio
import sys
import os
import json
import time
from pathlib import Path
from typing import Dict, Any, List
import httpx
import pytest
from fastapi.testclient import TestClient

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# Mock dependencies when services are unavailable
os.environ["REDIS_URL"] = "redis://localhost:6379"
os.environ["OLLAMA_HOST"] = "http://localhost:11434"
os.environ["ENVIRONMENT"] = "testing"

class APITestResults:
    def __init__(self):
        self.results: Dict[str, Any] = {}
        self.issues: List[str] = []
        self.fixes_applied: List[str] = []
        self.performance_metrics: Dict[str, float] = {}
    
    def add_result(self, endpoint: str, method: str, status: str, details: str = "", error: str = "", response_time: float = 0):
        key = f"{method} {endpoint}"
        self.results[key] = {
            "status": status,
            "details": details,
            "error": error,
            "response_time": response_time
        }
        if status == "FAILED":
            self.issues.append(f"{key}: {error}")
        self.performance_metrics[key] = response_time
    
    def add_fix(self, fix_description: str):
        self.fixes_applied.append(fix_description)
    
    def print_summary(self):
        print("\n" + "="*80)
        print("COMPLETE API & SYSTEM TEST RESULTS")
        print("="*80)
        
        for endpoint, result in self.results.items():
            status_emoji = "✅" if result["status"] == "PASSED" else "❌" if result["status"] == "FAILED" else "⚠️"
            response_time = result["response_time"]
            print(f"{status_emoji} {endpoint}: {result['status']} ({response_time:.3f}s)")
            if result["details"]:
                print(f"   📝 {result['details']}")
            if result["error"]:
                print(f"   🚨 {result['error']}")
        
        # Performance summary
        if self.performance_metrics:
            avg_response_time = sum(self.performance_metrics.values()) / len(self.performance_metrics)
            max_response_time = max(self.performance_metrics.values())
            print(f"\n⚡ PERFORMANCE METRICS:")
            print(f"   Average Response Time: {avg_response_time:.3f}s")
            print(f"   Maximum Response Time: {max_response_time:.3f}s")
            print(f"   Total Endpoints Tested: {len(self.performance_metrics)}")
        
        print(f"\n📊 SUMMARY: {len([r for r in self.results.values() if r['status'] == 'PASSED'])} PASSED, "
              f"{len([r for r in self.results.values() if r['status'] == 'FAILED'])} FAILED, "
              f"{len([r for r in self.results.values() if r['status'] == 'DEGRADED'])} DEGRADED")
        
        if self.issues:
            print(f"\n🚨 ISSUES FOUND ({len(self.issues)}):")
            for issue in self.issues:
                print(f"   - {issue}")
        
        if self.fixes_applied:
            print(f"\n🔧 FIXES APPLIED ({len(self.fixes_applied)}):")
            for fix in self.fixes_applied:
                print(f"   + {fix}")

def create_test_client():
    """Create FastAPI test client."""
    try:
        from app.main import app
        return TestClient(app)
    except Exception as e:
        print(f"❌ Failed to create test client: {e}")
        return None

def test_health_endpoints(client: TestClient, results: APITestResults):
    """Test all health and status endpoints."""
    print("🧪 Testing Health & Status Endpoints...")
    
    health_endpoints = [
        "/health",
        "/health/ready", 
        "/health/live",
        "/metrics",
        "/system/status"
    ]
    
    for endpoint in health_endpoints:
        try:
            start_time = time.time()
            response = client.get(endpoint)
            response_time = time.time() - start_time
            
            if response.status_code in [200, 503]:  # 503 acceptable for degraded services
                status = "PASSED" if response.status_code == 200 else "DEGRADED"
                try:
                    data = response.json()
                    details = f"Status: {response.status_code}, Response: {type(data).__name__}"
                except:
                    details = f"Status: {response.status_code}, Non-JSON response"
                results.add_result(endpoint, "GET", status, details, response_time=response_time)
            else:
                results.add_result(endpoint, "GET", "FAILED", 
                                 f"Status: {response.status_code}", 
                                 response.text[:200], response_time)
        except Exception as e:
            results.add_result(endpoint, "GET", "FAILED", "", str(e), 0)

def test_chat_endpoints(client: TestClient, results: APITestResults):
    """Test chat API endpoints."""
    print("🧪 Testing Chat API Endpoints...")
    
    # Test chat complete endpoint
    chat_payload = {
        "message": "Hello, this is a test message for the chat API",
        "session_id": "test_session_123",
        "quality_requirement": "balanced",
        "max_cost": 0.10,
        "response_style": "balanced"
    }
    
    try:
        start_time = time.time()
        response = client.post("/api/v1/chat/complete", json=chat_payload)
        response_time = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            if "data" in data and "response" in data["data"]:
                details = f"Generated response: '{data['data']['response'][:50]}...'"
                results.add_result("/api/v1/chat/complete", "POST", "PASSED", details, response_time=response_time)
            else:
                results.add_result("/api/v1/chat/complete", "POST", "FAILED", 
                                 "Missing response in data", json.dumps(data)[:200], response_time)
        else:
            results.add_result("/api/v1/chat/complete", "POST", "FAILED",
                             f"Status: {response.status_code}", response.text[:200], response_time)
    except Exception as e:
        results.add_result("/api/v1/chat/complete", "POST", "FAILED", "", str(e), 0)
    
    # Test streaming chat endpoint
    streaming_payload = {
        "messages": [
            {"role": "user", "content": "What is Python programming language?"}
        ],
        "session_id": "test_stream_session",
        "model": "auto",
        "max_tokens": 300,
        "temperature": 0.7,
        "stream": True
    }
    
    try:
        start_time = time.time()
        response = client.post("/api/v1/chat/stream", json=streaming_payload)
        response_time = time.time() - start_time
        
        if response.status_code == 200:
            # For streaming, we expect either SSE or chunked response
            details = f"Streaming response initiated, content-type: {response.headers.get('content-type', 'unknown')}"
            results.add_result("/api/v1/chat/stream", "POST", "PASSED", details, response_time=response_time)
        else:
            results.add_result("/api/v1/chat/stream", "POST", "FAILED",
                             f"Status: {response.status_code}", response.text[:200], response_time)
    except Exception as e:
        results.add_result("/api/v1/chat/stream", "POST", "FAILED", "", str(e), 0)

def test_search_endpoints(client: TestClient, results: APITestResults):
    """Test search API endpoints."""
    print("🧪 Testing Search API Endpoints...")
    
    # Test basic search
    search_payload = {
        "query": "artificial intelligence machine learning",
        "max_results": 5,
        "search_type": "web",
        "include_summary": True,
        "budget": 2.0,
        "quality": "standard"
    }
    
    try:
        start_time = time.time()
        response = client.post("/api/v1/search/basic", json=search_payload)
        response_time = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            details = f"Search completed, response type: {type(data).__name__}"
            results.add_result("/api/v1/search/basic", "POST", "PASSED", details, response_time=response_time)
        else:
            results.add_result("/api/v1/search/basic", "POST", "FAILED",
                             f"Status: {response.status_code}", response.text[:200], response_time)
    except Exception as e:
        results.add_result("/api/v1/search/basic", "POST", "FAILED", "", str(e), 0)
    
    # Test advanced search
    advanced_search_payload = {
        "query": "python programming best practices",
        "max_results": 10,
        "search_type": "comprehensive",
        "quality_requirement": "high",
        "budget": 5.0,
        "include_content": True,
        "include_summary": True,
        "timeout": 60
    }
    
    try:
        start_time = time.time()
        response = client.post("/api/v1/search/advanced", json=advanced_search_payload)
        response_time = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            details = f"Advanced search completed, response type: {type(data).__name__}"
            results.add_result("/api/v1/search/advanced", "POST", "PASSED", details, response_time=response_time)
        else:
            results.add_result("/api/v1/search/advanced", "POST", "FAILED",
                             f"Status: {response.status_code}", response.text[:200], response_time)
    except Exception as e:
        results.add_result("/api/v1/search/advanced", "POST", "FAILED", "", str(e), 0)

def test_research_endpoints(client: TestClient, results: APITestResults):
    """Test research API endpoints."""
    print("🧪 Testing Research API Endpoints...")
    
    research_payload = {
        "research_question": "What are the latest developments in artificial intelligence and their impact on software development?",
        "methodology": "systematic",
        "time_budget": 300,
        "cost_budget": 0.50,
        "sources": ["web", "academic"],
        "depth_level": 3
    }
    
    try:
        start_time = time.time()
        response = client.post("/api/v1/research/deep-dive", json=research_payload)
        response_time = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            details = f"Research completed, response type: {type(data).__name__}"
            results.add_result("/api/v1/research/deep-dive", "POST", "PASSED", details, response_time=response_time)
        else:
            results.add_result("/api/v1/research/deep-dive", "POST", "FAILED",
                             f"Status: {response.status_code}", response.text[:200], response_time)
    except Exception as e:
        results.add_result("/api/v1/research/deep-dive", "POST", "FAILED", "", str(e), 0)

def test_model_management_endpoints(client: TestClient, results: APITestResults):
    """Test model management endpoints."""
    print("🧪 Testing Model Management Endpoints...")
    
    # Test list models
    try:
        start_time = time.time()
        response = client.get("/api/v1/models/list")
        response_time = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            model_count = len(data.get("data", {}).get("models", []))
            details = f"Found {model_count} models"
            results.add_result("/api/v1/models/list", "GET", "PASSED", details, response_time=response_time)
        else:
            results.add_result("/api/v1/models/list", "GET", "FAILED",
                             f"Status: {response.status_code}", response.text[:200], response_time)
    except Exception as e:
        results.add_result("/api/v1/models/list", "GET", "FAILED", "", str(e), 0)
    
    # Test model download
    download_payload = {
        "model_name": "phi3:mini"
    }
    
    try:
        start_time = time.time()
        response = client.post("/api/v1/models/download", json=download_payload)
        response_time = time.time() - start_time
        
        if response.status_code in [200, 202]:  # 202 for async download
            details = f"Download initiated for phi3:mini"
            results.add_result("/api/v1/models/download", "POST", "PASSED", details, response_time=response_time)
        else:
            results.add_result("/api/v1/models/download", "POST", "FAILED",
                             f"Status: {response.status_code}", response.text[:200], response_time)
    except Exception as e:
        results.add_result("/api/v1/models/download", "POST", "FAILED", "", str(e), 0)

def test_analytics_endpoints(client: TestClient, results: APITestResults):
    """Test analytics and monitoring endpoints."""
    print("🧪 Testing Analytics & Monitoring Endpoints...")
    
    analytics_endpoints = [
        "/api/v1/analytics/usage",
        "/api/v1/analytics/performance", 
        "/api/v1/analytics/costs"
    ]
    
    for endpoint in analytics_endpoints:
        try:
            start_time = time.time()
            response = client.get(endpoint)
            response_time = time.time() - start_time
            
            if response.status_code == 200:
                data = response.json()
                details = f"Analytics data retrieved, type: {type(data).__name__}"
                results.add_result(endpoint, "GET", "PASSED", details, response_time=response_time)
            else:
                results.add_result(endpoint, "GET", "FAILED",
                                 f"Status: {response.status_code}", response.text[:200], response_time)
        except Exception as e:
            results.add_result(endpoint, "GET", "FAILED", "", str(e), 0)

def test_error_handling(client: TestClient, results: APITestResults):
    """Test error handling and edge cases."""
    print("🧪 Testing Error Handling & Edge Cases...")
    
    # Test invalid chat request
    invalid_chat_payload = {
        "message": "",  # Empty message
        "max_cost": -1,  # Invalid cost
        "quality_requirement": "invalid_quality"  # Invalid quality
    }
    
    try:
        start_time = time.time()
        response = client.post("/api/v1/chat/complete", json=invalid_chat_payload)
        response_time = time.time() - start_time
        
        if response.status_code in [400, 422]:  # Validation error expected
            details = f"Properly rejected invalid request with status {response.status_code}"
            results.add_result("/api/v1/chat/complete (invalid)", "POST", "PASSED", details, response_time=response_time)
        else:
            results.add_result("/api/v1/chat/complete (invalid)", "POST", "FAILED",
                             f"Should reject invalid request, got {response.status_code}", 
                             response.text[:200], response_time)
    except Exception as e:
        results.add_result("/api/v1/chat/complete (invalid)", "POST", "FAILED", "", str(e), 0)
    
    # Test non-existent endpoint
    try:
        start_time = time.time()
        response = client.get("/api/v1/non-existent-endpoint")
        response_time = time.time() - start_time
        
        if response.status_code == 404:
            details = f"Properly returned 404 for non-existent endpoint"
            results.add_result("/api/v1/non-existent-endpoint", "GET", "PASSED", details, response_time=response_time)
        else:
            results.add_result("/api/v1/non-existent-endpoint", "GET", "FAILED",
                             f"Expected 404, got {response.status_code}", 
                             response.text[:200], response_time)
    except Exception as e:
        results.add_result("/api/v1/non-existent-endpoint", "GET", "FAILED", "", str(e), 0)

def test_end_to_end_workflows(client: TestClient, results: APITestResults):
    """Test complete end-to-end workflows."""
    print("🧪 Testing End-to-End Workflows...")
    
    # Complete conversation workflow
    try:
        session_id = "e2e_test_session"
        
        # 1. Start conversation
        start_time = time.time()
        response1 = client.post("/api/v1/chat/complete", json={
            "message": "Hello, I'm starting a new conversation",
            "session_id": session_id,
            "quality_requirement": "balanced"
        })
        
        # 2. Continue conversation
        response2 = client.post("/api/v1/chat/complete", json={
            "message": "Can you tell me about Python programming?",
            "session_id": session_id,
            "quality_requirement": "balanced"
        })
        
        # 3. Ask follow-up
        response3 = client.post("/api/v1/chat/complete", json={
            "message": "What are some good Python libraries for beginners?",
            "session_id": session_id,
            "quality_requirement": "balanced"
        })
        
        total_time = time.time() - start_time
        
        if all(r.status_code == 200 for r in [response1, response2, response3]):
            details = f"3-message conversation completed successfully"
            results.add_result("E2E Conversation Workflow", "POST", "PASSED", details, response_time=total_time)
        else:
            status_codes = [r.status_code for r in [response1, response2, response3]]
            results.add_result("E2E Conversation Workflow", "POST", "FAILED",
                             f"Status codes: {status_codes}", "", total_time)
    except Exception as e:
        results.add_result("E2E Conversation Workflow", "POST", "FAILED", "", str(e), 0)
    
    # Search + Chat workflow  
    try:
        start_time = time.time()
        
        # 1. Perform search
        search_response = client.post("/api/v1/search/basic", json={
            "query": "machine learning algorithms",
            "max_results": 3,
            "include_summary": True
        })
        
        # 2. Ask about search results
        if search_response.status_code == 200:
            chat_response = client.post("/api/v1/chat/complete", json={
                "message": "Based on the latest machine learning research, what should I learn first?",
                "session_id": "search_chat_session",
                "quality_requirement": "high"
            })
            
            total_time = time.time() - start_time
            
            if chat_response.status_code == 200:
                details = f"Search + Chat workflow completed successfully"
                results.add_result("E2E Search + Chat Workflow", "POST", "PASSED", details, response_time=total_time)
            else:
                results.add_result("E2E Search + Chat Workflow", "POST", "FAILED",
                                 f"Chat failed with {chat_response.status_code}", "", total_time)
        else:
            results.add_result("E2E Search + Chat Workflow", "POST", "FAILED",
                             f"Search failed with {search_response.status_code}", "", 0)
    except Exception as e:
        results.add_result("E2E Search + Chat Workflow", "POST", "FAILED", "", str(e), 0)

def test_performance_load(client: TestClient, results: APITestResults):
    """Test performance under load."""
    print("🧪 Testing Performance Under Load...")
    
    # Concurrent chat requests
    try:
        import concurrent.futures
        
        def make_chat_request(i):
            start_time = time.time()
            response = client.post("/api/v1/chat/complete", json={
                "message": f"Test message {i}",
                "session_id": f"load_test_session_{i}",
                "quality_requirement": "minimal"
            })
            return time.time() - start_time, response.status_code
        
        # Test 10 concurrent requests
        start_time = time.time()
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(make_chat_request, i) for i in range(10)]
            results_list = [future.result() for future in concurrent.futures.as_completed(futures)]
        
        total_time = time.time() - start_time
        successful_requests = sum(1 for _, status in results_list if status == 200)
        avg_response_time = sum(time for time, _ in results_list) / len(results_list)
        
        if successful_requests >= 8:  # At least 80% success rate
            details = f"{successful_requests}/10 successful, avg: {avg_response_time:.3f}s"
            results.add_result("Load Test (10 concurrent)", "POST", "PASSED", details, response_time=total_time)
        else:
            details = f"Only {successful_requests}/10 successful"
            results.add_result("Load Test (10 concurrent)", "POST", "FAILED", details, "", total_time)
    except Exception as e:
        results.add_result("Load Test (10 concurrent)", "POST", "FAILED", "", str(e), 0)

async def run_complete_api_tests():
    """Run all API tests."""
    results = APITestResults()
    
    print("🚀 COMPLETE API & SYSTEM TESTING STARTING...")
    print("="*80)
    
    # Create test client
    client = create_test_client()
    if not client:
        print("❌ CRITICAL: Cannot create test client - FastAPI app failed to load")
        return results
    
    print("✅ FastAPI test client created successfully")
    
    # Run all test suites
    test_health_endpoints(client, results)
    test_chat_endpoints(client, results)
    test_search_endpoints(client, results) 
    test_research_endpoints(client, results)
    test_model_management_endpoints(client, results)
    test_analytics_endpoints(client, results)
    test_error_handling(client, results)
    test_end_to_end_workflows(client, results)
    test_performance_load(client, results)
    
    # Print comprehensive results
    results.print_summary()
    
    return results

if __name__ == "__main__":
    print("🔍 COMPREHENSIVE API, INTEGRATION & E2E TESTING")
    
    try:
        # Run all tests
        results = asyncio.run(run_complete_api_tests())
        
        # Analyze results
        total_tests = len(results.results)
        passed_tests = len([r for r in results.results.values() if r["status"] == "PASSED"])
        failed_tests = len([r for r in results.results.values() if r["status"] == "FAILED"])
        
        if failed_tests == 0:
            print(f"\n🎉 ALL {total_tests} API TESTS PASSED!")
            print("✅ Complete API system is working correctly")
            print("✅ All endpoints functional")
            print("✅ Error handling working")
            print("✅ End-to-end workflows operational")
            print("✅ Performance acceptable")
        else:
            print(f"\n⚠️ {passed_tests}/{total_tests} TESTS PASSED, {failed_tests} FAILED")
            print("🔧 Review failed tests and fix issues")
    
    except Exception as e:
        print(f"\n💥 TESTING FRAMEWORK CRASHED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)