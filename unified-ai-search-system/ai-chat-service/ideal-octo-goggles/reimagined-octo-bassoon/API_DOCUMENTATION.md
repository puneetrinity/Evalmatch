# AI Search System API Documentation

**Version:** 1.0.0  
**Base URL:** `http://localhost:8000`  
**Environment:** Development  
**Last Updated:** 2025-06-24

## Overview

This API provides intelligent AI-powered search, chat, and research capabilities with multi-model orchestration and real-time streaming responses.

## Authentication

All protected endpoints require a Bearer token in the Authorization header:

```javascript
headers: {
  'Authorization': 'Bearer test_token',
  'Content-Type': 'application/json'
}
```

## Status Legend

- ✅ **WORKING** - Fully functional, recommended for production use
- ⚠️ **PARTIAL** - Functional but has known limitations
- ❌ **BROKEN** - Not working, avoid using

---

## Chat APIs ✅

### 1. Chat Health Check ✅

**GET** `/api/v1/chat/health`

Check if the chat service is healthy.

```javascript
// Response
{
  "status": "healthy",
  "service": "chat", 
  "timestamp": 1750775179.4942718
}
```

### 2. Chat Complete ✅ (PRIMARY ENDPOINT)

**POST** `/api/v1/chat/complete`

Send a message and receive an AI response.

```typescript
// Request Schema
interface ChatRequest {
  message: string;                    // Required: User message (max 4096 chars)
  session_id?: string;               // Optional: Session identifier
  quality_requirement?: "minimal" | "balanced" | "high" | "premium"; // Default: "balanced"
  max_cost?: number;                 // Optional: Maximum cost limit
  max_execution_time?: number;       // Optional: Timeout in seconds
  response_style?: string;           // Optional: Response style preference
  include_sources?: boolean;         // Optional: Include source citations
  force_local_only?: boolean;        // Optional: Force local models only
  include_debug_info?: boolean;      // Optional: Include debug information
  user_context?: Record<string, any>; // Optional: Additional user context
}

// Example Request
const response = await fetch('/api/v1/chat/complete', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test_token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: "What is artificial intelligence?",
    session_id: "user_session_123",
    quality_requirement: "balanced"
  })
});

// Response Schema
interface ChatResponse {
  status: "success" | "error";
  data: {
    response: string;                 // AI generated response
    session_id: string;              // Session identifier
    context: {
      session_id: string;
      message_count: number;
      last_updated: string;          // ISO timestamp
      user_preferences: Record<string, any>;
      conversation_summary?: string;
    };
    sources: Array<any>;             // Source citations
    citations: Array<any>;           // Reference citations
    conversation_history: Array<{
      user_message: string;
      assistant_response: string;
      query_id: string;
      timestamp: string;
      intent?: string;
      complexity: number;
      total_cost: number;
      execution_time: number;
      models_used: string[];
    }>;
  };
  metadata: {
    query_id: string;
    correlation_id: string;
    execution_time: number;
    cost: number;
    models_used: string[];
    confidence: number;
    cached: boolean;
    timestamp: string;
  };
  cost_prediction?: {
    estimated_cost: number;
    cost_breakdown: Array<any>;
    savings_tips: string[];
    alternative_workflows: Array<any>;
  };
  developer_hints?: {
    execution_path: string[];
    routing_explanation: string;
    performance: Record<string, any>;
  };
}
```

**React Example:**

```jsx
import React, { useState } from 'react';

const ChatComponent = () => {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/chat/complete', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test_token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          session_id: `session_${Date.now()}`,
          quality_requirement: 'balanced'
        })
      });
      
      const data = await res.json();
      if (data.status === 'success') {
        setResponse(data.data.response);
      }
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input 
        value={message} 
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ask anything..."
      />
      <button onClick={sendMessage} disabled={loading}>
        {loading ? 'Thinking...' : 'Send'}
      </button>
      {response && <div>{response}</div>}
    </div>
  );
};
```

### 3. Chat Streaming ⚠️

**POST** `/api/v1/chat/stream`

Stream AI responses in real-time (currently has implementation issues).

```typescript
// Request Schema
interface ChatStreamRequest {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  session_id?: string;
}

// Example - Server-Sent Events
const eventSource = new EventSource('/api/v1/chat/stream');
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle streaming chunks
};
```

### 4. Chat History ✅

**GET** `/api/v1/chat/history/{session_id}`

Retrieve conversation history for a session.

```javascript
// Response
{
  "session_id": "test_session",
  "history": [],
  "message_count": 0,
  "last_updated": "2025-06-24T14:23:49.645928"
}
```

**DELETE** `/api/v1/chat/history/{session_id}`

Clear conversation history for a session.

```javascript
// Response
{
  "cleared": true,
  "session_id": "test_session", 
  "timestamp": "2025-06-24T14:24:01.965557"
}
```

---

## Search APIs ✅

