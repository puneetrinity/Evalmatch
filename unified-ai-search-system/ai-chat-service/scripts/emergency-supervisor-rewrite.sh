#!/bin/bash
# Emergency supervisor config rewriter
# This script completely rewrites the supervisor config at runtime

CONFIG_FILE="/etc/supervisor/conf.d/ai-search.conf"

echo "🔧 EMERGENCY: Writing completely fresh supervisor config..."

cat > "$CONFIG_FILE" << 'EOF'
# Emergency rewritten supervisor configuration
# Generated at runtime to ensure correct paths

[program:redis]
command=redis-server --bind 0.0.0.0 --port 6379 --save 60 1000 --appendonly yes --protected-mode no
directory=/app
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/redis.err.log
stdout_logfile=/var/log/supervisor/redis.out.log
user=root
priority=50
startsecs=5
startretries=3

[program:ollama]
command=/usr/local/bin/ollama serve
directory=/app
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/ollama.err.log
stdout_logfile=/var/log/supervisor/ollama.out.log
user=root
environment=OLLAMA_HOST="0.0.0.0:11434",CUDA_VISIBLE_DEVICES="0",OLLAMA_MODELS="/root/.ollama/models"
priority=100
startsecs=10
startretries=3

[program:ai-search-api]
command=python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --log-level info
directory=/app
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/api.err.log
stdout_logfile=/var/log/supervisor/api.out.log
user=root
environment=REDIS_URL="redis://localhost:6379",OLLAMA_BASE_URL="http://localhost:11434",PYTHONPATH="/app",ALLOWED_ORIGINS="*",DEFAULT_MODEL="llama3.2:latest",ENVIRONMENT="production"
priority=300
startsecs=15
startretries=5

[program:model-init]
command=/bin/bash -c "sleep 30 && python3 scripts/final-runpod-fix.py"
directory=/app
autostart=false
autorestart=false
startsecs=0
stderr_logfile=/var/log/supervisor/model-init.err.log
stdout_logfile=/var/log/supervisor/model-init.out.log
user=root
priority=400
exitcodes=0
stopsignal=TERM

[program:health-monitor]
command=/bin/bash -c "while true; do curl -s http://localhost:8000/health/live > /dev/null || echo 'Health check failed at $(date)'; sleep 60; done"
directory=/app
autostart=true
autorestart=true
startsecs=60
stderr_logfile=/var/log/supervisor/health.err.log
stdout_logfile=/var/log/supervisor/health.out.log
user=root
priority=500
EOF

echo "✅ Fresh supervisor config written to $CONFIG_FILE"
echo "📝 Config contents:"
cat "$CONFIG_FILE"
