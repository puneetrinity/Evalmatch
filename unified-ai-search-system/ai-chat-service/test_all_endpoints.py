#!/usr/bin/env python3
"""
Comprehensive endpoint testing to identify functional vs non-functional endpoints
"""

import httpx
import asyncio
import json
from typing import Dict, List, Tuple

class EndpointTester:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.results = {
            "functional": [],
            "non_functional": [],
            "authentication_required": [],
            "method_not_allowed": [],
            "server_errors": []
        }
    
    async def test_endpoint(self, method: str, path: str) -> Tuple[str, int, str]:
        """Test a single endpoint and return method, status_code, response"""
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                if method.upper() == "GET":
                    response = await client.get(f"{self.base_url}{path}")
                elif method.upper() == "POST":
                    # For POST endpoints, try with minimal valid JSON
                    response = await client.post(f"{self.base_url}{path}", json={})
                elif method.upper() == "DELETE":
                    response = await client.delete(f"{self.base_url}{path}")
                else:
                    return method, 405, "Method not supported in test"
                
                return method, response.status_code, response.text[:200]
            except Exception as e:
                return method, 0, str(e)[:200]
    
    async def test_all_endpoints(self):
        """Test all endpoints systematically"""
        
        # Get endpoints from OpenAPI spec
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.get(f"{self.base_url}/openapi.json")
                openapi_data = response.json()
                paths = openapi_data.get('paths', {})
            except Exception as e:
                print(f"Failed to get OpenAPI spec: {e}")
                return
        
        endpoints_to_test = []
        for path, methods in paths.items():
            for method in methods.keys():
                endpoints_to_test.append((method.upper(), path))
        
        print(f"Found {len(endpoints_to_test)} endpoints to test...")
        
        # Test each endpoint
        for method, path in endpoints_to_test:
            # Skip endpoints that need path parameters
            if "{" in path and "}" in path:
                # Test with dummy values
                test_path = path.replace("{session_id}", "test_session")
                test_path = test_path.replace("{model_name}", "phi3:mini")
                test_path = test_path.replace("{arm_id}", "test_arm")
                test_path = test_path.replace("{user_id}", "test_user")
            else:
                test_path = path
            
            method_result, status_code, response_text = await self.test_endpoint(method, test_path)
            
            endpoint_info = {
                "method": method,
                "path": path,
                "test_path": test_path,
                "status_code": status_code,
                "response_preview": response_text
            }
            
            # Categorize results
            if status_code == 200:
                self.results["functional"].append(endpoint_info)
            elif status_code == 401 or status_code == 403:
                self.results["authentication_required"].append(endpoint_info)
            elif status_code == 405:
                self.results["method_not_allowed"].append(endpoint_info)
            elif status_code >= 500:
                self.results["server_errors"].append(endpoint_info)
            elif status_code == 0:
                self.results["non_functional"].append(endpoint_info)
            else:
                # 404, 422, etc.
                self.results["non_functional"].append(endpoint_info)
            
            print(f"  {method} {path} -> {status_code}")
    
    def print_results(self):
        """Print comprehensive results"""
        print("\n" + "="*80)
        print("📊 COMPREHENSIVE ENDPOINT AUDIT RESULTS")
        print("="*80)
        
        print(f"\n✅ FUNCTIONAL ENDPOINTS ({len(self.results['functional'])})")
        print("-" * 40)
        for endpoint in self.results["functional"]:
            print(f"  ✅ {endpoint['method']} {endpoint['path']}")
        
        print(f"\n❌ NON-FUNCTIONAL ENDPOINTS ({len(self.results['non_functional'])})")
        print("-" * 40)
        for endpoint in self.results["non_functional"]:
            print(f"  ❌ {endpoint['method']} {endpoint['path']} -> {endpoint['status_code']}")
            if endpoint['response_preview']:
                print(f"     Error: {endpoint['response_preview'][:100]}...")
        
        print(f"\n🔒 AUTHENTICATION REQUIRED ({len(self.results['authentication_required'])})")
        print("-" * 40)
        for endpoint in self.results["authentication_required"]:
            print(f"  🔒 {endpoint['method']} {endpoint['path']} -> {endpoint['status_code']}")
        
        print(f"\n🚫 METHOD NOT ALLOWED ({len(self.results['method_not_allowed'])})")
        print("-" * 40)
        for endpoint in self.results["method_not_allowed"]:
            print(f"  🚫 {endpoint['method']} {endpoint['path']} -> {endpoint['status_code']}")
        
        print(f"\n💥 SERVER ERRORS ({len(self.results['server_errors'])})")
        print("-" * 40)
        for endpoint in self.results["server_errors"]:
            print(f"  💥 {endpoint['method']} {endpoint['path']} -> {endpoint['status_code']}")
            if endpoint['response_preview']:
                print(f"     Error: {endpoint['response_preview'][:100]}...")
        
        # Summary
        total = len(self.results["functional"]) + len(self.results["non_functional"]) + \
                len(self.results["authentication_required"]) + len(self.results["method_not_allowed"]) + \
                len(self.results["server_errors"])
        
        functional_rate = (len(self.results["functional"]) / total * 100) if total > 0 else 0
        
        print(f"\n📈 SUMMARY:")
        print(f"  Total Endpoints: {total}")
        print(f"  Functional: {len(self.results['functional'])} ({functional_rate:.1f}%)")
        print(f"  Non-functional: {len(self.results['non_functional'])}")
        print(f"  Auth Required: {len(self.results['authentication_required'])}")
        print(f"  Method Issues: {len(self.results['method_not_allowed'])}")
        print(f"  Server Errors: {len(self.results['server_errors'])}")

