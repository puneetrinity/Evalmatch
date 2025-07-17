# Configuration for document search provider
DOCUMENT_SEARCH_CONFIG = {
    "base_url": "http://localhost:8001",  # ideal-octo-goggles URL
    "timeout": 30.0,
    "max_results": 10,
    "api_endpoints": {
        "search": "/search",
        "upload": "/documents/upload",
        "health": "/health",
        "performance": "/api/v2/search/performance"
    }
}
