from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from config import settings

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class KilnSample(Base):
    __tablename__ = "kiln_samples"

    id = Column(Integer, primary_key=True, index=True)
    kiln_id = Column(String, index=True)
    kiln_name = Column(String)
    sample_id = Column(String, unique=True, index=True)
    Na2O = Column(Float)
    MgO = Column(Float)
    Al2O3 = Column(Float)
    SiO2 = Column(Float)
    P2O5 = Column(Float)
    K2O = Column(Float)
    CaO = Column(Float)
    TiO2 = Column(Float)
    MnO = Column(Float)
    Fe2O3 = Column(Float)
    ZrO2 = Column(Float)
    SrO = Column(Float)
    La = Column(Float)
    Ce = Column(Float)
    Nd = Column(Float)
    Sm = Column(Float)
    Eu = Column(Float)
    Gd = Column(Float)
    Tb = Column(Float)
    Yb = Column(Float)
    Lu = Column(Float)
    Y = Column(Float)
    year = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)


class IdentificationRecord(Base):
    __tablename__ = "identification_records"

    id = Column(Integer, primary_key=True, index=True)
    sample_id = Column(String, index=True)
    predicted_kiln_id = Column(String)
    predicted_kiln_name = Column(String)
    confidence = Column(Float)
    predicted_year = Column(Integer)
    year_min = Column(Integer)
    year_max = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
