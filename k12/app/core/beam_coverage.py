import numpy as np
from scipy import constants
import math
import geojson
from typing import List, Dict, Any, Tuple, Optional


def calculate_ellipsoidal_pattern(theta: float, phi: float,
                                  major_axis_diameter: float,
                                  minor_axis_diameter: float,
                                  frequency: float,
                                  efficiency: float = 0.6) -> float:
    wavelength = constants.c / (frequency * 1e9)

    theta_rad = np.radians(abs(theta))
    phi_rad = np.radians(phi)

    major_d_lambda = major_axis_diameter / wavelength
    minor_d_lambda = minor_axis_diameter / wavelength

    if theta_rad < 1e-10:
        area_equiv = math.pi * major_axis_diameter * minor_axis_diameter / 4.0
        max_gain = efficiency * (4 * math.pi * area_equiv) / (wavelength ** 2)
        return float(10 * np.log10(max_gain))

    x = math.pi * major_d_lambda * math.sin(theta_rad) * math.cos(phi_rad)
    y = math.pi * minor_d_lambda * math.sin(theta_rad) * math.sin(phi_rad)

    if abs(x) < 1e-10:
        jx = 0.5
    else:
        jx = math.sin(x) / (x ** 2) - math.cos(x) / x

    if abs(y) < 1e-10:
        jy = 0.5
    else:
        jy = math.sin(y) / (y ** 2) - math.cos(y) / y

    pattern = abs(4 * jx * jy)

    area_equiv = math.pi * major_axis_diameter * minor_axis_diameter / 4.0
    max_gain = efficiency * (4 * math.pi * area_equiv) / (wavelength ** 2)

    gain = max_gain * (pattern ** 2)

    if gain > 0:
        gain_db = 10 * np.log10(gain)
    else:
        gain_db = -100.0

    off_axis = np.sqrt(theta ** 2)
    if gain_db < -30:
        if off_axis < 1:
            gain_db = -30
        elif off_axis < 10:
            gain_db = 32 - 25 * np.log10(off_axis + 1e-6)
        else:
            gain_db = 10 - 10 * np.log10(off_axis)

    return float(gain_db)


def calculate_parabolic_pattern(theta: float, diameter: float,
                                frequency: float, efficiency: float = 0.6) -> float:
    return calculate_ellipsoidal_pattern(theta, 0, diameter, diameter, frequency, efficiency)


def calculate_array_pattern(theta: float, phi: float, diameter: float,
                            frequency: float, num_elements: int = 16,
                            aspect_ratio: float = 1.0) -> float:
    wavelength = constants.c / (frequency * 1e9)
    element_spacing = wavelength / 2

    theta_rad = np.radians(theta)
    phi_rad = np.radians(phi)

    n_x = int(np.sqrt(num_elements * aspect_ratio))
    n_y = int(np.sqrt(num_elements / aspect_ratio))
    n_x = max(1, n_x)
    n_y = max(1, n_y)

    array_factor = 0.0 + 0.0j
    for m in range(n_x):
        for n in range(n_y):
            phase = (2 * math.pi / wavelength) * (
                m * element_spacing * math.sin(theta_rad) * math.cos(phi_rad) +
                n * element_spacing * math.sin(theta_rad) * math.sin(phi_rad)
            )
            array_factor += np.exp(1j * phase)

    total_elements = n_x * n_y
    af_magnitude = abs(array_factor) / total_elements if total_elements > 0 else 0
    af_db = 20 * np.log10(af_magnitude) if af_magnitude > 0 else -100

    element_gain = calculate_parabolic_pattern(theta, diameter / 4, frequency)

    total_gain = element_gain + af_db + 10 * np.log10(max(1, total_elements))

    return float(total_gain)


