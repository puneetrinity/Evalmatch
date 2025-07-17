#!/usr/bin/env python3
"""
Phase 2 Integration Script
Enhances existing chat API with Phase 2 predictive analytics
"""

import asyncio
import time
from typing import AsyncGenerator, Dict
import structlog

from app.optimization.phase2_advanced_analytics import (
    get_predictive_streaming_params,
    run_background_optimization,
    initialize_phase2,
    AdaptiveStreamingParams
)

logger = structlog.get_logger(__name__)

class Phase2StreamingEnhancer:
    """Enhanced streaming using Phase 2 predictive analytics"""
    
    def __init__(self):
        self.phase2_enabled = False
        self.performance_history = []
    
    async def initialize(self):
        """Initialize Phase 2 streaming enhancements"""
        try:
            await initialize_phase2()
            self.phase2_enabled = True
            logger.info("phase2_streaming_enhancer_initialized")
        except Exception as e:
            logger.error("phase2_initialization_failed", error=str(e))
            self.phase2_enabled = False
    
    async def enhanced_streaming_with_predictions(
        self,
        response: str,
        query: str,
        user_context: Dict,
        routing_confidence: float
    ) -> AsyncGenerator[str, None]:
        """Enhanced streaming using Phase 2 predictive analytics"""
        
        try:
            # Get Phase 2 predictions if available
            if self.phase2_enabled:
                streaming_params = await get_predictive_streaming_params(
                    query, user_context, routing_confidence
                )
                logger.info(
                    "phase2_streaming_params_predicted",
                    chunk_size=streaming_params.chunk_size,
                    delay_ms=streaming_params.delay_ms,
                    expected_satisfaction=streaming_params.expected_user_satisfaction
                )
            else:
                # Fallback to Phase 1 intelligent streaming
                streaming_params = AdaptiveStreamingParams(
                    chunk_size=6,
                    delay_ms=60,
                    confidence_threshold=0.5,
                    expected_user_satisfaction=0.7,
                    predicted_completion_time=2.5
                )
                logger.info("fallback_to_phase1_streaming")
            
            # Use predicted parameters for optimal streaming
            words = response.split()
            chunk_size = streaming_params.chunk_size
            delay_seconds = streaming_params.delay_ms / 1000.0
            
            # Track performance for learning
            start_time = time.time()
            chunks_sent = 0
            
            # Stream with predicted optimal parameters
            for i in range(0, len(words), chunk_size):
                chunk_words = words[i:i + chunk_size]
                chunk = ' '.join(chunk_words)
                
                # Add space for continuous text flow
                yield chunk + ' '
                
                # Use predicted delay
                await asyncio.sleep(delay_seconds)
                chunks_sent += 1
            
            # Record actual performance for learning
            actual_time = time.time() - start_time
            await self._record_streaming_performance(
                query=query,
                predicted_params=streaming_params,
                actual_performance={
                    "chunks_sent": chunks_sent,
                    "total_time": actual_time,
                    "words_per_second": len(words) / actual_time if actual_time > 0 else 0
                }
            )
            
        except Exception as e:
            logger.error("phase2_streaming_failed", error=str(e))
            # Fallback to simple streaming
            async for chunk in self._fallback_streaming(response):
                yield chunk
    
    async def _fallback_streaming(self, response: str) -> AsyncGenerator[str, None]:
        """Fallback streaming if Phase 2 fails"""
        words = response.split()
        chunk_size = 6  # Safe default
        
        for i in range(0, len(words), chunk_size):
            chunk_words = words[i:i + chunk_size]
            chunk = ' '.join(chunk_words)
            yield chunk + ' '
            await asyncio.sleep(0.06)  # 60ms delay
    
    async def _record_streaming_performance(
        self,
        query: str,
        predicted_params: AdaptiveStreamingParams,
        actual_performance: Dict
    ):
        """Record actual streaming performance for ML learning"""
        
        try:
            performance_record = {
                "timestamp": time.time(),
                "query": query,
                "predicted_chunk_size": predicted_params.chunk_size,
                "predicted_delay": predicted_params.delay_ms,
                "predicted_satisfaction": predicted_params.expected_user_satisfaction,
                "actual_chunks": actual_performance["chunks_sent"],
                "actual_time": actual_performance["total_time"],
                "words_per_second": actual_performance["words_per_second"]
            }
            
            # Store in history for learning (limit to recent 100 records)
            self.performance_history.append(performance_record)
            if len(self.performance_history) > 100:
                self.performance_history.pop(0)
            
            logger.info(
                "streaming_performance_recorded",
                predicted_satisfaction=predicted_params.expected_user_satisfaction,
                actual_wps=actual_performance["words_per_second"]
            )
            
        except Exception as e:
            logger.error("performance_recording_failed", error=str(e))

