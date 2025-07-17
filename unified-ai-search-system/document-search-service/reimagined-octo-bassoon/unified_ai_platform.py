"""
Unified AI Platform Integration Adapter
Provides a simple Python interface to interact with both systems
"""

import asyncio
import aiohttp
import json
import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class SearchResult:
    """Unified search result structure"""
    id: str
    title: str
    content: str
    score: float
    source: str
    metadata: Dict[str, Any]

@dataclass
class ConversationResult:
    """Conversation response structure"""
    response: str
    context: Optional[str]
    sources: List[str]
    metadata: Dict[str, Any]

class UnifiedAIPlatform:
    """Main interface to the unified AI platform"""
    
    def __init__(self, 
                 conversation_url: str = "http://localhost:8000",
                 document_search_url: str = "http://localhost:8080",
                 proxy_url: str = "http://localhost"):
        """
        Initialize the unified AI platform client
        
        Args:
            conversation_url: URL of the conversation AI service
            document_search_url: URL of the document search service
            proxy_url: URL of the unified proxy (optional)
        """
        self.conversation_url = conversation_url
        self.document_search_url = document_search_url
        self.proxy_url = proxy_url
        self.session = None
        self.timeout = 30
        
    async def __aenter__(self):
        """Async context manager entry"""
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()
    
    async def health_check(self) -> Dict[str, Any]:
        """Check the health of both systems"""
        try:
            # Check conversation AI
            async with self.session.get(f"{self.conversation_url}/health/live") as response:
                conversation_health = "healthy" if response.status == 200 else "unhealthy"
            
            # Check document search
            async with self.session.get(f"{self.document_search_url}/api/v2/health") as response:
                document_health = "healthy" if response.status == 200 else "unhealthy"
            
            # Check proxy (if available)
            proxy_health = "healthy"
            try:
                async with self.session.get(f"{self.proxy_url}/status") as response:
                    proxy_health = "healthy" if response.status == 200 else "unhealthy"
            except:
                proxy_health = "unavailable"
            
            return {
                "overall_status": "healthy" if all([
                    conversation_health == "healthy",
                    document_health == "healthy"
                ]) else "unhealthy",
                "services": {
                    "conversation_ai": conversation_health,
                    "document_search": document_health,
                    "proxy": proxy_health
                },
                "timestamp": time.time()
            }
        except Exception as e:
            logger.error(f"Health check failed: {str(e)}")
            return {
                "overall_status": "error",
                "error": str(e),
                "timestamp": time.time()
            }
    
    async def search_documents(self, 
                             query: str, 
                             num_results: int = 10,
                             filters: Optional[Dict] = None) -> List[SearchResult]:
        """
        Search documents using the ultra-fast search system
        
        Args:
            query: Search query text
            num_results: Number of results to return
            filters: Optional filters for the search
            
        Returns:
            List of search results
        """
        try:
            payload = {
                "query": query,
                "num_results": num_results,
                "filters": filters or {},
                "search_type": "hybrid"
            }
            
            async with self.session.post(
                f"{self.document_search_url}/api/v2/search/ultra-fast",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=self.timeout)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    results = []
                    
                    for item in data.get("results", []):
                        result = SearchResult(
                            id=item.get("id", "unknown"),
                            title=item.get("title", ""),
                            content=item.get("content", ""),
                            score=item.get("score", 0.0),
                            source="document_search",
                            metadata=item.get("metadata", {})
                        )
                        results.append(result)
                    
                    return results
                else:
                    logger.error(f"Document search failed: {response.status}")
                    return []
        except Exception as e:
            logger.error(f"Document search error: {str(e)}")
            return []
    
    async def chat(self, 
                   query: str, 
                   context: Optional[str] = None,
                   use_search: bool = False,
                   search_provider: str = "brave") -> ConversationResult:
        """
        Chat with the conversation AI system
        
        Args:
            query: User query
            context: Optional context to provide
            use_search: Whether to use web search
            search_provider: Which search provider to use
            
        Returns:
            Conversation response
        """
        try:
            payload = {
                "query": query,
                "context": context,
                "use_search": use_search,
                "search_provider": search_provider
            }
            
            async with self.session.post(
                f"{self.conversation_url}/api/v1/chat",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=self.timeout)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return ConversationResult(
                        response=data.get("response", ""),
                        context=data.get("context"),
                        sources=data.get("sources", []),
                        metadata=data.get("metadata", {})
                    )
                else:
                    logger.error(f"Chat failed: {response.status}")
                    return ConversationResult(
                        response="Sorry, I encountered an error.",
                        context=None,
                        sources=[],
                        metadata={"error": f"HTTP {response.status}"}
                    )
        except Exception as e:
            logger.error(f"Chat error: {str(e)}")
            return ConversationResult(
                response="Sorry, I encountered an error.",
                context=None,
                sources=[],
                metadata={"error": str(e)}
            )
    
    async def intelligent_search(self, 
                               query: str, 
                               include_documents: bool = True,
                               include_web: bool = True,
                               num_results: int = 10) -> Dict[str, Any]:
        """
        Perform intelligent search combining both document search and web search
        
        Args:
            query: Search query
            include_documents: Whether to include document search results
            include_web: Whether to include web search results
            num_results: Number of results per source
            
        Returns:
            Combined search results with AI analysis
        """
        try:
            results = {
                "query": query,
                "document_results": [],
                "web_results": [],
                "ai_analysis": "",
                "timestamp": time.time()
            }
            
            # Get document search results
            if include_documents:
                doc_results = await self.search_documents(query, num_results)
                results["document_results"] = [
                    {
                        "id": r.id,
                        "title": r.title,
                        "content": r.content[:200] + "..." if len(r.content) > 200 else r.content,
                        "score": r.score,
                        "source": r.source
                    }
                    for r in doc_results
                ]
            
            # Get web search results through conversation AI
            if include_web:
                web_response = await self.chat(
                    query=query,
                    use_search=True,
                    search_provider="brave"
                )
                results["web_results"] = web_response.sources
                results["ai_analysis"] = web_response.response
            
            # If we have both document and web results, ask AI to synthesize
            if include_documents and include_web and results["document_results"] and results["web_results"]:
                synthesis_query = f"""
                Based on the following information, provide a comprehensive analysis of: {query}
                
                Document Results: {json.dumps(results['document_results'], indent=2)}
                Web Results: {json.dumps(results['web_results'], indent=2)}
                
                Please synthesize this information into a comprehensive response.
                """
                
                synthesis_response = await self.chat(
                    query=synthesis_query,
                    use_search=False
                )
                results["ai_analysis"] = synthesis_response.response
            
            return results
        except Exception as e:
            logger.error(f"Intelligent search error: {str(e)}")
            return {
                "query": query,
                "document_results": [],
                "web_results": [],
                "ai_analysis": f"Error: {str(e)}",
                "timestamp": time.time()
            }

# Example usage
async def example_usage():
    """Example of how to use the unified AI platform"""
    
    async with UnifiedAIPlatform() as ai_platform:
        # Check system health
        health = await ai_platform.health_check()
        print(f"System Health: {health}")
        
        # Search documents
        doc_results = await ai_platform.search_documents("machine learning")
        print(f"Found {len(doc_results)} documents")
        
        # Chat with AI
        chat_response = await ai_platform.chat("What is machine learning?")
        print(f"AI Response: {chat_response.response}")
        
        # Intelligent search (combining both)
        intelligent_results = await ai_platform.intelligent_search(
            "artificial intelligence trends 2024",
            include_documents=True,
            include_web=True
        )
        print(f"Intelligent Search: {intelligent_results['ai_analysis']}")

if __name__ == "__main__":
    asyncio.run(example_usage())
