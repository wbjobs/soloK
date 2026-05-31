"""
煤堆自燃温度场演化模拟模块
基于传热-氧气消耗-反应动力学耦合方程，采用有限差分法求解
"""
import numpy as np
from typing import Dict, Tuple, Optional, List
from dataclasses import dataclass, field


@dataclass
class PileProperties:
    """煤堆物理性质参数"""
    density: float = 1300.0
    specific_heat: float = 1200.0
    thermal_conductivity: float = 0.25
    porosity: float = 0.35
    oxygen_diffusion_coeff: float = 1.5e-5
    activation_energy: float = 80.0
    pre_exponential_factor: float = 1.0e6
    reaction_heat: float = 2.5e7
    oxygen_consumption_ratio: float = 1.0
    bulk_density: float = 800.0


@dataclass
class BoundaryConditions:
    """边界条件"""
    ambient_temperature: float = 25.0
    surface_heat_transfer_coeff: float = 15.0
    ambient_oxygen_concentration: float = 0.21
    bottom_temperature: Optional[float] = None


@dataclass
class SimulationResult:
    """模拟结果"""
    time_points: np.ndarray
    temperature_profiles: np.ndarray
    oxygen_profiles: np.ndarray
    max_temperatures: np.ndarray
    critical_height: Optional[float] = None
    is_thermal_runaway: bool = False


class CoalPileSimulator:
    """
    煤堆自燃温度场演化模拟器
    
    控制方程：
    1. 能量方程：ρc_p ∂T/∂t = ∇·(k∇T) + Qρ_r A exp(-E/RT) C_O2
    2. 氧气输运方程：ε ∂C_O2/∂t = ∇·(D_eff ∇C_O2) - R_O2 ρ_r A exp(-E/RT) C_O2
    
    边界条件：
    - 顶部：对流换热 + 定氧浓度
    - 底部：绝热或定温
    - 侧面：对称（零梯度）
    
    采用一维有限差分法求解（沿高度方向）
    """
    
    R = 8.314
    
    def __init__(self, height: float, nx: int = 50,
                 properties: PileProperties = None,
                 boundary: BoundaryConditions = None):
        self.height = height
        self.nx = nx
        self.dx = height / (nx - 1)
        self.x = np.linspace(0, height, nx)
        
        self.props = properties or PileProperties()
        self.boundary = boundary or BoundaryConditions()
        
        self.T = np.ones(nx) * self.boundary.ambient_temperature + 273.15
        self.C = np.ones(nx) * self.boundary.ambient_oxygen_concentration
        
        self.history_T = []
        self.history_C = []
        self.history_time = []
    
    def reaction_rate(self, T: float, C: float) -> float:
        """计算反应速率（Arrhenius方程）"""
        return self.props.pre_exponential_factor * np.exp(
            -self.props.activation_energy * 1000 / (self.R * T)
        ) * C
    
    def step(self, dt: float) -> Tuple[float, float]:
        """
        执行一个时间步长的模拟
        
        返回：(最大温升速率, 最大温度)
        """
        T_old = self.T.copy()
        C_old = self.C.copy()
        
        alpha = self.props.thermal_conductivity / (self.props.density * self.props.specific_heat)
        dt_stable = 0.4 * self.dx**2 / alpha
        dt_effective = min(dt, dt_stable)
        n_substeps = int(np.ceil(dt / dt_effective))
        dt_sub = dt / n_substeps
        
        for _ in range(n_substeps):
            T_new = self.T.copy()
            C_new = self.C.copy()
            
            for i in range(1, self.nx - 1):
                T_k = self.T[i]
                
                heat_gen = (self.props.reaction_heat * self.props.bulk_density * 
                           self.reaction_rate(T_k, self.C[i]))
                
                T_new[i] = self.T[i] + dt_sub * (
                    alpha * (self.T[i+1] - 2*self.T[i] + self.T[i-1]) / self.dx**2 +
                    heat_gen / (self.props.density * self.props.specific_heat)
                )
                
                oxygen_consume = (self.props.oxygen_consumption_ratio * 
                                 self.props.bulk_density * 
                                 self.reaction_rate(T_k, self.C[i]))
                
                D_eff = self.props.oxygen_diffusion_coeff * self.props.porosity
                
                C_new[i] = self.C[i] + dt_sub * (
                    D_eff * (self.C[i+1] - 2*self.C[i] + self.C[i-1]) / self.dx**2 -
                    oxygen_consume / self.props.porosity
                )
            
            T_new[0] = T_new[1]
            if self.boundary.bottom_temperature is not None:
                T_new[0] = self.boundary.bottom_temperature + 273.15
            
            h = self.boundary.surface_heat_transfer_coeff
            k = self.props.thermal_conductivity
            T_amb = self.boundary.ambient_temperature + 273.15
            
            T_new[-1] = (k * T_new[-2] + h * self.dx * T_amb) / (k + h * self.dx)
            C_new[-1] = self.boundary.ambient_oxygen_concentration
            
            C_new[0] = C_new[1]
            C_new = np.clip(C_new, 0, self.boundary.ambient_oxygen_concentration)
            
            self.T = T_new
            self.C = C_new
        
        dT_dt = np.max(self.T - T_old) / dt
        max_T = np.max(self.T)
        
        return dT_dt, max_T
    
    def simulate(self, total_time: float, dt: float = 3600.0,
                 output_interval: float = 3600.0) -> SimulationResult:
        """
        执行完整模拟
        
        参数:
            total_time: 总模拟时间 (秒)
            dt: 时间步长 (秒)
            output_interval: 输出间隔 (秒)
        
        返回:
            SimulationResult对象
        """
        time_points = []
        temp_profiles = []
        oxygen_profiles = []
        max_temps = []
        
        t = 0.0
        next_output = 0.0
        
        max_temperature = self.boundary.ambient_temperature + 273.15
        is_runaway = False
        
        while t < total_time:
            dT_dt, current_max = self.step(dt)
            t += dt
            
            max_temperature = max(max_temperature, current_max)
            
            if t >= next_output:
                time_points.append(t)
                temp_profiles.append(self.T.copy())
                oxygen_profiles.append(self.C.copy())
                max_temps.append(current_max)
                next_output += output_interval
            
            if current_max > 500:
                is_runaway = True
                break
            
            if dT_dt < 1e-5 and t > 7 * 24 * 3600:
                break
        
        result = SimulationResult(
            time_points=np.array(time_points),
            temperature_profiles=np.array(temp_profiles),
            oxygen_profiles=np.array(oxygen_profiles),
            max_temperatures=np.array(max_temps),
            is_thermal_runaway=is_runaway
        )
        
        return result


