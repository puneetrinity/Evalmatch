"""
ChatGraph - Intelligent conversation management with context awareness.
Implements sophisticated chat workflows with model selection and optimization.

Complete fixed version addressing LangGraph START/END constants and compilation issues.
"""
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.core.logging import get_logger
from app.graphs.base import (
    BaseGraph,
    BaseGraphNode,
    GraphState,
    GraphType,
    NodeResult,
    NodeType,
)
from app.models.manager import ModelManager, QualityLevel, TaskType

logger = get_logger("graphs.chat")


@dataclass
class ConversationContext:
    """Rich conversation context for better response generation."""

    user_name: Optional[str] = None
    conversation_topic: Optional[str] = None
    user_expertise_level: str = "intermediate"  # beginner, intermediate, expert
    preferred_response_style: str = "balanced"  # concise, balanced, detailed
    conversation_mood: str = "neutral"  # casual, professional, neutral
    key_entities: List[str] = None
    previous_topics: List[str] = None

    def __post_init__(self):
        if self.key_entities is None:
            self.key_entities = []
        if self.previous_topics is None:
            self.previous_topics = []


class ContextManagerNode(BaseGraphNode):
    """
    Manages conversation context and history.
    Extracts relevant information from previous messages.
    """

    def __init__(self, cache_manager=None):
        super().__init__("context_manager", NodeType.PROCESSING)
        self.cache_manager = cache_manager

    async def execute(self, state: GraphState, **kwargs) -> NodeResult:
        logger.debug(
            f"[ContextManagerNode] Enter execute. state.query_id={getattr(state, 'query_id', None)}"
        )
        try:
            # Create conversation context
            context = ConversationContext()

            # Analyze conversation history if available
            if state.conversation_history:
                # Extract patterns and preferences
                context.user_expertise_level = self._infer_expertise_level(
                    state.conversation_history
                )
                context.preferred_response_style = self._infer_response_style(
                    state.conversation_history
                )
                context.conversation_mood = self._infer_conversation_mood(
                    state.conversation_history
                )

            # Store processed query
            state.processed_query = state.original_query

            # Store context in state
            state.intermediate_results["conversation_context"] = context.__dict__

            logger.debug(
                f"[ContextManagerNode] Success. state.query_id={getattr(state, 'query_id', None)}"
            )
            return NodeResult(
                success=True,
                data={"context": context.__dict__},
                confidence=0.8,
                execution_time=0.1,
            )

        except Exception as e:
            logger.error(f"[ContextManagerNode] Error: {e}")
            return NodeResult(
                success=False,
                error=f"Context management failed: {str(e)}",
                execution_time=0.1,
            )

    def _infer_expertise_level(self, history: List[Dict]) -> str:
        """Infer user expertise level from conversation history."""
        # Simple heuristic - count technical terms
        technical_terms = 0
        total_words = 0

        for msg in history[-5:]:  # Last 5 messages
            if msg.get("role") == "user":
                content = msg.get("content", "").lower()
                words = content.split()
                total_words += len(words)

                # Count technical indicators
                for word in words:
                    if len(word) > 8 or word in [
                        "algorithm",
                        "implementation",
                        "architecture",
                    ]:
                        technical_terms += 1

        if total_words == 0:
            return "intermediate"

        ratio = technical_terms / total_words
        if ratio > 0.1:
            return "expert"
        elif ratio > 0.05:
            return "intermediate"
        else:
            return "beginner"

    def _infer_response_style(self, history: List[Dict]) -> str:
        """Infer preferred response style from conversation history."""
        # Default to balanced
        return "balanced"

    def _infer_conversation_mood(self, history: List[Dict]) -> str:
        """Infer conversation mood from recent messages."""
        # Default to neutral
        return "neutral"


