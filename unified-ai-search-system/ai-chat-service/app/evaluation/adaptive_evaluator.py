"""
Adaptive Routing Evaluation System
Evaluates and improves adaptive routing decisions using quality metrics
"""

import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import structlog

from app.evaluation.response_evaluator import EvaluationResult, EvaluationSuite
from app.storage.clickhouse_client import get_clickhouse_manager

logger = structlog.get_logger(__name__)


@dataclass
class RoutingEvaluationResult:
    """Result of evaluating a routing decision"""

    routing_arm: str
    query: str
    response: str
    response_time: float
    cost_usd: float
    quality_score: float
    eval_details: EvaluationResult
    user_satisfaction: Optional[float] = None
    timestamp: float = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = time.time()


class RoutingPerformanceAnalyzer:
    """Analyzes routing performance across different arms"""

    def __init__(self):
        self.evaluation_suite = EvaluationSuite()

    async def evaluate_routing_decision(
        self,
        routing_arm: str,
        query: str,
        response: str,
        response_time: float,
        cost_usd: float,
        context: Optional[Dict] = None,
    ) -> RoutingEvaluationResult:
        """Evaluate a single routing decision"""

        # Evaluate response quality
        eval_result = await self.evaluation_suite.evaluate_interaction(
            query, response, context
        )

        # Calculate overall quality score
        quality_score = self.evaluation_suite.calculate_overall_quality_score(
            eval_result
        )

        return RoutingEvaluationResult(
            routing_arm=routing_arm,
            query=query,
            response=response,
            response_time=response_time,
            cost_usd=cost_usd,
            quality_score=quality_score,
            eval_details=eval_result,
        )

    async def analyze_routing_arm_performance(
        self,
        arm_name: str,
        evaluation_history: List[RoutingEvaluationResult],
        time_window_hours: int = 24,
    ) -> Dict[str, Any]:
        """Analyze performance of a specific routing arm"""

        # Filter evaluations for this arm within time window
        cutoff_time = time.time() - (time_window_hours * 3600)
        arm_evaluations = [
            eval_result
            for eval_result in evaluation_history
            if eval_result.routing_arm == arm_name
            and eval_result.timestamp >= cutoff_time
        ]

        if not arm_evaluations:
            return {"error": f"No evaluations found for arm {arm_name}"}

        # Calculate aggregate metrics
        total_requests = len(arm_evaluations)
        avg_quality = (
            sum(eval.quality_score for eval in arm_evaluations) / total_requests
        )
        avg_response_time = (
            sum(eval.response_time for eval in arm_evaluations) / total_requests
        )
        avg_cost = sum(eval.cost_usd for eval in arm_evaluations) / total_requests

        # Quality distribution
        quality_scores = [eval.quality_score for eval in arm_evaluations]
        quality_distribution = {
            "excellent": sum(1 for score in quality_scores if score >= 0.8)
            / total_requests,
            "good": sum(1 for score in quality_scores if 0.6 <= score < 0.8)
            / total_requests,
            "fair": sum(1 for score in quality_scores if 0.4 <= score < 0.6)
            / total_requests,
            "poor": sum(1 for score in quality_scores if score < 0.4) / total_requests,
        }

        # Performance trends (if enough data)
        trends = {}
        if total_requests >= 10:
            # Split into two halves for trend analysis
            half_point = len(arm_evaluations) // 2
            recent_half = arm_evaluations[half_point:]
            older_half = arm_evaluations[:half_point]

            recent_avg_quality = sum(eval.quality_score for eval in recent_half) / len(
                recent_half
            )
            older_avg_quality = sum(eval.quality_score for eval in older_half) / len(
                older_half
            )

            trends = {
                "quality_trend": (
                    "improving"
                    if recent_avg_quality > older_avg_quality
                    else "declining"
                ),
                "quality_change": recent_avg_quality - older_avg_quality,
            }

        # Efficiency score (quality per dollar)
        efficiency_score = avg_quality / max(avg_cost, 0.001)  # Avoid division by zero

        return {
            "arm_name": arm_name,
            "time_window_hours": time_window_hours,
            "metrics": {
                "total_requests": total_requests,
                "avg_quality_score": avg_quality,
                "avg_response_time": avg_response_time,
                "avg_cost_usd": avg_cost,
                "efficiency_score": efficiency_score,
            },
            "quality_distribution": quality_distribution,
            "trends": trends,
            "recommendations": self._generate_arm_recommendations(
                avg_quality, avg_cost, avg_response_time
            ),
        }

    def _generate_arm_recommendations(
        self, avg_quality: float, avg_cost: float, avg_response_time: float
    ) -> List[str]:
        """Generate recommendations for improving routing arm performance"""
        recommendations = []

        if avg_quality < 0.6:
            recommendations.append(
                "Consider tuning model parameters or switching to higher-quality model"
            )

        if avg_cost > 0.01:  # More than 1 cent per request
            recommendations.append("Evaluate cost optimization opportunities")

        if avg_response_time > 3.0:  # More than 3 seconds
            recommendations.append(
                "Optimize response time through caching or model optimization"
            )

        if avg_quality > 0.8 and avg_cost < 0.005:
            recommendations.append(
                "Excellent performance - consider increasing traffic allocation"
            )

        return recommendations


