# Anyclaude Setup and Usage Guide

## Overview

Anyclaude is a proxy wrapper that enables using Claude Code with alternative LLM providers like OpenAI's GPT-5, Google Gemini, and xAI. It intercepts Anthropic API calls and translates them to work with other providers while maintaining Claude Code's familiar interface.

## Quick Start (TL;DR)

```bash
# 1. Navigate to your project directory
cd ~/your-project

# 2. Export PATH (needed each session)
export PATH=~/.npm-global/bin:$PATH

# 3. Export API key (needed each session)
export OPENAI_API_KEY="your-openai-api-key"

# 4. Start anyclaude
anyclaude --model openai/gpt-5
```

**That's it!** All four steps are required for each new terminal session.

## Prerequisites

- Node.js and npm installed
- An OpenAI API key with GPT-5 access
- Claude Code installed

## Installation

### 1. Install anyclaude globally

```bash
npm install -g anyclaude
```

### 2. Set up npm global directory (if not already done)

```bash
# Create a directory for global packages
mkdir ~/.npm-global

# Configure npm to use the new directory
npm config set prefix '~/.npm-global'

# Add the new directory to your PATH
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### 3. Set up your OpenAI API key

```bash
# Set the API key for the current session
export OPENAI_API_KEY="your-api-key-here"

# Make it permanent by adding to bashrc
echo 'export OPENAI_API_KEY="your-api-key-here"' >> ~/.bashrc
source ~/.bashrc
```

## Common PATH Issue and Solution

### Problem
After installation, you might encounter:
```bash
anyclaude: command not found
```

### Solution
The npm global bin directory isn't in your PATH for the current session.

```bash
# Fix for current session
export PATH=~/.npm-global/bin:$PATH

# Verify it works
anyclaude --model openai/gpt-5
```

### Permanent Fix
```bash
# Reload your bashrc to get the permanent PATH
source ~/.bashrc

# Or manually add to bashrc if missing
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

## Usage

### Complete Step-by-Step Process

**IMPORTANT**: You must do ALL these steps in order for each session:

```bash
# 1. Navigate to your project directory
cd ~/your-project

# 2. Export the PATH (required for each new terminal session)
export PATH=~/.npm-global/bin:$PATH

# 3. Export your OpenAI API key (required for each session)
export OPENAI_API_KEY="your-api-key-here"

# 4. Start anyclaude with your chosen model
anyclaude --model openai/gpt-5
```

### Complete Working Example

```bash
# Navigate to project
cd ~/Evalmatch

# Set PATH
export PATH=~/.npm-global/bin:$PATH

# Set API key
export OPENAI_API_KEY="your-openai-api-key-here"

# Start anyclaude
anyclaude --model openai/gpt-5
```

### Alternative Options

```bash
# With GPT-5 mini (faster, cost-effective)
anyclaude --model openai/gpt-5-mini

# With reasoning effort control
anyclaude --model openai/gpt-5-mini --reasoning-effort high

# With service tier (for priority access)
anyclaude --model openai/gpt-5-mini --service-tier priority

# Combined options
anyclaude --model openai/gpt-5-mini -e high -t priority
```

### Available GPT-5 Models

| Model | Best For | Use Case |
|-------|----------|----------|
| `gpt-5` | Complex reasoning, broad world knowledge, code-heavy tasks | Most demanding tasks requiring maximum intelligence |
| `gpt-5-mini` | Cost-optimized reasoning and chat | General-purpose tasks with good balance of speed/cost/capability |
| `gpt-5-nano` | High-throughput tasks, simple instruction-following | When you need speed for simpler tasks |
| `gpt-5-chat-latest` | Conversational use | Optimized for chat interactions |

### Switching Models

Once anyclaude is running, you can switch models in the Claude interface:

```bash
# Switch to different GPT-5 models
/model openai/gpt-5
/model openai/gpt-5-mini
/model openai/gpt-5-nano

# Use other providers
/model openai/gpt-4o
/model google/gemini-pro
/model xai/grok-beta

# List available models
/model
```

### GPT-5 Specific Features

#### Reasoning Effort
Controls how much reasoning the model does before responding:
- `minimal`: Fastest, least reasoning
- `low`: Quick responses with some reasoning
- `medium`: Balanced (default)
- `high`: Most thorough reasoning

