#!/usr/bin/env python3
"""
RunPod Deployment Fix Script
===========================

This script creates a complete deployment package for RunPod with all fixes applied.
It ensures the system will work properly in the RunPod environment.
"""

import os
import sys
import json
import time
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

print("🚀 Creating RunPod deployment package...")

def create_runpod_dockerfile():
    """Create a RunPod-optimized Dockerfile."""
    print("\n📦 Creating RunPod-optimized Dockerfile...")
    
    dockerfile_content = '''# RunPod-optimized Dockerfile for AI Search System
FROM python:3.10-slim

# Set environment variables for RunPod
ENV PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1 \\
    PYTHONPATH=/app \\
    PORT=8000 \\
    RUNPOD_POD_ID=${RUNPOD_POD_ID:-unknown} \\
    RUNPOD_TCP_PORT_8000=${RUNPOD_TCP_PORT_8000:-8000}

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \\
    build-essential \\
    gcc \\
    curl \\
    git \\
    supervisor \\
    && rm -rf /var/lib/apt/lists/* \\
    && apt-get clean

# Copy requirements and install Python dependencies
COPY requirements.txt requirements-dev.txt ./
RUN pip install --upgrade pip setuptools wheel && \\
    pip install --no-cache-dir -r requirements.txt && \\
    pip install --no-cache-dir -r requirements-dev.txt && \\
    pip cache purge

# Copy application code
COPY app ./app
COPY scripts ./scripts
COPY docker ./docker
COPY .env* ./

# Copy RunPod-specific configurations
COPY docker/supervisor.conf /etc/supervisor/conf.d/app.conf

# Create directories and set permissions
RUN mkdir -p /var/log/supervisor && \\
    chmod +x scripts/*.py scripts/*.sh 2>/dev/null || true

# Expose the application port
EXPOSE 8000

# Health check optimized for RunPod
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \\
    CMD curl --fail http://localhost:8000/health/live || exit 1

# Use supervisor to manage services
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]
'''
    
    dockerfile_path = project_root / "Dockerfile.runpod"
    with open(dockerfile_path, 'w', encoding='utf-8') as f:
        f.write(dockerfile_content)
    
    print("✅ RunPod Dockerfile created")
    return True

def create_supervisor_config():
    """Create supervisor configuration for RunPod."""
    print("\n⚙️ Creating supervisor configuration...")
    
    supervisor_content = '''[supervisord]
nodaemon=true
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid
user=root

[program:ai-search-api]
command=uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --log-level info
directory=/app
user=root
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/supervisor/api.log
stdout_logfile_maxbytes=50MB
stdout_logfile_backups=3
environment=PYTHONPATH="/app"

[program:startup-validation]
command=python scripts/validate_startup.py
directory=/app
user=root
autostart=true
autorestart=false
startsecs=0
startretries=3
redirect_stderr=true
stdout_logfile=/var/log/supervisor/startup.log
priority=10
'''
    
    supervisor_path = project_root / "docker" / "supervisor.conf"
    supervisor_path.parent.mkdir(exist_ok=True)
    with open(supervisor_path, 'w', encoding='utf-8') as f:
        f.write(supervisor_content)
    
    print("✅ Supervisor configuration created")
    return True

def create_runpod_startup_script():
    """Create a RunPod startup script."""
    print("\n🔧 Creating RunPod startup script...")
    
    startup_script = '''#!/bin/bash
# RunPod Startup Script for AI Search System

set -e

echo "🚀 Starting AI Search System on RunPod..."

# Set up environment
export PYTHONPATH=/app
export OLLAMA_HOST=${OLLAMA_HOST:-http://localhost:11434}
export REDIS_URL=${REDIS_URL:-redis://localhost:6379}

# Create log directory
mkdir -p /var/log/supervisor

# Start Ollama in background (if not already running)
if ! pgrep -f ollama >/dev/null 2>&1; then
    echo "🦙 Starting Ollama..."
    ollama serve > /var/log/supervisor/ollama.log 2>&1 &
    sleep 10
    
    # Pull essential models
    echo "📚 Pulling essential models..."
    ollama pull llama2:7b-chat || echo "⚠️ Failed to pull llama2:7b-chat"
    ollama pull codellama:7b-instruct || echo "⚠️ Failed to pull codellama:7b-instruct"
fi

# Start Redis (if not already running)
if ! pgrep -f redis-server >/dev/null 2>&1; then
    echo "🗄️ Starting Redis..."
    redis-server --daemonize yes --logfile /app/logs/redis.log
fi

# Validate startup
echo "🔍 Running startup validation..."
python /app/scripts/validate_startup.py || {
    echo "❌ Startup validation failed, but continuing..."
}

# Start the main application
echo "🌟 Starting FastAPI application..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${RUNPOD_TCP_PORT_8000:-8000} --workers 1
'''
    
    script_path = project_root / "start-runpod.sh"
    with open(script_path, 'w', encoding='utf-8') as f:
        f.write(startup_script)
    
    # Make it executable
    script_path.chmod(0o755)
    print("✅ RunPod startup script created")
    return True

