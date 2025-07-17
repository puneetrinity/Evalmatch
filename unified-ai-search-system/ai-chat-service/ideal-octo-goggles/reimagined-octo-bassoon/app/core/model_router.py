"""
Intelligent Model Selection for Performance Optimization
Routes queries to appropriate models based on complexity analysis.
"""

import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


class ModelRouter:
    """Route queries to appropriate models based on complexity"""

    def __init__(self):
        self.model_configs = {
            "ultra_fast": {
                "model": "qwen2.5:0.5b",
                "max_tokens": 100,
                "use_case": "simple_queries",
                "expected_time": 1.0,  # seconds
            },
            "fast": {
                "model": "phi3:mini",
                "max_tokens": 200,
                "use_case": "standard_queries",
                "expected_time": 3.0,  # seconds
            },
            "detailed": {
                "model": "phi3:mini",
                "max_tokens": 500,
                "use_case": "complex_queries",
                "expected_time": 8.0,  # seconds
            },
        }

    def analyze_query_complexity(self, query: str) -> str:
        """Determine query complexity and return appropriate model tier"""
        query_lower = query.lower()
        word_count = len(query.split())

        # Detailed for complex queries - check this first
        complex_indicators = [
            "explain",
            "analyze",
            "research",
            "compare",
            "detailed",
            "comprehensive",
            "describe",
            "elaborate",
            "breakdown",
            "step by step",
            "in detail",
            "pros and cons",
            "advantages",
            "disadvantages",
            "differences",
            "examples",
        ]
        if (
            any(indicator in query_lower for indicator in complex_indicators)
            or word_count > 20
        ):
            logger.debug(
                f"Routing to detailed model for complex query: {query[:50]}..."
            )
            return "detailed"

        # Ultra-fast for simple queries
        simple_keywords = [
            "hello",
            "hi",
            "test",
            "ping",
            "status",
            "yes",
            "no",
            "ok",
            "thanks",
            "bye",
        ]
        if (
            any(keyword in query_lower for keyword in simple_keywords)
            or word_count <= 3
        ):
            logger.debug(
                f"Routing to ultra_fast model for simple query: {query[:50]}..."
            )
            return "ultra_fast"

        # Standard for everything else
        logger.debug(f"Routing to fast model for standard query: {query[:50]}...")
        return "fast"

    def get_model_config(self, query: str) -> Dict[str, Any]:
        """Get optimal model configuration for query"""
        complexity = self.analyze_query_complexity(query)
        config = self.model_configs[complexity].copy()
        config["complexity"] = complexity
        return config

    def get_cache_ttl(self, complexity: str) -> int:
        """Get appropriate cache TTL based on complexity"""
        ttl_mapping = {
            "ultra_fast": 7200,  # 2 hours - simple queries change less
            "fast": 3600,  # 1 hour - standard TTL
            "detailed": 1800,  # 30 minutes - complex queries may need updates
        }
        return ttl_mapping.get(complexity, 3600)

    def should_use_cache(self, query: str) -> bool:
        """Determine if query should use cache based on complexity"""
        self.analyze_query_complexity(query)

        # Don't cache time-sensitive queries
        time_sensitive = [
            "now",
            "today",
            "current",
            "latest",
            "recent",
            "live",
            "real-time",
        ]
        if any(term in query.lower() for term in time_sensitive):
            return False

        return True
