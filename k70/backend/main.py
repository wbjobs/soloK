import os
import uuid
import asyncio
import json
from datetime import datetime
from typing import Dict, List, Optional
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, WebSocket, WebSocketDisconnect, Depends, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from PIL import Image
import io

from .config import settings
from .database import get_db, init_db, InpaintingTask
from .ai_service import inpainting_service

settings.create_dirs()

app = FastAPI(title="AI Inpainting Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = os.path.join(settings.BASE_DIR, "frontend")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
app.mount("/generated", StaticFiles(directory=settings.GENERATED_DIR), name="generated")
app.mount("/masks", StaticFiles(directory=settings.MASK_DIR), name="masks")
app.mount("/reference", StaticFiles(directory=settings.REFERENCE_DIR), name="reference")

active_connections: Dict[str, WebSocket] = {}
batch_progress: Dict[str, Dict] = {}

@app.on_event("startup")
async def startup_event():
    init_db()
    print("Database initialized")

@app.get("/")
async def root():
    return FileResponse(os.path.join(settings.BASE_DIR, "frontend", "index.html"))

@app.post("/api/upload")
async def upload_image(
    image: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid image file")
    
    file_ext = os.path.splitext(image.filename)[1]
    file_id = str(uuid.uuid4())
    file_path = os.path.join(settings.UPLOAD_DIR, f"{file_id}{file_ext}")
    
    with open(file_path, "wb") as f:
        content = await image.read()
        f.write(content)
    
    return JSONResponse({
        "file_id": file_id,
        "file_path": file_path,
        "url": f"/uploads/{file_id}{file_ext}",
        "filename": image.filename
    })

@app.post("/api/upload-reference")
async def upload_reference(
    image: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid image file")
    
    file_ext = os.path.splitext(image.filename)[1]
    file_id = str(uuid.uuid4())
    file_path = os.path.join(settings.REFERENCE_DIR, f"{file_id}{file_ext}")
    
    with open(file_path, "wb") as f:
        content = await image.read()
        f.write(content)
    
    return JSONResponse({
        "file_id": file_id,
        "file_path": file_path,
        "url": f"/reference/{file_id}{file_ext}",
        "filename": image.filename
    })

def _save_mask(mask_data: str) -> str:
    import base64
    mask_id = str(uuid.uuid4())
    mask_path = os.path.join(settings.MASK_DIR, f"{mask_id}.png")
    
    mask_header, mask_base64 = mask_data.split(",", 1)
    mask_bytes = base64.b64decode(mask_base64)
    mask_image = Image.open(io.BytesIO(mask_bytes))
    mask_image.save(mask_path, format="PNG")
    mask_image.close()
    
    return mask_path

def _get_original_path(file_id: str) -> str:
    original_files = [f for f in os.listdir(settings.UPLOAD_DIR) if f.startswith(file_id)]
    if not original_files:
        raise HTTPException(status_code=404, detail="Original image not found")
    return os.path.join(settings.UPLOAD_DIR, original_files[0])

def _get_reference_path(file_id: Optional[str]) -> Optional[str]:
    if not file_id:
        return None
    ref_files = [f for f in os.listdir(settings.REFERENCE_DIR) if f.startswith(file_id)]
    if not ref_files:
        return None
    return os.path.join(settings.REFERENCE_DIR, ref_files[0])

@app.post("/api/inpaint")
async def create_inpaint_task(
    original_image_id: str = Form(...),
    mask_data: str = Form(...),
    prompt: str = Form(...),
    reference_image_id: Optional[str] = Form(None),
    num_inference_steps: int = Form(50),
    guidance_scale: float = Form(7.5),
    strength: float = Form(1.0),
    db: Session = Depends(get_db)
):
    try:
        original_path = _get_original_path(original_image_id)
        mask_path = _save_mask(mask_data)
        reference_path = _get_reference_path(reference_image_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid input: {str(e)}")
    
    task = InpaintingTask(
        original_image_path=original_path,
        mask_image_path=mask_path,
        reference_image_path=reference_path,
        prompt=prompt,
        status="pending",
        progress=0.0
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    
    asyncio.create_task(
        run_inpainting_task(
            task.id,
            original_path,
            mask_path,
            prompt,
            reference_path,
            num_inference_steps,
            guidance_scale,
            strength,
            db
        )
    )
    
    return JSONResponse(task.to_dict())

@app.post("/api/batch-inpaint")
async def create_batch_inpaint(
    tasks_data: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        tasks_list = json.loads(tasks_data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid tasks JSON")
    
    batch_id = str(uuid.uuid4())
    created_tasks = []
    
    for task_data in tasks_list:
        try:
            original_path = _get_original_path(task_data["original_image_id"])
            mask_path = _save_mask(task_data["mask_data"])
            reference_path = _get_reference_path(task_data.get("reference_image_id"))
        except Exception as e:
            continue
        
        task = InpaintingTask(
            original_image_path=original_path,
            mask_image_path=mask_path,
            reference_image_path=reference_path,
            prompt=task_data.get("prompt", ""),
            status="pending",
            progress=0.0
        )
        db.add(task)
        db.flush()
        db.refresh(task)
        created_tasks.append({
            "task_id": task.id,
            "original_path": original_path,
            "mask_path": mask_path,
            "reference_path": reference_path,
            "prompt": task_data.get("prompt", ""),
            "num_inference_steps": task_data.get("num_inference_steps", 50),
            "guidance_scale": task_data.get("guidance_scale", 7.5),
            "strength": task_data.get("strength", 1.0),
        })
    
    db.commit()
    
    batch_progress[batch_id] = {
        "total": len(created_tasks),
        "completed": 0,
        "failed": 0,
        "tasks": [t["task_id"] for t in created_tasks]
    }
    
    asyncio.create_task(run_batch_tasks(batch_id, created_tasks, db))
    
    return JSONResponse({
        "batch_id": batch_id,
        "total_tasks": len(created_tasks),
        "task_ids": [t["task_id"] for t in created_tasks]
    })

async def run_batch_tasks(batch_id: str, tasks: List[Dict], db: Session):
    for task_info in tasks:
        try:
            await run_inpainting_task(
                task_info["task_id"],
                task_info["original_path"],
                task_info["mask_path"],
                task_info["prompt"],
                task_info["reference_path"],
                task_info["num_inference_steps"],
                task_info["guidance_scale"],
                task_info["strength"],
                db
            )
            
            if batch_id in batch_progress:
                batch_progress[batch_id]["completed"] += 1
                broadcast_batch_progress(batch_id)
                
        except Exception as e:
            if batch_id in batch_progress:
                batch_progress[batch_id]["failed"] += 1
                broadcast_batch_progress(batch_id)
    
    if batch_id in batch_progress:
        del batch_progress[batch_id]

def broadcast_batch_progress(batch_id: str):
    if batch_id not in batch_progress:
        return
    
    info = batch_progress[batch_id]
    message = {
        "batch_id": batch_id,
        "total": info["total"],
        "completed": info["completed"],
        "failed": info["failed"],
        "progress": (info["completed"] + info["failed"]) / info["total"] * 100
    }
    
    for ws in active_connections.values():
        asyncio.create_task(ws.send_json({"type": "batch", **message}))

async def run_inpainting_task(
    task_id: int,
    original_path: str,
    mask_path: str,
    prompt: str,
    reference_path: Optional[str],
    num_inference_steps: int,
    guidance_scale: float,
    strength: float,
    db: Session
):
    try:
        task = db.query(InpaintingTask).filter(InpaintingTask.id == task_id).first()
        if not task:
            return
        
        task.status = "processing"
        db.commit()
        
        broadcast_progress(task_id, 5.0, "loading")
        
        original_image = Image.open(original_path)
        mask_image = Image.open(mask_path)
        reference_image = Image.open(reference_path) if reference_path else None
        
        def progress_callback(progress: float):
            adjusted_progress = 5.0 + (progress * 0.9)
            broadcast_progress(task_id, adjusted_progress, "generating")
            
            task.progress = adjusted_progress
            db.commit()
        
        broadcast_progress(task_id, 10.0, "loading_model")
        
        generated_image = await asyncio.to_thread(
            inpainting_service.generate,
            image=original_image,
            mask_image=mask_image,
            prompt=prompt,
            reference_image=reference_image,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            strength=strength,
            progress_callback=progress_callback
        )
        
        original_image.close()
        mask_image.close()
        if reference_image:
            reference_image.close()
        
        generated_id = str(uuid.uuid4())
        generated_filename = f"{generated_id}.png"
        generated_path = os.path.join(settings.GENERATED_DIR, generated_filename)
        generated_image.save(generated_path, format="PNG")
        generated_image.close()
        
        task.generated_image_path = generated_path
        task.status = "completed"
        task.progress = 100.0
        task.completed_at = datetime.utcnow()
        db.commit()
        
        generated_url = f"/generated/{generated_filename}"
        broadcast_progress(task_id, 100.0, "completed", generated_url)
        
    except Exception as e:
        task = db.query(InpaintingTask).filter(InpaintingTask.id == task_id).first()
        if task:
            task.status = "failed"
            task.error_message = str(e)
            db.commit()
        broadcast_progress(task_id, 0.0, "failed", error=str(e))
        print(f"Task {task_id} failed: {str(e)}")
    finally:
        db.close()

@app.post("/api/tasks/{task_id}/regenerate")
async def regenerate_task(
    task_id: int,
    prompt: Optional[str] = Form(None),
    reference_image_id: Optional[str] = Form(None),
    num_inference_steps: int = Form(50),
    guidance_scale: float = Form(7.5),
    strength: float = Form(1.0),
    db: Session = Depends(get_db)
):
    task = db.query(InpaintingTask).filter(InpaintingTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    reference_path = _get_reference_path(reference_image_id) if reference_image_id else task.reference_image_path
    
    new_task = InpaintingTask(
        original_image_path=task.original_image_path,
        mask_image_path=task.mask_image_path,
        reference_image_path=reference_path,
        prompt=prompt or task.prompt,
        status="pending",
        progress=0.0
    )
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    
    asyncio.create_task(
        run_inpainting_task(
            new_task.id,
            task.original_image_path,
            task.mask_image_path,
            prompt or task.prompt,
            reference_path,
            num_inference_steps,
            guidance_scale,
            strength,
            db
        )
    )
    
    return JSONResponse(new_task.to_dict())

def broadcast_progress(task_id: int, progress: float, status: str, url: str = None, error: str = None):
    message = {
        "type": "single",
        "task_id": task_id,
        "progress": progress,
        "status": status,
    }
    if url:
        message["generated_url"] = url
    if error:
        message["error"] = error
    
    for ws in active_connections.values():
        asyncio.create_task(ws.send_json(message))

@app.websocket("/ws/progress")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connection_id = str(uuid.uuid4())
    active_connections[connection_id] = websocket
    
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        del active_connections[connection_id]
    except Exception as e:
        if connection_id in active_connections:
            del active_connections[connection_id]

@app.get("/api/tasks/{task_id}")
async def get_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(InpaintingTask).filter(InpaintingTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return JSONResponse(task.to_dict())

@app.get("/api/tasks")
async def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=100),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(InpaintingTask)
    
    if status:
        query = query.filter(InpaintingTask.status == status)
    
    total = query.count()
    tasks = query.order_by(InpaintingTask.created_at.desc()) \
                .offset((page - 1) * page_size) \
                .limit(page_size) \
                .all()
    
    return JSONResponse({
        "items": [task.to_dict() for task in tasks],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    })

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(InpaintingTask).filter(InpaintingTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    for path_attr in ["original_image_path", "mask_image_path", "generated_image_path", "reference_image_path"]:
        path = getattr(task, path_attr)
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except:
                pass
    
    db.delete(task)
    db.commit()
    
    return JSONResponse({"message": "Task deleted successfully"})
