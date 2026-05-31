from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import tempfile
import numpy as np
import cv2
import base64

from app.database import get_db
from app.models.models import Mission, Detection, Track
from app.services.sonar_parser import sonar_parser
from app.services.multibeam_parser import multibeam_parser
from app.services.detector import detector
from app.services.tracker import tracker
from app.services.terrain_projector import terrain_projector
from app.services.feature_extractor import feature_extractor
from app.services.feature_database import feature_database
from app.services.image_enhancer import image_enhancer
from app.utils.minio_client import minio_client
from app.core.logging import logger

router = APIRouter(prefix="/api/terrain", tags=["Terrain"])


@router.post("/project/{mission_id}")
async def project_detections_to_3d(
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
            raise HTTPException(status_code=500, detail="Failed to download file")

        multibeam_data = multibeam_parser.parse(local_path, f".{mission.file_format}")
        if not multibeam_data:
            os.unlink(local_path)
            os.rmdir(temp_dir)
            raise HTTPException(status_code=400, detail="Failed to parse multibeam data")

        sidescan_data = sonar_parser.parse(local_path, f".{mission.file_format}")

        detections = db.query(Detection).filter(Detection.mission_id == mission_id).all()
        det_dicts = [
            {
                "bbox": (det.bbox_x, det.bbox_y, det.bbox_w, det.bbox_h),
                "class_name": det.class_name,
                "confidence": det.confidence,
            }
            for det in detections
        ]

        enhance_result = image_enhancer.enhance(
            sonar_generator.generate_waterfall_image(sidescan_data, 500) if sidescan_data else np.zeros((500, 1000), dtype=np.uint8),
            apply_equalization=True,
            apply_median_filter=True,
        )
        enhanced_image = enhance_result["image"]

        projection_results = terrain_projector.project_detections_to_3d(
            det_dicts,
            sidescan_data,
            multibeam_data,
            (500, 1000),
        )

        scene_data = terrain_projector.generate_3d_scene_data(
            multibeam_data,
            projection_results,
        )

        os.unlink(local_path)
        os.rmdir(temp_dir)

        return {
            "success": True,
            "mission_id": mission_id,
            "projection_results": [
                {
                    "target_id": r.target_id,
                    "class_name": r.class_name,
                    "confidence": r.confidence,
                    "center_3d": list(r.projected_3d_center),
                    "corners_3d": [list(c) for c in r.projected_3d_corners],
                    "depth": r.depth_at_center,
                    "slope": r.terrain_slope,
                    "surface_area": r.surface_area,
                    "height_above_seabed": r.height_above_seabed,
                }
                for r in projection_results
            ],
            "scene_data": scene_data,
            "multibeam_info": {
                "num_pings": len(multibeam_data.pings),
                "num_beams": multibeam_data.num_beams,
                "max_depth": multibeam_data.max_depth,
                "min_depth": multibeam_data.min_depth,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"3D projection error: {e}")
        raise HTTPException(status_code=500, detail=f"3D projection failed: {str(e)}")


@router.post("/features/extract/{mission_id}")
async def extract_acoustic_features(
    mission_id: int,
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
            raise HTTPException(status_code=400, detail="Failed to parse sonar data")

        waterfall = sonar_generator.generate_waterfall_image(sonar_data, max_pings=500)
        enhance_result = image_enhancer.enhance(waterfall)
        enhanced_image = enhance_result["image"]

        detections = db.query(Detection).filter(Detection.mission_id == mission_id).all()

        extracted_features = []
        for det in detections:
            bbox = (det.bbox_x, det.bbox_y, det.bbox_w, det.bbox_h)
            features = feature_extractor.extract_features(
                enhanced_image,
                bbox,
                det.class_name,
                target_id=f"mission_{mission_id}_det_{det.id}",
            )

            if features:
                feature_dict = features.to_dict()

                feature_database.add_record(
                    target_id=f"mission_{mission_id}_det_{det.id}",
                    mission_id=mission_id,
                    class_name=det.class_name,
                    feature_vector=features.to_feature_vector().tolist(),
                    bbox={"x": det.bbox_x, "y": det.bbox_y, "width": det.bbox_w, "height": det.bbox_h},
                    confidence=det.confidence,
                )

                extracted_features.append(feature_dict)

        os.unlink(local_path)
        os.rmdir(temp_dir)

        return {
            "success": True,
            "mission_id": mission_id,
            "extracted_count": len(extracted_features),
            "features": extracted_features,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Feature extraction error: {e}")
        raise HTTPException(status_code=500, detail=f"Feature extraction failed: {str(e)}")


@router.post("/search/similar")
async def search_similar_targets(
    image_data: str = Form(...),
    bbox_x: int = Form(...),
    bbox_y: int = Form(...),
    bbox_w: int = Form(...),
    bbox_h: int = Form(...),
    class_name: str = Form(...),
    top_k: int = Form(10),
    threshold: float = Form(0.5),
):
    try:
        image_bytes = base64.b64decode(image_data.split(",")[1] if "," in image_data else image_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)

        if image is None:
            raise HTTPException(status_code=400, detail="Invalid image data")

        features = feature_extractor.extract_features(
            image,
            (bbox_x, bbox_y, bbox_w, bbox_h),
            class_name,
        )

        if features is None:
            raise HTTPException(status_code=400, detail="Failed to extract features from query")

        query_vector = features.to_feature_vector().tolist()

        results = feature_database.search_similar(
            query_vector,
            class_name,
            top_k=top_k,
            threshold=threshold,
        )

        return {
            "success": True,
            "query_class": class_name,
            "num_results": len(results),
            "results": [
                {
                    "record": r["record"],
                    "similarity": r["similarity"],
                }
                for r in results
            ],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Similarity search error: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.get("/database/stats")
async def get_feature_database_stats():
    stats = feature_database.get_statistics()
    return {
        "success": True,
        "statistics": stats,
    }


@router.post("/multibeam/parse/{mission_id}")
async def parse_multibeam_data(
    mission_id: int,
    db: Session = Depends(get_db),
):
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    try:
        temp_dir = tempfile.mkdtemp()
        local_path = os.path.join(temp_dir, mission.file_name)

        minio_client.download_file(mission.file_path, local_path)

        multibeam_data = multibeam_parser.parse(local_path, f".{mission.file_format}")

        if not multibeam_data:
            os.unlink(local_path)
            os.rmdir(temp_dir)
            raise HTTPException(status_code=400, detail="Failed to parse multibeam data")

        point_cloud = multibeam_parser.generate_3d_point_cloud(multibeam_data)
        heightmap = multibeam_parser.generate_heightmap(multibeam_data)

        os.unlink(local_path)
        os.rmdir(temp_dir)

        return {
            "success": True,
            "mission_id": mission_id,
            "multibeam_info": {
                "num_pings": len(multibeam_data.pings),
                "num_beams": multibeam_data.num_beams,
                "swath_width": multibeam_data.swath_width,
                "max_depth": multibeam_data.max_depth,
                "min_depth": multibeam_data.min_depth,
            },
            "point_cloud_info": {
                "num_points": point_cloud.get("num_points", 0),
                "bounds": point_cloud.get("bounds", {}),
            },
            "heightmap_shape": list(heightmap.shape),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Multibeam parsing error: {e}")
        raise HTTPException(status_code=500, detail=f"Multibeam parsing failed: {str(e)}")
