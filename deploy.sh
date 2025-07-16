#!/bin/bash

# Create necessary directories
mkdir -p dist/client dist/server

# Build frontend
echo "Building frontend..."
npx vite build --outDir=dist/client

# Build backend
echo "Building backend..."
npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist/server

# Copy needed server files
echo "Copying server files..."
cp -r server/lib dist/server/
cp -r server/config dist/server/
cp -r server/monitoring dist/server/

# Copy shared files
echo "Copying shared files..."
mkdir -p dist/shared
cp -r shared dist/

echo "Build completed successfully!"