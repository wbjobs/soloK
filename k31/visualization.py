"""
可视化模块 - 频谱瀑布图、趋势曲线、3D螺旋桨动画
"""
import numpy as np
from collections import deque
from typing import Dict, List, Tuple, Optional
from config import SystemConfig, DEFAULT_CONFIG, CAVITATION_TYPES, CAVITATION_COLORS

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.animation import FuncAnimation
    from matplotlib.colors import LinearSegmentedColormap
    from mpl_toolkits.mplot3d import Axes3D
    MATPLOTLIB_AVAILABLE = True
except ImportError:
    MATPLOTLIB_AVAILABLE = False

class SpectrogramVisualizer:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG, max_time_frames: int = 100):
        self.config = config
        self.sample_rate = config.hydrophone.sample_rate
        self.max_time_frames = max_time_frames
        self.frequencies = None
        self.time_frames = deque(maxlen=max_time_frames)
        self.spectrogram_data = None
        
        if MATPLOTLIB_AVAILABLE:
            self._setup_colormap()
    
    def _setup_colormap(self):
        colors = [
            (0.0, 0.0, 0.3),
            (0.0, 0.0, 0.8),
            (0.0, 0.5, 1.0),
            (0.0, 1.0, 0.5),
            (0.5, 1.0, 0.0),
            (1.0, 0.5, 0.0),
            (1.0, 0.0, 0.0),
            (0.8, 0.0, 0.5)
        ]
        self.cmap = LinearSegmentedColormap.from_list('cavitation_cmap', colors, N=256)
    
    def update(self, signal: np.ndarray, timestamp: float):
        from scipy.signal import stft
        
        if signal.ndim == 2:
            signal = np.mean(signal, axis=0)
        
        f, t, Zxx = stft(signal, fs=self.sample_rate, nperseg=1024, noverlap=512)
        magnitude = np.abs(Zxx)
        magnitude_db = 20 * np.log10(magnitude + 1e-10)
        
        if self.frequencies is None:
            self.frequencies = f
        
        frame_magnitude = np.mean(magnitude_db, axis=1)
        self.time_frames.append(timestamp)
        
        if self.spectrogram_data is None:
            self.spectrogram_data = frame_magnitude.reshape(-1, 1)
        else:
            self.spectrogram_data = np.hstack([self.spectrogram_data, frame_magnitude.reshape(-1, 1)])
            if self.spectrogram_data.shape[1] > self.max_time_frames:
                self.spectrogram_data = self.spectrogram_data[:, -self.max_time_frames:]
    
    def get_data(self) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        if self.spectrogram_data is None:
            return np.array([]), np.array([]), np.array([])
        return np.array(list(self.time_frames)), self.frequencies, self.spectrogram_data

class TrendVisualizer:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG, max_points: int = 1000):
        self.config = config
        self.max_points = max_points
        self.timestamps = deque(maxlen=max_points)
        self.data = {
            'severity_score': deque(maxlen=max_points),
            'noise_level': deque(maxlen=max_points),
            'kurtosis': deque(maxlen=max_points),
            'cavitation_number': deque(maxlen=max_points),
            'sigma_ratio': deque(maxlen=max_points),
            'noise_increment': deque(maxlen=max_points)
        }
    
    def update(self, timestamp: float, detection_result: dict, severity_result: dict):
        self.timestamps.append(timestamp)
        self.data['severity_score'].append(severity_result.get('severity_score', 0))
        self.data['noise_level'].append(detection_result.get('noise_level_db', 0))
        self.data['kurtosis'].append(detection_result.get('kurtosis', 0))
        self.data['cavitation_number'].append(severity_result.get('cavitation_number', 0))
        self.data['sigma_ratio'].append(severity_result.get('sigma_ratio', 0))
        self.data['noise_increment'].append(severity_result.get('noise_increment_db', 0))
    
    def get_trend_data(self) -> Dict[str, np.ndarray]:
        return {
            'timestamps': np.array(list(self.timestamps)),
            **{k: np.array(list(v)) for k, v in self.data.items()}
        }

