#!/usr/bin/env python3
"""
Debug the exact issue with the error handling test.
"""

import asyncio
import sys
from pathlib import Path

# Add the project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

async def debug_validation_issue():
    """Debug the exact validation issue."""
    print("🔍 DEBUGGING VALIDATION ISSUE")
    print("=" * 40)
    print()
    
    # Simulate the exact same validation logic from the endpoint
    print("1. Testing constraints validation logic...")
    
    try:
        from app.schemas.requests import Constraints, ChatRequest
        from fastapi import HTTPException
        
        # Simulate the API validation logic
        data = {
            "message": "Test message",
            "constraints": {"quality_requirement": "invalid"},
            "context": {},
        }
        
        print(f"Input data: {data}")
        
        # Step 1: Validate constraints (this should fail)
        if "constraints" in data and isinstance(data["constraints"], dict):
            try:
                print("  - Creating Constraints object...")
                constraints_obj = Constraints(**data["constraints"])
                print(f"  ❌ Constraints validation passed unexpectedly: {constraints_obj}")
                
                # If we get here, propagate fields
                for field in ["quality_requirement", "max_cost", "max_time", "force_local_only"]:
                    if hasattr(constraints_obj, field):
                        value = getattr(constraints_obj, field)
                        if value is not None:
                            if data.get(field) is None:
                                data[field] = value
                                
            except Exception as e:
                print(f"  ✅ Constraints validation failed as expected: {e}")
                print("  - This should raise HTTPException(422)")
                raise HTTPException(
                    status_code=422,
                    detail={"error": "Invalid constraints field.", "details": str(e)},
                )
        
        # Step 2: Rebuild ChatRequest (this should also validate)
        print("  - Creating ChatRequest object...")
        chat_request = ChatRequest(**data)
        print(f"  - ChatRequest created: {chat_request}")
        
    except HTTPException as he:
        print(f"✅ HTTPException raised correctly: {he.status_code} - {he.detail}")
        return True
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False
    
    print("❌ No validation error was raised - this is the problem!")
    return False

async def test_all_error_cases():
    """Test all three error cases from the failing test."""
    print("\n2. Testing all error cases...")
    
    test_cases = [
        {
            "name": "Empty message",
            "data": {
                "message": "",
                "session_id": "test_error",
                "context": {},
                "constraints": {},
            }
        },
        {
            "name": "Long message", 
            "data": {
                "message": "x" * 10000,
                "session_id": "test_error",
                "context": {},
                "constraints": {},
            }
        },
        {
            "name": "Invalid quality_requirement",
            "data": {
                "message": "Test message",
                "constraints": {"quality_requirement": "invalid"},
                "context": {},
            }
        }
    ]
    
    for i, case in enumerate(test_cases):
        print(f"\n  Case {i+1}: {case['name']}")
        try:
            from app.schemas.requests import ChatRequest, Constraints
            from fastapi import HTTPException
            
            data = case['data']
            
            # Test basic message validation
            message = data.get("message", "")
            if not isinstance(message, str) or not message.strip():
                print(f"    ✅ Empty message validation would catch this")
                continue
                
            if len(message) > 4096:
                print(f"    ✅ Long message validation would catch this")
                continue
            
            # Test constraints validation
            if "constraints" in data and isinstance(data["constraints"], dict):
                try:
                    constraints_obj = Constraints(**data["constraints"])
                    print(f"    ❌ Constraints validation passed: {constraints_obj}")
                except Exception as e:
                    print(f"    ✅ Constraints validation failed: {e}")
                    continue
            
            # Test ChatRequest validation
            try:
                chat_request = ChatRequest(**data)
                print(f"    ❌ ChatRequest validation passed: {chat_request}")
            except Exception as e:
                print(f"    ✅ ChatRequest validation failed: {e}")
                
        except Exception as e:
            print(f"    ❌ Unexpected error: {e}")

async def main():
    """Main debug function."""
    
    result1 = await debug_validation_issue()
    await test_all_error_cases()
    
    print("\n" + "=" * 40)
    if not result1:
        print("❌ ISSUE IDENTIFIED: Validation is not working as expected")
        print("🔧 Need to investigate the endpoint validation logic")
    else:
        print("✅ Validation logic seems correct")

if __name__ == "__main__":
    asyncio.run(main())
