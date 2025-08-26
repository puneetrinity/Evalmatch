#!/bin/bash
# EvalMatch TypeScript SDK - Bundle size monitoring hook
# Ensures bundle stays under 50KB limit per SDK improvement plan

set -e

echo "📦 Checking bundle size for EvalMatch SDK..."

# Change to SDK directory
cd "$(dirname "$0")/../.."

# Only run if source files were modified
if [[ "$CLAUDE_TOOL_ARGS" == *"src/"* ]] && [[ "$CLAUDE_TOOL_ARGS" != *"test"* ]]; then
    echo "🔍 Source code modified, checking bundle impact..."
    
    # Build the SDK
    echo "🔧 Building SDK..."
    if ! npm run build; then
        echo "❌ Build failed!"
        exit 1
    fi
    
    # Check if size-limit is available
    if npm list size-limit >/dev/null 2>&1; then
        echo "📏 Running size-limit check..."
        if ! npx size-limit; then
            echo "❌ Bundle size limit exceeded!"
            echo "💡 Current target: <50KB for main bundle"
            echo "💡 Consider:"
            echo "   - Tree-shaking unused imports"
            echo "   - Code splitting large features"
            echo "   - Removing heavy dependencies"
            exit 1
        fi
        echo "✅ Bundle size within limits!"
    else
        # Manual size check if size-limit not configured
        if [ -f "dist/index.esm.js" ]; then
            SIZE=$(wc -c < dist/index.esm.js)
            SIZE_KB=$((SIZE / 1024))
            echo "📊 Bundle size: ${SIZE_KB}KB"
            
            if [ $SIZE_KB -gt 50 ]; then
                echo "❌ Bundle size (${SIZE_KB}KB) exceeds 50KB limit!"
                echo "💡 Optimize bundle size per Phase 2.1 requirements"
                exit 1
            fi
            echo "✅ Bundle size (${SIZE_KB}KB) within 50KB limit!"
        fi
    fi
else
    echo "📄 No source changes detected, skipping bundle check"
fi

echo "🎉 Bundle validation completed!"