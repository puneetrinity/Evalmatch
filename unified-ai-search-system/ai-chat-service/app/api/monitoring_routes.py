"""
Production Monitoring API Endpoints
Exposes real-time system metrics, cost tracking, and performance data
"""

import time
from typing import Dict

import structlog
from fastapi import APIRouter, HTTPException, Query

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["monitoring"])


@router.get("/system/metrics")
async def get_system_metrics() -> Dict:
    """Get comprehensive real-time system metrics"""
    try:
        from app.monitoring.system_metrics import collect_all_metrics

        metrics = await collect_all_metrics()

        return {
            "status": "success",
            "metrics": metrics,
            "data_source": "real_time_monitoring",
        }

    except Exception as e:
        logger.error("system_metrics_failed", error=str(e))
        raise HTTPException(
            status_code=500, detail=f"Failed to get system metrics: {e}"
        )


@router.get("/cost/summary")
async def get_cost_summary(
    hours: int = Query(24, ge=1, le=720, description="Time window in hours")
) -> Dict:
    """Get comprehensive cost tracking summary"""
    try:
        from app.monitoring.cost_tracker import get_cost_tracker

        cost_tracker = get_cost_tracker()

        return {
            "status": "success",
            "budget_status": cost_tracker.get_budget_status(),
            "cost_breakdown": cost_tracker.get_cost_breakdown(hours),
            "optimization_recommendations": cost_tracker.optimize_costs(),
            "data_source": "real_time_cost_tracking",
        }

    except Exception as e:
        logger.error("cost_summary_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to get cost summary: {e}")


@router.get("/cost/user/{user_id}")
async def get_user_cost_breakdown(
    user_id: str,
    hours: int = Query(24, ge=1, le=168, description="Time window in hours"),
) -> Dict:
    """Get cost breakdown for specific user"""
    try:
        from app.monitoring.cost_tracker import get_cost_tracker

        cost_tracker = get_cost_tracker()
        user_costs = cost_tracker.get_user_costs(user_id, hours)

        return {
            "status": "success",
            "user_costs": user_costs,
            "data_source": "real_time_cost_tracking",
        }

    except Exception as e:
        logger.error("user_cost_breakdown_failed", error=str(e), user_id=user_id)
        raise HTTPException(
            status_code=500, detail=f"Failed to get user cost breakdown: {e}"
        )


@router.get("/cache/performance")
async def get_cache_performance() -> Dict:
    """Get real-time cache performance metrics"""
    try:
        from app.dependencies import get_cache_manager

        cache_manager = get_cache_manager()
        cache_stats = await cache_manager.get_stats()

        return {
            "status": "success",
            "cache_performance": cache_stats,
            "data_source": "redis_and_local_cache",
        }

    except Exception as e:
        logger.error("cache_performance_failed", error=str(e))
        raise HTTPException(
            status_code=500, detail=f"Failed to get cache performance: {e}"
        )


@router.get("/adaptive/comprehensive")
async def get_adaptive_comprehensive_status() -> Dict:
    """Get comprehensive adaptive routing status with real metrics"""
    try:
        from app.api.adaptive_routes import _adaptive_router

        if _adaptive_router is None:
            raise HTTPException(
                status_code=503, detail="Adaptive router not initialized"
            )

        # Get Week 2 comprehensive status if available
        if hasattr(_adaptive_router, "get_week2_status"):
            adaptive_status = _adaptive_router.get_week2_status()
        else:
            adaptive_status = _adaptive_router.get_adaptive_stats()

        return {
            "status": "success",
            "adaptive_status": adaptive_status,
            "data_source": "week2_adaptive_router_with_real_metrics",
        }

    except Exception as e:
        logger.error("adaptive_comprehensive_failed", error=str(e))
        raise HTTPException(
            status_code=500, detail=f"Failed to get adaptive status: {e}"
        )


