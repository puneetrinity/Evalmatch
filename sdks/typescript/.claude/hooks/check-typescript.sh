#!/bin/bash
# EvalMatch TypeScript SDK - Type checking and linting hook
# Runs after file edits to ensure code quality

set -e

echo "🔍 Running TypeScript validation for EvalMatch SDK..."

# Change to SDK directory
cd "$(dirname "$0")/../.."

# Check if this is a TypeScript file
if [[ "$CLAUDE_TOOL_ARGS" == *".ts"* ]] || [[ "$CLAUDE_TOOL_ARGS" == *".tsx"* ]]; then
    echo "📝 TypeScript file detected, running checks..."
    
    # Run TypeScript compiler check
    echo "🔧 Checking TypeScript compilation..."
    if ! npx tsc --noEmit --skipLibCheck; then
        echo "❌ TypeScript compilation failed!"
        echo "💡 Fix the type errors above before continuing"
        exit 1
    fi
    
    # Run ESLint
    echo "🔍 Running ESLint..."
    if ! npm run lint; then
        echo "❌ ESLint found issues!"
        echo "💡 Run 'npm run lint:fix' to auto-fix some issues"
        exit 1
    fi
    
    echo "✅ TypeScript validation passed!"
else
    echo "📄 Non-TypeScript file, skipping TypeScript checks"
fi

# Always run tests if test files were modified
if [[ "$CLAUDE_TOOL_ARGS" == *"test"* ]] || [[ "$CLAUDE_TOOL_ARGS" == *"spec"* ]]; then
    echo "🧪 Test file detected, running related tests..."
    if ! npm test; then
        echo "❌ Tests failed!"
        echo "💡 Fix the failing tests before continuing"
        exit 1
    fi
    echo "✅ Tests passed!"
fi

echo "🎉 All validations passed for EvalMatch SDK!"