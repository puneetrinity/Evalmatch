"""
Redis Cache Manager - Hot layer for speed-optimized caching
Handles routing shortcuts, conversation history, and performance hints
"""

import asyncio
import hashlib
import json
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

import redis.asyncio as redis
import structlog
from pydantic import BaseModel

from app.core.config import get_settings

logger = structlog.get_logger(__name__)


class CacheKey:
    """Cache key constants and generators"""

    ROUTE_PREFIX = "route:"
    PATTERN_PREFIX = "pattern:"
    SHORTCUT_PREFIX = "shortcut:"
    EXPECT_PREFIX = "expect:"
    MODEL_PREFIX = "model:"
    BUDGET_PREFIX = "budget:"
    RATE_PREFIX = "rate:"
    CONTEXT_PREFIX = "context:"
    PREFS_PREFIX = "prefs:"
    CONVERSATION_PREFIX = "conv:"
    METRICS_PREFIX = "metrics:"
    STATS_PREFIX = "stats:"

    @staticmethod
    def query_hash(query: str) -> str:
        return hashlib.md5(query.encode()).hexdigest()[:16]

    @staticmethod
    def route_key(query: str) -> str:
        return f"{CacheKey.ROUTE_PREFIX}{CacheKey.query_hash(query)}"

    @staticmethod
    def pattern_key(user_id: str) -> str:
        return f"{CacheKey.PATTERN_PREFIX}{user_id}"

    @staticmethod
    def conversation_key(session_id: str) -> str:
        return f"{CacheKey.CONVERSATION_PREFIX}{session_id}"

    @staticmethod
    def budget_key(user_id: str) -> str:
        return f"{CacheKey.BUDGET_PREFIX}{user_id}"

    @staticmethod
    def rate_key(user_id: str) -> str:
        return f"{CacheKey.RATE_PREFIX}{user_id}"


class CacheStrategy:
    """Cache strategy definitions"""

    TTL_SHORT = 300  # 5 minutes
    TTL_MEDIUM = 1800  # 30 minutes
    TTL_LONG = 3600  # 1 hour
    TTL_DAY = 86400  # 24 hours
    STRATEGIES = {
        "routing": {"ttl": TTL_SHORT, "max_size": 10000},
        "responses": {"ttl": TTL_MEDIUM, "max_size": 5000},
        "conversations": {"ttl": TTL_DAY, "max_size": 100},
        "patterns": {"ttl": TTL_LONG, "max_size": 1000},
        "metrics": {"ttl": TTL_SHORT, "max_size": 500},
    }


class CacheMetrics(BaseModel):
    total_requests: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
    hit_rate: float = 0.0
    avg_response_time: float = 0.0
    memory_usage: int = 0

    def update_hit(self, response_time: float):
        self.total_requests += 1
        self.cache_hits += 1
        self._update_hit_rate()
        self._update_avg_response_time(response_time)

    def update_miss(self, response_time: float):
        self.total_requests += 1
        self.cache_misses += 1
        self._update_hit_rate()
        self._update_avg_response_time(response_time)

    def _update_hit_rate(self):
        if self.total_requests > 0:
            self.hit_rate = self.cache_hits / self.total_requests

    def _update_avg_response_time(self, response_time: float):
        if self.total_requests == 1:
            self.avg_response_time = response_time
        else:
            self.avg_response_time = (
                self.avg_response_time * (self.total_requests - 1) + response_time
            ) / self.total_requests


