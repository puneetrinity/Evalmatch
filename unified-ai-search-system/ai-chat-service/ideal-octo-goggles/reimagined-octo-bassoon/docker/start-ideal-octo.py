#!/usr/bin/env python3
"""
Simple startup script for ideal-octo-goggles that respects PORT environment variable
"""
import os
import sys
import uvicorn

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8001"))
    host = "0.0.0.0"
    
    print(f"Starting ideal-octo-goggles on {host}:{port}")
    print(f"Current working directory: {os.getcwd()}")
    print(f"Python path: {sys.path}")
    
    try:
        # Add the current directory to Python path
        current_dir = os.getcwd()
        if current_dir not in sys.path:
            sys.path.insert(0, current_dir)
        
        # Try to import the app directly
        import importlib.util
        spec = importlib.util.spec_from_file_location("main_basic", "app/main_basic.py")
        main_basic = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(main_basic)
        
        app = main_basic.app
        print("Successfully imported main_basic app")
        
        uvicorn.run(app, host=host, port=port)
        
    except Exception as e:
        print(f"Error: {e}")
        print("Trying alternative import method...")
        
        try:
            # Alternative: run the file directly with uvicorn
            uvicorn.run("main_basic:app", host=host, port=port, app_dir="app")
        except Exception as e2:
            print(f"Alternative method also failed: {e2}")
            exit(1)
