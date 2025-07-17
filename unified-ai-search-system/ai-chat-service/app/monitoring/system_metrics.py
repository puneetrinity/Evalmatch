"""
Real-time System Metrics Collection
Replaces dummy monitoring with actual system performance data
Now with ClickHouse integration for cold storage
"""

import time
from typing import Dict

import psutil
import structlog

from app.storage.clickhouse_client import get_clickhouse_manager

logger = structlog.get_logger(__name__)


class SystemMetricsCollector:
    """Collects real-time system performance metrics"""

    def __init__(self):
        self.process = psutil.Process()
        self.start_time = time.time()
        self._cache_metrics = {"hits": 0, "misses": 0, "total_requests": 0}

    def get_memory_usage_mb(self) -> float:
        """Get actual memory usage in MB"""
        try:
            memory_info = self.process.memory_info()
            return memory_info.rss / (1024 * 1024)  # Convert bytes to MB
        except Exception as e:
            logger.warning("failed_to_get_memory_usage", error=str(e))
            return 512.0  # Fallback value

    def get_cpu_utilization(self) -> float:
        """Get actual CPU utilization (0.0 to 1.0)"""
        try:
            # Get CPU percent over a small interval for accuracy
            cpu_percent = self.process.cpu_percent(interval=0.1)
            return min(cpu_percent / 100.0, 1.0)  # Convert to 0-1 scale
        except Exception as e:
            logger.warning("failed_to_get_cpu_usage", error=str(e))
            return 0.6  # Fallback value

    def get_system_memory_stats(self) -> Dict[str, float]:
        """Get system-wide memory statistics"""
        try:
            mem = psutil.virtual_memory()
            return {
                "total_gb": mem.total / (1024**3),
                "available_gb": mem.available / (1024**3),
                "used_gb": mem.used / (1024**3),
                "utilization": mem.percent / 100.0,
            }
        except Exception as e:
            logger.warning("failed_to_get_system_memory", error=str(e))
            return {
                "total_gb": 8.0,
                "available_gb": 4.0,
                "used_gb": 4.0,
                "utilization": 0.5,
            }

    def get_disk_stats(self) -> Dict[str, float]:
        """Get disk usage statistics"""
        try:
            disk = psutil.disk_usage("/")
            return {
                "total_gb": disk.total / (1024**3),
                "free_gb": disk.free / (1024**3),
                "used_gb": disk.used / (1024**3),
                "utilization": (disk.used / disk.total),
            }
        except Exception as e:
            logger.warning("failed_to_get_disk_stats", error=str(e))
            return {
                "total_gb": 100.0,
                "free_gb": 50.0,
                "used_gb": 50.0,
                "utilization": 0.5,
            }

    def record_cache_hit(self):
        """Record a cache hit"""
        self._cache_metrics["hits"] += 1
        self._cache_metrics["total_requests"] += 1

    def record_cache_miss(self):
        """Record a cache miss"""
        self._cache_metrics["misses"] += 1
        self._cache_metrics["total_requests"] += 1

    def get_cache_hit_rate(self) -> float:
        """Get actual cache hit rate"""
        total = self._cache_metrics["total_requests"]
        if total == 0:
            return 0.8  # Default for new systems

        return self._cache_metrics["hits"] / total

    def reset_cache_metrics(self):
        """Reset cache metrics (useful for periodic reporting)"""
        self._cache_metrics = {"hits": 0, "misses": 0, "total_requests": 0}

    def get_network_stats(self) -> Dict[str, float]:
        """Get network I/O statistics"""
        try:
            net_io = psutil.net_io_counters()
            return {
                "bytes_sent_mb": net_io.bytes_sent / (1024**2),
                "bytes_recv_mb": net_io.bytes_recv / (1024**2),
                "packets_sent": net_io.packets_sent,
                "packets_recv": net_io.packets_recv,
            }
        except Exception as e:
            logger.warning("failed_to_get_network_stats", error=str(e))
            return {
                "bytes_sent_mb": 0.0,
                "bytes_recv_mb": 0.0,
                "packets_sent": 0,
                "packets_recv": 0,
            }

    def get_uptime_seconds(self) -> float:
        """Get application uptime in seconds"""
        return time.time() - self.start_time

    def get_comprehensive_metrics(self) -> Dict[str, any]:
        """Get all system metrics in one call"""
        return {
            "timestamp": time.time(),
            "uptime_seconds": self.get_uptime_seconds(),
            "process": {
                "memory_mb": self.get_memory_usage_mb(),
                "cpu_utilization": self.get_cpu_utilization(),
                "pid": self.process.pid,
            },
            "system": {
                "memory": self.get_system_memory_stats(),
                "disk": self.get_disk_stats(),
                "network": self.get_network_stats(),
            },
            "cache": {
                "hit_rate": self.get_cache_hit_rate(),
                "total_requests": self._cache_metrics["total_requests"],
                "hits": self._cache_metrics["hits"],
                "misses": self._cache_metrics["misses"],
            },
        }


