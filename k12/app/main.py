from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import router
from .config import get_settings

settings = get_settings()

app = FastAPI(
    title="卫星通信链路预算与干扰分析平台",
    description="基于Python+FastAPI+NumPy+SciPy+Redis+PostgreSQL的卫星通信分析平台",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "message": "卫星通信链路预算与干扰分析平台",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
