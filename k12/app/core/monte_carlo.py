import numpy as np
from scipy import constants
import math
from typing import List, Dict, Any


def calculate_antenna_gain(diameter: float, frequency: float,
                           pointing_error: float = 0.0) -> float:
    wavelength = constants.c / (frequency * 1e9)
    d_over_lambda = diameter / wavelength

    error_rad = np.radians(pointing_error)

    if error_rad == 0:
        normalized_gain = 1.0
    else:
        u = math.pi * d_over_lambda * math.sin(error_rad)
        if u == 0:
            j1_over_u = 0.5
        else:
            j1_over_u = math.sin(u) / (u ** 2) - math.cos(u) / u
        normalized_gain = abs(2 * j1_over_u)

    gain = 0.6 * (math.pi * d_over_lambda) ** 2 * normalized_gain ** 2

    return 10 * np.log10(gain) if gain > 0 else -100


def calculate_free_space_loss(frequency: float, path_length: float) -> float:
    freq_hz = frequency * 1e9
    loss = 20 * np.log10(4 * np.pi * path_length * 1000 * freq_hz / constants.c)
    return loss


def calculate_path_length(satellite_orbit: float, elevation_angle: float = 45.0) -> float:
    earth_radius = 6378.0
    r_sat = earth_radius + satellite_orbit

    el_rad = np.radians(elevation_angle)

    a = 1
    b = 2 * earth_radius * np.sin(el_rad)
    c = earth_radius ** 2 - r_sat ** 2

    discriminant = b ** 2 - 4 * a * c
    d = (-b + np.sqrt(discriminant)) / (2 * a)

    return float(d)


def calculate_rain_attenuation(frequency: float, elevation_angle: float,
                               rain_attenuation_mean: float,
                               rain_attenuation_std: float) -> float:
    el_rad = np.radians(elevation_angle)
    slant_factor = 1.0 / np.sin(el_rad) if np.sin(el_rad) > 0 else 2.0

    base_attenuation = np.random.lognormal(
        np.log(rain_attenuation_mean),
        rain_attenuation_std / rain_attenuation_mean
    )

    return float(base_attenuation * slant_factor)


def calculate_atmospheric_attenuation(frequency: float,
                                      mean: float, std: float) -> float:
    attenuation = np.random.normal(mean, std)
    return float(max(0, attenuation))


def run_single_simulation(uplink_frequency: float, downlink_frequency: float,
                          satellite_orbit: float, antenna_diameter: float,
                          transmit_power: float, bandwidth: float,
                          modulation: str,
                          atmospheric_attenuation_mean: float,
                          atmospheric_attenuation_std: float,
                          pointing_error_mean: float,
                          pointing_error_std: float,
                          rain_attenuation_mean: float,
                          rain_attenuation_std: float) -> float:
    pointing_error = abs(np.random.normal(pointing_error_mean, pointing_error_std))

    avg_frequency = (uplink_frequency + downlink_frequency) / 2

    antenna_gain = calculate_antenna_gain(antenna_diameter, avg_frequency, pointing_error)

    eirp = 10 * np.log10(transmit_power) + antenna_gain

    path_length = calculate_path_length(satellite_orbit, 45.0)

    free_space_loss = calculate_free_space_loss(avg_frequency, path_length)

    atm_attenuation = calculate_atmospheric_attenuation(
        avg_frequency, atmospheric_attenuation_mean, atmospheric_attenuation_std
    )

    rain_att = calculate_rain_attenuation(
        downlink_frequency, 45.0, rain_attenuation_mean, rain_attenuation_std
    )

    gt = antenna_gain - 10 * np.log10(290)

    boltzmann_constant = 10 * np.log10(constants.k)
    bandwidth_dbhz = 10 * np.log10(bandwidth * 1e6)

    cn_ratio = (eirp - free_space_loss - atm_attenuation - rain_att +
                gt - boltzmann_constant - bandwidth_dbhz)

    thresholds = {
        "BPSK": 9.5,
        "QPSK": 9.5,
        "8PSK": 13.0,
        "16QAM": 17.5,
        "32QAM": 20.5,
        "64QAM": 23.5
    }
    threshold = thresholds.get(modulation.upper(), 9.5)

    link_margin = cn_ratio - threshold

    return float(link_margin)


