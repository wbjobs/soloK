import numpy as np
from scipy import constants
import math
from typing import List, Tuple


def calculate_antenna_pattern(angle: float, diameter: float, frequency: float) -> float:
    wavelength = constants.c / (frequency * 1e9)
    d_over_lambda = diameter / wavelength

    angle_rad = np.radians(abs(angle))

    if angle_rad == 0:
        return 0.0

    u = math.pi * d_over_lambda * math.sin(angle_rad)

    if u == 0:
        j1_over_u = 0.5
    else:
        j1_over_u = math.sin(u) / (u ** 2) - math.cos(u) / u

    normalized_gain = abs(2 * j1_over_u)

    if normalized_gain > 0:
        gain_db = 20 * np.log10(normalized_gain)
    else:
        gain_db = -100.0

    max_gain = 20 * np.log10(d_over_lambda) + 20 * np.log10(math.pi) + 10 * np.log10(0.6)

    if gain_db < -30:
        if angle < 1:
            gain_db = -30
        elif angle < 10:
            gain_db = 32 - 25 * np.log10(angle)
        else:
            gain_db = 10 - 10 * np.log10(angle)

    return float(gain_db)


def calculate_sidelobe_gain(separation_angle: float, diameter: float, frequency: float) -> float:
    wavelength = constants.c / (frequency * 1e9)
    d_over_lambda = diameter / wavelength
    angle = abs(separation_angle)

    if angle == 0:
        return 0.0

    if angle < (1 / d_over_lambda):
        gain = 2 - 3 * (angle * d_over_lambda) ** 2
    elif angle < (100 / d_over_lambda):
        gain = 29 - 25 * np.log10(angle)
    elif angle < 20:
        gain = 32 - 25 * np.log10(angle)
    elif angle < 40:
        gain = -2
    else:
        gain = -10

    return float(gain)


def calculate_co_channel_interference(interferer_eirp: float, separation_angle: float,
                                      victim_gt: float, victim_bandwidth: float,
                                      antenna_diameter: float, frequency: float) -> float:
    sidelobe_gain = calculate_sidelobe_gain(separation_angle, antenna_diameter, frequency)

    path_loss = 20 * np.log10(4 * np.pi * 35786000 * frequency * 1e9 / constants.c)

    interference_power = interferer_eirp + sidelobe_gain - path_loss + victim_gt

    k_dbm = 10 * np.log10(constants.k * 1000)
    noise_power = k_dbm + 10 * np.log10(290) + 10 * np.log10(victim_bandwidth * 1e6)

    in_ratio = interference_power - noise_power

    return float(in_ratio)


def calculate_adjacent_satellite_interference(interferer_eirp: float, separation_angle: float,
                                              victim_gt: float, victim_bandwidth: float,
                                              antenna_diameter: float, frequency: float,
                                              overlap_factor: float = 0.5) -> float:
    base_interference = calculate_co_channel_interference(
        interferer_eirp, separation_angle, victim_gt,
        victim_bandwidth, antenna_diameter, frequency
    )

    overlap_loss = 10 * np.log10(overlap_factor)
    interference = base_interference + overlap_loss

    return float(interference)


def calculate_intermodulation_interference(eirp: float, gt: float, bandwidth: float,
                                           frequency: float, order: int = 3) -> float:
    im_factors = {
        3: 25,
        5: 35,
        7: 45
    }
    im_suppression = im_factors.get(order, 25)

    im_power = eirp - im_suppression

    path_loss = 20 * np.log10(4 * np.pi * 35786000 * frequency * 1e9 / constants.c)

    interference = im_power - path_loss + gt

    k_dbm = 10 * np.log10(constants.k * 1000)
    noise_power = k_dbm + 10 * np.log10(290) + 10 * np.log10(bandwidth * 1e6)

    in_ratio = interference - noise_power

    return float(in_ratio)


def itu_s1323_correction(in_ratio: float, bandwidth_ratio: float,
                         polarization_discrimination: float = 3.0) -> float:
    bandwidth_correction = 10 * np.log10(bandwidth_ratio) if bandwidth_ratio < 1 else 0
    corrected_in = in_ratio + bandwidth_correction - polarization_discrimination
    return float(corrected_in)


def compute_interference(victim_freq: float, victim_eirp: float,
                         victim_bandwidth: float, victim_gt: float,
                         interferer_count: int, interferer_eirp: List[float],
                         interferer_separation: List[float], interferer_type: List[str],
                         antenna_diameter: float, frequency: float) -> dict:
    COORDINATION_THRESHOLD = -10.0

    total_interference_linear = 0.0

    for i in range(interferer_count):
        if interferer_type[i] == "co_channel":
            in_ratio = calculate_co_channel_interference(
                interferer_eirp[i], interferer_separation[i],
                victim_gt, victim_bandwidth,
                antenna_diameter, frequency
            )
        elif interferer_type[i] == "adjacent_satellite":
            in_ratio = calculate_adjacent_satellite_interference(
                interferer_eirp[i], interferer_separation[i],
                victim_gt, victim_bandwidth,
                antenna_diameter, frequency
            )
        elif interferer_type[i] == "intermodulation":
            in_ratio = calculate_intermodulation_interference(
                interferer_eirp[i], victim_gt,
                victim_bandwidth, frequency
            )
        else:
            in_ratio = -100.0

        in_corrected = itu_s1323_correction(in_ratio, 0.8)
        total_interference_linear += 10 ** (in_corrected / 10)

    total_in_ratio = 10 * np.log10(total_interference_linear) if total_interference_linear > 0 else -100.0

    cn_ratio = 15.0
    ci_ratio = cn_ratio - total_in_ratio

    interference_margin = COORDINATION_THRESHOLD - total_in_ratio
    meets_threshold = total_in_ratio <= COORDINATION_THRESHOLD

    return {
        "in_ratio": round(float(total_in_ratio), 2),
        "ci_ratio": round(float(ci_ratio), 2),
        "interference_margin": round(float(interference_margin), 2),
        "meets_threshold": meets_threshold,
        "total_interference": round(float(total_interference_linear), 4),
        "coordination_threshold": COORDINATION_THRESHOLD
    }
