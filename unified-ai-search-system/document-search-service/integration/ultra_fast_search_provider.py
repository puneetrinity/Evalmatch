"""
Ultra Fast Search Provider for ubiquitous-octo-invention Integration
This module provides the search functionality adapter for the LangGraph-based AI system.
"""
import aiohttp
import asyncio
from typing import List, Dict, Any, Optional, Union
import logging
from datetime import datetime
import json

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class UltraFastSearchProvider:
    """Provider for Ultra Fast Document Search System"""
    
    def __init__(self, search_service_url: str = "http://localhost:80"):
        """
        Initialize the Ultra Fast Search Provider
        
        Args:
            search_service_url: URL of the ultra fast search system
        """
        self.base_url = search_service_url
        self.cost_per_search = 0.001  # Very low cost for local search
        self.timeout = 30  # seconds
        
    async def search_documents(
        self, 
        query: str, 
        num_results: int = 10,
        filters: Optional[Dict] = None,
        search_type: str = "hybrid"  # hybrid, semantic, keyword
    ) -> Dict[str, Any]:
        """
        Search documents using the ultra-fast system.
        
        Args:
            query: Search query text
            num_results: Number of results to return
            filters: Optional filters (experience, skills, etc.)
            search_type: Type of search to perform
            
        Returns:
            Dictionary with search results and metadata
        """
        
        payload = {
            "query": query,
            "num_results": num_results,
            "filters": filters or {},
            "search_type": search_type
        }
        
        start_time = datetime.now()
        
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=self.timeout)) as session:
                async with session.post(
                    f"{self.base_url}/api/v2/search/ultra-fast",
                    json=payload,
                    headers={"Content-Type": "application/json"}
                ) as response:
                    
                    end_time = datetime.now()
                    response_time = (end_time - start_time).total_seconds() * 1000
                    
                    if response.status == 200:
                        result = await response.json()
                        
                        # Format results for LangGraph consumption
                        formatted_results = []
                        for item in result.get("results", []):
                            formatted_results.append({
                                "id": item.get("id", "unknown"),
                                "content": item.get("content", ""),
                                "score": item.get("score", 0.0),
                                "metadata": {
                                    "source": "ultra_fast_search",
                                    "experience": item.get("experience"),
                                    "skills": item.get("skills", []),
                                    "location": item.get("location"),
                                    "original_data": item
                                }
                            })
                        
                        return {
                            "success": True,
                            "results": formatted_results,
                            "total_found": result.get("total_found", len(formatted_results)),
                            "response_time_ms": response_time,
                            "cost": self.cost_per_search,
                            "provider": "ultra_fast_search",
                            "query": query,
                            "filters_applied": filters,
                            "timestamp": start_time.isoformat()
                        }
                    else:
                        error_text = await response.text()
                        logger.error(f"Search request failed: {response.status} - {error_text}")
                        return {
                            "success": False,
                            "error": f"HTTP {response.status}: {error_text}",
                            "response_time_ms": response_time,
                            "cost": 0,
                            "provider": "ultra_fast_search"
                        }
                        
        except asyncio.TimeoutError:
            logger.error(f"Search request timed out after {self.timeout} seconds")
            return {
                "success": False,
                "error": f"Request timed out after {self.timeout} seconds",
                "response_time_ms": self.timeout * 1000,
                "cost": 0,
                "provider": "ultra_fast_search"
            }
        except Exception as e:
            logger.error(f"Search request failed: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "response_time_ms": 0,
                "cost": 0,
                "provider": "ultra_fast_search"
            }
    
    async def health_check(self) -> Dict[str, Any]:
        """Check if the search service is healthy"""
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
                async with session.get(f"{self.base_url}/api/v2/health") as response:
                    if response.status == 200:
                        result = await response.json()
                        return {
                            "healthy": True,
                            "status": result,
                            "provider": "ultra_fast_search"
                        }
                    else:
                        return {
                            "healthy": False,
                            "error": f"HTTP {response.status}",
                            "provider": "ultra_fast_search"
                        }
        except Exception as e:
            return {
                "healthy": False,
                "error": str(e),
                "provider": "ultra_fast_search"
            }
    
    async def get_performance_stats(self) -> Dict[str, Any]:
        """Get performance statistics from the search service"""
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
                async with session.get(f"{self.base_url}/api/v2/search/performance") as response:
                    if response.status == 200:
                        result = await response.json()
                        return {
                            "success": True,
                            "stats": result,
                            "provider": "ultra_fast_search"
                        }
                    else:
                        return {
                            "success": False,
                            "error": f"HTTP {response.status}",
                            "provider": "ultra_fast_search"
                        }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "provider": "ultra_fast_search"
            }
    
    async def add_document(self, document: Dict[str, Any]) -> Dict[str, Any]:
        """Add a new document to the search index"""
        try:
            payload = {"document": document}
            
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
                async with session.post(
                    f"{self.base_url}/api/v2/search/add-document",
                    json=payload,
                    headers={"Content-Type": "application/json"}
                ) as response:
                    
                    if response.status == 200:
                        result = await response.json()
                        return {
                            "success": True,
                            "result": result,
                            "provider": "ultra_fast_search"
                        }
                    else:
                        error_text = await response.text()
                        return {
                            "success": False,
                            "error": f"HTTP {response.status}: {error_text}",
                            "provider": "ultra_fast_search"
                        }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "provider": "ultra_fast_search"
            }
    
    async def update_document(self, document_id: str, document: Dict[str, Any]) -> Dict[str, Any]:
        """Update an existing document in the search index"""
        try:
            payload = {
                "document_id": document_id,
                "document": document
            }
            
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
                async with session.put(
                    f"{self.base_url}/api/v2/search/update-document",
                    json=payload,
                    headers={"Content-Type": "application/json"}
                ) as response:
                    
                    if response.status == 200:
                        result = await response.json()
                        return {
                            "success": True,
                            "result": result,
                            "provider": "ultra_fast_search"
                        }
                    else:
                        error_text = await response.text()
                        return {
                            "success": False,
                            "error": f"HTTP {response.status}: {error_text}",
                            "provider": "ultra_fast_search"
                        }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "provider": "ultra_fast_search"
            }
    
    async def delete_document(self, document_id: str) -> Dict[str, Any]:
        """Delete a document from the search index"""
        try:
            payload = {"document_id": document_id}
            
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
                async with session.delete(
                    f"{self.base_url}/api/v2/search/delete-document",
                    json=payload,
                    headers={"Content-Type": "application/json"}
                ) as response:
                    
                    if response.status == 200:
                        result = await response.json()
                        return {
                            "success": True,
                            "result": result,
                            "provider": "ultra_fast_search"
                        }
                    else:
                        error_text = await response.text()
                        return {
                            "success": False,
                            "error": f"HTTP {response.status}: {error_text}",
                            "provider": "ultra_fast_search"
                        }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "provider": "ultra_fast_search"
            }


# Factory function for easy integration
def create_search_provider(search_service_url: str = "http://localhost:80") -> UltraFastSearchProvider:
    """Create and return a search provider instance"""
    return UltraFastSearchProvider(search_service_url)


# Example usage and testing functions
async def test_search_provider():
    """Test the search provider functionality"""
    provider = create_search_provider()
    
    # Test health check
    print("Testing health check...")
    health = await provider.health_check()
    print(f"Health: {health}")
    
    if health.get("healthy"):
        # Test search
        print("\nTesting search...")
        search_result = await provider.search_documents(
            query="python developer",
            num_results=5,
            filters={"min_experience": 2}
        )
        print(f"Search result: {json.dumps(search_result, indent=2)}")
        
        # Test performance stats
        print("\nTesting performance stats...")
        stats = await provider.get_performance_stats()
        print(f"Stats: {json.dumps(stats, indent=2)}")
    else:
        print("Search service is not healthy. Make sure it's running!")


if __name__ == "__main__":
    # Run tests
    asyncio.run(test_search_provider())
