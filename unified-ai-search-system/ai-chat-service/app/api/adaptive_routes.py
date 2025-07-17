"""
Adaptive Routing API Endpoints
Week 1 MVP endpoints for monitoring and controlling adaptive system
"""

import time
from typing import Dict, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.adaptive.adaptive_router import AdaptiveIntelligentRouter
from app.cache.redis_client import CacheManager
from app.dependencies import get_cache_manager
from app.models.manager import ModelManager

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["adaptive"])

# Global adaptive router instance (will be initialized on startup)
_adaptive_router: Optional[AdaptiveIntelligentRouter] = None


async def get_adaptive_router() -> AdaptiveIntelligentRouter:
    """Dependency to get adaptive router instance"""
    global _adaptive_router
    if _adaptive_router is None:
        raise HTTPException(status_code=503, detail="Adaptive router not initialized")
    return _adaptive_router


async def initialize_adaptive_router(
    model_manager: ModelManager,
    cache_manager: CacheManager,
    enable_adaptive: bool = True,
    use_week2_features: bool = True,
):
    """Initialize the global adaptive router"""
    global _adaptive_router

    if use_week2_features:
        # Use Week 2 enhanced router
        from app.adaptive.week2_router import create_week2_adaptive_router

        _adaptive_router = await create_week2_adaptive_router(
            model_manager=model_manager,
            cache_manager=cache_manager,
            real_traffic_percentage=0.01,  # Start with 1% real traffic
            monthly_budget_usd=50.0,
        )

        logger.info("week2_adaptive_router_initialized_globally")
    else:
        # Use Week 1 router for fallback
        from app.adaptive.adaptive_router import create_adaptive_router

        _adaptive_router = await create_adaptive_router(
            model_manager=model_manager,
            cache_manager=cache_manager,
            enable_adaptive=enable_adaptive,
            shadow_rate=0.3,  # Start with 30% shadow testing
        )

        logger.info("week1_adaptive_router_initialized_globally")


class AdaptiveConfigRequest(BaseModel):
    """Request model for adaptive configuration updates"""

    shadow_rate: Optional[float] = Field(
        None, ge=0.0, le=1.0, description="Shadow testing rate (0-1)"
    )
    enabled: Optional[bool] = Field(None, description="Enable/disable adaptive mode")


class RecommendationRequest(BaseModel):
    """Request model for routing recommendations"""

    query: str = Field(..., description="Query to get routing recommendation for")
    user_id: Optional[str] = Field("anonymous", description="User ID for context")
    session_id: Optional[str] = Field("test", description="Session ID for context")


class RolloutConfigRequest(BaseModel):
    """Request model for rollout configuration"""

    target_percentage: Optional[float] = Field(
        None, ge=0.0, le=1.0, description="Target rollout percentage"
    )
    enable_rollout: Optional[bool] = Field(
        None, description="Enable/disable gradual rollout"
    )
    emergency_stop: Optional[bool] = Field(None, description="Emergency stop rollout")


class EnhancedMetricsRequest(BaseModel):
    """Request model for enhanced metrics"""

    window_minutes: int = Field(15, ge=1, le=1440, description="Time window in minutes")
    include_cost_breakdown: bool = Field(True, description="Include cost breakdown")
    include_performance_trends: bool = Field(
        True, description="Include performance trends"
    )


@router.get("/status")
async def get_adaptive_status(
    adaptive_router: AdaptiveIntelligentRouter = Depends(get_adaptive_router),
) -> Dict:
    """
    Get adaptive routing system status and statistics

    Returns comprehensive stats about:
    - Bandit performance (arm statistics, confidence intervals)
    - Shadow testing results (success rates, response times)
    - Performance comparison between routes
    """
    try:
        stats = adaptive_router.get_adaptive_stats()

        return {
            "status": "healthy",
            "adaptive_enabled": adaptive_router.enable_adaptive,
            "stats": stats,
            "timestamp": time.time(),
        }

    except Exception as e:
        logger.error("adaptive_status_failed", error=str(e))
        raise HTTPException(
            status_code=500, detail=f"Failed to get adaptive status: {e}"
        )