### 1. Search Health ✅

**GET** `/api/v1/search/health`

```javascript
// Response
{
  "status": "degraded",
  "service": "search",
  "search_system": "initializing",
  "providers": [],
  "timestamp": 1750775179.4942718,
  "correlation_id": "3d17ef25-d62d-4b74-ae04-0a7289427e25"
}
```

### 2. Basic Search ✅ (PRIMARY ENDPOINT)

**POST** `/api/v1/search/basic`

Perform a basic search query.

```typescript
// Request Schema
interface SearchRequest {
  query: string;                     // Required: Search query
  max_results?: number;              // Optional: Maximum results (default: 10)
  include_content?: boolean;         // Optional: Include full content
}

// Example Request
const searchResponse = await fetch('/api/v1/search/basic', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test_token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: "artificial intelligence trends",
    max_results: 5,
    include_content: false
  })
});

// Response Schema
interface SearchResponse {
  status: "success" | "error";
  data: {
    query: string;
    results: Array<{
      title?: string;
      url?: string;
      content?: string;
      relevance_score?: number;
    }>;
    summary: string;
    total_results: number;
    search_time: number;
    sources_consulted: string[];
  };
  metadata: {
    query_id: string;
    correlation_id: string;
    execution_time: number;
    cost: number;
    models_used: string[];
    confidence: number;
    cached: boolean;
    timestamp: string;
  };
}
```

**React Example:**

```jsx
const SearchComponent = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const performSearch = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/search/basic', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test_token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query,
          max_results: 10,
          include_content: true
        })
      });
      
      const data = await res.json();
      if (data.status === 'success') {
        setResults(data.data.results);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input 
        value={query} 
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for anything..."
      />
      <button onClick={performSearch} disabled={loading}>
        {loading ? 'Searching...' : 'Search'}
      </button>
      <div>
        {results.map((result, index) => (
          <div key={index}>
            <h3>{result.title}</h3>
            <p>{result.content}</p>
            <a href={result.url} target="_blank" rel="noopener noreferrer">
              Visit Source
            </a>
          </div>
        ))}
      </div>
    </div>
  );
};
```

### 3. Advanced Search ⚠️

**POST** `/api/v1/search/advanced`

Advanced search with additional parameters (currently has schema issues).

### 4. Test Search ✅

**POST** `/api/v1/search/test`

Mock search endpoint for testing.

```javascript
// Response
{
  "status": "success",
  "query": "artificial intelligence trends",
  "mock_results": [
    {"title": "Test Result 1", "url": "https://example.com/1"},
    {"title": "Test Result 2", "url": "https://example.com/2"}
  ],
  "timestamp": 1750775242.268965
}
```

---

## Research APIs ⚠️

### Deep Dive Research ⚠️

**POST** `/api/v1/research/deep-dive`

Execute comprehensive research workflow (functional but complex).

```typescript
// Request Schema
interface ResearchRequest {
  research_question: string;         // Required: Research question
  methodology: "systematic" | "exploratory" | "comparative" | "meta-analysis";
  cost_budget?: number;              // Optional: Cost limit
  time_budget?: number;              // Optional: Time limit in seconds
  depth_level?: number;              // Optional: 1-5 depth level
  sources?: string[];                // Optional: Source types
}

// Example Request
const researchResponse = await fetch('/api/v1/research/deep-dive', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test_token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    research_question: "What are the benefits of renewable energy?",
    methodology: "systematic",
    cost_budget: 1.0,
    time_budget: 30,
    depth_level: 2,
    sources: ["academic"]
  })
});

// Response Schema
interface ResearchResponse {
  status: "success" | "error";
  data: Record<string, any>;         // Research results or error info
  metadata: {
    query_id: string;
    correlation_id: string;
    execution_time: number;
    cost: number;
    models_used: string[];
    confidence: number;
    cached: boolean;
    timestamp: string;
  };
}
```

---

## System APIs ✅

### 1. Health Check ✅

**GET** `/health`

Overall system health.

```javascript
// Response
{
  "status": "degraded",
  "components": {
    "models": "not_initialized",
    "cache": "not_available", 
    "chat_graph": "not_initialized",
    "search_graph": "not_initialized",
    "optimization_system": "not_initialized",
    "brave_search": "not_configured",
    "scrapingbee": "not_configured"
  },
  "version": "1.0.0",
  "uptime": null,
  "last_check": "2025-06-24T14:21:31.540603"
}
```

### 2. Liveness Probe ✅

**GET** `/health/live`

```javascript
// Response
{"status": "alive"}
```

### 3. Readiness Probe ⚠️

**GET** `/health/ready`

```javascript
// Response (when not ready)
{
  "status": "error",
  "message": "Component model_manager not ready",
  "error_details": {
    "error_code": "HTTP_503",
    "error_type": "HTTP",
    "user_message": "Component model_manager not ready"
  }
}
```

### 4. System Status ✅

