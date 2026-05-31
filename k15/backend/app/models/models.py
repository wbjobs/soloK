from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, JSON
from sqlalchemy.sql import func
from app.database import Base


class Mission(Base):
    __tablename__ = "missions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    file_name = Column(String(255), nullable=False)
    file_format = Column(String(50), nullable=False)
    file_path = Column(String(500), nullable=False)
    status = Column(String(50), default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(Integer, ForeignKey("missions.id"), nullable=False, index=True)
    frame_index = Column(Integer, nullable=False)
    class_name = Column(String(100), nullable=False)
    confidence = Column(Float, nullable=False)
    bbox_x = Column(Float, nullable=False)
    bbox_y = Column(Float, nullable=False)
    bbox_w = Column(Float, nullable=False)
    bbox_h = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Track(Base):
    __tablename__ = "tracks"

    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(Integer, ForeignKey("missions.id"), nullable=False, index=True)
    track_id = Column(Integer, nullable=False)
    class_name = Column(String(100), nullable=False)
    frame_start = Column(Integer, nullable=False)
    frame_end = Column(Integer, nullable=False)
    trajectory = Column(JSON, nullable=False)
    length_estimate = Column(Float, nullable=True)
    width_estimate = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Measurement(Base):
    __tablename__ = "measurements"

    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(Integer, ForeignKey("missions.id"), nullable=False, index=True)
    detection_id = Column(Integer, ForeignKey("detections.id"), nullable=False, index=True)
    track_id = Column(Integer, nullable=True)
    actual_length = Column(Float, nullable=True)
    actual_width = Column(Float, nullable=True)
    depth = Column(Float, nullable=True)
    range_distance = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
