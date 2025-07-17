"""
Ultra Fast Search Provider
Integrates ideal-octo-goggles search engine as a provider for ubiquitous-octo-invention
"""

import asyncio
import aiohttp
import time
from typing import List, Dict, Any, Optional, Union
from dataclasses import dataclass

from app.core.config import get_settings
from app.core.logging import get_logger
from app.providers.base_provider import BaseProvider, ProviderResponse, ProviderConfig

logger = get_logger("providers.document_search")


@dataclass
class DocumentSearchResult:
    """Result from document search"""
    content: str
    title: str
    score: float
    metadata: Dict[str, Any]
    source: str
    chunk_id: Optional[str] = None


class UltraFastSearchProvider(BaseProvider):
    """Provider for Ultra Fast Document Search System integration"""
    
    def __init__(self, base_url: str = "http://localhost:8001"):
        config = ProviderConfig(
            base_url=base_url,
            timeout=30,
            cost_per_request=0.001,
            max_retries=3
        )
        super().__init__(config, logger)
        self.settings = get_settings()
        self.base_url = base_url
        self.cost_per_search = 0.001  # Very low cost for local search
        self.provider_name = "ultra_fast_search"
        self.timeout = 30.0
    
    async def initialize(self) -> None:
        """Initialize the provider."""
        self._initialized = True
    
    async def cleanup(self) -> None:
        """Cleanup provider resources."""
        if self._session:
            await self._session.close()
    
    def is_available(self) -> bool:
        """Check if the provider is available."""
        return True  # Always available since it's a local service
    
    def get_provider_name(self) -> str:
        """Get the provider name."""
        return self.provider_name
        
    async def search_documents(
        self, 
        query: str, 
        num_results: int = 10,
        filters: Optional[Dict] = None,
        search_type: str = "hybrid"
    ) -> ProviderResponse:
        """Search documents using the ultra-fast search system."""
        
        start_time = time.time()
        
        try:
            payload = {
                "query": query,
                "num_results": num_results,
                "search_type": search_type,
                "filters": filters or {}
            }
            
            timeout = aiohttp.ClientTimeout(total=self.timeout)
            
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    f"{self.base_url}/search",
                    json=payload,
                    headers={"Content-Type": "application/json"}
                ) as response:
                    
                    response_time = time.time() - start_time
                    
                    if response.status == 200:
                        result_data = await response.json()
                        
                        # Transform results to standard format
                        documents = []
                        for item in result_data.get("results", []):
                            doc = DocumentSearchResult(
                                content=item.get("content", ""),
                                title=item.get("title", ""),
                                score=item.get("score", 0.0),
                                metadata=item.get("metadata", {}),
                                source=item.get("source", "unknown"),
                                chunk_id=item.get("chunk_id")
                            )
                            documents.append(doc)
                        
                        return ProviderResponse(
                            success=True,
                            data=documents,
                            execution_time=response_time,
                            cost=self.cost_per_search,
                            provider_name=self.provider_name,
                            metadata={
                                "search_type": search_type,
                                "engine_response_time": result_data.get("response_time_ms", 0),
                                "index_size": result_data.get("index_size", 0),
                                "total_found": result_data.get("total_found", 0)
                            }
                        )
                    
                    else:
                        error_text = await response.text()
                        logger.error(
                            f"Document search failed: {response.status} - {error_text}",
                            extra_fields={
                                "query": query[:100],
                                "status_code": response.status,
                                "response_time": response_time
                            }
                        )
                        return ProviderResponse(
                            success=False,
                            error=f"Search failed with status {response.status}: {error_text}",
                            execution_time=response_time,
                            provider_name=self.provider_name
                        )
                        
        except asyncio.TimeoutError:
            response_time = time.time() - start_time
            logger.warning(
                f"Document search timeout after {response_time:.2f}s",
                extra_fields={"query": query[:100], "timeout": self.timeout}
            )
            return ProviderResponse(
                success=False,
                error="Search request timed out",
                execution_time=response_time,
                provider_name=self.provider_name
            )
            
        except Exception as e:
            response_time = time.time() - start_time
            logger.error(
                f"Document search error: {str(e)}",
                extra_fields={
                    "query": query[:100],
                    "error_type": type(e).__name__,
                    "response_time": response_time
                },
                exc_info=True
            )
            return ProviderResponse(
                success=False,
                error=f"Search error: {str(e)}",
                execution_time=response_time,
                provider_name=self.provider_name
            )
    
    async def upload_document(
        self, 
        content: str, 
        title: str,
        metadata: Optional[Dict] = None
    ) -> ProviderResponse:
        """Upload a document to the search index."""
        
        start_time = time.time()
        
        try:
            payload = {
                "content": content,
                "title": title,
                "metadata": metadata or {}
            }
            
            timeout = aiohttp.ClientTimeout(total=self.timeout)
            
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    f"{self.base_url}/api/v2/documents/upload",
                    json=payload,
                    headers={"Content-Type": "application/json"}
                ) as response:
                    
                    response_time = time.time() - start_time
                    
                    if response.status == 200:
                        result_data = await response.json()
                        
                        return ProviderResponse(
                            success=True,
                            execution_time=response_time,
                            cost=0.001,  # Small cost for upload
                            provider_name=self.provider_name,
                            metadata={
                                "document_id": result_data.get("document_id"),
                                "chunks_created": result_data.get("chunks_created", 0)
                            }
                        )
                    else:
                        error_text = await response.text()
                        return ProviderResponse(
                            success=False,
                            error=f"Upload failed: {error_text}",
                            execution_time=response_time,
                            provider_name=self.provider_name
                        )
                        
        except Exception as e:
            response_time = time.time() - start_time
            logger.error(f"Document upload error: {str(e)}", exc_info=True)
            return ProviderResponse(
                success=False,
                error=f"Upload error: {str(e)}",
                execution_time=response_time,
                provider_name=self.provider_name
            )
    
    async def health_check(self) -> bool:
        """Check if the document search system is healthy."""
        try:
            timeout = aiohttp.ClientTimeout(total=5.0)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(f"{self.base_url}/health") as response:
                    return response.status == 200
        except Exception:
            return False
