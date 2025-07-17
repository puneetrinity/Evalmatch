#!/usr/bin/env python3
"""
Bug Analysis and Diagnosis Script
Analyzes the specific issues found in the codebase related to fallback responses.
"""

import sys
import os
import json
from pathlib import Path

# Add the project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

def analyze_fallback_response_issues():
    """Analyze the fallback response issues found in the tests."""
    
    print("=== FALLBACK RESPONSE BUG ANALYSIS ===\n")
    
    # Issue 1: ChatGraph fallback doesn't create structured response
    print("🔍 ISSUE 1: ChatGraph Fallback Response Structure")
    print("Location: app/graphs/chat_graph.py:615, 738")
    print("Problem: When Ollama health check fails or model calls fail:")
    print("  - Only sets state.final_response = 'I'm having trouble generating a response right now.'")
    print("  - Does NOT create proper ChatResponse with metadata, developer_hints, etc.")
    print("  - This causes downstream issues when API layer expects structured response")
    print()
    
    # Issue 2: Model Manager not ready
    print("🔍 ISSUE 2: Model Manager Not Ready")
    print("From test logs: 'Component model_manager not ready'")
    print("Root causes:")
    print("  - Ollama service not running or reachable")
    print("  - No models loaded/available")
    print("  - Health check failing")
    print()
    
    # Issue 3: Redis connection failure
    print("🔍 ISSUE 3: Redis Connection Failure")
    print("From test logs: 'Error 22 connecting to localhost:6379'")
    print("Impact:")
    print("  - Falls back to local cache")
    print("  - May impact performance but shouldn't cause fallback responses")
    print()
    
    # Issue 4: App state initialization issues
    print("🔍 ISSUE 4: App State Initialization")
    print("From test logs: 'ChatGraph not found in app state - using fallback initialization'")
    print("Problem:")
    print("  - ChatGraph not properly registered in FastAPI app state")
    print("  - Using fallback ModelManager and CacheManager singletons")
    print()
    
    print("=== ROOT CAUSE ANALYSIS ===\n")
    
    print("🎯 PRIMARY ISSUE: Ollama Service Dependencies")
    print("The fallback responses are triggered because:")
    print("1. Ollama service is not running/reachable")
    print("2. No models are loaded or available")
    print("3. Health checks fail")
    print()
    
    print("🎯 SECONDARY ISSUE: Inconsistent Fallback Handling")
    print("When fallbacks are triggered:")
    print("1. chat_graph.py creates simple string response")
    print("2. chat.py expects structured ChatResponse")
    print("3. Tests expect proper developer_hints and metadata")
    print()
    
    print("=== SOLUTION RECOMMENDATIONS ===\n")
    
    print("🔧 FIX 1: Improve ChatGraph Fallback Response")
    print("- Modify chat_graph.py fallback to create proper NodeResult with structured data")
    print("- Ensure fallback response includes all required fields")
    print()
    
    print("🔧 FIX 2: Add Mock/Stub Model for Testing")
    print("- Create a mock model service for local testing")
    print("- Avoid dependency on external Ollama service during tests")
    print()
    
    print("🔧 FIX 3: Improve Error Handling and Logging")
    print("- Add more specific error messages")
    print("- Distinguish between different failure types")
    print("- Provide better debugging information")
    print()
    
    print("🔧 FIX 4: Fix App State Initialization")
    print("- Ensure ChatGraph is properly registered in app startup")
    print("- Fix singleton initialization issues")
    print()

def test_model_availability():
    """Test what models are available and why fallbacks are triggered."""
    
    print("\n=== MODEL AVAILABILITY TEST ===\n")
    
    try:
        # Try to import and test the model manager
        from app.models.manager import ModelManager
        from app.core.config import get_settings
        
        settings = get_settings()
        print(f"📋 Configuration:")
        print(f"  - OLLAMA_BASE_URL: {getattr(settings, 'OLLAMA_BASE_URL', 'Not set')}")
        print(f"  - MODEL_NAME: {getattr(settings, 'MODEL_NAME', 'Not set')}")
        print()
        
        # Test model manager initialization
        try:
            manager = ModelManager()
            print("✅ ModelManager initialized successfully")
            
            # Test health check
            try:
                import asyncio
                
                async def test_health():
                    health = await manager.health_check()
                    return health
                
                health_result = asyncio.run(test_health())
                print(f"🏥 Health check result: {health_result}")
                
            except Exception as health_e:
                print(f"❌ Health check failed: {health_e}")
                
        except Exception as manager_e:
            print(f"❌ ModelManager initialization failed: {manager_e}")
            
    except ImportError as import_e:
        print(f"❌ Failed to import modules: {import_e}")

def check_ollama_connectivity():
    """Check if Ollama service is running and accessible."""
    
    print("\n=== OLLAMA CONNECTIVITY TEST ===\n")
    
    import httpx
    import asyncio
    
    async def test_ollama():
        try:
            # Test default Ollama endpoint
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get("http://localhost:11434/api/tags")
                if response.status_code == 200:
                    data = response.json()
                    models = data.get("models", [])
                    print(f"✅ Ollama is running")
                    print(f"📦 Available models: {len(models)}")
                    for model in models:
                        print(f"  - {model.get('name', 'Unknown')}")
                else:
                    print(f"⚠️ Ollama responded with status: {response.status_code}")
        except httpx.ConnectError:
            print("❌ Cannot connect to Ollama at localhost:11434")
            print("   This is likely why fallback responses are triggered!")
        except Exception as e:
            print(f"❌ Ollama connectivity test failed: {e}")
    
    asyncio.run(test_ollama())

if __name__ == "__main__":
    analyze_fallback_response_issues()
    test_model_availability()
    check_ollama_connectivity()
    
    print("\n=== NEXT STEPS ===")
    print("1. Install and start Ollama service")
    print("2. Pull a model (e.g., 'ollama pull llama2:7b')")
    print("3. Fix the ChatGraph fallback response structure")
    print("4. Re-run tests to verify fixes")
