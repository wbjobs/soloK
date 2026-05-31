from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import tempfile
import numpy as np

from app.database import get_db
from app.models.models import Mission, Detection, Track, Measurement
from app.schemas.schemas import (
    DetectRequest,
    DetectResponse,
    DetectionItem,
    TrackItem,
)
from app.services.sonar_parser import sonar_parser
from app.services.detector import detector
from app.services.tracker import tracker
from app.services.measurement import measurement_service
from app.services.image_enhancer import image_enhancer
from app.services.terrain import terrain_stitcher
from app.utils.minio_client import minio_client
from app.core.logging import logger

router = APIRouter(prefix="/api/detect", tags=["Detection"])


@router.post("", response_model=DetectResponse)
async def detect_objects(
    request: DetectRequest,
    db: Session = Depends(get_db),
):
    mission = db.query(Mission).filter(Mission.id == request.mission_id).first()
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

        frame = sonar_generator.extract_frame(sonar_data, 0, frame_height=200)

        enhance_result = image_enhancer.enhance(frame, apply_equalization=True, apply_median_filter=True)
        enhanced_frame = enhance_result["image"]

        detection_results = detector.detect(enhanced_frame, conf_threshold=0.3)

        if detection_results:
            bboxes = [det.bbox for det in detection_results]
            class_names = [det.class_name for det in detection_results]
            confidences = [det.confidence for det in detection_results]

            tracker.reset()
            track_results = tracker.update(bboxes, class_names, confidences, enhanced_frame)
        else:
            track_results = []

        for det in detection_results:
            detection_record = Detection(
                mission_id=mission.id,
                frame_index=0,
                class_name=det.class_name,
                confidence=det.confidence,
                bbox_x=det.bbox[0],
                bbox_y=det.bbox[1],
                bbox_w=det.bbox[2],
                bbox_h=det.bbox[3],
            )
            db.add(detection_record)

            max_range = sonar_data.pings[0].range_meters if sonar_data.pings else 100.0
            measurement = measurement_service.calculate_target_size(
                det.bbox,
                enhanced_frame.shape,
                max_range,
                image=enhanced_frame,
            )

            measurement_record = Measurement(
                mission_id=mission.id,
                detection_id=detection_record.id,
                track_id=det.bbox[0] if track_results else None,
                actual_length=measurement.get("length_meters", 0),
                actual_width=measurement.get("width_meters", 0),
                range_distance=measurement.get("range_distance_meters", 0),
            )
            db.add(measurement_record)

        for trk in track_results:
            track_record = Track(
                mission_id=mission.id,
                track_id=trk["track_id"],
                class_name=trk["class_name"],
                frame_start=0,
                frame_end=trk.get("frame_index", 0),
                trajectory=trk.get("trajectory", []),
            )
            db.add(track_record)

        mission.status = "processed"
        db.commit()

        os.unlink(local_path)
        os.rmdir(temp_dir)

        return DetectResponse(
            success=True,
            detections=[
                {
                    "class_name": det.class_name,
                    "confidence": det.confidence,
                    "bbox": {
                        "x": det.bbox[0],
                        "y": det.bbox[1],
                        "width": det.bbox[2],
                        "height": det.bbox[3],
                    },
                }
                for det in detection_results
            ],
            tracks=[
                {
                    "track_id": trk["track_id"],
                    "class_name": trk["class_name"],
                    "bbox": {
                        "x": trk["bbox"][0],
                        "y": trk["bbox"][1],
                        "width": trk["bbox"][2],
                        "height": trk["bbox"][3],
                    },
                    "trajectory": trk.get("trajectory", []),
                }
                for trk in track_results
            ],
            message=f"Detected {len(detection_results)} objects",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Detection error: {e}")
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


@router.post("/frame/{mission_id}")
async def detect_frame(
    mission_id: int,
    frame_index: int = 0,
    conf_threshold: float = 0.3,
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

        if frame_index >= len(sonar_data.pings):
            frame_index = len(sonar_data.pings) - 1

        frame = sonar_generator.extract_frame(sonar_data, frame_index, frame_height=200)

        enhance_result = image_enhancer.enhance(frame, apply_equalization=True, apply_median_filter=True)
        enhanced_frame = enhance_result["image"]

        detection_results = detector.detect(enhanced_frame, conf_threshold=conf_threshold)

        if detection_results:
            bboxes = [det.bbox for det in detection_results]
            class_names = [det.class_name for det in detection_results]
            confidences = [det.confidence for det in detection_results]
            track_results = tracker.update(bboxes, class_names, confidences, enhanced_frame)
        else:
            track_results = []

        os.unlink(local_path)
        os.rmdir(temp_dir)

        return {
            "success": True,
            "frame_index": frame_index,
            "detections": [
                {
                    "class_name": det.class_name,
                    "confidence": det.confidence,
                    "bbox": {
                        "x": det.bbox[0],
                        "y": det.bbox[1],
                        "width": det.bbox[2],
                        "height": det.bbox[3],
                    },
                }
                for det in detection_results
            ],
            "tracks": track_results,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Frame detection error: {e}")
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


@router.post("/track/{mission_id}")
async def track_objects(
    mission_id: int,
    start_frame: int = 0,
    end_frame: Optional[int] = None,
    step: int = 5,
    conf_threshold: float = 0.3,
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

        total_frames = len(sonar_data.pings)
        if end_frame is None or end_frame > total_frames:
            end_frame = total_frames

        tracker.reset()
        all_detections = []
        all_tracks = []

        for frame_idx in range(start_frame, end_frame, step):
            if frame_idx >= total_frames:
                break

            frame = sonar_generator.extract_frame(sonar_data, frame_idx, frame_height=200)

            enhance_result = image_enhancer.enhance(frame, apply_equalization=True, apply_median_filter=True)
            enhanced_frame = enhance_result["image"]

            detection_results = detector.detect(enhanced_frame, conf_threshold=conf_threshold)

            if detection_results:
                bboxes = [det.bbox for det in detection_results]
                class_names = [det.class_name for det in detection_results]
                confidences = [det.confidence for det in detection_results]

                track_results = tracker.update(bboxes, class_names, confidences, enhanced_frame)
                all_tracks.extend(track_results)

            all_detections.append({
                "frame_index": frame_idx,
                "detections": [
                    {
                        "class_name": det.class_name,
                        "confidence": det.confidence,
                        "bbox": {
                            "x": det.bbox[0],
                            "y": det.bbox[1],
                            "width": det.bbox[2],
                            "height": det.bbox[3],
                        },
                    }
                    for det in detection_results
                ],
            })

        os.unlink(local_path)
        os.rmdir(temp_dir)

        return {
            "success": True,
            "total_frames_processed": len(all_detections),
            "frames": all_detections,
            "tracks": all_tracks,
            "track_statistics": tracker.get_track_statistics(),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Tracking error: {e}")
        raise HTTPException(status_code=500, detail=f"Tracking failed: {str(e)}")


@router.post("/measure/{mission_id}")
async def measure_detections(
    mission_id: int,
    db: Session = Depends(get_db),
):
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    try:
        detections = db.query(Detection).filter(Detection.mission_id == mission_id).all()
        if not detections:
            return {"success": True, "measurements": [], "message": "No detections to measure"}

        temp_dir = tempfile.mkdtemp()
        local_path = os.path.join(temp_dir, mission.file_name)

        minio_client.download_file(mission.file_path, local_path)

        sonar_data = sonar_parser.parse(local_path, f".{mission.file_format}")

        frame = sonar_generator.generate_waterfall_image(sonar_data, max_pings=500) if sonar_data else None

        max_range = sonar_data.pings[0].range_meters if sonar_data and sonar_data.pings else 100.0

        measurements = []
        for det in detections:
            bbox = (det.bbox_x, det.bbox_y, det.bbox_w, det.bbox_h)
            measurement = measurement_service.calculate_target_size(
                bbox,
                frame.shape if frame is not None else (500, 1000),
                max_range,
                image=frame,
            )
            measurement["detection_id"] = det.id
            measurement["class_name"] = det.class_name
            measurements.append(measurement)

        os.unlink(local_path)
        os.rmdir(temp_dir)

        return {
            "success": True,
            "measurements": measurements,
            "total_measurements": len(measurements),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Measurement error: {e}")
        raise HTTPException(status_code=500, detail=f"Measurement failed: {str(e)}")
