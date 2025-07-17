#!/usr/bin/env python3
"""
RunPod Health Check and Initialization Script
"""

import asyncio
import sys
import traceback
import time
import subprocess
import requests
import json
from pathlib import Path

async def check_ollama_status():
    """Check if Ollama is running and has models"""
    print("🔍 Checking Ollama status...")
    
    try:
        # Check if Ollama process is running
        result = subprocess.run(['pgrep', '-f', 'ollama'], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✅ Ollama process running (PID: {result.stdout.strip()})")
        else:
            print("❌ Ollama process not found")
            return False
        
        # Check Ollama API
        try:
            response = requests.get('http://localhost:11434/api/version', timeout=5)
            if response.status_code == 200:
                print(f"✅ Ollama API responding: {response.json()}")
            else:
                print(f"❌ Ollama API error: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Ollama API connection failed: {e}")
            return False
        
        # Check available models
        try:
            result = subprocess.run(['ollama', 'list'], capture_output=True, text=True)
            if result.returncode == 0:
                models = result.stdout.strip()
                print("📋 Available models:")
                print(models)
                if 'phi3:mini' in models or 'tinyllama' in models:
                    print("✅ Required models available")
                    return True
                else:
                    print("⚠️ Required models not found")
                    return False
            else:
                print(f"❌ ollama list failed: {result.stderr}")
                return False
        except Exception as e:
            print(f"❌ Model check failed: {e}")
            return False
            
    except Exception as e:
        print(f"❌ Ollama check failed: {e}")
        return False

async def check_fastapi_status():
    """Check if FastAPI app is running"""
    print("🔍 Checking FastAPI status...")
    
    try:
        response = requests.get('http://localhost:8000/health', timeout=10)
        if response.status_code == 200:
            health_data = response.json()
            print(f"✅ FastAPI responding: {health_data.get('status', 'unknown')}")
            
            # Check components
            components = health_data.get('components', {})
            for comp_name, comp_status in components.items():
                status_icon = "✅" if "healthy" in str(comp_status) else "❌"
                print(f"  {status_icon} {comp_name}: {comp_status}")
            
            return health_data.get('status') == 'healthy'
        else:
            print(f"❌ FastAPI health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ FastAPI connection failed: {e}")
        return False

async def initialize_models():
    """Initialize required models"""
    print("🚀 Initializing required models...")
    
    required_models = ['phi3:mini', 'tinyllama:latest']
    
    for model in required_models:
        try:
            print(f"📥 Pulling {model}...")
            result = subprocess.run(['ollama', 'pull', model], 
                                  capture_output=True, text=True, timeout=300)
            if result.returncode == 0:
                print(f"✅ {model} pulled successfully")
            else:
                print(f"❌ Failed to pull {model}: {result.stderr}")
        except subprocess.TimeoutExpired:
            print(f"⏱️ Timeout pulling {model}")
        except Exception as e:
            print(f"❌ Error pulling {model}: {e}")

async def fix_common_issues():
    """Fix common RunPod deployment issues"""
    print("🔧 Attempting to fix common issues...")
    
    # 1. Start Ollama if not running
    try:
        result = subprocess.run(['pgrep', '-f', 'ollama'], capture_output=True)
        if result.returncode != 0:
            print("🚀 Starting Ollama...")
            subprocess.Popen(['ollama', 'serve'], 
                           stdout=subprocess.DEVNULL, 
                           stderr=subprocess.DEVNULL)
            await asyncio.sleep(5)
    except Exception as e:
        print(f"❌ Failed to start Ollama: {e}")
    
    # 2. Initialize models
    await initialize_models()
    
    # 3. Check directory permissions
    try:
        dirs_to_check = ['/app/logs', '/app/data', '/app/models', '/root/.ollama/models']
        for dir_path in dirs_to_check:
            Path(dir_path).mkdir(parents=True, exist_ok=True)
            print(f"✅ Directory ready: {dir_path}")
    except Exception as e:
        print(f"❌ Directory setup failed: {e}")

async def main():
    """Main health check and fix routine"""
    print("🏥 RunPod AI Search System Health Check")
    print("=" * 50)
    
    # Check current status
    ollama_ok = await check_ollama_status()
    fastapi_ok = await check_fastapi_status()
    
    if ollama_ok and fastapi_ok:
        print("\n🎉 All systems healthy!")
        return 0
    
    print("\n🔧 Issues detected, attempting fixes...")
    await fix_common_issues()
    
    # Re-check after fixes
    print("\n🔍 Re-checking after fixes...")
    await asyncio.sleep(10)  # Wait for services to stabilize
    
    ollama_ok = await check_ollama_status()
    fastapi_ok = await check_fastapi_status()
    
    if ollama_ok and fastapi_ok:
        print("\n🎉 All systems healthy after fixes!")
        return 0
    else:
        print("\n❌ Some issues remain:")
        if not ollama_ok:
            print("  - Ollama not healthy")
        if not fastapi_ok:
            print("  - FastAPI not healthy")
        return 1

if __name__ == "__main__":
    try:
        exit_code = asyncio.run(main())
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n👋 Health check cancelled")
        sys.exit(1)
    except Exception as e:
        print(f"\n💥 Health check failed: {e}")
        traceback.print_exc()
        sys.exit(1)