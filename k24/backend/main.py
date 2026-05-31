from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router as spectral_router

app = FastAPI(
    title="农作物病害高光谱监测平台 API",
    description="基于高光谱影像的农作物病害检测与监测系统",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(spectral_router, prefix="/api/v1", tags=["spectral"])


@app.get("/")
async def root():
    return {
        "message": "农作物病害高光谱监测平台 API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
