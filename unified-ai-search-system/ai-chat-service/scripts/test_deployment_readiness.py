#!/usr/bin/env python3
"""
Deployment readiness test - verifies all deployment files are correct
"""

import os
import sys
import json
import yaml
from pathlib import Path

def log(message):
    """Log messages"""
    print(f"[TEST] {message}")

def check_dockerfile():
    """Check Dockerfile.production"""
    log("Checking Dockerfile.production...")
    
    dockerfile = Path("Dockerfile.production")
    if not dockerfile.exists():
        log("❌ Dockerfile.production not found")
        return False
    
    content = dockerfile.read_text()
    
    # Check for required sections
    required_sections = [
        "FROM nvidia/cuda",
        "COPY requirements.txt",
        "RUN pip install",
        "COPY app ./app",
        "EXPOSE 8000",
        "HEALTHCHECK"
    ]
    
    missing = []
    for section in required_sections:
        if section not in content:
            missing.append(section)
    
    if missing:
        log(f"❌ Dockerfile missing sections: {missing}")
        return False
    
    log("✅ Dockerfile.production is complete")
    return True

def check_docker_compose():
    """Check docker-compose.yml"""
    log("Checking docker-compose.yml...")
    
    compose_file = Path("deploy/docker-compose.yml")
    if not compose_file.exists():
        log("❌ docker-compose.yml not found")
        return False
    
    try:
        with open(compose_file) as f:
            compose = yaml.safe_load(f)
        
        # Check required services
        services = compose.get('services', {})
        required_services = ['ai-search', 'redis']
        
        missing_services = []
        for service in required_services:
            if service not in services:
                missing_services.append(service)
        
        if missing_services:
            log(f"❌ Missing services: {missing_services}")
            return False
        
        # Check AI search service configuration
        ai_search = services.get('ai-search', {})
        
        required_config = [
            'build', 'environment', 'ports', 'volumes', 
            'depends_on', 'healthcheck', 'restart'
        ]
        
        missing_config = []
        for config in required_config:
            if config not in ai_search:
                missing_config.append(config)
        
        if missing_config:
            log(f"❌ AI search service missing config: {missing_config}")
            return False
        
        log("✅ docker-compose.yml is complete")
        return True
        
    except yaml.YAMLError as e:
        log(f"❌ Invalid YAML in docker-compose.yml: {e}")
        return False

def check_supervisor_config():
    """Check supervisor configuration"""
    log("Checking supervisor configuration...")
    
    configs = [
        "docker/supervisord.conf",
        "docker/supervisor.conf"
    ]
    
    all_good = True
    for config_file in configs:
        config_path = Path(config_file)
        if not config_path.exists():
            log(f"❌ {config_file} not found")
            all_good = False
            continue
        
        content = config_path.read_text()
        
        # Check for required programs
        if "supervisor.conf" in config_file:
            required_programs = ["redis", "ollama", "ai-search-api"]
            for program in required_programs:
                if f"[program:{program}]" not in content:
                    log(f"❌ {config_file} missing program: {program}")
                    all_good = False
        
        log(f"✅ {config_file} is valid")
    
    return all_good

def check_scripts():
    """Check required scripts"""
    log("Checking deployment scripts...")
    
    required_scripts = [
        "start-app.sh",
        "scripts/validate_startup.py",
        "scripts/final-runpod-fix.py",
        "scripts/health-check.sh",
        "scripts/init-models.sh"
    ]
    
    missing = []
    for script in required_scripts:
        script_path = Path(script)
        if not script_path.exists():
            missing.append(script)
        else:
            # Check if executable
            if not os.access(script_path, os.X_OK):
                log(f"⚠️ {script} is not executable")
    
    if missing:
        log(f"❌ Missing scripts: {missing}")
        return False
    
    log("✅ All deployment scripts present")
    return True

def check_requirements():
    """Check requirements.txt"""
    log("Checking requirements.txt...")
    
    req_file = Path("requirements.txt")
    if not req_file.exists():
        log("❌ requirements.txt not found")
        return False
    
    content = req_file.read_text()
    
    # Check for critical dependencies
    critical_deps = [
        "fastapi", "uvicorn", "redis", "langgraph", 
        "structlog", "pydantic", "aiohttp"
    ]
    
    missing = []
    for dep in critical_deps:
        if dep not in content:
            missing.append(dep)
    
    if missing:
        log(f"❌ Missing dependencies: {missing}")
        return False
    
    log("✅ requirements.txt is complete")
    return True

def check_makefile():
    """Check deployment Makefile"""
    log("Checking Makefile...")
    
    makefile = Path("deploy/Makefile")
    if not makefile.exists():
        log("❌ deploy/Makefile not found")
        return False
    
    content = makefile.read_text()
    
    # Check for required targets
    required_targets = ["dev:", "prod:", "build:", "health:", "clean:"]
    
    missing = []
    for target in required_targets:
        if target not in content:
            missing.append(target)
    
    if missing:
        log(f"❌ Makefile missing targets: {missing}")
        return False
    
    log("✅ Makefile is complete")
    return True

def main():
    """Main deployment readiness test"""
    log("🚀 Testing deployment readiness...")
    
    tests = [
        ("Dockerfile", check_dockerfile),
        ("Docker Compose", check_docker_compose),
        ("Supervisor Config", check_supervisor_config),
        ("Scripts", check_scripts),
        ("Requirements", check_requirements),
        ("Makefile", check_makefile),
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        log(f"📋 Testing {test_name}...")
        if test_func():
            passed += 1
        else:
            log(f"⚠️ {test_name} test failed")
    
    log(f"📊 Test Summary: {passed}/{total} tests passed")
    
    if passed == total:
        log("✅ All deployment readiness tests passed!")
        log("🚀 System is ready for deployment!")
        return 0
    else:
        log("❌ Some tests failed - fix issues before deployment")
        return 1

if __name__ == "__main__":
    sys.exit(main())