from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, LargeBinary
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
from geoalchemy2 import Geometry

Base = declarative_base()


class Field(Base):
    __tablename__ = "fields"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    crop_type = Column(String(100))
    area = Column(Float)
    location = Column(Geometry(geometry_type='POLYGON', srid=4326))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    hypercubes = relationship("Hypercube", back_populates="field")


class Hypercube(Base):
    __tablename__ = "hypercubes"

    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(String(255), unique=True, index=True)
    filename = Column(String(255))
    field_id = Column(Integer, ForeignKey("fields.id"))
    width = Column(Integer)
    height = Column(Integer)
    bands = Column(Integer)
    wavelength_min = Column(Float)
    wavelength_max = Column(Float)
    capture_date = Column(DateTime)
    data_path = Column(String(500))
    metadata_path = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)

    field = relationship("Field", back_populates="hypercubes")
    analysis_results = relationship("AnalysisResult", back_populates="hypercube")


class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id = Column(Integer, primary_key=True, index=True)
    hypercube_id = Column(Integer, ForeignKey("hypercubes.id"))
    result_type = Column(String(50))
    disease_distribution = Column(Text)
    severity_mean = Column(Float)
    vi_values = Column(Text)
    heatmap_path = Column(String(500))
    geojson_path = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)

    hypercube = relationship("Hypercube", back_populates="analysis_results")


class SpectralLibrary(Base):
    __tablename__ = "spectral_library"

    id = Column(Integer, primary_key=True, index=True)
    disease_name = Column(String(100), nullable=False)
    crop_type = Column(String(100))
    severity = Column(Integer)
    description = Column(Text)
    spectrum_data = Column(LargeBinary)
    wavelengths = Column(LargeBinary)
    source = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)


class Prescription(Base):
    __tablename__ = "prescriptions"

    id = Column(Integer, primary_key=True, index=True)
    field_id = Column(Integer, ForeignKey("fields.id"))
    hypercube_id = Column(Integer, ForeignKey("hypercubes.id"))
    name = Column(String(255))
    fertilizer_types = Column(String(255))
    base_rate = Column(Float)
    prescription_map_path = Column(String(500))
    total_fertilizer = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChangeDetection(Base):
    __tablename__ = "change_detections"

    id = Column(Integer, primary_key=True, index=True)
    field_id = Column(Integer, ForeignKey("fields.id"))
    hypercube1_id = Column(Integer, ForeignKey("hypercubes.id"))
    hypercube2_id = Column(Integer, ForeignKey("hypercubes.id"))
    index_name = Column(String(50))
    vi_change = Column(Float)
    change_magnitude = Column(Float)
    spread_direction = Column(String(50))
    spread_rate = Column(Float)
    result_path = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)
