import numpy as np
from scipy import constants
from typing import Tuple
import math


def calculate_antenna_gain(diameter: float, frequency: float, efficiency: float = 0.6) -> float:
    wavelength = constants.c / (frequency * 1e9)
    gain = efficiency * (math.pi * diameter / wavelength) ** 2
    return 10 * np.log10(gain)


def calculate_eirp(transmit_power: float, antenna_gain: float) -> float:
    power_dbm = 10 * np.log10(transmit_power * 1000)
    return power_dbm / 10 + antenna_gain


def calculate_path_length(satellite_orbit: float, earth_station_lat: float,
                          earth_station_lon: float, elevation_angle: float = None) -> float:
    earth_radius = 6378.0
    sat_height = satellite_orbit

    if elevation_angle is None:
        lat_rad = np.radians(earth_station_lat)
        central_angle = abs(lat_rad)
        slant_range = np.sqrt(earth_radius ** 2 + (earth_radius + sat_height) ** 2 -
                              2 * earth_radius * (earth_radius + sat_height) * np.cos(central_angle))
    else:
        el_rad = np.radians(elevation_angle)
        r_earth = earth_radius
        r_sat = earth_radius + sat_height

        a = 1
        b = 2 * r_earth * np.sin(el_rad)
        c = r_earth ** 2 - r_sat ** 2

        discriminant = b ** 2 - 4 * a * c
        d = (-b + np.sqrt(discriminant)) / (2 * a)
        slant_range = d

    return slant_range


def calculate_free_space_loss(frequency: float, path_length: float) -> float:
    freq_hz = frequency * 1e9
    loss = 20 * np.log10(4 * np.pi * path_length * 1000 * freq_hz / constants.c)
    return loss


def calculate_rain_attenuation(frequency: float, elevation_angle: float,
                               rain_rate: float = 10.0) -> float:
    el_rad = np.radians(elevation_angle)

    if frequency < 10:
        k = 0.000107 * (frequency ** 1.07)
        alpha = 1.38
    elif frequency < 20:
        k = 0.000296 * (frequency ** 0.97)
        alpha = 1.28
    else:
        k = 0.000372 * (frequency ** 0.91)
        alpha = 1.19

    specific_attenuation = k * (rain_rate ** alpha)

    path_length = 5.0 / np.sin(el_rad) if np.sin(el_rad) > 0 else 100

    attenuation = specific_attenuation * path_length

    return float(attenuation)


def calculate_gt(antenna_gain: float, noise_temperature: float) -> float:
    return antenna_gain - 10 * np.log10(noise_temperature)


def calculate_cn_ratio(eirp: float, free_space_loss: float, gt: float,
                       bandwidth: float, rain_attenuation: float = 0) -> float:
    boltzmann_constant = 10 * np.log10(constants.k)
    bandwidth_dbhz = 10 * np.log10(bandwidth * 1e6)

    cn = eirp - free_space_loss - rain_attenuation + gt - boltzmann_constant - bandwidth_dbhz
    return float(cn)


def get_modulation_threshold(modulation: str) -> float:
    thresholds = {
        "BPSK": 9.5,
        "QPSK": 9.5,
        "8PSK": 13.0,
        "16QAM": 17.5,
        "32QAM": 20.5,
        "64QAM": 23.5
    }
    return thresholds.get(modulation.upper(), 9.5)


def calculate_link_margin(cn_ratio: float, modulation: str) -> float:
    threshold = get_modulation_threshold(modulation)
    return cn_ratio - threshold


def compute_link_budget(uplink_frequency: float, downlink_frequency: float,
                        satellite_orbit: float, earth_station_lat: float,
                        earth_station_lon: float, antenna_diameter: float,
                        transmit_power: float, modulation: str,
                        bandwidth: float = 36.0, noise_temperature: float = 290.0,
                        elevation_angle: float = None) -> dict:
    path_length = calculate_path_length(satellite_orbit, earth_station_lat,
                                        earth_station_lon, elevation_angle)

    avg_frequency = (uplink_frequency + downlink_frequency) / 2

    antenna_gain = calculate_antenna_gain(antenna_diameter, avg_frequency)

    eirp = calculate_eirp(transmit_power, antenna_gain)

    free_space_loss = calculate_free_space_loss(avg_frequency, path_length)

    if elevation_angle is None:
        elevation_angle = 45.0
    rain_attenuation = calculate_rain_attenuation(downlink_frequency, elevation_angle)

    gt = calculate_gt(antenna_gain, noise_temperature)

    cn_ratio = calculate_cn_ratio(eirp, free_space_loss, gt, bandwidth, rain_attenuation)

    link_margin = calculate_link_margin(cn_ratio, modulation)

    return {
        "eirp": round(float(eirp), 2),
        "gt": round(float(gt), 2),
        "free_space_loss": round(float(free_space_loss), 2),
        "rain_attenuation": round(float(rain_attenuation), 2),
        "cn_ratio": round(float(cn_ratio), 2),
        "link_margin": round(float(link_margin), 2),
        "antenna_gain": round(float(antenna_gain), 2),
        "path_length": round(float(path_length), 2)
    }