class IntentClassifierNode(BaseGraphNode):
    """
    Classifies user intent and determines optimal processing path.
    """

    def __init__(self, model_manager: ModelManager):
        super().__init__("intent_classifier", NodeType.PROCESSING)
        self.model_manager = model_manager

    async def execute(self, state: GraphState, **kwargs) -> NodeResult:
        import time
        import asyncio

        start_time = time.time()
        correlation_id = getattr(state, 'query_id', None)
        logger.debug(
            f"[IntentClassifierNode] ENTER: {start_time} state.query_id={correlation_id}"
        )
        try:
            query = state.processed_query or state.original_query
            model_name = self.model_manager.select_optimal_model(
                TaskType.SIMPLE_CLASSIFICATION, QualityLevel.MINIMAL
            )
            classification_prompt = f"Classify this query intent: '{query}'\nReturn only one word: question, creative, analysis, code, request, or conversation"
            timeout = 5.0
            logger.debug(
                f"[IntentClassifierNode] About to call model: {model_name} with timeout: {timeout}s | prompt_len={len(classification_prompt)} | correlation_id={correlation_id}"
            )
            # Non-blocking health check before model call
            health_ok = False
            try:
                # Use asyncio.create_task to make health check non-blocking
                health_task = asyncio.create_task(self.model_manager.ollama_client.health_check())
                health_ok = await asyncio.wait_for(health_task, timeout=1.0)
            except (asyncio.TimeoutError, Exception) as health_exc:
                logger.debug(f"[IntentClassifierNode] Ollama health check failed/timeout: {health_exc} | correlation_id={correlation_id}")
                # Don't fail the request, just skip to fallback
                health_ok = False
            if not health_ok:
                logger.warning(f"[IntentClassifierNode] Ollama unhealthy, falling back to rule-based | correlation_id={correlation_id}")
                intent = self._classify_intent_rule_based(query)
                classification_method = "rule_based_healthcheck"
            else:
                try:
                    model_start = time.time()
                    try:
                        logger.debug(f"[IntentClassifierNode] BEFORE ModelManager.generate {time.time()} | correlation_id={correlation_id}")
                        result = await asyncio.wait_for(
                            self.model_manager.generate(
                                model_name=model_name,
                                prompt=classification_prompt,
                                max_tokens=10,
                                temperature=0.1,
                            ),
                            timeout=timeout,
                        )
                        logger.debug(f"[IntentClassifierNode] AFTER ModelManager.generate {time.time()} | correlation_id={correlation_id}", result=str(result))
                        elapsed = time.time() - model_start
                        logger.debug(
                            f"[IntentClassifierNode] Model call completed in {elapsed:.2f}s | correlation_id={correlation_id}"
                        )
                        if result.success:
                            intent = result.text.strip().lower()
                            if intent in [
                                "question",
                                "creative",
                                "analysis",
                                "code",
                                "request",
                                "conversation",
                            ]:
                                classification_method = "model_based"
                            else:
                                intent = self._classify_intent_rule_based(query)
                                classification_method = "rule_based_fallback"
                        else:
                            logger.error(f"[IntentClassifierNode] Model call failed: {result.error} | correlation_id={correlation_id}")
                            intent = self._classify_intent_rule_based(query)
                            classification_method = "rule_based"
                    except asyncio.TimeoutError:
                        elapsed = time.time() - model_start
                        logger.error(f"[IntentClassifierNode] Model call timed out after {timeout}s, falling back to rule-based | prompt_len={len(classification_prompt)} | model={model_name} | elapsed={elapsed:.2f}s | correlation_id={correlation_id}")
                        intent = self._classify_intent_rule_based(query)
                        classification_method = "rule_based_timeout"
                    except Exception as e:
                        elapsed = time.time() - model_start
                        logger.error(f"[IntentClassifierNode] Model call failed: {e}, falling back to rule-based | prompt_len={len(classification_prompt)} | model={model_name} | elapsed={elapsed:.2f}s | correlation_id={correlation_id}")
                        intent = self._classify_intent_rule_based(query)
                        classification_method = "rule_based"
                except Exception as e:
                    logger.error(f"[IntentClassifierNode] Model call outer exception: {e} | correlation_id={correlation_id}")
                    intent = self._classify_intent_rule_based(query)
                    classification_method = "rule_based"
            complexity = self._calculate_complexity(query)
            state.query_intent = intent
            state.query_complexity = complexity
            logger.debug(
                f"[IntentClassifierNode] Success. state.query_id={correlation_id} intent={intent} method={classification_method}"
            )
            duration = time.time() - start_time
            logger.debug(
                f"[IntentClassifierNode] EXIT: {time.time()} duration={duration}"
            )
            return NodeResult(
                success=True,
                data={
                    "intent": intent,
                    "complexity": complexity,
                    "classification_method": classification_method,
                },
                confidence=0.7,
                execution_time=duration,
            )
        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"[IntentClassifierNode] Error: {e} | correlation_id={correlation_id}")
            logger.debug(
                f"[IntentClassifierNode] EXIT (error): {time.time()} duration={duration}"
            )
            return NodeResult(
                success=False,
                error=f"Intent classification failed: {str(e)}",
                execution_time=duration,
            )

    def _classify_intent_rule_based(self, query: str) -> str:
        query_lower = query.lower()
        code_terms = ["python", "function", "debug", "code", "script", "programming"]
        code_matches = sum(1 for term in code_terms if term in query_lower)
        if code_matches >= 2:
            return "code"
        elif any(
            term in query_lower
            for term in ["debug this python", "python function", "function code"]
        ):
            return "code"
        elif any(
            word in query_lower for word in ["how", "what", "why", "when", "where"]
        ):
            return "question"
        elif any(
            word in query_lower for word in ["create", "generate", "write", "make"]
        ):
            return "creative"
        elif any(word in query_lower for word in ["analyze", "compare", "evaluate"]):
            return "analysis"
        elif any(word in query_lower for word in ["help", "can you", "please"]):
            return "request"
        else:
            return "conversation"

    def _calculate_complexity(self, query: str) -> float:
        """Calculate query complexity score (0.0 to 1.0)."""
        words = query.split()
        word_count = len(words)
        base_complexity = min(word_count / 50, 0.7)
        complex_indicators = [
            "analyze",
            "compare",
            "comprehensive",
            "detailed",
            "research",
        ]
        if any(indicator in query.lower() for indicator in complex_indicators):
            base_complexity += 0.2
        return min(base_complexity, 1.0)


