#!/usr/bin/env python3
"""
Startup validation script for AI Search System
Verifies that all components are properly initialized before allowing traffic
"""

import os
import sys
import time
import json
import requests
import subprocess
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

def log(message):
    """Log with timestamp"""
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}")

def check_service(name, url, timeout=30):
    """Check if a service is responding"""
    log(f"Checking {name} at {url}...")
    
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                log(f"✅ {name} is responding")
                return True
        except Exception as e:
            log(f"⏳ {name} not ready yet: {e}")
            time.sleep(2)
    
    log(f"❌ {name} failed to respond within {timeout}s")
    return False

def check_python_imports():
    """Verify critical Python imports work"""
    log("Checking Python imports...")
    
    try:
        # Test core application imports
        from app.core.config import get_settings
        from app.models.manager import ModelManager
        from app.cache.redis_client import CacheManager
        
        log("✅ Core imports successful")
        return True
    except Exception as e:
        log(f"❌ Import error: {e}")
        return False

def check_environment():
    """Check environment variables"""
    log("Checking environment configuration...")
    
    required_vars = ['REDIS_URL', 'OLLAMA_HOST', 'ENVIRONMENT']
    missing = []
    
    for var in required_vars:
        if not os.getenv(var):
            missing.append(var)
    
    if missing:
        log(f"❌ Missing environment variables: {missing}")
        return False
    
    log("✅ Environment variables configured")
    return True

def check_files():
    """Check required files exist"""
    log("Checking required files...")
    
    required_files = [
        '/app/app/main.py',
        '/etc/supervisor/conf.d/ai-search.conf',
        '/app/requirements.txt'
    ]
    
    missing = []
    for file_path in required_files:
        if not os.path.exists(file_path):
            missing.append(file_path)
    
    if missing:
        log(f"❌ Missing files: {missing}")
        return False
    
    log("✅ Required files present")
    return True

def check_supervisor():
    """Check supervisor status"""
    log("Checking supervisor...")
    
    try:
        result = subprocess.run(['supervisorctl', 'status'], 
                              capture_output=True, text=True, timeout=10)
        log("✅ Supervisor is running")
        log("Supervisor status:")
        for line in result.stdout.split('\n'):
            if line.strip():
                log(f"  {line}")
        return True
    except Exception as e:
        log(f"❌ Supervisor check failed: {e}")
        return False

def main():
    """Main startup validation"""
    log("🚀 Starting AI Search System startup validation...")
    
    validation_steps = [
        ("Environment", check_environment),
        ("Files", check_files),
        ("Python Imports", check_python_imports),
        ("Supervisor", check_supervisor),
    ]
    
    passed = 0
    total = len(validation_steps)
    
    for step_name, check_func in validation_steps:
        log(f"📋 Running {step_name} validation...")
        if check_func():
            passed += 1
        else:
            log(f"⚠️ {step_name} validation failed")
    
    log(f"📊 Validation Summary: {passed}/{total} checks passed")
    
    if passed == total:
        log("✅ All startup validations passed!")
        return 0
    else:
        log("❌ Some validations failed - system may have issues")
        return 1

if __name__ == "__main__":
    sys.exit(main())