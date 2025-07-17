#!/usr/bin/env python3
"""
Load Testing Script for AI Search System APIs
Tests all endpoints with concurrent requests
"""

import asyncio
import aiohttp
import time
import json
import statistics
from typing import Dict, List, Any
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor
import sys

@dataclass
class TestResult:
    endpoint: str
    total_requests: int
    successful_requests: int
    failed_requests: int
    avg_response_time: float
    min_response_time: float
    max_response_time: float
    requests_per_second: float
    error_rate: float

class LoadTester:
    def __init__(self, base_url: str = "http://localhost:8000", api_key: str = "development-key-2024"):
        self.base_url = base_url
        self.api_key = api_key
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
        
    async def make_request(self, session: aiohttp.ClientSession, method: str, url: str, data: dict = None) -> Dict[str, Any]:
        """Make a single HTTP request and measure response time"""
        start_time = time.time()
        try:
            if method.upper() == "GET":
                async with session.get(url, headers=self.headers) as response:
                    content = await response.text()
                    return {
                        "success": True,
                        "status_code": response.status,
                        "response_time": time.time() - start_time,
                        "content_length": len(content)
                    }
            else:
                async with session.post(url, headers=self.headers, json=data) as response:
                    content = await response.text()
                    return {
                        "success": True,
                        "status_code": response.status,
                        "response_time": time.time() - start_time,
                        "content_length": len(content)
                    }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "response_time": time.time() - start_time
            }

    async def test_endpoint(self, endpoint_name: str, method: str, path: str, payload: dict = None, 
                          num_requests: int = 50, concurrent_requests: int = 10) -> TestResult:
        """Test a specific endpoint with concurrent requests"""
        
        print(f"\n🧪 Testing {endpoint_name}...")
        print(f"   Method: {method}")
        print(f"   Path: {path}")
        print(f"   Requests: {num_requests} (concurrent: {concurrent_requests})")
        
        url = f"{self.base_url}{path}"
        response_times = []
        successful_requests = 0
        failed_requests = 0
        
        # Create semaphore to limit concurrent requests
        semaphore = asyncio.Semaphore(concurrent_requests)
        
        async def limited_request(session):
            async with semaphore:
                return await self.make_request(session, method, url, payload)
        
        start_time = time.time()
        
        async with aiohttp.ClientSession() as session:
            # Create all request tasks
            tasks = [limited_request(session) for _ in range(num_requests)]
            
            # Execute all requests
            results = await asyncio.gather(*tasks, return_exceptions=True)
        
        total_time = time.time() - start_time
        
        # Process results
        for result in results:
            if isinstance(result, Exception):
                failed_requests += 1
                response_times.append(0)
            elif result.get("success"):
                successful_requests += 1
                response_times.append(result["response_time"])
            else:
                failed_requests += 1
                response_times.append(result.get("response_time", 0))
        
        # Calculate statistics
        valid_times = [t for t in response_times if t > 0]
        avg_response_time = statistics.mean(valid_times) if valid_times else 0
        min_response_time = min(valid_times) if valid_times else 0
        max_response_time = max(valid_times) if valid_times else 0
        requests_per_second = num_requests / total_time if total_time > 0 else 0
        error_rate = (failed_requests / num_requests) * 100
        
        result = TestResult(
            endpoint=endpoint_name,
            total_requests=num_requests,
            successful_requests=successful_requests,
            failed_requests=failed_requests,
            avg_response_time=avg_response_time,
            min_response_time=min_response_time,
            max_response_time=max_response_time,
            requests_per_second=requests_per_second,
            error_rate=error_rate
        )
        
        # Print immediate results
        print(f"   ✅ Success: {successful_requests}/{num_requests}")
        print(f"   ❌ Failed: {failed_requests}/{num_requests}")
        print(f"   ⏱️  Avg Response: {avg_response_time:.3f}s")
        print(f"   🚀 RPS: {requests_per_second:.2f}")
        print(f"   📊 Error Rate: {error_rate:.1f}%")
        
        return result

    async def run_load_tests(self) -> List[TestResult]:
        """Run load tests on all APIs"""
        
        print("🔥 AI Search System - Load Testing")
        print("=" * 50)
        
        # Test configurations
        tests = [
            {
                "name": "Health Check",
                "method": "GET",
                "path": "/health",
                "payload": None,
                "requests": 100,
                "concurrent": 20
            },
            {
                "name": "Basic Chat API",
                "method": "POST", 
                "path": "/api/v1/chat/complete",
                "payload": {"message": "Hello, this is a load test"},
                "requests": 30,
                "concurrent": 5
            },
            {
                "name": "Chat Streaming API",
                "method": "POST",
                "path": "/api/v1/chat/stream", 
                "payload": {"messages": [{"role": "user", "content": "Test streaming"}]},
                "requests": 20,
                "concurrent": 3
            },
            {
                "name": "Basic Search API",
                "method": "POST",
                "path": "/api/v1/search/basic",
                "payload": {"query": "load test search"},
                "requests": 40,
                "concurrent": 8
            },
            {
                "name": "Advanced Search API", 
                "method": "POST",
                "path": "/api/v1/search/advanced",
                "payload": {"query": "advanced load test", "max_results": 5},
                "requests": 25,
                "concurrent": 5
            },
            {
                "name": "Research Deep-Dive API",
                "method": "POST",
                "path": "/api/v1/research/deep-dive",
                "payload": {"research_question": "What is load testing?"},
                "requests": 10,
                "concurrent": 2
            }
        ]
        
        results = []
        
        for test in tests:
            try:
                result = await self.test_endpoint(
                    endpoint_name=test["name"],
                    method=test["method"], 
                    path=test["path"],
                    payload=test["payload"],
                    num_requests=test["requests"],
                    concurrent_requests=test["concurrent"]
                )
                results.append(result)
                
                # Small delay between tests
                await asyncio.sleep(2)
                
            except Exception as e:
                print(f"❌ Error testing {test['name']}: {e}")
        
        return results

    def print_summary(self, results: List[TestResult]):
        """Print comprehensive test summary"""
        
        print("\n" + "=" * 80)
        print("📊 LOAD TEST SUMMARY")
        print("=" * 80)
        
        total_requests = sum(r.total_requests for r in results)
        total_successful = sum(r.successful_requests for r in results)
        total_failed = sum(r.failed_requests for r in results)
        overall_error_rate = (total_failed / total_requests) * 100 if total_requests > 0 else 0
        
        print(f"🎯 Overall Results:")
        print(f"   Total Requests: {total_requests}")
        print(f"   Successful: {total_successful}")
        print(f"   Failed: {total_failed}")
        print(f"   Overall Error Rate: {overall_error_rate:.1f}%")
        print()
        
        # Detailed results table
        print("📋 Detailed Results:")
        print("-" * 80)
        print(f"{'Endpoint':<25} {'Requests':<8} {'Success':<7} {'Avg Time':<9} {'RPS':<6} {'Error%':<7}")
        print("-" * 80)
        
        for result in results:
            print(f"{result.endpoint:<25} {result.total_requests:<8} {result.successful_requests:<7} "
                  f"{result.avg_response_time:<9.3f} {result.requests_per_second:<6.1f} {result.error_rate:<7.1f}")
        
        print("-" * 80)
        
        # Performance analysis
        print("\n🔍 Performance Analysis:")
        fastest = min(results, key=lambda r: r.avg_response_time)
        slowest = max(results, key=lambda r: r.avg_response_time)
        highest_rps = max(results, key=lambda r: r.requests_per_second)
        
        print(f"   ⚡ Fastest: {fastest.endpoint} ({fastest.avg_response_time:.3f}s)")
        print(f"   🐌 Slowest: {slowest.endpoint} ({slowest.avg_response_time:.3f}s)")
        print(f"   🚀 Highest RPS: {highest_rps.endpoint} ({highest_rps.requests_per_second:.1f} req/s)")
        
        # Health assessment
        print(f"\n🏥 System Health Assessment:")
        if overall_error_rate < 5:
            print("   ✅ EXCELLENT - Error rate < 5%")
        elif overall_error_rate < 15:
            print("   ⚠️  GOOD - Error rate < 15%")
        else:
            print("   ❌ NEEDS ATTENTION - Error rate > 15%")

async def main():
    """Main function to run load tests"""
    
    # Check if server is running
    print("🔍 Checking if server is running...")
    
    tester = LoadTester()
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{tester.base_url}/health") as response:
                if response.status == 200:
                    print("✅ Server is running!")
                else:
                    print(f"⚠️  Server responded with status {response.status}")
    except Exception as e:
        print(f"❌ Cannot connect to server: {e}")
        print("   Make sure the server is running at http://localhost:8000")
        return
    
    # Run load tests
    try:
        results = await tester.run_load_tests()
        tester.print_summary(results)
        
        print(f"\n🎉 Load testing completed!")
        print(f"   Check results above for performance insights")
        
    except KeyboardInterrupt:
        print("\n⏹️  Load testing interrupted by user")
    except Exception as e:
        print(f"❌ Load testing failed: {e}")

if __name__ == "__main__":
    asyncio.run(main())