#!/usr/bin/env python3
"""
Comprehensive endpoint testing script for the ubiquitous AI search system.
Tests all available endpoints and generates a detailed report.
"""

import json
import requests
import time
from typing import Dict, List, Any
from dataclasses import dataclass, asdict
import uuid


@dataclass
class EndpointResult:
    """Result of testing an endpoint"""
    endpoint: str
    method: str
    status_code: int
    success: bool
    response_time: float
    response_size: int
    error_message: str = ""
    response_preview: str = ""


class EndpointTester:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.results: List[EndpointResult] = []
        self.session = requests.Session()
        # Set a simple bearer token for authenticated endpoints
        self.session.headers.update({
            "Authorization": "Bearer test-token",
            "Content-Type": "application/json"
        })

    def test_endpoint(self, endpoint: str, method: str = "GET", data: Dict = None) -> EndpointResult:
        """Test a single endpoint"""
        url = f"{self.base_url}{endpoint}"
        start_time = time.time()
        
        try:
            if method.upper() == "GET":
                response = self.session.get(url)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data)
            elif method.upper() == "DELETE":
                response = self.session.delete(url)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            response_time = time.time() - start_time
            response_size = len(response.content)
            
            # Get response preview (first 200 chars)
            try:
                response_text = response.text[:200]
                if len(response.text) > 200:
                    response_text += "..."
            except:
                response_text = "[Binary or invalid response]"
            
            success = 200 <= response.status_code < 400
            error_message = "" if success else f"HTTP {response.status_code}: {response.text[:100]}"
            
            return EndpointResult(
                endpoint=endpoint,
                method=method.upper(),
                status_code=response.status_code,
                success=success,
                response_time=response_time,
                response_size=response_size,
                error_message=error_message,
                response_preview=response_text
            )
            
        except Exception as e:
            response_time = time.time() - start_time
            return EndpointResult(
                endpoint=endpoint,
                method=method.upper(),
                status_code=0,
                success=False,
                response_time=response_time,
                response_size=0,
                error_message=str(e),
                response_preview=""
            )

    def run_all_tests(self):
        """Run tests for all endpoints"""
        print(f"🚀 Starting comprehensive endpoint testing...")
        print(f"Base URL: {self.base_url}")
        print("=" * 80)
        
        # Health and System endpoints
        print("\n📋 Testing Health & System Endpoints...")
        self.test_and_add("/health", "GET")
        self.test_and_add("/health/ready", "GET")
        self.test_and_add("/health/live", "GET")
        self.test_and_add("/system/status", "GET")
        self.test_and_add("/metrics", "GET")
        
        # Search endpoints
        print("\n🔍 Testing Search Endpoints...")
        self.test_and_add("/api/v1/search/health", "GET")
        
        # Basic search test
        search_payload = {
            "query": "artificial intelligence trends 2024",
            "max_results": 5
        }
        self.test_and_add("/api/v1/search/basic", "POST", search_payload)
        
        # Advanced search test
        advanced_search_payload = {
            "query": "machine learning applications",
            "max_results": 3,
            "language": "en",
            "freshness": "week"
        }
        self.test_and_add("/api/v1/search/advanced", "POST", advanced_search_payload)
        
        # Search test endpoint
        self.test_and_add("/api/v1/search/test", "POST", search_payload)
        
        # Chat endpoints
        print("\n💬 Testing Chat Endpoints...")
        self.test_and_add("/api/v1/chat/health", "GET")
        
        # Chat complete test
        chat_payload = {
            "message": "Hello, can you explain what artificial intelligence is?",
            "session_id": str(uuid.uuid4()),
            "model": "phi3:mini"
        }
        self.test_and_add("/api/v1/chat/complete", "POST", chat_payload)
        
        # Chat stream test
        stream_payload = {
            "message": "Tell me about machine learning",
            "session_id": str(uuid.uuid4()),
            "stream": True
        }
        self.test_and_add("/api/v1/chat/stream", "POST", stream_payload)
        
        # Chat history endpoints
        test_session_id = str(uuid.uuid4())
        self.test_and_add(f"/api/v1/chat/history/{test_session_id}", "GET")
        self.test_and_add(f"/api/v1/chat/history/{test_session_id}", "DELETE")
        
        # Research endpoints
        print("\n📚 Testing Research Endpoints...")
        research_payload = {
            "query": "latest developments in quantum computing",
            "depth": "comprehensive",
            "max_sources": 5
        }
        self.test_and_add("/api/v1/research/deep-dive", "POST", research_payload)
        
        # Adaptive routing endpoints
        print("\n🎯 Testing Adaptive Routing Endpoints...")
        self.test_and_add("/api/v1/adaptive/status", "GET")
        self.test_and_add("/api/v1/adaptive/health", "GET")
        
        # Adaptive config test
        config_payload = {
            "shadow_rate": 0.1,
            "enable_adaptive": True
        }
        self.test_and_add("/api/v1/adaptive/config", "POST", config_payload)
        
        # Routing recommendation test
        recommend_payload = {
            "query": "test query for routing recommendation"
        }
        self.test_and_add("/api/v1/adaptive/recommend", "POST", recommend_payload)
        
        # Arm performance test
        self.test_and_add("/api/v1/adaptive/arms/chat_graph/performance", "GET")
        
        # Shadow comparison debug
        self.test_and_add("/api/v1/adaptive/debug/shadow-comparison", "GET")
        
        # Emergency disable test
        self.test_and_add("/api/v1/adaptive/emergency/disable", "POST")
        
        # Adaptive v2 endpoints
        self.test_and_add("/api/v1/adaptive/v2/status", "GET")
        
        rollout_payload = {
            "real_traffic_percentage": 5.0,
            "safety_threshold": 0.95
        }
        self.test_and_add("/api/v1/adaptive/v2/rollout", "POST", rollout_payload)
        
        self.test_and_add("/api/v1/adaptive/v2/metrics", "GET")
        self.test_and_add("/api/v1/adaptive/v2/cost-analysis", "GET")
        self.test_and_add("/api/v1/adaptive/v2/performance-comparison", "GET")
        
        # Monitoring endpoints
        print("\n📊 Testing Monitoring Endpoints...")
        self.test_and_add("/api/v1/monitoring/system/metrics", "GET")
        self.test_and_add("/api/v1/monitoring/cost/summary", "GET")
        self.test_and_add("/api/v1/monitoring/cost/user/test-user", "GET")
        self.test_and_add("/api/v1/monitoring/cache/performance", "GET")
        self.test_and_add("/api/v1/monitoring/adaptive/comprehensive", "GET")
        self.test_and_add("/api/v1/monitoring/health/production", "GET")
        self.test_and_add("/api/v1/monitoring/dashboard/summary", "GET")
        
        # Analytics endpoints
        print("\n📈 Testing Analytics Endpoints...")
        self.test_and_add("/api/v1/analytics/cost/breakdown", "GET")
        self.test_and_add("/api/v1/analytics/performance/trends", "GET")
        self.test_and_add("/api/v1/analytics/system/resource-usage", "GET")
        self.test_and_add("/api/v1/analytics/adaptive/routing-performance", "GET")
        self.test_and_add("/api/v1/analytics/dashboard/summary", "GET")
        self.test_and_add("/api/v1/analytics/health", "GET")
        
        # Evaluation endpoints
        print("\n🎯 Testing Evaluation Endpoints...")
        evaluation_payload = {
            "query": "What is machine learning?",
            "response": "Machine learning is a subset of artificial intelligence that enables computers to learn and improve from experience without being explicitly programmed.",
            "context": "General AI question",
            "routing_arm": "chat_graph"
        }
        self.test_and_add("/api/v1/evaluation/response/evaluate", "POST", evaluation_payload)
        
        batch_evaluation_payload = {
            "evaluations": [evaluation_payload]
        }
        self.test_and_add("/api/v1/evaluation/response/batch-evaluate", "POST", batch_evaluation_payload)
        
        routing_evaluation_payload = {
            "query": "test routing query",
            "routing_arm": "chat_graph",
            "response_time": 1.5,
            "success": True,
            "cost": 0.001
        }
        self.test_and_add("/api/v1/evaluation/routing/evaluate", "POST", routing_evaluation_payload)
        
        self.test_and_add("/api/v1/evaluation/routing/performance", "GET")
        self.test_and_add("/api/v1/evaluation/metrics/quality-trends", "GET")
        
        print(f"\n✅ Completed testing {len(self.results)} endpoints!")

    def test_and_add(self, endpoint: str, method: str, data: Dict = None):
        """Test an endpoint and add result to list"""
        result = self.test_endpoint(endpoint, method, data)
        self.results.append(result)
        
        # Print real-time status
        status_icon = "✅" if result.success else "❌"
        print(f"{status_icon} {method:6} {endpoint:50} [{result.status_code}] {result.response_time:.3f}s")

    def generate_report(self) -> Dict[str, Any]:
        """Generate comprehensive test report"""
        total_tests = len(self.results)
        successful_tests = sum(1 for r in self.results if r.success)
        failed_tests = total_tests - successful_tests
        
        avg_response_time = sum(r.response_time for r in self.results) / total_tests if total_tests > 0 else 0
        
        # Group results by category
        categories = {
            "Health & System": [r for r in self.results if any(x in r.endpoint for x in ["/health", "/system", "/metrics"])],
            "Search": [r for r in self.results if "/search/" in r.endpoint],
            "Chat": [r for r in self.results if "/chat/" in r.endpoint],
            "Research": [r for r in self.results if "/research/" in r.endpoint],
            "Adaptive Routing": [r for r in self.results if "/adaptive/" in r.endpoint],
            "Monitoring": [r for r in self.results if "/monitoring/" in r.endpoint],
            "Analytics": [r for r in self.results if "/analytics/" in r.endpoint],
            "Evaluation": [r for r in self.results if "/evaluation/" in r.endpoint],
        }
        
        category_stats = {}
        for category, endpoints in categories.items():
            if endpoints:
                category_stats[category] = {
                    "total": len(endpoints),
                    "successful": sum(1 for r in endpoints if r.success),
                    "failed": sum(1 for r in endpoints if not r.success),
                    "avg_response_time": sum(r.response_time for r in endpoints) / len(endpoints),
                    "success_rate": sum(1 for r in endpoints if r.success) / len(endpoints) * 100
                }
        
        return {
            "summary": {
                "total_endpoints_tested": total_tests,
                "successful_tests": successful_tests,
                "failed_tests": failed_tests,
                "success_rate_percentage": (successful_tests / total_tests * 100) if total_tests > 0 else 0,
                "average_response_time_seconds": avg_response_time,
                "test_timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
            },
            "category_breakdown": category_stats,
            "failed_endpoints": [
                {
                    "endpoint": r.endpoint,
                    "method": r.method,
                    "status_code": r.status_code,
                    "error": r.error_message
                }
                for r in self.results if not r.success
            ],
            "detailed_results": [asdict(r) for r in self.results]
        }

    def print_summary(self):
        """Print a summary of test results"""
        report = self.generate_report()
        summary = report["summary"]
        
        print("\n" + "=" * 80)
        print("📊 ENDPOINT TESTING SUMMARY")
        print("=" * 80)
        print(f"Total Endpoints Tested: {summary['total_endpoints_tested']}")
        print(f"Successful Tests: {summary['successful_tests']}")
        print(f"Failed Tests: {summary['failed_tests']}")
        print(f"Success Rate: {summary['success_rate_percentage']:.1f}%")
        print(f"Average Response Time: {summary['average_response_time_seconds']:.3f}s")
        
        print("\n📈 CATEGORY BREAKDOWN:")
        for category, stats in report["category_breakdown"].items():
            success_rate = stats["success_rate"]
            status_icon = "✅" if success_rate == 100 else "⚠️" if success_rate >= 50 else "❌"
            print(f"{status_icon} {category:20} {stats['successful']:2}/{stats['total']:2} ({success_rate:5.1f}%) - {stats['avg_response_time']:.3f}s avg")
        
        if report["failed_endpoints"]:
            print("\n❌ FAILED ENDPOINTS:")
            for failed in report["failed_endpoints"]:
                print(f"   {failed['method']:6} {failed['endpoint']:50} [{failed['status_code']}] {failed['error'][:60]}")
        
        print("\n" + "=" * 80)


def main():
    """Main execution function"""
    tester = EndpointTester()
    
    # Run all tests
    tester.run_all_tests()
    
    # Print summary
    tester.print_summary()
    
    # Save detailed report
    report = tester.generate_report()
    with open("endpoint_test_report.json", "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"\n💾 Detailed report saved to: endpoint_test_report.json")
    
    return report


if __name__ == "__main__":
    main()