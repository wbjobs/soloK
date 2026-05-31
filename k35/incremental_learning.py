import numpy as np
from typing import List, Dict, Optional, Callable
from dataclasses import dataclass
import logging
from collections import deque
import time

from schemas import MeasurementData
from database import DatabaseManager

logger = logging.getLogger(__name__)


@dataclass
class ModelUpdateResult:
    model_type: str
    success: bool
    previous_threshold: float
    new_threshold: float
    num_samples_used: int
    metrics: Dict
    update_timestamp: float


class IncrementalLearningManager:
    def __init__(self, lstm_detector=None, mpnn_detector=None, 
                 chi_square_detector=None, db_manager: DatabaseManager = None,
                 max_history: int = 10000,
                 update_interval_samples: int = 100,
                 min_samples_for_update: int = 20):
        
        self.lstm_detector = lstm_detector
        self.mpnn_detector = mpnn_detector
        self.chi_square_detector = chi_square_detector
        self.db_manager = db_manager
        
        self.max_history = max_history
        self.update_interval_samples = update_interval_samples
        self.min_samples_for_update = min_samples_for_update
        
        self.measurement_history = deque(maxlen=max_history)
        self.sample_count = 0
        self.last_update_time = {}
        
        self.update_callbacks: List[Callable] = []
    
    def add_new_samples(self, measurements: List[MeasurementData]):
        self.measurement_history.append(measurements)
        self.sample_count += 1
        
        should_update = (self.sample_count % self.update_interval_samples == 0)
        
        return should_update
    
    def check_and_update(self, topology: Optional[Dict] = None,
                         force_update: bool = False) -> Dict[str, ModelUpdateResult]:
        
        if not force_update and len(self.measurement_history) < self.min_samples_for_update:
            logger.info("Not enough samples for incremental update")
            return {}
        
        results = {}
        
        if self.lstm_detector is not None:
            results['lstm'] = self._update_lstm_model()
        
        if self.mpnn_detector is not None:
            results['mpnn'] = self._update_mpnn_model(topology)
        
        if self.chi_square_detector is not None:
            results['chi_square'] = self._update_chi_square_detector()
        
        self._notify_callbacks(results)
        
        return results
    
    def _update_lstm_model(self) -> ModelUpdateResult:
        model_type = "lstm"
        start_time = time.time()
        
        try:
            previous_threshold = getattr(self.lstm_detector, 'threshold', 0.0)
            
            recent_samples = list(self.measurement_history)[-100:]
            
            if not self.lstm_detector.is_trained:
                logger.info("LSTM model not trained, performing initial training")
                metrics = self.lstm_detector.fit(recent_samples, epochs=30)
            else:
                logger.info("Performing incremental LSTM update")
                metrics = self.lstm_detector.incremental_update(recent_samples, epochs=5)
            
            new_threshold = metrics['threshold'] if metrics else previous_threshold
            
            result = ModelUpdateResult(
                model_type=model_type,
                success=True,
                previous_threshold=float(previous_threshold),
                new_threshold=float(new_threshold),
                num_samples_used=len(recent_samples),
                metrics=metrics if metrics else {},
                update_timestamp=time.time()
            )
            
            if self.db_manager and metrics:
                self.db_manager.save_model_update(
                    model_type=model_type,
                    update_type="incremental",
                    num_samples=len(recent_samples),
                    new_threshold=float(new_threshold),
                    previous_threshold=float(previous_threshold),
                    metrics=metrics
                )
            
            logger.info(f"LSTM model updated successfully. Threshold: {previous_threshold:.6f} -> {new_threshold:.6f}")
            
        except Exception as e:
            logger.error(f"Error updating LSTM model: {e}")
            result = ModelUpdateResult(
                model_type=model_type,
                success=False,
                previous_threshold=getattr(self.lstm_detector, 'threshold', 0.0),
                new_threshold=getattr(self.lstm_detector, 'threshold', 0.0),
                num_samples_used=0,
                metrics={'error': str(e)},
                update_timestamp=time.time()
            )
        
        return result
    
    def _update_mpnn_model(self, topology: Optional[Dict] = None) -> ModelUpdateResult:
        model_type = "mpnn"
        start_time = time.time()
        
        try:
            previous_threshold = getattr(self.mpnn_detector, 'threshold', 0.0)
            
            recent_samples = list(self.measurement_history)[-50:]
            
            if not self.mpnn_detector.is_trained:
                logger.info("MPNN model not trained, performing initial training")
                metrics = self.mpnn_detector.fit(recent_samples, topology=topology, epochs=30)
            else:
                logger.info("Performing incremental MPNN update")
                metrics = self.mpnn_detector.incremental_update(recent_samples, topology=topology, epochs=5)
            
            new_threshold = metrics['threshold'] if metrics else previous_threshold
            
            result = ModelUpdateResult(
                model_type=model_type,
                success=True,
                previous_threshold=float(previous_threshold),
                new_threshold=float(new_threshold),
                num_samples_used=len(recent_samples),
                metrics=metrics if metrics else {},
                update_timestamp=time.time()
            )
            
            if self.db_manager and metrics:
                self.db_manager.save_model_update(
                    model_type=model_type,
                    update_type="incremental",
                    num_samples=len(recent_samples),
                    new_threshold=float(new_threshold),
                    previous_threshold=float(previous_threshold),
                    metrics=metrics
                )
            
            logger.info(f"MPNN model updated successfully. Threshold: {previous_threshold:.6f} -> {new_threshold:.6f}")
            
        except Exception as e:
            logger.error(f"Error updating MPNN model: {e}")
            result = ModelUpdateResult(
                model_type=model_type,
                success=False,
                previous_threshold=getattr(self.mpnn_detector, 'threshold', 0.0),
                new_threshold=getattr(self.mpnn_detector, 'threshold', 0.0),
                num_samples_used=0,
                metrics={'error': str(e)},
                update_timestamp=time.time()
            )
        
        return result
    
    def _update_chi_square_detector(self) -> ModelUpdateResult:
        model_type = "chi_square"
        start_time = time.time()
        
        try:
            previous_threshold = 0.0
            recent_samples = list(self.measurement_history)[-100:]
            
            if self.chi_square_detector and hasattr(self.chi_square_detector, 'baseline_std'):
                previous_threshold = self.chi_square_detector.baseline_std or 0.0
            
            metrics = {
                'baseline_mean': 0.0,
                'baseline_std': 0.0,
                'samples_used': len(recent_samples)
            }
            
            if self.chi_square_detector:
                all_residuals = []
                for sample in recent_samples:
                    try:
                        features = np.array([[m.voltage_magnitude, m.voltage_angle, 
                                             m.active_power, m.reactive_power] 
                                            for m in sample])
                        all_residuals.append(features.flatten())
                    except:
                        pass
                
                if all_residuals:
                    all_residuals = np.concatenate(all_residuals)
                    metrics['baseline_mean'] = float(np.mean(all_residuals))
                    metrics['baseline_std'] = float(np.std(all_residuals))
                    
                    if hasattr(self.chi_square_detector, 'update_baseline'):
                        self.chi_square_detector.update_baseline(all_residuals)
            
            new_threshold = metrics['baseline_std']
            
            result = ModelUpdateResult(
                model_type=model_type,
                success=True,
                previous_threshold=float(previous_threshold),
                new_threshold=float(new_threshold),
                num_samples_used=len(recent_samples),
                metrics=metrics,
                update_timestamp=time.time()
            )
            
            if self.db_manager:
                self.db_manager.save_model_update(
                    model_type=model_type,
                    update_type="baseline_update",
                    num_samples=len(recent_samples),
                    new_threshold=float(new_threshold),
                    previous_threshold=float(previous_threshold),
                    metrics=metrics
                )
            
            logger.info(f"Chi-square detector baseline updated successfully")
            
        except Exception as e:
            logger.error(f"Error updating chi-square detector: {e}")
            result = ModelUpdateResult(
                model_type=model_type,
                success=False,
                previous_threshold=0.0,
                new_threshold=0.0,
                num_samples_used=0,
                metrics={'error': str(e)},
                update_timestamp=time.time()
            )
        
        return result
    
    def handle_topology_change(self, new_topology: Dict) -> ModelUpdateResult:
        logger.info("Detected topology change, triggering model adaptation")
        
        results = {}
        
        if self.mpnn_detector is not None:
            self.mpnn_detector.default_edge_index = self.mpnn_detector._build_topology_from_config(new_topology)
            results['mpnn_topology'] = self._update_mpnn_model(new_topology)
        
        return results
    
    def register_update_callback(self, callback: Callable):
        self.update_callbacks.append(callback)
    
    def _notify_callbacks(self, results: Dict[str, ModelUpdateResult]):
        for callback in self.update_callbacks:
            try:
                callback(results)
            except Exception as e:
                logger.error(f"Error in update callback: {e}")
    
    def get_model_status(self) -> Dict:
        status = {
            'measurement_history_size': len(self.measurement_history),
            'total_samples_processed': self.sample_count,
            'models': {}
        }
        
        if self.lstm_detector:
            status['models']['lstm'] = {
                'is_trained': self.lstm_detector.is_trained,
                'threshold': float(self.lstm_detector.threshold) if self.lstm_detector.threshold else None,
                'baseline_size': len(self.lstm_detector.baseline_errors)
            }
        
        if self.mpnn_detector:
            status['models']['mpnn'] = {
                'is_trained': self.mpnn_detector.is_trained,
                'threshold': float(self.mpnn_detector.threshold) if self.mpnn_detector.threshold else None,
                'baseline_size': len(self.mpnn_detector.baseline_errors)
            }
        
        return status