@router.post("/config")
async def update_adaptive_config(
    config: AdaptiveConfigRequest,
    adaptive_router: AdaptiveIntelligentRouter = Depends(get_adaptive_router),
) -> Dict:
    """
    Update adaptive routing configuration

    Allows runtime updates to:
    - Shadow testing rate (for gradual rollout)
    - Enable/disable adaptive mode (emergency switch)
    """
    try:
        updates = {}

        if config.shadow_rate is not None:
            adaptive_router.update_shadow_rate(config.shadow_rate)
            updates["shadow_rate"] = config.shadow_rate

        if config.enabled is not None:
            adaptive_router.enable_adaptive_mode(config.enabled)
            updates["enabled"] = config.enabled

        logger.info("adaptive_config_updated", updates=updates)

        return {
            "status": "updated",
            "updates": updates,
            "current_config": {
                "adaptive_enabled": adaptive_router.enable_adaptive,
                "shadow_rate": (
                    adaptive_router.shadow_router.shadow_rate
                    if adaptive_router.shadow_router
                    else 0
                ),
            },
        }

    except Exception as e:
        logger.error("adaptive_config_update_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to update config: {e}")


@router.post("/recommend")
async def get_routing_recommendation(
    request: RecommendationRequest,
    adaptive_router: AdaptiveIntelligentRouter = Depends(get_adaptive_router),
) -> Dict:
    """
    Get routing recommendation from bandit (without executing)

    Useful for:
    - Testing bandit behavior
    - Analysis and debugging
    - Understanding routing decisions
    """
    try:
        # Create minimal state for recommendation
        from app.graphs.base import GraphState

        state = GraphState(
            original_query=request.query,
            user_id=request.user_id,
            session_id=request.session_id,
        )

        recommendation = await adaptive_router.get_routing_recommendation(
            request.query, state
        )

        return {
            "status": "success",
            "query": request.query,
            "recommendation": recommendation,
        }

    except Exception as e:
        logger.error("routing_recommendation_failed", error=str(e), query=request.query)
        raise HTTPException(
            status_code=500, detail=f"Failed to get recommendation: {e}"
        )


