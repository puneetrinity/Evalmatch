# GitHub Actions Setup for DockerHub Deployment

## 🔧 **Setup Instructions**

### **Step 1: Add DockerHub Credentials to GitHub**

1. **Go to your GitHub repository**
2. **Navigate to**: Settings → Secrets and variables → Actions
3. **Add the following secrets:**

   | Secret Name | Value | Description |
   |-------------|-------|-------------|
   | `DOCKERHUB_USERNAME` | `your_dockerhub_username` | Your DockerHub username |
   | `DOCKERHUB_TOKEN` | `your_dockerhub_access_token` | DockerHub access token (not password) |

### **Step 2: Create DockerHub Access Token**

1. **Go to DockerHub**: https://hub.docker.com/
2. **Click your profile** → Account Settings
3. **Go to Security** → New Access Token
4. **Create token** with name: `github-actions-ai-search`
5. **Copy the token** (you'll only see it once)
6. **Use this token** as `DOCKERHUB_TOKEN` secret

### **Step 3: Push the Workflow**

```bash
# Add the workflow file to git
git add .github/workflows/docker-build-push.yml

# Commit and push
git commit -m "Add GitHub Actions workflow for DockerHub deployment"
git push origin main
```

## 🚀 **What the Workflow Does**

### **Automatic Triggers:**
- ✅ **Push to main/master**: Builds and pushes automatically
- ✅ **Pull requests**: Builds for testing (doesn't push)
- ✅ **Manual trigger**: Run workflow manually with custom tags

### **Images Built:**
1. **`advancellmsearch/ai-search-system:latest`** - App-only, fast deployment
2. **`advancellmsearch/ai-search-system:gpu`** - GPU-optimized version
3. **`advancellmsearch/ai-search-system:runpod`** - RunPod-ready version

### **Features:**
- 🔄 **Build caching** for faster subsequent builds
- 🧪 **Automated testing** of built images
- 📱 **Multi-platform support** (linux/amd64)
- 📊 **Deployment information** in workflow summary
- ⚡ **Fast builds** (~5-10 minutes on GitHub's infrastructure)

## 📋 **Workflow Status**

After setting up and pushing, you can:

1. **Monitor builds**: Go to Actions tab in your GitHub repo
2. **View logs**: Click on any workflow run to see detailed logs
3. **Check DockerHub**: Images will appear at https://hub.docker.com/r/advancellmsearch/ai-search-system

## 🎯 **Expected Results**

### **After Successful Build:**
- ✅ Three Docker images available on DockerHub
- ✅ Automatic deployment instructions in workflow summary
- ✅ Images ready for RunPod deployment

### **RunPod Deployment Commands:**
```bash
# Quick deployment (recommended)
docker run -d --gpus all -p 8000:8000 --name ai-search \
  advancellmsearch/ai-search-system:latest

# GPU-optimized deployment  
docker run -d --gpus all -p 8000:8000 --name ai-search \
  advancellmsearch/ai-search-system:runpod
```

## 🛠️ **Troubleshooting**

### **If Build Fails:**

1. **Check secrets**: Ensure DOCKERHUB_USERNAME and DOCKERHUB_TOKEN are correct
2. **Check repository name**: Must match `advancellmsearch/ai-search-system`
3. **Check DockerHub permissions**: Token must have push permissions

### **If Images Don't Appear:**

1. **Check workflow logs**: Go to Actions tab → Click on failed run
2. **Verify DockerHub repo**: May need to create repository first
3. **Check push permissions**: Token must have write access

## 🎉 **Next Steps After Setup**

1. **Add secrets to GitHub**
2. **Push the workflow**
3. **Monitor the build** (takes ~5-10 minutes)
4. **Deploy on RunPod** using the built images
5. **Test all APIs** and functionality

This workflow will automatically build and push your Docker images whenever you update the code, making deployment to RunPod seamless!