from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import os
import uuid
from pathlib import Path

from api import detection, speaker, report, streaming

app = FastAPI(title="语音深度伪造检测取证系统", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

app.include_router(detection.router, prefix="/api/detection", tags=["检测"])
app.include_router(speaker.router, prefix="/api/speaker", tags=["说话人验证"])
app.include_router(report.router, prefix="/api/report", tags=["报告导出"])
app.include_router(streaming.router, prefix="/api/streaming", tags=["流式检测"])

@app.get("/")
async def root():
    return {"message": "语音深度伪造检测取证系统 API", "version": "1.0.0"}

@app.post("/api/upload")
async def upload_audio(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(('.wav', '.mp3', '.flac')):
        raise HTTPException(status_code=400, detail="只支持 WAV/MP3/FLAC 格式")
    
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1].lower()
    file_path = UPLOAD_DIR / f"{file_id}{ext}"
    
    with open(file_path, "wb") as buffer:
        content = await file.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="文件大小不能超过10MB")
        buffer.write(content)
    
    return {"file_id": file_id, "filename": file.filename, "file_path": str(file_path)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