class ResponseGeneratorNode(BaseGraphNode):
    """
    Generates responses using the optimal model based on context and intent.
    """

    def __init__(self, model_manager: ModelManager):
        super().__init__("response_generator", NodeType.PROCESSING)
        self.model_manager = model_manager

    def _determine_task_type(self, state):
        """
        Maps state.query_intent to a TaskType enum or string as expected by ModelManager.
        """
        # Example mapping, adjust as needed for your TaskType enum
        intent = getattr(state, 'query_intent', None)
        if not intent:
            return "general"
        mapping = {
            "conversation": "general",
            "question": "qa",
            "code": "code",
            "analysis": "analysis",
            "summarization": "summarization",
            # Add more as needed
        }
        return mapping.get(intent, "general")

    def _select_model(self, state):
        """
        Selects the optimal model using ModelManager based on task type and quality requirement.
        """
        task_type = self._determine_task_type(state)
        quality = getattr(state, 'quality_requirement', None)
        # Fallback to default if not set
        if not quality:
            quality = "balanced"
        # ModelManager should handle unknown task_type/quality gracefully
        return self.model_manager.select_optimal_model(task_type, quality)

    def _build_prompt(self, state: GraphState) -> str:
        """
        Build a comprehensive prompt for response generation based on conversation state.
        """
        query = state.processed_query or state.original_query
        intent = getattr(state, 'query_intent', 'conversation')
        complexity = getattr(state, 'query_complexity', 0.5)
        quality = getattr(state, 'quality_requirement', 'balanced')
        system_instructions = self._get_system_instructions(intent, quality)
        context_section = self._build_conversation_context(state)
        query_section = self._build_query_section(query, intent, complexity)
        prompt_parts = [
            system_instructions,
            context_section,
            query_section
        ]
        prompt = "\n\n".join(part for part in prompt_parts if part.strip())
        return prompt

    def _get_system_instructions(self, intent: str, quality: str) -> str:
        base_instruction = "You are a helpful, knowledgeable, and friendly AI assistant."
        intent_instructions = {
            'code': "You specialize in programming and technical problem-solving. Provide clear, working code examples with explanations.",
            'creative': "You excel at creative writing and imaginative tasks. Be expressive, engaging, and original in your responses.",
            'analysis': "You are skilled at analytical thinking and detailed examination. Provide thorough, well-reasoned analysis with supporting evidence.",
            'question': "You provide clear, accurate answers to questions. Be informative and comprehensive while staying focused on the question.",
            'request': "You help users accomplish tasks and fulfill requests. Be practical, actionable, and solution-oriented.",
            'conversation': "You engage in natural, friendly conversation. Be personable while remaining helpful and informative."
        }
        quality_adjustments = {
            'minimal': "Keep your response concise and to the point.",
            'balanced': "Provide a well-balanced response with appropriate detail.",
            'premium': "Provide a comprehensive, detailed response with thorough explanations and examples."
        }
        instructions = [base_instruction]
        if intent in intent_instructions:
            instructions.append(intent_instructions[intent])
        if quality in quality_adjustments:
            instructions.append(quality_adjustments[quality])
        return " ".join(instructions)

    def _build_conversation_context(self, state: GraphState) -> str:
        conversation_history = getattr(state, 'conversation_history', [])
        if not conversation_history:
            return ""
        context_lines = ["Previous conversation:"]
        recent_history = conversation_history[-10:] if len(conversation_history) > 10 else conversation_history
        for entry in recent_history:
            role = entry.get('role', 'unknown')
            content = entry.get('content', '')
            if role == 'user':
                context_lines.append(f"User: {content}")
            elif role == 'assistant':
                context_lines.append(f"Assistant: {content}")
        return "\n".join(context_lines)

    def _build_query_section(self, query: str, intent: str, complexity: float) -> str:
        query_lines = [
            f"Current query (intent: {intent}, complexity: {complexity:.1f}):",
            query
        ]
        return "\n".join(query_lines)

    def _calculate_max_tokens(self, state: GraphState) -> int:
        """
        Calculate the maximum number of tokens for response generation based on
        query intent, complexity, quality requirements, and specific use cases.
        """
        intent = getattr(state, 'query_intent', 'conversation')
        complexity = getattr(state, 'query_complexity', 0.5)
        quality = getattr(state, 'quality_requirement', 'balanced')
        query = (state.processed_query or state.original_query).lower()
        if intent == 'analysis' and any(term in query for term in [
            'candidate analysis', 'interview script', 'interview questions',
            'candidate evaluation', 'interview preparation', 'screening questions',
            'behavioral interview', 'technical interview', 'interview guide']):
            return self._get_candidate_interview_tokens(quality)
        elif intent == 'analysis' and ('resume' in query or 'cv' in query or 'curriculum vitae' in query):
            return self._get_resume_analysis_tokens(quality)
        elif intent == 'analysis' and any(term in query for term in ['analyze', 'review', 'evaluation', 'assessment']):
            return self._get_document_analysis_tokens(quality)
        elif intent == 'code':
            return self._get_code_tokens(quality, complexity)
        elif intent == 'creative':
            return self._get_creative_tokens(quality, complexity)
        else:
            return self._get_standard_tokens(quality, complexity)

    def _get_candidate_interview_tokens(self, quality: str) -> int:
        interview_limits = {
            'minimal': 5000,
            'balanced': 10000,
            'premium': 15000
        }
        return interview_limits.get(quality, 10000)

    def _get_resume_analysis_tokens(self, quality: str) -> int:
        resume_limits = {
            'minimal': 2000,
            'balanced': 5000,
            'premium': 8000
        }
        return resume_limits.get(quality, 5000)

    def _get_document_analysis_tokens(self, quality: str) -> int:
        analysis_limits = {
            'minimal': 800,
            'balanced': 1500,
            'premium': 2500
        }
        return analysis_limits.get(quality, 1500)

    def _get_code_tokens(self, quality: str, complexity: float) -> int:
        base_limits = {
            'minimal': 400,
            'balanced': 800,
            'premium': 1200
        }
        base_limit = base_limits.get(quality, 800)
        if complexity >= 0.8:
            return int(base_limit * 1.5)
        elif complexity >= 0.6:
            return int(base_limit * 1.25)
        else:
            return base_limit

    def _get_creative_tokens(self, quality: str, complexity: float) -> int:
        base_limits = {
            'minimal': 300,
            'balanced': 600,
            'premium': 1000
        }
        base_limit = base_limits.get(quality, 600)
        if complexity >= 0.7:
            return int(base_limit * 1.4)
        elif complexity >= 0.5:
            return int(base_limit * 1.2)
        else:
            return base_limit

    def _get_standard_tokens(self, quality: str, complexity: float) -> int:
        base_limits = {
            'minimal': 256,
            'balanced': 512,
            'premium': 1024
        }
        base_limit = base_limits.get(quality, 512)
        if complexity >= 0.8:
            return int(base_limit * 1.5)
        elif complexity >= 0.4:
            return int(base_limit * 1.25)
        else:
            return base_limit

    def _calculate_temperature(self, state: GraphState) -> float:
        """
        Calculate the temperature parameter for model generation based on intent and quality.
        """
        intent = getattr(state, 'query_intent', 'conversation')
        quality = getattr(state, 'quality_requirement', 'balanced')
        intent_temperatures = {
            'code': 0.1,
            'analysis': 0.2,
            'question': 0.3,
            'request': 0.4,
            'conversation': 0.6,
            'creative': 0.8
        }
        base_temp = intent_temperatures.get(intent, 0.5)
        if quality == 'minimal':
            return max(0.1, base_temp - 0.1)
        elif quality == 'premium':
            return min(0.9, base_temp + 0.1)
        else:
            return base_temp

    def _post_process_response(self, response_text: str, state: GraphState) -> str:
        """
        Clean and post-process the raw model output before returning to the user.
        - Strips leading/trailing whitespace and newlines.
        - Optionally, can add more advanced sanitization or formatting here.
        """
        if not response_text:
            return ""
        cleaned = response_text.strip()
        # Optionally, truncate to a max length if needed (e.g., 4096 chars)
        max_length = 4096
        if len(cleaned) > max_length:
            cleaned = cleaned[:max_length].rstrip() + "..."
        return cleaned

    async def execute(self, state: GraphState, **kwargs) -> NodeResult:
        import time
        import asyncio

        start_time = time.time()
        correlation_id = getattr(state, 'query_id', None)
        logger.debug(
            f"[ResponseGeneratorNode] ENTER: {start_time} state.query_id={correlation_id}"
        )
        try:
            model_name = self._select_model(state)
            prompt = self._build_prompt(state)
            max_tokens = self._calculate_max_tokens(state)
            temperature = self._calculate_temperature(state)
            timeout = 60.0
            logger.debug(
                f"[ResponseGeneratorNode] About to call model: {model_name} with timeout: {timeout}s",
                prompt=prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                query_id=correlation_id,
            )
            health_ok = False
            try:
                health_ok = await asyncio.wait_for(self.model_manager.ollama_client.health_check(), timeout=1.0)
            except Exception as health_exc:
                logger.error(f"[ResponseGeneratorNode] Ollama health check failed: {health_exc} | correlation_id={correlation_id}")
            if not health_ok:
                logger.warning(f"[ResponseGeneratorNode] Ollama unhealthy, falling back to safe response | correlation_id={correlation_id}")
                fallback_response = "I'm having trouble generating a response right now."
                state.final_response = fallback_response
                logger.debug(f"[ResponseGeneratorNode] FAILURE PATH: state.final_response = '{state.final_response}'")
                duration = time.time() - start_time
                logger.debug(f"[ResponseGeneratorNode] EXIT (healthcheck fail): {time.time()} duration={duration}")
                return NodeResult(
                    success=False,
                    data={"response": fallback_response},
                    error="Ollama health check failed.",
                    execution_time=duration,
                    cost=0.0,
                )
            try:
                model_start = time.time()
                try:
                    logger.debug(f"[ResponseGeneratorNode] BEFORE ModelManager.generate {time.time()} | correlation_id={correlation_id}")
                    result = await asyncio.wait_for(
                        self.model_manager.generate(
                            model_name=model_name,
                            prompt=prompt,
                            max_tokens=max_tokens,
                            temperature=temperature,
                        ),
                        timeout=timeout,
                    )
                    logger.debug(f"[ResponseGeneratorNode] AFTER ModelManager.generate {time.time()} | correlation_id={correlation_id}", result=str(result))
                    elapsed = time.time() - model_start
                    logger.debug(f"[ResponseGeneratorNode] Model call completed in {elapsed:.2f}s | correlation_id={correlation_id}")
                except asyncio.TimeoutError:
                    elapsed = time.time() - model_start
                    logger.error(f"[ResponseGeneratorNode] Model call timed out after {timeout}s, falling back to safe response | prompt_len={len(prompt)} | model={model_name} | elapsed={elapsed:.2f}s | correlation_id={correlation_id}")
                    result = None
                except Exception as e:
                    elapsed = time.time() - model_start
                    logger.error(f"[ResponseGeneratorNode] Model call failed: {e}, falling back to safe response | prompt_len={len(prompt)} | model={model_name} | elapsed={elapsed:.2f}s | correlation_id={correlation_id}")
                    result = None
                logger.debug(
                    "[ResponseGeneratorNode] Raw model response",
                    model_name=model_name,
                    raw_response=getattr(result, 'text', None) if result else None,
                    success=getattr(result, 'success', None) if result else None,
                    error=getattr(result, 'error', None) if result else None,
                    query_id=correlation_id,
                )
                if result and result.success:
                    logger.debug(
                        "[ResponseGeneratorNode] Diagnostic: About to post-process response",
                        raw_model_response=getattr(result, 'text', None),
                        query_id=correlation_id,
                    )
                    response = self._post_process_response(result.text, state)
                    state.final_response = response
                    logger.debug(f"[ResponseGeneratorNode] SUCCESS PATH: state.final_response = '{state.final_response}'")
                    logger.debug(
                        "[ResponseGeneratorNode] Diagnostic: After post-processing",
                        post_processed_response=response,
                        query_id=correlation_id,
                    )
                    logger.debug(
                        "[ResponseGeneratorNode] Diagnostic: Assigned to state.final_response",
                        final_response=state.final_response,
                        query_id=correlation_id,
                    )
                    logger.debug(
                        "[ResponseGeneratorNode] Final response before returning to API",
                        final_response=response,
                        query_id=correlation_id,
                    )
                    logger.debug(
                        f"[ResponseGeneratorNode] Success. state.query_id={correlation_id}"
                    )
                    duration = time.time() - start_time
                    logger.debug(f"[ResponseGeneratorNode] EXIT: {time.time()} duration={duration}")
                    logger.debug(f"[ResponseGeneratorNode] SETTING state.final_response = {state.final_response}")
                    return NodeResult(
                        success=True,
                        data={"response": response},
                        confidence=0.8,
                        execution_time=result.execution_time,
                        cost=result.cost,
                        model_used=model_name,
                    )
                else:
                    fallback_response = (
                        "I'm having trouble generating a response right now."
                    )
                    state.final_response = fallback_response
                    logger.debug(f"[ResponseGeneratorNode] FAILURE PATH: state.final_response = '{state.final_response}'")
                    duration = time.time() - start_time
                    logger.debug(f"[ResponseGeneratorNode] EXIT (model failure): {time.time()} duration={duration}")
                    logger.debug(f"[ResponseGeneratorNode] SETTING state.final_response = {state.final_response}")
                    return NodeResult(
                        success=False,
                        data={"response": fallback_response},
                        error="Model generation failed or timed out.",
                        execution_time=result.execution_time if result else elapsed,
                        cost=result.cost if result else 0.0,
                    )
            except Exception as e:
                fallback_response = "I encountered an error. Please try again."
                state.final_response = fallback_response
                logger.debug(f"[ResponseGeneratorNode] EXCEPTION PATH: state.final_response = '{state.final_response}'")
                logger.error(f"[ResponseGeneratorNode] Error: {e}")
                duration = time.time() - start_time
                logger.debug(f"[ResponseGeneratorNode] EXIT (error): {time.time()} duration={duration}")
                logger.debug(f"[ResponseGeneratorNode] SETTING state.final_response = {state.final_response}")
                return NodeResult(
                    success=False,
                    data={"response": fallback_response},
                    error=f"Response generation failed: {str(e)}",
                    execution_time=duration,
                    cost=0.0,
                )
        except Exception as e:
            fallback_response = "I encountered an error. Please try again."
            state.final_response = fallback_response
            logger.debug(f"[ResponseGeneratorNode] EXCEPTION PATH: state.final_response = '{state.final_response}'")
            logger.error(f"[ResponseGeneratorNode] Error: {e}")
            duration = time.time() - start_time
            logger.debug(f"[ResponseGeneratorNode] EXIT (error): {time.time()} duration={duration}")
            logger.debug(f"[ResponseGeneratorNode] SETTING state.final_response = {state.final_response}")
            return NodeResult(
                success=False,
                data={"response": fallback_response},
                error=f"Response generation failed: {str(e)}",
                execution_time=duration,
                cost=0.0,
            )


