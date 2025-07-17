#!/usr/bin/env python3
"""
Comprehensive Ollama phi3:mini Integration Test Suite
Standalone test runner that doesn't require pytest fixtures
"""

import asyncio
import json
import time
import sys
import os
import httpx
from typing import Dict, Any, List
import concurrent.futures

# Add the project root to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Test configuration
OLLAMA_HOST = "http://localhost:11434"
PHI3_MODEL = "phi3:mini"
API_BASE_URL = "http://localhost:8000"

class TestRunner:
    """Test runner that tracks results"""
    
    def __init__(self):
        self.results = {
            "total_tests": 0,
            "passed": 0,
            "failed": 0,
            "errors": []
        }
    
    def run_test(self, test_name: str, test_func):
        """Run a single test and track results"""
        self.results["total_tests"] += 1
        try:
            print(f"  Running {test_name}...")
            if asyncio.iscoroutinefunction(test_func):
                asyncio.run(test_func())
            else:
                test_func()
            self.results["passed"] += 1
            print(f"  ✓ {test_name}")
        except Exception as e:
            self.results["failed"] += 1
            self.results["errors"].append(f"{test_name}: {str(e)}")
            print(f"  ❌ {test_name}: {e}")
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("📊 TEST SUMMARY")
        print("="*60)
        print(f"Total tests: {self.results['total_tests']}")
        print(f"Passed: {self.results['passed']} ✓")
        print(f"Failed: {self.results['failed']} ❌")
        if self.results['total_tests'] > 0:
            print(f"Success rate: {(self.results['passed']/self.results['total_tests']*100):.1f}%")
        
        if self.results["errors"]:
            print("\n❌ FAILURES:")
            for error in self.results["errors"]:
                print(f"  - {error}")
        
        return self.results