async def test_specific_critical_endpoints():
    """Test critical endpoints with proper payloads"""
    print("\n" + "="*80)
    print("🎯 TESTING CRITICAL ENDPOINTS WITH PROPER PAYLOADS")
    print("="*80)
    
    critical_tests = [
        # Chat endpoints
        ("POST", "/api/v1/chat/complete", {"message": "Hello", "session_id": "test"}),
        ("POST", "/api/v1/chat/stream", {"messages": [{"role": "user", "content": "Hello"}], "stream": True}),
        
        # Search endpoints  
        ("POST", "/api/v1/search/basic", {"query": "test"}),
        ("POST", "/api/v1/search/advanced", {"query": "test", "sources": ["web"]}),
        
        # Research endpoints
        ("POST", "/api/v1/research/deep-dive", {"topic": "AI", "depth": "basic"}),
        
        # Models endpoints
        ("GET", "/api/v1/models/list", None),
        
        # Debug endpoints
        ("POST", "/debug/test-chat", {"message": "test"}),
        ("POST", "/debug/test-search", {"query": "test"}),
    ]
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        for method, path, payload in critical_tests:
            try:
                print(f"\n🔍 Testing {method} {path}")
                
                if method == "GET":
                    response = await client.get(f"http://localhost:8000{path}")
                else:
                    response = await client.post(f"http://localhost:8000{path}", json=payload)
                
                print(f"  Status: {response.status_code}")
                
                if response.status_code == 200:
                    try:
                        data = response.json()
                        print(f"  ✅ Success: {str(data)[:100]}...")
                    except:
                        print(f"  ✅ Success: {response.text[:100]}...")
                else:
                    print(f"  ❌ Failed: {response.text[:200]}")
                    
            except Exception as e:
                print(f"  💥 Exception: {e}")

async def main():
    """Run comprehensive endpoint testing"""
    print("🔍 COMPREHENSIVE ENDPOINT FUNCTIONALITY AUDIT")
    print("Testing ALL endpoints to identify what's working vs not working")
    
    tester = EndpointTester()
    await tester.test_all_endpoints()
    tester.print_results()
    
    await test_specific_critical_endpoints()
    
    print("\n" + "="*80)
    print("🎯 AUDIT COMPLETE")
    print("This audit shows exactly which endpoints are functional vs broken")
    print("="*80)

if __name__ == "__main__":
    asyncio.run(main())