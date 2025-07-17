"""
LangGraph Node for Ultra Fast Search Integration
This module provides LangGraph-compatible nodes for document search functionality.
"""
from typing import Dict, Any, List, Optional, TypedDict, Annotated
from langgraph.graph import StateGraph, END
import logging
from .ultra_fast_search_provider import UltraFastSearchProvider

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SearchState(TypedDict):
    """State structure for search operations"""
    query: str
    search_results: Optional[List[Dict[str, Any]]]
    search_metadata: Optional[Dict[str, Any]]
    filters: Optional[Dict[str, Any]]
    num_results: int
    error: Optional[str]
    messages: List[Dict[str, Any]]


class UltraFastSearchNode:
    """LangGraph node for ultra-fast document search"""
    
    def __init__(self, search_service_url: str = "http://localhost:80"):
        """Initialize the search node"""
        self.provider = UltraFastSearchProvider(search_service_url)
        self.node_name = "ultra_fast_search"
    
    async def search_node(self, state: SearchState) -> SearchState:
        """
        LangGraph node function for document search
        
        Args:
            state: Current state containing query and parameters
            
        Returns:
            Updated state with search results
        """
        try:
            query = state.get("query", "")
            filters = state.get("filters", {})
            num_results = state.get("num_results", 10)
            
            if not query:
                logger.warning("No query provided for search")
                state["error"] = "No search query provided"
                return state
            
            logger.info(f"Performing search for query: {query}")
            
            # Perform the search
            search_result = await self.provider.search_documents(
                query=query,
                num_results=num_results,
                filters=filters
            )
            
            if search_result.get("success"):
                state["search_results"] = search_result.get("results", [])
                state["search_metadata"] = {
                    "total_found": search_result.get("total_found", 0),
                    "response_time_ms": search_result.get("response_time_ms", 0),
                    "provider": search_result.get("provider"),
                    "cost": search_result.get("cost", 0),
                    "timestamp": search_result.get("timestamp")
                }
                
                # Add message about search results
                state["messages"].append({
                    "role": "system",
                    "content": f"Found {len(state['search_results'])} relevant documents for query: '{query}'"
                })
                
                logger.info(f"Search completed: {len(state['search_results'])} results found")
            else:
                error_msg = search_result.get("error", "Unknown search error")
                state["error"] = error_msg
                state["messages"].append({
                    "role": "system", 
                    "content": f"Search failed: {error_msg}"
                })
                logger.error(f"Search failed: {error_msg}")
            
        except Exception as e:
            error_msg = f"Search node error: {str(e)}"
            state["error"] = error_msg
            state["messages"].append({
                "role": "system",
                "content": error_msg
            })
            logger.error(error_msg)
        
        return state
    
    async def format_results_node(self, state: SearchState) -> SearchState:
        """
        Format search results for AI consumption
        
        Args:
            state: State containing search results
            
        Returns:
            State with formatted results message
        """
        try:
            results = state.get("search_results", [])
            metadata = state.get("search_metadata", {})
            
            if not results:
                state["messages"].append({
                    "role": "assistant",
                    "content": "No relevant documents were found for your query."
                })
                return state
            
            # Format results into a comprehensive message
            formatted_content = f"I found {len(results)} relevant documents:\n\n"
            
            for i, result in enumerate(results, 1):
                content = result.get("content", "")[:300]  # Truncate long content
                score = result.get("score", 0)
                metadata_info = result.get("metadata", {})
                
                formatted_content += f"**Document {i}** (Relevance: {score:.2f})\n"
                formatted_content += f"{content}...\n"
                
                # Add metadata if available
                if metadata_info.get("experience"):
                    formatted_content += f"Experience: {metadata_info['experience']} years\n"
                if metadata_info.get("skills"):
                    skills = metadata_info["skills"][:5]  # Show first 5 skills
                    formatted_content += f"Skills: {', '.join(skills)}\n"
                if metadata_info.get("location"):
                    formatted_content += f"Location: {metadata_info['location']}\n"
                
                formatted_content += "\n"
            
            # Add search metadata
            if metadata:
                formatted_content += f"\n**Search Info:**\n"
                formatted_content += f"- Total documents found: {metadata.get('total_found', 0)}\n"
                formatted_content += f"- Search time: {metadata.get('response_time_ms', 0):.1f}ms\n"
                formatted_content += f"- Cost: ${metadata.get('cost', 0):.4f}\n"
            
            state["messages"].append({
                "role": "assistant",
                "content": formatted_content
            })
            
            logger.info("Search results formatted for AI consumption")
            
        except Exception as e:
            error_msg = f"Result formatting error: {str(e)}"
            state["error"] = error_msg
            state["messages"].append({
                "role": "system",
                "content": error_msg
            })
            logger.error(error_msg)
        
        return state