def predict_critical_height(ambient_temp: float,
                            properties: PileProperties = None,
                            height_range: Tuple[float, float] = (1.0, 20.0),
                            max_iterations: int = 20) -> float:
    """
    预测自燃临界堆高（二分法）
    
    临界堆高定义：煤堆内部最高温度在7天内升高超过50°C的最小高度
    
    参数:
        ambient_temp: 环境温度 (°C)
        properties: 煤堆性质参数
        height_range: 搜索高度范围 (m)
        max_iterations: 最大迭代次数
    
    返回:
        临界堆高 (m)
    """
    properties = properties or PileProperties()
    boundary = BoundaryConditions(ambient_temperature=ambient_temp)
    
    def check_runaway(height: float) -> bool:
        simulator = CoalPileSimulator(height, nx=40, properties=properties, boundary=boundary)
        result = simulator.simulate(total_time=7 * 24 * 3600, dt=3600, output_interval=7200)
        max_T = np.max(result.max_temperatures)
        return (max_T - 273.15) > (ambient_temp + 50)
    
    h_low, h_high = height_range
    
    if not check_runaway(h_high):
        return h_high
    if check_runaway(h_low):
        return h_low
    
    for _ in range(max_iterations):
        h_mid = (h_low + h_high) / 2
        if check_runaway(h_mid):
            h_high = h_mid
        else:
            h_low = h_mid
        
        if h_high - h_low < 0.1:
            break
    
    return (h_low + h_high) / 2


@dataclass
class SimulationConfig:
    """模拟配置"""
    ambient_temperatures: List[float] = field(default_factory=lambda: [15, 25, 35, 45])
    heights: List[float] = field(default_factory=lambda: [3, 5, 8, 10, 15])
    simulation_days: int = 15


def batch_simulate_piles(config: SimulationConfig,
                        properties: PileProperties = None) -> Dict:
    """
    批量模拟不同条件下的煤堆自燃
    
    返回:
        包含各工况临界堆高和最大温度的字典
    """
    results = {}
    
    for temp in config.ambient_temperatures:
        crit_h = predict_critical_height(temp, properties)
        results[f'{temp}°C'] = {
            'critical_height': crit_h,
            'max_temperatures': {}
        }
        
        for h in config.heights:
            boundary = BoundaryConditions(ambient_temperature=temp)
            simulator = CoalPileSimulator(h, nx=40, properties=properties, boundary=boundary)
            sim_result = simulator.simulate(
                total_time=config.simulation_days * 24 * 3600,
                dt=3600,
                output_interval=86400
            )
            max_T = np.max(sim_result.max_temperatures) - 273.15
            results[f'{temp}°C']['max_temperatures'][f'{h}m'] = max_T
    
    return results
