"""
风偏角时程模拟模块

功能:
  - 基于 Kaimal 脉动风速时程计算实时风偏角
  - 峰值超限概率分析
  - 动态疲劳损伤评估 (雨流计数 + Miner 法则)
"""

import numpy as np
from .statics import InsulatorStatics
from .iec_wind import IECWindLoad

THRESHOLD_DEG = 45.0


class TimeSeriesSimulator:
    """风偏角时程模拟器"""

    def __init__(self, statics: InsulatorStatics, wind_loader: IECWindLoad):
        self.statics = statics
        self.wind_loader = wind_loader

    def simulate_deflection_series(self,
                                    wind_speed_series: list[float],
                                    wind_angle_deg: float = 90.0) -> dict:
        """
        给定时程风速计算风偏角时程

        参数:
            wind_speed_series: 风速时程数组 (m/s)
            wind_angle_deg: 风向角 (度), 假设不变

        返回:
            dict: 时程结果
        """
        speeds = np.array(wind_speed_series, dtype=np.float64)
        n = len(speeds)

        deflections = np.zeros(n)
        wind_forces = np.zeros(n)
        safe_flags = np.zeros(n, dtype=np.uint8)

        for i in range(n):
            v = float(speeds[i])
            ins_load = self.wind_loader.insulator_wind_load(
                v, wind_angle_deg, self.statics.L,
                self.statics.d_i, self.statics.d_r)
            cond_load = self.wind_loader.conductor_wind_load(
                v, wind_angle_deg, self.statics.d_c, self.statics.span)
            wind_data = {
                "insulator": ins_load,
                "conductor": cond_load,
            }
            r = self.statics.calculate(v, wind_angle_deg, wind_data)
            deflections[i] = r["deflection_angle_deg"]
            wind_forces[i] = r["wind_force_n"]
            safe_flags[i] = 1 if r["safe"] else 0

        return self._analyze_series(deflections, safe_flags, wind_forces)

    def _analyze_series(self, deflections: np.ndarray,
                         safe_flags: np.ndarray,
                         wind_forces: np.ndarray) -> dict:
        n = len(deflections)
        mean_deflection = float(np.mean(deflections))
        std_deflection = float(np.std(deflections))
        max_deflection = float(np.max(deflections))
        min_deflection = float(np.min(deflections))

        exceed_count = int(np.sum(safe_flags == 0))
        exceed_ratio = exceed_count / n if n > 0 else 0.0

        exceedance_levels = [25.0, 30.0, 35.0, 40.0, 45.0, 50.0, 55.0]
        exceedance_prob = {}
        for level in exceedance_levels:
            count = int(np.sum(deflections > level))
            exceedance_prob[str(level)] = {
                "count": count,
                "probability": float(count / n) if n > 0 else 0.0,
            }

        peak_threshold = mean_deflection + 3.0 * std_deflection
        peak_count = int(np.sum(deflections > peak_threshold))
        peak_prob = float(peak_count / n) if n > 0 else 0.0

        sorted_def = np.sort(deflections)
        percentiles = {}
        for p in [50, 90, 95, 99, 99.9]:
            idx = int(np.clip(p / 100.0 * n, 0, n - 1))
            percentiles[str(p)] = float(sorted_def[idx])

        zero_crossings = 0
        mean_val = mean_deflection
        for i in range(1, n):
            if (deflections[i - 1] - mean_val) * (deflections[i] - mean_val) < 0:
                zero_crossings += 1

        return {
            "deflection_deg": deflections.tolist(),
            "wind_force_n": wind_forces.tolist(),
            "safe_flags": safe_flags.tolist(),
            "statistics": {
                "mean_deg": mean_deflection,
                "std_deg": std_deflection,
                "max_deg": max_deflection,
                "min_deg": min_deflection,
                "range_deg": float(max_deflection - min_deflection),
                "exceed_count": exceed_count,
                "exceed_ratio": exceed_ratio,
                "peak_threshold_deg": float(peak_threshold),
                "peak_count": peak_count,
                "peak_probability": peak_prob,
                "zero_crossings": int(zero_crossings),
                "n_cycles_approx": int(zero_crossings / 2),
            },
            "exceedance_probability": exceedance_prob,
            "percentiles": percentiles,
            "threshold_deg": THRESHOLD_DEG,
        }


def rainflow_count(series: np.ndarray) -> list[dict]:
    """
    雨流计数法 (Rainflow Counting)

    简化实现: ASTME1049 标准四峰谷值法

    参数:
        series: 应力/风偏角时程数组

    返回:
        list[dict]: 每个循环的 {amplitude, mean, count}
    """
    data = series.tolist()

    if len(data) < 3:
        return []

    diffs = np.diff(data)
    extrema_idx = [0]
    for i in range(1, len(data) - 1):
        if diffs[i - 1] * diffs[i] < 0:
            extrema_idx.append(i)
    extrema_idx.append(len(data) - 1)

    extrema = [data[i] for i in extrema_idx]

    if len(extrema) < 4:
        return []

    cycles = []
    stack = []

    for val in extrema:
        stack.append(val)
        while len(stack) >= 4:
            s1, s2, s3, s4 = stack[-4], stack[-3], stack[-2], stack[-1]
            range1 = abs(s2 - s1)
            range2 = abs(s4 - s3)

            if range1 >= range2:
                amp = range2 / 2.0
                mean = (s2 + s3) / 2.0
                cycles.append({
                    "amplitude": float(amp),
                    "mean": float(mean),
                    "count": 1,
                })
                stack.pop(-3)
                stack.pop(-2)
            else:
                break

    merged = {}
    for c in cycles:
        key = (round(c["amplitude"], 4), round(c["mean"], 4))
        if key in merged:
            merged[key]["count"] += 1
        else:
            merged[key] = dict(c)

    result = sorted(
        merged.values(),
        key=lambda x: x["amplitude"],
        reverse=True,
    )
    return result


