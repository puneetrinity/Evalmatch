# Fix AI Provider Issues on Railway

## 🚨 CRITICAL ISSUE: Missing AI Provider API Keys

The Railway logs show:
```
[WARN] OpenAI API key configuration: Key is NOT set
[INFO] Anthropic API key configuration: Key is NOT set
```

This means **NO AI analysis is working** - job descriptions and resumes cannot be analyzed!

## 🔑 Required Environment Variables

Add these to Railway dashboard immediately:

### 1. **GROQ_API_KEY** (Primary - Recommended)
- Fastest and most cost-effective
- Get free API key: https://console.groq.com/keys
- Add to Railway: `GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 2. **PR_OPEN_API_KEY** (Secondary - Fallback)
- Used when Groq is unavailable
- Get API key: https://platform.openai.com/api-keys
- Add to Railway: `PR_OPEN_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 3. **PR_ANTHROPIC_API_KEY** (Tertiary - Optional)
- Additional fallback option
- Get API key: https://console.anthropic.com/settings/keys
- Add to Railway: `PR_ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## 📋 How the AI System Works

```
1. User uploads resume → AI analyzes skills/experience
2. User creates job → AI extracts requirements
3. User matches resume to job → AI calculates match percentage
4. User checks bias → AI detects problematic language
```

**Without API keys, ALL these features return fallback/empty responses!**

## 🛠️ Quick Setup Guide

### Step 1: Get Groq API Key (FREE)
1. Go to https://console.groq.com
2. Sign up with Google/GitHub
3. Create new API key
4. Copy the key starting with `gsk_`

### Step 2: Add to Railway
1. Go to Railway dashboard
2. Click on your service
3. Go to Variables tab
4. Add new variable:
   - Name: `GROQ_API_KEY`
   - Value: `gsk_your_key_here`

### Step 3: Redeploy
Railway will automatically redeploy when you add the variable.

## 🧪 Test AI Functionality

After adding API keys, test:

1. **Create a job description**:
   ```
   Title: Senior Software Engineer
   Description: We need a React developer with 5+ years experience
   ```
   
2. **Check if analysis works**:
   - Should extract skills: ["React", "JavaScript", "Software Development"]
   - Should show requirements and experience level
   - Should NOT be null or empty

3. **Test bias detection**:
   - Should identify any biased language
   - Should provide suggestions for improvement

## 🔍 Verify in Logs

After deployment, check Railway logs for:
```
✅ Good: "Groq API key configuration: Key is set"
✅ Good: "Using Groq for resume analysis"
❌ Bad: "All AI providers unavailable, using built-in fallback"
```

## 💰 Cost Comparison

| Provider | Speed | Cost per 1M tokens | Quality |
|----------|-------|-------------------|---------|
| Groq | ⚡ Fastest | $0.20-$0.30 | Excellent |
| OpenAI | Fast | $2.00-$6.00 | Excellent |
| Anthropic | Fast | $3.00-$15.00 | Best |

**Recommendation**: Use Groq as primary (free tier available)

## 🚨 Current Status Without API Keys

- ❌ Resume analysis returns generic fallback
- ❌ Job analysis returns "Service temporarily unavailable"
- ❌ Match percentage always 60% (hardcoded fallback)
- ❌ Bias detection returns generic warnings
- ❌ Interview questions are generic templates

## ✅ After Adding API Keys

- ✅ Real AI-powered resume analysis
- ✅ Accurate skill extraction
- ✅ Intelligent match scoring
- ✅ Detailed bias detection
- ✅ Personalized interview questions

## 📝 Complete Environment Variables Checklist

```bash
# AI Providers (At least one required)
GROQ_API_KEY=gsk_xxxxxxxxxxxxx              # Primary (recommended)
PR_OPEN_API_KEY=sk-xxxxxxxxxxxxx            # Secondary fallback
PR_ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx  # Tertiary fallback

# Firebase (All required)
VITE_FIREBASE_API_KEY=xxxxxxxxxxxxx
VITE_FIREBASE_AUTH_DOMAIN=ealmatch-railway.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ealmatch-railway
VITE_FIREBASE_STORAGE_BUCKET=ealmatch-railway.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=521154811677
VITE_FIREBASE_APP_ID=xxxxxxxxxxxxx

# Database (Required)
DATABASE_URL=postgresql://xxxxxxxxxxxxx

# Other
SESSION_SECRET=xxxxxxxxxxxxx
PORT=3000
NODE_ENV=production
```

## 🔧 Troubleshooting

1. **"Service temporarily unavailable"**
   - No API keys are set
   - Add at least GROQ_API_KEY

2. **Analysis returns null**
   - Check Railway logs for errors
   - Verify API key is valid

3. **Fallback responses**
   - System is using hardcoded responses
   - Add API keys to enable real AI

## 🚀 Action Items

1. **IMMEDIATE**: Add `GROQ_API_KEY` to Railway
2. **IMPORTANT**: Test job creation after deployment
3. **OPTIONAL**: Add backup providers (OpenAI/Anthropic)