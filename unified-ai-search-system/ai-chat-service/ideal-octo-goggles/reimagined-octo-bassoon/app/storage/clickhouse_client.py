"""
ClickHouse Cold Storage Client
Handles long-term storage of metrics, costs, and analytics data
"""

import asyncio
import json
import time
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional

import structlog

logger = structlog.get_logger(__name__)

# Try to import ClickHouse drivers with fallback
try:
    import clickhouse_connect
    from clickhouse_driver import Client as ClickHouseDriver

    CLICKHOUSE_AVAILABLE = True
except ImportError:
    logger.warning(
        "ClickHouse drivers not available - install clickhouse-driver and clickhouse-connect"
    )
    CLICKHOUSE_AVAILABLE = False
    clickhouse_connect = None
    ClickHouseDriver = None


@dataclass
class SystemMetricsRecord:
    """System metrics record for ClickHouse storage"""

    timestamp: float
    memory_mb: float
    cpu_utilization: float
    cache_hit_rate: float
    network_bytes_sent: float
    network_bytes_recv: float
    uptime_seconds: float

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class CostEventRecord:
    """Cost event record for ClickHouse storage"""

    timestamp: float
    category: str
    cost_usd: float
    provider: str
    model: Optional[str] = None
    tokens: Optional[int] = None
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    request_id: Optional[str] = None
    details: Optional[str] = None  # JSON string

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class AdaptiveMetricsRecord:
    """Adaptive routing metrics record for ClickHouse storage"""

    timestamp: float
    routing_arm: str
    success: bool
    response_time: float
    cost_usd: float
    user_id: Optional[str] = None
    query_complexity: Optional[float] = None
    bandit_confidence: Optional[float] = None
    reward_score: Optional[float] = None

    def to_dict(self) -> Dict:
        return asdict(self)