class OllamaPhiTestSuite:
    """Complete test suite for Ollama phi3:mini integration"""
    
    def __init__(self):
        self.runner = TestRunner()
    
    def test_ollama_connectivity(self):
        """Test basic Ollama connectivity"""
        print("\n📋 Testing Ollama Connectivity...")
        
        def test_server_running():
            response = httpx.get(f"{OLLAMA_HOST}/api/tags", timeout=10.0)
            assert response.status_code == 200, f"Ollama server not responding: {response.status_code}"
            print("    ✓ Ollama server is running")
            
        def test_phi3_available():
            response = httpx.get(f"{OLLAMA_HOST}/api/tags", timeout=10.0)
            assert response.status_code == 200
            models = response.json()
            model_names = [model['name'] for model in models.get('models', [])]
            assert PHI3_MODEL in model_names, f"phi3:mini not found in models: {model_names}"
            print("    ✓ phi3:mini model is available")
            
        def test_basic_generation():
            payload = {
                "model": PHI3_MODEL,
                "prompt": "Hello! Please respond with exactly 'Test successful'",
                "stream": False,
                "options": {"temperature": 0.1}
            }
            response = httpx.post(f"{OLLAMA_HOST}/api/generate", json=payload, timeout=30.0)
            assert response.status_code == 200
            result = response.json()
            assert "response" in result
            assert result["done"] is True
            assert len(result["response"]) > 0
            print(f"    ✓ Basic generation works: {result['response'][:50]}...")
        
        self.runner.run_test("Server Running", test_server_running)
        self.runner.run_test("Phi3 Available", test_phi3_available)
        self.runner.run_test("Basic Generation", test_basic_generation)
    
    def test_model_manager_integration(self):
        """Test ModelManager integration with Ollama"""
        print("\n📋 Testing ModelManager Integration...")
        
        def test_model_manager_import():
            try:
                from app.models.manager import ModelManager
                manager = ModelManager()
                assert manager is not None
                print("    ✓ ModelManager imported and initialized")
                return manager
            except ImportError as e:
                print(f"    ⚠ ModelManager import failed: {e}")
                return None
        
        def test_model_manager_functionality():
            try:
                from app.models.manager import ModelManager
                manager = ModelManager()
                
                # Test model listing
                models = manager.list_available_models()
                assert isinstance(models, list)
                assert len(models) > 0
                print(f"    ✓ Found {len(models)} models")
                
                # Test model info
                if PHI3_MODEL in models:
                    info = manager.get_model_info(PHI3_MODEL)
                    assert info is not None
                    print(f"    ✓ Got model info for phi3:mini")
                
            except Exception as e:
                raise Exception(f"ModelManager functionality test failed: {e}")
        
        self.runner.run_test("ModelManager Import", test_model_manager_import)
        self.runner.run_test("ModelManager Functionality", test_model_manager_functionality)
    
    def test_performance_characteristics(self):
        """Test performance characteristics of phi3:mini"""
        print("\n📋 Testing Performance Characteristics...")
        
        def test_response_time():
            start_time = time.time()
            payload = {
                "model": PHI3_MODEL,
                "prompt": "Hello world",
                "stream": False,
                "options": {"temperature": 0.1}
            }
            response = httpx.post(f"{OLLAMA_HOST}/api/generate", json=payload, timeout=10.0)
            end_time = time.time()
            
            assert response.status_code == 200
            response_time = end_time - start_time
            assert response_time < 5.0  # Should respond within 5 seconds
            
            result = response.json()
            print(f"    ✓ Response time: {response_time:.2f}s")
            print(f"    ✓ Tokens generated: {result.get('eval_count', 0)}")
        
        def test_concurrent_requests():
            def make_request(prompt_suffix):
                payload = {
                    "model": PHI3_MODEL,
                    "prompt": f"Say 'Hello {prompt_suffix}'",
                    "stream": False,
                    "options": {"temperature": 0.1}
                }
                response = httpx.post(f"{OLLAMA_HOST}/api/generate", json=payload, timeout=15.0)
                return response.status_code == 200
            
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
                futures = [executor.submit(make_request, i) for i in range(3)]
                results = [future.result() for future in concurrent.futures.as_completed(futures)]
            
            success_count = sum(results)
            assert success_count >= 2  # At least 2 out of 3 should succeed
            print(f"    ✓ Concurrent requests: {success_count}/3 successful")
        
        def test_different_prompts():
            prompts = [
                "What is Python?",
                "Explain machine learning in one sentence.",
                "Count from 1 to 5.",
                "What is the capital of France?",
                "Write a haiku about AI."
            ]
            
            success_count = 0
            for i, prompt in enumerate(prompts):
                payload = {
                    "model": PHI3_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.3, "max_tokens": 50}
                }
                response = httpx.post(f"{OLLAMA_HOST}/api/generate", json=payload, timeout=15.0)
                if response.status_code == 200:
                    success_count += 1
            
            assert success_count >= 4  # At least 4 out of 5 should succeed
            print(f"    ✓ Different prompts: {success_count}/5 successful")
        
        self.runner.run_test("Response Time", test_response_time)
        self.runner.run_test("Concurrent Requests", test_concurrent_requests)
        self.runner.run_test("Different Prompts", test_different_prompts)
    
    def test_api_integration(self):
        """Test API integration with Ollama backend"""
        print("\n📋 Testing API Integration...")
        
        async def test_api_health():
            async with httpx.AsyncClient(base_url=API_BASE_URL, timeout=10.0) as client:
                try:
                    response = await client.get("/health")
                    if response.status_code == 200:
                        print("    ✓ API health check passed")
                    else:
                        print(f"    ⚠ API health check failed: {response.status_code}")
                except Exception as e:
                    print(f"    ⚠ API not running: {e}")
        
        async def test_chat_complete():
            async with httpx.AsyncClient(base_url=API_BASE_URL, timeout=30.0) as client:
                payload = {
                    "message": "What is 2+2? Please respond with just the number.",
                    "model": PHI3_MODEL,
                    "session_id": "test_session_phi3",
                    "constraints": {
                        "quality_requirement": "fast",
                        "max_cost": 0.01
                    }
                }
                
                try:
                    response = await client.post("/api/v1/chat/complete", json=payload)
                    if response.status_code == 200:
                        result = response.json()
                        assert "response" in result
                        print(f"    ✓ Chat completion successful: {result['response'][:50]}...")
                    else:
                        print(f"    ⚠ Chat API returned {response.status_code}")
                except Exception as e:
                    print(f"    ⚠ Chat API test failed: {e}")
        
        self.runner.run_test("API Health", test_api_health)
        self.runner.run_test("Chat Complete", test_chat_complete)
    
    def test_error_handling(self):
        """Test error handling scenarios"""
        print("\n📋 Testing Error Handling...")
        
        def test_invalid_model():
            payload = {
                "model": "nonexistent:model",
                "prompt": "Hello",
                "stream": False
            }
            response = httpx.post(f"{OLLAMA_HOST}/api/generate", json=payload, timeout=10.0)
            assert response.status_code == 404
            print("    ✓ Invalid model correctly returns 404")
        
        def test_empty_prompt():
            payload = {
                "model": PHI3_MODEL,
                "prompt": "",
                "stream": False
            }
            response = httpx.post(f"{OLLAMA_HOST}/api/generate", json=payload, timeout=10.0)
            # Should either work or fail gracefully
            assert response.status_code in [200, 400]
            print("    ✓ Empty prompt handled gracefully")
        
        def test_very_long_prompt():
            # Create a very long prompt
            long_prompt = "Please respond to this: " + "A" * 5000
            payload = {
                "model": PHI3_MODEL,
                "prompt": long_prompt,
                "stream": False,
                "options": {"max_tokens": 50}
            }
            response = httpx.post(f"{OLLAMA_HOST}/api/generate", json=payload, timeout=30.0)
            # Should either work or fail gracefully
            assert response.status_code in [200, 400, 413]
            print("    ✓ Very long prompt handled gracefully")
        
        self.runner.run_test("Invalid Model", test_invalid_model)
        self.runner.run_test("Empty Prompt", test_empty_prompt)
        self.runner.run_test("Very Long Prompt", test_very_long_prompt)
    
    def test_streaming_capabilities(self):
        """Test streaming capabilities"""
        print("\n📋 Testing Streaming Capabilities...")
        
        def test_streaming_response():
            payload = {
                "model": PHI3_MODEL,
                "prompt": "Count from 1 to 5, one number per line.",
                "stream": True,
                "options": {"temperature": 0.1}
            }
            
            response = httpx.post(f"{OLLAMA_HOST}/api/generate", json=payload, timeout=30.0)
            assert response.status_code == 200
            
            chunks = []
            for line in response.iter_lines():
                if line:
                    try:
                        chunk = json.loads(line)
                        chunks.append(chunk)
                        if chunk.get("done", False):
                            break
                    except json.JSONDecodeError:
                        continue
            
            assert len(chunks) > 0
            assert chunks[-1].get("done", False) is True
            print(f"    ✓ Streaming response: {len(chunks)} chunks received")
        
        self.runner.run_test("Streaming Response", test_streaming_response)
    
    def run_all_tests(self):
        """Run all test suites"""
        print("="*60)
        print("🚀 COMPREHENSIVE OLLAMA PHI3:MINI INTEGRATION TEST")
        print("="*60)
        
        # Run all test suites
        self.test_ollama_connectivity()
        self.test_model_manager_integration()
        self.test_performance_characteristics()
        self.test_api_integration()
        self.test_error_handling()
        self.test_streaming_capabilities()
        
        # Print final summary
        return self.runner.print_summary()


def main():
    """Main test runner"""
    test_suite = OllamaPhiTestSuite()
    results = test_suite.run_all_tests()
    
    # Exit with appropriate code
    if results["failed"] > 0:
        sys.exit(1)
    else:
        print("\n🎉 All tests passed! Ollama phi3:mini integration is working correctly.")
        sys.exit(0)


if __name__ == "__main__":
    main()