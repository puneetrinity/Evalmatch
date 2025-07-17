#!/usr/bin/env python3
"""
Logic test to verify the critical chat API fix without requiring dependencies.
This validates that the code changes correctly access app.state instead of globals.
"""

import sys
from pathlib import Path

def test_chat_api_code_logic():
    """Test that chat.py code correctly accesses app.state"""
    
    print("🔍 Analyzing chat.py code for component access patterns...")
    
    chat_file = Path(__file__).parent / "app" / "api" / "chat.py"
    
    if not chat_file.exists():
        print(f"❌ Chat file not found: {chat_file}")
        return False
        
    content = chat_file.read_text()
    
    # Check that problematic patterns are removed
    issues = []
    
    # 1. Check for global variable usage (should be removed)
    if "global model_manager, cache_manager, chat_graph" in content:
        issues.append("Still contains global variable declarations")
    
    # 2. Check for dependency injection fallback usage
    if "get_model_manager()" in content and "app_state.get(" not in content:
        issues.append("Still using dependency injection without app_state check")
    
    # 3. Check for correct app.state access pattern
    if "getattr(request.app.state, 'app_state', {})" not in content:
        if "getattr(req.app.state, 'app_state', {})" not in content:
            issues.append("Missing app.state access pattern")
    
    # 4. Check that app_state.get() is used for components
    if "app_state.get('chat_graph')" not in content:
        issues.append("Missing app_state.get('chat_graph') pattern")
    
    # 5. Check for removal of initialize_chat_dependencies
    if "await initialize_chat_dependencies()" in content:
        issues.append("Still calling initialize_chat_dependencies()")
    
    if issues:
        print("❌ Issues found in chat.py:")
        for issue in issues:
            print(f"  - {issue}")
        return False
    
    print("✅ chat.py code correctly uses app.state access patterns")
    return True

def test_main_py_status_endpoints():
    """Test that main.py status endpoints use correct app.state access"""
    
    print("🔍 Analyzing main.py status endpoints...")
    
    main_file = Path(__file__).parent / "app" / "main.py"
    
    if not main_file.exists():
        print(f"❌ Main file not found: {main_file}")
        return False
        
    content = main_file.read_text()
    
    issues = []
    
    # Check for correct app.state access in system/status
    if "actual_app_state = getattr(app.state, 'app_state', {})" not in content:
        issues.append("Missing actual_app_state access in system/status")
    
    # Check that status endpoints use actual_app_state instead of app_state
    # (but exclude lifespan shutdown which correctly uses local app_state)
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if '"cache_manager" in app_state' in line or '"model_manager" in app_state' in line:
            # Check if this is in a status/health endpoint (not lifespan shutdown)
            context_lines = lines[max(0, i-10):i+5]
            context = '\n'.join(context_lines)
            if 'async def system_status' in context or 'async def health_check' in context:
                if '"model_manager" in app_state' in line:
                    issues.append("Status endpoint still using wrong app_state for model_manager")
                if '"cache_manager" in app_state' in line:
                    issues.append("Status endpoint still using wrong app_state for cache_manager")
    
    if issues:
        print("❌ Issues found in main.py:")
        for issue in issues:
            print(f"  - {issue}")
        return False
        
    print("✅ main.py status endpoints correctly use app.state access")
    return True

def test_app_state_storage():
    """Test that main.py stores components in app.state.app_state"""
    
    print("🔍 Checking app.state storage in main.py lifespan...")
    
    main_file = Path(__file__).parent / "app" / "main.py"
    content = main_file.read_text()
    
    # Check that components are stored in app.state.app_state
    if "app.state.app_state = app_state" not in content:
        print("❌ Missing app.state.app_state storage in lifespan")
        return False
    
    print("✅ Components correctly stored in app.state.app_state")
    return True

if __name__ == "__main__":
    print("🧪 Testing chat API fix logic...")
    print("=" * 50)
    
    all_passed = True
    
    if not test_chat_api_code_logic():
        all_passed = False
        
    if not test_main_py_status_endpoints():
        all_passed = False
        
    if not test_app_state_storage():
        all_passed = False
    
    print("=" * 50)
    
    if all_passed:
        print("✅ ALL LOGIC TESTS PASSED - Code changes look correct!")
        print("\nThe fix should resolve:")
        print("  1. Chat API will use initialized components from app startup")
        print("  2. Status endpoints will show components as connected/initialized")  
        print("  3. Chat API should generate real responses instead of fallbacks")
        sys.exit(0)
    else:
        print("❌ LOGIC TESTS FAILED - Code changes have issues!")
        sys.exit(1)