def geo_to_spherical(lat: float, lon: float, sat_lat: float,
                     sat_lon: float, sat_alt: float) -> Tuple[float, float, float]:
    earth_radius = 6378.0

    lat_rad = np.radians(lat)
    lon_rad = np.radians(lon)
    sat_lat_rad = np.radians(sat_lat)
    sat_lon_rad = np.radians(sat_lon)

    x_earth = earth_radius * np.cos(lat_rad) * np.cos(lon_rad)
    y_earth = earth_radius * np.cos(lat_rad) * np.sin(lon_rad)
    z_earth = earth_radius * np.sin(lat_rad)

    r_sat = earth_radius + sat_alt
    x_sat = r_sat * np.cos(sat_lat_rad) * np.cos(sat_lon_rad)
    y_sat = r_sat * np.cos(sat_lat_rad) * np.sin(sat_lon_rad)
    z_sat = r_sat * np.sin(sat_lat_rad)

    dx = x_earth - x_sat
    dy = y_earth - y_sat
    dz = z_earth - z_sat

    distance = np.sqrt(dx ** 2 + dy ** 2 + dz ** 2)

    if distance == 0:
        theta = 0
        phi = 0
    else:
        theta = np.degrees(np.arccos(dz / distance))
        phi = np.degrees(np.arctan2(dy, dx))

    return float(theta), float(phi), float(distance)


def calculate_eirp_at_point(lat: float, lon: float, sat_lat: float, sat_lon: float,
                            sat_alt: float, antenna_model: str,
                            antenna_diameter: float, frequency: float,
                            transmit_power: float,
                            center_azimuth: float = 0.0,
                            center_elevation: float = 0.0,
                            beam_aspect_ratio: float = 1.0,
                            beam_orientation: float = 0.0) -> float:
    theta, phi, path_length = geo_to_spherical(lat, lon, sat_lat, sat_lon, sat_alt)

    theta_rel = theta - center_elevation
    phi_rel = phi - center_azimuth

    beam_orient_rad = np.radians(beam_orientation)
    phi_rot_rad = np.radians(phi_rel) - beam_orient_rad
    phi_rot = np.degrees(phi_rot_rad)

    major_diameter = antenna_diameter
    minor_diameter = antenna_diameter / beam_aspect_ratio

    if antenna_model == "parabolic":
        if beam_aspect_ratio == 1.0:
            off_axis_angle = np.sqrt(theta_rel ** 2 + phi_rel ** 2)
            antenna_gain = calculate_parabolic_pattern(off_axis_angle, antenna_diameter, frequency)
        else:
            antenna_gain = calculate_ellipsoidal_pattern(
                theta_rel, phi_rot, major_diameter, minor_diameter, frequency
            )
    elif antenna_model == "array":
        antenna_gain = calculate_array_pattern(
            theta_rel, phi_rot, antenna_diameter, frequency, aspect_ratio=beam_aspect_ratio
        )
    elif antenna_model == "elliptical":
        antenna_gain = calculate_ellipsoidal_pattern(
            theta_rel, phi_rot, major_diameter, minor_diameter, frequency
        )
    else:
        antenna_gain = calculate_parabolic_pattern(theta, antenna_diameter, frequency)

    power_dbw = 10 * np.log10(transmit_power)
    eirp = power_dbw + antenna_gain

    path_loss = 20 * np.log10(4 * np.pi * path_length * 1000 * frequency * 1e9 / constants.c)
    eirp_received = eirp - path_loss

    return float(eirp_received)


def march_squares_contour(lon_grid: np.ndarray, lat_grid: np.ndarray,
                          data: np.ndarray, level: float) -> List[np.ndarray]:
    from skimage import measure

    try:
        contours = measure.find_contours(data, level)
    except ImportError:
        return []

    result_contours = []
    for contour in contours:
        if len(contour) < 3:
            continue

        rows = contour[:, 0]
        cols = contour[:, 1]

        rows = np.clip(rows, 0, lon_grid.shape[0] - 1)
        cols = np.clip(cols, 0, lon_grid.shape[1] - 1)

        row_floor = np.floor(rows).astype(int)
        row_ceil = np.ceil(rows).astype(int)
        col_floor = np.floor(cols).astype(int)
        col_ceil = np.ceil(cols).astype(int)

        row_frac = rows - row_floor
        col_frac = cols - col_floor

        lon_interp = (
            (1 - row_frac) * (1 - col_frac) * lon_grid[row_floor, col_floor] +
            row_frac * (1 - col_frac) * lon_grid[row_ceil, col_floor] +
            (1 - row_frac) * col_frac * lon_grid[row_floor, col_ceil] +
            row_frac * col_frac * lon_grid[row_ceil, col_ceil]
        )

        lat_interp = (
            (1 - row_frac) * (1 - col_frac) * lat_grid[row_floor, col_floor] +
            row_frac * (1 - col_frac) * lat_grid[row_ceil, col_floor] +
            (1 - row_frac) * col_frac * lat_grid[row_floor, col_ceil] +
            row_frac * col_frac * lat_grid[row_ceil, col_ceil]
        )

        coords = np.column_stack((lon_interp, lat_interp))
        result_contours.append(coords)

    return result_contours


