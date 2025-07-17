"""
Web UI endpoints for the unified AI chat interface.
Serves the static files and provides API endpoints for the chat UI.
"""

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import os
from pathlib import Path

router = APIRouter(prefix="/ui", tags=["Web UI"])

# Get the static directory path
STATIC_DIR = Path(__file__).parent.parent / "static"

@router.get("/", response_class=HTMLResponse)
async def serve_chat_ui():
    """Serve the main unified chat interface"""
    try:
        with open(STATIC_DIR / "unified_chat.html", "r", encoding="utf-8") as f:
            content = f.read()
        return HTMLResponse(content=content)
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Chat UI not found</h1><p>Please ensure unified_chat.html exists in the static directory.</p>",
            status_code=404
        )

@router.get("/chat", response_class=HTMLResponse) 
async def serve_chat_interface():
    """Alternative endpoint for the chat interface"""
    return await serve_chat_ui()

@router.get("/demo", response_class=HTMLResponse)
async def serve_demo_page():
    """Serve a demo page showing the integration capabilities"""
    demo_html = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Search System Demo</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                max-width: 1200px;
                margin: 0 auto;
                padding: 40px 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                color: white;
            }
            .container {
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                border-radius: 20px;
                padding: 40px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            }
            h1 {
                text-align: center;
                margin-bottom: 30px;
                font-size: 2.5em;
            }
            .feature-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 30px;
                margin: 40px 0;
            }
            .feature-card {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 15px;
                padding: 30px;
                text-align: center;
                transition: transform 0.3s ease;
            }
            .feature-card:hover {
                transform: translateY(-5px);
            }
            .feature-icon {
                font-size: 3em;
                margin-bottom: 20px;
            }
            .cta-button {
                display: inline-block;
                background: #3498db;
                color: white;
                padding: 15px 30px;
                border-radius: 25px;
                text-decoration: none;
                font-weight: bold;
                margin: 20px 10px;
                transition: all 0.3s ease;
            }
            .cta-button:hover {
                background: #2980b9;
                transform: scale(1.05);
            }
            .status-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 20px;
                margin: 30px 0;
            }
            .status-card {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                padding: 20px;
                text-align: center;
            }
            .status-indicator {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: #27ae60;
                margin: 0 auto 10px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚀 AI Search System Integration</h1>
            
            <p style="text-align: center; font-size: 1.2em; margin-bottom: 40px;">
                Experience the power of unified AI search and conversation technology
            </p>

            <div class="feature-grid">
                <div class="feature-card">
                    <div class="feature-icon">⚡</div>
                    <h3>Ultra-Fast Search</h3>
                    <p>Search through documents with sub-second response times using advanced FAISS indexing and vector embeddings.</p>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">🤖</div>
                    <h3>AI Conversation</h3>
                    <p>Engage in intelligent conversations with context-aware responses and multi-turn dialogue capabilities.</p>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">🔍</div>
                    <h3>Unified Search</h3>
                    <p>Seamlessly search across documents, web content, and academic sources with intelligent routing.</p>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">📊</div>
                    <h3>Research Assistant</h3>
                    <p>Comprehensive research capabilities with source synthesis and intelligent analysis.</p>
                </div>
            </div>

            <div style="text-align: center; margin: 40px 0;">
                <a href="/ui/chat" class="cta-button">🚀 Launch Chat Interface</a>
                <a href="/docs" class="cta-button">📚 API Documentation</a>
                <a href="/health" class="cta-button">⚡ System Status</a>
            </div>

            <h3 style="text-align: center; margin-top: 50px;">System Status</h3>
            <div class="status-grid">
                <div class="status-card">
                    <div class="status-indicator" id="chat-status"></div>
                    <h4>Chat Service</h4>
                    <p id="chat-text">Checking...</p>
                </div>
                <div class="status-card">
                    <div class="status-indicator" id="search-status"></div>
                    <h4>Search Service</h4>
                    <p id="search-text">Checking...</p>
                </div>
                <div class="status-card">
                    <div class="status-indicator" id="unified-status"></div>
                    <h4>Unified API</h4>
                    <p id="unified-text">Checking...</p>
                </div>
            </div>
        </div>

        <script>
            // Check system status
            async function checkStatus() {
                try {
                    const response = await fetch('/health');
                    if (response.ok) {
                        document.getElementById('chat-status').style.background = '#27ae60';
                        document.getElementById('chat-text').textContent = 'Online';
                    } else {
                        document.getElementById('chat-status').style.background = '#e74c3c';
                        document.getElementById('chat-text').textContent = 'Offline';
                    }
                } catch (error) {
                    document.getElementById('chat-status').style.background = '#e74c3c';
                    document.getElementById('chat-text').textContent = 'Error';
                }

                try {
                    const response = await fetch('http://localhost:8001/health');
                    if (response.ok) {
                        document.getElementById('search-status').style.background = '#27ae60';
                        document.getElementById('search-text').textContent = 'Online';
                    } else {
                        document.getElementById('search-status').style.background = '#e74c3c';
                        document.getElementById('search-text').textContent = 'Offline';
                    }
                } catch (error) {
                    document.getElementById('search-status').style.background = '#e74c3c';
                    document.getElementById('search-text').textContent = 'Error';
                }

                try {
                    const response = await fetch('/api/v1/unified/health');
                    if (response.ok) {
                        document.getElementById('unified-status').style.background = '#27ae60';
                        document.getElementById('unified-text').textContent = 'Online';
                    } else {
                        document.getElementById('unified-status').style.background = '#f39c12';
                        document.getElementById('unified-text').textContent = 'Partial';
                    }
                } catch (error) {
                    document.getElementById('unified-status').style.background = '#e74c3c';
                    document.getElementById('unified-text').textContent = 'Error';
                }
            }

            // Check status on load
            checkStatus();
            
            // Refresh status every 10 seconds
            setInterval(checkStatus, 10000);
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=demo_html)

@router.get("/status")
async def get_ui_status():
    """Get the status of UI components and services"""
    return {
        "ui_service": "online",
        "chat_interface": "available",
        "static_files": os.path.exists(STATIC_DIR / "unified_chat.html"),
        "endpoints": [
            "/ui/ - Main chat interface",
            "/ui/chat - Chat interface (alias)", 
            "/ui/demo - Demo page",
            "/ui/status - This status endpoint"
        ]
    }