def create_search_graph(search_service_url: str = "http://localhost:80") -> StateGraph:
    """
    Create a LangGraph for document search operations
    
    Args:
        search_service_url: URL of the ultra fast search service
        
    Returns:
        Configured StateGraph for search operations
    """
    # Initialize the search node
    search_node = UltraFastSearchNode(search_service_url)
    
    # Create the graph
    workflow = StateGraph(SearchState)
    
    # Add nodes
    workflow.add_node("search", search_node.search_node)
    workflow.add_node("format_results", search_node.format_results_node)
    
    # Define the flow
    workflow.set_entry_point("search")
    workflow.add_edge("search", "format_results")
    workflow.add_edge("format_results", END)
    
    # Compile the graph
    return workflow.compile()


# Helper functions for integration with existing chat systems
async def extract_search_intent(message: str) -> Optional[Dict[str, Any]]:
    """
    Extract search intent from a user message
    
    Args:
        message: User message text
        
    Returns:
        Search parameters if search intent detected, None otherwise
    """
    # Simple keyword-based intent detection
    search_keywords = [
        "find", "search", "look for", "show me", "get", "retrieve",
        "who has", "candidates with", "resumes", "profiles"
    ]
    
    message_lower = message.lower()
    
    # Check if message contains search intent
    has_search_intent = any(keyword in message_lower for keyword in search_keywords)
    
    if has_search_intent:
        # Extract potential filters from message
        filters = {}
        
        # Experience level detection
        if "senior" in message_lower:
            filters["min_experience"] = 5
        elif "junior" in message_lower:
            filters["max_experience"] = 2
        elif "mid" in message_lower or "middle" in message_lower:
            filters["min_experience"] = 2
            filters["max_experience"] = 5
        
        # Skills detection (simple approach)
        common_skills = [
            "python", "java", "javascript", "react", "node", "aws", "azure",
            "docker", "kubernetes", "sql", "mongodb", "tensorflow", "pytorch"
        ]
        
        found_skills = [skill for skill in common_skills if skill in message_lower]
        if found_skills:
            filters["required_skills"] = found_skills
        
        return {
            "query": message,
            "filters": filters,
            "num_results": 10
        }
    
    return None


def integrate_with_chat_graph(chat_graph, search_service_url: str = "http://localhost:80"):
    """
    Integrate ultra-fast search with an existing chat graph
    
    Args:
        chat_graph: Existing LangGraph chat system
        search_service_url: URL of the search service
    """
    # This would be implemented based on the specific structure
    # of the ubiquitous-octo-invention chat graph
    pass


# Example usage
async def example_search_workflow():
    """Example of how to use the search graph"""
    
    # Create the search graph
    search_graph = create_search_graph()
    
    # Initial state
    initial_state = SearchState(
        query="python developer with 5 years experience",
        search_results=None,
        search_metadata=None,
        filters={"min_experience": 5},
        num_results=5,
        error=None,
        messages=[]
    )
    
    # Run the search workflow
    result = await search_graph.ainvoke(initial_state)
    
    return result


if __name__ == "__main__":
    import asyncio
    
    # Test the search workflow
    async def test():
        result = await example_search_workflow()
        print("Search workflow result:")
        for message in result["messages"]:
            print(f"{message['role']}: {message['content']}")
    
    asyncio.run(test())
