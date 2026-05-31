import numpy as np
from scipy import constants
from typing import List, Dict, Any, Tuple
from itertools import product


def calculate_pair_interference(sat1_eirp: float, sat2_gt: float,
                                separation_angle: float,
                                antenna_diameter: float = 3.0,
                                frequency: float = 14.0) -> float:
    wavelength = constants.c / (frequency * 1e9)
    d_over_lambda = antenna_diameter / wavelength

    angle = abs(separation_angle)

    if angle < (1 / d_over_lambda):
        sidelobe_gain = 2 - 3 * (angle * d_over_lambda) ** 2
    elif angle < (100 / d_over_lambda):
        sidelobe_gain = 29 - 25 * np.log10(angle)
    elif angle < 20:
        sidelobe_gain = 32 - 25 * np.log10(angle)
    elif angle < 40:
        sidelobe_gain = -2
    else:
        sidelobe_gain = -10

    path_loss = 20 * np.log10(4 * np.pi * 35786000 * frequency * 1e9 / constants.c)

    interference_power = sat1_eirp + sidelobe_gain - path_loss + sat2_gt

    k_dbm = 10 * np.log10(constants.k * 1000)
    noise_power = k_dbm + 10 * np.log10(290) + 10 * np.log10(36e6)

    in_ratio = interference_power - noise_power

    return float(in_ratio)


def build_interference_matrix(satellite_count: int,
                              eirp_list: List[float],
                              gt_list: List[float],
                              separation_angles: List[List[float]]) -> List[List[float]]:
    interference_matrix = [[0.0 for _ in range(satellite_count)] for _ in range(satellite_count)]

    for i in range(satellite_count):
        for j in range(satellite_count):
            if i != j:
                interference_matrix[i][j] = calculate_pair_interference(
                    eirp_list[j], gt_list[i], separation_angles[i][j]
                )
            else:
                interference_matrix[i][j] = -float('inf')

    return interference_matrix


def calculate_total_interference(allocation: List[int],
                                 interference_matrix: List[List[float]],
                                 satellite_count: int) -> float:
    total_interference = 0.0

    for i in range(satellite_count):
        for j in range(satellite_count):
            if i != j and allocation[i] == allocation[j]:
                total_interference += 10 ** (interference_matrix[i][j] / 10)

    return 10 * np.log10(total_interference) if total_interference > 0 else -100.0


def check_bandwidth_availability(frequency_band: List[float],
                                 bandwidth_required: float,
                                 channel_index: int) -> bool:
    band_start, band_end = frequency_band
    total_bandwidth = (band_end - band_start) * 1000
    num_channels = int(total_bandwidth // bandwidth_required)

    return channel_index < num_channels


def find_optimal_allocation(satellite_count: int,
                            frequency_bands: List[List[float]],
                            bandwidth_required: float,
                            interference_matrix: List[List[float]],
                            max_attempts: int = 1000) -> Tuple[Dict[str, Any], float, bool]:
    max_channels = 10
    best_allocation = None
    best_total_interference = float('inf')

    channel_options = []
    for bands in frequency_bands:
        options = []
        for band_idx, band in enumerate(bands):
            band_start, band_end = band
            total_bw = (band_end - band_start) * 1000
            num_ch = int(total_bw // bandwidth_required)
            for ch in range(min(num_ch, 5)):
                options.append((band_idx, ch))
        channel_options.append(options if options else [(0, 0)])

    best_allocation_indices = []

    from itertools import product
    all_combinations = list(product(*channel_options))[:max_attempts]

    for combo in all_combinations:
        allocation = [f"{combo[i][0]}_{combo[i][1]}" for i in range(satellite_count)]

        total_interf = 0.0
        for i in range(satellite_count):
            for j in range(satellite_count):
                if i != j and allocation[i] == allocation[j]:
                    total_interf += 10 ** (interference_matrix[i][j] / 10)

        total_interf_db = 10 * np.log10(total_interf) if total_interf > 0 else -100.0

        if total_interf_db < best_total_interference:
            best_total_interference = total_interf_db
            best_allocation_indices = combo

    allocation_success = best_total_interference < -10.0

    result = {}
    for i in range(satellite_count):
        if i < len(best_allocation_indices):
            band_idx, ch_idx = best_allocation_indices[i]
            if band_idx < len(frequency_bands[i]):
                band_start, band_end = frequency_bands[i][band_idx]
                freq_start = band_start + (ch_idx * bandwidth_required) / 1000
                freq_end = freq_start + bandwidth_required / 1000

                result[f"satellite_{i}"] = {
                    "band_index": band_idx,
                    "channel_index": ch_idx,
                    "frequency_start": round(freq_start, 4),
                    "frequency_end": round(freq_end, 4),
                    "center_frequency": round((freq_start + freq_end) / 2, 4)
                }

    return result, best_total_interference, allocation_success


def coordinate_frequencies(satellite_count: int,
                           satellite_names: List[str],
                           frequency_bands: List[List[float]],
                           bandwidth_required: float,
                           eirp_list: List[float],
                           gt_list: List[float],
                           separation_angles: List[List[float]]) -> Dict[str, Any]:
    interference_matrix = build_interference_matrix(
        satellite_count, eirp_list, gt_list, separation_angles
    )

    optimal_allocation, total_interference, allocation_success = find_optimal_allocation(
        satellite_count, frequency_bands, bandwidth_required, interference_matrix
    )

    named_allocation = {}
    for i, name in enumerate(satellite_names):
        key = f"satellite_{i}"
        if key in optimal_allocation:
            named_allocation[name] = optimal_allocation[key]

    return {
        "interference_matrix": [[round(float(x), 2) for x in row] for row in interference_matrix],
        "optimal_allocation": named_allocation,
        "total_interference": round(float(total_interference), 2),
        "allocation_success": allocation_success
    }
