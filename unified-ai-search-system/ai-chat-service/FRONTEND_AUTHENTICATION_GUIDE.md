# 🔐 Frontend Authentication & API Integration Guide

## 📋 **API Endpoints Overview**

The AI Search System provides several API endpoints for frontend integration:

### **Core APIs Available**
| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/api/v1/chat/complete` | POST | Complete chat responses | Optional* |
| `/api/v1/chat/stream` | POST | Streaming chat responses | Optional* |
| `/api/v1/search/basic` | POST | Basic search functionality | Optional* |
| `/api/v1/search/advanced` | POST | Advanced search with filters | Optional* |
| `/api/v1/research/deep-dive` | POST | Deep research analysis | Optional* |
| `/health` | GET | System health check | None |

*\*Optional: Works with anonymous users but has rate limits*

---

## 🎯 **Authentication Methods**

### **1. Anonymous Access (Easiest)**
No authentication required - perfect for testing and free tier users.

```javascript
// No authentication needed
const response = await fetch('http://localhost:8000/api/v1/chat/complete', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: "Hello, how can you help me?"
  })
});
```

**Anonymous User Limits:**
- Rate limit: 60 requests/minute
- Monthly budget: $5.00
- Permissions: `["chat"]` only
- Quality: Basic responses

### **2. API Key Authentication (Recommended)**
Use bearer token for authenticated access with higher limits.

```javascript
const response = await fetch('http://localhost:8000/api/v1/chat/complete', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-api-key-here'
  },
  body: JSON.stringify({
    message: "Hello, I'm an authenticated user!"
  })
});
```

### **3. Development Tokens (For Testing)**
Pre-configured development tokens for easy testing:

```javascript
// Development tokens available:
const DEV_TOKENS = {
  'dev-user-token': {
    tier: 'pro',
    budget: 500.0,
    permissions: ['chat', 'search', 'analytics', 'advanced_search']
  },
  'dev-test-token': {
    tier: 'free', 
    budget: 20.0,
    permissions: ['chat']
  }
};

// Usage:
const response = await fetch('http://localhost:8000/api/v1/chat/complete', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer dev-user-token'
  },
  body: JSON.stringify({
    message: "Testing with dev token"
  })
});
```

---

## 🚀 **Frontend Integration Examples**

### **React/Next.js Integration**

```typescript
// types/api.ts
interface ChatRequest {
  message: string;
  session_id?: string;
  user_context?: Record<string, any>;
  quality_requirement?: 'minimal' | 'balanced' | 'premium';
  max_cost?: number;
  max_execution_time?: number;
}

interface ChatResponse {
  status: string;
  data: {
    response: string;
    session_id: string;
    sources?: string[];
    citations?: string[];
  };
  metadata: {
    query_id: string;
    execution_time: number;
    cost: number;
    models_used: string[];
  };
}
```

```typescript
// hooks/useAISearch.ts
import { useState } from 'react';

export const useAISearch = (apiKey?: string) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const BASE_URL = process.env.NEXT_PUBLIC_AI_API_URL || 'http://localhost:8000';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const chat = async (message: string, options?: Partial<ChatRequest>): Promise<ChatResponse> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${BASE_URL}/api/v1/chat/complete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message,
          quality_requirement: 'balanced',
          max_cost: 0.10,
          max_execution_time: 30,
          ...options
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const streamChat = async function* (
    message: string, 
    options?: Partial<ChatRequest>
  ): AsyncGenerator<string, void, unknown> {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BASE_URL}/api/v1/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: [{ role: 'user', content: message }],
          ...options
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) yield content;
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const search = async (query: string, options?: any) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BASE_URL}/api/v1/search/basic`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query,
          max_results: 10,
          ...options
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    chat,
    streamChat,
    search,
    loading,
    error
  };
};
```

