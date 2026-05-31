import os
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from .config import settings

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

_UPLOAD_DIR_NAME = os.path.basename(settings.UPLOAD_DIR)
_MASK_DIR_NAME = os.path.basename(settings.MASK_DIR)
_GENERATED_DIR_NAME = os.path.basename(settings.GENERATED_DIR)
_REFERENCE_DIR_NAME = os.path.basename(settings.REFERENCE_DIR)

class InpaintingTask(Base):
    __tablename__ = "inpainting_tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    original_image_path = Column(String(500), nullable=False)
    mask_image_path = Column(String(500), nullable=False)
    generated_image_path = Column(String(500), nullable=True)
    reference_image_path = Column(String(500), nullable=True)
    prompt = Column(Text, nullable=False)
    status = Column(String(50), default="pending")
    progress = Column(Float, default=0.0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    
    def _filename_to_url(self, filename: str, dir_name: str) -> str:
        return f"/{dir_name}/{filename}"
    
    def _extract_filename(self, path: str) -> str:
        return os.path.basename(path)
    
    def to_dict(self):
        orig_filename = self._extract_filename(self.original_image_path)
        mask_filename = self._extract_filename(self.mask_image_path)
        
        result = {
            "id": self.id,
            "original_image_url": self._filename_to_url(orig_filename, _UPLOAD_DIR_NAME),
            "mask_image_url": self._filename_to_url(mask_filename, _MASK_DIR_NAME),
            "prompt": self.prompt,
            "status": self.status,
            "progress": self.progress,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }
        
        if self.reference_image_path:
            ref_filename = self._extract_filename(self.reference_image_path)
            result["reference_image_url"] = self._filename_to_url(ref_filename, _REFERENCE_DIR_NAME)
        else:
            result["reference_image_url"] = None
        
        if self.generated_image_path:
            gen_filename = self._extract_filename(self.generated_image_path)
            result["generated_image_url"] = self._filename_to_url(gen_filename, _GENERATED_DIR_NAME)
        else:
            result["generated_image_url"] = None
        
        return result

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)