class Propeller3DVisualizer:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.propeller = config.propeller
        self.rotation_angle = 0.0
        self.cavitation_zones = []
    
    def generate_propeller_geometry(self) -> Dict[str, np.ndarray]:
        num_blades = self.propeller.num_blades
        diameter = self.propeller.diameter
        hub_diameter = diameter * self.propeller.hub_diameter_ratio
        pitch_ratio = self.propeller.pitch_ratio
        skew_angle = np.radians(self.propeller.skew_angle)
        rake_angle = np.radians(self.propeller.rake_angle)
        
        geometry = {}
        
        n_points = 50
        theta = np.linspace(0, 2 * np.pi, n_points)
        hub_radius = hub_diameter / 2
        hub_x = hub_radius * np.cos(theta)
        hub_y = hub_radius * np.sin(theta)
        hub_z = np.linspace(-diameter * 0.2, diameter * 0.2, n_points)
        geometry['hub'] = (hub_x, hub_y, hub_z)
        
        blades = []
        for blade_idx in range(num_blades):
            blade_angle = blade_idx * 2 * np.pi / num_blades
            
            r = np.linspace(hub_radius, diameter / 2, 20)
            theta_blade = np.linspace(-np.pi * 0.3, np.pi * 0.3, 30)
            R, THETA = np.meshgrid(r, theta_blade)
            
            pitch = pitch_ratio * diameter
            z_pitch = (R / (diameter / 2)) * pitch / (2 * np.pi) * THETA
            
            skew = skew_angle * (R - hub_radius) / (diameter / 2 - hub_radius)
            rake = rake_angle * (R - hub_radius) / (diameter / 2 - hub_radius)
            
            x = R * np.cos(THETA + skew + blade_angle)
            y = R * np.sin(THETA + skew + blade_angle)
            z = z_pitch + rake * R
            
            blades.append((x, y, z))
        
        geometry['blades'] = blades
        
        return geometry
    
    def set_cavitation_zones(self, cavitation_type: int, intensity: float = 0.5):
        self.cavitation_zones = []
        
        num_blades = self.propeller.num_blades
        diameter = self.propeller.diameter
        hub_diameter = diameter * self.propeller.hub_diameter_ratio
        
        if cavitation_type == 1:
            for i in range(num_blades):
                angle = i * 2 * np.pi / num_blades
                self.cavitation_zones.append({
                    'type': 'tip_vortex',
                    'blade': i,
                    'radius_range': (0.8 * diameter / 2, diameter / 2),
                    'angle_range': (angle - 0.2, angle + 0.2),
                    'intensity': intensity
                })
        elif cavitation_type == 2:
            for i in range(num_blades):
                angle = i * 2 * np.pi / num_blades
                self.cavitation_zones.append({
                    'type': 'face',
                    'blade': i,
                    'radius_range': (0.3 * diameter / 2, 0.9 * diameter / 2),
                    'angle_range': (angle - 0.3, angle + 0.1),
                    'intensity': intensity
                })
        elif cavitation_type == 3:
            for i in range(num_blades):
                angle = i * 2 * np.pi / num_blades
                self.cavitation_zones.append({
                    'type': 'back',
                    'blade': i,
                    'radius_range': (0.4 * diameter / 2, 0.85 * diameter / 2),
                    'angle_range': (angle - 0.1, angle + 0.3),
                    'intensity': intensity
                })
        elif cavitation_type == 4:
            self.cavitation_zones.append({
                'type': 'root_vortex',
                'blade': -1,
                'radius_range': (hub_diameter / 2, 0.3 * diameter / 2),
                'angle_range': (0, 2 * np.pi),
                'intensity': intensity
            })
    
    def update_rotation(self, rpm: float, dt: float):
        angular_velocity = rpm * 2 * np.pi / 60
        self.rotation_angle += angular_velocity * dt
        self.rotation_angle = self.rotation_angle % (2 * np.pi)

