#!/bin/bash
# EvalMatch TypeScript SDK - Security scanning hook
# Checks for vulnerabilities and security issues

set -e

echo "🔒 Running security scan for EvalMatch SDK..."

# Change to SDK directory
cd "$(dirname "$0")/../.."

# Run security audit
echo "🔍 Checking for npm vulnerabilities..."
if ! npm audit --audit-level=moderate; then
    echo "❌ Security vulnerabilities found!"
    echo "💡 Run 'npm audit fix' to resolve issues"
    echo "💡 For manual fixes, check 'npm audit fix --force'"
    exit 1
fi

# Check for hardcoded secrets (basic patterns)
if [[ "$CLAUDE_TOOL_ARGS" == *".ts"* ]] || [[ "$CLAUDE_TOOL_ARGS" == *".js"* ]]; then
    echo "🔍 Scanning for potential secrets in code..."
    
    # Extract filename from tool arguments (basic approach)
    FILES=$(echo "$CLAUDE_TOOL_ARGS" | grep -oE '[^[:space:]]*\.(ts|js)[^[:space:]]*' || true)
    
    for FILE in $FILES; do
        if [ -f "$FILE" ]; then
            # Check for common secret patterns
            if grep -qiE "(api[_-]?key|secret|password|token).*(=|:).*([\"\'][^\"\']{20,}[\"\'])" "$FILE"; then
                echo "⚠️  Potential hardcoded secret detected in $FILE"
                echo "💡 Ensure secrets are not committed to repository"
                echo "💡 Use environment variables or secure config"
            fi
        fi
    done
fi

echo "✅ Security scan completed!"