@router.get("/arms/{arm_id}/performance")
async def get_arm_performance(
    arm_id: str,
    window_hours: int = 24,
    adaptive_router: AdaptiveIntelligentRouter = Depends(get_adaptive_router),
) -> Dict:
    """
    Get detailed performance statistics for a specific bandit arm

    Useful for:
    - Monitoring individual route performance
    - Debugging routing issues
    - Performance analysis
    """
    try:
        if not adaptive_router.enable_adaptive or not adaptive_router.reward_tracker:
            raise HTTPException(status_code=503, detail="Adaptive mode not enabled")

        performance = adaptive_router.reward_tracker.get_arm_performance(
            arm_id, window_hours
        )

        if "error" in performance:
            raise HTTPException(
                status_code=404, detail=f"No data found for arm: {arm_id}"
            )

        return {
            "status": "success",
            "arm_id": arm_id,
            "window_hours": window_hours,
            "performance": performance,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("arm_performance_failed", error=str(e), arm_id=arm_id)
        raise HTTPException(
            status_code=500, detail=f"Failed to get arm performance: {e}"
        )


@router.get("/debug/shadow-comparison")
async def get_recent_shadow_comparisons(
    limit: int = 50, cache_manager: CacheManager = Depends(get_cache_manager)
) -> Dict:
    """
    Get recent shadow vs production comparisons for analysis

    Week 2 feature: Enhanced with more detailed comparison metrics
    """
    try:
        # This is a simplified version - Week 2 would include database storage
        # For MVP, we'll return basic shadow statistics

        if not _adaptive_router or not _adaptive_router.shadow_router:
            raise HTTPException(status_code=503, detail="Shadow testing not available")

        shadow_stats = _adaptive_router.shadow_router.get_shadow_stats()

        return {
            "status": "success",
            "message": "Full comparison data available in Week 2",
            "shadow_stats": shadow_stats,
            "note": "This endpoint will provide detailed comparison data in Week 2 implementation",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("shadow_comparison_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to get comparisons: {e}")


@router.post("/emergency/disable")
async def emergency_disable_adaptive(
    adaptive_router: AdaptiveIntelligentRouter = Depends(get_adaptive_router),
) -> Dict:
    """
    Emergency endpoint to disable adaptive routing

    For production safety - immediately falls back to original router
    """
    try:
        adaptive_router.enable_adaptive_mode(False)

        logger.warning("adaptive_mode_emergency_disabled")

        return {
            "status": "disabled",
            "message": "Adaptive routing disabled - using production router only",
            "timestamp": time.time(),
        }

    except Exception as e:
        logger.error("emergency_disable_failed", error=str(e))
        raise HTTPException(
            status_code=500, detail=f"Failed to disable adaptive mode: {e}"
        )


# Health check specific to adaptive system
@router.get("/health")
async def adaptive_health_check() -> Dict:
    """Health check for adaptive routing system"""
    try:
        if _adaptive_router is None:
            return {"status": "not_initialized", "healthy": False}

        # Basic health checks
        health_status = {
            "adaptive_router": _adaptive_router is not None,
            "bandit_available": _adaptive_router.bandit is not None,
            "shadow_router_available": _adaptive_router.shadow_router is not None,
            "adaptive_enabled": _adaptive_router.enable_adaptive,
        }

        all_healthy = all(health_status.values())

        return {
            "status": "healthy" if all_healthy else "degraded",
            "healthy": all_healthy,
            "components": health_status,
        }

    except Exception as e:
        logger.error("adaptive_health_check_failed", error=str(e))
        return {"status": "unhealthy", "healthy": False, "error": str(e)}


# Week 2 Enhanced Endpoints


@router.get("/v2/status")
async def get_enhanced_status() -> Dict:
    """
    Week 2: Enhanced status with comprehensive metrics

    Returns:
    - Bandit performance with confidence intervals
    - Cost tracking and budget status
    - User experience metrics
    - Performance trends and comparisons
    """
    try:
        if _adaptive_router is None:
            return {"error": "adaptive_router_not_initialized"}

        # Get enhanced status if available
        if hasattr(_adaptive_router, "get_comprehensive_status"):
            return _adaptive_router.get_comprehensive_status()
        else:
            # Fallback to basic status
            basic_status = _adaptive_router.get_adaptive_stats()

            return {
                "status": "enhanced_features_not_available",
                "basic_stats": basic_status,
                "message": "Using Week 1 adaptive router, upgrade to Week 2 for enhanced features",
            }

    except Exception as e:
        logger.error("enhanced_status_failed", error=str(e))
        raise HTTPException(
            status_code=500, detail=f"Failed to get enhanced status: {e}"
        )


@router.post("/v2/rollout")
async def configure_rollout(config: RolloutConfigRequest) -> Dict:
    """
    Week 2: Configure gradual rollout settings

    Allows controlling:
    - Real traffic percentage (1% -> 5% -> 15% -> 30%)
    - Emergency rollback
    - Rollout speed and safety thresholds
    """
    try:
        if _adaptive_router is None:
            raise HTTPException(
                status_code=503, detail="Adaptive router not initialized"
            )

        updates = {}

        # Check if enhanced router with rollout capability
        if (
            hasattr(_adaptive_router, "rollout_manager")
            and _adaptive_router.rollout_manager
        ):
            rollout_manager = _adaptive_router.rollout_manager

            if config.target_percentage is not None:
                # This would be implemented in a real rollout manager
                updates["target_percentage"] = config.target_percentage
                logger.info(
                    "rollout_percentage_updated", percentage=config.target_percentage
                )

            if config.enable_rollout is not None:
                if config.enable_rollout:
                    rollout_manager.hold_rollout(False)
                else:
                    rollout_manager.hold_rollout(True)
                updates["rollout_enabled"] = config.enable_rollout

            if config.emergency_stop:
                rollout_manager.emergency_stop("manual_emergency_stop")
                updates["emergency_stop"] = True

            return {
                "status": "rollout_updated",
                "updates": updates,
                "current_rollout_status": rollout_manager.get_rollout_status(),
            }
        else:
            # Basic shadow rate adjustment for Week 1 router
            if config.target_percentage is not None:
                _adaptive_router.update_shadow_rate(config.target_percentage)
                updates["shadow_rate"] = config.target_percentage

            return {
                "status": "basic_rollout_updated",
                "updates": updates,
                "message": "Using basic shadow rate control (Week 1 features)",
            }

    except Exception as e:
        logger.error("rollout_config_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to configure rollout: {e}")


@router.get("/v2/metrics")
async def get_enhanced_metrics(
    window_minutes: int = 15,
    include_cost_breakdown: bool = True,
    include_performance_trends: bool = True,
) -> Dict:
    """
    Week 2: Enhanced metrics with cost tracking and performance trends

    Returns comprehensive metrics including:
    - Performance metrics (response time, success rate, P95/P99)
    - Cost metrics (per-request cost, budget utilization, cost trends)
    - User experience metrics (satisfaction, engagement)
    - Bandit learning metrics (confidence, exploration vs exploitation)
    """
    try:
        if _adaptive_router is None:
            raise HTTPException(
                status_code=503, detail="Adaptive router not initialized"
            )

        metrics = {"timestamp": time.time(), "window_minutes": window_minutes}

        # Enhanced monitoring data if available
        if hasattr(_adaptive_router, "monitor") and _adaptive_router.monitor:
            dashboard_data = _adaptive_router.monitor.get_dashboard_data(window_minutes)
            metrics.update(dashboard_data)
        else:
            # Basic metrics fallback
            metrics["basic_stats"] = _adaptive_router.get_adaptive_stats()

        # Cost breakdown if requested and available
        if include_cost_breakdown:
            if (
                hasattr(_adaptive_router, "reward_calculator")
                and _adaptive_router.reward_calculator
            ):
                budget_status = _adaptive_router.reward_calculator.get_budget_status()
                metrics["cost_breakdown"] = budget_status
            else:
                metrics["cost_breakdown"] = {"message": "cost_tracking_not_available"}

        # Performance trends if requested
        if include_performance_trends:
            # This would include trend analysis in a real implementation
            metrics["performance_trends"] = {
                "trend_analysis": "not_implemented_yet",
                "message": "Performance trend analysis coming in future update",
            }

        return metrics

    except Exception as e:
        logger.error("enhanced_metrics_failed", error=str(e))
        raise HTTPException(
            status_code=500, detail=f"Failed to get enhanced metrics: {e}"
        )


@router.get("/v2/cost-analysis")
async def get_cost_analysis(time_range_hours: int = 24) -> Dict:
    """
    Week 2: Detailed cost analysis and optimization recommendations

    Returns:
    - Cost per routing arm
    - Budget utilization and projections
    - Cost optimization recommendations
    - ROI analysis (if business metrics available)
    """
    try:
        if _adaptive_router is None:
            raise HTTPException(
                status_code=503, detail="Adaptive router not initialized"
            )

        analysis = {"time_range_hours": time_range_hours, "generated_at": time.time()}

        # Enhanced cost analysis if available
        if (
            hasattr(_adaptive_router, "reward_calculator")
            and _adaptive_router.reward_calculator
        ):
            budget_status = _adaptive_router.reward_calculator.get_budget_status()

            analysis.update(
                {
                    "budget_status": budget_status,
                    "cost_efficiency": {
                        "current_utilization": budget_status.get(
                            "budget_utilization", 0
                        ),
                        "projected_monthly_spend": budget_status.get(
                            "current_spend_usd", 0
                        )
                        * (30 * 24 / time_range_hours),
                        "budget_health": (
                            "healthy"
                            if budget_status.get("budget_utilization", 0) < 0.8
                            else "warning"
                        ),
                    },
                }
            )

            # Cost optimization recommendations
            utilization = budget_status.get("budget_utilization", 0)
            if utilization > 0.9:
                recommendations = [
                    "Consider increasing budget",
                    "Optimize for cheaper routing arms",
                    "Review high-cost queries",
                ]
            elif utilization < 0.3:
                recommendations = [
                    "Budget may be too conservative",
                    "Consider more expensive but higher-quality arms",
                ]
            else:
                recommendations = [
                    "Budget utilization is healthy",
                    "Continue current optimization strategy",
                ]

            analysis["recommendations"] = recommendations
        else:
            analysis[
                "message"
            ] = "Enhanced cost tracking not available, using basic estimates"
            analysis["estimated_metrics"] = {
                "note": "Install Week 2 enhanced router for detailed cost analysis"
            }

        return analysis

    except Exception as e:
        logger.error("cost_analysis_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to get cost analysis: {e}")


@router.get("/v2/performance-comparison")
async def get_performance_comparison() -> Dict:
    """
    Week 2: Compare bandit performance vs baseline routing

    Returns statistical comparison of:
    - Response times (bandit vs baseline)
    - Success rates
    - Cost efficiency
    - User satisfaction (if available)
    """
    try:
        if _adaptive_router is None:
            raise HTTPException(
                status_code=503, detail="Adaptive router not initialized"
            )

        comparison = {
            "comparison_timestamp": time.time(),
            "comparison_type": "bandit_vs_baseline",
        }

        # A/B test results if available
        if (
            hasattr(_adaptive_router, "experiment_manager")
            and _adaptive_router.experiment_manager
            and hasattr(_adaptive_router, "current_experiment")
            and _adaptive_router.current_experiment
        ):
            experiment_status = (
                _adaptive_router.current_experiment.get_experiment_status()
            )
            comparison["ab_test_results"] = experiment_status

            # Extract performance comparison from A/B test
            arm_performance = experiment_status.get("arm_performance", {})
            if "baseline" in arm_performance and "bandit" in arm_performance:
                baseline = arm_performance["baseline"]
                bandit = arm_performance["bandit"]

                comparison["performance_comparison"] = {
                    "response_time": {
                        "baseline_avg": baseline.get("avg_response_time", 0),
                        "bandit_avg": bandit.get("avg_response_time", 0),
                        "improvement_pct": (
                            (
                                baseline.get("avg_response_time", 0)
                                - bandit.get("avg_response_time", 0)
                            )
                            / max(baseline.get("avg_response_time", 1), 1)
                        )
                        * 100,
                    },
                    "success_rate": {
                        "baseline": baseline.get("success_rate", 0),
                        "bandit": bandit.get("success_rate", 0),
                        "improvement_pct": (
                            bandit.get("success_rate", 0)
                            - baseline.get("success_rate", 0)
                        )
                        * 100,
                    },
                    "cost_efficiency": {
                        "baseline_cost": baseline.get("avg_cost_cents", 0),
                        "bandit_cost": bandit.get("avg_cost_cents", 0),
                        "savings_pct": (
                            (
                                baseline.get("avg_cost_cents", 0)
                                - bandit.get("avg_cost_cents", 0)
                            )
                            / max(baseline.get("avg_cost_cents", 1), 1)
                        )
                        * 100,
                    },
                }
        else:
            # Basic comparison using bandit stats
            bandit_stats = _adaptive_router.get_adaptive_stats()
            comparison["basic_stats"] = bandit_stats
            comparison[
                "message"
            ] = "Limited comparison data available, enable A/B testing for full comparison"

        return comparison

    except Exception as e:
        logger.error("performance_comparison_failed", error=str(e))
        raise HTTPException(
            status_code=500, detail=f"Failed to get performance comparison: {e}"
        )
