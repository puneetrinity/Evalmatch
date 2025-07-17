#!/usr/bin/env python3
import os
import time

# Test 2: Just print and exit - no web server
print("Starting test...")
print(f"PORT environment variable: {os.getenv('PORT', 'not set')}")
print(f"RAILWAY_ENVIRONMENT: {os.getenv('RAILWAY_ENVIRONMENT', 'not set')}")
print("Test completed - this should show in Railway logs")

# Keep alive for 30 seconds to see if container starts
time.sleep(30)
print("Exiting after 30 seconds")