
import numpy as np
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from scipy.integrate import odeint
from scipy.signal import lsim, StateSpace
import warnings
warnings.filterwarnings('ignore')


@dataclass
class MotorParameters:
    R_s: float = 2.5
    R_r: float = 2.0
    L_s: float = 0.0085
    L_r: float = 0.0085
    L_m: float = 0.08
    J: float = 0.05
    B: float = 0.001
    p: int = 2
    V_n: float = 380
    I_n: float = 10
    omega_n: float = 1500 * 2 * np.pi / 60
    K_t: float = 1.5
    K_e: float = 1.5
    bearing_stiffness: float = 1e6
    bearing_damping: float = 500
    mass: float = 50


@dataclass
class MotorOperatingPoint:
    voltage_phase_a: float = 220
    voltage_phase_b: float = 220
    voltage_phase_c: float = 220
    load_torque: float = 50
    speed_rpm: float = 1500
    temperature_bearing: float = 45
    temperature_winding: float = 75


@dataclass
class FaultConditions:
    bearing_inner_race_fault: bool = False
    bearing_outer_race_fault: bool = False
    bearing_ball_fault: bool = False
    rotor_broken_bar: bool = False
    rotor_eccentricity: bool = False
    stator_interturn_short: bool = False
    misalignment: bool = False
    unbalance: bool = False
    fault_severity: float = 0.0


class ElectromagneticModel:
    def __init__(self, params: MotorParameters):
        self.params = params
        self.state_names = ['i_sd', 'i_sq', 'i_rd', 'i_rq', 'omega_e', 'theta_e']
        
    def dq_transform(self, v_a, v_b, v_c, theta):
        v_d = 2/3 * (v_a * np.cos(theta) + v_b * np.cos(theta-2*np.pi/3) + v_c * np.cos(theta+2*np.pi/3))
        v_q = -2/3 * (v_a * np.sin(theta) + v_b * np.sin(theta-2*np.pi/3) + v_c * np.sin(theta+2*np.pi/3))
        return v_d, v_q
    
    def inverse_dq_transform(self, i_d, i_q, theta):
        i_a = i_d * np.cos(theta) - i_q * np.sin(theta)
        i_b = i_d * np.cos(theta-2*np.pi/3) - i_q * np.sin(theta-2*np.pi/3)
        i_c = i_d * np.cos(theta+2*np.pi/3) - i_q * np.sin(theta+2*np.pi/3)
        return i_a, i_b, i_c
    
    def motor_equations(self, state, t, v_d, v_q, load_torque):
        i_sd, i_sq, i_rd, i_rq, omega_e, theta_e = state
        p = self.params.p
        
        R_s = self.params.R_s
        R_r = self.params.R_r
        L_s = self.params.L_s
        L_r = self.params.L_r
        L_m = self.params.L_m
        J = self.params.J
        B = self.params.B
        
        sigma = 1 - L_m**2 / (L_s * L_r)
        L_sigma_s = sigma * L_s
        L_sigma_r = sigma * L_r
        
        di_sd = (v_d - R_s*i_sd + L_m/L_r*R_r*i_rd + omega_e*L_sigma_s*i_sq + omega_e*L_m/L_r*i_rq) / L_sigma_s
        di_sq = (v_q - R_s*i_sq - L_m/L_r*R_r*i_rq - omega_e*L_sigma_s*i_sd - omega_e*L_m/L_r*i_rd) / L_sigma_s
        di_rd = (-R_r*i_rd + L_m*omega_e*i_sq) / L_sigma_r
        di_rq = (-R_r*i_rq - L_m*omega_e*i_sd) / L_sigma_r
        
        T_e = 3/2 * p * L_m * (i_sq*i_rd - i_sd*i_rq)
        domega_e = (T_e - B*omega_e - load_torque) / J
        dtheta_e = omega_e
        
        return [di_sd, di_sq, di_rd, di_rq, domega_e, dtheta_e]
    
    def simulate(self, t_span: np.ndarray, v_a, v_b, v_c, load_torque, initial_state=None):
        if initial_state is None:
            initial_state = [0, 0, 0, 0, self.params.omega_n, 0]
        
        v_d_steady = np.sqrt(2/3) * np.mean(np.sqrt(v_a**2 + v_b**2 + v_c**2))
        v_q_steady = 0.0
        
        sol = odeint(self.motor_equations, initial_state, t_span,
                    args=(v_d_steady, v_q_steady, load_torque))
        
        i_sd = sol[:, 0]
        i_sq = sol[:, 1]
        theta_e = sol[:, 5]
        
        i_a, i_b, i_c = self.inverse_dq_transform(i_sd, i_sq, theta_e)
        
        return {
            'time': t_span,
            'currents': {'phase_a': i_a, 'phase_b': i_b, 'phase_c': i_c},
            'torque': 3/2 * self.params.p * self.params.L_m * (i_sq*sol[:, 2] - i_sd*sol[:, 3]),
            'speed': sol[:, 4] * 60 / (2 * np.pi * self.params.p),
            'states': sol
        }


