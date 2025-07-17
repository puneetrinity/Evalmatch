"""
Simple chat API endpoint that integrates with both systems.
This provides the backend functionality for the unified chat UI.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import asyncio
import aiohttp
import time
from datetime import datetime

router = APIRouter(prefix="/api/v1/chat", tags=["Chat API"])

class ChatRequest(BaseModel):
    message: str = Field(..., description="The user's message")
    mode: str = Field(default="unified", description="Chat mode: unified, chat, search, research")
    context: Optional[Dict[str, Any]] = Field(None, description="Additional context")
    max_results: int = Field(default=10, description="Maximum search results")
    include_search: bool = Field(default=True, description="Whether to include search results")

class ChatResponse(BaseModel):
    success: bool
    message: str
    search_results: Optional[List[Dict[str, Any]]] = None
    metadata: Dict[str, Any]
    timestamp: datetime

# Configuration for external services
IDEAL_OCTO_BASE = "http://localhost:8001"
SEARCH_TIMEOUT = 30.0

@router.post("/unified", response_model=ChatResponse)
async def unified_chat(request: ChatRequest):
    """
    Unified chat endpoint that combines search and conversation capabilities.
    This is the main endpoint that the UI uses for all chat interactions.
    """
    start_time = time.time()
    
    try:
        search_results = None
        response_content = ""
        
        # Perform search if requested and in appropriate mode
        if request.include_search and request.mode in ["unified", "search", "research"]:
            try:
                search_results = await perform_search(request.message, request.max_results)
                if search_results and search_results.get("success"):
                    response_content = generate_search_response(search_results, request.mode)
                else:
                    response_content = "I searched for relevant information but didn't find specific results."
            except Exception as search_error:
                print(f"Search failed: {search_error}")
                response_content = "Search is currently unavailable, but I can still help with general questions."
        
        # For chat and unified modes, enhance with conversational response
        if request.mode in ["unified", "chat", "research"]:
            if not response_content:
                response_content = generate_chat_response(request.message, request.mode)
            else:
                # Enhance search results with conversational context
                response_content = enhance_with_chat_context(response_content, request.message, request.mode)
        
        # If no content generated, provide fallback
        if not response_content:
            response_content = f"I understand you're asking about '{request.message}'. Could you provide more details so I can better assist you?"
        
        processing_time = (time.time() - start_time) * 1000
        
        return ChatResponse(
            success=True,
            message=response_content,
            search_results=search_results.get("results", []) if search_results else None,
            metadata={
                "mode": request.mode,
                "processing_time_ms": round(processing_time, 2),
                "search_enabled": request.include_search,
                "search_results_count": len(search_results.get("results", [])) if search_results else 0,
                "timestamp": datetime.now().isoformat()
            },
            timestamp=datetime.now()
        )
        
    except Exception as e:
        return ChatResponse(
            success=False,
            message=f"I encountered an error processing your request: {str(e)}",
            search_results=None,
            metadata={
                "mode": request.mode,
                "error": str(e),
                "processing_time_ms": round((time.time() - start_time) * 1000, 2)
            },
            timestamp=datetime.now()
        )

async def perform_search(query: str, max_results: int = 10) -> Dict[str, Any]:
    """
    Perform search using the ideal-octo-goggles service.
    """
    search_data = {
        "query": query,
        "num_results": max_results
    }
    
    timeout = aiohttp.ClientTimeout(total=SEARCH_TIMEOUT)
    
    async with aiohttp.ClientSession(timeout=timeout) as session:
        try:
            async with session.post(
                f"{IDEAL_OCTO_BASE}/search",
                json=search_data
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    return {
                        "success": False,
                        "error": f"Search service returned status {response.status}"
                    }
        except asyncio.TimeoutError:
            return {
                "success": False,
                "error": "Search request timed out"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Search service error: {str(e)}"
            }

def generate_search_response(search_results: Dict[str, Any], mode: str) -> str:
    """
    Generate a conversational response based on search results.
    """
    if not search_results.get("success") or not search_results.get("results"):
        return "I couldn't find specific documents related to your query, but I'm happy to help with general information."
    
    results = search_results["results"]
    total_found = search_results.get("total_found", 0)
    response_time = search_results.get("response_time_ms", 0)
    
    if mode == "search":
        # Direct search mode - focus on results
        response = f"I found {total_found} relevant documents in {response_time:.1f}ms.\n\n"
        response += "Here are the top results:\n\n"
        
        for i, result in enumerate(results[:3], 1):
            title = result.get("title", "Untitled Document")
            content = result.get("content", "")[:200]
            score = result.get("score", 0) * 100
            
            response += f"**{i}. {title}** (Relevance: {score:.1f}%)\n"
            response += f"{content}...\n\n"
            
    elif mode == "research":
        # Research mode - more analytical
        response = f"Based on my search through {total_found} documents, here's what I found:\n\n"
        
        # Group by relevance
        high_relevance = [r for r in results if r.get("score", 0) > 0.8]
        medium_relevance = [r for r in results if 0.5 <= r.get("score", 0) <= 0.8]
        
        if high_relevance:
            response += "**Highly Relevant Sources:**\n"
            for result in high_relevance[:2]:
                title = result.get("title", "Document")
                content = result.get("content", "")[:150]
                response += f"• {title}: {content}...\n"
            response += "\n"
        
        if medium_relevance:
            response += "**Additional References:**\n"
            for result in medium_relevance[:2]:
                title = result.get("title", "Document")
                response += f"• {title}\n"
            response += "\n"
            
        response += f"*Search completed in {response_time:.1f}ms across {total_found} documents.*"
        
    else:
        # Unified mode - conversational with search context
        response = f"I found {total_found} relevant documents to help answer your question.\n\n"
        
        if results:
            best_result = results[0]
            title = best_result.get("title", "a relevant document")
            content = best_result.get("content", "")[:300]
            
            response += f"Based on {title}, here's what I can tell you:\n\n"
            response += f"{content}...\n\n"
            
            if len(results) > 1:
                response += f"I also found {len(results) - 1} other relevant sources that might be helpful."
    
    return response

def generate_chat_response(message: str, mode: str) -> str:
    """
    Generate a conversational response without search results.
    This is a simplified implementation - in production, this would connect to
    the actual AI conversation system.
    """
    message_lower = message.lower()
    
    # Simple keyword-based responses for demonstration
    if any(word in message_lower for word in ["hello", "hi", "hey"]):
        return "Hello! I'm your AI assistant. I can help you search through documents, answer questions, and provide research assistance. What would you like to know?"
    
    elif any(word in message_lower for word in ["help", "what can you do"]):
        return """I can help you in several ways:

🔍 **Search**: Find information in documents quickly
💬 **Chat**: Have conversations and answer questions  
📚 **Research**: Conduct comprehensive research analysis
🚀 **Unified**: Combine search with intelligent responses

Just ask me anything, and I'll do my best to help!"""
    
    elif any(word in message_lower for word in ["how are you", "how do you work"]):
        return "I'm doing great! I work by combining ultra-fast document search with AI conversation capabilities. I can search through vast amounts of information in milliseconds and provide intelligent, contextual responses."
    
    else:
        # Generic response for unknown queries
        return f"That's an interesting question about '{message}'. While I don't have specific information readily available, I can search through documents or help you explore this topic further. Would you like me to search for relevant information?"

def enhance_with_chat_context(search_content: str, original_message: str, mode: str) -> str:
    """
    Enhance search results with conversational context.
    """
    if mode == "unified":
        intro = "Great question! Let me share what I found:\n\n"
        outro = "\n\nWould you like me to search for more specific information or help you explore any particular aspect of this topic?"
        return intro + search_content + outro
    
    elif mode == "research":
        intro = f"I've conducted a comprehensive search on '{original_message}'. Here's my analysis:\n\n"
        outro = "\n\nThis research summary covers the key findings. Let me know if you'd like me to dive deeper into any specific area!"
        return intro + search_content + outro
    
    return search_content

@router.get("/health")
async def chat_health():
    """Health check for the chat API"""
    return {
        "status": "healthy",
        "service": "chat_api",
        "capabilities": [
            "unified_chat",
            "document_search_integration", 
            "multi_mode_responses",
            "real_time_search"
        ],
        "timestamp": datetime.now().isoformat()
    }

@router.get("/modes")
async def get_chat_modes():
    """Get available chat modes and their descriptions"""
    return {
        "modes": {
            "unified": {
                "name": "Unified Search & Chat",
                "description": "Combines document search with conversational AI",
                "icon": "🚀",
                "features": ["search", "chat", "context_aware"]
            },
            "chat": {
                "name": "AI Conversation", 
                "description": "Pure conversational AI without search",
                "icon": "💬",
                "features": ["conversation", "context", "dialogue"]
            },
            "search": {
                "name": "Document Search",
                "description": "Direct document search with results",
                "icon": "🔍", 
                "features": ["fast_search", "relevance_ranking", "document_retrieval"]
            },
            "research": {
                "name": "Research Assistant",
                "description": "Comprehensive research with analysis",
                "icon": "📚",
                "features": ["research", "analysis", "synthesis", "citations"]
            }
        }
    }
