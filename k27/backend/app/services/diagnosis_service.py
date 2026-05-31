import numpy as np
from typing import Dict, List, Optional
from datetime import datetime

from ..signal_processing.envelope_demodulation import EnvelopeDemodulation
from ..signal_processing.current_analysis import CurrentAnalysis
from ..signal_processing.order_tracking import OrderTracking
from ..ml.resnet1d import ResNet1D, FaultSeverityEstimator, MultiModalResNet1D
from ..ml.lstm_predictor import LSTMPredictor, TrendAnalyzer
from ..ml.cross_modal_attention import MultiModalDiagnosticModel, CrossModalFeatureExtractor
from ..ml.digital_twin import DigitalTwinModel, MotorOperatingPoint, FMUModelAdapter
from .adaptive_threshold import AdaptiveThreshold, FaultFrequencyMarker


class DiagnosisService:
    def __init__(self, use_digital_twin: bool = True, use_cross_modal: bool = True):
        self.envelope_demod = EnvelopeDemodulation(sample_rate=20000)
        self.current_analyzer = CurrentAnalysis(sample_rate=10000)
        self.order_tracker = OrderTracking(sample_rate=20000)
        self.resnet = ResNet1D(input_shape=(1024, 1), num_classes=10)
        self.multimodal_resnet = MultiModalResNet1D(input_shape=(1024, 1), num_classes=10,
                                                    use_cross_modal=use_cross_modal)
        self.severity_estimator = FaultSeverityEstimator()
        self.lstm = LSTMPredictor(input_seq_len=30, output_seq_len=7, n_features=10)
        self.trend_analyzer = TrendAnalyzer()
        self.adaptive_threshold = AdaptiveThreshold(window_size=1000)
        self.fault_marker = FaultFrequencyMarker()
        
        self.cross_modal_model = MultiModalDiagnosticModel(num_classes=10)
        self.feature_extractor = CrossModalFeatureExtractor()
        
        self.digital_twin = DigitalTwinModel() if use_digital_twin else None
        self.fmu_adapter = FMUModelAdapter()
        
        self._last_operating_point = MotorOperatingPoint()
        self._healthy_signature_cache = {}

    def process_vibration_signal(self, x: np.ndarray, y: np.ndarray, 
                                   z: np.ndarray, rotational_freq: float) -> Dict:
        combined = np.sqrt(x ** 2 + y ** 2 + z ** 2)
        
        demod_result = self.envelope_demod.demodulate(combined)
        
        bearing_features = self.envelope_demod.extract_bearing_features(
            combined, rotational_freq)
        
        return {
            "demodulation": demod_result,
            "bearing_features": bearing_features,
            "combined_signal": combined
        }

    def process_current_signal(self, phase_a: np.ndarray, phase_b: np.ndarray,
                                phase_c: np.ndarray, supply_freq: float = 50,
                                slip: float = 0.02) -> Dict:
        rotor_result = self.current_analyzer.detect_broken_rotor_bars(
            phase_a, supply_freq, slip)
        
        stator_features = self.current_analyzer.extract_stator_features(
            phase_a, phase_b, phase_c)
        
        rotational_freq = supply_freq * (1 - slip)
        ecc_result = self.current_analyzer.detect_eccentricity(
            phase_a, rotational_freq, supply_freq)
        
        return {
            "rotor_analysis": rotor_result,
            "stator_features": stator_features,
            "eccentricity_analysis": ecc_result
        }

    def diagnose_fault(self, vibration_signal: np.ndarray, 
                         current_signal: np.ndarray = None) -> Dict:
        if len(vibration_signal) > 0:
            resnet_result = self.resnet.predict(vibration_signal)
        else:
            resnet_result = {
                "predicted_class": 0,
                "class_name": "未知",
                "confidence": 0.0,
                "probabilities": [0.0] * 10
            }
        
        features = self._extract_all_features(vibration_signal, current_signal)
        
        severity = self.severity_estimator.estimate_severity(
            resnet_result["class_name"], features)
        
        recommendation = self.severity_estimator.get_maintenance_recommendation(
            resnet_result["class_name"], severity)
        
        result = {
            **resnet_result,
            "severity": severity,
            "recommendation": recommendation,
            "features": features,
            "timestamp": datetime.now().isoformat()
        }
        
        return result

    def _extract_all_features(self, vibration_signal: np.ndarray,
                               current_signal: np.ndarray = None) -> Dict:
        features = {}
        
        if len(vibration_signal) > 0:
            features["RMS"] = np.sqrt(np.mean(vibration_signal ** 2))
            features["Peak_to_Peak"] = np.max(vibration_signal) - np.min(vibration_signal)
            features["Kurtosis"] = np.mean((vibration_signal - np.mean(vibration_signal)) ** 4) / \
                                  (np.std(vibration_signal) ** 4) if np.std(vibration_signal) > 0 else 3.0
            features["Crest_Factor"] = np.max(np.abs(vibration_signal)) / \
                                       np.sqrt(np.mean(vibration_signal ** 2)) if np.sqrt(np.mean(vibration_signal ** 2)) > 0 else 3.0
            features["Skewness"] = np.mean((vibration_signal - np.mean(vibration_signal)) ** 3) / \
                                  (np.std(vibration_signal) ** 3) if np.std(vibration_signal) > 0 else 0.0
        
        if current_signal is not None and len(current_signal) > 0:
            features["Current_RMS"] = np.sqrt(np.mean(current_signal ** 2))
            features["Current_Peak"] = np.max(np.abs(current_signal))
        
        return features

    def update_thresholds(self, features: Dict[str, float]):
        for key, value in features.items():
            if isinstance(value, (int, float)):
                self.adaptive_threshold.update_data(key, float(value))

    def check_alerts(self, features: Dict[str, float]) -> List[Dict]:
        alerts = []
        for key, value in features.items():
            if isinstance(value, (int, float)):
                result = self.adaptive_threshold.check_threshold(key, float(value))
                if result["status"] != "normal":
                    alerts.append({
                        "feature": key,
                        "value": float(value),
                        "status": result["status"],
                        "deviation": result["deviation"],
                        "thresholds": result["thresholds"],
                        "timestamp": datetime.now().isoformat()
                    })
        return alerts

    def mark_fault_frequencies(self, freqs: np.ndarray, spectrum: np.ndarray,
                                  rotational_freq: float = 25.0,
                                  supply_freq: float = 50.0) -> List[Dict]:
        self.fault_marker.rotational_freq = rotational_freq
        self.fault_marker.supply_freq = supply_freq
        return self.fault_marker.mark_frequencies(freqs, spectrum)

    def predict_trend(self, historical_data: np.ndarray,
                      feature_names: List[str]) -> Dict:
        return self.lstm.predict_future(historical_data, feature_names)

    def analyze_trend(self, values: List[float], feature_name: str) -> Dict:
        trend = self.trend_analyzer.calculate_trend(values)
        alert = self.trend_analyzer.generate_alert(feature_name, trend, {
            "warning_increase": 20,
            "warning_decrease": 30
        })
        return {
            "trend": trend,
            "alert": alert
        }
    
    def update_operating_point(self, speed_rpm: float, load_torque: float = 50,
                               voltage_a: float = 220, voltage_b: float = 220,
                               voltage_c: float = 220, bearing_temp: float = 45,
                               winding_temp: float = 75):
        self._last_operating_point = MotorOperatingPoint(
            voltage_phase_a=voltage_a,
            voltage_phase_b=voltage_b,
            voltage_phase_c=voltage_c,
            load_torque=load_torque,
            speed_rpm=speed_rpm,
            temperature_bearing=bearing_temp,
            temperature_winding=winding_temp
        )
    
    def compare_with_digital_twin(self, vibration_data: Dict, current_data: Dict,
                                  temperature_data: Dict = None) -> Dict:
        if self.digital_twin is None:
            return {
                "status": "disabled",
                "message": "Digital twin module not enabled"
            }
        
        measured_signals = {
            'vibration': {
                'x': np.array(vibration_data.get('x', [])),
                'y': np.array(vibration_data.get('y', [])),
                'z': np.array(vibration_data.get('z', []))
            },
            'currents': {
                'phase_a': np.array(current_data.get('phase_a', [])),
                'phase_b': np.array(current_data.get('phase_b', [])),
                'phase_c': np.array(current_data.get('phase_c', []))
            }
        }
        
        try:
            comparison = self.digital_twin.compare_signals(
                measured_signals, self._last_operating_point)
            
            residual_features = comparison.get('residual_features', {})
            fault_detection = comparison.get('fault_detection', {})
            
            return {
                "status": "success",
                "healthy_signature": {
                    "current_rms": comparison.get('reference_features', {}).get('current_rms', 0),
                    "vibration_rms": comparison.get('reference_features', {}).get('vibration_rms', 0),
                    "bearing_temp": comparison.get('reference_features', {}).get('bearing_temp', 0),
                    "winding_temp": comparison.get('reference_features', {}).get('winding_temp', 0)
                },
                "residual_analysis": {
                    "vibration_x_rms": residual_features.get('vibration_x_rms', 0),
                    "vibration_y_rms": residual_features.get('vibration_y_rms', 0),
                    "vibration_z_rms": residual_features.get('vibration_z_rms', 0),
                    "current_a_rms": residual_features.get('current_phase_a_rms', 0),
                    "vibration_kurtosis": residual_features.get('vibration_x_kurtosis', 0)
                },
                "fault_detection": fault_detection,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Digital twin comparison failed: {str(e)}"
            }
    
    def diagnose_with_cross_modal(self, vibration_data: Dict, current_data: Dict,
                                   temperature_data: Dict) -> Dict:
        try:
            result = self.cross_modal_model.predict(
                vibration_data, current_data, temperature_data)
            
            return {
                "status": "success",
                "diagnosis": {
                    "predicted_class": result.get('predicted_class', 0),
                    "class_name": result.get('class_name', '未知'),
                    "confidence": result.get('confidence', 0)
                },
                "modal_weights": result.get('modal_weights', {}),
                "extracted_features": result.get('features', {}),
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Cross-modal diagnosis failed: {str(e)}"
            }
    
    def comprehensive_diagnosis(self, vibration_data: Dict, current_data: Dict,
                                temperature_data: Dict, rotational_freq: float = 25.0,
                                supply_freq: float = 50.0, slip: float = 0.02) -> Dict:
        vib_x = np.array(vibration_data.get('x', []))
        vib_y = np.array(vibration_data.get('y', []))
        vib_z = np.array(vibration_data.get('z', []))
        combined_vib = np.sqrt(vib_x ** 2 + vib_y ** 2 + vib_z ** 2) if len(vib_x) > 0 else np.array([])
        
        cur_a = np.array(current_data.get('phase_a', []))
        cur_b = np.array(current_data.get('phase_b', []))
        cur_c = np.array(current_data.get('phase_c', []))
        
        vib_result = self.process_vibration_signal(vib_x, vib_y, vib_z, rotational_freq)
        cur_result = self.process_current_signal(cur_a, cur_b, cur_c, supply_freq, slip)
        
        resnet_result = self.diagnose_fault(combined_vib, cur_a)
        
        cross_modal_result = self.diagnose_with_cross_modal(
            vibration_data, current_data, temperature_data)
        
        digital_twin_result = self.compare_with_digital_twin(
            vibration_data, current_data, temperature_data)
        
        current_features = cur_result.get('stator_features', {})
        temperature_features = {
            'Bearing_Temp': temperature_data.get('bearing_temp', 45),
            'Winding_Temp': temperature_data.get('winding_temp', 75),
            'Temp_Gradient': temperature_data.get('winding_temp', 75) - temperature_data.get('bearing_temp', 45),
            'Temp_Rate_Change': 0.0
        }
        
        multimodal_result = self.multimodal_resnet.predict(
            combined_vib, current_features, temperature_features
        )
        
        all_results = [resnet_result, cross_modal_result.get('diagnosis', {}), multimodal_result]
        valid_results = [r for r in all_results if r.get('confidence', 0) > 0.3]
        
        if valid_results:
            best_result = max(valid_results, key=lambda x: x.get('confidence', 0))
            final_class = best_result.get('predicted_class', 0)
            final_confidence = best_result.get('confidence', 0)
            final_class_name = best_result.get('class_name', '未知')
        else:
            final_class = resnet_result.get('predicted_class', 0)
            final_confidence = resnet_result.get('confidence', 0)
            final_class_name = resnet_result.get('class_name', '未知')
        
        features = self._extract_all_features(combined_vib, cur_a)
        severity = self.severity_estimator.estimate_severity(final_class_name, features)
        recommendation = self.severity_estimator.get_maintenance_recommendation(final_class_name, severity)
        
        return {
            "diagnosis": {
                "predicted_class": final_class,
                "class_name": final_class_name,
                "confidence": final_confidence,
                "severity": severity,
                "recommendation": recommendation
            },
            "vibration_analysis": vib_result,
            "current_analysis": cur_result,
            "cross_modal_diagnosis": cross_modal_result,
            "digital_twin_comparison": digital_twin_result,
            "multimodal_analysis": {
                "modal_weights": multimodal_result.get('modal_weights', {})
            },
            "ensemble_details": {
                "resnet_result": {
                    "class": resnet_result.get('class_name', ''),
                    "confidence": resnet_result.get('confidence', 0)
                },
                "cross_modal_result": {
                    "class": cross_modal_result.get('diagnosis', {}).get('class_name', ''),
                    "confidence": cross_modal_result.get('diagnosis', {}).get('confidence', 0)
                },
                "multimodal_result": {
                    "class": multimodal_result.get('class_name', ''),
                    "confidence": multimodal_result.get('confidence', 0)
                }
            },
            "features": features,
            "timestamp": datetime.now().isoformat()
        }
    
    def simulate_fault(self, fault_type: str, severity: float, 
                       speed_rpm: float = 1500, load_torque: float = 50) -> Dict:
        if self.digital_twin is None:
            return {
                "status": "disabled",
                "message": "Digital twin module not enabled"
            }
        
        self.update_operating_point(speed_rpm=speed_rpm, load_torque=load_torque)
        
        try:
            fault_signature = self.digital_twin.simulate_fault_signature(
                fault_type, severity, self._last_operating_point
            )
            
            return {
                "status": "success",
                "fault_type": fault_type,
                "severity": severity,
                "simulated_signals": {
                    "currents": {
                        "phase_a_length": len(fault_signature['currents']['phase_a']),
                        "phase_b_length": len(fault_signature['currents']['phase_b']),
                        "phase_c_length": len(fault_signature['currents']['phase_c'])
                    },
                    "vibration": {
                        "x_length": len(fault_signature['vibration']['x']),
                        "y_length": len(fault_signature['vibration']['y']),
                        "z_length": len(fault_signature['vibration']['z'])
                    }
                },
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Fault simulation failed: {str(e)}"
            }