class MechanicalModel:
    def __init__(self, params: MotorParameters):
        self.params = params
        
    def rotor_system_response(self, t: np.ndarray, torque: np.ndarray,
                              fault_conditions: FaultConditions = None) -> Dict:
        if fault_conditions is None:
            fault_conditions = FaultConditions()
        
        dt = t[1] - t[0]
        omega = 2 * np.pi * (self.params.omega_n / (2 * np.pi / 60)) / 60
        
        if fault_conditions.unbalance:
            unbalance_force = fault_conditions.fault_severity * 100 * np.sin(omega * t)
        else:
            unbalance_force = np.zeros_like(t)
        
        if fault_conditions.misalignment:
            misalignment_force = fault_conditions.fault_severity * 50 * np.sin(2 * omega * t)
        else:
            misalignment_force = np.zeros_like(t)
        
        F_total = torque / 0.05 + unbalance_force + misalignment_force
        
        m = self.params.mass
        c = self.params.bearing_damping
        k = self.params.bearing_stiffness
        
        A = np.array([[0, 1], [-k/m, -c/m]])
        B = np.array([[0], [1/m]])
        C = np.array([[1, 0]])
        D = np.array([[0]])
        
        sys = StateSpace(A, B, C, D)
        
        _, y, _ = lsim(sys, F_total, t)
        
        vibration = y.flatten()
        
        if fault_conditions.bearing_inner_race_fault:
            bpfi = 5.43 * omega
            vibration += fault_conditions.fault_severity * 0.1 * np.sin(bpfi * t)
        
        if fault_conditions.bearing_outer_race_fault:
            bpfo = 3.57 * omega
            vibration += fault_conditions.fault_severity * 0.1 * np.sin(bpfo * t)
        
        if fault_conditions.bearing_ball_fault:
            bsf = 2.38 * omega
            vibration += fault_conditions.fault_severity * 0.05 * np.sin(bsf * t)
        
        return {
            'time': t,
            'vibration': vibration,
            'displacement': y.flatten(),
            'velocity': np.gradient(y.flatten(), dt)
        }


class ThermalModel:
    def __init__(self, params: MotorParameters):
        self.params = params
        self.R_thermal = 0.5
        self.C_thermal = 1000
        self.P_loss_coeff = 0.1
        
    def compute_losses(self, currents: Dict, speed: float) -> Dict:
        i_sq = np.sqrt(np.mean(currents['phase_a']**2 + currents['phase_b']**2 + currents['phase_c']**2))
        
        P_copper = 3 * self.params.R_s * i_sq**2
        P_iron = self.P_loss_coeff * speed**1.5
        P_mech = self.params.B * speed**2
        P_total = P_copper + P_iron + P_mech
        
        return {
            'copper_loss': P_copper,
            'iron_loss': P_iron,
            'mechanical_loss': P_mech,
            'total_loss': P_total
        }
    
    def simulate_temperature(self, t: np.ndarray, losses: Dict,
                             ambient_temp: float = 25) -> Dict:
        T_bearing = np.zeros_like(t)
        T_winding = np.zeros_like(t)
        T_bearing[0] = ambient_temp + 20
        T_winding[0] = ambient_temp + 35
        
        dt = t[1] - t[0]
        
        for i in range(1, len(t)):
            P_total = losses['total_loss'] if isinstance(losses['total_loss'], (int, float)) else losses['total_loss'][i]
            
            dT_winding = (P_total * 0.7 - (T_winding[i-1] - ambient_temp) / self.R_thermal) / self.C_thermal
            T_winding[i] = T_winding[i-1] + dT_winding * dt
            
            dT_bearing = (P_total * 0.3 - (T_bearing[i-1] - ambient_temp) / (self.R_thermal * 2)) / (self.C_thermal * 2)
            T_bearing[i] = T_bearing[i-1] + dT_bearing * dt
        
        return {
            'time': t,
            'bearing_temperature': T_bearing,
            'winding_temperature': T_winding
        }


