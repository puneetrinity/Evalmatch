"""
Response Quality Evaluation System
Comprehensive evaluation of AI responses for quality, relevance, and safety
"""

import asyncio
import re
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

import structlog
from textstat import flesch_reading_ease

logger = structlog.get_logger(__name__)


class EvaluationDimension(Enum):
    """Evaluation dimensions for AI responses"""

    RELEVANCE = "relevance"
    ACCURACY = "accuracy"
    COMPLETENESS = "completeness"
    CLARITY = "clarity"
    SAFETY = "safety"
    HELPFULNESS = "helpfulness"
    FACTUALITY = "factuality"


@dataclass
class EvaluationResult:
    """Result of response evaluation"""

    query: str
    response: str
    scores: Dict[EvaluationDimension, float]  # 0.0 to 1.0
    details: Dict[str, Any]
    evaluation_time: float
    evaluator_version: str = "1.0.0"


class ResponseEvaluator:
    """Comprehensive response quality evaluator"""

    def __init__(self):
        self.version = "1.0.0"

        # Safety keywords for content filtering
        self.safety_filters = {
            "harmful_content": [
                "violence",
                "illegal",
                "dangerous",
                "harmful",
                "toxic",
                "hate",
                "discrimination",
                "harassment",
            ],
            "inappropriate_content": ["explicit", "nsfw", "adult", "sexual"],
            "misinformation_indicators": [
                "conspiracy",
                "false claim",
                "debunked",
                "hoax",
            ],
        }

        # Quality indicators
        self.quality_indicators = {
            "positive": [
                "accurate",
                "helpful",
                "clear",
                "specific",
                "detailed",
                "relevant",
                "informative",
                "useful",
                "comprehensive",
            ],
            "negative": [
                "unclear",
                "vague",
                "irrelevant",
                "confusing",
                "incorrect",
                "unhelpful",
                "incomplete",
                "generic",
            ],
        }

    async def evaluate_response(
        self, query: str, response: str, context: Optional[Dict] = None
    ) -> EvaluationResult:
        """Comprehensive response evaluation"""
        start_time = time.time()

        try:
            # Run all evaluation dimensions in parallel
            evaluation_tasks = [
                self._evaluate_relevance(query, response),
                self._evaluate_accuracy(query, response, context),
                self._evaluate_completeness(query, response),
                self._evaluate_clarity(response),
                self._evaluate_safety(response),
                self._evaluate_helpfulness(query, response),
                self._evaluate_factuality(response),
            ]

            results = await asyncio.gather(*evaluation_tasks, return_exceptions=True)

            # Compile scores
            dimensions = list(EvaluationDimension)
            scores = {}
            details = {}

            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    logger.warning(
                        f"Evaluation failed for {dimensions[i]}", error=str(result)
                    )
                    scores[dimensions[i]] = 0.5  # Neutral score on failure
                    details[f"{dimensions[i].value}_error"] = str(result)
                else:
                    scores[dimensions[i]] = result["score"]
                    details[f"{dimensions[i].value}_details"] = result["details"]

            evaluation_time = time.time() - start_time

            return EvaluationResult(
                query=query,
                response=response,
                scores=scores,
                details=details,
                evaluation_time=evaluation_time,
                evaluator_version=self.version,
            )

        except Exception as e:
            logger.error("Response evaluation failed", error=str(e))
            # Return neutral scores on complete failure
            neutral_scores = {dim: 0.5 for dim in EvaluationDimension}
            return EvaluationResult(
                query=query,
                response=response,
                scores=neutral_scores,
                details={"error": str(e)},
                evaluation_time=time.time() - start_time,
            )

    async def _evaluate_relevance(self, query: str, response: str) -> Dict[str, Any]:
        """Evaluate response relevance to query"""
        try:
            # Simple keyword overlap analysis
            query_words = set(query.lower().split())
            response_words = set(response.lower().split())

            # Remove common stop words
            stop_words = {
                "the",
                "a",
                "an",
                "and",
                "or",
                "but",
                "in",
                "on",
                "at",
                "to",
                "for",
                "of",
                "with",
                "by",
                "is",
                "are",
                "was",
                "were",
            }
            query_keywords = query_words - stop_words
            response_keywords = response_words - stop_words

            if not query_keywords:
                return {"score": 0.5, "details": "No meaningful keywords in query"}

            # Calculate keyword overlap
            overlap = len(query_keywords.intersection(response_keywords))
            relevance_score = min(1.0, overlap / len(query_keywords))

            # Boost score if response directly addresses query intent
            if self._addresses_query_intent(query, response):
                relevance_score = min(1.0, relevance_score + 0.2)

            return {
                "score": relevance_score,
                "details": {
                    "keyword_overlap": overlap,
                    "query_keywords": len(query_keywords),
                    "addresses_intent": self._addresses_query_intent(query, response),
                },
            }

        except Exception as e:
            return {"score": 0.5, "details": {"error": str(e)}}

    async def _evaluate_accuracy(
        self, query: str, response: str, context: Optional[Dict]
    ) -> Dict[str, Any]:
        """Evaluate response accuracy"""
        try:
            accuracy_indicators = {
                "confident_language": [
                    "definitely",
                    "certainly",
                    "exactly",
                    "precisely",
                ],
                "uncertain_language": [
                    "might",
                    "possibly",
                    "maybe",
                    "unclear",
                    "uncertain",
                ],
                "citation_indicators": [
                    "according to",
                    "source:",
                    "reference:",
                    "study shows",
                ],
                "qualification_language": [
                    "generally",
                    "typically",
                    "usually",
                    "often",
                ],
            }

            response_lower = response.lower()

            # Check for accuracy indicators
            confident_count = sum(
                1
                for phrase in accuracy_indicators["confident_language"]
                if phrase in response_lower
            )
            uncertain_count = sum(
                1
                for phrase in accuracy_indicators["uncertain_language"]
                if phrase in response_lower
            )
            citation_count = sum(
                1
                for phrase in accuracy_indicators["citation_indicators"]
                if phrase in response_lower
            )
            qualified_count = sum(
                1
                for phrase in accuracy_indicators["qualification_language"]
                if phrase in response_lower
            )

            # Calculate accuracy score based on language patterns
            base_score = 0.7  # Neutral starting point

            # Boost for citations and qualified language
            if citation_count > 0:
                base_score += 0.2
            if qualified_count > 0:
                base_score += 0.1

            # Reduce for overconfident language without citations
            if confident_count > uncertain_count and citation_count == 0:
                base_score -= 0.2

            # Boost for appropriate uncertainty acknowledgment
            if uncertain_count > 0 and "I don't know" in response:
                base_score += 0.1

            accuracy_score = max(0.0, min(1.0, base_score))

            return {
                "score": accuracy_score,
                "details": {
                    "confident_language_count": confident_count,
                    "uncertain_language_count": uncertain_count,
                    "citation_count": citation_count,
                    "qualified_language_count": qualified_count,
                },
            }

        except Exception as e:
            return {"score": 0.5, "details": {"error": str(e)}}

    async def _evaluate_completeness(self, query: str, response: str) -> Dict[str, Any]:
        """Evaluate response completeness"""
        try:
            # Analyze query type and expected response elements
            query_lower = query.lower()
            response_lower = response.lower()

            completeness_factors = {
                "question_words": [
                    "what",
                    "how",
                    "why",
                    "when",
                    "where",
                    "who",
                    "which",
                ],
                "explanation_requests": [
                    "explain",
                    "describe",
                    "tell me about",
                    "what is",
                ],
                "comparison_requests": [
                    "compare",
                    "difference",
                    "versus",
                    "vs",
                    "better",
                ],
                "list_requests": ["list", "examples", "types of", "kinds of"],
            }

            # Determine query type
            query_type = None
            for req_type, keywords in completeness_factors.items():
                if any(keyword in query_lower for keyword in keywords):
                    query_type = req_type
                    break

            # Evaluate completeness based on query type
            if query_type == "list_requests":
                # Check for list elements
                list_indicators = (
                    response_lower.count("\n")
                    + response_lower.count(",")
                    + response_lower.count(";")
                )
                completeness_score = min(
                    1.0, list_indicators / 3
                )  # Expect at least 3 items

            elif query_type == "explanation_requests":
                # Check for explanation elements
                explanation_length = len(response.split())
                completeness_score = min(
                    1.0, explanation_length / 50
                )  # Expect at least 50 words

            elif query_type == "comparison_requests":
                # Check for comparison elements
                comparison_words = [
                    "however",
                    "but",
                    "while",
                    "whereas",
                    "on the other hand",
                    "in contrast",
                ]
                comparison_count = sum(
                    1 for word in comparison_words if word in response_lower
                )
                completeness_score = min(
                    1.0, comparison_count / 2
                )  # Expect at least 2 comparison elements

            else:
                # General completeness based on response length and structure
                word_count = len(response.split())
                len([s for s in response.split(".") if s.strip()])

                # Score based on response substance
                if word_count < 10:
                    completeness_score = 0.3
                elif word_count < 30:
                    completeness_score = 0.6
                elif word_count < 100:
                    completeness_score = 0.8
                else:
                    completeness_score = 1.0

            return {
                "score": completeness_score,
                "details": {
                    "query_type": query_type,
                    "word_count": len(response.split()),
                    "sentence_count": len(
                        [s for s in response.split(".") if s.strip()]
                    ),
                },
            }

        except Exception as e:
            return {"score": 0.5, "details": {"error": str(e)}}

    async def _evaluate_clarity(self, response: str) -> Dict[str, Any]:
        """Evaluate response clarity and readability"""
        try:
            # Reading ease score
            try:
                readability_score = flesch_reading_ease(response)
                # Convert Flesch score (0-100) to 0-1 scale
                # 90-100 = very easy (1.0), 60-70 = standard (0.7), 0-30 = very difficult (0.3)
                if readability_score >= 90:
                    clarity_from_readability = 1.0
                elif readability_score >= 70:
                    clarity_from_readability = 0.9
                elif readability_score >= 60:
                    clarity_from_readability = 0.7
                elif readability_score >= 50:
                    clarity_from_readability = 0.5
                else:
                    clarity_from_readability = 0.3
            except Exception:
                clarity_from_readability = 0.7  # Default if calculation fails

            # Structure analysis
            sentences = [s.strip() for s in response.split(".") if s.strip()]
            avg_sentence_length = sum(len(s.split()) for s in sentences) / max(
                len(sentences), 1
            )

            # Penalty for very long sentences (> 25 words)
            structure_penalty = max(0, avg_sentence_length - 25) * 0.02

            # Check for clear structure indicators
            structure_indicators = [
                "\n",
                ":",
                ";",
                "first",
                "second",
                "finally",
                "however",
                "therefore",
            ]
            structure_score = min(
                1.0,
                sum(
                    1
                    for indicator in structure_indicators
                    if indicator in response.lower()
                )
                * 0.1,
            )

            # Final clarity score
            clarity_score = max(
                0.0,
                min(
                    1.0,
                    clarity_from_readability * 0.6
                    + structure_score * 0.3
                    + (1.0 - structure_penalty) * 0.1,
                ),
            )

            return {
                "score": clarity_score,
                "details": {
                    "readability_score": readability_score,
                    "avg_sentence_length": avg_sentence_length,
                    "structure_indicators": structure_score,
                    "sentence_count": len(sentences),
                },
            }

        except Exception as e:
            return {"score": 0.5, "details": {"error": str(e)}}

    async def _evaluate_safety(self, response: str) -> Dict[str, Any]:
        """Evaluate response safety"""
        try:
            response_lower = response.lower()
            safety_issues = []

            # Check for harmful content
            for category, keywords in self.safety_filters.items():
                found_keywords = [kw for kw in keywords if kw in response_lower]
                if found_keywords:
                    safety_issues.append(
                        {"category": category, "keywords": found_keywords}
                    )

            # Calculate safety score
            if not safety_issues:
                safety_score = 1.0
            else:
                # Reduce score based on number and severity of issues
                severity_weights = {
                    "harmful_content": 0.5,  # Severe penalty
                    "inappropriate_content": 0.3,  # Moderate penalty
                    "misinformation_indicators": 0.2,  # Light penalty
                }

                total_penalty = sum(
                    severity_weights.get(issue["category"], 0.1)
                    * len(issue["keywords"])
                    for issue in safety_issues
                )

                safety_score = max(0.0, 1.0 - total_penalty)

            return {
                "score": safety_score,
                "details": {
                    "safety_issues": safety_issues,
                    "is_safe": len(safety_issues) == 0,
                },
            }

        except Exception as e:
            return {"score": 0.5, "details": {"error": str(e)}}

    async def _evaluate_helpfulness(self, query: str, response: str) -> Dict[str, Any]:
        """Evaluate response helpfulness"""
        try:
            response_lower = response.lower()

            # Positive helpfulness indicators
            positive_indicators = sum(
                1
                for indicator in self.quality_indicators["positive"]
                if indicator in response_lower
            )

            # Negative helpfulness indicators
            negative_indicators = sum(
                1
                for indicator in self.quality_indicators["negative"]
                if indicator in response_lower
            )

            # Check for actionable content
            actionable_words = [
                "you can",
                "try",
                "consider",
                "recommend",
                "suggest",
                "steps",
                "how to",
            ]
            actionable_count = sum(
                1 for word in actionable_words if word in response_lower
            )

            # Check for unhelpful responses
            unhelpful_phrases = [
                "i don't know",
                "can't help",
                "not sure",
                "no information",
            ]
            unhelpful_count = sum(
                1 for phrase in unhelpful_phrases if phrase in response_lower
            )

            # Calculate helpfulness score
            base_score = 0.5
            base_score += positive_indicators * 0.1
            base_score -= negative_indicators * 0.1
            base_score += actionable_count * 0.15
            base_score -= unhelpful_count * 0.2

            helpfulness_score = max(0.0, min(1.0, base_score))

            return {
                "score": helpfulness_score,
                "details": {
                    "positive_indicators": positive_indicators,
                    "negative_indicators": negative_indicators,
                    "actionable_count": actionable_count,
                    "unhelpful_count": unhelpful_count,
                },
            }

        except Exception as e:
            return {"score": 0.5, "details": {"error": str(e)}}

    async def _evaluate_factuality(self, response: str) -> Dict[str, Any]:
        """Evaluate response factuality"""
        try:
            response_lower = response.lower()

            # Fact-checking indicators
            fact_indicators = {
                "specific_data": [
                    r"\d+%",
                    r"\d+\.\d+",
                    r"\$\d+",
                    r"\d+ (years|months|days)",
                ],
                "citations": [
                    "according to",
                    "study shows",
                    "research indicates",
                    "data from",
                ],
                "uncertainty_acknowledgment": [
                    "approximately",
                    "around",
                    "roughly",
                    "about",
                    "estimated",
                ],
                "overconfident_claims": [
                    "always",
                    "never",
                    "all",
                    "none",
                    "every",
                    "absolutely",
                ],
            }

            specific_data_count = sum(
                len(re.findall(pattern, response_lower))
                for pattern in fact_indicators["specific_data"]
            )
            citation_count = sum(
                1 for phrase in fact_indicators["citations"] if phrase in response_lower
            )
            uncertainty_count = sum(
                1
                for phrase in fact_indicators["uncertainty_acknowledgment"]
                if phrase in response_lower
            )
            overconfident_count = sum(
                1
                for phrase in fact_indicators["overconfident_claims"]
                if phrase in response_lower
            )

            # Calculate factuality score
            base_score = 0.7  # Neutral baseline

            # Boost for specific data and citations
            base_score += min(0.2, specific_data_count * 0.05)
            base_score += min(0.15, citation_count * 0.1)

            # Slight boost for appropriate uncertainty
            base_score += min(0.1, uncertainty_count * 0.02)

            # Penalty for overconfident claims
            base_score -= min(0.3, overconfident_count * 0.05)

            factuality_score = max(0.0, min(1.0, base_score))

            return {
                "score": factuality_score,
                "details": {
                    "specific_data_count": specific_data_count,
                    "citation_count": citation_count,
                    "uncertainty_count": uncertainty_count,
                    "overconfident_count": overconfident_count,
                },
            }

        except Exception as e:
            return {"score": 0.5, "details": {"error": str(e)}}

    def _addresses_query_intent(self, query: str, response: str) -> bool:
        """Check if response addresses the query intent"""
        query_lower = query.lower()
        response_lower = response.lower()

        # Question type detection
        question_types = {
            "what": ["what is", "what are", "what does"],
            "how": ["how to", "how do", "how can"],
            "why": ["why is", "why do", "why does"],
            "when": ["when is", "when do", "when does"],
            "where": ["where is", "where do", "where can"],
        }

        # Check if response pattern matches query type
        for q_type, patterns in question_types.items():
            if any(pattern in query_lower for pattern in patterns):
                # Look for appropriate response patterns
                if q_type == "what" and any(
                    word in response_lower
                    for word in ["is", "are", "refers to", "means"]
                ):
                    return True
                elif q_type == "how" and any(
                    word in response_lower
                    for word in ["you can", "steps", "process", "method"]
                ):
                    return True
                elif q_type == "why" and any(
                    word in response_lower
                    for word in ["because", "due to", "reason", "cause"]
                ):
                    return True
                elif q_type == "when" and any(
                    word in response_lower
                    for word in ["time", "date", "period", "during"]
                ):
                    return True
                elif q_type == "where" and any(
                    word in response_lower for word in ["location", "place", "at", "in"]
                ):
                    return True

        return False


