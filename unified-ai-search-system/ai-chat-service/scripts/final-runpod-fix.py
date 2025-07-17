#!/usr/bin/env python3
"""
Final RunPod fix script - performs post-deployment optimizations
"""

import os
import sys
import time
import subprocess
import json
from pathlib import Path

def log(message):
    """Log with timestamp"""
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[RUNPOD-FIX] {message}")

def run_command(cmd, timeout=30):
    """Run shell command with timeout"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, 
                              text=True, timeout=timeout)
        return result.returncode == 0, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return False, "", "Command timed out"

def check_gpu_memory():
    """Check GPU memory usage"""
    log("Checking GPU memory...")
    success, stdout, stderr = run_command("nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits")
    
    if success:
        lines = stdout.strip().split('\n')
        for i, line in enumerate(lines):
            if line.strip():
                used, total = line.split(',')
                log(f"GPU {i}: {used.strip()}MB / {total.strip()}MB used")
    else:
        log("Could not check GPU memory")

def optimize_ollama():
    """Optimize Ollama configuration"""
    log("Optimizing Ollama configuration...")
    
    # Set Ollama environment variables for RunPod
    os.environ['OLLAMA_KEEP_ALIVE'] = '24h'
    os.environ['OLLAMA_MAX_LOADED_MODELS'] = '3'
    os.environ['OLLAMA_NUM_PARALLEL'] = '2'
    
    log("Ollama environment optimized for RunPod")

def setup_workspace_links():
    """Create workspace symlinks for RunPod"""
    log("Setting up workspace links...")
    
    workspace_links = [
        ('/app', '/workspace/app'),
        ('/app/logs', '/workspace/logs'),
        ('/app/scripts/health-check.sh', '/workspace/health-check.sh'),
        ('/app/scripts/init-models.sh', '/workspace/init-models.sh'),
    ]
    
    for source, target in workspace_links:
        try:
            if os.path.exists(source):
                # Remove existing link if it exists
                if os.path.islink(target):
                    os.unlink(target)
                elif os.path.exists(target):
                    continue  # Don't overwrite existing files
                
                # Create parent directory
                os.makedirs(os.path.dirname(target), exist_ok=True)
                
                # Create symlink
                os.symlink(source, target)
                log(f"Created link: {target} -> {source}")
        except Exception as e:
            log(f"Failed to create link {target}: {e}")

def setup_jupyter_notebook():
    """Setup Jupyter notebook integration"""
    log("Setting up Jupyter integration...")
    
    try:
        # Create a simple notebook for testing
        notebook_content = {
            "cells": [
                {
                    "cell_type": "markdown",
                    "metadata": {},
                    "source": [
                        "# AI Search System - RunPod Interface\n",
                        "\n",
                        "This notebook provides a convenient interface for interacting with the AI Search System on RunPod."
                    ]
                },
                {
                    "cell_type": "code",
                    "execution_count": None,
                    "metadata": {},
                    "source": [
                        "import requests\n",
                        "import json\n",
                        "\n",
                        "# Test system health\n",
                        "response = requests.get('http://localhost:8000/health')\n",
                        "print('System Health:', response.json())"
                    ]
                }
            ],
            "metadata": {
                "kernelspec": {
                    "display_name": "Python 3",
                    "language": "python",
                    "name": "python3"
                }
            },
            "nbformat": 4,
            "nbformat_minor": 4
        }
        
        # Write notebook to workspace
        notebook_path = "/workspace/AI_Search_Interface.ipynb"
        with open(notebook_path, 'w') as f:
            json.dump(notebook_content, f, indent=2)
        
        log(f"Created Jupyter notebook: {notebook_path}")
        
    except Exception as e:
        log(f"Failed to create Jupyter notebook: {e}")

def cleanup_logs():
    """Clean up old logs"""
    log("Cleaning up old logs...")
    
    # Remove old log files > 100MB
    success, stdout, stderr = run_command(
        "find /var/log/supervisor -name '*.log' -size +100M -delete"
    )
    
    if success:
        log("Cleaned up large log files")

def main():
    """Main RunPod optimization routine"""
    log("🚀 Running final RunPod optimizations...")
    
    # Wait for services to stabilize
    time.sleep(10)
    
    tasks = [
        ("GPU Memory Check", check_gpu_memory),
        ("Ollama Optimization", optimize_ollama),
        ("Workspace Links", setup_workspace_links),
        ("Jupyter Setup", setup_jupyter_notebook),
        ("Log Cleanup", cleanup_logs),
    ]
    
    for task_name, task_func in tasks:
        log(f"📋 Running {task_name}...")
        try:
            task_func()
            log(f"✅ {task_name} completed")
        except Exception as e:
            log(f"❌ {task_name} failed: {e}")
    
    log("🏁 RunPod optimizations complete!")
    
    # Log final status
    log("System ready for use:")
    log("  - FastAPI: http://localhost:8000")
    log("  - Ollama: http://localhost:11434") 
    log("  - Jupyter: /workspace/AI_Search_Interface.ipynb")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())