def simplify_polygon(coords: np.ndarray, tolerance: float = 0.5) -> np.ndarray:
    if len(coords) < 3:
        return coords

    mask = np.ones(len(coords), dtype=bool)
    max_iterations = min(10, len(coords) // 2)

    for _ in range(max_iterations):
        for i in range(1, len(coords) - 1):
            if not mask[i]:
                continue

            prev = coords[i - 1]
            curr = coords[i]
            next_p = coords[i + 1]

            area = abs((next_p[0] - prev[0]) * (curr[1] - prev[1]) -
                       (next_p[1] - prev[1]) * (curr[0] - prev[0]))

            if area < tolerance:
                mask[i] = False

        if mask.sum() >= 3:
            coords = coords[mask]
            mask = np.ones(len(coords), dtype=bool)
        else:
            break

    return coords


def generate_beam_coverage(satellite_lat: float, satellite_lon: float,
                           satellite_altitude: float, antenna_model: str,
                           antenna_diameter: float, frequency: float,
                           transmit_power: float, grid_resolution: float = 1.0,
                           center_azimuth: float = 0.0,
                           center_elevation: float = 0.0,
                           beam_aspect_ratio: float = 1.0,
                           beam_orientation: float = 0.0) -> Dict[str, Any]:
    lats = np.arange(-60, 60 + grid_resolution, grid_resolution)
    lons = np.arange(-180, 180 + grid_resolution, grid_resolution)

    n_lat = len(lats)
    n_lon = len(lons)
    eirp_array = np.full((n_lat, n_lon), -200.0, dtype=np.float32)

    for i, lat in enumerate(lats):
        for j, lon in enumerate(lons):
            try:
                eirp = calculate_eirp_at_point(
                    lat, lon, satellite_lat, satellite_lon, satellite_altitude,
                    antenna_model, antenna_diameter, frequency, transmit_power,
                    center_azimuth, center_elevation,
                    beam_aspect_ratio, beam_orientation
                )
                eirp_array[i, j] = eirp
            except:
                pass

    lon_grid, lat_grid = np.meshgrid(lons, lats)

    contour_levels = np.arange(-250, -100, 10)

    features = []

    for level in contour_levels:
        try:
            contours = march_squares_contour(lon_grid, lat_grid, eirp_array, level)

            for contour in contours:
                if len(contour) < 3:
                    continue

                simplified = simplify_polygon(contour, tolerance=grid_resolution * 0.5)
                if len(simplified) < 3:
                    continue

                first_point = simplified[0]
                last_point = simplified[-1]
                if not np.allclose(first_point, last_point):
                    simplified = np.vstack([simplified, first_point])

                polygon = geojson.Polygon([simplified.tolist()])
                feature = geojson.Feature(
                    geometry=polygon,
                    properties={
                        "eirp_level": float(level),
                        "eirp_level_dbw": float(level),
                        "contour_points": len(simplified)
                    }
                )
                features.append(feature)
        except Exception as e:
            continue

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "satellite_position": {
                "latitude": satellite_lat,
                "longitude": satellite_lon,
                "altitude": satellite_altitude
            },
            "antenna_model": antenna_model,
            "beam_aspect_ratio": beam_aspect_ratio,
            "beam_orientation": beam_orientation,
            "frequency": frequency,
            "grid_resolution": grid_resolution,
            "max_eirp": float(np.max(eirp_array)),
            "min_eirp": float(np.min(eirp_array))
        }
    }
