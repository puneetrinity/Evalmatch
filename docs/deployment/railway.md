# 🚄 Railway Deployment Guide

## 🚀 **Quick Start**

### **1. Deploy to Railway**
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template)

### **2. Set Up Firebase Project**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use existing)
3. Enable Authentication → Sign-in methods:
   - ✅ Email/Password
   - ✅ Google (optional)
4. Generate service account key:
   - Project Settings → Service accounts → Generate new private key

### **3. Configure Environment Variables in Railway**
Copy values from `railway.env.example` to your Railway project:

**Required Variables:**
```bash
NODE_ENV=production
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456:web:abc123
GROQ_API_KEY=your-groq-api-key
SESSION_SECRET=your-secure-random-string
```

### **4. Add Database (Optional)**
1. In Railway dashboard: Add service → PostgreSQL
2. Railway will automatically set `DATABASE_URL`
3. App will use memory storage if no database is configured

---

## 🔍 **Debug & Monitoring**

### **Debug Endpoint**
Your deployed app includes a comprehensive debug endpoint:
```
GET https://your-app.railway.app/api/debug
```

**Debug Information Provided:**
- ✅ Environment variables status
- ✅ System information (Node.js version, memory, CPU)
- ✅ Firebase connection test
- ✅ Database connection status
- ✅ Storage functionality test
- ✅ Protected vs public routes listing

### **Health Check Endpoints**
```bash
# Basic health check
GET /api/health

# Database status
GET /api/db-status

# AI services status  
GET /api/service-status

# Comprehensive debug info
GET /api/debug
```

---

## 🛡️ **Security Configuration**

### **Firebase Authentication**
- ✅ All API endpoints require authentication
- ✅ User data isolation (users only see their own data)
- ✅ JWT token verification on every request
- ✅ Google OAuth integration available

### **Environment Variables**
- ✅ All secrets stored as Railway environment variables
- ✅ No sensitive data in code repository
- ✅ Firebase service account key as JSON string

---

## 🚄 **Railway-Specific Features**

### **Automatic Deployment**
- ✅ Deploys automatically on git push
- ✅ Zero-downtime deployments
- ✅ Automatic HTTPS certificates

### **Built-in Monitoring**
- ✅ Application logs via Railway dashboard
- ✅ Memory and CPU monitoring
- ✅ Custom debug endpoint for troubleshooting

### **Scaling**
- ✅ Automatic scaling based on traffic
- ✅ Multiple regions available
- ✅ CDN for static assets

---

## 📋 **Deployment Checklist**

### **Before Deployment:**
- [ ] Firebase project created and configured
- [ ] Service account key generated
- [ ] Environment variables prepared
- [ ] API keys obtained (Groq, OpenAI, Anthropic)

### **After Deployment:**
- [ ] Visit `/api/debug` to verify configuration
- [ ] Test authentication flow
- [ ] Upload a test resume
- [ ] Create a test job description
- [ ] Run analysis to verify AI integration

### **Production Checklist:**
- [ ] All environment variables configured
- [ ] Firebase authentication working
- [ ] Database connected (if using PostgreSQL)
- [ ] AI providers responding
- [ ] Debug endpoint shows green status

---

## 🔧 **Troubleshooting**

### **Common Issues:**

**❌ Firebase Not Working**
```json
// Check /api/debug response:
{
  "firebaseConnection": {
    "configured": false,
    "reason": "Missing FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT_KEY"
  }
}
```
**Solution:** Add Firebase environment variables

**❌ Database Connection Failed**
```json
// Check /api/debug response:
{
  "configuration": {
    "databaseConfigured": false
  }
}
```
**Solution:** Add PostgreSQL service in Railway or app will use memory storage

**❌ AI Providers Not Working**
```json
// Check /api/debug response:
{
  "configuration": {
    "groqConfigured": false,
    "openaiConfigured": false
  }
}
```
**Solution:** Add AI provider API keys

### **Debug Commands:**
```bash
# Check deployment status
curl https://your-app.railway.app/api/debug

# Test authentication
curl https://your-app.railway.app/api/resumes
# Should return: 401 Unauthorized

# Test health
curl https://your-app.railway.app/api/health
```

---

## 🌟 **Expected Debug Response**

After successful deployment, `/api/debug` should return:
```json
{
  "timestamp": "2025-01-24T...",
  "environment": {
    "NODE_ENV": "production",
    "RAILWAY_ENVIRONMENT": "production",
    "RAILWAY_SERVICE_NAME": "evalmatch"
  },
  "configuration": {
    "databaseConfigured": true,
    "firebaseConfigured": true,
    "groqConfigured": true
  },
  "firebaseConnection": {
    "configured": true,
    "connectionTest": {
      "status": "connected",
      "projectId": "your-project-id"
    },
    "testSuccessful": true
  },
  "storage": {
    "type": "DatabaseStorage",
    "available": true,
    "testSuccessful": true
  },
  "routes": {
    "authenticationEnabled": true,
    "protectedRoutes": [...],
    "publicRoutes": [...]
  }
}
```

---

## 🎯 **Next Steps**

1. **Deploy to Railway** using this configuration
2. **Configure environment variables** from `railway.env.example`
3. **Test the deployment** using `/api/debug` endpoint
4. **Set up Firebase project** and add credentials
5. **Test authentication flow** end-to-end
6. **Monitor logs** via Railway dashboard

Your EvalMatch application will be fully deployed with enterprise-grade security! 🚀