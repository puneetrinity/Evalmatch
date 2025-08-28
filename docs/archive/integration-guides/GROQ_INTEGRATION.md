# Groq Integration Guide

## Overview

EvalMatch now uses **Groq** as the primary AI provider for faster inference and significantly lower costs while maintaining high-quality analysis.

## 🚀 Why Groq?

### Performance Benefits
- **Ultra-fast inference**: 200-800 tokens/second (5-15x faster than competitors)
- **Low latency**: Near real-time responses for better user experience
- **High throughput**: Handle multiple concurrent requests efficiently

### Cost Benefits
- **Up to 90% cost reduction** compared to OpenAI GPT-4o
- **Balanced pricing**: Equal cost for input/output tokens
- **No rate limiting issues**: High request limits

### Quality
- **Advanced models**: Kimi K2 Instruct (1T parameters), Qwen 3 32B, Llama 3.3 70B
- **Specialized capabilities**: Excellent at structured analysis and reasoning
- **JSON handling**: Native support for structured outputs

## 🔧 Setup Instructions

### 1. Get Groq API Key
1. Visit [console.groq.com](https://console.groq.com)
2. Sign up/login to your account  
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key (starts with `gsk_...`)

### 2. Configure Environment
Add to your `.env` file:
```bash
# Primary AI Provider (Recommended)
GROQ_API_KEY=gsk_your_groq_api_key_here

# Fallback Providers (Optional)
PR_OPEN_API_KEY=your_openai_key
PR_ANTHROPIC_API_KEY=your_anthropic_key
```

### 3. Install Dependencies
The Groq SDK is already included in package.json:
```bash
npm install  # groq-sdk will be installed
```

## 🧠 Model Selection Strategy

### Primary Models Used

1. **Kimi K2 Instruct** (`moonshot-v1-auto`)
   - **Use case**: Complex resume/job analysis, bias detection
   - **Strengths**: Excellent reasoning, handles structured analysis
   - **Speed**: ~200 tokens/sec
   - **Cost**: ~$0.30 per 1M tokens

2. **Qwen 3 32B** (`qwen2.5-32b-instruct`)  
   - **Use case**: Fast skill extraction, simple matching
   - **Strengths**: High speed, good at JSON outputs
   - **Speed**: ~400 tokens/sec
   - **Cost**: ~$0.20 per 1M tokens

3. **Llama 3.3 70B Versatile** (`llama-3.3-70b-versatile`)
   - **Use case**: Complex matching, interview question generation
   - **Strengths**: Most capable model, detailed analysis
   - **Speed**: ~200 tokens/sec
   - **Cost**: ~$0.59 input, $0.79 output per 1M tokens

## 🏗️ Provider Architecture

### Fallback Strategy
```
1. Groq (Primary) → 2. OpenAI (Secondary) → 3. Anthropic (Tertiary) → 4. Fallback Response
```

### Smart Model Selection
- **Analysis Tasks**: Kimi K2 Instruct for deep reasoning
- **Fast Operations**: Qwen 3 32B for speed
- **Complex Matching**: Llama 3.3 70B for comprehensive analysis

## 📊 Cost Comparison

| Provider | Model | Input Cost/1M | Output Cost/1M | Speed | Use Case |
|----------|-------|---------------|----------------|-------|----------|
| **Groq** | Kimi K2 | $0.30 | $0.30 | 200 t/s | **Primary** |
| **Groq** | Qwen 3 32B | $0.20 | $0.20 | 400 t/s | **Fast tasks** |
| **Groq** | Llama 3.3 70B | $0.59 | $0.79 | 200 t/s | **Complex** |
| OpenAI | GPT-4o | $2.50 | $10.00 | 30 t/s | Fallback |
| Anthropic | Claude 3.5 | $3.00 | $15.00 | 40 t/s | Fallback |

**Estimated Savings**: 70-90% cost reduction with Groq as primary provider.

## 🔍 Monitoring & Usage

### Check Provider Status
```typescript
import { getAIServiceStatus } from './server/lib/ai-provider';
const status = getAIServiceStatus();
console.log(status.providers.groq);
```

### Monitor Usage
```typescript
import { getGroqUsage } from './server/lib/groq';
const usage = getGroqUsage();
console.log(`Total cost: $${usage.estimatedCost.toFixed(4)}`);
```

### Reset Usage Tracking
```typescript
import { resetGroqUsage } from './server/lib/groq';
resetGroqUsage(); // Reset counters
```

## 🚨 Troubleshooting

### Common Issues

1. **"Groq API key is not configured"**
   - Check `.env` file has `GROQ_API_KEY`
   - Restart the server after adding the key
   - Verify key starts with `gsk_`

2. **Rate Limiting**
   - Groq has generous limits, but check your plan
   - The system will automatically fallback to OpenAI

3. **Model Not Found**
   - Model names may change; check [Groq docs](https://console.groq.com/docs/models)
   - Update model names in `/server/lib/groq.ts` if needed

4. **JSON Parsing Errors**
   - Groq is optimized for JSON outputs
   - Check prompt formatting if seeing parse errors

### Fallback Behavior
If Groq fails, the system automatically falls back to:
1. OpenAI (if configured)
2. Anthropic (if configured)  
3. Built-in fallback responses

## 🧪 Testing

Run the integration tests:
```bash
npm run build
node tests/test-groq-integration.js
```

## 🔒 Security Notes

- Store API keys in environment variables only
- Never commit API keys to version control
- Use different keys for development/production
- Monitor usage regularly to detect anomalies

## 📈 Performance Tips

1. **Enable Caching**: Responses are cached for 1 hour by default
2. **Batch Requests**: Process multiple resumes efficiently
3. **Choose Right Model**: Use fast models for simple tasks
4. **Monitor Costs**: Track usage with built-in monitoring

## 🚀 Next Steps

1. Get your Groq API key from [console.groq.com](https://console.groq.com)
2. Add `GROQ_API_KEY` to your `.env` file
3. Restart your application
4. Enjoy 90% cost savings and 5-15x faster responses!

## 🆘 Support

- **Groq Documentation**: [console.groq.com/docs](https://console.groq.com/docs)
- **EvalMatch Issues**: Check logs for detailed error messages
- **Provider Status**: Use `getAIServiceStatus()` to check all providers