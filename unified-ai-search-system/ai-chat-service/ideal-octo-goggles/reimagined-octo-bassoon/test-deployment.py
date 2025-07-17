#!/usr/bin/env python3
"""
Comprehensive test suite for the unified AI system Docker deployment
Tests all major endpoints and functionality
"""

import asyncio
import aiohttp
import json
import time
import sys
from datetime import datetime

class UnifiedSystemTester:
    def __init__(self):
        self.base_url = "http://localhost:8000"
        self.search_url = "http://localhost:8001"
        self.results = []
        
    async def test_endpoint(self, session, method, url, data=None, expected_status=200):
        """Test a single endpoint"""
        try:
            start_time = time.time()
            
            if method.upper() == "GET":
                async with session.get(url) as response:
                    status = response.status
                    content = await response.text()
            elif method.upper() == "POST":
                async with session.post(url, json=data) as response:
                    status = response.status
                    content = await response.text()
            
            duration = time.time() - start_time
            
            success = status == expected_status
            result = {
                "endpoint": url,
                "method": method,
                "status": status,
                "expected_status": expected_status,
                "success": success,
                "duration": round(duration, 3),
                "response_size": len(content)
            }
            
            self.results.append(result)
            
            status_icon = "✓" if success else "✗"
            color = "\033[92m" if success else "\033[91m"
            reset = "\033[0m"
            
            print(f"{color}{status_icon}{reset} {method} {url} - {status} ({duration:.3f}s)")
            
            return success, content
            
        except Exception as e:
            print(f"\033[91m✗\033[0m {method} {url} - ERROR: {str(e)}")
            self.results.append({
                "endpoint": url,
                "method": method,
                "success": False,
                "error": str(e)
            })
            return False, str(e)
    
    async def run_tests(self):
        """Run all tests"""
        print("\033[96m=== Unified AI System Test Suite ===\033[0m")
        print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print()
        
        async with aiohttp.ClientSession() as session:
            # Basic health checks
            print("\033[94m--- Health Checks ---\033[0m")
            await self.test_endpoint(session, "GET", f"{self.base_url}/health")
            await self.test_endpoint(session, "GET", f"{self.search_url}/health")
            
            # UI endpoints
            print("\n\033[94m--- UI Endpoints ---\033[0m")
            await self.test_endpoint(session, "GET", f"{self.base_url}/")
            await self.test_endpoint(session, "GET", f"{self.base_url}/chat")
            await self.test_endpoint(session, "GET", f"{self.base_url}/demo")
            
            # API status
            print("\n\033[94m--- API Status ---\033[0m")
            await self.test_endpoint(session, "GET", f"{self.base_url}/api/chat/status")
            
            # Chat API tests
            print("\n\033[94m--- Chat API Tests ---\033[0m")
            
            # Test unified chat
            chat_data = {
                "message": "Hello, this is a test message",
                "mode": "unified"
            }
            await self.test_endpoint(session, "POST", f"{self.base_url}/api/chat/unified", chat_data)
            
            # Test chat mode
            chat_data["mode"] = "chat"
            await self.test_endpoint(session, "POST", f"{self.base_url}/api/chat/unified", chat_data)
            
            # Test search mode
            search_data = {
                "message": "test search query",
                "mode": "search"
            }
            await self.test_endpoint(session, "POST", f"{self.base_url}/api/chat/unified", search_data)
            
            # Direct search API test
            print("\n\033[94m--- Search API Tests ---\033[0m")
            search_payload = {
                "query": "test search",
                "limit": 5
            }
            await self.test_endpoint(session, "POST", f"{self.search_url}/search", search_payload)
            
            # Performance test
            print("\n\033[94m--- Performance Tests ---\033[0m")
            start_time = time.time()
            tasks = []
            for i in range(5):
                task = self.test_endpoint(session, "GET", f"{self.base_url}/health")
                tasks.append(task)
            
            await asyncio.gather(*tasks)
            concurrent_duration = time.time() - start_time
            print(f"Concurrent health checks (5x): {concurrent_duration:.3f}s")
        
        # Generate report
        self.generate_report()
    
    def generate_report(self):
        """Generate test report"""
        print("\n\033[96m=== Test Report ===\033[0m")
        
        total_tests = len(self.results)
        successful_tests = sum(1 for r in self.results if r.get("success", False))
        failed_tests = total_tests - successful_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"\033[92mPassed: {successful_tests}\033[0m")
        print(f"\033[91mFailed: {failed_tests}\033[0m")
        print(f"Success Rate: {(successful_tests/total_tests*100):.1f}%")
        
        # Performance summary
        durations = [r.get("duration", 0) for r in self.results if "duration" in r]
        if durations:
            avg_duration = sum(durations) / len(durations)
            max_duration = max(durations)
            print(f"Average Response Time: {avg_duration:.3f}s")
            print(f"Slowest Response: {max_duration:.3f}s")
        
        # Failed tests details
        if failed_tests > 0:
            print("\n\033[91m--- Failed Tests ---\033[0m")
            for result in self.results:
                if not result.get("success", False):
                    endpoint = result.get("endpoint", "Unknown")
                    error = result.get("error", f"Status: {result.get('status', 'Unknown')}")
                    print(f"✗ {endpoint}: {error}")
        
        print(f"\nTest completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Exit code
        return 0 if failed_tests == 0 else 1

async def main():
    """Main test function"""
    if len(sys.argv) > 1 and sys.argv[1] in ["--help", "-h"]:
        print("Unified AI System Test Suite")
        print("Usage: python test-deployment.py")
        print("Make sure the Docker containers are running before running tests.")
        return 0
    
    tester = UnifiedSystemTester()
    exit_code = await tester.run_tests()
    return exit_code

if __name__ == "__main__":
    try:
        exit_code = asyncio.run(main())
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n\033[93mTests interrupted by user\033[0m")
        sys.exit(1)
    except Exception as e:
        print(f"\n\033[91mTest suite error: {str(e)}\033[0m")
        sys.exit(1)
