"""
Real-time Cost Tracking System
Tracks actual API usage costs and budget management
Now with ClickHouse integration for cost analytics
"""

import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

import structlog

from app.storage.clickhouse_client import get_clickhouse_manager

logger = structlog.get_logger(__name__)


class CostCategory(Enum):
    """Cost categories for tracking"""

    LOCAL_INFERENCE = "local_inference"
    EXTERNAL_API = "external_api"
    SEARCH_API = "search_api"
    CONTENT_API = "content_api"
    CACHE_OPERATIONS = "cache_operations"
    INFRASTRUCTURE = "infrastructure"


@dataclass
class CostEvent:
    """Individual cost event tracking"""

    timestamp: float
    category: CostCategory
    cost_usd: float
    details: Dict = field(default_factory=dict)
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    request_id: Optional[str] = None


@dataclass
class APIUsageMetrics:
    """Track actual API usage metrics"""

    provider: str
    endpoint: str
    requests: int = 0
    total_cost: float = 0.0
    avg_cost: float = 0.0
    tokens_used: int = 0
    errors: int = 0
    last_used: Optional[float] = None


class RealTimeCostTracker:
    """Real-time cost tracking with actual usage data"""

    def __init__(self, monthly_budget_usd: float = 50.0):
        self.monthly_budget_usd = monthly_budget_usd
        self.cost_events: List[CostEvent] = []
        self.api_usage: Dict[str, APIUsageMetrics] = {}
        self.start_time = time.time()

        # Cost rates (updated based on real provider pricing)
        self.cost_rates = {
            # Local inference costs (electricity, compute)
            "local_model_inference": 0.0001,  # $0.0001 per request
            # External API costs (actual provider rates)
            "openai_gpt35_turbo": 0.002,  # $0.002 per 1K tokens
            "openai_gpt4": 0.03,  # $0.03 per 1K tokens
            "claude_haiku": 0.0005,  # $0.0005 per 1K tokens
            "claude_sonnet": 0.003,  # $0.003 per 1K tokens
            # Search API costs
            "brave_search": 0.005,  # $0.005 per search
            "duckduckgo": 0.0,  # Free
            # Content APIs
            "scrapingbee": 0.001,  # $0.001 per page
            # Infrastructure costs (prorated)
            "redis_operation": 0.000001,  # $0.000001 per operation
            "storage_gb_day": 0.01,  # $0.01 per GB per day
        }

        logger.info(
            "real_time_cost_tracker_initialized", monthly_budget=monthly_budget_usd
        )

    def record_local_inference_cost(
        self, model_name: str, tokens: int, user_id: str = None, request_id: str = None
    ) -> float:
        """Record cost for local model inference"""
        # Calculate actual cost based on model and tokens
        base_cost = self.cost_rates.get("local_model_inference", 0.0001)

        # Adjust cost based on model complexity
        model_multipliers = {
            "phi3:mini": 0.5,
            "llama2:7b": 1.0,
            "mistral:7b": 1.2,
            "llama2:13b": 2.0,
            "codellama": 1.5,
        }

        multiplier = model_multipliers.get(model_name, 1.0)
        cost = base_cost * (tokens / 1000) * multiplier

        event = CostEvent(
            timestamp=time.time(),
            category=CostCategory.LOCAL_INFERENCE,
            cost_usd=cost,
            details={
                "model": model_name,
                "tokens": tokens,
                "cost_per_token": cost / max(tokens, 1),
            },
            user_id=user_id,
            request_id=request_id,
        )

        self.cost_events.append(event)
        self._update_api_usage("local_inference", model_name, cost, tokens)

        # Store in ClickHouse for cold storage analytics
        self._store_cost_event_async(event, model_name, tokens)

        logger.debug(
            "local_inference_cost_recorded", model=model_name, tokens=tokens, cost=cost
        )

        return cost

    def record_external_api_cost(
        self,
        provider: str,
        model: str,
        tokens: int,
        user_id: str = None,
        request_id: str = None,
    ) -> float:
        """Record cost for external API usage"""
        cost_key = f"{provider}_{model}".lower().replace("-", "_")
        rate = self.cost_rates.get(cost_key, 0.002)  # Default rate

        cost = rate * (tokens / 1000)

        event = CostEvent(
            timestamp=time.time(),
            category=CostCategory.EXTERNAL_API,
            cost_usd=cost,
            details={
                "provider": provider,
                "model": model,
                "tokens": tokens,
                "rate_per_1k_tokens": rate,
            },
            user_id=user_id,
            request_id=request_id,
        )

        self.cost_events.append(event)
        self._update_api_usage(provider, model, cost, tokens)

        # Store in ClickHouse for cold storage analytics
        self._store_cost_event_async(event, model, tokens)

        logger.debug(
            "external_api_cost_recorded",
            provider=provider,
            model=model,
            tokens=tokens,
            cost=cost,
        )

        return cost

    def record_search_api_cost(
        self,
        provider: str,
        query: str,
        results_count: int,
        user_id: str = None,
        request_id: str = None,
    ) -> float:
        """Record cost for search API usage"""
        cost_key = f"{provider.lower()}_search"
        base_cost = self.cost_rates.get(cost_key, 0.005)

        # Adjust cost based on results complexity
        complexity_multiplier = min(2.0, (results_count / 10) + 1)
        cost = base_cost * complexity_multiplier

        event = CostEvent(
            timestamp=time.time(),
            category=CostCategory.SEARCH_API,
            cost_usd=cost,
            details={
                "provider": provider,
                "query_length": len(query),
                "results_count": results_count,
                "base_cost": base_cost,
            },
            user_id=user_id,
            request_id=request_id,
        )

        self.cost_events.append(event)
        self._update_api_usage("search", provider, cost)

        # Store in ClickHouse for cold storage analytics
        self._store_cost_event_async(event)

        logger.debug(
            "search_api_cost_recorded",
            provider=provider,
            results=results_count,
            cost=cost,
        )

        return cost

    def record_content_api_cost(
        self,
        provider: str,
        url: str,
        content_size_kb: int,
        user_id: str = None,
        request_id: str = None,
    ) -> float:
        """Record cost for content scraping API usage"""
        base_cost = self.cost_rates.get(provider.lower(), 0.001)

        # Adjust cost based on content size
        size_multiplier = max(1.0, content_size_kb / 100)  # Base 100KB
        cost = base_cost * size_multiplier

        event = CostEvent(
            timestamp=time.time(),
            category=CostCategory.CONTENT_API,
            cost_usd=cost,
            details={
                "provider": provider,
                "url": url,
                "content_size_kb": content_size_kb,
                "cost_per_kb": cost / max(content_size_kb, 1),
            },
            user_id=user_id,
            request_id=request_id,
        )

        self.cost_events.append(event)
        self._update_api_usage("content", provider, cost)

        # Store in ClickHouse for cold storage analytics
        self._store_cost_event_async(event)

        logger.debug(
            "content_api_cost_recorded",
            provider=provider,
            size_kb=content_size_kb,
            cost=cost,
        )

        return cost

    def record_infrastructure_cost(
        self, operation_type: str, quantity: float, user_id: str = None
    ) -> float:
        """Record infrastructure operation costs"""
        cost_key = f"{operation_type.lower()}"
        rate = self.cost_rates.get(cost_key, 0.000001)

        cost = rate * quantity

        event = CostEvent(
            timestamp=time.time(),
            category=CostCategory.INFRASTRUCTURE,
            cost_usd=cost,
            details={"operation": operation_type, "quantity": quantity, "rate": rate},
            user_id=user_id,
        )

        self.cost_events.append(event)

        return cost

    def _update_api_usage(
        self, provider: str, endpoint: str, cost: float, tokens: int = 0
    ):
        """Update API usage metrics"""
        key = f"{provider}:{endpoint}"

        if key not in self.api_usage:
            self.api_usage[key] = APIUsageMetrics(provider=provider, endpoint=endpoint)

        usage = self.api_usage[key]
        usage.requests += 1
        usage.total_cost += cost
        usage.avg_cost = usage.total_cost / usage.requests
        usage.tokens_used += tokens
        usage.last_used = time.time()

    def _store_cost_event_async(
        self, event: CostEvent, model: str = None, tokens: int = None
    ):
        """Store cost event in ClickHouse asynchronously"""
        import asyncio

        def store_cost_event():
            try:
                clickhouse_manager = get_clickhouse_manager()
                if clickhouse_manager:
                    # Convert CostEvent to ClickHouse format
                    asyncio.create_task(
                        clickhouse_manager.record_cost_event(
                            category=event.category.value,
                            cost_usd=event.cost_usd,
                            provider=event.details.get("provider", "unknown"),
                            model=model,
                            tokens=tokens,
                            user_id=event.user_id,
                            session_id=event.session_id,
                            request_id=event.request_id,
                            details=event.details,
                        )
                    )
            except Exception as e:
                logger.warning("failed_to_store_cost_event_in_clickhouse", error=str(e))

        # Schedule the task without blocking
        try:
            loop = asyncio.get_running_loop()
            loop.call_soon_threadsafe(store_cost_event)
        except RuntimeError:
            # No event loop running, skip ClickHouse storage
            pass

    def get_current_spend(self, hours: int = 24) -> float:
        """Get current spend for the specified time period"""
        cutoff_time = time.time() - (hours * 3600)

        return sum(
            event.cost_usd
            for event in self.cost_events
            if event.timestamp >= cutoff_time
        )

    def get_monthly_spend(self) -> float:
        """Get current month's total spend"""
        now = datetime.now()
        month_start = datetime(now.year, now.month, 1).timestamp()

        return sum(
            event.cost_usd
            for event in self.cost_events
            if event.timestamp >= month_start
        )

    def get_budget_status(self) -> Dict[str, any]:
        """Get comprehensive budget status"""
        monthly_spend = self.get_monthly_spend()
        daily_spend = self.get_current_spend(24)
        hourly_spend = self.get_current_spend(1)

        budget_utilization = monthly_spend / self.monthly_budget_usd

        # Determine budget health
        if budget_utilization < 0.5:
            health = "healthy"
        elif budget_utilization < 0.8:
            health = "warning"
        else:
            health = "critical"

        # Project monthly spend based on current daily rate
        days_in_month = 30
        current_day = datetime.now().day
        if current_day > 0 and daily_spend > 0:
            projected_monthly = monthly_spend + (
                daily_spend * (days_in_month - current_day)
            )
        else:
            projected_monthly = monthly_spend

        return {
            "monthly_budget_usd": self.monthly_budget_usd,
            "monthly_spend_usd": monthly_spend,
            "daily_spend_usd": daily_spend,
            "hourly_spend_usd": hourly_spend,
            "budget_utilization": budget_utilization,
            "budget_health": health,
            "remaining_budget_usd": self.monthly_budget_usd - monthly_spend,
            "projected_monthly_usd": projected_monthly,
            "projected_over_budget": projected_monthly > self.monthly_budget_usd,
        }

    def get_cost_breakdown(self, hours: int = 24) -> Dict[str, any]:
        """Get detailed cost breakdown by category"""
        cutoff_time = time.time() - (hours * 3600)
        recent_events = [e for e in self.cost_events if e.timestamp >= cutoff_time]

        breakdown = {}
        for category in CostCategory:
            category_events = [e for e in recent_events if e.category == category]
            total_cost = sum(e.cost_usd for e in category_events)
            breakdown[category.value] = {
                "total_cost": total_cost,
                "event_count": len(category_events),
                "avg_cost_per_event": total_cost / max(len(category_events), 1),
            }

        total_cost = sum(breakdown[cat]["total_cost"] for cat in breakdown)

        # Add percentages
        for category in breakdown:
            if total_cost > 0:
                breakdown[category]["percentage"] = (
                    breakdown[category]["total_cost"] / total_cost
                ) * 100
            else:
                breakdown[category]["percentage"] = 0

        return {
            "time_window_hours": hours,
            "total_cost": total_cost,
            "breakdown": breakdown,
            "top_apis": self._get_top_apis(recent_events),
        }

    def _get_top_apis(self, events: List[CostEvent], limit: int = 5) -> List[Dict]:
        """Get top APIs by cost"""
        api_costs = {}

        for event in events:
            provider = event.details.get("provider", "unknown")
            model = event.details.get("model", event.details.get("endpoint", "unknown"))
            key = f"{provider}:{model}"

            if key not in api_costs:
                api_costs[key] = {"cost": 0, "requests": 0}

            api_costs[key]["cost"] += event.cost_usd
            api_costs[key]["requests"] += 1

        # Sort by cost and return top results
        sorted_apis = sorted(
            [(k, v) for k, v in api_costs.items()],
            key=lambda x: x[1]["cost"],
            reverse=True,
        )

        return [
            {
                "api": api,
                "total_cost": data["cost"],
                "requests": data["requests"],
                "avg_cost": data["cost"] / data["requests"],
            }
            for api, data in sorted_apis[:limit]
        ]

    def get_user_costs(self, user_id: str, hours: int = 24) -> Dict[str, any]:
        """Get cost breakdown for specific user"""
        cutoff_time = time.time() - (hours * 3600)
        user_events = [
            e
            for e in self.cost_events
            if e.user_id == user_id and e.timestamp >= cutoff_time
        ]

        total_cost = sum(e.cost_usd for e in user_events)

        return {
            "user_id": user_id,
            "time_window_hours": hours,
            "total_cost": total_cost,
            "request_count": len(user_events),
            "avg_cost_per_request": total_cost / max(len(user_events), 1),
            "cost_by_category": {
                category.value: sum(
                    e.cost_usd for e in user_events if e.category == category
                )
                for category in CostCategory
            },
        }

    def optimize_costs(self) -> List[str]:
        """Generate cost optimization recommendations"""
        recommendations = []
        budget_status = self.get_budget_status()
        cost_breakdown = self.get_cost_breakdown(24)

        # High budget utilization
        if budget_status["budget_utilization"] > 0.8:
            recommendations.append(
                "Budget utilization is high - consider optimizing expensive operations"
            )

        # Expensive external APIs
        external_cost = (
            cost_breakdown["breakdown"].get("external_api", {}).get("total_cost", 0)
        )
        total_cost = cost_breakdown["total_cost"]

        if total_cost > 0 and (external_cost / total_cost) > 0.6:
            recommendations.append(
                "External API costs are high - consider using local models more"
            )

        # High search costs
        search_cost = (
            cost_breakdown["breakdown"].get("search_api", {}).get("total_cost", 0)
        )
        if total_cost > 0 and (search_cost / total_cost) > 0.3:
            recommendations.append(
                "Search API costs are high - implement better caching"
            )

        # Low local inference usage
        local_cost = (
            cost_breakdown["breakdown"].get("local_inference", {}).get("total_cost", 0)
        )
        if total_cost > 0 and (local_cost / total_cost) < 0.3:
            recommendations.append(
                "Consider increasing local model usage for cost savings"
            )

        return recommendations

    def reset_monthly_data(self):
        """Reset monthly cost data (called at month start)"""
        now = datetime.now()
        month_start = datetime(now.year, now.month, 1).timestamp()

        # Keep only current month's data
        self.cost_events = [
            event for event in self.cost_events if event.timestamp >= month_start
        ]

        logger.info("monthly_cost_data_reset")


# Global cost tracker instance
_cost_tracker: Optional[RealTimeCostTracker] = None


def get_cost_tracker() -> RealTimeCostTracker:
    """Get singleton cost tracker"""
    global _cost_tracker
    if _cost_tracker is None:
        _cost_tracker = RealTimeCostTracker()
    return _cost_tracker


def initialize_cost_tracker(monthly_budget_usd: float = 50.0) -> RealTimeCostTracker:
    """Initialize cost tracker with specific budget"""
    global _cost_tracker
    _cost_tracker = RealTimeCostTracker(monthly_budget_usd)
    return _cost_tracker