```tsx
// components/ChatInterface.tsx
import React, { useState } from 'react';
import { useAISearch } from '../hooks/useAISearch';

export const ChatInterface: React.FC<{ apiKey?: string }> = ({ apiKey }) => {
  const [messages, setMessages] = useState<Array<{role: string, content: string}>>([]);
  const [input, setInput] = useState('');
  const { chat, streamChat, loading, error } = useAISearch(apiKey);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    try {
      // Option 1: Complete response
      const response = await chat(input);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: response.data.response 
      }]);

      // Option 2: Streaming response (alternative)
      // let assistantMessage = '';
      // for await (const chunk of streamChat(input)) {
      //   assistantMessage += chunk;
      //   setMessages(prev => {
      //     const newMessages = [...prev];
      //     if (newMessages[newMessages.length - 1]?.role === 'assistant') {
      //       newMessages[newMessages.length - 1].content = assistantMessage;
      //     } else {
      //       newMessages.push({ role: 'assistant', content: assistantMessage });
      //     }
      //     return newMessages;
      //   });
      // }
    } catch (err) {
      console.error('Chat error:', err);
    }
  };

  return (
    <div className="chat-interface">
      <div className="messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <strong>{msg.role}:</strong> {msg.content}
          </div>
        ))}
      </div>
      
      {error && <div className="error">Error: {error}</div>}
      
      <div className="input-area">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          disabled={loading}
          placeholder="Type your message..."
        />
        <button onClick={sendMessage} disabled={loading || !input.trim()}>
          {loading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};
```

### **Vue.js Integration**

