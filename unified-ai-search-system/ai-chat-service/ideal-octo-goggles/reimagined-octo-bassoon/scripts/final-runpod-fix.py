#!/usr/bin/env python3
"""
Final RunPod Fix Script
======================

Run this script on the RunPod instance to apply final fixes and restart services.
"""

import subprocess
import time
import sys
import os

def run_command(cmd, description):
    """Run a command and return success status."""
    print(f"🔧 {description}...")
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            print(f"✅ {description} completed")
            return True
        else:
            print(f"❌ {description} failed: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        print(f"⏱️ {description} timed out")
        return False
    except Exception as e:
        print(f"❌ {description} error: {e}")
        return False

def main():
    print("🚀 Applying final fixes on RunPod...")
    
    # Ensure we're in the right directory
    os.chdir('/workspace' if os.path.exists('/workspace') else '/app')
    
    fixes = [
        ("git pull origin main", "Pulling latest code"),
        ("pip install -r requirements.txt", "Installing/updating dependencies"),
        ("python -m py_compile app/api/chat.py", "Validating chat API syntax"),
        ("python -m py_compile app/models/manager.py", "Validating model manager syntax"),
        ("python -m py_compile app/graphs/chat_graph.py", "Validating chat graph syntax"),
        ("pkill -f uvicorn", "Stopping old FastAPI processes"),
        ("pkill -f supervisord", "Stopping supervisor"),
    ]
    
    success_count = 0
    for cmd, desc in fixes:
        if run_command(cmd, desc):
            success_count += 1
        time.sleep(1)
    
    print(f"\n📊 Applied {success_count}/{len(fixes)} fixes")
    
    # Start services
    print("\n🚀 Starting services...")
    
    if os.path.exists('/etc/supervisor/supervisord.conf'):
        run_command("supervisord -c /etc/supervisor/supervisord.conf", "Starting supervisor")
    else:
        run_command("uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload", "Starting FastAPI directly")
    
    # Test the API
    time.sleep(5)
    if run_command("curl -f http://localhost:8000/health/live", "Testing API health"):
        print("\n✅ All fixes applied and services started successfully!")
        print("🌐 API is ready at: http://localhost:8000")
        print("📖 API documentation: http://localhost:8000/docs")
    else:
        print("\n⚠️ API health check failed, but services may still be starting...")
        print("💡 Check logs: tail -f /var/log/supervisor/*.log")
    
    return success_count == len(fixes)

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
