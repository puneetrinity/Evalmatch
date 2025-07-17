"""
Advanced Metrics and Monitoring for Adaptive Routing
Week 2: Comprehensive performance tracking and alerting
"""

import asyncio
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

import structlog

logger = structlog.get_logger(__name__)


class MetricType(Enum):
    """Types of metrics we track"""

    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    TIMER = "timer"


class AlertSeverity(Enum):
    """Alert severity levels"""

    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    EMERGENCY = "emergency"


@dataclass
class MetricPoint:
    """Single metric data point"""

    name: str
    value: float
    timestamp: float
    tags: Dict[str, str]
    metric_type: MetricType


@dataclass
class Alert:
    """Alert definition and state"""

    alert_id: str
    name: str
    description: str
    severity: AlertSeverity
    condition: str  # Human readable condition
    threshold: float
    comparison: str  # "gt", "lt", "eq"
    metric_name: str
    window_minutes: int
    triggered_at: Optional[float] = None
    resolved_at: Optional[float] = None
    notification_sent: bool = False


class MetricsCollector:
    """
    Comprehensive metrics collection for adaptive routing

    Tracks:
    - Bandit performance metrics
    - User experience metrics
    - Business impact metrics
    - System performance metrics
    - Cost and efficiency metrics
    """

    def __init__(self, retention_hours: int = 24):
        self.retention_hours = retention_hours
        self.retention_seconds = retention_hours * 3600

        # Metric storage (in production, use Prometheus/InfluxDB)
        self.metrics: Dict[str, deque] = defaultdict(lambda: deque(maxlen=10000))

        # Real-time aggregations
        self.counters: Dict[str, float] = defaultdict(float)
        self.gauges: Dict[str, float] = defaultdict(float)
        self.histograms: Dict[str, List[float]] = defaultdict(list)

        # Performance tracking
        self.response_times = deque(maxlen=1000)
        self.error_rates = deque(maxlen=1000)
        self.cost_tracking = deque(maxlen=1000)

        logger.info("metrics_collector_initialized", retention_hours=retention_hours)

    def record_metric(
        self,
        name: str,
        value: float,
        tags: Dict[str, str] = None,
        metric_type: MetricType = MetricType.GAUGE,
    ) -> None:
        """Record a metric point"""
        tags = tags or {}
        timestamp = time.time()

        metric_point = MetricPoint(
            name=name,
            value=value,
            timestamp=timestamp,
            tags=tags,
            metric_type=metric_type,
        )

        # Store in time series
        self.metrics[name].append(metric_point)

        # Update real-time aggregations
        if metric_type == MetricType.COUNTER:
            self.counters[name] += value
        elif metric_type == MetricType.GAUGE:
            self.gauges[name] = value
        elif metric_type == MetricType.HISTOGRAM:
            self.histograms[name].append(value)
            # Keep only recent values for histograms
            if len(self.histograms[name]) > 1000:
                self.histograms[name] = self.histograms[name][-1000:]

        # Clean old data
        self._clean_old_metrics(name)

    def record_bandit_decision(
        self, arm_selected: str, confidence: float, context: Dict[str, Any] = None
    ) -> None:
        """Record bandit decision metrics"""
        tags = {"arm": arm_selected}
        if context:
            tags.update(
                {
                    k: str(v)
                    for k, v in context.items()
                    if isinstance(v, (str, int, float))
                }
            )

        self.record_metric("bandit.decisions", 1, tags, MetricType.COUNTER)
        self.record_metric("bandit.confidence", confidence, tags, MetricType.HISTOGRAM)
        self.record_metric(
            f"bandit.arm.{arm_selected}.selections", 1, tags, MetricType.COUNTER
        )

    def record_request_completion(
        self,
        arm_used: str,
        response_time: float,
        success: bool,
        cost_usd: float = 0.0,
        user_satisfaction: Optional[float] = None,
    ) -> None:
        """Record request completion metrics"""
        tags = {"arm": arm_used, "success": str(success)}

        # Performance metrics
        self.record_metric("requests.total", 1, tags, MetricType.COUNTER)
        self.record_metric(
            "requests.response_time", response_time, tags, MetricType.HISTOGRAM
        )
        self.record_metric(
            "requests.success_rate", 1.0 if success else 0.0, tags, MetricType.HISTOGRAM
        )

        # Cost metrics
        if cost_usd > 0:
            self.record_metric(
                "requests.cost_usd", cost_usd, tags, MetricType.HISTOGRAM
            )
            self.record_metric("cost.total_usd", cost_usd, tags, MetricType.COUNTER)

        # User satisfaction
        if user_satisfaction is not None:
            self.record_metric(
                "ux.satisfaction", user_satisfaction, tags, MetricType.HISTOGRAM
            )

        # Update rolling windows
        self.response_times.append((time.time(), response_time))
        self.error_rates.append((time.time(), 0.0 if success else 1.0))
        if cost_usd > 0:
            self.cost_tracking.append((time.time(), cost_usd))

    def record_business_event(
        self,
        event_type: str,
        value: float = 1.0,
        arm_used: Optional[str] = None,
        metadata: Dict[str, Any] = None,
    ) -> None:
        """Record business impact events"""
        tags = {"event_type": event_type}
        if arm_used:
            tags["arm"] = arm_used
        if metadata:
            tags.update(
                {
                    k: str(v)
                    for k, v in metadata.items()
                    if isinstance(v, (str, int, float))
                }
            )

        self.record_metric(f"business.{event_type}", value, tags, MetricType.COUNTER)
        self.record_metric("business.events.total", 1, tags, MetricType.COUNTER)

    def get_current_metrics(self, window_minutes: int = 5) -> Dict[str, Any]:
        """Get current metrics summary"""
        current_time = time.time()
        window_start = current_time - (window_minutes * 60)

        metrics_summary = {
            "timestamp": current_time,
            "window_minutes": window_minutes,
            "performance": self._get_performance_metrics(window_start),
            "bandit": self._get_bandit_metrics(window_start),
            "business": self._get_business_metrics(window_start),
            "cost": self._get_cost_metrics(window_start),
        }

        return metrics_summary

    def _get_performance_metrics(self, window_start: float) -> Dict[str, float]:
        """Get performance metrics for time window"""
        # Filter recent response times
        recent_times = [rt for ts, rt in self.response_times if ts >= window_start]
        recent_errors = [er for ts, er in self.error_rates if ts >= window_start]

        if not recent_times:
            return {"requests": 0}

        return {
            "requests": len(recent_times),
            "avg_response_time": sum(recent_times) / len(recent_times),
            "p95_response_time": self._percentile(recent_times, 0.95),
            "p99_response_time": self._percentile(recent_times, 0.99),
            "error_rate": (
                sum(recent_errors) / len(recent_errors) if recent_errors else 0.0
            ),
            "success_rate": 1.0
            - (sum(recent_errors) / len(recent_errors) if recent_errors else 0.0),
        }

    def _get_bandit_metrics(self, window_start: float) -> Dict[str, Any]:
        """Get bandit-specific metrics"""
        bandit_metrics = {}

        # Get recent bandit decisions
        decision_metrics = self.metrics.get("bandit.decisions", deque())
        recent_decisions = [m for m in decision_metrics if m.timestamp >= window_start]

        if recent_decisions:
            bandit_metrics["total_decisions"] = len(recent_decisions)

            # Arm distribution
            arm_counts = defaultdict(int)
            for decision in recent_decisions:
                arm = decision.tags.get("arm", "unknown")
                arm_counts[arm] += 1

            bandit_metrics["arm_distribution"] = dict(arm_counts)

        # Get confidence metrics
        confidence_metrics = self.metrics.get("bandit.confidence", deque())
        recent_confidence = [
            m.value for m in confidence_metrics if m.timestamp >= window_start
        ]

        if recent_confidence:
            bandit_metrics["avg_confidence"] = sum(recent_confidence) / len(
                recent_confidence
            )
            bandit_metrics["min_confidence"] = min(recent_confidence)
            bandit_metrics["p95_confidence"] = self._percentile(recent_confidence, 0.95)

        return bandit_metrics

    def _get_business_metrics(self, window_start: float) -> Dict[str, Any]:
        """Get business impact metrics"""
        business_metrics = {}

        # Get business events
        event_metrics = self.metrics.get("business.events.total", deque())
        recent_events = [m for m in event_metrics if m.timestamp >= window_start]

        if recent_events:
            business_metrics["total_events"] = len(recent_events)

            # Event type distribution
            event_counts = defaultdict(int)
            for event in recent_events:
                event_type = event.tags.get("event_type", "unknown")
                event_counts[event_type] += 1

            business_metrics["event_distribution"] = dict(event_counts)

        return business_metrics

    def _get_cost_metrics(self, window_start: float) -> Dict[str, float]:
        """Get cost tracking metrics"""
        recent_costs = [cost for ts, cost in self.cost_tracking if ts >= window_start]

        if not recent_costs:
            return {"requests_with_cost": 0}

        return {
            "requests_with_cost": len(recent_costs),
            "total_cost_usd": sum(recent_costs),
            "avg_cost_per_request": sum(recent_costs) / len(recent_costs),
            "p95_cost": self._percentile(recent_costs, 0.95),
        }

    def _percentile(self, values: List[float], percentile: float) -> float:
        """Calculate percentile of values"""
        if not values:
            return 0.0

        sorted_values = sorted(values)
        index = int(len(sorted_values) * percentile)
        return sorted_values[min(index, len(sorted_values) - 1)]

    def _clean_old_metrics(self, metric_name: str) -> None:
        """Remove old metric points outside retention window"""
        if metric_name not in self.metrics:
            return

        cutoff_time = time.time() - self.retention_seconds
        metric_deque = self.metrics[metric_name]

        # Remove old points from the left
        while metric_deque and metric_deque[0].timestamp < cutoff_time:
            metric_deque.popleft()