class QualityAwareBanditRewardCalculator:
    """Enhanced reward calculator that incorporates quality evaluation"""

    def __init__(
        self,
        quality_weight: float = 0.4,
        cost_weight: float = 0.3,
        speed_weight: float = 0.3,
    ):
        self.quality_weight = quality_weight
        self.cost_weight = cost_weight
        self.speed_weight = speed_weight

    def calculate_quality_aware_reward(
        self, eval_result: RoutingEvaluationResult
    ) -> float:
        """Calculate bandit reward incorporating quality metrics"""

        # Normalize metrics to 0-1 scale
        quality_score = eval_result.quality_score  # Already 0-1

        # Cost score (lower cost = higher score)
        max_acceptable_cost = 0.02  # $0.02 per request
        cost_score = max(0, 1 - (eval_result.cost_usd / max_acceptable_cost))

        # Speed score (faster = higher score)
        max_acceptable_time = 5.0  # 5 seconds
        speed_score = max(0, 1 - (eval_result.response_time / max_acceptable_time))

        # Weighted combination
        reward = (
            quality_score * self.quality_weight
            + cost_score * self.cost_weight
            + speed_score * self.speed_weight
        )

        return max(0.0, min(1.0, reward))


class EvaluationDrivenAdaptiveRouter:
    """Enhanced adaptive router that uses evaluation feedback for learning"""

    def __init__(self, base_router, evaluation_enabled: bool = True):
        self.base_router = base_router
        self.evaluation_enabled = evaluation_enabled

        if evaluation_enabled:
            self.performance_analyzer = RoutingPerformanceAnalyzer()
            self.quality_reward_calculator = QualityAwareBanditRewardCalculator()
            self.evaluation_history: List[RoutingEvaluationResult] = []

    async def route_with_evaluation(
        self, query: str, state: Any
    ) -> Tuple[Any, Optional[RoutingEvaluationResult]]:
        """Execute routing with evaluation feedback"""

        # Record routing start time
        start_time = time.time()

        # Execute base routing
        result = await self.base_router.route_query(query, state)

        # Calculate metrics
        response_time = time.time() - start_time

        if not self.evaluation_enabled:
            return result, None

        try:
            # Estimate cost (would get from actual cost tracker)
            estimated_cost = self._estimate_request_cost(query, result, response_time)

            # Get routing arm (would get from actual routing decision)
            routing_arm = getattr(state, "selected_routing_arm", "unknown")

            # Evaluate the routing decision
            eval_result = await self.performance_analyzer.evaluate_routing_decision(
                routing_arm=routing_arm,
                query=query,
                response=str(result),
                response_time=response_time,
                cost_usd=estimated_cost,
            )

            # Store evaluation result
            self.evaluation_history.append(eval_result)

            # Calculate quality-aware reward
            quality_reward = (
                self.quality_reward_calculator.calculate_quality_aware_reward(
                    eval_result
                )
            )

            # Update bandit with quality-aware reward (if bandit exists)
            if hasattr(self.base_router, "bandit"):
                await self.base_router.bandit.update_arm(routing_arm, quality_reward)

            # Store in ClickHouse for long-term analysis
            await self._store_evaluation_result(eval_result)

            logger.info(
                "routing_evaluation_completed",
                routing_arm=routing_arm,
                quality_score=eval_result.quality_score,
                quality_reward=quality_reward,
                response_time=response_time,
                cost=estimated_cost,
            )

            return result, eval_result

        except Exception as e:
            logger.error("routing_evaluation_failed", error=str(e))
            return result, None

    async def get_routing_performance_report(self, hours: int = 24) -> Dict[str, Any]:
        """Generate comprehensive routing performance report"""

        if not self.evaluation_enabled:
            return {"error": "Evaluation not enabled"}

        # Analyze performance by routing arm
        arms_analysis = {}
        unique_arms = set(eval.routing_arm for eval in self.evaluation_history)

        for arm in unique_arms:
            arms_analysis[
                arm
            ] = await self.performance_analyzer.analyze_routing_arm_performance(
                arm, self.evaluation_history, hours
            )

        # Overall system metrics
        recent_evaluations = [
            eval
            for eval in self.evaluation_history
            if eval.timestamp >= time.time() - (hours * 3600)
        ]

        if recent_evaluations:
            overall_metrics = {
                "total_requests": len(recent_evaluations),
                "avg_quality_score": sum(
                    eval.quality_score for eval in recent_evaluations
                )
                / len(recent_evaluations),
                "avg_response_time": sum(
                    eval.response_time for eval in recent_evaluations
                )
                / len(recent_evaluations),
                "avg_cost_usd": sum(eval.cost_usd for eval in recent_evaluations)
                / len(recent_evaluations),
                "quality_distribution": self._calculate_quality_distribution(
                    recent_evaluations
                ),
            }
        else:
            overall_metrics = {"message": "No recent evaluations found"}

        # Identify best and worst performing arms
        arm_scores = {
            arm: analysis.get("metrics", {}).get("avg_quality_score", 0)
            for arm, analysis in arms_analysis.items()
            if "metrics" in analysis
        }

        best_arm = max(arm_scores.items(), key=lambda x: x[1]) if arm_scores else None
        worst_arm = min(arm_scores.items(), key=lambda x: x[1]) if arm_scores else None

        return {
            "time_window_hours": hours,
            "overall_metrics": overall_metrics,
            "arms_analysis": arms_analysis,
            "best_performing_arm": best_arm,
            "worst_performing_arm": worst_arm,
            "recommendations": self._generate_system_recommendations(arms_analysis),
        }

    def _estimate_request_cost(
        self, query: str, result: Any, response_time: float
    ) -> float:
        """Estimate request cost (simplified)"""
        base_cost = 0.002  # $0.002 base cost

        # Adjust based on response time (longer = more expensive)
        time_multiplier = 1 + (response_time / 10)  # 10% increase per second

        # Adjust based on response length
        response_length = len(str(result))
        length_multiplier = 1 + (
            response_length / 1000 * 0.1
        )  # 10% increase per 1000 chars

        return base_cost * time_multiplier * length_multiplier

    async def _store_evaluation_result(self, eval_result: RoutingEvaluationResult):
        """Store evaluation result in ClickHouse"""
        try:
            clickhouse_manager = get_clickhouse_manager()
            if clickhouse_manager:
                # Store as adaptive metrics with quality score
                await clickhouse_manager.record_adaptive_metrics(
                    routing_arm=eval_result.routing_arm,
                    success=True,
                    response_time=eval_result.response_time,
                    cost_usd=eval_result.cost_usd,
                    query_complexity=len(eval_result.query.split())
                    / 20,  # Simple complexity
                    bandit_confidence=0.8,  # Would get from actual bandit
                    reward_score=eval_result.quality_score,
                )
        except Exception as e:
            logger.warning("failed_to_store_evaluation_result", error=str(e))

    def _calculate_quality_distribution(
        self, evaluations: List[RoutingEvaluationResult]
    ) -> Dict[str, float]:
        """Calculate quality score distribution"""
        if not evaluations:
            return {}

        total = len(evaluations)
        return {
            "excellent": sum(1 for eval in evaluations if eval.quality_score >= 0.8)
            / total,
            "good": sum(1 for eval in evaluations if 0.6 <= eval.quality_score < 0.8)
            / total,
            "fair": sum(1 for eval in evaluations if 0.4 <= eval.quality_score < 0.6)
            / total,
            "poor": sum(1 for eval in evaluations if eval.quality_score < 0.4) / total,
        }

    def _generate_system_recommendations(
        self, arms_analysis: Dict[str, Any]
    ) -> List[str]:
        """Generate system-wide recommendations"""
        recommendations = []

        # Analyze across all arms
        quality_scores = []
        cost_scores = []

        for arm, analysis in arms_analysis.items():
            if "metrics" in analysis:
                quality_scores.append(analysis["metrics"]["avg_quality_score"])
                cost_scores.append(analysis["metrics"]["avg_cost_usd"])

        if quality_scores:
            avg_quality = sum(quality_scores) / len(quality_scores)
            avg_cost = sum(cost_scores) / len(cost_scores)

            if avg_quality < 0.7:
                recommendations.append(
                    "Overall system quality below target - review model configurations"
                )

            if avg_cost > 0.005:
                recommendations.append(
                    "Average cost per request high - consider cost optimization"
                )

            quality_variance = max(quality_scores) - min(quality_scores)
            if quality_variance > 0.3:
                recommendations.append(
                    "High variance in quality across arms - investigate underperforming routes"
                )

        return recommendations
