from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, Boolean, Text, ARRAY
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from typing import List, Optional, Dict
import json
import logging

from config import settings

logger = logging.getLogger(__name__)

Base = declarative_base()


class MeasurementRecord(Base):
    __tablename__ = "measurements"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, index=True)
    node_id = Column(Integer, index=True)
    voltage_magnitude = Column(Float)
    voltage_angle = Column(Float)
    active_power = Column(Float)
    reactive_power = Column(Float)
    batch_id = Column(String, index=True)


class DetectionRecord(Base):
    __tablename__ = "detection_results"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    batch_id = Column(String, index=True)
    is_attack = Column(Boolean)
    attack_confidence = Column(Float)
    detection_method = Column(String)
    chi_square_value = Column(Float)
    chi_square_threshold = Column(Float)
    reconstruction_error = Column(Float)
    reconstruction_threshold = Column(Float)
    spatial_anomaly_score = Column(Float)
    suspicious_nodes = Column(Text)
    shap_values = Column(Text, nullable=True)


class AttackSimulationRecord(Base):
    __tablename__ = "attack_simulations"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    attack_type = Column(String)
    target_nodes = Column(ARRAY(Integer))
    attack_magnitude = Column(Float)
    attack_duration = Column(Integer)
    attack_pattern = Column(Text)


class ModelUpdateRecord(Base):
    __tablename__ = "model_updates"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    model_type = Column(String)
    update_type = Column(String)
    num_samples = Column(Integer)
    new_threshold = Column(Float)
    previous_threshold = Column(Float)
    metrics = Column(Text)


class DatabaseManager:
    def __init__(self, database_url: str = settings.database_url):
        self.database_url = database_url
        self.engine = create_engine(database_url)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.Base = Base
        
    def init_database(self):
        try:
            self.Base.metadata.create_all(bind=self.engine)
            logger.info("Database tables created successfully")
        except Exception as e:
            logger.error(f"Error creating database tables: {e}")
            raise
    
    def get_session(self):
        return self.SessionLocal()
    
    def save_measurements(self, measurements: List, batch_id: str):
        session = self.get_session()
        try:
            records = []
            for m in measurements:
                record = MeasurementRecord(
                    timestamp=m.timestamp,
                    node_id=m.node_id,
                    voltage_magnitude=m.voltage_magnitude,
                    voltage_angle=m.voltage_angle,
                    active_power=m.active_power,
                    reactive_power=m.reactive_power,
                    batch_id=batch_id
                )
                records.append(record)
            session.add_all(records)
            session.commit()
            logger.info(f"Saved {len(records)} measurements for batch {batch_id}")
        except Exception as e:
            session.rollback()
            logger.error(f"Error saving measurements: {e}")
            raise
        finally:
            session.close()
    
    def save_detection_result(self, batch_id: str, result, 
                              spatial_score: Optional[float] = None,
                              shap_values: Optional[Dict] = None):
        session = self.get_session()
        try:
            suspicious_nodes_json = json.dumps([
                n.dict() for n in result.suspicious_nodes
            ]) if result.suspicious_nodes else "[]"
            
            shap_values_json = json.dumps(shap_values) if shap_values else None
            
            record = DetectionRecord(
                batch_id=batch_id,
                timestamp=result.timestamp,
                is_attack=result.is_attack,
                attack_confidence=result.attack_confidence,
                detection_method=result.detection_method,
                chi_square_value=result.chi_square_value,
                chi_square_threshold=result.chi_square_threshold,
                reconstruction_error=result.reconstruction_error,
                reconstruction_threshold=result.reconstruction_threshold,
                spatial_anomaly_score=spatial_score,
                suspicious_nodes=suspicious_nodes_json,
                shap_values=shap_values_json
            )
            session.add(record)
            session.commit()
            logger.info(f"Saved detection result for batch {batch_id}")
        except Exception as e:
            session.rollback()
            logger.error(f"Error saving detection result: {e}")
            raise
        finally:
            session.close()
    
    def save_attack_simulation(self, attack_type: str, target_nodes: List[int],
                               attack_magnitude: float, attack_duration: int,
                               attack_pattern: Dict):
        session = self.get_session()
        try:
            attack_pattern_json = json.dumps(attack_pattern)
            record = AttackSimulationRecord(
                attack_type=attack_type,
                target_nodes=target_nodes,
                attack_magnitude=attack_magnitude,
                attack_duration=attack_duration,
                attack_pattern=attack_pattern_json
            )
            session.add(record)
            session.commit()
            logger.info(f"Saved attack simulation: {attack_type}")
        except Exception as e:
            session.rollback()
            logger.error(f"Error saving attack simulation: {e}")
            raise
        finally:
            session.close()
    
    def save_model_update(self, model_type: str, update_type: str,
                         num_samples: int, new_threshold: float,
                         previous_threshold: float, metrics: Dict):
        session = self.get_session()
        try:
            metrics_json = json.dumps(metrics)
            record = ModelUpdateRecord(
                model_type=model_type,
                update_type=update_type,
                num_samples=num_samples,
                new_threshold=new_threshold,
                previous_threshold=previous_threshold,
                metrics=metrics_json
            )
            session.add(record)
            session.commit()
            logger.info(f"Saved model update: {model_type} - {update_type}")
        except Exception as e:
            session.rollback()
            logger.error(f"Error saving model update: {e}")
            raise
        finally:
            session.close()
    
    def get_recent_measurements(self, limit: int = 1000) -> List:
        session = self.get_session()
        try:
            records = session.query(MeasurementRecord)\
                .order_by(MeasurementRecord.timestamp.desc())\
                .limit(limit)\
                .all()
            return records
        finally:
            session.close()
    
    def get_measurements_by_batch(self, batch_id: str) -> List:
        session = self.get_session()
        try:
            records = session.query(MeasurementRecord)\
                .filter(MeasurementRecord.batch_id == batch_id)\
                .order_by(MeasurementRecord.node_id)\
                .all()
            return records
        finally:
            session.close()
    
    def get_detection_history(self, limit: int = 100) -> List:
        session = self.get_session()
        try:
            records = session.query(DetectionRecord)\
                .order_by(DetectionRecord.timestamp.desc())\
                .limit(limit)\
                .all()
            return records
        finally:
            session.close()
