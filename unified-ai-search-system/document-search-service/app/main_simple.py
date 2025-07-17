from fastapi import FastAPI
import os

app = FastAPI(title="Simple Test App")

@app.get("/")
async def root():
    return {
        "message": "Simple test app working",
        "port": os.getenv("PORT", "8000"),
        "railway_env": os.getenv("RAILWAY_ENVIRONMENT", "not set"),
        "index_path": os.getenv("INDEX_PATH", "not set"),
        "data_path": os.getenv("DATA_PATH", "not set")
    }

@app.get("/health")
async def health():
    return {"status": "healthy", "message": "Simple app running"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app.main_simple:app", host="0.0.0.0", port=port)