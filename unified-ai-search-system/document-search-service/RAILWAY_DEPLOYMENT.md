# Railway Deployment Guide

## Storage Configuration

### 1. Create Railway Volume

In your Railway project dashboard:
1. Go to **Settings** → **Variables**
2. Click **Add Volume**
3. Configure:
   - **Mount Path**: `/app/data`
   - **Size**: 1GB (or more based on your needs)

### 2. Environment Variables

Add these environment variables in Railway:
```
RAILWAY_ENVIRONMENT=production
INDEX_PATH=/app/data/indexes
DATA_PATH=/app/data
```

### 3. Deploy

After adding the volume and environment variables:
1. Push your code to GitHub
2. Railway will automatically redeploy
3. The application will use persistent storage at `/app/data`

## Storage Structure

```
/app/data/
├── indexes/           # Search indexes (HNSW, LSH, BM25)
├── documents/         # Uploaded documents
├── embeddings/        # Cached embeddings
└── logs/             # Application logs
```

## After Deployment

1. **Upload documents** via `/api/v2/rag/documents`
2. **Build indexes** via `/api/v2/admin/build-indexes`
3. **Test search** via `/api/v2/search/ultra-fast`

## Troubleshooting

- **Storage issues**: Check if volume is mounted at `/app/data`
- **Index building fails**: Ensure write permissions on volume
- **Slow performance**: Consider increasing volume size or using Redis for caching