class CacheUpdateNode(BaseGraphNode):
    """
    Updates conversation cache and learns from successful interactions.
    """

    def __init__(self, cache_manager=None):
        super().__init__("cache_update", NodeType.PROCESSING)
        self.cache_manager = cache_manager

    async def execute(self, state: GraphState, **kwargs) -> NodeResult:
        """Update conversation cache with current state."""
        logger.debug(
            f"[CacheUpdateNode] Enter execute. state.query_id={getattr(state, 'query_id', None)}"
        )

        try:
            if not self.cache_manager:
                # No cache manager - skip caching
                return NodeResult(
                    success=True,
                    data={"cached": False, "reason": "no_cache_manager"},
                    confidence=1.0,
                    execution_time=0.01,
                )

            session_id = getattr(state, "session_id", None)
            if not session_id:
                # No session ID - skip caching
                return NodeResult(
                    success=True,
                    data={"cached": False, "reason": "no_session_id"},
                    confidence=1.0,
                    execution_time=0.01,
                )

            # Prepare conversation entry
            conversation_entry = {
                "user_message": getattr(state, "original_query", None),
                "assistant_response": getattr(state, "final_response", None),
                "query_id": getattr(state, "query_id", None),
                "timestamp": datetime.now().isoformat(),
                "intent": getattr(state, "query_intent", "unknown"),
                "complexity": getattr(state, "query_complexity", 0.0),
                "total_cost": state.calculate_total_cost()
                if hasattr(state, "calculate_total_cost")
                else None,
                "execution_time": state.calculate_total_time()
                if hasattr(state, "calculate_total_time")
                else None,
                "models_used": [
                    result["result"].model_used
                    for result in getattr(state, "node_results", {}).values()
                    if hasattr(result["result"], "model_used")
                ],
            }

            # Cache conversation history
            history_key = f"conversation_history:{session_id}"
            try:
                # Get existing history
                existing_history = await self.cache_manager.get(history_key, [])
                if not isinstance(existing_history, list):
                    existing_history = []

                # Add new entry
                existing_history.append(conversation_entry)

                # Keep only last 50 entries
                if len(existing_history) > 50:
                    existing_history = existing_history[-50:]

                # Save updated history (TTL: 7 days)
                await self.cache_manager.set(history_key, existing_history, ttl=604800)

            except Exception as cache_error:
                logger.warning(f"Failed to cache conversation history: {cache_error}")

            # Cache user context and preferences
            context_key = f"user_context:{session_id}"
            try:
                user_context = state.intermediate_results.get(
                    "conversation_context", {}
                )
                if user_context:
                    # Update with current interaction
                    user_context["last_interaction"] = datetime.now().isoformat()
                    user_context["total_interactions"] = (
                        user_context.get("total_interactions", 0) + 1
                    )

                    # Save context (TTL: 30 days)
                    await self.cache_manager.set(context_key, user_context, ttl=2592000)

            except Exception as context_error:
                logger.warning(f"Failed to cache user context: {context_error}")

            # Cache query patterns for analytics
            pattern_key = f"query_pattern:{getattr(state, 'query_intent', 'unknown')}"
            try:
                pattern_data = {
                    # Truncated for privacy
                    "query": getattr(state, "original_query", "")[:100],
                    "intent": getattr(state, "query_intent", "unknown"),
                    "complexity": getattr(state, "query_complexity", 0.0),
                    "timestamp": datetime.now().isoformat(),
                    "success": bool(getattr(state, "final_response", None)),
                    "cost": state.calculate_total_cost()
                    if hasattr(state, "calculate_total_cost")
                    else None,
                }

                # Get existing patterns
                existing_patterns = await self.cache_manager.get(pattern_key, [])
                if not isinstance(existing_patterns, list):
                    existing_patterns = []

                existing_patterns.append(pattern_data)

                # Keep only last 100 patterns per intent
                if len(existing_patterns) > 100:
                    existing_patterns = existing_patterns[-100:]

                # Save patterns (TTL: 90 days)
                await self.cache_manager.set(
                    pattern_key, existing_patterns, ttl=7776000
                )

            except Exception as pattern_error:
                logger.warning(f"Failed to cache query patterns: {pattern_error}")

            logger.debug(
                f"[CacheUpdateNode] Success. state.query_id={getattr(state, 'query_id', None)}"
            )

            return NodeResult(
                success=True,
                data={
                    "cached": True,
                    "conversation_cached": True,
                    "context_cached": bool(
                        state.intermediate_results.get("conversation_context")
                    ),
                    "patterns_cached": True,
                },
                confidence=1.0,
                execution_time=0.05,
            )

        except Exception as e:
            logger.error(f"[CacheUpdateNode] Error: {e}")
            return NodeResult(
                success=False,
                error=f"Cache update failed: {str(e)}",
                execution_time=0.05,
            )


