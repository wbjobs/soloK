from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import tempfile
import uuid

from app.database import get_db
from app.models.models import Mission, Detection, Track, Measurement
from app.schemas.schemas import (
    MissionCreate,
    MissionResponse,
    MissionUpdate,
    DetectionResponse,
    TrackResponse,
    MeasurementResponse,
    DetectRequest,
    DetectResponse,
)
from app.services.sonar_parser import sonar_parser
from app.services.detector import detector
from app.services.tracker import tracker
from app.services.measurement import measurement_service
from app.services.image_enhancer import image_enhancer
from app.services.terrain import terrain_stitcher
from app.services.report_generator import report_generator
from app.utils.minio_client import minio_client
from app.core.logging import logger

router = APIRouter(prefix="/api/upload", tags=["Upload"])


@router.post("/file")
async def upload_sonar_file(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in [".xtf", ".sgf"]:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format: {file_ext}. Supported: .xtf, .sgf",
        )

    try:
        file_content = await file.read()
        temp_dir = tempfile.mkdtemp()
        temp_path = os.path.join(temp_dir, file.filename)

        with open(temp_path, "wb") as f:
            f.write(file_content)

        object_name = f"missions/{uuid.uuid4().hex}{file_ext}"
        upload_success = minio_client.upload_file(temp_path, object_name)

        if not upload_success:
            os.unlink(temp_path)
            os.rmdir(temp_dir)
            raise HTTPException(status_code=500, detail="Failed to upload file to storage")

        sonar_data = sonar_parser.parse(temp_path, file_ext)
        if not sonar_data:
            os.unlink(temp_path)
            os.rmdir(temp_dir)
            raise HTTPException(status_code=400, detail="Failed to parse sonar file")

        mission = Mission(
            name=name,
            description=description,
            file_name=file.filename,
            file_format=file_ext.strip("."),
            file_path=object_name,
            status="uploaded",
        )
        db.add(mission)
        db.commit()
        db.refresh(mission)

        os.unlink(temp_path)
        os.rmdir(temp_dir)

        return {
            "success": True,
            "mission_id": mission.id,
            "file_name": mission.file_name,
            "num_pings": len(sonar_data.pings),
            "num_samples": sonar_data.num_samples,
            "sample_rate": sonar_data.sample_rate,
            "water_depth": sonar_data.water_depth,
            "message": "File uploaded and parsed successfully",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/parse/{mission_id}")
async def parse_sonar_mission(
    mission_id: int,
    db: Session = Depends(get_db),
):
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    try:
        temp_dir = tempfile.mkdtemp()
        local_path = os.path.join(temp_dir, mission.file_name)

        download_success = minio_client.download_file(mission.file_path, local_path)
        if not download_success:
            os.rmdir(temp_dir)
            raise HTTPException(status_code=500, detail="Failed to download file from storage")

        sonar_data = sonar_parser.parse(local_path, f".{mission.file_format}")
        if not sonar_data:
            os.unlink(local_path)
            os.rmdir(temp_dir)
            raise HTTPException(status_code=400, detail="Failed to parse sonar file")

        waterfall = sonar_generator.generate_waterfall_image(sonar_data, max_pings=500)

        os.unlink(local_path)
        os.rmdir(temp_dir)

        return {
            "success": True,
            "mission_id": mission_id,
            "num_pings": len(sonar_data.pings),
            "num_samples": sonar_data.num_samples,
            "sample_rate": sonar_data.sample_rate,
            "water_depth": sonar_data.water_depth,
            "waterfall_image_shape": list(waterfall.shape),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Parse error: {e}")
        raise HTTPException(status_code=500, detail=f"Parse failed: {str(e)}")


@router.post("/enhance/{mission_id}")
async def enhance_sonar_image(
    mission_id: int,
    apply_equalization: bool = True,
    apply_median_filter: bool = True,
    median_kernel_size: int = 3,
    clahe_clip_limit: float = 2.0,
    db: Session = Depends(get_db),
):
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    try:
        temp_dir = tempfile.mkdtemp()
        local_path = os.path.join(temp_dir, mission.file_name)

        minio_client.download_file(mission.file_path, local_path)

        sonar_data = sonar_parser.parse(local_path, f".{mission.file_format}")
        if not sonar_data:
            os.unlink(local_path)
            os.rmdir(temp_dir)
            raise HTTPException(status_code=400, detail="Failed to parse sonar file")

        waterfall = sonar_generator.generate_waterfall_image(sonar_data, max_pings=500)

        enhance_result = image_enhancer.enhance(
            waterfall,
            apply_equalization=apply_equalization,
            apply_median_filter=apply_median_filter,
            median_kernel_size=median_kernel_size,
            clahe_clip_limit=clahe_clip_limit,
        )

        os.unlink(local_path)
        os.rmdir(temp_dir)

        return {
            "success": True,
            "mission_id": mission_id,
            "operations": enhance_result["operations"],
            "enhanced_image_shape": list(enhance_result["image"].shape),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Enhance error: {e}")
        raise HTTPException(status_code=500, detail=f"Enhancement failed: {str(e)}")