class DigitalTwinModel:
    def __init__(self, params: Optional[MotorParameters] = None):
        self.params = params or MotorParameters()
        self.em_model = ElectromagneticModel(self.params)
        self.mech_model = MechanicalModel(self.params)
        self.thermal_model = ThermalModel(self.params)
        
        self.health_model_cache = {}
        
    def generate_healthy_signature(self, operating_point: MotorOperatingPoint,
                                   duration: float = 1.0, 
                                   sample_rate_vib: int = 20000,
                                   sample_rate_cur: int = 10000) -> Dict:
        cache_key = f"{operating_point.speed_rpm}_{operating_point.load_torque}"
        
        if cache_key in self.health_model_cache:
            return self.health_model_cache[cache_key]
        
        t_vib = np.linspace(0, duration, int(duration * sample_rate_vib))
        t_cur = np.linspace(0, duration, int(duration * sample_rate_cur))
        
        v_a = operating_point.voltage_phase_a * np.sqrt(2) * np.sin(2*np.pi*50*t_cur)
        v_b = operating_point.voltage_phase_b * np.sqrt(2) * np.sin(2*np.pi*50*t_cur - 2*np.pi/3)
        v_c = operating_point.voltage_phase_c * np.sqrt(2) * np.sin(2*np.pi*50*t_cur + 2*np.pi/3)
        
        em_result = self.em_model.simulate(t_cur, v_a, v_b, v_c, operating_point.load_torque)
        
        torque = em_result['torque']
        torque_interp = np.interp(t_vib, t_cur, torque)
        
        mech_result = self.mech_model.rotor_system_response(t_vib, torque_interp)
        
        losses = self.thermal_model.compute_losses(em_result['currents'], 
                                                   operating_point.speed_rpm * 2*np.pi/60)
        thermal_result = self.thermal_model.simulate_temperature(t_cur, losses)
        
        healthy_signature = {
            'currents': em_result['currents'],
            'vibration': {
                'x': mech_result['vibration'] + 0.01 * np.random.randn(len(t_vib)),
                'y': mech_result['vibration'] + 0.01 * np.random.randn(len(t_vib)),
                'z': mech_result['vibration'] * 0.5 + 0.01 * np.random.randn(len(t_vib))
            },
            'temperature': {
                'bearing': thermal_result['bearing_temperature'][-1],
                'winding': thermal_result['winding_temperature'][-1]
            },
            'features': self._extract_reference_features(em_result, mech_result, thermal_result)
        }
        
        self.health_model_cache[cache_key] = healthy_signature
        
        return healthy_signature
    
    def _extract_reference_features(self, em_result, mech_result, thermal_result) -> Dict:
        i_a = em_result['currents']['phase_a']
        
        fft_cur = np.abs(np.fft.rfft(i_a))
        freqs_cur = np.fft.rfftfreq(len(i_a), 1/10000)
        
        fundamental_mask = (freqs_cur >= 45) & (freqs_cur <= 55)
        harmonic_mask = (freqs_cur >= 95) & (freqs_cur <= 105)
        
        fundamental_amp = np.mean(fft_cur[fundamental_mask]) if np.any(fundamental_mask) else 0
        harmonic_amp = np.mean(fft_cur[harmonic_mask]) if np.any(harmonic_mask) else 0
        
        vibration = mech_result['vibration']
        fft_vib = np.abs(np.fft.rfft(vibration))
        
        return {
            'current_rms': np.sqrt(np.mean(i_a**2)),
            'current_thd': harmonic_amp / (fundamental_amp + 1e-8),
            'vibration_rms': np.sqrt(np.mean(vibration**2)),
            'vibration_kurtosis': np.mean((vibration**4) / (np.std(vibration)**4 + 1e-8)),
            'bearing_temp': thermal_result['bearing_temperature'][-1],
            'winding_temp': thermal_result['winding_temperature'][-1]
        }
    
    def simulate_fault_signature(self, fault_type: str, severity: float,
                                 operating_point: MotorOperatingPoint,
                                 duration: float = 1.0) -> Dict:
        fault_conditions = FaultConditions(
            bearing_inner_race_fault=(fault_type == 'bearing_inner'),
            bearing_outer_race_fault=(fault_type == 'bearing_outer'),
            bearing_ball_fault=(fault_type == 'bearing_ball'),
            rotor_broken_bar=(fault_type == 'rotor_broken'),
            rotor_eccentricity=(fault_type == 'rotor_eccentricity'),
            stator_interturn_short=(fault_type == 'stator_short'),
            misalignment=(fault_type == 'misalignment'),
            unbalance=(fault_type == 'unbalance'),
            fault_severity=severity
        )
        
        sample_rate_vib = 20000
        sample_rate_cur = 10000
        
        t_vib = np.linspace(0, duration, int(duration * sample_rate_vib))
        t_cur = np.linspace(0, duration, int(duration * sample_rate_cur))
        
        v_a = operating_point.voltage_phase_a * np.sqrt(2) * np.sin(2*np.pi*50*t_cur)
        v_b = operating_point.voltage_phase_b * np.sqrt(2) * np.sin(2*np.pi*50*t_cur - 2*np.pi/3)
        v_c = operating_point.voltage_phase_c * np.sqrt(2) * np.sin(2*np.pi*50*t_cur + 2*np.pi/3)
        
        em_result = self.em_model.simulate(t_cur, v_a, v_b, v_c, operating_point.load_torque)
        
        torque = em_result['torque']
        torque_interp = np.interp(t_vib, t_cur, torque)
        
        mech_result = self.mech_model.rotor_system_response(t_vib, torque_interp, fault_conditions)
        
        vibration_fault = mech_result['vibration']
        vibration_fault += 0.01 * np.random.randn(len(t_vib))
        
        i_a_fault = em_result['currents']['phase_a'].copy()
        
        if fault_conditions.rotor_broken_bar:
            slip = 0.02
            sideband_freq = 50 * (1 - 2*slip)
            i_a_fault += severity * 0.2 * np.sin(2*np.pi*sideband_freq*t_cur)
        
        if fault_conditions.rotor_eccentricity:
            mod_freq = operating_point.speed_rpm / 60
            i_a_fault *= (1 + severity * 0.1 * np.sin(2*np.pi*mod_freq*t_cur))
        
        return {
            'currents': {
                'phase_a': i_a_fault,
                'phase_b': em_result['currents']['phase_b'],
                'phase_c': em_result['currents']['phase_c']
            },
            'vibration': {
                'x': vibration_fault,
                'y': vibration_fault + 0.005 * np.random.randn(len(t_vib)),
                'z': vibration_fault * 0.5 + 0.005 * np.random.randn(len(t_vib))
            },
            'fault_type': fault_type,
            'severity': severity
        }
    
    def analyze_residuals(self, measured_signals: Dict, 
                          healthy_signature: Dict) -> Dict:
        residuals = {}
        
        for axis in ['x', 'y', 'z']:
            measured_vib = np.array(measured_signals['vibration'][axis])
            healthy_vib = np.array(healthy_signature['vibration'][axis])
            
            min_len = min(len(measured_vib), len(healthy_vib))
            measured_vib = measured_vib[:min_len]
            healthy_vib = healthy_vib[:min_len]
            
            residuals[f'vibration_{axis}'] = measured_vib - healthy_vib
        
        for phase in ['phase_a', 'phase_b', 'phase_c']:
            measured_cur = np.array(measured_signals['currents'][phase])
            healthy_cur = np.array(healthy_signature['currents'][phase])
            
            min_len = min(len(measured_cur), len(healthy_cur))
            measured_cur = measured_cur[:min_len]
            healthy_cur = healthy_cur[:min_len]
            
            residuals[f'current_{phase}'] = measured_cur - healthy_cur
        
        return residuals
    
    def compute_residual_features(self, residuals: Dict) -> Dict:
        features = {}
        
        for key, residual in residuals.items():
            if len(residual) > 10:
                features[f'{key}_rms'] = float(np.sqrt(np.mean(residual**2)))
                features[f'{key}_kurtosis'] = float(np.mean((residual**4) / (np.std(residual)**4 + 1e-8)) - 3)
                features[f'{key}_peak'] = float(np.max(np.abs(residual)))
                
                fft = np.abs(np.fft.rfft(residual - np.mean(residual)))
                features[f'{key}_dominant_freq_amp'] = float(np.max(fft[1:])) if len(fft) > 1 else 0
        
        return features
    
    def fault_detection_from_residuals(self, residual_features: Dict) -> Dict:
        detection_result = {
            'is_fault_detected': False,
            'fault_indicators': {},
            'confidence': 0.0
        }
        
        for key, value in residual_features.items():
            if 'kurtosis' in key and value > 3:
                detection_result['fault_indicators'][key] = 'impulsive_fault'
            elif 'rms' in key and value > 0.1:
                detection_result['fault_indicators'][key] = 'amplitude_increase'
        
        num_indicators = len(detection_result['fault_indicators'])
        if num_indicators > 0:
            detection_result['is_fault_detected'] = True
            detection_result['confidence'] = min(0.95, 0.5 + num_indicators * 0.15)
        
        return detection_result
    
    def compare_signals(self, measured_signals: Dict, 
                       operating_point: MotorOperatingPoint) -> Dict:
        healthy = self.generate_healthy_signature(operating_point)
        
        residuals = self.analyze_residuals(measured_signals, healthy)
        
        residual_features = self.compute_residual_features(residuals)
        
        detection = self.fault_detection_from_residuals(residual_features)
        
        return {
            'healthy_signature': {
                'currents': healthy['currents'],
                'vibration': healthy['vibration'],
                'temperature': healthy['temperature']
            },
            'residuals': residuals,
            'residual_features': residual_features,
            'fault_detection': detection,
            'reference_features': healthy['features']
        }