class FatigueAnalyzer:
    """
    绝缘子串动态疲劳损伤评估

    基于 Miner 线性累积损伤法则:
      D = Σ (n_i / N_i)

    其中:
      n_i: 第 i 级应力幅实际循环次数
      N_i: 第 i 级应力幅允许循环次数 (S-N 曲线)
    """

    DEFAULT_SN_CURVE = {
        "A": 1.0e8,
        "k": 5.0,
        "limit_stress_pa": 50e6,
    }

    def __init__(self, sn_params: dict | None = None):
        if sn_params is None:
            sn_params = self.DEFAULT_SN_CURVE
        self.A = sn_params.get("A", 1.0e8)
        self.k = sn_params.get("k", 5.0)
        self.limit_stress = sn_params.get("limit_stress_pa", 50e6)

    def allowable_cycles(self, stress_range_pa: float) -> float:
        """
        S-N 曲线: N = A / (Δσ)^k

        低于限值时返回 1e12 (无限寿命)
        """
        if stress_range_pa <= self.limit_stress:
            return 1.0e12
        N = self.A / (stress_range_pa ** self.k)
        return max(N, 1.0)

    def cumulative_damage(self, cycles: list[dict]) -> dict:
        """
        计算累积损伤

        参数:
            cycles: 雨流计数结果列表, 每项包含 amplitude, mean, count

        返回:
            dict: 损伤分析结果
        """
        if not cycles:
            return {
                "total_damage": 0.0,
                "n_cycles": 0,
                "n_levels": 0,
                "dominant_amplitude": 0.0,
                "damage_detail": [],
                "safety_ratio": 0.0,
                "fatigue_life_hours": float("inf"),
            }

        damage_detail = []
        total_damage = 0.0
        total_cycles = 0
        max_amp = 0.0
        dominant_contrib = 0.0

        for c in cycles:
            stress_range_pa = c["amplitude"] * 2.0
            n_i = c["count"]
            N_i = self.allowable_cycles(stress_range_pa)
            damage_i = n_i / N_i
            total_damage += damage_i
            total_cycles += n_i

            if c["amplitude"] > max_amp:
                max_amp = c["amplitude"]
                dominant_contrib = damage_i

            damage_detail.append({
                "amplitude_pa": float(c["amplitude"]),
                "mean_pa": float(c["mean"]),
                "stress_range_pa": float(stress_range_pa),
                "count": int(n_i),
                "allowable_cycles": float(N_i),
                "damage": float(damage_i),
            })

        safety_ratio = 1.0 / total_damage if total_damage > 0 else float("inf")

        return {
            "total_damage": float(total_damage),
            "n_cycles": int(total_cycles),
            "n_levels": len(cycles),
            "dominant_amplitude_pa": float(max_amp),
            "dominant_damage": float(dominant_contrib),
            "damage_detail": damage_detail,
            "safety_ratio": float(safety_ratio),
            "damage_standard": "D < 1.0 为安全",
        }

    def fatigue_from_deflection(self, deflection_series: list[float],
                                  arm_tension_n: float,
                                  stress_conversion: float = 1.0e6) -> dict:
        """
        直接从风偏角时程评估疲劳

        参数:
            deflection_series: 风偏角时程 (度)
            arm_tension_n: 参考张力 (N)
            stress_conversion: 张力-应力换算系数
        """
        stress_series = np.array(deflection_series) * stress_conversion / 1e3
        cycles = rainflow_count(stress_series)
        damage_result = self.cumulative_damage(cycles)

        if not cycles:
            cycles = []

        return {
            "stress_series_pa": stress_series.tolist(),
            "rainflow_cycles": cycles,
            "damage_analysis": damage_result,
        }


def estimate_fatigue_life(damage_result: dict,
                           simulation_duration_h: float = 0.167,
                           design_life_years: float = 30.0) -> dict:
    """
    估算疲劳寿命

    参数:
        damage_result: 损伤分析结果
        simulation_duration_h: 模拟时长 (小时), 10min = 0.167h
        design_life_years: 设计寿命 (年)
    """
    D = damage_result.get("total_damage", 0)
    if D <= 0:
        return {
            "damage_per_simulation": 0.0,
            "life_years": float("inf"),
            "design_life_safety": True,
        }

    hours_per_year = 8760.0
    damage_per_hour = D / max(simulation_duration_h, 1e-6)
    life_hours = 1.0 / damage_per_hour
    life_years = life_hours / hours_per_year

    design_life_hours = design_life_years * hours_per_year
    total_damage_design_life = damage_per_hour * design_life_hours
    safe = total_damage_design_life < 1.0

    return {
        "damage_per_simulation": float(D),
        "damage_per_hour": float(damage_per_hour),
        "life_years": float(life_years),
        "design_life_years": design_life_years,
        "total_damage_at_design_life": float(total_damage_design_life),
        "design_life_safety": safe,
    }
