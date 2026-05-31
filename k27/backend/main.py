from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.api.routes import router
from app.core.config import settings
from app.core.influxdb import influxdb_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"启动 {settings.APP_NAME} v{settings.VERSION}")
    yield
    influxdb_manager.close()
    print("服务已关闭")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="异步电机故障诊断系统 - 基于振动和电流信号的智能故障诊断",
    lifespan=lifespan
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
        "name": settings.APP_NAME,
        "version": settings.VERSION,
        "message": "欢迎使用异步电机故障诊断系统API",
        "docs": "/docs"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
