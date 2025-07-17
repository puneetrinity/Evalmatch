"""
Gradual Rollout System for Thompson Sampling Bandit
Week 2: Safely transition from shadow mode to real traffic routing
"""

import time
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional

import structlog

logger = structlog.get_logger(__name__)


class RolloutStage(Enum):
    """Rollout stages from shadow to full production"""

    SHADOW_ONLY = "shadow_only"  # 0% real traffic, 100% shadow
    CANARY = "canary"  # 1% real traffic
    SMALL_ROLLOUT = "small_rollout"  # 5% real traffic
    MEDIUM_ROLLOUT = "medium_rollout"  # 15% real traffic
    LARGE_ROLLOUT = "large_rollout"  # 30% real traffic
    MAJORITY = "majority"  # 60% real traffic
    FULL_ROLLOUT = "full_rollout"  # 90% real traffic
    COMPLETE = "complete"  # 100% real traffic


@dataclass
class RolloutConfig:
    """Configuration for rollout stage"""

    stage: RolloutStage
    real_traffic_percentage: float
    min_hours_in_stage: int
    min_requests_in_stage: int
    max_error_rate: float
    max_response_time_degradation: float
    min_confidence_threshold: float


@dataclass
class RolloutMetrics:
    """Metrics tracked during rollout"""

    stage: RolloutStage
    requests_in_stage: int
    hours_in_stage: float
    error_rate: float
    avg_response_time: float
    baseline_response_time: float
    user_satisfaction: float
    cost_per_request: float
    bandit_confidence: float

    @property
    def response_time_degradation(self) -> float:
        """Calculate response time degradation vs baseline"""
        if self.baseline_response_time <= 0:
            return 0.0
        return (
            self.avg_response_time - self.baseline_response_time
        ) / self.baseline_response_time


