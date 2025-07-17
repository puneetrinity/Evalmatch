#!/bin/bash
set -e

# Flexible entrypoint script for AI Search System
# Supports both supervised mode and direct shell access

# Function to start all services
start_services() {
    echo "🚀 Starting AI Search System in supervised mode..."
    
    # Ensure log directories exist
    mkdir -p /var/log/supervisor /app/logs
    
    # Start Redis in background if not already running
    if ! pgrep redis-server > /dev/null; then
        echo "📡 Starting Redis server..."
        redis-server --daemonize yes --logfile /var/log/supervisor/redis.log
    fi
    
    # Start Ollama in background if not already running
    if ! pgrep ollama > /dev/null; then
        echo "🤖 Starting Ollama server..."
        ollama serve > /var/log/supervisor/ollama.log 2>&1 &
        
        # Wait for Ollama to be ready
        echo "⏳ Waiting for Ollama to be ready..."
        for i in {1..30}; do
            if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
                echo "✅ Ollama is ready"
                break
            fi
            sleep 2
        done
    fi
    
    # Initialize models if needed
    if [ -f "/app/scripts/init-models.sh" ]; then
        echo "🔧 Initializing models..."
        bash /app/scripts/init-models.sh
    fi
    
    # Start the main application with supervisor
    echo "🎯 Starting main application with supervisor..."
    exec supervisord -c /app/docker/supervisord.conf -n
}

# Function to start shell
start_shell() {
    echo "🐚 Starting interactive shell..."
    exec /bin/bash
}

# Main execution logic
case "${1:-supervised}" in
    supervised)
        start_services
        ;;
    shell)
        start_shell
        ;;
    *)
        echo "Usage: $0 {supervised|shell}"
        echo "  supervised: Start all services with supervisor (default)"
        echo "  shell: Start interactive shell for debugging"
        exit 1
        ;;
esac