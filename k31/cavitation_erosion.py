"""
空化侵蚀预测模块
功能：
1. 气泡溃灭冲击能量谱计算
2. 材料疲劳S-N曲线模型
3. 螺旋桨表面年腐蚀深度预测 (mm/year)
"""
import numpy as np
from dataclasses import dataclass, field
from typing import Dict, Tuple, List, Optional
from config import SystemConfig, DEFAULT_CONFIG

@dataclass
class MaterialProperties:
    name: str = "Ni-Al Bronze"
    ultimate_tensile_strength: float = 650e6
    yield_strength: float = 350e6
    fatigue_strength_coefficient: float = 800e6
    fatigue_strength_exponent: float = -0.12
    fatigue_ductility_coefficient: float = 0.35
    fatigue_ductility_exponent: float = -0.55
    hardness: float = 250.0
    elastic_modulus: float = 120e9
    poissons_ratio: float = 0.34
    density: float = 7600.0
    erosion_resistance_factor: float = 1.0

MATERIAL_DATABASE = {
    'ni_al_bronze': MaterialProperties(
        name="Ni-Al Bronze",
        ultimate_tensile_strength=650e6,
        yield_strength=350e6,
        fatigue_strength_coefficient=800e6,
        fatigue_strength_exponent=-0.12,
        hardness=250.0,
        erosion_resistance_factor=1.0
    ),
    'stainless_steel_316': MaterialProperties(
        name="316 Stainless Steel",
        ultimate_tensile_strength=550e6,
        yield_strength=250e6,
        fatigue_strength_coefficient=700e6,
        fatigue_strength_exponent=-0.13,
        hardness=180.0,
        erosion_resistance_factor=0.85
    ),
    'duplex_stainless': MaterialProperties(
        name="Duplex Stainless Steel",
        ultimate_tensile_strength=800e6,
        yield_strength=550e6,
        fatigue_strength_coefficient=1000e6,
        fatigue_strength_exponent=-0.10,
        hardness=280.0,
        erosion_resistance_factor=1.3
    ),
    'titanium_alloy': MaterialProperties(
        name="Ti-6Al-4V",
        ultimate_tensile_strength=950e6,
        yield_strength=880e6,
        fatigue_strength_coefficient=1200e6,
        fatigue_strength_exponent=-0.08,
        hardness=320.0,
        erosion_resistance_factor=1.5
    )
}

class BubbleDynamics:
    def __init__(self):
        self.rho_water = 1025.0
        self.p_vapor = 2339.0
        self.surface_tension = 0.073
        self.viscosity = 1.0e-3
        self.gamma = 1.4
        self.c_sound = 1500.0
    
    def compute_bubble_collapse_pressure(self, bubble_radius: float, ambient_pressure: float) -> float:
        p_infinity = ambient_pressure
        p_collapse = p_infinity * (bubble_radius / (0.1 * bubble_radius)) ** (3 * self.gamma)
        p_collapse = min(p_collapse, 5e9)
        return p_collapse
    
    def compute_bubble_lifetime(self, initial_radius: float, ambient_pressure: float) -> float:
        p_infinity = ambient_pressure
        lifetime = 0.915 * initial_radius * np.sqrt(self.rho_water / (p_infinity - self.p_vapor))
        return lifetime
    
    def compute_impact_pressure(self, bubble_radius: float, ambient_pressure: float, 
                                 standoff_distance: float = 0.0) -> float:
        if standoff_distance <= 0:
            standoff_distance = 0.5 * bubble_radius
        
        p_collapse = self.compute_bubble_collapse_pressure(bubble_radius, ambient_pressure)
        
        jet_velocity = np.sqrt(2 * (p_collapse - ambient_pressure) / self.rho_water)
        jet_velocity = min(jet_velocity, 200)
        
        impact_pressure = 0.5 * self.rho_water * jet_velocity ** 2
        
        attenuation = np.exp(-standoff_distance / bubble_radius)
        impact_pressure *= attenuation
        
        return impact_pressure
    
    def compute_bubble_size_distribution(self, cavitation_intensity: float) -> Tuple[np.ndarray, np.ndarray]:
        mean_radius = 50e-6 * (1 + cavitation_intensity)
        std_radius = 20e-6
        
        radii = np.linspace(1e-6, 200e-6, 50)
        distribution = np.exp(-(radii - mean_radius) ** 2 / (2 * std_radius ** 2))
        distribution /= np.sum(distribution)
        
        return radii, distribution

