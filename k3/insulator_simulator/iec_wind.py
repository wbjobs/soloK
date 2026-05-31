"""
IEC 60826 风荷载计算模块

参考标准: IEC 60826:2017 - Overhead electrical lines exceeding AC 1 kV
实现内容:
  - 基本风压计算
  - 阵风响应因子 (Gust Response Factor)
  - 导线/绝缘子串风荷载
"""

import numpy as np

AIR_DENSITY = 1.225
DESIGN_WIND_SPEED = 30.0


class IECWindLoad:
    """IEC 60826 风荷载计算"""

    TERRAIN_PARAMS = {
        "A": {"z0": 0.0002, "alpha_r": 0.12, "k_r": 1.28},
        "B": {"z0": 0.005, "alpha_r": 0.16, "k_r": 1.00},
        "C": {"z0": 0.03, "alpha_r": 0.22, "k_r": 0.72},
        "D": {"z0": 0.30, "alpha_r": 0.30, "k_r": 0.48},
    }

    def __init__(self, terrain_category: str = "B", structure_height: float = 20.0):
        if terrain_category not in self.TERRAIN_PARAMS:
            raise ValueError(f"无效地形类别: {terrain_category}, 可选 A/B/C/D")
        self.terrain = terrain_category
        self.h = structure_height
        params = self.TERRAIN_PARAMS[terrain_category]
        self.z0 = params["z0"]
        self.alpha_r = params["alpha_r"]
        self.k_r = params["k_r"]

    def basic_wind_pressure(self, v: float) -> float:
        """基本风压 q0 = 0.613 * V^2 (N/m^2)"""
        return 0.613 * v * v

    def wind_pressure_at_height(self, v: float) -> float:
        """高度 h 处的风压: q(z) = q0 * k_r * (z/z_r)^(2*alpha_r)
        参考高度 z_r = 10m
        """
        q0 = self.basic_wind_pressure(v)
        z_r = 10.0
        if self.h <= z_r:
            return q0
        height_factor = (self.h / z_r) ** (2 * self.alpha_r)
        return q0 * self.k_r * height_factor

    def gust_response_factor(self, natural_freq: float = 2.0,
                              span_length: float = 300.0) -> float:
        """阵风响应因子 G

        基于 IEC 60826 简化模型:
        G = 1 + 2 * g * I_v * sqrt(B * (1 + R))

        参数:
            g: 峰值因子 ≈ 3.5
            I_v: 湍流强度, 随高度变化
            B: 跨度折减因子 (空间相关)
            R: 共振因子, 考虑结构动力响应
        """
        g = 3.5
        I_v = 0.18 * (10.0 / max(self.h, 1.0)) ** 0.12
        I_v = min(I_v, 0.25)

        L_x = 100.0
        B = 1.0 / (1.0 + 0.2 * span_length / L_x)

        if natural_freq > 0.5:
            damping = 0.02
            fL_v = 2.0 * np.pi * natural_freq * span_length / DESIGN_WIND_SPEED
            R = 1.0 / (2.0 * np.pi * natural_freq * damping)
            R = R / (1.0 + fL_v ** 2)
        else:
            R = 0.0

        G = 1.0 + 2.0 * g * I_v * np.sqrt(B * (1.0 + R))
        G = max(G, 1.05)
        G = min(G, 2.8)
        return G

    def conductor_wind_load(self, v: float, wind_angle_deg: float,
                            conductor_diameter: float, span_length: float,
                            natural_freq: float = 1.0) -> dict:
        """导线风荷载
        Fw = q(z) * Cd * d * L * G * sin(theta)^2

        参数:
            v: 风速 (m/s)
            wind_angle_deg: 风向与导线轴向夹角 (度)
            conductor_diameter: 导线外径 (m)
            span_length: 档距 (m)
            natural_freq: 导线自振频率 (Hz)

        返回:
            dict: 各项风荷载分量
        """
        angle_rad = np.radians(wind_angle_deg)
        q = self.wind_pressure_at_height(v)
        Cd = 1.0
        G = self.gust_response_factor(natural_freq, span_length)
        Fw_per_unit = q * Cd * conductor_diameter * G
        Fw_total = Fw_per_unit * span_length * np.sin(angle_rad) ** 2

        return {
            "wind_pressure_n_m2": q,
            "gust_factor": G,
            "drag_coefficient": Cd,
            "wind_load_per_unit_n_m": Fw_per_unit,
            "wind_load_total_n": Fw_total,
            "wind_angle_rad": angle_rad,
        }

    def insulator_wind_load(self, v: float, wind_angle_deg: float,
                            string_length: float,
                            insulator_diameter: float = 0.05,
                            ring_diameter: float = 0.3,
                            natural_freq: float = 2.0) -> dict:
        """绝缘子串风荷载
        包括: 绝缘子本体 + 均压环
        """
        angle_rad = np.radians(wind_angle_deg)
        q = self.wind_pressure_at_height(v)
        G = self.gust_response_factor(natural_freq, string_length)

        F_ins = q * 1.2 * insulator_diameter * string_length * G * np.sin(angle_rad) ** 2
        F_ring = q * 1.2 * ring_diameter * 0.02 * G * np.sin(angle_rad) ** 2
        F_total = F_ins + F_ring

        return {
            "wind_pressure_n_m2": q,
            "gust_factor": G,
            "insulator_load_n": F_ins,
            "ring_load_n": F_ring,
            "total_load_n": F_total,
            "wind_angle_rad": angle_rad,
        }