class AlertManager:
    """
    Alert management for adaptive routing system

    Features:
    - Configurable alert conditions
    - Alert suppression and grouping
    - Integration with notification systems
    """

    def __init__(self, metrics_collector: MetricsCollector):
        self.metrics_collector = metrics_collector
        self.alerts: Dict[str, Alert] = {}
        self.active_alerts: Dict[str, Alert] = {}
        self.alert_history: List[Alert] = []

        # Set up default alerts
        self._setup_default_alerts()

        logger.info("alert_manager_initialized")

    def _setup_default_alerts(self) -> None:
        """Set up default alerts for adaptive routing"""
        default_alerts = [
            Alert(
                alert_id="high_error_rate",
                name="High Error Rate",
                description="Error rate exceeds 5% over 5 minutes",
                severity=AlertSeverity.CRITICAL,
                condition="error_rate > 0.05 for 5 minutes",
                threshold=0.05,
                comparison="gt",
                metric_name="error_rate",
                window_minutes=5,
            ),
            Alert(
                alert_id="slow_response_time",
                name="Slow Response Time",
                description="P95 response time exceeds 5 seconds",
                severity=AlertSeverity.WARNING,
                condition="p95_response_time > 5.0 seconds",
                threshold=5.0,
                comparison="gt",
                metric_name="p95_response_time",
                window_minutes=5,
            ),
            Alert(
                alert_id="high_cost",
                name="High Cost Per Request",
                description="Average cost per request exceeds $0.10",
                severity=AlertSeverity.WARNING,
                condition="avg_cost_per_request > 0.10 USD",
                threshold=0.10,
                comparison="gt",
                metric_name="avg_cost_per_request",
                window_minutes=10,
            ),
            Alert(
                alert_id="low_bandit_confidence",
                name="Low Bandit Confidence",
                description="Bandit confidence drops below 0.5",
                severity=AlertSeverity.INFO,
                condition="avg_confidence < 0.5",
                threshold=0.5,
                comparison="lt",
                metric_name="avg_confidence",
                window_minutes=15,
            ),
            Alert(
                alert_id="no_requests",
                name="No Requests",
                description="No requests processed in 10 minutes",
                severity=AlertSeverity.WARNING,
                condition="requests == 0 for 10 minutes",
                threshold=0,
                comparison="eq",
                metric_name="requests",
                window_minutes=10,
            ),
        ]

        for alert in default_alerts:
            self.alerts[alert.alert_id] = alert

    def check_alerts(self) -> List[Alert]:
        """Check all alerts and return triggered ones"""
        triggered_alerts = []
        current_metrics = self.metrics_collector.get_current_metrics(window_minutes=15)

        for alert in self.alerts.values():
            if self._evaluate_alert(alert, current_metrics):
                triggered_alerts.append(alert)

        return triggered_alerts

    def _evaluate_alert(self, alert: Alert, metrics: Dict[str, Any]) -> bool:
        """Evaluate if alert condition is met"""
        # Get metric value from nested metrics structure
        metric_value = self._extract_metric_value(alert.metric_name, metrics)

        if metric_value is None:
            return False

        # Check condition
        condition_met = False
        if alert.comparison == "gt":
            condition_met = metric_value > alert.threshold
        elif alert.comparison == "lt":
            condition_met = metric_value < alert.threshold
        elif alert.comparison == "eq":
            condition_met = metric_value == alert.threshold

        current_time = time.time()

        if condition_met:
            if alert.alert_id not in self.active_alerts:
                # New alert triggered
                alert.triggered_at = current_time
                alert.resolved_at = None
                alert.notification_sent = False
                self.active_alerts[alert.alert_id] = alert

                logger.warning(
                    "alert_triggered",
                    alert_id=alert.alert_id,
                    alert_name=alert.name,
                    metric_value=metric_value,
                    threshold=alert.threshold,
                    severity=alert.severity.value,
                )

                return True
        else:
            if alert.alert_id in self.active_alerts:
                # Alert resolved
                alert.resolved_at = current_time
                resolved_alert = self.active_alerts.pop(alert.alert_id)
                self.alert_history.append(resolved_alert)

                logger.info(
                    "alert_resolved",
                    alert_id=alert.alert_id,
                    alert_name=alert.name,
                    metric_value=metric_value,
                    duration_minutes=(
                        (current_time - alert.triggered_at) / 60
                        if alert.triggered_at
                        else 0
                    ),
                )

        return False

    def _extract_metric_value(
        self, metric_name: str, metrics: Dict[str, Any]
    ) -> Optional[float]:
        """Extract metric value from nested metrics structure"""
        # Handle nested metric paths like "performance.error_rate"
        parts = metric_name.split(".")
        current = metrics

        for part in parts:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return None

        return current if isinstance(current, (int, float)) else None

    def get_alert_status(self) -> Dict[str, Any]:
        """Get current alert status"""
        return {
            "active_alerts": {
                alert_id: {
                    "name": alert.name,
                    "severity": alert.severity.value,
                    "triggered_at": alert.triggered_at,
                    "description": alert.description,
                }
                for alert_id, alert in self.active_alerts.items()
            },
            "total_alerts_configured": len(self.alerts),
            "alerts_triggered_today": len(
                [
                    alert
                    for alert in self.alert_history
                    if alert.triggered_at and alert.triggered_at > (time.time() - 86400)
                ]
            ),
        }


