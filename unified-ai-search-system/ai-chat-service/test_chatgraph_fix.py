#!/usr/bin/env python3
"""
Test ChatGraph fix locally to verify the LangGraph START/END issue is resolved
"""
import asyncio
import sys
import os

# Add project root to path
sys.path.insert(0, '.')

async def test_chatgraph_build():
    """Test ChatGraph can be built without errors"""
    try:
        print("🔍 Testing ChatGraph build...")
        
        # Mock dependencies
        class MockModelManager:
            def __init__(self):
                self.models = {"phi3:mini": {"status": "ready"}}
                self.is_initialized = True
                
            def select_optimal_model(self, task_type, quality_level=None):
                """Mock select_optimal_model method"""
                return "phi3:mini"
                
            async def generate(self, prompt, **kwargs):
                from app.models.ollama_client import ModelResult
                return ModelResult(
                    success=True,
                    text="Test response from mock model",
                    execution_time=0.1,
                    model_used="phi3:mini",
                    cost=0.0
                )
                
        class MockCacheManager:
            async def get(self, key, default=None):
                return default
                
            async def set(self, key, value, ttl=None):
                return True
        
        # Set environment
        os.environ['ENVIRONMENT'] = 'testing'
        
        from app.graphs.chat_graph import ChatGraph
        
        mock_model_manager = MockModelManager()
        mock_cache_manager = MockCacheManager()
        
        # Create ChatGraph
        chat_graph = ChatGraph(mock_model_manager, mock_cache_manager)
        
        print(f"✅ ChatGraph created successfully")
        print(f"📊 Nodes: {list(chat_graph.nodes.keys())}")
        print(f"📈 Graph built: {hasattr(chat_graph, 'graph') and chat_graph.graph is not None}")
        
        return True
        
    except Exception as e:
        print(f"❌ ChatGraph build failed: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_chatgraph_execution():
    """Test ChatGraph execution with mock state"""
    try:
        print("\n🔍 Testing ChatGraph execution...")
        
        # Mock dependencies
        class MockModelManager:
            def __init__(self):
                self.models = {"phi3:mini": {"status": "ready"}}
                self.is_initialized = True
                
            def select_optimal_model(self, task_type, quality_level=None):
                """Mock select_optimal_model method"""
                return "phi3:mini"
                
            async def generate(self, **kwargs):
                from app.models.ollama_client import ModelResult
                return ModelResult(
                    success=True,
                    text="Hello! This is a test response from the mock model.",
                    execution_time=0.1,
                    model_used="phi3:mini",
                    cost=0.001
                )
                
        class MockCacheManager:
            async def get(self, key, default=None):
                return default
                
            async def set(self, key, value, ttl=None):
                return True
        
        # Set environment
        os.environ['ENVIRONMENT'] = 'testing'
        
        from app.graphs.chat_graph import ChatGraph
        from app.graphs.base import GraphState
        
        mock_model_manager = MockModelManager()
        mock_cache_manager = MockCacheManager()
        
        # Create ChatGraph
        chat_graph = ChatGraph(mock_model_manager, mock_cache_manager)
        
        # Create test state
        state = GraphState(
            original_query="Hello, this is a test message",
            user_id="test_user",
            session_id="test_session",
            quality_requirement="balanced"
        )
        
        print(f"📝 Test query: {state.original_query}")
        
        # Execute graph
        result = await chat_graph.execute(state)
        
        print(f"✅ Graph execution completed")
        print(f"📤 Result type: {type(result)}")
        print(f"📝 Final response: {getattr(result, 'final_response', 'No final_response attribute')}")
        print(f"❌ Errors: {getattr(result, 'errors', 'No errors attribute')}")
        
        # Check if we have a proper response
        if hasattr(result, 'final_response') and result.final_response:
            print(f"🎉 SUCCESS: Got response: '{result.final_response[:100]}...'")
            return True
        else:
            print(f"⚠️ WARNING: No final_response in result")
            return False
        
    except Exception as e:
        print(f"❌ ChatGraph execution failed: {e}")
        import traceback
        traceback.print_exc()
        return False

async def main():
    print("🧪 Testing ChatGraph LangGraph Fix")
    print("=" * 50)
    
    build_test = await test_chatgraph_build()
    exec_test = await test_chatgraph_execution()
    
    print("\n" + "=" * 50)
    if build_test and exec_test:
        print("✅ All tests passed! ChatGraph fix is working.")
        return 0
    elif build_test:
        print("⚠️ Build test passed but execution test failed.")
        return 1
    else:
        print("❌ Build test failed - fundamental issue.")
        return 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)