FROM node:20.19.0-slim

# Install system dependencies for PDF processing and AI models
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    tesseract-ocr \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Update npm to latest version and install dependencies
# Fix SSL/TLS cipher issues with environment variables
ENV NPM_CONFIG_STRICT_SSL=false
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_MAXSOCKETS=1
ENV NPM_CONFIG_LEGACY_PEER_DEPS=true
RUN npm install -g npm@10 && \
    npm ci --legacy-peer-deps --no-audit --no-fund && \
    npm cache clean --force

# Create necessary directories with proper permissions
RUN mkdir -p uploads uploads/temp data build build/public && \
    chmod 755 uploads uploads/temp data build build/public

# Copy source files (this layer changes most frequently)
COPY . .

# Make start script executable
RUN chmod +x start.sh

# Build arguments for Firebase environment variables with defaults
ARG VITE_FIREBASE_API_KEY=placeholder-api-key
ARG VITE_FIREBASE_AUTH_DOMAIN=placeholder.firebaseapp.com
ARG VITE_FIREBASE_PROJECT_ID=placeholder-project
ARG VITE_FIREBASE_STORAGE_BUCKET=placeholder.appspot.com
ARG VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
ARG VITE_FIREBASE_APP_ID=1:123456789:web:abcdef

# Set environment variables for build process
ENV RAILWAY_ENVIRONMENT=true
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID

# Build the application with environment variables available
RUN npm run build

# Clean up some dev dependencies but keep Vite for potential dynamic imports
RUN npm prune --omit=dev --ignore-scripts && npm install vite

# Copy SQL migration files (not bundled by esbuild)
COPY server/migrations/ /app/build/migrations/
RUN ls -la /app/build/ && echo "Build completed successfully"

# Set runtime environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Enable static file serving - Railway single container
ENV SERVE_STATIC=true

# Phase 2 Optimization Settings
ENV EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
ENV MAX_CONCURRENT_EMBEDDINGS=3
ENV MAX_TEXT_LENGTH=50000
ENV MIN_ASCII_RATIO=0.8

# Performance and caching optimization
ENV TRANSFORMERS_CACHE=/tmp/transformers_cache
ENV NODE_OPTIONS="--max-old-space-size=7168 --max-semi-space-size=256"

# Railway memory debugging
ENV RAILWAY_DEBUG_MEMORY=true

# Create cache directory for AI models
RUN mkdir -p /tmp/transformers_cache && chmod 755 /tmp/transformers_cache

# Expose the port the app runs on
EXPOSE 8080

# Add health check for better container monitoring
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

# Add curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Use the unified start script that handles all scenarios
CMD ["./start.sh"]