class CacheManager:
    """Redis-based cache manager for hot layer"""

    def __init__(self, redis_url: str, max_connections: int = 20):
        self.redis_url = redis_url
        self.max_connections = max_connections
        self.settings = get_settings()
        self.redis: Optional[redis.Redis] = None
        self.redis_pool: Optional[redis.ConnectionPool] = None
        self.metrics = CacheMetrics()
        self._local_cache: Dict[str, tuple[Any, datetime]] = {}
        self._local_cache_max_size = 1000

    async def initialize(self):
        """Initialize Redis connection with proper async handling and fallbacks."""
        try:
            import redis.asyncio as redis_async

            # Create async Redis connection
            self.redis = redis_async.from_url(
                self.redis_url,
                max_connections=self.max_connections,
                decode_responses=True,
                socket_connect_timeout=10,
                socket_timeout=10,
                retry_on_timeout=True,
                health_check_interval=30,
            )

            # Test connection with timeout
            await asyncio.wait_for(self.redis.ping(), timeout=10.0)

            logger.info(
                f"✅ Redis cache manager initialized successfully: {self.redis_url}"
            )
            return True

        except asyncio.TimeoutError:
            logger.error("❌ Redis connection timed out")
            self._setup_fallback()
            return False
        except Exception as e:
            logger.error(f"❌ Failed to initialize Redis: {e}")
            self._setup_fallback()
            return False

    def _setup_fallback(self):
        """Setup local cache fallback when Redis is unavailable."""
        logger.warning("⚠️ Redis unavailable - using local cache fallback")
        self.redis = None
        self.redis_pool = None
        # Ensure local cache is ready
        if not hasattr(self, "_local_cache"):
            self._local_cache = {}
        logger.info("📦 Local cache fallback activated")

    async def cleanup(self):
        if self.redis:
            await self.redis.aclose()
        if self.redis_pool:
            await self.redis_pool.disconnect()

    async def health_check(self) -> bool:
        try:
            if self.redis:
                await self.redis.ping()
                return True
            return False
        except Exception:
            return False

    async def get(self, key: str, default: Any = None) -> Any:
        start_time = datetime.now()
        try:
            if self.redis:
                value = await self.redis.get(key)
                if value is not None:
                    response_time = (datetime.now() - start_time).total_seconds()
                    self.metrics.update_hit(response_time)
                    return json.loads(value)
            if key in self._local_cache:
                value, expiry = self._local_cache[key]
                if datetime.now() < expiry:
                    response_time = (datetime.now() - start_time).total_seconds()
                    self.metrics.update_hit(response_time)
                    return value
                else:
                    del self._local_cache[key]
            response_time = (datetime.now() - start_time).total_seconds()
            self.metrics.update_miss(response_time)
            return default
        except Exception as e:
            logger.warning(f"Cache get error for key {key}: {e}")
            response_time = (datetime.now() - start_time).total_seconds()
            self.metrics.update_miss(response_time)
            return default

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        try:
            serialized_value = json.dumps(value)
            if self.redis:
                if ttl:
                    await self.redis.setex(key, ttl, serialized_value)
                else:
                    await self.redis.set(key, serialized_value)
            expiry = datetime.now() + timedelta(seconds=ttl or CacheStrategy.TTL_MEDIUM)
            self._local_cache[key] = (value, expiry)
            self._cleanup_local_cache()
            return True
        except Exception as e:
            logger.warning(f"Cache set error for key {key}: {e}")
            try:
                expiry = datetime.now() + timedelta(
                    seconds=ttl or CacheStrategy.TTL_MEDIUM
                )
                self._local_cache[key] = (value, expiry)
                self._cleanup_local_cache()
                return True
            except Exception as local_e:
                logger.error(f"Local cache set error: {local_e}")
                return False

    def _cleanup_local_cache(self):
        if len(self._local_cache) > self._local_cache_max_size:
            now = datetime.now()
            expired_keys = [
                key for key, (_, expiry) in self._local_cache.items() if now >= expiry
            ]
            for key in expired_keys:
                del self._local_cache[key]
            if len(self._local_cache) > self._local_cache_max_size:
                sorted_items = sorted(
                    self._local_cache.items(),
                    key=lambda x: x[1][1],
                )
                self._local_cache = dict(sorted_items[-self._local_cache_max_size :])

    async def get_stats(self) -> Dict[str, Any]:
        """Get cache performance statistics"""
        stats = {
            "local_cache_size": len(self._local_cache),
            "local_cache_max_size": self._local_cache_max_size,
            "redis_connected": self.redis is not None,
            "metrics": {
                "hits": getattr(self.metrics, "hits", 0),
                "misses": getattr(self.metrics, "misses", 0),
                "total_requests": getattr(self.metrics, "total_requests", 0),
                "hit_rate": getattr(self.metrics, "hit_rate", 0.0),
                "avg_response_time": getattr(self.metrics, "avg_response_time", 0.0),
            },
        }

        # Add Redis-specific stats if connected
        if self.redis:
            try:
                redis_info = await self.redis.info()
                stats["redis_info"] = {
                    "used_memory": redis_info.get("used_memory_human", "N/A"),
                    "connected_clients": redis_info.get("connected_clients", 0),
                    "total_commands_processed": redis_info.get(
                        "total_commands_processed", 0
                    ),
                    "keyspace_hits": redis_info.get("keyspace_hits", 0),
                    "keyspace_misses": redis_info.get("keyspace_misses", 0),
                }
            except Exception as e:
                stats["redis_error"] = str(e)

        return stats