```vue
<template>
  <div class="ai-search-interface">
    <div class="messages">
      <div 
        v-for="(message, index) in messages" 
        :key="index"
        :class="['message', message.role]"
      >
        <strong>{{ message.role }}:</strong> {{ message.content }}
      </div>
    </div>
    
    <div v-if="error" class="error">{{ error }}</div>
    
    <div class="input-area">
      <input
        v-model="input"
        @keypress.enter="sendMessage"
        :disabled="loading"
        placeholder="Type your message..."
      />
      <button @click="sendMessage" :disabled="loading || !input.trim()">
        {{ loading ? 'Sending...' : 'Send' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const props = defineProps<{
  apiKey?: string;
}>();

const messages = ref<Message[]>([]);
const input = ref('');
const loading = ref(false);
const error = ref<string | null>(null);

const BASE_URL = import.meta.env.VITE_AI_API_URL || 'http://localhost:8000';

const sendMessage = async () => {
  if (!input.value.trim()) return;

  const userMessage: Message = { role: 'user', content: input.value };
  messages.value.push(userMessage);
  
  const messageText = input.value;
  input.value = '';
  loading.value = true;
  error.value = null;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (props.apiKey) {
      headers['Authorization'] = `Bearer ${props.apiKey}`;
    }

    const response = await fetch(`${BASE_URL}/api/v1/chat/complete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: messageText,
        quality_requirement: 'balanced'
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || `HTTP ${response.status}`);
    }

    const data = await response.json();
    messages.value.push({ 
      role: 'assistant', 
      content: data.data.response 
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error';
    console.error('Chat error:', err);
  } finally {
    loading.value = false;
  }
};
</script>
```

### **Vanilla JavaScript**

```html
<!DOCTYPE html>
<html>
<head>
    <title>AI Search Interface</title>
    <style>
        .message { margin: 10px 0; padding: 10px; border-radius: 5px; }
        .user { background: #e3f2fd; }
        .assistant { background: #f3e5f5; }
        .error { color: red; margin: 10px 0; }
        .input-area { margin: 20px 0; }
        input { width: 70%; padding: 10px; }
        button { padding: 10px 20px; margin-left: 10px; }
    </style>
</head>
<body>
    <div id="app">
        <h1>AI Search System</h1>
        <div id="messages"></div>
        <div id="error" class="error" style="display: none;"></div>
        <div class="input-area">
            <input type="text" id="messageInput" placeholder="Type your message...">
            <button onclick="sendMessage()">Send</button>
        </div>
    </div>

    <script>
        const API_BASE = 'http://localhost:8000';
        const API_KEY = 'dev-user-token'; // Use your API key or leave empty for anonymous

        let messages = [];

        function displayMessage(role, content) {
            const messagesDiv = document.getElementById('messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${role}`;
            messageDiv.innerHTML = `<strong>${role}:</strong> ${content}`;
            messagesDiv.appendChild(messageDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        function showError(message) {
            const errorDiv = document.getElementById('error');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            setTimeout(() => {
                errorDiv.style.display = 'none';
            }, 5000);
        }

        async function sendMessage() {
            const input = document.getElementById('messageInput');
            const message = input.value.trim();
            
            if (!message) return;

            displayMessage('user', message);
            input.value = '';

            try {
                const headers = {
                    'Content-Type': 'application/json'
                };

                if (API_KEY) {
                    headers['Authorization'] = `Bearer ${API_KEY}`;
                }

                const response = await fetch(`${API_BASE}/api/v1/chat/complete`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        message: message,
                        quality_requirement: 'balanced',
                        max_cost: 0.10
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || `HTTP ${response.status}`);
                }

                const data = await response.json();
                displayMessage('assistant', data.data.response);

            } catch (error) {
                console.error('Error:', error);
                showError(`Error: ${error.message}`);
            }
        }

        // Enable Enter key
        document.getElementById('messageInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    </script>
</body>
</html>
```

---

## 🔑 **API Key Management**

### **Environment Configuration**
Set up API keys in your environment:

```bash
# .env file
AI_API_URL=http://localhost:8000
AI_API_KEY=your-production-api-key-here

# For development
AI_API_KEY=dev-user-token  # Use dev tokens for testing
```

### **Runtime Key Management**
```typescript
class AIClient {
  private apiKey?: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl = 'http://localhost:8000') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  async chat(message: string) {
    const response = await fetch(`${this.baseUrl}/api/v1/chat/complete`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ message })
    });

    return await response.json();
  }
}
```

---

## 🔒 **Security Best Practices**

### **1. API Key Security**
```typescript
// ✅ DO: Store API keys securely
const apiKey = process.env.NEXT_PUBLIC_AI_API_KEY; // From environment
const apiKey = await getFromSecureStorage(); // From secure storage

// ❌ DON'T: Hardcode API keys
const apiKey = 'sk-123abc...'; // Never do this!
```

### **2. Rate Limiting Handling**
```typescript
const chatWithRetry = async (message: string, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await chat(message);
      return response;
    } catch (error) {
      if (error.status === 429) { // Rate limited
        const waitTime = Math.pow(2, i) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
};
```

### **3. Input Validation**
```typescript
const validateInput = (message: string): string => {
  if (!message || message.trim().length === 0) {
    throw new Error('Message cannot be empty');
  }
  if (message.length > 8000) {
    throw new Error('Message too long (max 8000 characters)');
  }
  return message.trim();
};
```

---

## 🎯 **Quick Start Checklist**

### **For Anonymous Testing:**
- [ ] No setup required
- [ ] Use any endpoint without authentication
- [ ] Rate limited to 60 requests/minute

### **For Development:**
- [ ] Use development tokens: `dev-user-token` or `dev-test-token`
- [ ] Higher rate limits and permissions
- [ ] Perfect for building and testing

### **For Production:**
- [ ] Set up environment variables for API keys
- [ ] Implement proper error handling
- [ ] Add rate limiting and retry logic
- [ ] Secure API key storage

**Your frontend is now ready to integrate with the AI Search System!** 🚀

---

## 📞 **Support**

- **Documentation**: Check the `/docs` endpoint at `http://localhost:8000/docs`
- **Health Check**: Monitor system status at `/health`
- **Error Codes**: See detailed error responses in API responses
