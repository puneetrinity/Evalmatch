"""
Dependency providers for FastAPI DI: ModelManager and CacheManager singletons.
"""

from typing import Any, Optional

from app.cache.redis_client import CacheManager
from app.core.config import get_settings
from app.models.manager import ModelManager

# Global references to initialized instances
_initialized_model_manager: Optional[ModelManager] = None
_initialized_cache_manager: Optional[CacheManager] = None


def set_initialized_model_manager(model_manager: ModelManager) -> None:
    """Set the initialized ModelManager instance for dependency injection."""
    global _initialized_model_manager
    _initialized_model_manager = model_manager


def set_initialized_cache_manager(cache_manager: CacheManager) -> None:
    """Set the initialized CacheManager instance for dependency injection."""
    global _initialized_cache_manager
    _initialized_cache_manager = cache_manager


def get_model_manager(request: Any = None) -> ModelManager:
    """Get the ModelManager instance, preferring the initialized one."""
    global _initialized_model_manager
    if _initialized_model_manager is not None:
        return _initialized_model_manager

    # Fallback: create new instance (for startup or testing)
    import asyncio

    from app.core.logging import get_logger

    logger = get_logger("dependencies")
    logger.warning("⚠️ Using fallback ModelManager - singleton not set!")

    settings = get_settings()
    # Use consistent Ollama host configuration
    ollama_host = settings.ollama_host

    fallback_manager = ModelManager(ollama_host=ollama_host)

    # Try to initialize synchronously if possible
    try:
        # Check if we're in an async context
        try:
            loop = asyncio.get_running_loop()
            # We're in an async context, schedule for later
            asyncio.create_task(fallback_manager.initialize())
        except RuntimeError:
            # No running loop, we can create a new one
            try:
                asyncio.run(fallback_manager.initialize())
            except RuntimeError as run_error:
                logger.warning(f"Could not initialize fallback manager: {run_error}")
                # Initialize without async features as fallback
                pass
            except KeyboardInterrupt:
                logger.warning("Fallback manager initialization interrupted")
                pass
    except ImportError as e:
        logger.warning(f"Failed to import ModelManager dependencies: {e}")
    except ConnectionError as e:
        logger.warning(f"Connection error during fallback manager initialization: {e}")
    except Exception as e:
        logger.warning(f"Fallback ModelManager initialization failed: {e}")

    return fallback_manager


def get_cache_manager() -> CacheManager:
    """Get the CacheManager instance, preferring the initialized one."""
    global _initialized_cache_manager
    if _initialized_cache_manager is not None:
        return _initialized_cache_manager

    # Fallback: create new instance (for startup or testing)
    import asyncio

    from app.core.logging import get_logger

    logger = get_logger("dependencies")
    logger.warning("⚠️ Using fallback CacheManager - singleton not set!")

    settings = get_settings()
    fallback_cache = CacheManager(
        redis_url=settings.redis_url, max_connections=settings.redis_max_connections
    )

    # Try to initialize if possible
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(fallback_cache.initialize())
        else:
            asyncio.run(fallback_cache.initialize())
    except ImportError as e:
        logger.warning(f"Failed to import CacheManager dependencies: {e}")
    except ConnectionError as e:
        logger.warning(f"Redis connection error during cache initialization: {e}")
    except RuntimeError as e:
        logger.warning(f"Runtime error during cache initialization: {e}")
    except Exception as e:
        logger.warning(f"Fallback CacheManager initialization failed: {e}")

    return fallback_cache