class ShockWaveSpectrum:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.bubble_dynamics = BubbleDynamics()
        self.sample_rate = config.hydrophone.sample_rate
    
    def compute_impact_energy_spectrum(self, noise_spectrum: np.ndarray, 
                                        freqs: np.ndarray,
                                        cavitation_intensity: float,
                                        sigma_ratio: float) -> Dict[str, np.ndarray]:
        bubble_radii, size_dist = self.bubble_dynamics.compute_bubble_size_distribution(cavitation_intensity)
        
        ambient_pressure = 101325 + 1025 * 9.81 * self.config.conditions.water_depth
        
        impact_energies = []
        for r, prob in zip(bubble_radii, size_dist):
            p_impact = self.bubble_dynamics.compute_impact_pressure(r, ambient_pressure)
            energy = p_impact ** 2 / (2 * self.bubble_dynamics.rho_water * self.bubble_dynamics.c_sound)
            impact_energies.append(energy * prob)
        
        total_impact_energy = np.sum(impact_energies)
        
        freq_weights = self._compute_frequency_weighting(freqs, sigma_ratio)
        
        energy_spectrum = noise_spectrum * freq_weights[:, np.newaxis] * total_impact_energy
        
        return {
            'frequencies': freqs,
            'energy_spectrum': energy_spectrum,
            'total_impact_energy': total_impact_energy,
            'bubble_radii': bubble_radii,
            'size_distribution': size_dist,
            'impact_pressures': np.array([self.bubble_dynamics.compute_impact_pressure(
                r, ambient_pressure) for r in bubble_radii])
        }
    
    def _compute_frequency_weighting(self, freqs: np.ndarray, sigma_ratio: float) -> np.ndarray:
        peak_freq = 30000 * (1 + 0.5 * (1 - sigma_ratio))
        
        weights = np.exp(-(freqs - peak_freq) ** 2 / (2 * (15000) ** 2))
        
        highpass = 1 / (1 + np.exp(-(freqs - 5000) / 1000))
        weights *= highpass
        
        return weights
    
    def compute_peak_impact_load(self, energy_spectrum: np.ndarray) -> float:
        return np.max(energy_spectrum)
    
    def compute_cumulative_energy(self, energy_spectrum: np.ndarray, freqs: np.ndarray) -> float:
        return np.trapz(energy_spectrum, freqs, axis=0)

class FatigueAnalyzer:
    def __init__(self, material: MaterialProperties = None):
        self.material = material or MATERIAL_DATABASE['ni_al_bronze']
    
    def compute_stress_life_curve(self, cycles: np.ndarray) -> np.ndarray:
        sigma_f = self.material.fatigue_strength_coefficient
        b = self.material.fatigue_strength_exponent
        epsilon_f = self.material.fatigue_ductility_coefficient
        c = self.material.fatigue_ductility_exponent
        E = self.material.elastic_modulus
        
        stress_amplitude = sigma_f * (2 * cycles) ** b
        
        return stress_amplitude
    
    def compute_damage_per_cycle(self, stress_amplitude: float) -> float:
        sigma_f = self.material.fatigue_strength_coefficient
        b = self.material.fatigue_strength_exponent
        
        if stress_amplitude <= 0:
            return 0.0
        
        if stress_amplitude > sigma_f:
            return 1.0
        
        cycles_to_failure = 0.5 * (stress_amplitude / sigma_f) ** (1 / b)
        damage = 1.0 / max(cycles_to_failure, 1)
        
        return damage
    
    def compute_palmgren_miner_damage(self, stress_spectrum: np.ndarray, cycles: np.ndarray) -> float:
        total_damage = 0.0
        
        for stress, n_cycles in zip(stress_spectrum, cycles):
            if stress > 0:
                damage_per_cycle = self.compute_damage_per_cycle(stress)
                total_damage += n_cycles * damage_per_cycle
        
        return total_damage