def run_batch_simulation(batch_size: int, **kwargs) -> np.ndarray:
    margins = np.empty(batch_size, dtype=np.float32)
    for i in range(batch_size):
        margins[i] = run_single_simulation(**kwargs)
    return margins


def run_monte_carlo_simulation(iterations: int,
                               uplink_frequency: float,
                               downlink_frequency: float,
                               satellite_orbit: float,
                               antenna_diameter: float,
                               transmit_power: float,
                               bandwidth: float,
                               modulation: str,
                               atmospheric_attenuation_mean: float,
                               atmospheric_attenuation_std: float,
                               pointing_error_mean: float,
                               pointing_error_std: float,
                               rain_attenuation_mean: float,
                               rain_attenuation_std: float,
                               required_margin: float,
                               batch_size: int = 1000) -> Dict[str, Any]:
    BATCH_SIZE = min(batch_size, iterations)

    n_batches = iterations // BATCH_SIZE
    remainder = iterations % BATCH_SIZE

    sum_margin = 0.0
    sum_sq_margin = 0.0
    total_count = 0

    hist_bins = 200
    hist_min = -100.0
    hist_max = 50.0
    histogram = np.zeros(hist_bins, dtype=np.int64)
    bin_edges = np.linspace(hist_min, hist_max, hist_bins + 1)

    kwargs = {
        'uplink_frequency': uplink_frequency,
        'downlink_frequency': downlink_frequency,
        'satellite_orbit': satellite_orbit,
        'antenna_diameter': antenna_diameter,
        'transmit_power': transmit_power,
        'bandwidth': bandwidth,
        'modulation': modulation,
        'atmospheric_attenuation_mean': atmospheric_attenuation_mean,
        'atmospheric_attenuation_std': atmospheric_attenuation_std,
        'pointing_error_mean': pointing_error_mean,
        'pointing_error_std': pointing_error_std,
        'rain_attenuation_mean': rain_attenuation_mean,
        'rain_attenuation_std': rain_attenuation_std
    }

    for batch_idx in range(n_batches + (1 if remainder > 0 else 0)):
        current_batch_size = BATCH_SIZE if batch_idx < n_batches else remainder
        if current_batch_size == 0:
            continue

        batch_margins = run_batch_simulation(current_batch_size, **kwargs)

        sum_margin += np.sum(batch_margins)
        sum_sq_margin += np.sum(batch_margins ** 2)
        total_count += current_batch_size

        batch_hist, _ = np.histogram(batch_margins, bins=bin_edges)
        histogram += batch_hist.astype(np.int64)

        del batch_margins

    mean_margin = sum_margin / total_count
    variance = (sum_sq_margin / total_count) - (mean_margin ** 2)
    std_margin = math.sqrt(max(0, variance))

    cdf = np.cumsum(histogram) / total_count

    availability_curve = []
    for percentile in range(1, 100):
        target = percentile / 100.0
        idx = np.searchsorted(cdf, target)
        if idx >= len(bin_edges) - 1:
            margin = bin_edges[-1]
        else:
            fraction = (target - cdf[idx - 1]) / (cdf[idx] - cdf[idx - 1]) if idx > 0 else 0
            margin = bin_edges[idx] + fraction * (bin_edges[idx + 1] - bin_edges[idx])
        availability_curve.append({
            "margin": round(float(margin), 2),
            "availability": round(target, 4)
        })

    p99_idx = np.searchsorted(cdf, 0.01)
    if p99_idx >= len(bin_edges) - 1:
        availability_99 = bin_edges[-1]
    else:
        availability_99 = bin_edges[p99_idx]

    p999_idx = np.searchsorted(cdf, 0.001)
    if p999_idx >= len(bin_edges) - 1:
        availability_999 = bin_edges[-1]
    else:
        availability_999 = bin_edges[p999_idx]

    del histogram, cdf, bin_edges

    return {
        "availability_curve": availability_curve,
        "mean_margin": round(float(mean_margin), 2),
        "std_margin": round(float(std_margin), 2),
        "availability_99": round(float(availability_99), 2),
        "availability_999": round(float(availability_999), 2)
    }