class ErrorHandlerNode(BaseGraphNode):
    """
    Handles errors and provides fallback responses.
    """

    def __init__(self):
        super().__init__("error_handler", NodeType.PROCESSING)
        self.max_executions = 3  # Prevent infinite loops

    async def execute(self, state: GraphState, **kwargs) -> NodeResult:
        logger.debug(
            f"[ErrorHandlerNode] Enter execute. state.query_id={getattr(state, 'query_id', None)}"
        )
        try:
            error_handler_count = state.execution_path.count("error_handler")
            if error_handler_count >= self.max_executions:
                if not state.final_response:
                    state.final_response = "I'm experiencing technical difficulties. Please try again later."
                logger.warning(
                    f"[ErrorHandlerNode] Circuit breaker triggered. count={error_handler_count}"
                )
                return NodeResult(
                    success=True,
                    data={
                        "errors_handled": len(state.errors),
                        "circuit_breaker_triggered": True,
                    },
                    confidence=0.1,
                    execution_time=0.01,
                )
            if not state.final_response:
                state.final_response = (
                    "I apologize, but I encountered some issues while processing "
                    "your request. Please try rephrasing your question or try again later."
                )
            if len(state.errors) > 5:
                state.errors = state.errors[-3:]
            logger.debug(
                f"[ErrorHandlerNode] Success. state.query_id={getattr(state, 'query_id', None)}"
            )
            return NodeResult(
                success=True,
                data={"errors_handled": len(state.errors)},
                confidence=0.3,
                execution_time=0.01,
            )
        except Exception as e:
            logger.error(f"[ErrorHandlerNode] Error: {e}")
            if not state.final_response:
                state.final_response = "Technical error occurred. Please try again."
            return NodeResult(
                success=True,
                error=f"Error handler failed: {str(e)}",
                execution_time=0.01,
            )


