#!/usr/bin/env python3
"""
Unified startup script for the AI Search System.
This script starts both the ubiquitous-octo-invention and ideal-octo-goggles services.
"""

import subprocess
import sys
import time
import os
import signal
import atexit
from pathlib import Path

class AISearchSystemLauncher:
    def __init__(self):
        self.processes = []
        self.base_dir = Path(__file__).parent
        self.ideal_octo_dir = self.base_dir.parent / "ideal-octo-goggles"
        
    def start_services(self):
        """Start both services"""
        print("🚀 Starting AI Search System...")
        print("=" * 50)
        
        # Register cleanup function
        atexit.register(self.cleanup)
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
        try:
            # Start ideal-octo-goggles (document search service)
            print("🔍 Starting ideal-octo-goggles service on port 8001...")
            if self.ideal_octo_dir.exists():
                # Try using the basic main file if the full one has issues
                ideal_cmd = [
                    sys.executable, "-c",
                    "import sys; sys.path.append('.'); " +
                    "import uvicorn; " +
                    "uvicorn.run('app.main_basic:app', host='0.0.0.0', port=8001, reload=False)"
                ]
                
                ideal_process = subprocess.Popen(
                    ideal_cmd,
                    cwd=str(self.ideal_octo_dir),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    universal_newlines=True
                )
                self.processes.append(('ideal-octo-goggles', ideal_process))
                print("   ✅ ideal-octo-goggles started (PID: {})".format(ideal_process.pid))
            else:
                print("   ⚠️  ideal-octo-goggles directory not found, skipping...")
            
            # Wait a moment for the first service to start
            time.sleep(3)
            
            # Start ubiquitous-octo-invention (main AI service)
            print("🤖 Starting ubiquitous-octo-invention service on port 8000...")
            
            # Create a simplified startup for testing
            main_cmd = [
                sys.executable, "-c",
                "print('Starting ubiquitous-octo-invention...'); " +
                "import time; " +
                "from pathlib import Path; " +
                "import sys; " +
                "sys.path.append('.'); " +
                "try: " +
                "    import uvicorn; " +
                "    print('Starting FastAPI server...'); " +
                "    uvicorn.run('app.main:app', host='0.0.0.0', port=8000, reload=False); " +
                "except ImportError as e: " +
                "    print(f'Import error: {e}'); " +
                "    print('Running demo mode instead...'); " +
                "    exec(open('integration_demo.py').read()) " +
                "except Exception as e: " +
                "    print(f'Startup error: {e}'); " +
                "    import http.server; " +
                "    import socketserver; " +
                "    import os; " +
                "    os.chdir('static'); " +
                "    with socketserver.TCPServer(('', 8000), http.server.SimpleHTTPRequestHandler) as httpd: " +
                "        print('Serving static files on port 8000...'); " +
                "        httpd.serve_forever()"
            ]
            
            main_process = subprocess.Popen(
                main_cmd,
                cwd=str(self.base_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True
            )
            self.processes.append(('ubiquitous-octo-invention', main_process))
            print("   ✅ ubiquitous-octo-invention started (PID: {})".format(main_process.pid))
            
            print("\n🎯 Services Status:")
            print("   📱 Web UI: http://localhost:8000/ui/")
            print("   🤖 Chat Interface: http://localhost:8000/ui/chat")
            print("   📊 Demo Page: http://localhost:8000/ui/demo")
            print("   🔍 Search Service: http://localhost:8001/")
            print("   📚 API Docs: http://localhost:8000/docs")
            
            print("\n✨ Integration Features Available:")
            print("   🚀 Unified Search & Chat")
            print("   ⚡ Ultra-fast Document Search")
            print("   💬 AI Conversation")
            print("   📚 Research Assistant")
            
            print("\n⏹️  Press Ctrl+C to stop all services")
            print("=" * 50)
            
            # Monitor processes
            self.monitor_processes()
            
        except KeyboardInterrupt:
            print("\n🛑 Stopping services...")
            self.cleanup()
        except Exception as e:
            print(f"❌ Error starting services: {e}")
            self.cleanup()
            
    def monitor_processes(self):
        """Monitor running processes and handle output"""
        try:
            while True:
                for name, process in self.processes:
                    if process.poll() is not None:
                        print(f"⚠️  {name} has stopped (return code: {process.returncode})")
                        # Try to restart or handle failure
                        
                time.sleep(5)
                
        except KeyboardInterrupt:
            pass
            
    def signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        print(f"\n🛑 Received signal {signum}, shutting down...")
        self.cleanup()
        sys.exit(0)
        
    def cleanup(self):
        """Clean up running processes"""
        print("🧹 Cleaning up processes...")
        for name, process in self.processes:
            if process.poll() is None:
                print(f"   Stopping {name} (PID: {process.pid})")
                try:
                    process.terminate()
                    time.sleep(2)
                    if process.poll() is None:
                        process.kill()
                except:
                    pass
        
        self.processes.clear()
        print("✅ Cleanup complete")

def main():
    """Main entry point"""
    print("🤖 AI Search System Unified Launcher")
    print("Integrating ubiquitous-octo-invention + ideal-octo-goggles")
    print()
    
    launcher = AISearchSystemLauncher()
    launcher.start_services()

if __name__ == "__main__":
    main()
