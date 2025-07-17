"""
Timeout utilities for performance optimization
Prevents hanging requests and improves system reliability.
"""

import asyncio
import functools
import logging
import time
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger(__name__)


def with_timeout(timeout_seconds: int, error_response: Optional[Dict[str, Any]] = None):
    """Decorator to add timeout to async functions"""

    def decorator(func: Callable):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                return await asyncio.wait_for(
                    func(*args, **kwargs), timeout=timeout_seconds
                )
            except asyncio.TimeoutError:
                execution_time = time.time() - start_time
                logger.warning(
                    f"Function {func.__name__} timed out after {execution_time:.2f}s "
                    f"(limit: {timeout_seconds}s)"
                )

                # Return structured error response
                default_error = {
                    "error": "Request timed out",
                    "timeout": timeout_seconds,
                    "message": f"Processing took too long (>{timeout_seconds}s), please try a simpler query",
                    "execution_time": execution_time,
                    "function": func.__name__,
                }

                return error_response or default_error
            except Exception as e:
                execution_time = time.time() - start_time
                logger.error(
                    f"Function {func.__name__} failed after {execution_time:.2f}s: {e}"
                )
                raise

        return wrapper

    return decorator


def adaptive_timeout(base_timeout: int = 30):
    """Adaptive timeout based on query complexity"""

    def decorator(func: Callable):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Try to extract query/message for complexity analysis
            timeout = base_timeout

            # Look for query complexity hints in arguments
            for arg in args:
                if hasattr(arg, "messages") and arg.messages:
                    # Extract user message
                    for msg in reversed(arg.messages):
                        if isinstance(msg, dict) and msg.get("role") == "user":
                            content = msg.get("content", "")
                        elif hasattr(msg, "role") and msg.role == "user":
                            content = getattr(msg, "content", "")
                        else:
                            continue

                        # Adjust timeout based on content complexity
                        word_count = len(content.split())
                        if word_count > 50 or any(
                            indicator in content.lower()
                            for indicator in [
                                "research",
                                "analyze",
                                "comprehensive",
                                "detailed",
                            ]
                        ):
                            timeout = base_timeout * 3  # 90s for complex queries
                        elif word_count > 20:
                            timeout = base_timeout * 2  # 60s for medium queries
                        break
                elif hasattr(arg, "query"):
                    # For search requests
                    query = getattr(arg, "query", "")
                    if len(query.split()) > 20:
                        timeout = base_timeout * 2
                    break

            logger.debug(f"Using adaptive timeout of {timeout}s for {func.__name__}")

            try:
                return await asyncio.wait_for(func(*args, **kwargs), timeout=timeout)
            except asyncio.TimeoutError:
                logger.warning(
                    f"Adaptive timeout ({timeout}s) exceeded for {func.__name__}"
                )
                return {
                    "error": "Request timed out",
                    "timeout": timeout,
                    "message": f"Query was too complex and exceeded {timeout}s limit",
                }

        return wrapper

    return decorator


class TimeoutManager:
    """Centralized timeout management"""

    def __init__(self):
        self.timeouts = {
            "simple_query": 15,  # Simple chat/search
            "standard_query": 30,  # Standard operations
            "complex_query": 60,  # Complex analysis
            "research": 120,  # Research workflows
            "streaming": 45,  # Streaming responses
        }

    def get_timeout(self, operation_type: str, complexity: str = "standard") -> int:
        """Get appropriate timeout for operation"""
        base_timeout = self.timeouts.get(operation_type, 30)

        if complexity == "ultra_fast":
            return min(base_timeout, 15)
        elif complexity == "fast":
            return base_timeout
        elif complexity == "detailed":
            return base_timeout * 2

        return base_timeout

    def with_operation_timeout(self, operation_type: str):
        """Decorator that uses operation-specific timeouts"""

        def decorator(func: Callable):
            @functools.wraps(func)
            async def wrapper(*args, **kwargs):
                timeout = self.get_timeout(operation_type)
                try:
                    return await asyncio.wait_for(
                        func(*args, **kwargs), timeout=timeout
                    )
                except asyncio.TimeoutError:
                    logger.warning(
                        f"{operation_type} operation timed out after {timeout}s"
                    )
                    return {
                        "error": f"{operation_type} timed out",
                        "timeout": timeout,
                        "operation": operation_type,
                    }

            return wrapper

        return decorator


# Global timeout manager instance
timeout_manager = TimeoutManager()
