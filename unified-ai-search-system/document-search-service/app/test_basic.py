#!/usr/bin/env python3
import os
import sys

print("=== Railway Debug Info ===")
print(f"Python version: {sys.version}")
print(f"PORT environment variable: {os.getenv('PORT', 'not set')}")
print(f"RAILWAY_ENVIRONMENT: {os.getenv('RAILWAY_ENVIRONMENT', 'not set')}")

try:
    # Test 1: Pure Python web server (no FastAPI)
    from http.server import HTTPServer, BaseHTTPRequestHandler
    import json
    
    print("Successfully imported http.server and json")

    class TestHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            print(f"Received GET request for {self.path}")
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            response = {
                "message": "Basic Python HTTP server working!",
                "port": os.getenv("PORT", "8000"),
                "path": self.path,
                "railway_env": os.getenv("RAILWAY_ENVIRONMENT", "not set")
            }
            self.wfile.write(json.dumps(response).encode())
            print(f"Sent response: {response}")

    if __name__ == "__main__":
        port = int(os.getenv("PORT", 8080))
        print(f"Attempting to start server on 0.0.0.0:{port}")
        
        server = HTTPServer(('0.0.0.0', port), TestHandler)
        print(f"✅ HTTP server created successfully")
        print(f"✅ Listening on 0.0.0.0:{port}")
        print(f"✅ Server starting now...")
        
        server.serve_forever()
        
except Exception as e:
    print(f"❌ Error starting server: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)