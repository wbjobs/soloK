import numpy as np
from scipy import constants
import math
from typing import List, Dict, Any, Tuple, Optional
import geojson


EARTH_RADIUS = 6378.0


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1_rad = np.radians(lat1)
    lat2_rad = np.radians(lat2)
    lon1_rad = np.radians(lon1)
    lon2_rad = np.radians(lon2)

    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad

    a = np.sin(dlat / 2) ** 2 + np.cos(lat1_rad) * np.cos(lat2_rad) * np.sin(dlon / 2) ** 2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))

    return EARTH_RADIUS * c


def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1_rad = np.radians(lat1)
    lat2_rad = np.radians(lat2)
    dlon = np.radians(lon2 - lon1)

    x = np.sin(dlon) * np.cos(lat2_rad)
    y = np.cos(lat1_rad) * np.sin(lat2_rad) - np.sin(lat1_rad) * np.cos(lat2_rad) * np.cos(dlon)

    bearing = np.degrees(np.arctan2(x, y))
    return (bearing + 360) % 360


def rssi_to_distance(rssi: float, frequency: float, tx_power: float = 20.0,
                     path_loss_exponent: float = 2.0) -> float:
    wavelength = constants.c / (frequency * 1e9)

    free_space_pl = 20 * np.log10(4 * np.pi / wavelength)

    distance_km = 10 ** ((tx_power - rssi - free_space_pl) / (10 * path_loss_exponent))

    return distance_km / 1000.0


def triangulate_rssi(receiver_positions: List[Tuple[float, float]],
                     rssi_values: List[float],
                     frequency: float,
                     tx_power: float = 20.0) -> Dict[str, Any]:
    if len(receiver_positions) < 3:
        return {"error": "至少需要3个监测站进行RSSI三角定位", "valid": False}

    distances = []
    for rssi in rssi_values:
        d = rssi_to_distance(rssi, frequency, tx_power)
        distances.append(d)

    lats = [pos[0] for pos in receiver_positions]
    lons = [pos[1] for pos in receiver_positions]

    lat_min, lat_max = min(lats) - 10, max(lats) + 10
    lon_min, lon_max = min(lons) - 10, max(lons) + 10

    grid_res = 0.5
    n_lat = int((lat_max - lat_min) / grid_res) + 1
    n_lon = int((lon_max - lon_min) / grid_res) + 1

    best_error = float('inf')
    best_lat = lat_min
    best_lon = lon_min

    lat_grid = np.linspace(lat_min, lat_max, n_lat)
    lon_grid = np.linspace(lon_min, lon_max, n_lon)

    for lat in lat_grid:
        for lon in lon_grid:
            total_error = 0.0
            for i, (recv_lat, recv_lon) in enumerate(receiver_positions):
                actual_dist = haversine_distance(recv_lat, recv_lon, lat, lon)
                total_error += (actual_dist - distances[i]) ** 2

            if total_error < best_error:
                best_error = total_error
                best_lat = lat
                best_lon = lon

    error_km = np.sqrt(best_error / len(receiver_positions))

    return {
        "latitude": float(best_lat),
        "longitude": float(best_lon),
        "confidence_radius_km": float(error_km),
        "method": "RSSI_triangulation",
        "estimated_distances": distances,
        "valid": True
    }


def triangulate_aoa(receiver_positions: List[Tuple[float, float]],
                    aoa_values: List[float]) -> Dict[str, Any]:
    if len(receiver_positions) < 2:
        return {"error": "至少需要2个监测站进行AoA定位", "valid": False}

    intersection_points = []

    for i in range(len(receiver_positions)):
        for j in range(i + 1, len(receiver_positions)):
            lat1, lon1 = receiver_positions[i]
            lat2, lon2 = receiver_positions[j]

            bearing1 = aoa_values[i]
            bearing2 = aoa_values[j]

            intersection = find_bearing_intersection(
                lat1, lon1, bearing1, lat2, lon2, bearing2
            )

            if intersection is not None:
                intersection_points.append(intersection)

    if not intersection_points:
        return {"error": "无法确定干扰源位置", "valid": False}

    lats = [p[0] for p in intersection_points]
    lons = [p[1] for p in intersection_points]

    centroid_lat = np.mean(lats)
    centroid_lon = np.mean(lons)

    distances = [haversine_distance(centroid_lat, centroid_lon, lat, lon)
                 for lat, lon in zip(lats, lons)]
    spread_km = np.max(distances) if distances else 0.0

    return {
        "latitude": float(centroid_lat),
        "longitude": float(centroid_lon),
        "confidence_radius_km": float(spread_km),
        "method": "AoA_triangulation",
        "intersection_count": len(intersection_points),
        "intersection_points": [[float(lat), float(lon)] for lat, lon in intersection_points],
        "valid": True
    }


