import numpy as np
from typing import List, Dict, Tuple, Optional
from datetime import datetime
from models import (
    NeutralGroundingType, FaultType, ResistanceType,
    AlgorithmResult, FeederProbability, FaultAnalysisResult,
    TravelingWaveResult, GISLocation, ArcDetectionResult, ArcFaultType
)
from algorithms import (
    SteadyStateMethod, TransientMethod, FifthHarmonicMethod,
    InjectionSignalMethod, get_algorithm_weights
)
from signal_utils import (
    extract_harmonic, detect_fault_onset, estimate_ground_resistance,
    total_harmonic_distortion, compute_fft
)
from traveling_wave import TravelingWaveLocator, generate_gis_coordinates
from arc_detection import ArcFaultDetector


class GroundingTypeDetector:
    def __init__(self):
        self.voltage_threshold_ungrounded = 0.5
        self.voltage_threshold_arc = 0.3
        self.voltage_threshold_low_r = 0.8

    def detect(self, zero_seq_voltage: np.ndarray, sampling_rate: int,
               fundamental_freq: float = 50.0) -> NeutralGroundingType:
        v_mag, _ = extract_harmonic(zero_seq_voltage, sampling_rate, 1, fundamental_freq)
        
        v_5th, _ = extract_harmonic(zero_seq_voltage, sampling_rate, 5, fundamental_freq)
        fifth_ratio = v_5th / v_mag if v_mag > 1e-6 else 0
        
        if v_mag < 0.1:
            return NeutralGroundingType.UNKNOWN
        
        if v_mag >= self.voltage_threshold_low_r:
            if fifth_ratio < 0.1:
                return NeutralGroundingType.LOW_RESISTANCE
        
        if 0.2 <= v_mag < self.voltage_threshold_low_r:
            if fifth_ratio > 0.15:
                return NeutralGroundingType.ARC_SUPPRESSION_COIL
            else:
                return NeutralGroundingType.UNGROUNDED
        
        if v_mag >= self.voltage_threshold_ungrounded:
            if fifth_ratio > 0.2:
                return NeutralGroundingType.ARC_SUPPRESSION_COIL
        
        return NeutralGroundingType.UNGROUNDED


class FaultTypeDiscriminator:
    def __init__(self):
        self.thd_threshold_ferro = 20.0
        self.imbalance_threshold_pt = 0.5

    def discriminate(self, zero_seq_voltage: np.ndarray, 
                     phase_voltages: Optional[List[np.ndarray]] = None,
                     sampling_rate: int = 12800,
                     fundamental_freq: float = 50.0) -> FaultType:
        v_mag, _ = extract_harmonic(zero_seq_voltage, sampling_rate, 1, fundamental_freq)
        
        if v_mag < 0.05:
            return FaultType.NO_FAULT
        
        thd = total_harmonic_distortion(zero_seq_voltage, sampling_rate, fundamental_freq)
        
        if thd > self.thd_threshold_ferro:
            xf, magnitude, _ = compute_fft(zero_seq_voltage, sampling_rate)
            sub_harmonic_12 = np.max(magnitude[np.where((xf >= 10) & (xf <= 20))]) if len(magnitude[np.where((xf >= 10) & (xf <= 20))]) > 0 else 0
            sub_harmonic_13 = np.max(magnitude[np.where((xf >= 12) & (xf <= 25))]) if len(magnitude[np.where((xf >= 12) & (xf <= 25))]) > 0 else 0
            
            if sub_harmonic_12 > 0.1 * v_mag or sub_harmonic_13 > 0.1 * v_mag:
                return FaultType.FERRO_RESONANCE
        
        if phase_voltages and len(phase_voltages) == 3:
            ph_mags = []
            for ph_v in phase_voltages:
                mag, _ = extract_harmonic(ph_v, sampling_rate, 1, fundamental_freq)
                ph_mags.append(mag)
            
            max_mag = max(ph_mags)
            min_mag = min(ph_mags)
            imbalance = (max_mag - min_mag) / max_mag if max_mag > 0 else 0
            
            if imbalance > self.imbalance_threshold_pt and v_mag < 0.3:
                return FaultType.PT_BROKEN
        
        return FaultType.SINGLE_PHASE_GROUND