class FMUModelAdapter:
    def __init__(self, fmu_path: Optional[str] = None):
        self.fmu_path = fmu_path
        self.is_loaded = False
        self.model = None
        
        if fmu_path and os.path.exists(fmu_path):
            self._load_fmu()
    
    def _load_fmu(self):
        try:
            import fmpy
            self.model = fmpy.read_model_description(self.fmu_path)
            self.is_loaded = True
        except ImportError:
            print("Warning: fmpy not installed. Using built-in simulation model.")
        except Exception as e:
            print(f"Warning: Failed to load FMU: {e}. Using built-in simulation model.")
    
    def simulate_with_fmu(self, start_time: float, stop_time: float,
                         parameters: Dict, inputs: Dict) -> Optional[Dict]:
        if not self.is_loaded:
            return None
        
        try:
            import fmpy
            
            output = fmpy.simulate_fmu(
                self.fmu_path,
                start_time=start_time,
                stop_time=stop_time,
                parameters=parameters,
                input=inputs
            )
            
            return {
                'time': output['time'],
                'currents': {
                    'phase_a': output.get('i_a', []),
                    'phase_b': output.get('i_b', []),
                    'phase_c': output.get('i_c', [])
                },
                'vibration': {
                    'x': output.get('vib_x', []),
                    'y': output.get('vib_y', []),
                    'z': output.get('vib_z', [])
                }
            }
        except Exception as e:
            print(f"FMU simulation failed: {e}")
            return None


import os
