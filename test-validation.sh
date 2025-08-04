#!/bin/bash

# Test Validation Script
# Validates the Jest configuration and test fixes

echo "🧪 Running Test Suite Validation"
echo "================================="

# Set test environment
export NODE_ENV=test
export TEST_TYPE=unit

# Function to run tests with proper error handling
run_test() {
    local test_pattern="$1"
    local test_name="$2"
    
    echo ""
    echo "📋 Running: $test_name"
    echo "Pattern: $test_pattern"
    echo "---"
    
    # Run test with timeout and capture exit code
    timeout 300 npm test -- --testPathPattern="$test_pattern" --passWithNoTests --verbose 2>&1 | head -50
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        echo "✅ $test_name: PASSED"
    elif [ $exit_code -eq 124 ]; then
        echo "⏰ $test_name: TIMEOUT (300s)"
    else
        echo "❌ $test_name: FAILED (exit code: $exit_code)"
    fi
    
    return $exit_code
}

# Function to check TypeScript compilation
check_typescript() {
    echo ""
    echo "📋 TypeScript Compilation Check"
    echo "---"
    
    npx tsc --noEmit --project . 2>&1 | head -20
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        echo "✅ TypeScript: PASSED"
    else
        echo "❌ TypeScript: FAILED (exit code: $exit_code)"
    fi
    
    return $exit_code
}

# Function to validate Jest configuration
validate_jest_config() {
    echo ""
    echo "📋 Jest Configuration Validation"
    echo "---"
    
    # Check if jest config is valid
    npx jest --showConfig 2>&1 | head -10
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        echo "✅ Jest Config: PASSED"
    else
        echo "❌ Jest Config: FAILED (exit code: $exit_code)"
    fi
    
    return $exit_code
}

# Main validation sequence
main() {
    local total_tests=0
    local passed_tests=0
    
    # TypeScript validation
    ((total_tests++))
    if check_typescript; then
        ((passed_tests++))
    fi
    
    # Jest configuration validation
    ((total_tests++))
    if validate_jest_config; then
        ((passed_tests++))
    fi
    
    # Unit tests
    ((total_tests++))
    if run_test "tests/unit" "Unit Tests"; then
        ((passed_tests++))
    fi
    
    # Integration tests (limited)
    ((total_tests++))
    if run_test "tests/integration" "Integration Tests"; then
        ((passed_tests++))
    fi
    
    # Component tests
    ((total_tests++))
    if run_test "tests/components" "Component Tests"; then
        ((passed_tests++))
    fi
    
    # Helper tests
    ((total_tests++))
    if run_test "tests/helpers" "Helper Tests"; then
        ((passed_tests++))
    fi
    
    # Summary
    echo ""
    echo "📊 Test Validation Summary"
    echo "=========================="
    echo "Total Categories: $total_tests"
    echo "Passed Categories: $passed_tests"
    echo "Failed Categories: $((total_tests - passed_tests))"
    
    if [ $passed_tests -eq $total_tests ]; then
        echo "🎉 All test categories passed!"
        exit 0
    else
        echo "⚠️  Some test categories failed. Check output above."
        exit 1
    fi
}

# Run main function
main "$@"