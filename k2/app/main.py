from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import get_settings
from .database import engine, Base
from .models import VariantMapping, CorrectionHistory, BatchTask
from .routes import router
from .rate_limiter import RateLimitMiddleware
from .variant_data import get_all_mappings

settings = get_settings()

app = FastAPI(
    title="古籍刻本异体字OCR后矫正API服务",
    description="接收OCR引擎输出的古籍文本（含错误识别），返回矫正后的标准繁体字文本",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(RateLimitMiddleware)

app.include_router(router)


@app.on_event("startup")
async def startup_event():
    Base.metadata.create_all(bind=engine)
    
    from .database import SessionLocal
    db = SessionLocal()
    try:
        count = db.query(VariantMapping).count()
        if count == 0:
            mappings = get_all_mappings()
            for variant, standard, vtype in mappings:
                existing = db.query(VariantMapping).filter(
                    VariantMapping.variant == variant
                ).first()
                if not existing:
                    db_mapping = VariantMapping(
                        variant=variant,
                        standard=standard,
                        variant_type=vtype,
                        source="内置字典"
                    )
                    db.add(db_mapping)
            db.commit()
            print(f"已初始化 {len(mappings)} 条异体字映射数据")
    finally:
        db.close()


@app.get("/", summary="根路径")
async def root():
    return {
        "name": "古籍刻本异体字OCR后矫正API服务",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "correct": "/correct (POST)",
            "batch_correct": "/batch_correct (POST)",
            "history": "/history/{task_id} (GET)",
            "batch_history": "/batch_history/{task_id} (GET)",
            "add_variant": "/add_variant (POST)",
            "stats": "/stats (GET)"
        }
    }


@app.get("/health", summary="健康检查")
async def health_check():
    return {"status": "healthy"}