class AdaptiveMonitor:
    """
    Main monitoring system for adaptive routing
    Combines metrics collection and alerting
    """

    def __init__(self, retention_hours: int = 24):
        self.metrics_collector = MetricsCollector(retention_hours)
        self.alert_manager = AlertManager(self.metrics_collector)
        self.monitoring_active = True

        # Start background monitoring
        self._start_background_monitoring()

        logger.info("adaptive_monitor_initialized")

    def _start_background_monitoring(self) -> None:
        """Start background monitoring tasks"""

        async def monitoring_loop():
            while self.monitoring_active:
                try:
                    # Check alerts every minute
                    triggered_alerts = self.alert_manager.check_alerts()

                    if triggered_alerts:
                        logger.info(
                            "monitoring_check_completed",
                            triggered_alerts=len(triggered_alerts),
                        )

                    # Wait 60 seconds
                    await asyncio.sleep(60)

                except Exception as e:
                    logger.error("monitoring_loop_error", error=str(e))
                    await asyncio.sleep(60)

        # Start monitoring in background (in production, use proper task scheduling)
        asyncio.create_task(monitoring_loop())

    def record_bandit_decision(
        self, arm: str, confidence: float, context: Dict = None
    ) -> None:
        """Record bandit decision"""
        self.metrics_collector.record_bandit_decision(arm, confidence, context)

    def record_request_completion(
        self,
        arm: str,
        response_time: float,
        success: bool,
        cost_usd: float = 0.0,
        user_satisfaction: Optional[float] = None,
    ) -> None:
        """Record request completion"""
        self.metrics_collector.record_request_completion(
            arm, response_time, success, cost_usd, user_satisfaction
        )

    def record_business_event(
        self,
        event_type: str,
        value: float = 1.0,
        arm_used: Optional[str] = None,
        metadata: Dict = None,
    ) -> None:
        """Record business event"""
        self.metrics_collector.record_business_event(
            event_type, value, arm_used, metadata
        )

    def get_dashboard_data(self, window_minutes: int = 15) -> Dict[str, Any]:
        """Get comprehensive dashboard data"""
        metrics = self.metrics_collector.get_current_metrics(window_minutes)
        alerts = self.alert_manager.get_alert_status()

        return {
            "timestamp": time.time(),
            "window_minutes": window_minutes,
            "metrics": metrics,
            "alerts": alerts,
            "system_health": self._calculate_system_health(metrics),
        }

    def _calculate_system_health(self, metrics: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate overall system health score"""
        health_score = 100.0
        health_factors = []

        # Performance health
        perf = metrics.get("performance", {})
        if perf.get("error_rate", 0) > 0.05:  # >5% error rate
            health_score -= 30
            health_factors.append("high_error_rate")

        if perf.get("p95_response_time", 0) > 5.0:  # >5s response time
            health_score -= 20
            health_factors.append("slow_response_time")

        # Bandit health
        bandit = metrics.get("bandit", {})
        if bandit.get("avg_confidence", 1.0) < 0.5:  # Low confidence
            health_score -= 10
            health_factors.append("low_bandit_confidence")

        # Cost health
        cost = metrics.get("cost", {})
        if cost.get("avg_cost_per_request", 0) > 0.10:  # >$0.10 per request
            health_score -= 15
            health_factors.append("high_cost")

        health_score = max(0, health_score)

        if health_score >= 90:
            health_status = "excellent"
        elif health_score >= 75:
            health_status = "good"
        elif health_score >= 50:
            health_status = "fair"
        else:
            health_status = "poor"

        return {
            "score": health_score,
            "status": health_status,
            "factors": health_factors,
        }

    def shutdown(self) -> None:
        """Shutdown monitoring"""
        self.monitoring_active = False
        logger.info("adaptive_monitor_shutdown")
