"""
Minimal working demonstration of the AI Search System Integration.
This shows how ubiquitous-octo-invention can integrate with ideal-octo-goggles
to create a unified search system.
"""

import asyncio
import aiohttp
import json
from typing import Dict, Any, List

class MockUltraFastSearchProvider:
    """Mock provider that demonstrates the integration pattern"""
    
    def __init__(self, base_url: str = "http://localhost:8001"):
        self.base_url = base_url
        self.session = None
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def search(self, query: str, max_results: int = 10) -> Dict[str, Any]:
        """Search using the ultra-fast engine"""
        # This would normally call the actual ideal-octo-goggles service
        # For now, we'll mock it to demonstrate the integration
        
        mock_response = {
            "success": True,
            "results": [
                {
                    "id": f"doc_{i}",
                    "title": f"Document {i} about {query}",
                    "content": f"This is mock content for document {i} related to '{query}'. " +
                              "In a real integration, this would come from the ultra-fast search engine.",
                    "score": 0.95 - (i * 0.1),
                    "source": "ultra-fast-engine"
                }
                for i in range(min(max_results, 3))
            ],
            "total_found": 3,
            "response_time_ms": 15.2,
            "query": query,
            "engine": "ideal-octo-goggles-ultra-fast"
        }
        
        return mock_response

class UnifiedSearchOrchestrator:
    """Orchestrates search across multiple providers"""
    
    def __init__(self):
        self.providers = {}
    
    def add_provider(self, name: str, provider):
        self.providers[name] = provider
    
    async def unified_search(self, query: str, max_results: int = 10) -> Dict[str, Any]:
        """Perform unified search across all providers"""
        results = []
        
        # Search using document provider (ideal-octo-goggles)
        if "ultra_fast_search" in self.providers:
            doc_results = await self.providers["ultra_fast_search"].search(query, max_results)
            if doc_results.get("success"):
                for result in doc_results.get("results", []):
                    result["provider"] = "ultra_fast_search"
                    results.append(result)
        
        # In a real implementation, this would also search using:
        # - Web search (Brave Search API)
        # - Academic search
        # - Any other configured providers
        
        # Mock web search results for demonstration
        web_results = [
            {
                "id": f"web_{i}",
                "title": f"Web result {i} for {query}",
                "content": f"This is a web search result for '{query}'. " +
                          "In real integration, this would come from Brave Search or other web providers.",
                "score": 0.85 - (i * 0.1),
                "source": "web-search",
                "provider": "brave_search",
                "url": f"https://example.com/result-{i}"
            }
            for i in range(2)
        ]
        results.extend(web_results)
        
        # Sort by score
        results.sort(key=lambda x: x.get("score", 0), reverse=True)
        
        return {
            "success": True,
            "query": query,
            "total_results": len(results),
            "results": results[:max_results],
            "providers_used": list(set(r.get("provider") for r in results)),
            "unified_search": True
        }

async def demonstrate_integration():
    """Demonstrate the unified search integration"""
    
    print("🚀 AI Search System Integration Demonstration")
    print("=" * 60)
    
    # Initialize the unified search orchestrator
    orchestrator = UnifiedSearchOrchestrator()
    
    # Add the ultra-fast search provider
    async with MockUltraFastSearchProvider() as ultra_fast_provider:
        orchestrator.add_provider("ultra_fast_search", ultra_fast_provider)
        
        # Test queries
        test_queries = [
            "machine learning algorithms",
            "python web development",
            "artificial intelligence research"
        ]
        
        for query in test_queries:
            print(f"\n🔍 Testing query: '{query}'")
            print("-" * 40)
            
            # Perform unified search
            results = await orchestrator.unified_search(query, max_results=5)
            
            if results.get("success"):
                print(f"✅ Found {results['total_results']} results")
                print(f"📊 Providers used: {', '.join(results['providers_used'])}")
                
                print("\n📋 Top results:")
                for i, result in enumerate(results["results"][:3], 1):
                    print(f"  {i}. [{result['provider']}] {result['title']}")
                    print(f"     Score: {result['score']:.2f}")
                    if result.get('url'):
                        print(f"     URL: {result['url']}")
                    print()
            else:
                print("❌ Search failed")
    
    print("\n" + "=" * 60)
    print("🎯 Integration Architecture Summary:")
    print("   • ubiquitous-octo-invention: AI orchestration & conversation")
    print("   • ideal-octo-goggles: Ultra-fast document search")
    print("   • Unified search: Intelligent routing & result synthesis")
    print("   • Multi-provider: Web search, documents, academic sources")
    print("\n✅ Integration demonstration completed successfully!")

if __name__ == "__main__":
    asyncio.run(demonstrate_integration())
