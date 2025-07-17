#!/usr/bin/env python3
"""
Comprehensive Load Testing Suite for AI Search System
Tests all endpoints with realistic workloads and measures performance.
"""
import asyncio
import aiohttp
import time
import json
import statistics
import sys
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Dict, List, Any
import psutil

@dataclass
class TestResult:
    endpoint: str
    total_requests: int
    successful_requests: int
    failed_requests: int
    avg_response_time: float
    min_response_time: float
    max_response_time: float
    p95_response_time: float
    requests_per_second: float
    requests_per_hour: float
    error_rate: float
    memory_usage_mb: float
    cpu_usage_percent: float

class LoadTester:
    def __init__(self, base_url="http://localhost:8000"):
        self.base_url = base_url
        self.session = None
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=120)
        )
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def single_request(self, endpoint, method="GET", data=None, headers=None):
        """Execute a single request and measure timing"""
        start_time = time.time()
        try:
            if method == "GET":
                async with self.session.get(f"{self.base_url}{endpoint}", headers=headers) as response:
                    await response.text()
                    return {
                        'success': response.status == 200,
                        'response_time': time.time() - start_time,
                        'status_code': response.status,
                        'error': None
                    }
            else:
                async with self.session.post(f"{self.base_url}{endpoint}", json=data, headers=headers) as response:
                    await response.text()
                    return {
                        'success': response.status == 200,
                        'response_time': time.time() - start_time,
                        'status_code': response.status,
                        'error': None
                    }
        except Exception as e:
            return {
                'success': False,
                'response_time': time.time() - start_time,
                'status_code': 0,
                'error': str(e)
            }
    
    async def load_test_endpoint(self, endpoint, method="GET", data=None, 
                               concurrent_requests=5, total_requests=25, headers=None):
        """Run load test on a specific endpoint"""
        print(f"\n📡 Testing {endpoint} ({method}) - {concurrent_requests} concurrent, {total_requests} total")
        
        # Track system resources
        process = psutil.Process()
        start_memory = process.memory_info().rss / 1024 / 1024  # MB
        start_cpu = psutil.cpu_percent(interval=1)
        
        results = []
        semaphore = asyncio.Semaphore(concurrent_requests)
        
        async def bounded_request():
            async with semaphore:
                return await self.single_request(endpoint, method, data, headers)
        
        start_time = time.time()
        
        # Execute all requests
        tasks = [bounded_request() for _ in range(total_requests)]
        results = await asyncio.gather(*tasks)
        
        total_time = time.time() - start_time
        
        # Calculate metrics
        successful = [r for r in results if r['success']]
        failed = [r for r in results if not r['success']]
        
        if successful:
            response_times = [r['response_time'] for r in successful]
            avg_response = statistics.mean(response_times)
            min_response = min(response_times)
            max_response = max(response_times)
            p95_response = statistics.quantiles(response_times, n=20)[18] if len(response_times) > 1 else avg_response
        else:
            avg_response = min_response = max_response = p95_response = 0
        
        # Final system metrics
        end_memory = process.memory_info().rss / 1024 / 1024  # MB
        end_cpu = psutil.cpu_percent(interval=1)
        
        result = TestResult(
            endpoint=endpoint,
            total_requests=total_requests,
            successful_requests=len(successful),
            failed_requests=len(failed),
            avg_response_time=avg_response,
            min_response_time=min_response,
            max_response_time=max_response,
            p95_response_time=p95_response,
            requests_per_second=total_requests / total_time,
            requests_per_hour=(total_requests / total_time) * 3600,
            error_rate=(len(failed) / total_requests) * 100,
            memory_usage_mb=end_memory - start_memory,
            cpu_usage_percent=(start_cpu + end_cpu) / 2
        )
        
        # Print immediate results
        print(f"  ✅ Success: {len(successful)}/{total_requests} ({(len(successful)/total_requests)*100:.1f}%)")
        print(f"  ⏱️  Avg Response: {avg_response:.3f}s (min: {min_response:.3f}s, max: {max_response:.3f}s, p95: {p95_response:.3f}s)")
        print(f"  🚀 Throughput: {result.requests_per_second:.1f} req/s ({result.requests_per_hour:.0f} req/hour)")
        print(f"  💾 Memory Impact: {result.memory_usage_mb:+.1f} MB")
        print(f"  🖥️  CPU Usage: {result.cpu_usage_percent:.1f}%")
        
        if failed:
            print(f"  ❌ Errors: {len(failed)} requests failed")
            error_sample = failed[:3]  # Show first 3 errors
            for err in error_sample:
                error_msg = err['error'] or f'HTTP {err["status_code"]}'
                print(f"     - {error_msg}")
        
        return result

