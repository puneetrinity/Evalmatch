"""
Model Management API
Simple endpoints for downloading and managing Ollama models
"""

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

router = APIRouter()


class ModelDownloadRequest(BaseModel):
    model_name: str = "phi3:mini"


class ModelDownloadResponse(BaseModel):
    status: str
    message: str
    model_name: str


@router.post("/download", response_model=ModelDownloadResponse)
async def download_model(
    request: ModelDownloadRequest, background_tasks: BackgroundTasks
):
    """Download an Ollama model via API call"""

    try:
        # Use the internal Ollama API to download the model
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(
                "http://localhost:11434/api/pull",
                json={"name": request.model_name},
                timeout=300.0,  # 5 minute timeout
            )

            if response.status_code == 200:
                return ModelDownloadResponse(
                    status="success",
                    message=f"Model {request.model_name} downloaded successfully",
                    model_name=request.model_name,
                )
            else:
                raise HTTPException(
                    status_code=500, detail=f"Failed to download model: {response.text}"
                )

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error downloading model: {str(e)}"
        )


@router.get("/list")
async def list_models():
    """List available models"""

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("http://localhost:11434/api/tags")

            if response.status_code == 200:
                return response.json()
            else:
                raise HTTPException(status_code=500, detail="Failed to list models")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing models: {str(e)}")


@router.delete("/remove/{model_name}")
async def remove_model(model_name: str):
    """Remove a model"""

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Ollama delete endpoint expects a POST request, not DELETE
            response = await client.post(
                "http://localhost:11434/api/delete",
                json={"name": model_name},
                timeout=60.0,
            )

            if response.status_code == 200:
                return {"status": "success", "message": f"Model {model_name} removed"}
            else:
                raise HTTPException(
                    status_code=500, detail=f"Failed to remove model: {response.text}"
                )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error removing model: {str(e)}")


@router.get("/status/{model_name}")
async def model_status(model_name: str):
    """Check if a model is available"""

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("http://localhost:11434/api/tags")

            if response.status_code == 200:
                models = response.json().get("models", [])
                model_names = [model.get("name", "") for model in models]

                is_available = any(model_name in name for name in model_names)

                return {
                    "model_name": model_name,
                    "available": is_available,
                    "all_models": model_names,
                }
            else:
                raise HTTPException(
                    status_code=500, detail="Failed to check model status"
                )

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error checking model status: {str(e)}"
        )
