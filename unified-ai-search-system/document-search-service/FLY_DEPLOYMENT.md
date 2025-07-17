# Fly.io Deployment Instructions

## Complete ML Search Application on Fly.io

This guide shows how to deploy the full ML-powered search application to Fly.io.

### Prerequisites

1. Install flyctl CLI:
```bash
curl -L https://fly.io/install.sh | sh
# Add to PATH
export PATH="$HOME/.fly/bin:$PATH"
```

2. Login to Fly.io:
```bash
flyctl auth login
```

### Deployment Steps

1. **Navigate to project directory**:
```bash
cd /home/ews/ideal-octo-goggles
```

2. **Launch the app** (if not already created):
```bash
flyctl launch --no-deploy
```

3. **Deploy the application**:
```bash
flyctl deploy
```

4. **Check deployment status**:
```bash
flyctl status
flyctl logs
```

5. **Test the deployed app**:
```bash
# Get your app URL
flyctl info

# Test health endpoint
curl https://your-app-name.fly.dev/health

# Test search API
curl https://your-app-name.fly.dev/api/status

# Open in browser
flyctl open
```

### Configuration Details

- **App Name**: ideal-octo-goggles
- **Region**: iad (US East)
- **Memory**: 2GB (required for ML models)
- **CPU**: 2 shared CPUs
- **Port**: 8000
- **Health Check**: /health endpoint
- **Storage**: Persistent volume mounted at /app/data

### Environment Variables

The following environment variables are configured in `fly.toml`:

- `PORT=8000` - Application port
- `PYTHON_ENV=production` - Environment mode
- `EMBEDDING_DIM=384` - ML model dimension
- `USE_GPU=false` - CPU-only mode
- `INDEX_PATH=/app/data/indexes` - Search index storage
- `UPLOAD_PATH=/app/data/uploads` - Upload storage

### Application Features

✅ **Full ML Search Engine**
- Sentence transformers for semantic search
- FAISS vector database
- Hybrid search (semantic + keyword)

✅ **Document Management**
- Upload individual profiles
- Bulk upload via JSON
- Real-time indexing

✅ **Web Interface**
- Clean, responsive UI
- Real-time search
- Profile management

✅ **API Endpoints**
- RESTful API design
- Health monitoring
- Performance metrics

### Monitoring

Check application logs:
```bash
flyctl logs --follow
```

Scale the application:
```bash
flyctl scale count 2  # Scale to 2 machines
flyctl scale memory 4096  # Increase to 4GB RAM
```

### Troubleshooting

If deployment fails:

1. **Check logs**:
```bash
flyctl logs --follow
```

2. **Verify health check**:
```bash
curl https://your-app.fly.dev/health
```

3. **Test locally**:
```bash
docker build -t ml-search .
docker run -p 8000:8000 ml-search
```

4. **Common issues**:
- Memory: Increase to 4GB if ML models fail to load
- Build timeout: Use multi-stage Docker build (already configured)
- Dependencies: Check requirements are properly installed

### Success Criteria

Application is successfully deployed when:

- ✅ Health check returns 200 OK
- ✅ /api/status shows ML components loaded
- ✅ Search functionality works via API and UI
- ✅ Document upload and indexing works

### Next Steps

After successful deployment:

1. Test all functionality via the web interface
2. Upload sample data to verify search
3. Monitor performance and scale as needed
4. Set up custom domain if required