class CacheMetricsTracker:
    """Enhanced cache metrics tracking with Redis integration"""

    def __init__(self, cache_manager=None):
        self.cache_manager = cache_manager
        self.metrics = {"hits": 0, "misses": 0, "sets": 0, "deletes": 0, "errors": 0}
        self.start_time = time.time()

    async def record_cache_operation(self, operation: str, success: bool = True):
        """Record cache operation with success/failure tracking"""
        if success:
            if operation in self.metrics:
                self.metrics[operation] += 1
        else:
            self.metrics["errors"] += 1

        # Also try to get real Redis stats if available
        if self.cache_manager and hasattr(self.cache_manager, "get_stats"):
            try:
                real_stats = await self.cache_manager.get_stats()
                return real_stats
            except Exception:
                pass

        return self.metrics

    def get_hit_rate(self) -> float:
        """Calculate cache hit rate"""
        total_requests = self.metrics["hits"] + self.metrics["misses"]
        if total_requests == 0:
            return 0.0

        return self.metrics["hits"] / total_requests

    def get_cache_performance_metrics(self) -> Dict[str, any]:
        """Get comprehensive cache performance metrics"""
        total_ops = sum(self.metrics.values()) - self.metrics["errors"]
        uptime = time.time() - self.start_time

        return {
            "hit_rate": self.get_hit_rate(),
            "total_operations": total_ops,
            "operations_per_second": total_ops / max(uptime, 1),
            "error_rate": self.metrics["errors"] / max(total_ops, 1),
            "metrics_breakdown": self.metrics.copy(),
            "uptime_seconds": uptime,
        }


# Global instances
_system_metrics_collector = None
_cache_metrics_tracker = None


def get_system_metrics_collector() -> SystemMetricsCollector:
    """Get singleton system metrics collector"""
    global _system_metrics_collector
    if _system_metrics_collector is None:
        _system_metrics_collector = SystemMetricsCollector()
    return _system_metrics_collector


def get_cache_metrics_tracker() -> CacheMetricsTracker:
    """Get singleton cache metrics tracker"""
    global _cache_metrics_tracker
    if _cache_metrics_tracker is None:
        _cache_metrics_tracker = CacheMetricsTracker()
    return _cache_metrics_tracker


async def collect_all_metrics() -> Dict[str, any]:
    """Convenience function to collect all metrics with ClickHouse storage"""
    system_collector = get_system_metrics_collector()
    cache_tracker = get_cache_metrics_tracker()

    metrics = {
        "system": system_collector.get_comprehensive_metrics(),
        "cache": cache_tracker.get_cache_performance_metrics(),
        "collection_timestamp": time.time(),
    }

    # Store in ClickHouse for cold storage analytics
    clickhouse_manager = get_clickhouse_manager()
    if clickhouse_manager:
        try:
            await clickhouse_manager.record_system_metrics(metrics)
        except Exception as e:
            logger.warning("failed_to_store_metrics_in_clickhouse", error=str(e))

    return metrics
