#!/bin/bash

echo "🛑 Stopping local development environment..."
docker-compose -f docker-compose.local.yml down

echo "✅ Local development environment stopped"