def create_runpod_commands():
    """Create RunPod deployment commands."""
    print("\n📋 Creating RunPod deployment commands...")
    
    commands = '''# RunPod Deployment Commands
# =========================

# 1. Build and push Docker image
docker build -f Dockerfile.runpod -t your-registry/ai-search-system:runpod .
docker push your-registry/ai-search-system:runpod

# 2. Create RunPod deployment with these settings:
# - Container Image: your-registry/ai-search-system:runpod
# - Container Disk: 20GB (minimum)
# - Expose HTTP Ports: 8000
# - GPU: A5000 or better (recommended)

# 3. Environment Variables to set in RunPod:
# OLLAMA_HOST=http://localhost:11434
# REDIS_URL=redis://localhost:6379
# ENVIRONMENT=production

# 4. After deployment, test with:
curl http://$RUNPOD_PUBLIC_IP:$RUNPOD_TCP_PORT_8000/health/live

# 5. Test chat API:
curl -X POST http://$RUNPOD_PUBLIC_IP:$RUNPOD_TCP_PORT_8000/api/v1/chat \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Hello, how are you?"}'
'''
    
    commands_path = project_root / "RUNPOD_DEPLOYMENT_COMMANDS.txt"
    with open(commands_path, 'w', encoding='utf-8') as f:
        f.write(commands)
    
    print("✅ RunPod deployment commands created")
    return True

def create_github_actions_workflow():
    """Create GitHub Actions workflow for automated builds."""
    print("\n🔄 Creating GitHub Actions workflow...")
    
    workflow_content = '''name: Build and Push Docker Image

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3
      
    - name: Log in to GitHub Container Registry
      uses: docker/login-action@v3
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
        
    - name: Extract metadata
      id: meta
      uses: docker/metadata-action@v5
      with:
        images: ghcr.io/${{ github.repository }}
        tags: |
          type=ref,event=branch
          type=ref,event=pr
          type=sha,prefix={{branch}}-
          type=raw,value=latest,enable={{is_default_branch}}
          
    - name: Build and push Docker image
      uses: docker/build-push-action@v5
      with:
        context: .
        file: ./Dockerfile.runpod
        push: true
        tags: ${{ steps.meta.outputs.tags }}
        labels: ${{ steps.meta.outputs.labels }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
        
    - name: Output image URL
      run: echo "Image pushed to ghcr.io/${{ github.repository }}:latest"
'''
    
    workflow_dir = project_root / ".github" / "workflows"
    workflow_dir.mkdir(parents=True, exist_ok=True)
    workflow_path = workflow_dir / "docker-build.yml"
    
    with open(workflow_path, 'w', encoding='utf-8') as f:
        f.write(workflow_content)
    
    print("✅ GitHub Actions workflow created")
    return True

def create_final_fix_script():
    """Create a final fix script that can be run on RunPod."""
    print("\n🔧 Creating final RunPod fix script...")
    
    fix_script = '''#!/usr/bin/env python3
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
    
    print(f"\\n📊 Applied {success_count}/{len(fixes)} fixes")
    
    # Start services
    print("\\n🚀 Starting services...")
    
    if os.path.exists('/etc/supervisor/supervisord.conf'):
        run_command("supervisord -c /etc/supervisor/supervisord.conf", "Starting supervisor")
    else:
        run_command("uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload", "Starting FastAPI directly")
    
    # Test the API
    time.sleep(5)
    if run_command("curl -f http://localhost:8000/health/live", "Testing API health"):
        print("\\n✅ All fixes applied and services started successfully!")
        print("🌐 API is ready at: http://localhost:8000")
        print("📖 API documentation: http://localhost:8000/docs")
    else:
        print("\\n⚠️ API health check failed, but services may still be starting...")
        print("💡 Check logs: tail -f /app/logs/*.log")
    
    return success_count == len(fixes)

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
'''
    
    script_path = project_root / "scripts" / "final-runpod-fix.py"
    with open(script_path, 'w', encoding='utf-8') as f:
        f.write(fix_script)
    
    script_path.chmod(0o755)
    print("✅ Final RunPod fix script created")
    return True

def main():
    """Run all deployment preparation steps."""
    print("🎯 Preparing complete RunPod deployment package...")
    
    steps = [
        create_runpod_dockerfile,
        create_supervisor_config,
        create_runpod_startup_script,
        create_runpod_commands,
        create_github_actions_workflow,
        create_final_fix_script,
    ]
    
    completed = 0
    for step in steps:
        try:
            if step():
                completed += 1
        except Exception as e:
            print(f"❌ Step failed: {e}")
    
    print(f"\n🎉 Deployment preparation complete! ({completed}/{len(steps)} steps)")
    print("\n📋 Next steps:")
    print("1. Commit and push all changes to GitHub")
    print("2. GitHub Actions will build the Docker image automatically")
    print("3. Use the image URL from GitHub Container Registry in RunPod")
    print("4. After deployment, run: python scripts/final-runpod-fix.py")
    print("5. Test the API: curl http://YOUR_RUNPOD_IP:PORT/health/live")
    
    return completed == len(steps)

if __name__ == "__main__":
    main()
