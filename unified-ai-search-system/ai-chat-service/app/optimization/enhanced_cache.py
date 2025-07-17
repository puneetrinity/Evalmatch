"""Enhanced caching optimization for adaptive routing"""
import hashlib
import json
import time
from typing import Any, Optional
import structlog

logger = structlog.get_logger(__name__)


class EnhancedCacheManager:
    """Multi-layer caching with optimization for adaptive routing"""
    
    def __init__(self, redis_client=None):
        self.redis = redis_client
        self.local_cache = {}  # In-memory L1 cache
        self.local_cache_ttl = {}
        self.max_local_entries = 100
        self.cache_stats = {
            "l1_hits": 0,
            "l2_hits": 0,
            "misses": 0,
            "total_requests": 0
        }
    
    async def get_optimized(self, key: str) -> Optional[Any]:
        """Get with L1 (memory) + L2 (Redis) caching"""
        self.cache_stats["total_requests"] += 1
        
        # Check L1 cache first (fastest)
        if key in self.local_cache:
            if time.time() < self.local_cache_ttl.get(key, 0):
                self.cache_stats["l1_hits"] += 1
                logger.debug("cache_l1_hit", key=key)
                return self.local_cache[key]
            else:
                # Expired, remove from L1
                self.local_cache.pop(key, None)
                self.local_cache_ttl.pop(key, None)
        
        # Check L2 cache (Redis)
        if self.redis:
            try:
                value = await self.redis.get(key)
                if value:
                    self.cache_stats["l2_hits"] += 1
                    logger.debug("cache_l2_hit", key=key)
                    
                    # Store in L1 for next time
                    parsed_value = json.loads(value)
                    self._store_local(key, parsed_value, ttl=300)
                    return parsed_value
            except Exception as e:
                logger.warning("cache_l2_error", key=key, error=str(e))
        
        # Cache miss
        self.cache_stats["misses"] += 1
        logger.debug("cache_miss", key=key)
        return None
    
    async def set_optimized(self, key: str, value: Any, ttl: int = 3600):
        """Set with multi-layer caching"""
        try:
            # Store in L1 cache
            self._store_local(key, value, ttl=min(ttl, 300))  # L1 has shorter TTL
            
            # Store in L2 cache (Redis)
            if self.redis:
                try:
                    await self.redis.set(key, json.dumps(value), ex=ttl)
                    logger.debug("cache_stored", key=key, ttl=ttl)
                except Exception as e:
                    logger.warning("cache_l2_store_error", key=key, error=str(e))
        except Exception as e:
            logger.error("cache_store_error", key=key, error=str(e))
    
    def _store_local(self, key: str, value: Any, ttl: int = 300):
        """Store in local cache with TTL"""
        # Prevent memory bloat
        if len(self.local_cache) >= self.max_local_entries:
            # Remove oldest entry
            if self.local_cache_ttl:
                oldest_key = min(self.local_cache_ttl.keys(), key=lambda k: self.local_cache_ttl[k])
                self.local_cache.pop(oldest_key, None)
                self.local_cache_ttl.pop(oldest_key, None)
        
        self.local_cache[key] = value
        self.local_cache_ttl[key] = time.time() + ttl
    
    def get_cache_stats(self) -> dict:
        """Get cache performance statistics"""
        total = self.cache_stats["total_requests"]
        if total == 0:
            return self.cache_stats
        
        return {
            **self.cache_stats,
            "l1_hit_rate": self.cache_stats["l1_hits"] / total,
            "l2_hit_rate": self.cache_stats["l2_hits"] / total,
            "total_hit_rate": (self.cache_stats["l1_hits"] + self.cache_stats["l2_hits"]) / total,
            "miss_rate": self.cache_stats["misses"] / total
        }
    
    def create_adaptive_cache_key(self, query: str, arm_id: str, context: dict = None) -> str:
        """Create cache key optimized for adaptive routing"""
        # Use SHA256 for better hash distribution (avoiding collisions)
        key_data = {
            "query": query.lower().strip(),
            "arm_id": arm_id,
            "context_hash": self._hash_context(context) if context else None
        }
        
        key_string = json.dumps(key_data, sort_keys=True)
        key_hash = hashlib.sha256(key_string.encode()).hexdigest()[:16]
        
        return f"adaptive_cache:{arm_id}:{key_hash}"
    
    def _hash_context(self, context: dict) -> str:
        """Create stable hash for context dictionary"""
        if not context:
            return ""
        
        # Sort keys for consistent hashing
        sorted_context = json.dumps(context, sort_keys=True)
        return hashlib.sha256(sorted_context.encode()).hexdigest()[:8]


class AdaptiveCacheStrategy:
    """Intelligent caching strategy based on routing performance"""
    
    def __init__(self, enhanced_cache: EnhancedCacheManager):
        self.cache = enhanced_cache
        self.arm_cache_performance = {}
    
    def get_cache_ttl_for_arm(self, arm_id: str, confidence: float) -> int:
        """Get optimal cache TTL based on arm performance"""
        base_ttl = 3600  # 1 hour default
        
        # Adjust based on arm reliability
        if arm_id in self.arm_cache_performance:
            success_rate = self.arm_cache_performance[arm_id].get("success_rate", 0.5)
            
            if success_rate > 0.9:  # Highly reliable arm
                return int(base_ttl * 1.5)  # Cache longer
            elif success_rate < 0.7:  # Less reliable arm
                return int(base_ttl * 0.5)  # Cache shorter
        
        # Adjust based on confidence
        if confidence > 0.8:
            return int(base_ttl * 1.2)
        elif confidence < 0.6:
            return int(base_ttl * 0.8)
        
        return base_ttl
    
    def should_cache_response(self, arm_id: str, response_time: float, success: bool) -> bool:
        """Determine if response should be cached based on performance"""
        # Don't cache failures
        if not success:
            return False
        
        # Don't cache very slow responses
        if response_time > 10.0:
            return False
        
        # Cache fast, successful responses
        if response_time < 2.0:
            return True
        
        # For medium response times, check arm reliability
        if arm_id in self.arm_cache_performance:
            success_rate = self.arm_cache_performance[arm_id].get("success_rate", 0.5)
            return success_rate > 0.8
        
        return True  # Default to caching
    
    def update_arm_cache_performance(self, arm_id: str, response_time: float, success: bool, cached: bool):
        """Update cache performance metrics for arm"""
        if arm_id not in self.arm_cache_performance:
            self.arm_cache_performance[arm_id] = {
                "total_requests": 0,
                "total_cached": 0,
                "total_success": 0,
                "total_time": 0.0
            }
        
        stats = self.arm_cache_performance[arm_id]
        stats["total_requests"] += 1
        stats["total_cached"] += 1 if cached else 0
        stats["total_success"] += 1 if success else 0
        stats["total_time"] += response_time
        
        # Calculate rates
        stats["cache_rate"] = stats["total_cached"] / stats["total_requests"]
        stats["success_rate"] = stats["total_success"] / stats["total_requests"]
        stats["avg_response_time"] = stats["total_time"] / stats["total_requests"]