def find_bearing_intersection(lat1: float, lon1: float, bearing1: float,
                               lat2: float, lon2: float, bearing2: float) -> Optional[Tuple[float, float]]:
    max_distance = 10000.0

    x1 = EARTH_RADIUS * np.cos(np.radians(lat1)) * np.cos(np.radians(lon1))
    y1 = EARTH_RADIUS * np.cos(np.radians(lat1)) * np.sin(np.radians(lon1))
    z1 = EARTH_RADIUS * np.sin(np.radians(lat1))

    x2 = EARTH_RADIUS * np.cos(np.radians(lat2)) * np.cos(np.radians(lon2))
    y2 = EARTH_RADIUS * np.cos(np.radians(lat2)) * np.sin(np.radians(lon2))
    z2 = EARTH_RADIUS * np.sin(np.radians(lat2))

    br1_rad = np.radians(bearing1)
    dx1 = np.sin(br1_rad)
    dy1 = np.cos(br1_rad)

    br2_rad = np.radians(bearing2)
    dx2 = np.sin(br2_rad)
    dy2 = np.cos(br2_rad)

    try:
        t1, t2 = 0.0, 0.0

        for _ in range(100):
            p1x = x1 + dx1 * t1
            p1y = y1 + dy1 * t1
            p2x = x2 + dx2 * t2
            p2y = y2 + dy2 * t2

            dist = np.sqrt((p1x - p2x) ** 2 + (p1y - p2y) ** 2)

            if dist < 0.1:
                break

            grad_t1 = 2 * (p1x - p2x) * dx1 + 2 * (p1y - p2y) * dy1
            grad_t2 = -2 * (p1x - p2x) * dx2 - 2 * (p1y - p2y) * dy2

            step = min(dist, 10.0)
            t1 -= step * grad_t1 / (grad_t1 ** 2 + grad_t2 ** 2 + 1e-10)
            t2 -= step * grad_t2 / (grad_t1 ** 2 + grad_t2 ** 2 + 1e-10)

            t1 = max(0, min(t1, max_distance))
            t2 = max(0, min(t2, max_distance))

        p1x = x1 + dx1 * t1
        p1y = y1 + dy1 * t1
        p1z = z1

        r = np.sqrt(p1x ** 2 + p1y ** 2 + p1z ** 2)
        lat = np.degrees(np.arcsin(p1z / r))
        lon = np.degrees(np.arctan2(p1y, p1x))

        return (lat, lon)
    except:
        return None


def hybrid_localization(receiver_positions: List[Tuple[float, float]],
                        rssi_values: List[float],
                        aoa_values: List[float],
                        frequency: float,
                        tx_power: float = 20.0,
                        rssi_weight: float = 0.4,
                        aoa_weight: float = 0.6) -> Dict[str, Any]:
    rssi_result = triangulate_rssi(receiver_positions, rssi_values, frequency, tx_power)
    aoa_result = triangulate_aoa(receiver_positions, aoa_values)

    results = []
    weights = []

    if rssi_result.get("valid"):
        results.append((rssi_result["latitude"], rssi_result["longitude"]))
        rssi_conf = max(1.0, 100.0 / (rssi_result["confidence_radius_km"] + 1.0))
        weights.append(rssi_weight * rssi_conf)

    if aoa_result.get("valid"):
        results.append((aoa_result["latitude"], aoa_result["longitude"]))
        aoa_conf = max(1.0, 100.0 / (aoa_result["confidence_radius_km"] + 1.0))
        weights.append(aoa_weight * aoa_conf)

    if not results:
        return {"error": "定位失败", "valid": False}

    total_weight = sum(weights)
    weighted_lat = sum(r[0] * w for r, w in zip(results, weights)) / total_weight
    weighted_lon = sum(r[1] * w for r, w in zip(results, weights)) / total_weight

    distances = []
    for lat, lon in results:
        d = haversine_distance(weighted_lat, weighted_lon, lat, lon)
        distances.append(d)

    confidence_km = np.mean(distances) if distances else 0.0

    return {
        "latitude": float(weighted_lat),
        "longitude": float(weighted_lon),
        "confidence_radius_km": float(confidence_km),
        "method": "hybrid_RSSI_AoA",
        "rssi_result": {k: v for k, v in rssi_result.items() if k != "valid"},
        "aoa_result": {k: v for k, v in aoa_result.items() if k != "valid"},
        "valid": True
    }


def generate_localization_geojson(interference_location: Dict[str, Any],
                                  receiver_positions: List[Tuple[float, float]]) -> Dict[str, Any]:
    features = []

    for i, (lat, lon) in enumerate(receiver_positions):
        point = geojson.Point([lon, lat])
        feature = geojson.Feature(
            geometry=point,
            properties={
                "type": "monitor_station",
                "station_id": i,
                "name": f"监测站{i + 1}"
            }
        )
        features.append(feature)

    if interference_location.get("valid"):
        lat = interference_location["latitude"]
        lon = interference_location["longitude"]

        point = geojson.Point([lon, lat])
        feature = geojson.Feature(
            geometry=point,
            properties={
                "type": "interference_source",
                "confidence_radius_km": interference_location["confidence_radius_km"],
                "method": interference_location["method"]
            }
        )
        features.append(feature)

        radius_km = interference_location["confidence_radius_km"]
        lat_offset = radius_km / 111.0
        lon_offset = radius_km / (111.0 * np.cos(np.radians(lat)))

        circle_coords = []
        for angle in np.linspace(0, 2 * np.pi, 36):
            c_lat = lat + lat_offset * np.sin(angle)
            c_lon = lon + lon_offset * np.cos(angle)
            circle_coords.append([float(c_lon), float(c_lat)])
        circle_coords.append(circle_coords[0])

        polygon = geojson.Polygon([circle_coords])
        confidence_feature = geojson.Feature(
            geometry=polygon,
            properties={
                "type": "confidence_area",
                "confidence_radius_km": radius_km
            }
        )
        features.append(confidence_feature)

    return {
        "type": "FeatureCollection",
        "features": features
    }