class VotingMechanism:
    def __init__(self):
        self.bus_fault_threshold = 0.3

    def vote(self, algorithm_results: List[AlgorithmResult],
             feeder_ids: List[int]) -> Tuple[Optional[int], bool, List[FeederProbability]]:
        total_scores = {fid: 0.0 for fid in feeder_ids}
        total_weight = 0.0
        
        for alg_result in algorithm_results:
            weight = alg_result.weight
            total_weight += weight
            
            for fid, score in alg_result.confidence_scores.items():
                if fid in total_scores:
                    total_scores[fid] += score * weight
        
        if total_weight > 0:
            for fid in total_scores:
                total_scores[fid] /= total_weight
        
        sorted_scores = sorted(total_scores.items(), key=lambda x: x[1], reverse=True)
        
        feeder_probs = []
        for rank, (fid, prob) in enumerate(sorted_scores, 1):
            feeder_probs.append(FeederProbability(
                feeder_id=fid,
                probability=round(prob, 4),
                rank=rank
            ))
        
        max_prob = sorted_scores[0][1] if sorted_scores else 0.0
        is_bus_fault = max_prob < self.bus_fault_threshold
        
        if is_bus_fault:
            return None, True, feeder_probs
        else:
            return sorted_scores[0][0], False, feeder_probs


