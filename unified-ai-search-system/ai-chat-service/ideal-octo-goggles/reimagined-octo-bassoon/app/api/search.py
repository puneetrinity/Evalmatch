"""
Real search API implementation with proper coroutine safety.
Provides search endpoints with proper security, validation and no coroutine leaks.
"""

import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request

from app.api.security import get_current_user, require_permission
from app.core.async_utils import AsyncSafetyValidator, ensure_awaited, safe_execute
from app.core.logging import get_correlation_id, get_logger, log_performance
from app.schemas.requests import AdvancedSearchRequest, SearchRequest
from app.schemas.responses import (
    SearchData,
    SearchResponse,
    create_error_response,
    create_success_response,
)

router = APIRouter()
logger = get_logger("api.search")


@router.get("/health")
async def search_health(request: Request):
    logger.debug("[search_health] Called", correlation_id=get_correlation_id())
    search_system = getattr(request.app.state, "search_system", None)
    search_available = search_system is not None
    logger.debug(
        f"[search_health] search_available={search_available}",
        correlation_id=get_correlation_id(),
    )
    return {
        "status": "healthy" if search_available else "degraded",
        "service": "search",
        "search_system": "available" if search_available else "initializing",
        "providers": (
            ["brave_search", "duckduckgo", "scrapingbee"] if search_available else []
        ),
        "timestamp": time.time(),
        "correlation_id": get_correlation_id(),
    }


@router.post("/basic", response_model=SearchResponse)
@log_performance("basic_search")
async def basic_search(
    req: Request,
    search_request: SearchRequest = Body(..., embed=False),
    current_user: dict = Depends(get_current_user),
):
    query_id = str(uuid.uuid4())
    correlation_id = get_correlation_id()
    start_time = time.time()
    logger.debug(
        "[basic_search] Started",
        query=search_request.query,
        query_id=query_id,
        correlation_id=correlation_id,
    )
    logger.info(
        "Search request started",
        query=search_request.query,
        query_id=query_id,
        user_id=getattr(
            current_user, "user_id", current_user.get("user_id", "unknown")
        ),
        correlation_id=correlation_id,
    )
    
    try:
        # Get search system from app state
        app_state = getattr(req.app.state, "app_state", {})
        
        search_system = app_state.get("search_system")
        native_search_components = app_state.get("native_search")
        
        # Try native search first for uploaded documents
        native_results = []
        if native_search_components:
            try:
                search_engine = native_search_components.get("search_engine")
                if search_engine:
                    from app.api.native_search import SearchRequest
                    native_request = SearchRequest(
                        query=search_request.query,
                        num_results=getattr(search_request, 'max_results', 10)
                    )
                    native_response = await search_engine.search(native_request.query, native_request.num_results)
                    if native_response.success:
                        native_results = native_response.results
                        logger.debug(f"[basic_search] Native search found {len(native_results)} documents", correlation_id=correlation_id)
            except Exception as e:
                logger.warning(f"[basic_search] Native search failed: {e}", correlation_id=correlation_id)
        
        if search_system and hasattr(search_system, 'execute_optimized_search'):
            # Execute real search using the search system
            logger.debug("[basic_search] Using real search system", correlation_id=correlation_id)
            
            search_result = await safe_execute(
                search_system.execute_optimized_search,
                query=search_request.query,
                budget=getattr(search_request, 'budget', 2.0),
                quality=getattr(search_request, 'quality', 'standard'),
                max_results=getattr(search_request, 'max_results', 10),
                timeout=30.0,
            )
            
            search_result = await ensure_awaited(search_result)
            
            # Extract real search results
            web_results = search_result.get("citations", [])
            base_response = search_result.get("response", f"Search results for: {search_request.query}")
            
            # Enhance response with document results info
            if native_results:
                doc_count = len(native_results)
                response_text = f"Found {doc_count} relevant document(s) and web results for: {search_request.query}\n\n{base_response}"
            else:
                response_text = base_response
            sources_consulted = _extract_real_sources(search_result)
            
            # Combine native and web search results
            search_results = []
            
            # Add native document results first (higher priority)
            if native_results:
                for result in native_results:
                    search_results.append({
                        "title": result.get("title", "Document"),
                        "content": result.get("content", ""),
                        "url": f"document://{result.get('id', 'unknown')}",
                        "source": "document",
                        "score": result.get("score", 0.9),
                        "type": "document"
                    })
            
            # Add web search results
            search_results.extend(web_results)
            
            # Create search data object with real results
            search_data_obj = SearchData(
                query=search_request.query,
                results=search_results,
                summary=response_text,
                total_results=len(search_results),
                search_time=search_result["metadata"]["execution_time"],
                sources_consulted=sources_consulted,
            )
            
            response_metadata = {
                "query_id": query_id,
                "correlation_id": correlation_id,
                "execution_time": search_result["metadata"]["execution_time"],
                "cost": search_result["metadata"].get("total_cost", 0.0),
                "models_used": search_result["metadata"].get("models_used", []),
                "confidence": search_result["metadata"].get("confidence", 0.8),
            }
            
            logger.info(
                "Real search completed successfully",
                query=search_request.query,
                results_count=len(search_results),
                execution_time=response_metadata["execution_time"],
                cost=response_metadata["cost"],
                correlation_id=correlation_id,
            )
            
        else:
            # Fallback - use native search only if available
            logger.warning("[basic_search] Search system not available, using fallback", correlation_id=correlation_id)
            
            search_results = []
            if native_results:
                for result in native_results:
                    search_results.append({
                        "title": result.get("title", "Document"),
                        "content": result.get("content", ""),
                        "url": f"document://{result.get('id', 'unknown')}",
                        "source": "document",
                        "score": result.get("score", 0.9),
                        "type": "document"
                    })
                response_text = f"Found {len(native_results)} document(s) for: {search_request.query}"
            else:
                response_text = f"No results found for: {search_request.query}"
            
            search_data_obj = SearchData(
                query=search_request.query,
                results=search_results,
                summary=response_text,
                total_results=len(search_results),
                search_time=time.time() - start_time,
                sources_consulted=["documents"] if native_results else [],
            )
            
            response_metadata = {
                "query_id": query_id,
                "correlation_id": correlation_id,
                "execution_time": time.time() - start_time,
                "cost": 0.0,
                "models_used": [],
                "confidence": 1.0,
            }
            
    except Exception as e:
        # Error handling - return safe fallback response
        logger.error(
            f"Search execution failed: {str(e)}",
            query=search_request.query,
            correlation_id=correlation_id,
            exc_info=True
        )
        
        response_text = f"Search temporarily unavailable for: {search_request.query}"
        search_data_obj = SearchData(
            query=search_request.query,
            results=[],
            summary=response_text,
            total_results=0,
            search_time=time.time() - start_time,
            sources_consulted=[],
        )
        
        response_metadata = {
            "query_id": query_id,
            "correlation_id": correlation_id,
            "execution_time": time.time() - start_time,
            "cost": 0.0,
            "models_used": [],
            "confidence": 0.0,
        }
    # Ensure we do not return a coroutine (fix for 500 error)
    result = create_success_response(
        data=search_data_obj,
        query_id=query_id,
        correlation_id=correlation_id,
        execution_time=response_metadata["execution_time"],
        cost=response_metadata["cost"],
        models_used=response_metadata["models_used"],
        confidence=response_metadata["confidence"],
        cached=False,
    )
    logger.debug(
        "[basic_search] Returning result",
        query_id=query_id,
        correlation_id=correlation_id,
    )
    AsyncSafetyValidator.assert_no_coroutines(
        result, "Basic search response contains coroutines"
    )
    return result