class VisualizationManager:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.spectrogram = SpectrogramVisualizer(config)
        self.trends = TrendVisualizer(config)
        self.propeller_3d = Propeller3DVisualizer(config)
        
        self.alarm_events = []
        self.current_cavitation_type = 0
        self.current_intensity = 0.0
    
    def update(self, signal: np.ndarray, conditions: dict, 
               detection_result: dict, classification_result: dict,
               severity_result: dict):
        timestamp = conditions.get('timestamp', 0)
        rpm = conditions.get('shaft_speed', 120)
        
        self.spectrogram.update(signal, timestamp)
        self.trends.update(timestamp, detection_result, severity_result)
        
        dt = 0.1
        self.propeller_3d.update_rotation(rpm, dt)
        
        class_idx = classification_result.get('class_index', 0)
        confidence = classification_result.get('confidence', 0)
        self.propeller_3d.set_cavitation_zones(class_idx, confidence)
        
        self.current_cavitation_type = class_idx
        self.current_intensity = severity_result.get('severity_score', 0)
        
        if detection_result.get('is_cavitating', False):
            if not self.alarm_events or (timestamp - self.alarm_events[-1]['timestamp']) > 5:
                self.alarm_events.append({
                    'timestamp': timestamp,
                    'type': CAVITATION_TYPES[class_idx],
                    'intensity': severity_result.get('severity_level', '轻微'),
                    'noise_level': detection_result.get('noise_level_db', 0),
                    'kurtosis': detection_result.get('kurtosis', 0)
                })
    
    def get_spectrogram_data(self) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        return self.spectrogram.get_data()
    
    def get_trend_data(self) -> Dict[str, np.ndarray]:
        return self.trends.get_trend_data()
    
    def get_propeller_geometry(self) -> Dict[str, np.ndarray]:
        return self.propeller_3d.generate_propeller_geometry()
    
    def get_cavitation_zones(self) -> List[Dict]:
        return self.propeller_3d.cavitation_zones
    
    def get_current_state(self) -> Dict:
        return {
            'cavitation_type': CAVITATION_TYPES[self.current_cavitation_type],
            'cavitation_type_idx': self.current_cavitation_type,
            'intensity': self.current_intensity,
            'color': CAVITATION_COLORS[CAVITATION_TYPES[self.current_cavitation_type]],
            'rotation_angle': self.propeller_3d.rotation_angle,
            'alarm_count': len(self.alarm_events)
        }
    
    def get_alarm_history(self) -> List[Dict]:
        return self.alarm_events
    
    def create_summary_plot(self, filepath: str = None):
        if not MATPLOTLIB_AVAILABLE:
            return None
        
        fig, axes = plt.subplots(3, 2, figsize=(16, 12))
        
        trend_data = self.get_trend_data()
        times = trend_data['timestamps']
        
        if len(times) > 0:
            ax = axes[0, 0]
            ax.plot(times, trend_data['severity_score'], 'r-', linewidth=2)
            ax.axhline(y=0.3, color='orange', linestyle='--', label='预警阈值')
            ax.axhline(y=0.5, color='red', linestyle='--', label='报警阈值')
            ax.set_xlabel('时间 (s)')
            ax.set_ylabel('空化严重度')
            ax.set_title('空化严重度趋势')
            ax.legend()
            ax.grid(True)
            
            ax = axes[0, 1]
            ax.plot(times, trend_data['noise_level'], 'b-', linewidth=2, label='噪声级')
            ax.axhline(y=160, color='red', linestyle='--', label='阈值 (160dB)')
            ax.set_xlabel('时间 (s)')
            ax.set_ylabel('噪声级 (dB re 1μPa)')
            ax.set_title('噪声级趋势')
            ax.legend()
            ax.grid(True)
            
            ax = axes[1, 0]
            ax.plot(times, trend_data['kurtosis'], 'g-', linewidth=2, label='峰度')
            ax.axhline(y=5, color='red', linestyle='--', label='阈值 (5)')
            ax.set_xlabel('时间 (s)')
            ax.set_ylabel('峰度')
            ax.set_title('峰度趋势')
            ax.legend()
            ax.grid(True)
            
            ax = axes[1, 1]
            ax.plot(times, trend_data['sigma_ratio'], 'm-', linewidth=2, label='σ/σ_c')
            ax.axhline(y=1.0, color='red', linestyle='--', label='临界值')
            ax.set_xlabel('时间 (s)')
            ax.set_ylabel('空化数比 σ/σ_c')
            ax.set_title('空化数比趋势')
            ax.legend()
            ax.grid(True)
            
            ax = axes[2, 0]
            ax.plot(times, trend_data['cavitation_number'], 'c-', linewidth=2)
            ax.set_xlabel('时间 (s)')
            ax.set_ylabel('空化数 σ')
            ax.set_title('空化数趋势')
            ax.grid(True)
            
            ax = axes[2, 1]
            ax.plot(times, trend_data['noise_increment'], 'k-', linewidth=2)
            ax.set_xlabel('时间 (s)')
            ax.set_ylabel('噪声增量 (dB)')
            ax.set_title('噪声级增量趋势')
            ax.grid(True)
        
        plt.tight_layout()
        
        if filepath:
            plt.savefig(filepath, dpi=100, bbox_inches='tight')
            plt.close()
            return filepath
        else:
            return fig
    
    def create_spectrogram_plot(self, filepath: str = None):
        if not MATPLOTLIB_AVAILABLE:
            return None
        
        times, freqs, data = self.get_spectrogram_data()
        
        if data.size == 0:
            return None
        
        fig, ax = plt.subplots(figsize=(12, 6))
        
        freq_mask = freqs <= 100000
        im = ax.pcolormesh(times, freqs[freq_mask] / 1000, data[freq_mask, :], 
                          cmap=self.spectrogram.cmap, shading='auto')
        
        ax.set_xlabel('时间 (s)')
        ax.set_ylabel('频率 (kHz)')
        ax.set_title('频谱瀑布图')
        
        cbar = plt.colorbar(im, ax=ax)
        cbar.set_label('幅度 (dB)')
        
        plt.tight_layout()
        
        if filepath:
            plt.savefig(filepath, dpi=100, bbox_inches='tight')
            plt.close()
            return filepath
        else:
            return fig
    
    def create_propeller_3d_plot(self, filepath: str = None):
        if not MATPLOTLIB_AVAILABLE:
            return None
        
        fig = plt.figure(figsize=(10, 10))
        ax = fig.add_subplot(111, projection='3d')
        
        geometry = self.get_propeller_geometry()
        cavitation_zones = self.get_cavitation_zones()
        
        hub_x, hub_y, hub_z = geometry['hub']
        ax.plot(hub_x, hub_y, hub_z, 'gray', linewidth=3, alpha=0.7)
        
        blade_colors = ['steelblue', 'cornflowerblue', 'royalblue', 'blue', 'navy']
        for i, (x, y, z) in enumerate(geometry['blades']):
            ax.plot_surface(x, y, z, color=blade_colors[i % len(blade_colors)], 
                           alpha=0.6, edgecolor='none')
        
        for zone in cavitation_zones:
            intensity = zone['intensity']
            r_min, r_max = zone['radius_range']
            a_min, a_max = zone['angle_range']
            
            n_points = 50
            r = np.linspace(r_min, r_max, 20)
            theta = np.linspace(a_min, a_max, n_points)
            R, THETA = np.meshgrid(r, theta)
            
            X = R * np.cos(THETA)
            Y = R * np.sin(THETA)
            Z = np.zeros_like(X) + np.random.normal(0, 0.05, X.shape)
            
            color = CAVITATION_COLORS.get(CAVITATION_TYPES.get(self.current_cavitation_type, '无空化'), '#ff0000')
            ax.scatter(X, Y, Z, c=color, alpha=0.3 + 0.5 * intensity, s=10)
        
        ax.set_xlabel('X (m)')
        ax.set_ylabel('Y (m)')
        ax.set_zlabel('Z (m)')
        ax.set_title(f'螺旋桨3D模型 - {CAVITATION_TYPES.get(self.current_cavitation_type, "无空化")}')
        
        max_radius = self.propeller.diameter / 2
        ax.set_xlim(-max_radius, max_radius)
        ax.set_ylim(-max_radius, max_radius)
        ax.set_zlim(-max_radius, max_radius)
        
        if filepath:
            plt.savefig(filepath, dpi=100, bbox_inches='tight')
            plt.close()
            return filepath
        else:
            return fig
