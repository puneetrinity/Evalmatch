#!/bin/bash

# Evalmatch Docker Test Runner
# This script provides an easy interface for running tests in Docker containers

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to display usage
usage() {
    echo "Usage: $0 [OPTIONS] [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  all              Run all tests (default)"
    echo "  unit             Run unit tests only"
    echo "  integration      Run integration tests only"
    echo "  watch            Run tests in watch mode"
    echo "  coverage         Run tests with coverage report"
    echo "  specific FILE    Run a specific test file"
    echo "  build            Build the test Docker image"
    echo "  clean            Remove test containers and images"
    echo ""
    echo "Options:"
    echo "  -h, --help       Show this help message"
    echo "  -v, --verbose    Show detailed output"
    echo ""
    echo "Examples:"
    echo "  $0                    # Run all tests"
    echo "  $0 unit               # Run unit tests only"
    echo "  $0 watch              # Run tests in watch mode"
    echo "  $0 specific auth.test # Run auth test file"
}

# Function to build test image
build_image() {
    echo -e "${YELLOW}Building test Docker image...${NC}"
    docker build -f Dockerfile.test -t evalmatch-test:latest .
    echo -e "${GREEN}Test image built successfully${NC}"
}

# Function to run tests
run_tests() {
    local service=$1
    local extra_args=$2
    
    echo -e "${YELLOW}Running tests with service: $service${NC}"
    
    # Check if image exists, build if not
    if ! docker image inspect evalmatch-test:latest >/dev/null 2>&1; then
        build_image
    fi
    
    # Run the tests
    docker-compose -f docker-compose.test.yml run --rm $service $extra_args
}

# Function to clean up
cleanup() {
    echo -e "${YELLOW}Cleaning up test containers and images...${NC}"
    docker-compose -f docker-compose.test.yml down -v
    docker rmi evalmatch-test:latest 2>/dev/null || true
    echo -e "${GREEN}Cleanup complete${NC}"
}

# Main script logic
case "${1:-all}" in
    all)
        run_tests "test"
        ;;
    unit)
        run_tests "test-unit"
        ;;
    integration)
        run_tests "test-integration"
        ;;
    watch)
        run_tests "test-watch"
        ;;
    coverage)
        run_tests "test-coverage"
        # Copy coverage report to host
        docker cp $(docker ps -lq):/app/coverage ./coverage 2>/dev/null || true
        echo -e "${GREEN}Coverage report saved to ./coverage${NC}"
        ;;
    specific)
        if [ -z "$2" ]; then
            echo -e "${RED}Error: Please specify a test file${NC}"
            usage
            exit 1
        fi
        run_tests "test-file" "$2"
        ;;
    build)
        build_image
        ;;
    clean)
        cleanup
        ;;
    -h|--help)
        usage
        exit 0
        ;;
    *)
        echo -e "${RED}Error: Unknown command '$1'${NC}"
        usage
        exit 1
        ;;
esac

# Check exit status
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Tests completed successfully${NC}"
else
    echo -e "${RED}✗ Tests failed${NC}"
    exit 1
fi