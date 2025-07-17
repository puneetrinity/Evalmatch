#!/usr/bin/env python3
import os
import sys

print("Starting FastAPI test...")
print(f"Python version: {sys.version}")
print(f"PORT: {os.getenv('PORT', 'not set')}")
print(f"RAILWAY_ENVIRONMENT: {os.getenv('RAILWAY_ENVIRONMENT', 'not set')}")

try:
    from fastapi import FastAPI
    print("FastAPI imported successfully")
    
    app = FastAPI()
    print("FastAPI app created")
    
    @app.get("/")
    def read_root():
        return {"Hello": "World", "Port": os.getenv("PORT", "8000")}
    
    @app.get("/health")
    def health():
        return {"status": "ok"}
    
    print("Routes defined")
    
    if __name__ == "__main__":
        import uvicorn
        port = int(os.getenv("PORT", 8000))
        print(f"Starting uvicorn on port {port}")
        uvicorn.run(app, host="0.0.0.0", port=port)
        
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)