```bash
anyclaude --model openai/gpt-5-mini --reasoning-effort high
```

#### Service Tier
Controls priority and speed:
- `flex`: Standard service (default)
- `priority`: Higher priority processing

```bash
anyclaude --model openai/gpt-5-mini --service-tier priority
```

## Verification

### Check API Key Access
```bash
# Verify your API key has GPT-5 access
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
     -H "Content-Type: application/json" \
     https://api.openai.com/v1/models | grep -i "gpt-5"
```

### Test GPT-5 Directly
```bash
# Test GPT-5 API call
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model": "gpt-5-mini", "messages": [{"role": "user", "content": "Hello"}], "max_completion_tokens": 10}' \
     https://api.openai.com/v1/chat/completions
```

## Troubleshooting

### 1. Command Not Found: `anyclaude: command not found`

**Solution**: Export the PATH in your current session
```bash
export PATH=~/.npm-global/bin:$PATH
```

**Verification**:
```bash
# Check if anyclaude is installed
ls -la ~/.npm-global/bin/anyclaude

# Check PATH
echo $PATH | grep npm-global

# Should show the npm-global path
```

### 2. API Key Error: `OpenAI API key is missing`

**Solution**: Export the API key in your current session
```bash
export OPENAI_API_KEY="sk-proj--your-full-api-key-here"
```

**Verification**:
```bash
# Check if API key is set
echo $OPENAI_API_KEY
# Should show your full API key
```

### 3. Complete Session Reset

If you're having multiple issues, do the complete 4-step process:
```bash
# Exit anyclaude if running (Ctrl+C)

# 1. Go to directory
cd ~/your-project

# 2. Set PATH
export PATH=~/.npm-global/bin:$PATH

# 3. Set API key
export OPENAI_API_KEY="your-full-api-key"

# 4. Start anyclaude
anyclaude --model openai/gpt-5
```

### 3. GPT-5 Models Not Available
- Verify your OpenAI account has GPT-5 access
- Check if your API key tier supports GPT-5
- Some GPT-5 models might be in limited beta

### 4. Claude Code Installation Issues
```bash
# Reinstall Claude Code if needed
npm uninstall -g @anthropic-ai/claude-code
npm install -g @anthropic-ai/claude-code

# Test Claude Code directly
claude --version
```

## Working Directory

Anyclaude works in whatever directory you start it from:

```bash
# Start in your project directory
cd ~/my-project
anyclaude --model openai/gpt-5-mini

# Claude Code will show:
# cwd: /home/user/my-project
```

This allows Claude to immediately access and work with your project files.

## Best Practices

1. **Start in your project directory** so Claude has immediate access to your files
2. **Use gpt-5-mini** for most tasks - good balance of capability and cost
3. **Use high reasoning effort** for complex coding problems
4. **Set API key permanently** in bashrc to avoid re-entering
5. **Keep anyclaude updated** for latest GPT-5 features

## Example Workflow

```bash
# 1. Navigate to your project
cd ~/my-awesome-project

# 2. Start anyclaude with GPT-5
anyclaude --model openai/gpt-5-mini --reasoning-effort medium

# 3. Use Claude Code normally
# - All your MCP servers work
# - All your agents work  
# - You're using GPT-5 instead of Claude

# 4. Switch models if needed
/model openai/gpt-5  # for complex tasks
/model openai/gpt-5-nano  # for simple tasks
```

## Additional Providers

Anyclaude also supports other providers by setting their API keys:

```bash
# Google Gemini
export GOOGLE_API_KEY="your-google-key"
anyclaude --model google/gemini-pro

# xAI Grok
export XAI_API_KEY="your-xai-key"
anyclaude --model xai/grok-beta

# Azure
export AZURE_API_KEY="your-azure-key"
anyclaude --model azure/your-deployment
```

## Resources

- [Anyclaude GitHub Repository](https://github.com/coder/anyclaude)
- [OpenAI GPT-5 Documentation](https://platform.openai.com/docs/guides/latest-model)
- [Claude Code Documentation](https://docs.anthropic.com/claude/docs/claude-code)

---

**Note**: GPT-5 is OpenAI's latest reasoning model with advanced capabilities. Anyclaude allows you to use it through Claude Code's familiar interface while maintaining all your existing MCP servers and agent configurations.