class ErosionPredictor:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG, 
                 material: MaterialProperties = None):
        self.config = config
        self.material = material or MATERIAL_DATABASE['ni_al_bronze']
        self.shock_spectrum = ShockWaveSpectrum(config)
        self.fatigue_analyzer = FatigueAnalyzer(self.material)
        self.bubble_dynamics = BubbleDynamics()
    
    def predict_erosion_rate(self, noise_spectrum: np.ndarray, 
                             freqs: np.ndarray,
                             cavitation_intensity: float,
                             sigma_ratio: float,
                             operational_hours_per_day: float = 24.0) -> Dict:
        spectrum_result = self.shock_spectrum.compute_impact_energy_spectrum(
            noise_spectrum, freqs, cavitation_intensity, sigma_ratio
        )
        
        impact_pressures = spectrum_result['impact_pressures']
        size_dist = spectrum_result['size_distribution']
        
        stresses = impact_pressures * 0.3
        stress_range = 2 * stresses
        
        damages = np.array([self.fatigue_analyzer.compute_damage_per_cycle(s) for s in stress_range])
        
        bubble_frequency = self._estimate_bubble_collapse_frequency(cavitation_intensity)
        
        cycles_per_year = bubble_frequency * operational_hours_per_day * 365 * 3600
        
        total_damage_per_year = np.sum(damages * size_dist * cycles_per_year)
        
        erosion_depth = self._damage_to_depth(total_damage_per_year, cavitation_intensity)
        
        material_loss = self._compute_material_loss(erosion_depth)
        
        remaining_life = self._estimate_remaining_life(total_damage_per_year)
        
        return {
            'annual_erosion_depth_mm': erosion_depth,
            'annual_material_loss_kg': material_loss,
            'total_damage_per_year': total_damage_per_year,
            'bubble_collapse_frequency': bubble_frequency,
            'cycles_per_year': cycles_per_year,
            'remaining_life_years': remaining_life,
            'impact_energy_spectrum': spectrum_result,
            'material_properties': {
                'name': self.material.name,
                'hardness': self.material.hardness,
                'uts': self.material.ultimate_tensile_strength / 1e6,
                'erosion_resistance': self.material.erosion_resistance_factor
            },
            'confidence_interval': self._compute_confidence_interval(erosion_depth)
        }
    
    def _estimate_bubble_collapse_frequency(self, cavitation_intensity: float) -> float:
        base_frequency = 100.0
        frequency = base_frequency * (1 + 10 * cavitation_intensity)
        return frequency
    
    def _damage_to_depth(self, total_damage: float, cavitation_intensity: float) -> float:
        hardness_factor = 250.0 / self.material.hardness
        intensity_factor = 0.1 + 0.9 * cavitation_intensity
        material_factor = 1.0 / self.material.erosion_resistance_factor
        
        depth_per_damage = 1.0 * hardness_factor * intensity_factor * material_factor
        
        erosion_depth = total_damage * depth_per_damage
        
        erosion_depth = min(erosion_depth, 5.0)
        
        return erosion_depth
    
    def _compute_material_loss(self, erosion_depth_mm: float) -> float:
        propeller_area = np.pi * (self.config.propeller.diameter / 2) ** 2
        propeller_area *= self.config.propeller.blade_area_ratio * self.config.propeller.num_blades
        
        volume_loss = propeller_area * (erosion_depth_mm / 1000) * 0.1
        mass_loss = volume_loss * self.material.density
        
        return mass_loss
    
    def _estimate_remaining_life(self, damage_per_year: float) -> float:
        critical_damage = 0.5
        if damage_per_year <= 0:
            return 50.0
        
        remaining = critical_damage / damage_per_year
        remaining = min(remaining, 30.0)
        
        return remaining
    
    def _compute_confidence_interval(self, erosion_depth: float) -> Tuple[float, float]:
        uncertainty = 0.3
        lower = erosion_depth * (1 - uncertainty)
        upper = erosion_depth * (1 + uncertainty)
        return (lower, upper)
    
    def generate_erosion_report(self, prediction: Dict) -> List[str]:
        report = []
        
        depth = prediction['annual_erosion_depth_mm']
        confidence = prediction['confidence_interval']
        
        report.append("=" * 60)
        report.append("空化侵蚀预测报告")
        report.append("=" * 60)
        report.append("")
        
        report.append(f"材料: {prediction['material_properties']['name']}")
        report.append(f"硬度: {prediction['material_properties']['hardness']} HB")
        report.append(f"抗拉强度: {prediction['material_properties']['uts']:.0f} MPa")
        report.append("")
        
        report.append("侵蚀预测结果:")
        report.append(f"  年侵蚀深度: {depth:.4f} mm/year")
        report.append(f"  置信区间: {confidence[0]:.4f} - {confidence[1]:.4f} mm/year")
        report.append(f"  年材料损失: {prediction['annual_material_loss_kg']:.2f} kg")
        report.append(f"  预估剩余寿命: {prediction['remaining_life_years']:.1f} 年")
        report.append("")
        
        if depth < 0.01:
            severity = "轻微"
            recommendation = "正常监测"
        elif depth < 0.05:
            severity = "轻度"
            recommendation = "增加监测频率"
        elif depth < 0.2:
            severity = "中度"
            recommendation = "考虑调整工况或修复"
        else:
            severity = "严重"
            recommendation = "立即采取措施，准备维修"
        
        report.append(f"侵蚀等级: {severity}")
        report.append(f"建议: {recommendation}")
        report.append("")
        
        report.append("气泡溃灭特性:")
        report.append(f"  气泡溃灭频率: {prediction['bubble_collapse_frequency']:.0f} Hz")
        report.append(f"  年冲击循环数: {prediction['cycles_per_year']:.2e}")
        report.append(f"  年累计损伤: {prediction['total_damage_per_year']:.4e}")
        
        return report