@router.get("/health/production")
async def get_production_health() -> Dict:
    """Comprehensive production health check with real metrics"""
    try:
        health_status = {
            "overall_status": "healthy",
            "timestamp": time.time(),
            "components": {},
        }

        # Check system metrics
        try:
            from app.monitoring.system_metrics import get_system_metrics_collector

            system_collector = get_system_metrics_collector()
            system_metrics = system_collector.get_comprehensive_metrics()

            # Health thresholds
            memory_healthy = system_metrics["process"]["memory_mb"] < 2048  # < 2GB
            cpu_healthy = system_metrics["process"]["cpu_utilization"] < 0.8  # < 80%

            health_status["components"]["system"] = {
                "status": "healthy" if (memory_healthy and cpu_healthy) else "warning",
                "memory_mb": system_metrics["process"]["memory_mb"],
                "cpu_utilization": system_metrics["process"]["cpu_utilization"],
                "uptime_seconds": system_metrics["uptime_seconds"],
            }

        except Exception as e:
            health_status["components"]["system"] = {"status": "error", "error": str(e)}

        # Check cost tracking
        try:
            from app.monitoring.cost_tracker import get_cost_tracker

            cost_tracker = get_cost_tracker()
            budget_status = cost_tracker.get_budget_status()

            cost_healthy = budget_status["budget_utilization"] < 0.9  # < 90%

            health_status["components"]["cost_tracking"] = {
                "status": "healthy" if cost_healthy else "critical",
                "budget_utilization": budget_status["budget_utilization"],
                "budget_health": budget_status["budget_health"],
            }

        except Exception as e:
            health_status["components"]["cost_tracking"] = {
                "status": "error",
                "error": str(e),
            }

        # Check cache performance
        try:
            from app.dependencies import get_cache_manager

            cache_manager = get_cache_manager()
            cache_stats = await cache_manager.get_stats()

            cache_healthy = cache_stats["hit_rate"] > 0.3  # > 30% hit rate

            health_status["components"]["cache"] = {
                "status": "healthy" if cache_healthy else "warning",
                "hit_rate": cache_stats["hit_rate"],
                "total_requests": cache_stats["total_requests"],
            }

        except Exception as e:
            health_status["components"]["cache"] = {"status": "error", "error": str(e)}

        # Check adaptive routing
        try:
            from app.api.adaptive_routes import _adaptive_router

            if _adaptive_router and hasattr(_adaptive_router, "get_week2_status"):
                adaptive_status = _adaptive_router.get_week2_status()

                safety_healthy = adaptive_status["safety_status"]["status"] == "pass"

                health_status["components"]["adaptive_routing"] = {
                    "status": "healthy" if safety_healthy else "warning",
                    "real_traffic_percentage": adaptive_status["week2_features"][
                        "real_traffic_percentage"
                    ],
                    "safety_status": adaptive_status["safety_status"]["status"],
                }
            else:
                health_status["components"]["adaptive_routing"] = {
                    "status": "not_available"
                }

        except Exception as e:
            health_status["components"]["adaptive_routing"] = {
                "status": "error",
                "error": str(e),
            }

        # Determine overall status
        component_statuses = [
            comp.get("status", "error") for comp in health_status["components"].values()
        ]

        if any(status == "critical" for status in component_statuses):
            health_status["overall_status"] = "critical"
        elif any(status == "error" for status in component_statuses):
            health_status["overall_status"] = "degraded"
        elif any(status == "warning" for status in component_statuses):
            health_status["overall_status"] = "warning"
        else:
            health_status["overall_status"] = "healthy"

        return health_status

    except Exception as e:
        logger.error("production_health_failed", error=str(e))
        return {"overall_status": "critical", "error": str(e), "timestamp": time.time()}


@router.get("/dashboard/summary")
async def get_dashboard_summary() -> Dict:
    """Get summary data for monitoring dashboard"""
    try:
        summary = {
            "timestamp": time.time(),
            "system": {},
            "cost": {},
            "performance": {},
            "adaptive": {},
        }

        # System metrics summary
        try:
            from app.monitoring.system_metrics import get_system_metrics_collector

            system_collector = get_system_metrics_collector()
            system_metrics = system_collector.get_comprehensive_metrics()

            summary["system"] = {
                "memory_mb": system_metrics["process"]["memory_mb"],
                "cpu_utilization": system_metrics["process"]["cpu_utilization"],
                "cache_hit_rate": system_metrics["cache"]["hit_rate"],
                "uptime_hours": system_metrics["uptime_seconds"] / 3600,
            }

        except Exception as e:
            summary["system"] = {"error": str(e)}

        # Cost summary
        try:
            from app.monitoring.cost_tracker import get_cost_tracker

            cost_tracker = get_cost_tracker()
            budget_status = cost_tracker.get_budget_status()

            summary["cost"] = {
                "monthly_spend": budget_status["monthly_spend_usd"],
                "daily_spend": budget_status["daily_spend_usd"],
                "budget_utilization": budget_status["budget_utilization"],
                "budget_health": budget_status["budget_health"],
            }

        except Exception as e:
            summary["cost"] = {"error": str(e)}

        # Performance summary
        try:
            from app.api.adaptive_routes import _adaptive_router

            if _adaptive_router and hasattr(_adaptive_router, "get_week2_status"):
                adaptive_status = _adaptive_router.get_week2_status()

                if adaptive_status["performance_comparison"]["data_available"]:
                    perf = adaptive_status["performance_comparison"]
                    summary["performance"] = {
                        "baseline_requests": perf["baseline"]["requests"],
                        "bandit_requests": perf["bandit"]["requests"],
                        "response_time_improvement": perf["improvements"][
                            "response_time_pct"
                        ],
                        "cost_change": perf["improvements"]["cost_change_pct"],
                    }
                else:
                    summary["performance"] = {"data_available": False}
            else:
                summary["performance"] = {"adaptive_not_available": True}

        except Exception as e:
            summary["performance"] = {"error": str(e)}

        # Adaptive routing summary
        try:
            from app.api.adaptive_routes import _adaptive_router

            if _adaptive_router and hasattr(_adaptive_router, "get_week2_status"):
                adaptive_status = _adaptive_router.get_week2_status()

                summary["adaptive"] = {
                    "real_traffic_percentage": adaptive_status["week2_features"][
                        "real_traffic_percentage"
                    ],
                    "rollout_stage": adaptive_status["rollout_status"]["stage"],
                    "safety_status": adaptive_status["safety_status"]["status"],
                    "can_increase_rollout": adaptive_status["rollout_status"][
                        "can_increase"
                    ],
                }
            else:
                summary["adaptive"] = {"week2_not_available": True}

        except Exception as e:
            summary["adaptive"] = {"error": str(e)}

        return {
            "status": "success",
            "summary": summary,
            "data_source": "real_time_comprehensive_monitoring",
        }

    except Exception as e:
        logger.error("dashboard_summary_failed", error=str(e))
        raise HTTPException(
            status_code=500, detail=f"Failed to get dashboard summary: {e}"
        )