class FaultAnalyzer:
    def __init__(self):
        self.grounding_detector = GroundingTypeDetector()
        self.fault_discriminator = FaultTypeDiscriminator()
        self.voting = VotingMechanism()
        self.resistance_threshold = 500.0
        self.tw_locator = TravelingWaveLocator()
        self.arc_detector = ArcFaultDetector()

    def analyze(self, record_data) -> FaultAnalysisResult:
        sampling_rate = record_data.sampling_rate
        fundamental_freq = record_data.power_frequency
        zero_seq_voltage = np.array(record_data.zero_sequence_voltage)
        feeders = record_data.feeders
        
        grounding_type = self.grounding_detector.detect(
            zero_seq_voltage, sampling_rate, fundamental_freq
        )
        
        fault_type = self.fault_discriminator.discriminate(
            zero_seq_voltage, None, sampling_rate, fundamental_freq
        )
        
        if fault_type != FaultType.SINGLE_PHASE_GROUND:
            return self._create_non_ground_result(
                fault_type, grounding_type, feeders, zero_seq_voltage, sampling_rate
            )
        
        weights = get_algorithm_weights(grounding_type)
        
        algorithms = [
            SteadyStateMethod(),
            TransientMethod(),
            FifthHarmonicMethod(),
            InjectionSignalMethod()
        ]
        
        algorithm_results = []
        for alg in algorithms:
            candidates, confidence = alg.analyze(
                feeders, zero_seq_voltage, sampling_rate, fundamental_freq
            )
            alg_result = AlgorithmResult(
                algorithm_name=alg.name,
                candidate_feeders=candidates,
                confidence_scores=confidence,
                weight=weights.get(alg.name, 0.25)
            )
            algorithm_results.append(alg_result)
        
        feeder_ids = [f.feeder_id for f in feeders]
        fault_feeder_id, is_bus_fault, feeder_probs = self.voting.vote(
            algorithm_results, feeder_ids
        )
        
        fault_start = detect_fault_onset(zero_seq_voltage)
        
        estimated_resistance = self._estimate_resistance(
            feeders, zero_seq_voltage, fault_feeder_id, sampling_rate, fundamental_freq
        )
        
        resistance_type = (ResistanceType.LOW_RESISTANCE 
                          if estimated_resistance < self.resistance_threshold 
                          else ResistanceType.HIGH_RESISTANCE)
        
        traveling_wave_result = None
        gis_location = None
        if fault_feeder_id is not None and not is_bus_fault:
            fault_feeder = next((f for f in feeders if f.feeder_id == fault_feeder_id), None)
            if fault_feeder:
                zero_current = np.array(fault_feeder.zero_sequence)
                
                line_length = 10.0
                substation_lat = 39.9042
                substation_lon = 116.4074
                line_azimuth = 45.0
                
                if hasattr(record_data, 'line_parameters') and record_data.line_parameters:
                    line_length = record_data.line_parameters.line_length
                    substation_lat = record_data.line_parameters.substation_latitude
                    substation_lon = record_data.line_parameters.substation_longitude
                    line_azimuth = record_data.line_parameters.line_azimuth
                
                tw_result = self.tw_locator.single_end_locate(
                    zero_current, zero_seq_voltage, line_length, sampling_rate
                )
                
                traveling_wave_result = TravelingWaveResult(
                    fault_distance=tw_result.fault_distance,
                    method=tw_result.method,
                    arrival_times=tw_result.arrival_times,
                    confidence=tw_result.confidence,
                    wave_velocity=tw_result.wave_velocity,
                    reflection_count=tw_result.reflection_count
                )
                
                if tw_result.fault_distance >= 0:
                    lat, lon = generate_gis_coordinates(
                        tw_result.fault_distance,
                        substation_lat,
                        substation_lon,
                        line_azimuth
                    )
                    gis_location = GISLocation(
                        latitude=lat,
                        longitude=lon,
                        distance_from_substation=tw_result.fault_distance,
                        line_azimuth=line_azimuth
                    )
        
        arc_result = None
        if fault_feeder_id is not None and not is_bus_fault:
            fault_feeder = next((f for f in feeders if f.feeder_id == fault_feeder_id), None)
            if fault_feeder:
                zero_current = np.array(fault_feeder.zero_sequence)
                arc_det = self.arc_detector.detect_arc_fault(
                    zero_current, zero_seq_voltage, sampling_rate, fundamental_freq
                )
                
                arc_result = ArcDetectionResult(
                    arc_type=ArcFaultType(arc_det.arc_type.value),
                    is_arc_fault=arc_det.is_arc_fault,
                    arc_count=arc_det.arc_count,
                    average_arc_duration=arc_det.average_arc_duration,
                    average_extinguish_duration=arc_det.average_extinguish_duration,
                    high_frequency_energy=arc_det.high_frequency_energy,
                    zero_crossing_deviation=arc_det.zero_crossing_deviation,
                    confidence=arc_det.confidence
                )
        
        return FaultAnalysisResult(
            timestamp=datetime.now(),
            fault_type=fault_type,
            fault_feeder_id=fault_feeder_id,
            is_bus_fault=is_bus_fault,
            grounding_type=grounding_type,
            resistance_type=resistance_type,
            estimated_resistance=round(estimated_resistance, 2),
            feeder_probabilities=feeder_probs,
            algorithm_results=algorithm_results,
            fault_start_sample=fault_start,
            traveling_wave=traveling_wave_result,
            gis_location=gis_location,
            arc_detection=arc_result
        )

    def _estimate_resistance(self, feeders, zero_seq_voltage: np.ndarray,
                            fault_feeder_id: Optional[int], sampling_rate: int,
                            fundamental_freq: float) -> float:
        if fault_feeder_id is None:
            return 1e6
        
        fault_feeder = next((f for f in feeders if f.feeder_id == fault_feeder_id), None)
        if fault_feeder is None:
            return 1e6
        
        zero_current = np.array(fault_feeder.zero_sequence)
        resistance = estimate_ground_resistance(zero_current, zero_seq_voltage, sampling_rate, fundamental_freq)
        
        if resistance == float('inf') or np.isinf(resistance):
            return 1e6
        return resistance

    def _create_non_ground_result(self, fault_type: FaultType,
                                   grounding_type: NeutralGroundingType,
                                   feeders, zero_seq_voltage: np.ndarray,
                                   sampling_rate: int) -> FaultAnalysisResult:
        feeder_probs = [
            FeederProbability(feeder_id=f.feeder_id, probability=0.0, rank=i+1)
            for i, f in enumerate(feeders)
        ]
        
        return FaultAnalysisResult(
            timestamp=datetime.now(),
            fault_type=fault_type,
            fault_feeder_id=None,
            is_bus_fault=False,
            grounding_type=grounding_type,
            resistance_type=ResistanceType.HIGH_RESISTANCE,
            estimated_resistance=1e6,
            feeder_probabilities=feeder_probs,
            algorithm_results=[],
            fault_start_sample=detect_fault_onset(zero_seq_voltage),
            traveling_wave=None,
            gis_location=None,
            arc_detection=None
        )