@router.post("/advanced", response_model=SearchResponse)
@require_permission("advanced_search")
@log_performance("advanced_search")
async def advanced_search(
    req: Request,
    body: AdvancedSearchRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    query_id = str(uuid.uuid4())
    correlation_id = get_correlation_id()
    start_time = time.time()
    logger.debug(
        "[advanced_search] Started",
        query=body.query,
        query_id=query_id,
        correlation_id=correlation_id,
    )
    logger.info(
        "Advanced search initiated",
        query=body.query,
        user_id=getattr(
            current_user, "user_id", current_user.get("user_id", "unknown")
        ),
        filters=getattr(body, "filters", None),
        budget=getattr(body, "budget", None),
        quality=getattr(body, "quality", None),
        query_id=query_id,
        correlation_id=correlation_id,
    )
    try:
        search_system = getattr(req.app.state, "search_system", None)
        logger.debug(
            f"[advanced_search] search_system exists: {bool(search_system)}",
            query_id=query_id,
            correlation_id=correlation_id,
        )
        if search_system:
            enhanced_query = _enhance_query_with_filters(
                body.query,
                getattr(body, "filters", None),
                getattr(body, "domains", None),
            )
            logger.debug(
                f"[advanced_search] enhanced_query: {enhanced_query}",
                query_id=query_id,
                correlation_id=correlation_id,
            )
            search_result = await safe_execute(
                search_system.execute_optimized_search,
                query=enhanced_query,
                budget=getattr(body, "budget", None),
                quality=getattr(body, "quality", None),
                max_results=20,
                timeout=60.0,
            )
            logger.debug(
                "[advanced_search] search_result received",
                query_id=query_id,
                correlation_id=correlation_id,
            )
            search_result = await ensure_awaited(search_result)
            advanced_results = _filter_advanced_results(
                search_result.get("citations", []), body
            )
            logger.debug(
                f"[advanced_search] advanced_results count: {len(advanced_results)}",
                query_id=query_id,
                correlation_id=correlation_id,
            )
            search_data_obj = SearchData(
                query=body.query,
                results=advanced_results,
                summary=(
                    f"Advanced search found {len(advanced_results)} filtered results. {search_result['response']}"
                    if len(advanced_results) > 0
                    else "No results found matching your advanced criteria."
                ),
                total_results=len(advanced_results),
                search_time=search_result["metadata"]["execution_time"],
                sources_consulted=_extract_real_sources(search_result),
            )
            response = SearchResponse(
                status="success",
                data=search_data_obj,
                metadata={
                    "query_id": query_id,
                    "correlation_id": correlation_id,
                    "execution_time": search_result["metadata"]["execution_time"],
                    "cost": search_result["metadata"]["total_cost"],
                    "models_used": ["advanced_search_graph", "smart_router"],
                    "confidence": search_result["metadata"].get(
                        "confidence_score", 0.9
                    ),
                    "cached": False,
                    "search_provider": search_result["metadata"].get(
                        "provider_used", "multi"
                    ),
                    "enhanced": search_result["metadata"].get("enhanced", False),
                    "advanced_filters": getattr(body, "filters", None),
                    "search_enabled": True,
                },
            )
        else:
            logger.debug(
                "[advanced_search] search_system not available",
                query_id=query_id,
                correlation_id=correlation_id,
            )
            search_data_obj = SearchData(
                query=body.query,
                results=[],
                summary="Advanced search system is initializing. Please try again shortly.",
                total_results=0,
                search_time=time.time() - start_time,
                sources_consulted=[],
            )
            response = SearchResponse(
                status="success",
                data=search_data_obj,
                metadata={
                    "query_id": query_id,
                    "correlation_id": correlation_id,
                    "execution_time": time.time() - start_time,
                    "cost": 0.0,
                    "models_used": [],
                    "confidence": 0.0,
                    "cached": False,
                    "search_system": "initializing",
                },
            )
        logger.debug(
            "[advanced_search] Returning response",
            query_id=query_id,
            correlation_id=correlation_id,
        )
        AsyncSafetyValidator.assert_no_coroutines(
            response, "Advanced search response contains coroutines"
        )
        return response
    except Exception as e:
        logger.error(
            f"Advanced search failed: {e}",
            query_id=query_id,
            correlation_id=correlation_id,
        )
        raise HTTPException(
            status_code=500,
            detail=create_error_response(
                message="Advanced search failed",
                error_code="ADVANCED_SEARCH_ERROR",
                query_id=query_id,
                correlation_id=correlation_id,
                technical_details=str(e),
            ).model_dump(),
        )


@router.post("/test")
async def search_test(*, request: SearchRequest):
    logger.debug("[search_test] Called", query=request.query)
    return {
        "status": "success",
        "query": request.query,
        "mock_results": [
            {"title": "Test Result 1", "url": "https://example.com/1"},
            {"title": "Test Result 2", "url": "https://example.com/2"},
        ],
        "timestamp": time.time(),
    }


def _enhance_query_with_filters(
    query: str, filters: Dict[str, Any], domains: Optional[List[str]]
) -> str:
    logger.debug(
        f"[_enhance_query_with_filters] query={query}, filters={filters}, domains={domains}"
    )
    enhanced = query
    if filters:
        for key, value in filters.items():
            if isinstance(value, str) and value:
                enhanced += f" {key}:{value}"
    if domains:
        domain_filter = " OR ".join([f"site:{domain}" for domain in domains])
        enhanced += f" ({domain_filter})"
    logger.debug(f"[_enhance_query_with_filters] enhanced={enhanced}")
    return enhanced


def _filter_advanced_results(
    citations: List[Dict], advanced_data: AdvancedSearchRequest
) -> List[Dict]:
    logger.debug(f"[_filter_advanced_results] citations count={len(citations)}")
    filtered_results = []
    for citation in citations:
        # Filter by domains if specified
        if advanced_data.domains:
            citation_url = citation.get("url", "")
            if not any(domain in citation_url for domain in advanced_data.domains):
                continue
        # Apply other filters from advanced_options if needed
        if advanced_data.advanced_options:
            # Handle any custom filtering logic here
            pass
        filtered_results.append(citation)
    logger.debug(f"[_filter_advanced_results] filtered count={len(filtered_results)}")
    return filtered_results


def _extract_real_sources(search_result: Dict) -> List[str]:
    logger.debug("[_extract_real_sources] called")
    sources = []
    if "citations" in search_result:
        for citation in search_result["citations"]:
            if isinstance(citation, dict) and "url" in citation:
                sources.append(citation["url"])
            elif isinstance(citation, str):
                sources.append(citation)
    if "metadata" in search_result:
        provider = search_result["metadata"].get("provider_used")
        if provider:
            sources.append(f"search_provider:{provider}")
    logger.debug(f"[_extract_real_sources] sources={sources}")
    return sources


def create_safe_search_fallback(
    query_id: str, correlation_id: str, query: str
) -> SearchResponse:
    logger.debug(
        "[create_safe_search_fallback] called",
        query_id=query_id,
        correlation_id=correlation_id,
    )
    search_data = SearchData(
        query=query,
        results=[],
        summary="Search system encountered a technical issue. Please try again.",
        total_results=0,
        search_time=0.0,
        sources_consulted=[],
    )
    return SearchResponse(
        status="error",
        data=search_data,
        metadata={
            "query_id": query_id,
            "correlation_id": correlation_id,
            "execution_time": 0.0,
            "cost": 0.0,
            "models_used": ["fallback"],
            "confidence": 0.0,
            "cached": False,
            "error": "coroutine_safety_failure",
        },
    )
