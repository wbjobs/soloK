import uvicorn
from backend.config import settings

if __name__ == "__main__":
    print(f"🚀 Starting AI Inpainting Server on http://{settings.HOST}:{settings.PORT}")
    print(f"📁 Upload directory: {settings.UPLOAD_DIR}")
    print(f"📁 Generated directory: {settings.GENERATED_DIR}")
    print(f"📁 Mask directory: {settings.MASK_DIR}")
    print(f"🤖 Model: {settings.MODEL_ID}")
    print(f"⚡ Device: {settings.DEVICE}")
    print("\n📖 Open your browser and navigate to http://localhost:8000")
    print("=" * 60)
    
    uvicorn.run(
        "backend.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True
    )