class ChatGraph(BaseGraph):
    """
    Main chat graph implementation for intelligent conversation management.

    Fixed to properly use LangGraph START/END constants and correct compilation order.
    """

    def __init__(self, model_manager: ModelManager, cache_manager=None):
        super().__init__(GraphType.CHAT, "chat_graph")
        self.model_manager = model_manager
        self.cache_manager = cache_manager
        self.execution_stats = {
            "total_executions": 0,
            "successful_executions": 0,
            "total_execution_time": 0.0,
            "node_stats": {},
        }
        # Automatically build the graph
        self.build()

    def get_performance_stats(self) -> Dict[str, Any]:
        stats = self.execution_stats.copy()
        total_exec = stats["total_executions"]
        if total_exec > 0:
            stats["success_rate"] = stats["successful_executions"] / total_exec
            stats["avg_execution_time"] = stats["total_execution_time"] / total_exec
        else:
            stats["success_rate"] = 0.0
            stats["avg_execution_time"] = 0.0
        for node_name, node_stats in stats["node_stats"].items():
            if node_stats["executions"] > 0:
                node_stats["success_rate"] = (
                    node_stats["success"] / node_stats["executions"]
                )
                node_stats["avg_execution_time"] = (
                    node_stats["total_time"] / node_stats["executions"]
                )
            else:
                node_stats["success_rate"] = 0.0
                node_stats["avg_execution_time"] = 0.0
        return {
            "graph_name": self.name,
            "graph_type": self.graph_type.value,
            "execution_count": total_exec,
            "success_rate": stats["success_rate"],
            "avg_execution_time": stats["avg_execution_time"],
            "total_execution_time": stats["total_execution_time"],
            "node_count": len(self.nodes),
            "node_stats": stats["node_stats"],
        }

    def define_nodes(self) -> Dict[str, BaseGraphNode]:
        """Define all nodes for the chat graph."""
        from app.graphs.base import EndNode

        return {
            "start": ContextManagerNode(self.cache_manager),  # Entrypoint for LangGraph
            "context_manager": ContextManagerNode(self.cache_manager),
            "intent_classifier": IntentClassifierNode(self.model_manager),
            "response_generator": ResponseGeneratorNode(self.model_manager),
            "cache_update": CacheUpdateNode(self.cache_manager),
            "error_handler": ErrorHandlerNode(),
            "end": EndNode(),  # Add end node for LangGraph termination
        }

    def define_edges(self) -> List[tuple]:
        """
        Define the flow between nodes using descriptive node keys.
        """
        return [
            ("start", "context_manager"),  # Entry edge for LangGraph
            ("context_manager", "intent_classifier"),
            ("intent_classifier", "response_generator"),
            ("response_generator", "cache_update"),
            (
                "cache_update",
                self._check_for_errors,
                {
                    "error_handler": "error_handler",
                    "continue": "end",  # End the graph if no error or circuit breaker
                },
            ),
            ("error_handler", "end"),  # End after error handling
            # If more terminal nodes are added in the future, ensure they also route to 'end'
        ]

    def _check_for_errors(self, state: GraphState) -> str:
        """Check if there are errors that need handling - prevent infinite loops."""
        # Circuit breaker: if execution path is too long, force end
        if hasattr(state, 'execution_path') and len(state.execution_path) > 15:
            logger.error(f"[ChatGraph] Circuit breaker tripped: execution_path too long ({len(state.execution_path)}). Forcing end.")
            return "continue"  # Will route to 'end' in define_edges
        if state.errors and "error_handler" not in state.execution_path:
            return "error_handler"
        return "continue"

    def build(self) -> None:
        """Build the chat graph with conditional routing."""
        # Check if already built to prevent double compilation
        if hasattr(self, '_compiled') and self._compiled:
            logger.debug("Graph already built, skipping compilation")
            return
        
        # Call parent build which will handle START/END properly
        # This will compile the graph, so no modifications after this point
        super().build()
        self._compiled = True

    async def execute(self, state: GraphState) -> GraphState:
        import time
        start_time = time.time()
        logger.debug(
            f"[ChatGraph] ENTER execute: {start_time} state.query_id={getattr(state, 'query_id', None)}"
        )
        self.execution_stats["total_executions"] += 1
        try:
            result = await super().execute(state)
            logger.debug(
                f"[ChatGraph] Success. state.query_id={getattr(state, 'query_id', None)}"
            )
            logger.debug(f"[ChatGraph] AFTER GRAPH EXECUTION: result.final_response = '{getattr(result, 'final_response', 'MISSING')}'")
            if len(result.errors) <= 2:
                self.execution_stats["successful_executions"] += 1
            for node_name in result.execution_path:
                if node_name not in self.execution_stats["node_stats"]:
                    self.execution_stats["node_stats"][node_name] = {
                        "executions": 0,
                        "success": 0,
                        "total_time": 0.0,
                    }
                node_stats = self.execution_stats["node_stats"][node_name]
                node_stats["executions"] += 1
                if node_name in result.node_results:
                    node_result = result.node_results[node_name]["result"]
                    if node_result.success:
                        node_stats["success"] += 1
                    node_stats["total_time"] += node_result.execution_time
            execution_time = time.time() - start_time
            self.execution_stats["total_execution_time"] += execution_time
            if not getattr(result, "final_response", None):
                logger.error(f"[ChatGraph] Missing final_response after graph execution! state.query_id={getattr(state, 'query_id', None)} | node_results={getattr(result, 'node_results', {})}")
                # Try to recover from response_generator node specifically
                logger.debug(f"[ChatGraph] Attempting recovery - checking for response_generator in node_results")
                if "response_generator" in result.node_results:
                    logger.debug(f"[ChatGraph] Found response_generator node")
                    node_result = result.node_results["response_generator"]["result"]
                    logger.debug(f"[ChatGraph] response_generator node_result: {node_result}")
                    response = node_result.data.get("response") if node_result and hasattr(node_result, 'data') else None
                    logger.debug(f"[ChatGraph] Extracted response: {response}")
                    if response:
                        result.final_response = response
                        logger.warning(f"[ChatGraph] ✅ RECOVERED final_response from response_generator: {response[:100]}...")
                    else:
                        logger.error(f"[ChatGraph] ❌ No response found in response_generator data")
                # If that doesn't work, try the last node as fallback
                else:
                    logger.debug(f"[ChatGraph] response_generator not found in node_results, trying last node")
                    last_node = result.execution_path[-1] if result.execution_path else None
                    if last_node and last_node in result.node_results:
                        node_result = result.node_results[last_node]["result"]
                        response = node_result.data.get("response") if node_result and hasattr(node_result, 'data') else None
                        if response:
                            result.final_response = response
                            logger.warning(f"[ChatGraph] Recovered final_response from last node result: {response}")
            logger.debug(f"[ChatGraph] EXIT execute: {time.time()} duration={execution_time}")
            return result
        except Exception as e:
            logger.error(f"[ChatGraph] Error: {e}")
            execution_time = time.time() - start_time
            self.execution_stats["total_execution_time"] += execution_time
            logger.debug(f"[ChatGraph] EXIT execute (error): {time.time()} duration={execution_time}")
            state.errors.append(f"Graph execution failed: {str(e)}")
            return state


# Export main classes
__all__ = [
    "ChatGraph",
    "ContextManagerNode",
    "IntentClassifierNode",
    "ResponseGeneratorNode",
    "CacheUpdateNode",
    "ConversationContext",
    "ErrorHandlerNode",
]