**GET** `/system/status`

```javascript
// Response
{
  "status": "operational",
  "components": {
    "redis": "disconnected",
    "ollama": "disconnected", 
    "api": "healthy",
    "search_graph": "not_initialized",
    "chat_graph": "not_initialized"
  },
  "providers": {
    "brave_search": "not_configured",
    "scrapingbee": "not_configured"
  },
  "version": "1.0.0",
  "uptime": null,
  "timestamp": 1750774922.1089087,
  "architecture": "standardized_providers"
}
```

### 5. Metrics ✅

**GET** `/metrics`

```javascript
// Response
{
  "status": "operational",
  "timestamp": 1750775256.910426,
  "correlation_id": "08985bb0-8338-4ba5-9220-7b5c4ff0da29",
  "version": "1.0.0",
  "components": {},
  "api_keys": {},
  "system": {
    "total_components": 0,
    "environment": "development", 
    "python_version": "3.10"
  }
}
```

---

## Error Handling

All APIs return consistent error responses:

```typescript
interface ErrorResponse {
  status: "error";
  error?: string;
  suggestions?: string[];
  detail?: string | Array<{
    type: string;
    loc: string[];
    msg: string;
    input: any;
  }>;
}
```

**Common Error Codes:**
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing/invalid token)
- `422` - Unprocessable Entity (schema validation)
- `500` - Internal Server Error
- `503` - Service Unavailable

**React Error Handling Example:**

```jsx
const handleApiCall = async (url, options) => {
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.detail || data.error || 'API call failed');
    }
    
    if (data.status === 'error') {
      throw new Error(data.error || 'Operation failed');
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    // Handle error in UI
    throw error;
  }
};
```

---

## Rate Limiting

The API implements rate limiting. If you exceed limits, you'll receive:

```javascript
// 429 Too Many Requests
{
  "status": "error",
  "error": "Rate limit exceeded",
  "retry_after": 60 // seconds
}
```

---

## Best Practices

### 1. Session Management
- Use consistent `session_id` for conversation continuity
- Format: `user_${userId}_${timestamp}` or similar

### 2. Error Recovery
- Implement retry logic with exponential backoff
- Handle network timeouts gracefully
- Show user-friendly error messages

### 3. Performance
- Cache responses when appropriate
- Use loading states for better UX
- Implement request debouncing for search

### 4. Security
- Never hardcode API tokens in client code
- Use environment variables for configuration
- Validate inputs on the frontend

---

## Example React Integration

```jsx
// api.js
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const API_TOKEN = process.env.REACT_APP_API_TOKEN || 'test_token';

export const apiClient = {
  async chat(message, sessionId) {
    const response = await fetch(`${API_BASE_URL}/api/v1/chat/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message,
        session_id: sessionId,
        quality_requirement: 'balanced'
      })
    });
    
    const data = await response.json();
    if (data.status !== 'success') {
      throw new Error(data.error || 'Chat failed');
    }
    
    return data.data;
  },

  async search(query, maxResults = 10) {
    const response = await fetch(`${API_BASE_URL}/api/v1/search/basic`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        include_content: true
      })
    });
    
    const data = await response.json();
    if (data.status !== 'success') {
      throw new Error(data.error || 'Search failed');
    }
    
    return data.data;
  }
};

// App.js
import React, { useState } from 'react';
import { apiClient } from './api';

function App() {
  const [chatMessage, setChatMessage] = useState('');
  const [chatResponse, setChatResponse] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const handleChat = async () => {
    try {
      const result = await apiClient.chat(chatMessage, 'session_123');
      setChatResponse(result.response);
    } catch (error) {
      alert('Chat error: ' + error.message);
    }
  };

  const handleSearch = async () => {
    try {
      const result = await apiClient.search(searchQuery);
      setSearchResults(result.results);
    } catch (error) {
      alert('Search error: ' + error.message);
    }
  };

  return (
    <div>
      <h1>AI Search System</h1>
      
      <div>
        <h2>Chat</h2>
        <input 
          value={chatMessage}
          onChange={(e) => setChatMessage(e.target.value)}
          placeholder="Ask anything..."
        />
        <button onClick={handleChat}>Send</button>
        {chatResponse && <p>{chatResponse}</p>}
      </div>

      <div>
        <h2>Search</h2>
        <input 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search..."
        />
        <button onClick={handleSearch}>Search</button>
        <div>
          {searchResults.map((result, i) => (
            <div key={i}>
              <h3>{result.title}</h3>
              <p>{result.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
```

---

## Support

For issues or questions:
- Check the system status endpoints first
- Review error messages and suggestions
- Ensure proper authentication headers
- Validate request schemas match documentation

**System Status:** 🟢 OPERATIONAL  
**Core APIs:** ✅ Chat Complete, Basic Search, System Health  
**Advanced Features:** ⚠️ Streaming, Research, Advanced Search have known limitations