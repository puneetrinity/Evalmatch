#!/bin/bash

echo "🧪 Testing local development environment..."

# Test document upload
echo "📄 Testing document upload..."
curl -X POST http://localhost:8001/api/v2/rag/documents \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/tmp/test.txt" \
  -F "title=Test Document"

# Test chat
echo "💬 Testing chat service..."
curl -X POST http://localhost:8003/api/v1/chat/complete \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, how are you?", "conversation_id": "test_local"}'

# Test unified UI
echo "🌐 Testing unified UI..."
curl -f http://localhost:8000/

echo "✅ Local testing complete!"