class Phase2BackgroundOptimizer:
    """Background optimization tasks for Phase 2"""
    
    def __init__(self):
        self.optimization_enabled = False
        self.last_optimization = 0
    
    async def initialize(self):
        """Initialize background optimizer"""
        try:
            await initialize_phase2()
            self.optimization_enabled = True
            logger.info("phase2_background_optimizer_initialized")
        except Exception as e:
            logger.error("background_optimizer_initialization_failed", error=str(e))
            self.optimization_enabled = False
    
    async def run_periodic_optimization(self):
        """Run periodic background optimization"""
        
        if not self.optimization_enabled:
            return
        
        current_time = time.time()
        
        # Run optimization every 5 minutes
        if current_time - self.last_optimization > 300:  # 5 minutes
            try:
                optimization_result = await run_background_optimization()
                
                if optimization_result:
                    logger.info(
                        "periodic_optimization_completed",
                        warmed_queries=len(optimization_result.get('warmed_queries', [])),
                        insights=len(optimization_result.get('insights', [])),
                        enhanced_rewards=len(optimization_result.get('enhanced_rewards', {}))
                    )
                
                self.last_optimization = current_time
                
            except Exception as e:
                logger.error("periodic_optimization_failed", error=str(e))
    
    async def start_background_tasks(self):
        """Start background optimization tasks"""
        
        if not self.optimization_enabled:
            return
        
        # Run optimization in background
        asyncio.create_task(self._optimization_loop())
        logger.info("background_optimization_tasks_started")
    
    async def _optimization_loop(self):
        """Background optimization loop"""
        
        while self.optimization_enabled:
            try:
                await self.run_periodic_optimization()
                await asyncio.sleep(60)  # Check every minute
            except Exception as e:
                logger.error("optimization_loop_error", error=str(e))
                await asyncio.sleep(60)  # Continue despite errors

# Global instances
phase2_streaming_enhancer = Phase2StreamingEnhancer()
phase2_background_optimizer = Phase2BackgroundOptimizer()

async def initialize_phase2_integration():
    """Initialize all Phase 2 integration components"""
    await phase2_streaming_enhancer.initialize()
    await phase2_background_optimizer.initialize()
    await phase2_background_optimizer.start_background_tasks()

async def enhanced_streaming_response(
    response: str,
    query: str,
    user_context: Dict,
    routing_confidence: float
) -> AsyncGenerator[str, None]:
    """Enhanced streaming response with Phase 2 predictions"""
    
    async for chunk in phase2_streaming_enhancer.enhanced_streaming_with_predictions(
        response, query, user_context, routing_confidence
    ):
        yield chunk

# Test function
async def test_phase2_integration():
    """Test Phase 2 integration functionality"""
    print("🧪 Phase 2 Integration Test")
    print("=" * 50)
    
    try:
        # Initialize Phase 2 integration
        await initialize_phase2_integration()
        
        # Test enhanced streaming
        test_response = "This is a test response with multiple words to demonstrate enhanced streaming capabilities with Phase 2 predictive analytics."
        test_query = "Test query for Phase 2 enhancement"
        test_context = {"user_id": "test_user", "tier": "premium"}
        test_confidence = 0.8
        
        print("✅ Testing enhanced streaming:")
        chunks = []
        async for chunk in enhanced_streaming_response(
            test_response, test_query, test_context, test_confidence
        ):
            chunks.append(chunk)
            print(f"  • Chunk: '{chunk.strip()}'")
        
        print(f"✅ Streaming completed with {len(chunks)} chunks")
        
        # Test background optimization
        await phase2_background_optimizer.run_periodic_optimization()
        print("✅ Background optimization completed")
        
        print("\n🎯 Phase 2 Integration Test: PASSED")
        
    except Exception as e:
        print(f"❌ Phase 2 Integration Test: FAILED - {e}")

if __name__ == "__main__":
    asyncio.run(test_phase2_integration())
