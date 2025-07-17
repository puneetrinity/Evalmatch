"""
Evaluation API Endpoints
API endpoints for response evaluation and routing performance analysis
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

import structlog
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.evaluation.adaptive_evaluator import RoutingPerformanceAnalyzer
from app.evaluation.response_evaluator import EvaluationDimension, EvaluationSuite
from app.schemas.responses import create_error_response, create_success_response

# Authentication temporarily disabled for deployment

router = APIRouter(tags=["Evaluation"])
logger = structlog.get_logger(__name__)


class EvaluationRequest(BaseModel):
    """Request model for evaluating a response"""

    query: str = Field(default="test query", description="The original query")
    response: str = Field(
        default="test response", description="The AI response to evaluate"
    )
    context: Optional[Dict[str, Any]] = Field(None, description="Additional context")


class BatchEvaluationRequest(BaseModel):
    """Request model for batch evaluation"""

    interactions: List[Dict[str, Any]] = Field(
        default=[{"query": "test", "response": "test"}],
        description="List of query-response interactions",
    )


class RoutingEvaluationRequest(BaseModel):
    """Request model for evaluating routing decisions"""

    routing_arm: str = Field(default="test_arm", description="The routing arm used")
    query: str = Field(default="test query", description="The original query")
    response: str = Field(default="test response", description="The AI response")
    response_time: float = Field(default=1.0, description="Response time in seconds")
    cost_usd: float = Field(default=0.01, description="Cost in USD")


# Global evaluation suite
evaluation_suite = EvaluationSuite()
routing_analyzer = RoutingPerformanceAnalyzer()


@router.post("/response/evaluate")
async def evaluate_response(
    request: EvaluationRequest,
) -> JSONResponse:
    """
    Evaluate the quality of an AI response across multiple dimensions

    Returns evaluation scores for:
    - Relevance: How well the response addresses the query
    - Accuracy: Factual correctness and reliability
    - Completeness: Thoroughness of the response
    - Clarity: Readability and structure
    - Safety: Absence of harmful content
    - Helpfulness: Practical value to the user
    - Factuality: Use of specific data and citations
    """
    try:
        # Evaluate the response
        eval_result = await evaluation_suite.evaluate_interaction(
            request.query, request.response, request.context
        )

        # Calculate overall quality score
        overall_quality = evaluation_suite.calculate_overall_quality_score(eval_result)

        # Generate improvement recommendations
        recommendations = evaluation_suite.get_improvement_recommendations(eval_result)

        # Format response
        response_data = {
            "evaluation_result": {
                "query": eval_result.query,
                "response_length": len(eval_result.response),
                "overall_quality_score": overall_quality,
                "dimension_scores": {
                    dim.value: score for dim, score in eval_result.scores.items()
                },
                "evaluation_time": eval_result.evaluation_time,
                "evaluator_version": eval_result.evaluator_version,
            },
            "detailed_analysis": eval_result.details,
            "recommendations": recommendations,
            "quality_assessment": {
                "grade": _get_quality_grade(overall_quality),
                "strengths": _identify_strengths(eval_result.scores),
                "areas_for_improvement": _identify_weaknesses(eval_result.scores),
            },
        }

        logger.info(
            "response_evaluation_completed",
            overall_quality=overall_quality,
            query_length=len(request.query),
            response_length=len(request.response),
        )

        return create_success_response(
            data=response_data, message="Response evaluation completed successfully"
        )

    except Exception as e:
        logger.error("response_evaluation_failed", error=str(e))
        return create_error_response(
            message="Failed to evaluate response", error_code="EVALUATION_ERROR"
        )


@router.post("/response/batch-evaluate")
async def batch_evaluate_responses(
    request: BatchEvaluationRequest,
) -> JSONResponse:
    """
    Evaluate multiple query-response interactions in batch

    Useful for:
    - Model comparison across multiple examples
    - Quality assessment of conversation datasets
    - Batch analysis of system performance
    """
    try:
        if len(request.interactions) > 100:
            return create_error_response(
                message="Batch size too large. Maximum 100 interactions per request.",
                error_code="BATCH_SIZE_EXCEEDED",
            )

        # Validate interaction format
        for i, interaction in enumerate(request.interactions):
            if "query" not in interaction or "response" not in interaction:
                return create_error_response(
                    message=f"Interaction {i} missing required 'query' or 'response' field",
                    error_code="INVALID_INTERACTION_FORMAT",
                )

        # Batch evaluate
        eval_results = await evaluation_suite.batch_evaluate(request.interactions)

        # Process results
        successful_evaluations = []
        failed_evaluations = []

        for i, result in enumerate(eval_results):
            if isinstance(result, Exception):
                failed_evaluations.append({"index": i, "error": str(result)})
            else:
                overall_quality = evaluation_suite.calculate_overall_quality_score(
                    result
                )
                successful_evaluations.append(
                    {
                        "index": i,
                        "overall_quality_score": overall_quality,
                        "dimension_scores": {
                            dim.value: score for dim, score in result.scores.items()
                        },
                        "evaluation_time": result.evaluation_time,
                    }
                )

        # Calculate aggregate statistics
        if successful_evaluations:
            quality_scores = [
                eval["overall_quality_score"] for eval in successful_evaluations
            ]
            aggregate_stats = {
                "total_evaluations": len(successful_evaluations),
                "avg_quality_score": sum(quality_scores) / len(quality_scores),
                "min_quality_score": min(quality_scores),
                "max_quality_score": max(quality_scores),
                "quality_distribution": {
                    "excellent": sum(1 for score in quality_scores if score >= 0.8)
                    / len(quality_scores),
                    "good": sum(1 for score in quality_scores if 0.6 <= score < 0.8)
                    / len(quality_scores),
                    "fair": sum(1 for score in quality_scores if 0.4 <= score < 0.6)
                    / len(quality_scores),
                    "poor": sum(1 for score in quality_scores if score < 0.4)
                    / len(quality_scores),
                },
            }
        else:
            aggregate_stats = {"message": "No successful evaluations"}

        response_data = {
            "batch_results": {
                "successful_evaluations": successful_evaluations,
                "failed_evaluations": failed_evaluations,
                "aggregate_statistics": aggregate_stats,
            },
            "summary": {
                "total_interactions": len(request.interactions),
                "successful_count": len(successful_evaluations),
                "failed_count": len(failed_evaluations),
                "success_rate": len(successful_evaluations) / len(request.interactions),
            },
        }

        logger.info(
            "batch_evaluation_completed",
            total_interactions=len(request.interactions),
            successful_count=len(successful_evaluations),
            failed_count=len(failed_evaluations),
        )

        return create_success_response(
            data=response_data, message="Batch evaluation completed"
        )

    except Exception as e:
        logger.error("batch_evaluation_failed", error=str(e))
        return create_error_response(
            message="Failed to perform batch evaluation",
            error_code="BATCH_EVALUATION_ERROR",
        )


@router.post("/routing/evaluate")
async def evaluate_routing_decision(
    request: RoutingEvaluationRequest,
) -> JSONResponse:
    """
    Evaluate a specific routing decision

    Analyzes the quality and efficiency of a routing arm's performance
    for a specific query-response interaction.
    """
    try:
        # Evaluate the routing decision
        eval_result = await routing_analyzer.evaluate_routing_decision(
            routing_arm=request.routing_arm,
            query=request.query,
            response=request.response,
            response_time=request.response_time,
            cost_usd=request.cost_usd,
        )

        # Calculate efficiency metrics
        quality_per_dollar = eval_result.quality_score / max(request.cost_usd, 0.001)
        quality_per_second = eval_result.quality_score / max(request.response_time, 0.1)

        response_data = {
            "routing_evaluation": {
                "routing_arm": request.routing_arm,
                "quality_score": eval_result.quality_score,
                "response_time": request.response_time,
                "cost_usd": request.cost_usd,
                "efficiency_metrics": {
                    "quality_per_dollar": quality_per_dollar,
                    "quality_per_second": quality_per_second,
                    "cost_efficiency_grade": _get_efficiency_grade(quality_per_dollar),
                    "speed_efficiency_grade": _get_efficiency_grade(
                        quality_per_second * 10
                    ),  # Scale for readability
                },
            },
            "detailed_quality_analysis": {
                "dimension_scores": {
                    dim.value: score
                    for dim, score in eval_result.eval_details.scores.items()
                },
                "strengths": _identify_strengths(eval_result.eval_details.scores),
                "weaknesses": _identify_weaknesses(eval_result.eval_details.scores),
            },
            "recommendations": _generate_routing_recommendations(
                request.routing_arm,
                eval_result.quality_score,
                request.cost_usd,
                request.response_time,
            ),
        }

        logger.info(
            "routing_evaluation_completed",
            routing_arm=request.routing_arm,
            quality_score=eval_result.quality_score,
            cost=request.cost_usd,
            response_time=request.response_time,
        )

        return create_success_response(
            data=response_data, message="Routing decision evaluation completed"
        )

    except Exception as e:
        logger.error("routing_evaluation_failed", error=str(e))
        return create_error_response(
            message="Failed to evaluate routing decision",
            error_code="ROUTING_EVALUATION_ERROR",
        )


@router.get("/routing/performance")
async def get_routing_performance_analysis(
    hours: int = Query(24, ge=1, le=168, description="Time window in hours"),
    routing_arm: Optional[str] = Query(
        None, description="Specific routing arm to analyze"
    ),
) -> JSONResponse:
    """
    Get comprehensive routing performance analysis

    Analyzes the performance of routing arms over a specified time period,
    including quality trends, cost efficiency, and recommendations.
    """
    try:
        # This would typically pull from stored evaluation history
        # For demo purposes, return a structured analysis format

        analysis_data = {
            "time_window_hours": hours,
            "analysis_timestamp": datetime.now().isoformat(),
            "routing_arm_filter": routing_arm,
            "performance_summary": {
                "message": "Routing performance analysis requires historical evaluation data",
                "note": "Enable evaluation in your adaptive router to collect performance data",
            },
            "recommended_setup": {
                "steps": [
                    "Integrate EvaluationDrivenAdaptiveRouter in your application",
                    "Enable evaluation in routing decisions",
                    "Collect evaluation data over time",
                    "Use this endpoint to analyze performance trends",
                ]
            },
            "sample_analysis_structure": {
                "arms_analysis": {
                    "fast_chat": {
                        "metrics": {
                            "total_requests": 150,
                            "avg_quality_score": 0.75,
                            "avg_response_time": 1.2,
                            "avg_cost_usd": 0.002,
                            "efficiency_score": 375.0,
                        },
                        "quality_distribution": {
                            "excellent": 0.3,
                            "good": 0.5,
                            "fair": 0.15,
                            "poor": 0.05,
                        },
                        "recommendations": [
                            "Good performance - consider increasing traffic allocation"
                        ],
                    }
                },
                "best_performing_arm": ["fast_chat", 0.75],
                "system_recommendations": [
                    "Overall system performing well",
                    "Monitor cost trends",
                ],
            },
        }

        logger.info(
            "routing_performance_analysis_requested",
            hours=hours,
            routing_arm=routing_arm,
        )

        return create_success_response(
            data=analysis_data,
            message="Routing performance analysis structure provided",
        )

    except Exception as e:
        logger.error("routing_performance_analysis_failed", error=str(e))
        return create_error_response(
            message="Failed to analyze routing performance",
            error_code="ROUTING_ANALYSIS_ERROR",
        )


@router.get("/metrics/quality-trends")
async def get_quality_trends(
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze"),
    routing_arm: Optional[str] = Query(None, description="Filter by routing arm"),
) -> JSONResponse:
    """
    Get quality trends over time

    Returns time-series data showing how response quality
    has changed over the specified time period.
    """
    try:
        # This would pull from ClickHouse evaluation metrics
        trends_data = {
            "time_period_days": days,
            "routing_arm_filter": routing_arm,
            "quality_trends": {
                "message": "Quality trends require historical evaluation data",
                "note": "Enable evaluation data collection to see quality trends over time",
            },
            "sample_trend_structure": {
                "daily_quality_scores": [
                    {"date": "2024-01-01", "avg_quality": 0.72, "request_count": 45},
                    {"date": "2024-01-02", "avg_quality": 0.78, "request_count": 52},
                    {"date": "2024-01-03", "avg_quality": 0.75, "request_count": 48},
                ],
                "trend_analysis": {
                    "direction": "improving",
                    "confidence": 0.8,
                    "quality_change": 0.06,
                },
            },
        }

        return create_success_response(
            data=trends_data, message="Quality trends analysis structure provided"
        )

    except Exception as e:
        logger.error("quality_trends_analysis_failed", error=str(e))
        return create_error_response(
            message="Failed to analyze quality trends",
            error_code="QUALITY_TRENDS_ERROR",
        )


@router.get("/health")
async def get_evaluation_health() -> JSONResponse:
    """Get evaluation system health status"""
    try:
        health_status = {
            "evaluation_suite_available": True,
            "routing_analyzer_available": True,
            "supported_dimensions": [dim.value for dim in EvaluationDimension],
            "evaluation_endpoints": [
                "/response/evaluate",
                "/response/batch-evaluate",
                "/routing/evaluate",
                "/routing/performance",
                "/metrics/quality-trends",
            ],
            "status": "operational",
        }

        return create_success_response(
            data=health_status, message="Evaluation system operational"
        )

    except Exception as e:
        logger.error("evaluation_health_check_failed", error=str(e))
        return create_error_response(
            message="Evaluation health check failed",
            error_code="EVALUATION_HEALTH_ERROR",
        )


# Helper functions
def _get_quality_grade(score: float) -> str:
    """Convert quality score to letter grade"""
    if score >= 0.9:
        return "A+"
    elif score >= 0.8:
        return "A"
    elif score >= 0.7:
        return "B"
    elif score >= 0.6:
        return "C"
    elif score >= 0.5:
        return "D"
    else:
        return "F"


def _get_efficiency_grade(efficiency: float) -> str:
    """Convert efficiency score to grade"""
    if efficiency >= 100:
        return "Excellent"
    elif efficiency >= 50:
        return "Good"
    elif efficiency >= 25:
        return "Fair"
    else:
        return "Poor"


def _identify_strengths(scores: Dict[EvaluationDimension, float]) -> List[str]:
    """Identify strengths based on evaluation scores"""
    strengths = []
    for dimension, score in scores.items():
        if score >= 0.8:
            strengths.append(f"Excellent {dimension.value}")
        elif score >= 0.7:
            strengths.append(f"Good {dimension.value}")
    return strengths


def _identify_weaknesses(scores: Dict[EvaluationDimension, float]) -> List[str]:
    """Identify weaknesses based on evaluation scores"""
    weaknesses = []
    for dimension, score in scores.items():
        if score < 0.6:
            weaknesses.append(f"Needs improvement in {dimension.value}")
    return weaknesses


def _generate_routing_recommendations(
    arm: str, quality: float, cost: float, time: float
) -> List[str]:
    """Generate recommendations for routing optimization"""
    recommendations = []

    if quality >= 0.8 and cost <= 0.005 and time <= 2.0:
        recommendations.append(
            f"{arm} is performing excellently - consider increasing traffic allocation"
        )
    elif quality < 0.6:
        recommendations.append(
            f"{arm} quality below acceptable threshold - review model configuration"
        )
    elif cost > 0.01:
        recommendations.append(
            f"{arm} cost too high - investigate cost optimization opportunities"
        )
    elif time > 5.0:
        recommendations.append(f"{arm} response time too slow - optimize for speed")

    return recommendations