async def main():
    print("🔄 AI Search System - Comprehensive Load Testing")
    print("=" * 60)
    
    # Test configurations
    test_configs = [
        {
            'name': 'Health Check',
            'endpoint': '/health',
            'method': 'GET',
            'concurrent': 10,
            'total': 50,
            'description': 'Basic health endpoint'
        },
        {
            'name': 'System Status',
            'endpoint': '/system/status',
            'method': 'GET', 
            'concurrent': 5,
            'total': 25,
            'description': 'Detailed system information'
        },
        {
            'name': 'Metrics',
            'endpoint': '/metrics',
            'method': 'GET',
            'concurrent': 3,
            'total': 15,
            'description': 'System metrics and statistics'
        },
        {
            'name': 'Basic Search',
            'endpoint': '/api/v1/search/basic',
            'method': 'POST',
            'data': {'query': 'artificial intelligence trends', 'max_results': 5},
            'concurrent': 3,
            'total': 15,
            'description': 'Search API without LLM processing'
        }
    ]
    
    # Chat API test (if available)
    chat_configs = [
        {
            'name': 'Basic Chat',
            'endpoint': '/api/v1/chat/complete',
            'method': 'POST',
            'data': {
                'message': 'Hello, can you help me understand machine learning?',
                'session_id': 'test_session',
                'user_id': 'test_user'
            },
            'concurrent': 1,
            'total': 3,
            'description': 'Basic chat with LLM processing'
        }
    ]
    
    all_results = []
    
    async with LoadTester() as tester:
        
        # Test all basic endpoints
        for config in test_configs:
            try:
                result = await tester.load_test_endpoint(
                    endpoint=config['endpoint'],
                    method=config['method'],
                    data=config.get('data'),
                    concurrent_requests=config['concurrent'],
                    total_requests=config['total']
                )
                result.description = config['description']
                all_results.append(result)
                
                # Brief pause between tests
                await asyncio.sleep(1)
                
            except Exception as e:
                print(f"❌ Failed to test {config['name']}: {e}")
        
        # Test chat API (reduced load due to potential heaviness)
        print(f"\n🤖 Testing Chat APIs (reduced load for LLM processing)")
        for config in chat_configs:
            try:
                result = await tester.load_test_endpoint(
                    endpoint=config['endpoint'],
                    method=config['method'],
                    data=config.get('data'),
                    concurrent_requests=config['concurrent'],
                    total_requests=config['total']
                )
                result.description = config['description']
                all_results.append(result)
                
            except Exception as e:
                print(f"❌ Failed to test {config['name']}: {e}")
    
    # Generate comprehensive report
    print("\n" + "=" * 80)
    print("📊 COMPREHENSIVE LOAD TEST REPORT")
    print("=" * 80)
    
    print(f"{'Endpoint':<25} | {'Success%':<8} | {'Avg Time':<9} | {'P95 Time':<9} | {'Req/Hour':<10} | {'Memory':<8}")
    print("-" * 80)
    
    for result in all_results:
        success_pct = (result.successful_requests / result.total_requests) * 100
        print(f"{result.endpoint[:24]:<25} | {success_pct:7.1f}% | {result.avg_response_time:8.3f}s | {result.p95_response_time:8.3f}s | {result.requests_per_hour:9.0f} | {result.memory_usage_mb:+7.1f}MB")
    
    # System capacity analysis
    print(f"\n🎯 CAPACITY ANALYSIS")
    print("-" * 40)
    
    # Find bottlenecks
    bottleneck_endpoints = [r for r in all_results if r.avg_response_time > 1.0]
    fast_endpoints = [r for r in all_results if r.avg_response_time < 0.1]
    
    if fast_endpoints:
        print(f"✅ High Performance Endpoints:")
        for endpoint in fast_endpoints:
            print(f"   {endpoint.endpoint}: {endpoint.requests_per_hour:,.0f} req/hour capacity")
    
    if bottleneck_endpoints:
        print(f"\n⚠️  Performance Bottlenecks:")
        for endpoint in bottleneck_endpoints:
            print(f"   {endpoint.endpoint}: {endpoint.avg_response_time:.2f}s avg ({endpoint.requests_per_hour:,.0f} req/hour)")
    
    # Overall system health
    total_errors = sum(r.failed_requests for r in all_results)
    total_requests = sum(r.total_requests for r in all_results)
    overall_error_rate = (total_errors / total_requests) * 100 if total_requests > 0 else 0
    
    print(f"\n📈 SYSTEM HEALTH SUMMARY")
    print(f"   Overall Error Rate: {overall_error_rate:.2f}%")
    print(f"   Total Memory Impact: {sum(r.memory_usage_mb for r in all_results):+.1f} MB")
    print(f"   Average CPU Usage: {statistics.mean([r.cpu_usage_percent for r in all_results]):.1f}%")
    
    # Current hardware analysis
    print(f"\n🖥️  CURRENT HARDWARE ANALYSIS")
    print(f"   Platform: Windows with 4GB VRAM, 16GB RAM")
    print(f"   Estimated Model Capacity: 1-2 small models (phi3:mini level)")
    print(f"   Memory Constraint: Severe VRAM limitation")
    
    # A5000 projections
    print(f"\n🚀 A5000 PROJECTIONS")
    print(f"   VRAM: 24GB (6x improvement)")
    print(f"   Memory: Supports 3-4 large models simultaneously")
    print(f"   Expected Performance Gains:")
    
    for result in all_results:
        if result.avg_response_time > 0.1:  # LLM-heavy endpoints
            projected_improvement = 3.0  # Conservative 3x improvement
            projected_capacity = result.requests_per_hour * projected_improvement
            print(f"     {result.endpoint}: {projected_capacity:,.0f} req/hour (vs {result.requests_per_hour:,.0f} current)")
        else:  # Fast endpoints
            print(f"     {result.endpoint}: {result.requests_per_hour:,.0f} req/hour (no change expected)")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Testing interrupted by user")
    except Exception as e:
        print(f"\n❌ Testing failed: {e}")
        sys.exit(1)