import struct
import numpy as np
from typing import Tuple, List, Optional, Dict
from dataclasses import dataclass, field
from app.core.logging import logger


@dataclass
class MultibeamPing:
    ping_number: int
    timestamp: float
    beam_count: int
    depths: np.ndarray
    intensities: Optional[np.ndarray]
    across_track_angles: np.ndarray
    along_track_distance: float
    latitude: float
    longitude: float
    heading: float
    roll: float
    pitch: float
    heave: float


@dataclass
class MultibeamData:
    pings: List[MultibeamPing]
    num_beams: int
    swath_width: float
    max_depth: float
    min_depth: float
    sonar_type: str = "multibeam"


class MultibeamParser:
    KONG_MAGIC = b"KMALL"
    ALL_MAGIC = b"ALL"

    def __init__(self):
        self.supported_formats = [".all", ".kmall", ".xtf"]

    def parse(self, file_path: str, file_format: str) -> Optional[MultibeamData]:
        format_lower = file_format.lower().strip(".")
        if format_lower == "all":
            return self._parse_all(file_path)
        elif format_lower == "kmall":
            return self._parse_kmall(file_path)
        elif format_lower == "xtf":
            return self._parse_xtf_multibeam(file_path)
        else:
            logger.error(f"Unsupported multibeam format: {file_format}")
            return None

    def _parse_all(self, file_path: str) -> Optional[MultibeamData]:
        try:
            with open(file_path, "rb") as f:
                pings = []
                all_depths = []

                while True:
                    header_bytes = f.read(8)
                    if len(header_bytes) < 8:
                        break

                    packet_size = struct.unpack_from("<I", header_bytes, 0)[0]
                    packet_type = struct.unpack_from("<I", header_bytes, 4)[0]

                    if packet_size <= 0 or packet_size > 1000000:
                        break

                    packet_data = f.read(packet_size - 8)
                    if len(packet_data) < packet_size - 8:
                        break

                    if packet_type in [0x1000, 0x1001, 0x1002]:
                        ping = self._parse_all_bathymetry_packet(packet_data)
                        if ping:
                            pings.append(ping)
                            all_depths.extend(ping.depths.tolist())

                if not pings:
                    return None

                all_depths = np.array(all_depths)

                return MultibeamData(
                    pings=pings,
                    num_beams=pings[0].beam_count,
                    swath_width=pings[0].across_track_angles[-1] * 2 if len(pings[0].across_track_angles) > 0 else 120,
                    max_depth=float(np.max(all_depths)) if len(all_depths) > 0 else 0,
                    min_depth=float(np.min(all_depths)) if len(all_depths) > 0 else 0,
                    sonar_type="multibeam",
                )

        except Exception as e:
            logger.error(f"Error parsing ALL file: {e}")
            return None

    def _parse_all_bathymetry_packet(self, data: bytes) -> Optional[MultibeamPing]:
        try:
            offset = 0

            num_beams = struct.unpack_from("<H", data, offset)[0]
            offset += 4

            timestamp = struct.unpack_from("<d", data, offset)[0]
            offset += 16

            latitude = struct.unpack_from("<d", data, offset)[0]
            offset += 8
            longitude = struct.unpack_from("<d", data, offset)[0]
            offset += 8

            heading = struct.unpack_from("<f", data, offset)[0]
            offset += 4
            roll = struct.unpack_from("<f", data, offset)[0]
            offset += 4
            pitch = struct.unpack_from("<f", data, offset)[0]
            offset += 4
            heave = struct.unpack_from("<f", data, offset)[0]
            offset += 4

            depth_offset = offset + num_beams * 8

            depths = []
            intensities = []
            angles = []

            for i in range(min(num_beams, 512)):
                beam_offset = offset + i * 8
                depth = struct.unpack_from("<f", data, beam_offset)[0]
                intensity = struct.unpack_from("<f", data, beam_offset + 4)[0]

                angle = -60.0 + (120.0 * i / max(num_beams - 1, 1))

                if 0 < depth < 1000:
                    depths.append(depth)
                    intensities.append(intensity)
                    angles.append(angle)

            return MultibeamPing(
                ping_number=0,
                timestamp=timestamp,
                beam_count=len(depths),
                depths=np.array(depths, dtype=np.float32),
                intensities=np.array(intensities, dtype=np.float32),
                across_track_angles=np.array(angles, dtype=np.float32),
                along_track_distance=0,
                latitude=latitude,
                longitude=longitude,
                heading=heading,
                roll=roll,
                pitch=pitch,
                heave=heave,
            )

        except Exception as e:
            logger.debug(f"Error parsing bathymetry packet: {e}")
            return None

    def _parse_kmall(self, file_path: str) -> Optional[MultibeamData]:
        try:
            with open(file_path, "rb") as f:
                magic = f.read(5)
                if magic != self.KONG_MAGIC:
                    logger.error("Invalid KMALL file")
                    return None

                f.seek(0)
                file_size = os.path.getsize(file_path)

                pings = []
                all_depths = []

                while f.tell() < file_size:
                    packet_start = f.tell()

                    try:
                        header = f.read(20)
                        if len(header) < 20:
                            break

                        packet_type = struct.unpack_from("<H", header, 0)[0]
                        packet_size = struct.unpack_from("<I", header, 4)[0]

                        if packet_size <= 0 or f.tell() + packet_size > file_size:
                            break

                        data = f.read(packet_size - 20)

                        if packet_type == 0x12:
                            ping = self._parse_kmall_bathymetry(data)
                            if ping:
                                pings.append(ping)
                                all_depths.extend(ping.depths.tolist())

                    except Exception:
                        break

                if not pings:
                    return None

                all_depths = np.array(all_depths)

                return MultibeamData(
                    pings=pings,
                    num_beams=pings[0].beam_count,
                    swath_width=120,
                    max_depth=float(np.max(all_depths)) if len(all_depths) > 0 else 0,
                    min_depth=float(np.min(all_depths)) if len(all_depths) > 0 else 0,
                    sonar_type="multibeam",
                )

        except Exception as e:
            logger.error(f"Error parsing KMALL file: {e}")
            return None

    def _parse_kmall_bathymetry(self, data: bytes) -> Optional[MultibeamPing]:
        try:
            num_beams = struct.unpack_from("<H", data, 0)[0]

            depths = []
            intensities = []
            angles = []

            for i in range(min(num_beams, 512)):
                offset = 4 + i * 16
                if offset + 16 > len(data):
                    break

                depth = struct.unpack_from("<f", data, offset)[0]
                intensity = struct.unpack_from("<f", data, offset + 4)[0]
                angle = struct.unpack_from("<f", data, offset + 8)[0]

                if 0 < depth < 1000:
                    depths.append(depth)
                    intensities.append(intensity)
                    angles.append(angle)

            return MultibeamPing(
                ping_number=0,
                timestamp=0,
                beam_count=len(depths),
                depths=np.array(depths, dtype=np.float32),
                intensities=np.array(intensities, dtype=np.float32) if intensities else None,
                across_track_angles=np.array(angles, dtype=np.float32),
                along_track_distance=0,
                latitude=0,
                longitude=0,
                heading=0,
                roll=0,
                pitch=0,
                heave=0,
            )

        except Exception:
            return None

    def _parse_xtf_multibeam(self, file_path: str) -> Optional[MultibeamData]:
        try:
            with open(file_path, "rb") as f:
                magic = f.read(3)
                if magic != b"XTF":
                    return None

                f.seek(0)
                header = f.read(1024)
                if len(header) < 1024:
                    return None

                num_beams = struct.unpack_from("<H", header, 36)[0]
                num_pings = struct.unpack_from("<I", header, 56)[0]

                pings = []
                all_depths = []

                ping_header_size = 100
                beam_data_size = num_beams * 8

                for i in range(min(num_pings, 10000)):
                    pos = 1024 + i * (ping_header_size + beam_data_size)
                    f.seek(pos)

                    ping_header = f.read(ping_header_size)
                    if len(ping_header) < ping_header_size:
                        break

                    try:
                        timestamp = struct.unpack_from("<d", ping_header, 8)[0]
                    except struct.error:
                        continue

                    beam_data = f.read(beam_data_size)
                    if len(beam_data) < beam_data_size:
                        break

                    depths = []
                    intensities = []
                    angles = []

                    for j in range(min(num_beams, 512)):
                        offset = j * 8
                        if offset + 8 > len(beam_data):
                            break

                        depth = struct.unpack_from("<f", beam_data, offset)[0]
                        intensity = struct.unpack_from("<H", beam_data, offset + 4)[0]

                        if 0 < depth < 1000:
                            depths.append(depth)
                            intensities.append(intensity)
                            angles.append(-60.0 + (120.0 * j / max(num_beams - 1, 1)))

                    if depths:
                        ping = MultibeamPing(
                            ping_number=i,
                            timestamp=timestamp,
                            beam_count=len(depths),
                            depths=np.array(depths, dtype=np.float32),
                            intensities=np.array(intensities, dtype=np.float32),
                            across_track_angles=np.array(angles, dtype=np.float32),
                            along_track_distance=i * 0.1,
                            latitude=0,
                            longitude=0,
                            heading=0,
                            roll=0,
                            pitch=0,
                            heave=0,
                        )
                        pings.append(ping)
                        all_depths.extend(depths)

                if not pings:
                    return None

                all_depths = np.array(all_depths)

                return MultibeamData(
                    pings=pings,
                    num_beams=pings[0].beam_count,
                    swath_width=120,
                    max_depth=float(np.max(all_depths)) if len(all_depths) > 0 else 0,
                    min_depth=float(np.min(all_depths)) if len(all_depths) > 0 else 0,
                    sonar_type="multibeam",
                )

        except Exception as e:
            logger.error(f"Error parsing XTF multibeam: {e}")
            return None

    def generate_3d_point_cloud(
        self,
        data: MultibeamData,
        max_pings: int = 500,
        resolution: float = 0.5,
    ) -> Dict:
        if not data or not data.pings:
            return {"points": np.array([]), "colors": np.array([]), "bounds": {}}

        pings = data.pings[:max_pings]

        all_points = []
        all_colors = []

        depth_range = data.max_depth - data.min_depth
        if depth_range == 0:
            depth_range = 1

        for ping_idx, ping in enumerate(pings):
            along_track = ping.along_track_distance

            for beam_idx, (depth, angle_deg, intensity) in enumerate(zip(
                ping.depths,
                ping.across_track_angles,
                ping.intensities if ping.intensities is not None else [0] * len(ping.depths),
            )):
                angle_rad = math.radians(angle_deg)

                x = along_track
                y = depth * math.sin(angle_rad)
                z = -depth * math.cos(angle_rad)

                depth_normalized = (depth - data.min_depth) / depth_range
                intensity_normalized = min(intensity / 255.0, 1.0)

                r = depth_normalized
                g = intensity_normalized * (1 - depth_normalized)
                b = 1 - depth_normalized

                all_points.append([x, y, z])
                all_colors.append([r, g, b])

        points = np.array(all_points, dtype=np.float32)
        colors = np.array(all_colors, dtype=np.float32)

        if len(points) > 0:
            bounds = {
                "min_x": float(np.min(points[:, 0])),
                "max_x": float(np.max(points[:, 0])),
                "min_y": float(np.min(points[:, 1])),
                "max_y": float(np.max(points[:, 1])),
                "min_z": float(np.min(points[:, 2])),
                "max_z": float(np.max(points[:, 2])),
            }
        else:
            bounds = {}

        return {
            "points": points,
            "colors": colors,
            "bounds": bounds,
            "num_points": len(points),
            "num_pings": len(pings),
        }

    def generate_heightmap(
        self,
        data: MultibeamData,
        grid_size: int = 500,
        max_pings: int = 500,
    ) -> np.ndarray:
        if not data or not data.pings:
            return np.zeros((grid_size, grid_size), dtype=np.uint8)

        pings = data.pings[:max_pings]

        heightmap = np.full((grid_size, grid_size), np.nan, dtype=np.float32)

        all_x = []
        all_y = []
        all_z = []

        for ping in pings:
            for depth, angle_deg in zip(ping.depths, ping.across_track_angles):
                angle_rad = math.radians(angle_deg)
                y = depth * math.sin(angle_rad)
                z = depth * math.cos(angle_rad)

                all_x.append(ping.along_track_distance)
                all_y.append(y)
                all_z.append(z)

        if not all_x:
            return np.zeros((grid_size, grid_size), dtype=np.uint8)

        min_x, max_x = min(all_x), max(all_x)
        min_y, max_y = min(all_y), max(all_y)
        min_z, max_z = min(all_z), max(all_z)

        range_x = max_x - min_x
        range_y = max_y - min_y
        range_z = max_z - min_z

        if range_x == 0 or range_y == 0 or range_z == 0:
            return np.zeros((grid_size, grid_size), dtype=np.uint8)

        for ping in pings:
            for depth, angle_deg in zip(ping.depths, ping.across_track_angles):
                angle_rad = math.radians(angle_deg)
                x = ping.along_track_distance
                y = depth * math.sin(angle_rad)
                z = depth * math.cos(angle_rad)

                grid_x = int((x - min_x) / range_x * (grid_size - 1))
                grid_y = int((y - min_y) / range_y * (grid_size - 1))

                if 0 <= grid_x < grid_size and 0 <= grid_y < grid_size:
                    if np.isnan(heightmap[grid_x, grid_y]) or z > heightmap[grid_x, grid_y]:
                        heightmap[grid_x, grid_y] = z

        valid_mask = ~np.isnan(heightmap)
        if valid_mask.any():
            heightmap[~valid_mask] = np.nanmin(heightmap)

            min_val = np.nanmin(heightmap)
            max_val = np.nanmax(heightmap)
            if max_val > min_val:
                heightmap = (heightmap - min_val) / (max_val - min_val)
                heightmap = (heightmap * 255).astype(np.uint8)
            else:
                heightmap = np.zeros_like(heightmap, dtype=np.uint8)

        return heightmap


multibeam_parser = MultibeamParser()