class ClickHouseManager:
    """ClickHouse cold storage manager for historical data"""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 8123,
        database: str = "ai_search_metrics",
        username: str = "default",
        password: str = "",
    ):
        self.host = host
        self.port = port
        self.database = database
        self.username = username
        self.password = password

        self.client = None
        self.async_client = None
        self.connected = False

        # Batch processing settings
        self.batch_size = 1000
        self.flush_interval = 300  # 5 minutes

        # In-memory buffers for batch processing with thread safety
        self.system_metrics_buffer: List[SystemMetricsRecord] = []
        self.cost_events_buffer: List[CostEventRecord] = []
        self.adaptive_metrics_buffer: List[AdaptiveMetricsRecord] = []
        self._buffer_lock = asyncio.Lock()

        self.last_flush_time = time.time()

        # Background task tracking
        self._background_task = None
        self._shutdown_event = asyncio.Event()
        
        logger.info(
            "clickhouse_manager_initialized", host=host, port=port, database=database
        )

    async def initialize(self) -> bool:
        """Initialize ClickHouse connection and create tables"""
        if not CLICKHOUSE_AVAILABLE:
            logger.warning("clickhouse_not_available_using_fallback")
            return False

        try:
            # Create connection
            self.client = clickhouse_connect.get_client(
                host=self.host,
                port=self.port,
                database=self.database,
                username=self.username,
                password=self.password,
                connect_timeout=10,
                send_receive_timeout=30,
            )

            # Test connection
            self.client.command("SELECT 1")

            # Create database if it doesn't exist
            await self._create_database()

            # Create tables
            await self._create_tables()

            self.connected = True
            logger.info("clickhouse_connection_established")

            # Start background flush task with proper tracking
            self._background_task = asyncio.create_task(self._safe_background_flush_task())

            return True

        except Exception as e:
            logger.error("clickhouse_connection_failed", error=str(e))
            self.connected = False
            return False

    async def _create_database(self):
        """Create database if it doesn't exist"""
        try:
            self.client.command(f"CREATE DATABASE IF NOT EXISTS {self.database}")
            logger.info("clickhouse_database_created", database=self.database)
        except Exception as e:
            logger.error("clickhouse_database_creation_failed", error=str(e))

    async def _create_tables(self):
        """Create ClickHouse tables for metrics storage"""

        # System metrics table
        system_metrics_sql = """
        CREATE TABLE IF NOT EXISTS system_metrics (
            timestamp DateTime64(3),
            memory_mb Float64,
            cpu_utilization Float64,
            cache_hit_rate Float64,
            network_bytes_sent Float64,
            network_bytes_recv Float64,
            uptime_seconds Float64,
            date Date DEFAULT toDate(timestamp)
        ) ENGINE = MergeTree()
        PARTITION BY date
        ORDER BY timestamp
        TTL timestamp + INTERVAL 90 DAY
        """

        # Cost events table
        cost_events_sql = """
        CREATE TABLE IF NOT EXISTS cost_events (
            timestamp DateTime64(3),
            category LowCardinality(String),
            cost_usd Float64,
            provider LowCardinality(String),
            model LowCardinality(Nullable(String)),
            tokens Nullable(UInt32),
            user_id Nullable(String),
            session_id Nullable(String),
            request_id Nullable(String),
            details Nullable(String),
            date Date DEFAULT toDate(timestamp)
        ) ENGINE = MergeTree()
        PARTITION BY date
        ORDER BY (timestamp, category, provider)
        TTL timestamp + INTERVAL 365 DAY
        """

        # Adaptive routing metrics table
        adaptive_metrics_sql = """
        CREATE TABLE IF NOT EXISTS adaptive_metrics (
            timestamp DateTime64(3),
            routing_arm LowCardinality(String),
            success UInt8,
            response_time Float64,
            cost_usd Float64,
            user_id Nullable(String),
            query_complexity Nullable(Float64),
            bandit_confidence Nullable(Float64),
            reward_score Nullable(Float64),
            date Date DEFAULT toDate(timestamp)
        ) ENGINE = MergeTree()
        PARTITION BY date
        ORDER BY (timestamp, routing_arm)
        TTL timestamp + INTERVAL 180 DAY
        """

        # User session summary table (materialized view)
        user_sessions_sql = """
        CREATE TABLE IF NOT EXISTS user_sessions (
            date Date,
            user_id String,
            total_requests UInt32,
            total_cost Float64,
            avg_response_time Float64,
            success_rate Float64,
            primary_routing_arm String
        ) ENGINE = SummingMergeTree()
        PARTITION BY date
        ORDER BY (date, user_id)
        TTL date + INTERVAL 365 DAY
        """

        try:
            self.client.command(system_metrics_sql)
            self.client.command(cost_events_sql)
            self.client.command(adaptive_metrics_sql)
            self.client.command(user_sessions_sql)

            logger.info("clickhouse_tables_created")

        except Exception as e:
            logger.error("clickhouse_table_creation_failed", error=str(e))

    async def record_system_metrics(self, metrics: Dict[str, Any]):
        """Record system metrics for cold storage"""
        if not self.connected:
            return

        try:
            # Extract system metrics from comprehensive metrics
            system_data = metrics.get("system", {})
            process_data = system_data.get("process", {})
            network_data = system_data.get("network", {})
            cache_data = metrics.get("cache", {})

            record = SystemMetricsRecord(
                timestamp=metrics.get("collection_timestamp", time.time()),
                memory_mb=process_data.get("memory_mb", 0),
                cpu_utilization=process_data.get("cpu_utilization", 0),
                cache_hit_rate=cache_data.get("hit_rate", 0),
                network_bytes_sent=network_data.get("bytes_sent_mb", 0),
                network_bytes_recv=network_data.get("bytes_recv_mb", 0),
                uptime_seconds=system_data.get("uptime_seconds", 0),
            )

            async with self._buffer_lock:
                self.system_metrics_buffer.append(record)
            await self._check_flush()

        except Exception as e:
            logger.error("system_metrics_recording_failed", error=str(e))

    async def record_cost_event(
        self,
        category: str,
        cost_usd: float,
        provider: str,
        model: Optional[str] = None,
        tokens: Optional[int] = None,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        request_id: Optional[str] = None,
        details: Optional[Dict] = None,
    ):
        """Record cost event for cold storage"""
        if not self.connected:
            return

        try:
            record = CostEventRecord(
                timestamp=time.time(),
                category=category,
                cost_usd=cost_usd,
                provider=provider,
                model=model,
                tokens=tokens,
                user_id=user_id,
                session_id=session_id,
                request_id=request_id,
                details=json.dumps(details) if details else None,
            )

            async with self._buffer_lock:
                self.cost_events_buffer.append(record)
            await self._check_flush()

        except Exception as e:
            logger.error("cost_event_recording_failed", error=str(e))

    async def record_adaptive_metrics(
        self,
        routing_arm: str,
        success: bool,
        response_time: float,
        cost_usd: float,
        user_id: Optional[str] = None,
        query_complexity: Optional[float] = None,
        bandit_confidence: Optional[float] = None,
        reward_score: Optional[float] = None,
    ):
        """Record adaptive routing metrics for cold storage"""
        if not self.connected:
            return

        try:
            record = AdaptiveMetricsRecord(
                timestamp=time.time(),
                routing_arm=routing_arm,
                success=success,
                response_time=response_time,
                cost_usd=cost_usd,
                user_id=user_id,
                query_complexity=query_complexity,
                bandit_confidence=bandit_confidence,
                reward_score=reward_score,
            )

            async with self._buffer_lock:
                self.adaptive_metrics_buffer.append(record)
            await self._check_flush()

        except Exception as e:
            logger.error("adaptive_metrics_recording_failed", error=str(e))

    async def _check_flush(self):
        """Check if buffers need flushing with thread safety"""
        async with self._buffer_lock:
            total_records = (
                len(self.system_metrics_buffer)
                + len(self.cost_events_buffer)
                + len(self.adaptive_metrics_buffer)
            )

        time_since_flush = time.time() - self.last_flush_time

        if total_records >= self.batch_size or time_since_flush >= self.flush_interval:
            await self._flush_buffers()

    async def _flush_buffers(self):
        """Flush all buffers to ClickHouse with thread safety"""
        if not self.connected:
            return

        try:
            # Atomically copy and clear buffers
            async with self._buffer_lock:
                system_metrics_data = [record.to_dict() for record in self.system_metrics_buffer]
                cost_events_data = [record.to_dict() for record in self.cost_events_buffer]
                adaptive_metrics_data = [record.to_dict() for record in self.adaptive_metrics_buffer]
                
                # Clear buffers after copying
                self.system_metrics_buffer.clear()
                self.cost_events_buffer.clear()
                self.adaptive_metrics_buffer.clear()
            
            # Insert data outside of lock to avoid blocking buffer operations
            if system_metrics_data:
                self.client.insert("system_metrics", system_metrics_data)
                logger.debug("system_metrics_flushed", count=len(system_metrics_data))

            if cost_events_data:
                self.client.insert("cost_events", cost_events_data)
                logger.debug("cost_events_flushed", count=len(cost_events_data))

            if adaptive_metrics_data:
                self.client.insert("adaptive_metrics", adaptive_metrics_data)
                logger.debug("adaptive_metrics_flushed", count=len(adaptive_metrics_data))

            self.last_flush_time = time.time()

        except Exception as e:
            logger.error("buffer_flush_failed", error=str(e))

    async def _background_flush_task(self):
        """Background task to periodically flush buffers"""
        while self.connected:
            try:
                await asyncio.sleep(self.flush_interval)
                await self._flush_buffers()
            except Exception as e:
                logger.error("background_flush_error", error=str(e))

    async def get_cost_analytics(
        self,
        days: int = 30,
        user_id: Optional[str] = None,
        category: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get cost analytics from ClickHouse"""
        if not self.connected:
            return {"error": "ClickHouse not connected"}

        try:
            where_clauses = [f"timestamp >= now() - INTERVAL {days} DAY"]

            if user_id:
                where_clauses.append(f"user_id = '{user_id}'")
            if category:
                where_clauses.append(f"category = '{category}'")

            where_clause = " AND ".join(where_clauses)

            # Total costs by category
            category_sql = f"""
            SELECT 
                category,
                provider,
                sum(cost_usd) as total_cost,
                count() as request_count,
                avg(cost_usd) as avg_cost
            FROM cost_events 
            WHERE {where_clause}
            GROUP BY category, provider
            ORDER BY total_cost DESC
            """

            # Daily cost trends
            trends_sql = f"""
            SELECT 
                toDate(timestamp) as date,
                sum(cost_usd) as daily_cost,
                count() as daily_requests
            FROM cost_events 
            WHERE {where_clause}
            GROUP BY date
            ORDER BY date DESC
            LIMIT 30
            """

            # Top users by cost
            users_sql = f"""
            SELECT 
                user_id,
                sum(cost_usd) as total_cost,
                count() as request_count
            FROM cost_events 
            WHERE {where_clause} AND user_id IS NOT NULL
            GROUP BY user_id
            ORDER BY total_cost DESC
            LIMIT 20
            """

            category_data = self.client.query(category_sql).result_rows
            trends_data = self.client.query(trends_sql).result_rows
            users_data = self.client.query(users_sql).result_rows

            return {
                "period_days": days,
                "category_breakdown": [
                    {
                        "category": row[0],
                        "provider": row[1],
                        "total_cost": float(row[2]),
                        "request_count": int(row[3]),
                        "avg_cost": float(row[4]),
                    }
                    for row in category_data
                ],
                "daily_trends": [
                    {
                        "date": str(row[0]),
                        "daily_cost": float(row[1]),
                        "daily_requests": int(row[2]),
                    }
                    for row in trends_data
                ],
                "top_users": [
                    {
                        "user_id": row[0],
                        "total_cost": float(row[1]),
                        "request_count": int(row[2]),
                    }
                    for row in users_data
                ],
            }

        except Exception as e:
            logger.error("cost_analytics_query_failed", error=str(e))
            return {"error": str(e)}

    async def get_performance_analytics(self, days: int = 7) -> Dict[str, Any]:
        """Get performance analytics from ClickHouse"""
        if not self.connected:
            return {"error": "ClickHouse not connected"}

        try:
            # System performance trends
            system_sql = f"""
            SELECT 
                toStartOfHour(timestamp) as hour,
                avg(memory_mb) as avg_memory,
                avg(cpu_utilization) as avg_cpu,
                avg(cache_hit_rate) as avg_cache_hit_rate
            FROM system_metrics 
            WHERE timestamp >= now() - INTERVAL {days} DAY
            GROUP BY hour
            ORDER BY hour DESC
            LIMIT 168  -- 7 days * 24 hours
            """

            # Adaptive routing performance
            adaptive_sql = f"""
            SELECT 
                routing_arm,
                count() as request_count,
                avg(response_time) as avg_response_time,
                sum(success) / count() as success_rate,
                avg(cost_usd) as avg_cost,
                avg(reward_score) as avg_reward
            FROM adaptive_metrics 
            WHERE timestamp >= now() - INTERVAL {days} DAY
            GROUP BY routing_arm
            ORDER BY request_count DESC
            """

            system_data = self.client.query(system_sql).result_rows
            adaptive_data = self.client.query(adaptive_sql).result_rows

            return {
                "period_days": days,
                "system_trends": [
                    {
                        "hour": str(row[0]),
                        "avg_memory_mb": float(row[1]),
                        "avg_cpu_utilization": float(row[2]),
                        "avg_cache_hit_rate": float(row[3]),
                    }
                    for row in system_data
                ],
                "adaptive_performance": [
                    {
                        "routing_arm": row[0],
                        "request_count": int(row[1]),
                        "avg_response_time": float(row[2]),
                        "success_rate": float(row[3]),
                        "avg_cost": float(row[4]),
                        "avg_reward": float(row[5]) if row[5] else None,
                    }
                    for row in adaptive_data
                ],
            }

        except Exception as e:
            logger.error("performance_analytics_query_failed", error=str(e))
            return {"error": str(e)}

    async def _safe_background_flush_task(self):
        """Safely run background flush task with error handling."""
        try:
            await self._background_flush_task()
        except asyncio.CancelledError:
            logger.info("Background flush task cancelled")
            raise
        except Exception as e:
            logger.error("Background flush task failed", error=str(e), exc_info=True)

    async def _background_flush_task(self):
        """Background task to flush buffers periodically"""
        while not self._shutdown_event.is_set():
            try:
                await asyncio.sleep(self.flush_interval)
                if self.connected:
                    await self._flush_buffers()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Background flush error", error=str(e))
                await asyncio.sleep(60)  # Wait before retrying

    async def shutdown(self):
        """Gracefully shutdown the ClickHouse manager"""
        logger.info("Shutting down ClickHouse manager...")
        
        # Signal shutdown to background task
        self._shutdown_event.set()
        
        # Cancel background task
        if self._background_task:
            self._background_task.cancel()
            try:
                await self._background_task
            except asyncio.CancelledError:
                pass
        
        # Cleanup connection
        await self.cleanup()
        
        logger.info("ClickHouse manager shutdown completed")

    async def cleanup(self):
        """Cleanup ClickHouse connection"""
        if self.connected:
            try:
                # Flush remaining data
                await self._flush_buffers()

                # Close connection
                if self.client:
                    self.client.close()

                self.connected = False
                logger.info("clickhouse_connection_closed")

            except Exception as e:
                logger.error("clickhouse_cleanup_failed", error=str(e))
                
        # Clear buffers to prevent memory leaks
        self.system_metrics_buffer.clear()
        self.cost_events_buffer.clear()
        self.adaptive_metrics_buffer.clear()


# Global ClickHouse manager instance
_clickhouse_manager: Optional[ClickHouseManager] = None


def get_clickhouse_manager() -> Optional[ClickHouseManager]:
    """Get singleton ClickHouse manager"""
    return _clickhouse_manager


async def initialize_clickhouse_manager(
    host: str = "localhost",
    port: int = 8123,
    database: str = "ai_search_metrics",
    username: str = "default",
    password: str = "",
) -> Optional[ClickHouseManager]:
    """Initialize ClickHouse manager"""
    global _clickhouse_manager

    _clickhouse_manager = ClickHouseManager(
        host=host, port=port, database=database, username=username, password=password
    )

    success = await _clickhouse_manager.initialize()

    if not success:
        logger.warning(
            "clickhouse_initialization_failed_continuing_without_cold_storage"
        )
        _clickhouse_manager = None

    return _clickhouse_manager
