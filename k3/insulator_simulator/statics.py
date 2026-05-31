"""
绝缘子串刚体静力学模型

支持绝缘子串类型:
  - I 串 (单悬垂串)
  - V 串 (V 型串)
  - 双 V 串 (双 V 型串)

基于刚体静力学平衡计算风偏角
"""

import numpy as np
from scipy.optimize import fsolve

GRAVITY = 9.81
INSULATOR_MASS_PER_M = 2.5
CONDUCTOR_MASS_PER_M = 2.0


class InsulatorStatics:
    """绝缘子串刚体静力学模型"""

    STRING_TYPES = ["I", "V", "VV"]

    def __init__(self, string_type: str = "I",
                 string_length: float = 3.0,
                 v_angle_deg: float = 45.0,
                 conductor_tension: float = 30000.0,
                 span_length: float = 300.0,
                 conductor_diameter: float = 0.03,
                 insulator_diameter: float = 0.05,
                 ring_diameter: float = 0.3):
        if string_type not in self.STRING_TYPES:
            raise ValueError(f"无效串型: {string_type}, 可选 I/V/VV")
        self.string_type = string_type
        self.L = string_length
        self.v_angle_deg = v_angle_deg
        self.v_angle_rad = np.radians(v_angle_deg)
        self.T = conductor_tension
        self.span = span_length
        self.d_c = conductor_diameter
        self.d_i = insulator_diameter
        self.d_r = ring_diameter

    def _weights(self) -> dict:
        m_s = INSULATOR_MASS_PER_M * self.L
        m_c_per_span = CONDUCTOR_MASS_PER_M * self.span
        G_s = m_s * GRAVITY
        G_c_half = (m_c_per_span * GRAVITY) / 2.0
        return {
            "string_weight_n": G_s,
            "conductor_weight_n": G_c_half,
            "total_weight_n": G_s + G_c_half,
        }

    def _wind_force(self, wind_speed: float, wind_angle_deg: float,
                    wind_data: dict | None = None) -> dict:
        if wind_data is None:
            from .iec_wind import IECWindLoad
            iec = IECWindLoad()
            ins_load = iec.insulator_wind_load(
                wind_speed, wind_angle_deg,
                self.L, self.d_i, self.d_r)
            cond_load = iec.conductor_wind_load(
                wind_speed, wind_angle_deg,
                self.d_c, self.span)
            wind_data = {
                "insulator": ins_load,
                "conductor": cond_load,
            }
        F_w_s = wind_data["insulator"]["total_load_n"]
        F_w_c = wind_data["conductor"]["wind_load_total_n"]
        F_w_total = max(0.0, F_w_s + F_w_c)
        return {
            "string_wind_n": F_w_s,
            "conductor_wind_n": F_w_c,
            "total_wind_n": F_w_total,
            "wind_pressure_n_m2": wind_data["insulator"]["wind_pressure_n_m2"],
            "gust_factor": wind_data["insulator"]["gust_factor"],
        }

    def _deflection_i(self, F_w_total: float, W_total: float) -> float:
        if W_total <= 0:
            return 0.0
        F_w_safe = max(0.0, F_w_total)
        return float(np.arctan(F_w_safe / W_total))

    def _deflection_v(self, F_w_total: float, W_total: float) -> float:
        beta = self.v_angle_rad
        stiffness = W_total * np.tan(beta)
        if stiffness <= 0:
            return 0.0
        F_w_safe = max(0.0, F_w_total)
        theta = np.arctan(F_w_safe / stiffness)
        return float(theta)

    def _deflection_vv(self, F_w_total: float, W_total: float) -> float:
        beta = self.v_angle_rad
        stiffness = 2.0 * W_total * np.tan(beta)
        if stiffness <= 0:
            return 0.0
        F_w_safe = max(0.0, F_w_total)
        theta = np.arctan(F_w_safe / stiffness)
        return float(theta)

    def calculate(self, wind_speed: float, wind_angle_deg: float,
                   wind_data: dict | None = None) -> dict:
        weights = self._weights()
        wind = self._wind_force(wind_speed, wind_angle_deg, wind_data)
        F_w = wind["total_wind_n"]
        W_total = weights["total_weight_n"]
        G_s = weights["string_weight_n"]
        G_c = weights["conductor_weight_n"]

        if self.string_type == "I":
            theta_rad = self._deflection_i(F_w, W_total)
            arms = 1
        elif self.string_type == "V":
            theta_rad = self._deflection_v(F_w, W_total)
            arms = 2
        else:
            theta_rad = self._deflection_vv(F_w, W_total)
            arms = 4

        theta_rad = max(0.0, float(theta_rad))

        T_arm = (W_total * np.cos(theta_rad) + F_w * np.sin(theta_rad)) / arms
        T_arm = T_arm / max(np.cos(theta_rad), 1e-6)

        stress_pa = T_arm / (np.pi * (self.d_i / 2) ** 2)

        x_horizontal = self.L * np.sin(theta_rad)
        y_vertical = self.L * np.cos(theta_rad)

        safe = bool(theta_rad < np.radians(45.0))

        return {
            "string_type": self.string_type,
            "wind_speed_m_s": float(wind_speed),
            "wind_angle_deg": float(wind_angle_deg),
            "deflection_angle_rad": float(theta_rad),
            "deflection_angle_deg": float(np.degrees(theta_rad)),
            "wind_horizontal_m": float(x_horizontal),
            "string_vertical_m": float(y_vertical),
            "wind_force_n": float(F_w),
            "string_weight_n": float(G_s),
            "conductor_weight_n": float(G_c),
            "total_weight_n": float(W_total),
            "arm_tension_n": float(T_arm),
            "arm_stress_pa": float(stress_pa),
            "arms": arms,
            "safe": safe,
            "threshold_deg": 45.0,
            "wind_pressure_n_m2": float(wind["wind_pressure_n_m2"]),
            "gust_factor": float(wind["gust_factor"]),
        }

    def stress_distribution(self, result: dict) -> list[dict]:
        n_points = 50
        positions = np.linspace(0, self.L, n_points)
        stresses = []
        theta = result["deflection_angle_rad"]
        T_arm = result["arm_tension_n"]
        area = np.pi * (self.d_i / 2) ** 2

        for i, x in enumerate(positions):
            fraction_from_top = x / self.L
            local_weight = INSULATOR_MASS_PER_M * x * GRAVITY
            local_tension = T_arm * (1 - fraction_from_top * 0.5)
            local_stress = local_tension / area if area > 0 else 0
            stresses.append({
                "position_m": float(x),
                "tension_n": float(local_tension),
                "stress_pa": float(local_stress),
                "deflection_x_m": float(x * np.sin(theta)),
            })
        return stresses
