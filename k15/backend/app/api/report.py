from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional
import os
import tempfile
import numpy as np

from app.database import get_db
from app.models.models import Mission, Detection, Track, Measurement
from app.services.sonar_parser import sonar_parser
from app.services.detector import detector
from app.services.tracker import tracker
from app.services.measurement import measurement_service
from app.services.image_enhancer import image_enhancer
from app.services.terrain import terrain_stitcher
from app.services.report_generator import report_generator
from app.utils.minio_client import minio_client
from app.core.logging import logger

router = APIRouter(prefix="/api/report", tags=["Report"])


@router.get("/missions/{mission_id}/pdf")
async def download_mission_report(
    mission_id: int,
    db: Session = Depends(get_db),
):
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    try:
        detections = db.query(Detection).filter(Detection.mission_id == mission_id).all()
        tracks = db.query(Track).filter(Track.mission_id == mission_id).all()
        measurements = db.query(Measurement).filter(Measurement.mission_id == mission_id).all()

        det_dicts = [
            {
                "class_name": det.class_name,
                "confidence": det.confidence,
                "bbox": {
                    "x": det.bbox_x,
                    "y": det.bbox_y,
                    "width": det.bbox_w,
                    "height": det.bbox_h,
                },
            }
            for det in detections
        ]

        trk_dicts = [
            {
                "track_id": trk.track_id,
                "class_name": trk.class_name,
                "frame_start": trk.frame_start,
                "frame_end": trk.frame_end,
                "trajectory": trk.trajectory,
                "length_estimate": trk.length_estimate,
                "width_estimate": trk.width_estimate,
                "is_active": True,
            }
            for trk in tracks
        ]

        annotated_image = None
        try:
            temp_dir = tempfile.mkdtemp()
            local_path = os.path.join(temp_dir, mission.file_name)
            download_success = minio_client.download_file(mission.file_path, local_path)

            if download_success:
                sonar_data = sonar_parser.parse(local_path, f".{mission.file_format}")
                if sonar_data:
                    waterfall = sonar_generator.generate_waterfall_image(sonar_data, max_pings=500)
                    enhance_result = image_enhancer.enhance(waterfall)
                    enhanced = enhance_result["image"]

                    detection_results = detector.detect(enhanced)
                    annotated_image = detector.draw_detections(enhanced, detection_results)

            os.unlink(local_path)
            os.rmdir(temp_dir)
        except Exception as e:
            logger.warning(f"Could not generate annotated image: {e}")

        mission_dict = {
            "id": mission.id,
            "name": mission.name,
            "file_name": mission.file_name,
            "file_format": mission.file_format,
            "status": mission.status,
            "created_at": mission.created_at,
            "description": mission.description,
        }

        report_path = report_generator.generate_mission_report(
            mission_data=mission_dict,
            detections=det_dicts,
            tracks=trk_dicts,
            measurements=[{"measurement": m.actual_length} for m in measurements],
            annotated_image=annotated_image,
        )

        if not report_path or not os.path.exists(report_path):
            raise HTTPException(status_code=500, detail="Failed to generate report")

        filename = f"mission_{mission_id}_report.pdf"
        return FileResponse(
            path=report_path,
            filename=filename,
            media_type="application/pdf",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Report generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")


@router.get("/missions/{mission_id}/terrain")
async def generate_terrain_map(
    mission_id: int,
    format: str = "png",
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
            raise HTTPException(status_code=500, detail="Failed to download file")

        sonar_data = sonar_parser.parse(local_path, f".{mission.file_format}")
        if not sonar_data:
            os.unlink(local_path)
            os.rmdir(temp_dir)
            raise HTTPException(status_code=400, detail="Failed to parse sonar file")

        heightmap = terrain_stitcher.generate_heightmap_from_sonar(sonar_data)

        detections = db.query(Detection).filter(Detection.mission_id == mission_id).all()
        det_dicts = [
            {
                "class_name": det.class_name,
                "confidence": det.confidence,
                "bbox": {
                    "x": det.bbox_x,
                    "y": det.bbox_y,
                    "width": det.bbox_w,
                    "height": det.bbox_h,
                },
            }
            for det in detections
        ]

        colored_terrain = terrain_stitcher.create_colored_terrain(heightmap)
        overlaid = terrain_stitcher.overlay_detections(colored_terrain, det_dicts)

        if format.lower() == "geotiff":
            import cv2
            output_path = os.path.join(temp_dir, f"terrain_{mission_id}.tif")
            bounds = (0.0, 0.0, float(heightmap.shape[1]), float(heightmap.shape[0]))
            success = terrain_stitcher.export_geotiff(overlaid, output_path, bounds)
            if not success:
                os.unlink(local_path)
                os.rmdir(temp_dir)
                raise HTTPException(status_code=500, detail="Failed to export GeoTIFF")
        else:
            import cv2
            output_path = os.path.join(temp_dir, f"terrain_{mission_id}.png")
            cv2.imwrite(output_path, overlaid)

        os.unlink(local_path)

        filename = f"terrain_{mission_id}.{format.lower()}"
        media_type = "image/tiff" if format.lower() == "geotiff" else "image/png"

        return FileResponse(
            path=output_path,
            filename=filename,
            media_type=media_type,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Terrain generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Terrain generation failed: {str(e)}")


@router.get("/missions/{mission_id}/pie-chart")
async def get_classification_pie(
    mission_id: int,
    db: Session = Depends(get_db),
):
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    detections = db.query(Detection).filter(Detection.mission_id == mission_id).all()

    class_counts = {}
    for det in detections:
        cls = det.class_name
        class_counts[cls] = class_counts.get(cls, 0) + 1

    color_map = {
        "shipwreck": "#e74c3c",
        "pipeline": "#27ae60",
        "reef": "#f39c12",
        "fish_school": "#3498db",
        "unknown": "#95a5a6",
    }

    return {
        "mission_id": mission_id,
        "class_counts": class_counts,
        "colors": {cls: color_map.get(cls, "#3498db") for cls in class_counts},
        "total": len(detections),
    }
