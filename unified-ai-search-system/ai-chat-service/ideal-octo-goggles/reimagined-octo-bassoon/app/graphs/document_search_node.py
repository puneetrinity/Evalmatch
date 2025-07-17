"""
Document Search Graph Node
LangGraph node for integrating ultra-fast document search
"""

import asyncio
from typing import Dict, Any, List, Optional

from app.graphs.base import BaseGraphNode, GraphState, NodeResult
from app.providers.document_search.ultra_fast_provider import UltraFastSearchProvider
from app.providers.document_search.document_router import DocumentSearchRouter, QueryAnalysis
from app.core.logging import get_logger

logger = get_logger("graphs.document_search")


class DocumentSearchNode(BaseGraphNode):
    """Graph node for document search operations"""
    
    def __init__(self, provider_url: str = "http://localhost:8001"):
        super().__init__("document_search", "processing")
        self.provider = UltraFastSearchProvider(provider_url)
        self.router = DocumentSearchRouter()
        self.node_name = "document_search"
    
    async def execute(self, state: GraphState) -> NodeResult:
        """Execute document search"""
        
        logger.info(
            f"Executing document search for query: {state.original_query[:100]}",
            extra_fields={
                "correlation_id": state.correlation_id,
                "user_id": state.user_id
            }
        )
        
        try:
            # Analyze query to determine search approach
            analysis = self.router.analyze_query(state.original_query)
            
            # Perform search based on analysis
            if analysis.suggested_provider == "ultra_fast_search":
                result = await self._perform_document_search(state, analysis)
            elif analysis.suggested_provider == "hybrid":
                result = await self._perform_hybrid_search(state, analysis)
            else:
                # Route to web search (handled by other nodes)
                return NodeResult(
                    success=True,
                    data={"message": "Query routed to web search"},
                    confidence=0.0,
                    cost=0.0,
                    metadata={"next_node": "web_search_node"}
                )
            
            return result
            
        except Exception as e:
            logger.error(
                f"Document search node error: {str(e)}",
                extra_fields={
                    "correlation_id": state.correlation_id,
                    "error_type": type(e).__name__
                },
                exc_info=True
            )
            
            return NodeResult(
                success=False,
                data={"error": f"Document search failed: {str(e)}"},
                confidence=0.0,
                cost=0.0,
                error=f"Document search failed: {str(e)}"
            )
    
    async def _perform_document_search(
        self, 
        state: GraphState, 
        analysis: QueryAnalysis
    ) -> NodeResult:
        """Perform document-only search"""
        
        # Extract search parameters from state
        num_results = getattr(state, 'max_results', 10)
        
        # Perform the search
        search_response = await self.provider.search_documents(
            query=state.original_query,
            num_results=num_results,
            filters=analysis.filters,
            search_type="hybrid"
        )
        
        if not search_response.success:
            return NodeResult(
                success=False,
                data={"error": search_response.error},
                confidence=0.0,
                cost=search_response.execution_time * 0.001,
                error=search_response.error
            )
        
        # Format results for the graph state
        formatted_results = []
        for doc in search_response.data:
            formatted_results.append({
                "content": doc.content,
                "title": doc.title,
                "score": doc.score,
                "source": doc.source,
                "metadata": doc.metadata
            })
        
        result_data = {
            "search_results": formatted_results,
            "total_found": search_response.metadata.get("total_found", 0),
            "search_type": "document",
            "analysis": {
                "confidence": analysis.confidence,
                "reasoning": analysis.reasoning,
                "query_type": analysis.query_type
            },
            "performance": {
                "response_time": search_response.execution_time,
                "provider": search_response.provider_name
            }
        }
        
        # Update state with results
        state.search_results = formatted_results
        state.search_metadata = {
            "total_found": search_response.metadata.get("total_found", 0),
            "search_type": "document"
        }
        
        return NodeResult(
            success=True,
            data=result_data,
            confidence=analysis.confidence,
            cost=search_response.cost,
            metadata={"next_node": "synthesis_node" if formatted_results else "fallback_node"}
        )
    
    async def _perform_hybrid_search(
        self, 
        state: GraphState, 
        analysis: QueryAnalysis
    ) -> NodeResult:
        """Perform hybrid search (documents + web)"""
        
        # Start both searches concurrently
        doc_task = self._perform_document_search(state, analysis)
        
        # For now, just do document search
        # In a full implementation, you'd also trigger web search
        doc_result = await doc_task
        
        if doc_result.success:
            # Mark as hybrid for downstream processing
            result_data = doc_result.data
            result_data["search_type"] = "hybrid"
            result_data["analysis"]["query_type"] = "hybrid"
            
            return NodeResult(
                success=True,
                data=result_data,
                confidence=analysis.confidence,
                cost=doc_result.cost,
                metadata={"next_node": "web_search_node"}  # Chain to web search
            )
        else:
            return doc_result
    
    async def health_check(self) -> bool:
        """Check if the document search provider is healthy"""
        return await self.provider.health_check()


class DocumentUploadNode(BaseGraphNode):
    """Graph node for uploading documents to the search index"""
    
    def __init__(self, provider_url: str = "http://localhost:8001"):
        super().__init__("document_upload", "processing")
        self.provider = UltraFastSearchProvider(provider_url)
        self.node_name = "document_upload"
    
    async def execute(self, state: GraphState) -> NodeResult:
        """Execute document upload"""
        
        # Extract document data from state
        document_content = getattr(state, 'document_content', '')
        document_title = getattr(state, 'document_title', 'Untitled')
        document_metadata = getattr(state, 'document_metadata', {})
        
        if not document_content:
            return NodeResult(
                success=False,
                data={"error": "No document content provided"},
                confidence=0.0,
                cost=0.0,
                error="No document content provided"
            )
        
        try:
            # Upload the document
            upload_response = await self.provider.upload_document(
                content=document_content,
                title=document_title,
                metadata=document_metadata
            )
            
            if upload_response.success:
                return NodeResult(
                    success=True,
                    data={
                        "message": "Document uploaded successfully",
                        "document_id": upload_response.metadata.get("document_id"),
                        "chunks_created": upload_response.metadata.get("chunks_created", 0)
                    },
                    confidence=1.0,
                    cost=upload_response.cost
                )
            else:
                return NodeResult(
                    success=False,
                    data={"error": upload_response.error},
                    confidence=0.0,
                    cost=upload_response.cost,
                    error=upload_response.error
                )
                
        except Exception as e:
            logger.error(f"Document upload error: {str(e)}", exc_info=True)
            return NodeResult(
                success=False,
                data={"error": f"Upload failed: {str(e)}"},
                confidence=0.0,
                cost=0.001,
                error=f"Upload failed: {str(e)}"
            )