class GradualRolloutManager:
    """
    Manages gradual rollout from shadow testing to full production

    Features:
    - Automatic stage progression based on performance
    - Safety checks and automatic rollback
    - Configurable success criteria per stage
    - Real-time monitoring and alerting
    """

    # Default rollout configuration
    DEFAULT_STAGES = [
        RolloutConfig(
            stage=RolloutStage.SHADOW_ONLY,
            real_traffic_percentage=0.0,
            min_hours_in_stage=1,
            min_requests_in_stage=100,
            max_error_rate=0.05,  # 5% max error rate
            max_response_time_degradation=0.1,  # 10% max slowdown
            min_confidence_threshold=0.7,
        ),
        RolloutConfig(
            stage=RolloutStage.CANARY,
            real_traffic_percentage=0.01,  # 1%
            min_hours_in_stage=2,
            min_requests_in_stage=50,
            max_error_rate=0.03,
            max_response_time_degradation=0.05,
            min_confidence_threshold=0.75,
        ),
        RolloutConfig(
            stage=RolloutStage.SMALL_ROLLOUT,
            real_traffic_percentage=0.05,  # 5%
            min_hours_in_stage=4,
            min_requests_in_stage=200,
            max_error_rate=0.02,
            max_response_time_degradation=0.05,
            min_confidence_threshold=0.8,
        ),
        RolloutConfig(
            stage=RolloutStage.MEDIUM_ROLLOUT,
            real_traffic_percentage=0.15,  # 15%
            min_hours_in_stage=8,
            min_requests_in_stage=500,
            max_error_rate=0.02,
            max_response_time_degradation=0.03,
            min_confidence_threshold=0.85,
        ),
        RolloutConfig(
            stage=RolloutStage.LARGE_ROLLOUT,
            real_traffic_percentage=0.30,  # 30%
            min_hours_in_stage=12,
            min_requests_in_stage=1000,
            max_error_rate=0.015,
            max_response_time_degradation=0.02,
            min_confidence_threshold=0.9,
        ),
        RolloutConfig(
            stage=RolloutStage.MAJORITY,
            real_traffic_percentage=0.60,  # 60%
            min_hours_in_stage=24,
            min_requests_in_stage=2000,
            max_error_rate=0.01,
            max_response_time_degradation=0.02,
            min_confidence_threshold=0.92,
        ),
        RolloutConfig(
            stage=RolloutStage.FULL_ROLLOUT,
            real_traffic_percentage=0.90,  # 90%
            min_hours_in_stage=48,
            min_requests_in_stage=5000,
            max_error_rate=0.01,
            max_response_time_degradation=0.01,
            min_confidence_threshold=0.95,
        ),
        RolloutConfig(
            stage=RolloutStage.COMPLETE,
            real_traffic_percentage=1.0,  # 100%
            min_hours_in_stage=0,  # No minimum for final stage
            min_requests_in_stage=0,
            max_error_rate=0.005,
            max_response_time_degradation=0.01,
            min_confidence_threshold=0.98,
        ),
    ]

    def __init__(
        self,
        rollout_name: str = "bandit_rollout",
        stage_configs: List[RolloutConfig] = None,
        auto_advance: bool = True,
        emergency_rollback_threshold: float = 0.1,  # 10% error rate triggers immediate rollback
    ):
        self.rollout_name = rollout_name
        self.stage_configs = {
            config.stage: config for config in (stage_configs or self.DEFAULT_STAGES)
        }
        self.auto_advance = auto_advance
        self.emergency_rollback_threshold = emergency_rollback_threshold

        # Current state
        self.current_stage = RolloutStage.SHADOW_ONLY
        self.stage_start_time = time.time()
        self.rollout_start_time = time.time()

        # Metrics tracking
        self.stage_metrics: Dict[RolloutStage, RolloutMetrics] = {}
        self.current_stage_requests = 0
        self.baseline_metrics: Dict[str, float] = {}

        # Safety state
        self.is_active = True
        self.rollback_reason: Optional[str] = None
        self.manual_hold = False

        logger.info(
            "gradual_rollout_initialized",
            rollout_name=rollout_name,
            current_stage=self.current_stage.value,
            total_stages=len(self.stage_configs),
            auto_advance=auto_advance,
        )

    def get_current_traffic_percentage(self) -> float:
        """Get current real traffic percentage"""
        if not self.is_active:
            return 0.0  # Safety: no real traffic if rollout stopped

        config = self.stage_configs.get(self.current_stage)
        return config.real_traffic_percentage if config else 0.0

    def should_use_bandit(self, user_id: str = None) -> bool:
        """Determine if this request should use bandit routing"""
        if not self.is_active or self.manual_hold:
            return False

        traffic_percentage = self.get_current_traffic_percentage()

        if traffic_percentage == 0.0:
            return False
        elif traffic_percentage >= 1.0:
            return True
        else:
            # Use consistent hashing for user stickiness
            import hashlib

            if user_id:
                # Consistent assignment based on user ID
                hash_val = int(hashlib.md5(user_id.encode()).hexdigest()[:8], 16)
                threshold = hash_val / (2**32)
            else:
                # Random assignment for anonymous users
                import random

                threshold = random.random()

            return threshold < traffic_percentage

    def record_request_metrics(
        self,
        success: bool,
        response_time: float,
        cost: float = 0.0,
        user_satisfaction: Optional[float] = None,
        bandit_confidence: float = 0.0,
        is_bandit_request: bool = True,
    ) -> None:
        """Record metrics for current rollout stage"""
        if not is_bandit_request:
            # Update baseline metrics from non-bandit requests
            self._update_baseline_metrics(success, response_time, cost)
            return

        self.current_stage_requests += 1

        # Update stage metrics
        if self.current_stage not in self.stage_metrics:
            self.stage_metrics[self.current_stage] = RolloutMetrics(
                stage=self.current_stage,
                requests_in_stage=0,
                hours_in_stage=0.0,
                error_rate=0.0,
                avg_response_time=0.0,
                baseline_response_time=self.baseline_metrics.get(
                    "response_time", response_time
                ),
                user_satisfaction=0.0,
                cost_per_request=0.0,
                bandit_confidence=0.0,
            )

        metrics = self.stage_metrics[self.current_stage]
        n = metrics.requests_in_stage + 1

        # Update running averages
        metrics.requests_in_stage = n
        metrics.hours_in_stage = (time.time() - self.stage_start_time) / 3600
        metrics.error_rate = (
            (metrics.error_rate * (n - 1)) + (0.0 if success else 1.0)
        ) / n
        metrics.avg_response_time = (
            (metrics.avg_response_time * (n - 1)) + response_time
        ) / n
        metrics.cost_per_request = ((metrics.cost_per_request * (n - 1)) + cost) / n
        metrics.bandit_confidence = (
            (metrics.bandit_confidence * (n - 1)) + bandit_confidence
        ) / n

        if user_satisfaction is not None:
            metrics.user_satisfaction = (
                (metrics.user_satisfaction * (n - 1)) + user_satisfaction
            ) / n

        # Check for emergency conditions
        self._check_emergency_conditions(metrics)

        # Check for stage advancement
        if self.auto_advance and not self.manual_hold:
            self._check_stage_advancement(metrics)

    def _update_baseline_metrics(
        self, success: bool, response_time: float, cost: float
    ) -> None:
        """Update baseline metrics from production router"""
        if "requests" not in self.baseline_metrics:
            self.baseline_metrics = {
                "requests": 0,
                "error_rate": 0.0,
                "response_time": 0.0,
                "cost": 0.0,
            }

        n = self.baseline_metrics["requests"] + 1
        self.baseline_metrics["requests"] = n
        self.baseline_metrics["error_rate"] = (
            (self.baseline_metrics["error_rate"] * (n - 1)) + (0.0 if success else 1.0)
        ) / n
        self.baseline_metrics["response_time"] = (
            (self.baseline_metrics["response_time"] * (n - 1)) + response_time
        ) / n
        self.baseline_metrics["cost"] = (
            (self.baseline_metrics["cost"] * (n - 1)) + cost
        ) / n

    def _check_emergency_conditions(self, metrics: RolloutMetrics) -> None:
        """Check for emergency rollback conditions"""
        if not self.is_active:
            return

        self.stage_configs[self.current_stage]

        # Emergency rollback conditions
        emergency_conditions = []

        if metrics.error_rate > self.emergency_rollback_threshold:
            emergency_conditions.append(
                f"error_rate_too_high: {metrics.error_rate:.3f}"
            )

        if metrics.response_time_degradation > 0.5:  # 50% degradation
            emergency_conditions.append(
                f"response_time_degraded: {metrics.response_time_degradation:.3f}"
            )

        if emergency_conditions:
            self._emergency_rollback("; ".join(emergency_conditions))

    def _check_stage_advancement(self, metrics: RolloutMetrics) -> None:
        """Check if current stage can advance to next stage"""
        config = self.stage_configs[self.current_stage]

        # Check minimum requirements
        time_requirement_met = metrics.hours_in_stage >= config.min_hours_in_stage
        request_requirement_met = (
            metrics.requests_in_stage >= config.min_requests_in_stage
        )

        # Check performance requirements
        error_rate_ok = metrics.error_rate <= config.max_error_rate
        response_time_ok = (
            metrics.response_time_degradation <= config.max_response_time_degradation
        )
        confidence_ok = metrics.bandit_confidence >= config.min_confidence_threshold

        # All requirements must be met
        if (
            time_requirement_met
            and request_requirement_met
            and error_rate_ok
            and response_time_ok
            and confidence_ok
        ):
            self._advance_to_next_stage()
        elif not (error_rate_ok and response_time_ok):
            # Performance degraded - consider rollback
            self._consider_rollback(metrics, config)

    def _advance_to_next_stage(self) -> None:
        """Advance to next rollout stage"""
        current_stage_list = list(RolloutStage)
        current_index = current_stage_list.index(self.current_stage)

        if current_index < len(current_stage_list) - 1:
            old_stage = self.current_stage
            self.current_stage = current_stage_list[current_index + 1]
            self.stage_start_time = time.time()
            self.current_stage_requests = 0

            logger.info(
                "rollout_stage_advanced",
                rollout_name=self.rollout_name,
                old_stage=old_stage.value,
                new_stage=self.current_stage.value,
                new_traffic_percentage=self.get_current_traffic_percentage(),
            )
        else:
            logger.info(
                "rollout_completed",
                rollout_name=self.rollout_name,
                total_duration_hours=(time.time() - self.rollout_start_time) / 3600,
            )

    def _consider_rollback(
        self, metrics: RolloutMetrics, config: RolloutConfig
    ) -> None:
        """Consider rolling back due to performance issues"""
        # Only rollback if we've been in stage long enough to have meaningful data
        if metrics.hours_in_stage < 1.0 or metrics.requests_in_stage < 50:
            return

        rollback_reasons = []

        if metrics.error_rate > config.max_error_rate * 1.5:  # 50% worse than threshold
            rollback_reasons.append(f"error_rate_degraded: {metrics.error_rate:.3f}")

        if metrics.response_time_degradation > config.max_response_time_degradation * 2:
            rollback_reasons.append(
                f"response_time_degraded: {metrics.response_time_degradation:.3f}"
            )

        if rollback_reasons:
            self._rollback_stage("; ".join(rollback_reasons))

    def _rollback_stage(self, reason: str) -> None:
        """Rollback to previous stage"""
        current_stage_list = list(RolloutStage)
        current_index = current_stage_list.index(self.current_stage)

        if current_index > 0:
            old_stage = self.current_stage
            self.current_stage = current_stage_list[current_index - 1]
            self.stage_start_time = time.time()
            self.current_stage_requests = 0

            logger.warning(
                "rollout_stage_rollback",
                rollout_name=self.rollout_name,
                old_stage=old_stage.value,
                new_stage=self.current_stage.value,
                reason=reason,
            )
        else:
            self._emergency_rollback(f"rollback_from_first_stage: {reason}")

    def _emergency_rollback(self, reason: str) -> None:
        """Emergency rollback to shadow-only mode"""
        self.is_active = False
        self.rollback_reason = reason
        self.current_stage = RolloutStage.SHADOW_ONLY

        logger.error(
            "emergency_rollback_triggered",
            rollout_name=self.rollout_name,
            reason=reason,
            stage_when_failed=self.current_stage.value,
        )

    def get_rollout_status(self) -> Dict:
        """Get comprehensive rollout status"""
        current_config = self.stage_configs.get(self.current_stage)
        current_metrics = self.stage_metrics.get(self.current_stage)

        status = {
            "rollout_name": self.rollout_name,
            "is_active": self.is_active,
            "manual_hold": self.manual_hold,
            "rollback_reason": self.rollback_reason,
            "current_stage": self.current_stage.value,
            "current_traffic_percentage": self.get_current_traffic_percentage(),
            "total_rollout_hours": (time.time() - self.rollout_start_time) / 3600,
            "stage_progress": {},
        }

        if current_config and current_metrics:
            status["stage_progress"] = {
                "hours_in_stage": current_metrics.hours_in_stage,
                "min_hours_required": current_config.min_hours_in_stage,
                "requests_in_stage": current_metrics.requests_in_stage,
                "min_requests_required": current_config.min_requests_in_stage,
                "performance": {
                    "error_rate": current_metrics.error_rate,
                    "max_error_rate": current_config.max_error_rate,
                    "response_time_degradation": current_metrics.response_time_degradation,
                    "max_degradation": current_config.max_response_time_degradation,
                    "bandit_confidence": current_metrics.bandit_confidence,
                    "min_confidence": current_config.min_confidence_threshold,
                },
                "stage_ready_for_advancement": self._is_stage_ready_for_advancement(),
            }

        # Add stage history
        status["stage_history"] = {}
        for stage, metrics in self.stage_metrics.items():
            status["stage_history"][stage.value] = {
                "requests": metrics.requests_in_stage,
                "hours": metrics.hours_in_stage,
                "error_rate": metrics.error_rate,
                "avg_response_time": metrics.avg_response_time,
                "response_time_degradation": metrics.response_time_degradation,
            }

        return status

    def _is_stage_ready_for_advancement(self) -> bool:
        """Check if current stage is ready for advancement"""
        if not self.is_active or self.manual_hold:
            return False

        current_metrics = self.stage_metrics.get(self.current_stage)
        if not current_metrics:
            return False

        config = self.stage_configs[self.current_stage]

        return (
            current_metrics.hours_in_stage >= config.min_hours_in_stage
            and current_metrics.requests_in_stage >= config.min_requests_in_stage
            and current_metrics.error_rate <= config.max_error_rate
            and current_metrics.response_time_degradation
            <= config.max_response_time_degradation
            and current_metrics.bandit_confidence >= config.min_confidence_threshold
        )

    def manual_advance(self) -> bool:
        """Manually advance to next stage"""
        if self._is_stage_ready_for_advancement():
            self._advance_to_next_stage()
            return True
        return False

    def manual_rollback(self, reason: str = "manual_rollback") -> None:
        """Manually rollback to previous stage"""
        self._rollback_stage(reason)

    def hold_rollout(self, hold: bool = True) -> None:
        """Hold/resume automatic rollout advancement"""
        self.manual_hold = hold
        logger.info("rollout_hold_toggled", rollout_name=self.rollout_name, held=hold)

    def emergency_stop(self, reason: str = "manual_emergency_stop") -> None:
        """Emergency stop the entire rollout"""
        self._emergency_rollback(reason)
