#!/bin/bash

# Set environment
export NODE_ENV=production

# Check if we need to run database migrations first
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Running database migrations..."
  npx tsx server/migrate.ts
fi

# Start the server
echo "Starting server..."
node dist/index.js