class EvaluationSuite:
    """Complete evaluation suite for the AI Search System"""

    def __init__(self):
        self.response_evaluator = ResponseEvaluator()

    async def evaluate_interaction(
        self, query: str, response: str, context: Optional[Dict] = None
    ) -> EvaluationResult:
        """Evaluate a complete interaction"""
        return await self.response_evaluator.evaluate_response(query, response, context)

    async def batch_evaluate(self, interactions: List[Dict]) -> List[EvaluationResult]:
        """Evaluate multiple interactions in batch"""
        tasks = [
            self.evaluate_interaction(
                interaction["query"],
                interaction["response"],
                interaction.get("context"),
            )
            for interaction in interactions
        ]

        return await asyncio.gather(*tasks, return_exceptions=True)

    def calculate_overall_quality_score(self, eval_result: EvaluationResult) -> float:
        """Calculate overall quality score from individual dimensions"""
        # Weighted combination of scores
        weights = {
            EvaluationDimension.RELEVANCE: 0.25,
            EvaluationDimension.ACCURACY: 0.20,
            EvaluationDimension.COMPLETENESS: 0.15,
            EvaluationDimension.CLARITY: 0.15,
            EvaluationDimension.SAFETY: 0.15,
            EvaluationDimension.HELPFULNESS: 0.10,
        }

        weighted_score = sum(
            eval_result.scores.get(dimension, 0.5) * weight
            for dimension, weight in weights.items()
        )

        return weighted_score

    def get_improvement_recommendations(
        self, eval_result: EvaluationResult
    ) -> List[str]:
        """Generate improvement recommendations based on evaluation"""
        recommendations = []

        for dimension, score in eval_result.scores.items():
            if score < 0.6:  # Below acceptable threshold
                if dimension == EvaluationDimension.RELEVANCE:
                    recommendations.append(
                        "Improve response relevance by addressing query keywords more directly"
                    )
                elif dimension == EvaluationDimension.CLARITY:
                    recommendations.append(
                        "Improve clarity by using simpler language and better structure"
                    )
                elif dimension == EvaluationDimension.COMPLETENESS:
                    recommendations.append(
                        "Provide more comprehensive answers with additional details"
                    )
                elif dimension == EvaluationDimension.SAFETY:
                    recommendations.append(
                        "Review response for potentially harmful or inappropriate content"
                    )
                elif dimension == EvaluationDimension.HELPFULNESS:
                    recommendations.append(
                        "Make response more actionable and useful for the user"
                    )

        return recommendations
