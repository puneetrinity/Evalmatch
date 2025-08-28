#!/bin/sh

# Express startup script with all environment variables
echo "Starting Express server on port 8080..."

# Set Express-specific environment
export PORT=8080
export SERVE_STATIC=false
export NODE_ENV=production
export ENABLE_LOCAL_EMBEDDINGS=true
export EMBEDDING_MODEL=Xenova/all-MiniLM-L12-v2

# Log environment
echo "Express Environment:"
echo "- PORT: $PORT"
echo "- SERVE_STATIC: $SERVE_STATIC"
echo "- NODE_ENV: $NODE_ENV"
echo "- ENABLE_LOCAL_EMBEDDINGS: $ENABLE_LOCAL_EMBEDDINGS"
echo "- EMBEDDING_MODEL: $EMBEDDING_MODEL"
echo "- DATABASE_URL: $(echo $DATABASE_URL | sed 's/:.*/:*****/')"

# Start Express server
exec node ./dist/index.js