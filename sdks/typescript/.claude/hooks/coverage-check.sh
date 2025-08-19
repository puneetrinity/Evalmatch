#!/bin/bash
# EvalMatch TypeScript SDK - Test coverage monitoring hook
# Ensures 85%+ test coverage per SDK improvement plan

set -e

echo "🧪 Checking test coverage for EvalMatch SDK..."

# Change to SDK directory
cd "$(dirname "$0")/../.."

# Run coverage check if test files or source files were modified
if [[ "$CLAUDE_TOOL_ARGS" == *"test"* ]] || [[ "$CLAUDE_TOOL_ARGS" == *"src/"* ]]; then
    echo "🔍 Code changes detected, running coverage check..."
    
    # Run tests with coverage
    echo "📊 Running tests with coverage analysis..."
    if ! npm run test:coverage; then
        echo "❌ Tests failed or coverage below threshold!"
        echo "💡 Target: 85%+ coverage for statements, branches, functions, lines"
        echo "💡 Add tests for uncovered code paths"
        exit 1
    fi
    
    echo "✅ Test coverage validation passed!"
else
    echo "📄 No test/source changes detected, skipping coverage check"
fi

echo "🎉 Coverage validation completed!"