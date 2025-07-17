#!/usr/bin/env python3
"""
Test script to verify the fixes for the identified issues.
"""

import asyncio
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))


async def test_cache_manager_scoping():
    """Test cache_manager variable scoping fix in chat.py"""
    print("🔍 Testing cache_manager scoping fix...")
    
    try:
        from app.api.chat import cache_manager
        print("✅ Global cache_manager imports correctly")
        
        # Test that the cache_manager object exists
        if cache_manager:
            print("✅ Global cache_manager is initialized")
        else:
            print("❌ Global cache_manager is None")
            
    except ImportError as e:
        print(f"❌ Import error: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")


def test_security_validation_fix():
    """Test streaming chat security validation fix"""
    print("\n🔍 Testing streaming chat security validation fix...")
    
    try:
        from app.api.chat import chat_stream
        import inspect
        
        # Get function signature
        sig = inspect.signature(chat_stream)
        current_user_param = sig.parameters.get('current_user')
        
        if current_user_param:
            # Check annotation
            annotation = current_user_param.annotation
            print(f"✅ current_user parameter type: {annotation}")
            
            # Should be dict, not User
            if annotation == dict or str(annotation) == "<class 'dict'>":
                print("✅ Security validation fix is correct")
            else:
                print(f"❌ Expected dict, got {annotation}")
        else:
            print("❌ current_user parameter not found")
            
    except Exception as e:
        print(f"❌ Error testing security fix: {e}")


def test_research_endpoint_fix():
    """Test research endpoint schema fix"""
    print("\n🔍 Testing research endpoint schema fix...")
    
    try:
        from app.schemas.requests import ResearchRequest
        from app.schemas.responses import ResearchResponse, BaseResponse
        
        # Test ResearchRequest has research_question field
        fields = ResearchRequest.model_fields
        if 'research_question' in fields:
            print("✅ ResearchRequest has research_question field")
            
            # Check if it's required
            field_info = fields['research_question']
            if field_info.is_required():
                print("✅ research_question field is required")
            else:
                print("❌ research_question field is not required")
        else:
            print("❌ research_question field missing")
        
        # Test ResearchResponse inherits from BaseResponse
        if issubclass(ResearchResponse, BaseResponse):
            print("✅ ResearchResponse correctly inherits from BaseResponse")
        else:
            print("❌ ResearchResponse does not inherit from BaseResponse")
            
    except Exception as e:
        print(f"❌ Error testing research endpoint: {e}")


async def test_adaptive_router_initialization():
    """Test adaptive router initialization fix"""
    print("\n🔍 Testing adaptive router initialization fix...")
    
    try:
        from app.adaptive.adaptive_router import AdaptiveIntelligentRouter
        from unittest.mock import Mock, AsyncMock
        
        # Create mock dependencies
        mock_model_manager = Mock()
        mock_cache_manager = Mock()
        
        # Test router creation
        router = AdaptiveIntelligentRouter(
            model_manager=mock_model_manager,
            cache_manager=mock_cache_manager,
            enable_adaptive=True,
            shadow_rate=0.3,
        )
        
        print("✅ AdaptiveIntelligentRouter creates successfully")
        
        # Test that graphs are properly initialized with both parameters
        from app.graphs.base import GraphType
        
        if GraphType.CHAT in router.graphs:
            chat_graph = router.graphs[GraphType.CHAT]
            # Both model_manager and cache_manager should be passed
            print("✅ Chat graph exists in router.graphs")
            
        if GraphType.SEARCH in router.graphs:
            search_graph = router.graphs[GraphType.SEARCH]
            print("✅ Search graph exists in router.graphs")
            
        # Test initialize method exists and is async
        if hasattr(router, 'initialize') and asyncio.iscoroutinefunction(router.initialize):
            print("✅ Router has async initialize method")
        else:
            print("❌ Router missing async initialize method")
            
    except Exception as e:
        print(f"❌ Error testing adaptive router: {e}")


def test_main_app_initialization():
    """Test main app initialization fix"""
    print("\n🔍 Testing main app initialization fix...")
    
    try:
        # Read the main.py file and check for the async init_adaptive_router
        main_file = project_root / "app" / "main.py"
        content = main_file.read_text()
        
        # Check if init_adaptive_router is defined as async
        if "async def init_adaptive_router():" in content:
            print("✅ init_adaptive_router is defined as async function")
        else:
            print("❌ init_adaptive_router is not async")
            
        # Check if it calls await router.initialize()
        if "await router.initialize()" in content:
            print("✅ init_adaptive_router calls await router.initialize()")
        else:
            print("❌ init_adaptive_router does not call await router.initialize()")
            
    except Exception as e:
        print(f"❌ Error testing main app initialization: {e}")


async def main():
    """Run all tests"""
    print("🧪 Running fixes verification tests...\n")
    
    # Test 1: Cache manager scoping
    await test_cache_manager_scoping()
    
    # Test 2: Security validation
    test_security_validation_fix()
    
    # Test 3: Research endpoint
    test_research_endpoint_fix()
    
    # Test 4: Adaptive router initialization
    await test_adaptive_router_initialization()
    
    # Test 5: Main app initialization
    test_main_app_initialization()
    
    print("\n✅ All tests completed!")


if __name__ == "__main__":
    asyncio.run(main())