class ComparativeAnalysis:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.predictors = {}
        
        for mat_name, mat_props in MATERIAL_DATABASE.items():
            self.predictors[mat_name] = ErosionPredictor(config, mat_props)
    
    def compare_materials(self, noise_spectrum: np.ndarray, freqs: np.ndarray,
                           cavitation_intensity: float, sigma_ratio: float) -> Dict:
        results = {}
        
        for mat_name, predictor in self.predictors.items():
            prediction = predictor.predict_erosion_rate(
                noise_spectrum, freqs, cavitation_intensity, sigma_ratio
            )
            results[mat_name] = {
                'erosion_rate_mm_year': prediction['annual_erosion_depth_mm'],
                'material_loss_kg_year': prediction['annual_material_loss_kg'],
                'remaining_life_years': prediction['remaining_life_years'],
                'relative_performance': 1.0 / prediction['annual_erosion_depth_mm'] if prediction['annual_erosion_depth_mm'] > 0 else float('inf')
            }
        
        baseline = results.get('ni_al_bronze', {}).get('erosion_rate_mm_year', 1.0)
        for mat_name in results:
            results[mat_name]['improvement_ratio'] = baseline / results[mat_name]['erosion_rate_mm_year'] if results[mat_name]['erosion_rate_mm_year'] > 0 else 0
        
        return results
    
    def recommend_material(self, comparison_results: Dict) -> str:
        best_mat = None
        best_score = 0
        
        for mat_name, result in comparison_results.items():
            score = result['improvement_ratio'] * 0.6 + (result['remaining_life_years'] / 30) * 0.4
            if score > best_score:
                best_score = score
                best_mat = mat_name
        
        return best_mat or 'ni_al_bronze'
