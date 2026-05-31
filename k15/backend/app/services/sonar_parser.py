import struct
import numpy as np
from typing import Tuple, List, Optional, Dict, BinaryIO
from dataclasses import dataclass
from app.core.logging import logger


@dataclass
class SonarPing:
    ping_number: int
    timestamp: float
    port_data: np.ndarray
    starboard_data: np.ndarray
    range_meters: float
    sound_velocity: float
    frequency: float


@dataclass
class SonarData:
    pings: List[SonarPing]
    num_samples: int
    sample_rate: float
    water_depth: float
    sonar_type: str


class SonarParser:
    XTF_MAGIC = b"XTF"
    SGF_MAGIC = b"SGF"

    def __init__(self):
        self._xtf_header_size = 1024
        self._xtf_ping_header_size = 100

    def parse(self, file_path: str, file_format: str) -> Optional[SonarData]:
        format_lower = file_format.lower().strip(".")
        if format_lower == "xtf":
            return self._parse_xtf(file_path)
        elif format_lower == "sgf":
            return self._parse_sgf(file_path)
        else:
            logger.error(f"Unsupported format: {file_format}")
            return None

    def _parse_xtf(self, file_path: str) -> Optional[SonarData]:
        try:
            with open(file_path, "rb") as f:
                magic = f.read(3)
                if magic != self.XTF_MAGIC:
                    logger.error("Invalid XTF file: wrong magic bytes")
                    return None

                f.seek(0)
                header = f.read(self._xtf_header_size)
                if len(header) < self._xtf_header_size:
                    logger.error("Invalid XTF file: header too short")
                    return None

                num_samples = struct.unpack_from("<H", header, 40)[0]
                sample_rate = struct.unpack_from("<f", header, 48)[0]
                water_depth = struct.unpack_from("<f", header, 56)[0]
                sound_velocity = struct.unpack_from("<f", header, 64)[0]

                pings = []
                ping_idx = 0
                sample_bytes = num_samples * 2

                while True:
                    ping_header_pos = self._xtf_header_size + ping_idx * (
                        self._xtf_ping_header_size + sample_bytes
                    )
                    f.seek(ping_header_pos)
                    ping_header = f.read(self._xtf_ping_header_size)
                    if len(ping_header) < self._xtf_ping_header_size:
                        break

                    try:
                        timestamp = struct.unpack_from("<d", ping_header, 8)[0]
                        range_meters = struct.unpack_from("<f", ping_header, 24)[0]
                        frequency = struct.unpack_from("<f", ping_header, 40)[0]

                        port_bytes = f.read(num_samples * 2)
                        starboard_bytes = f.read(num_samples * 2)

                        if len(port_bytes) < num_samples * 2:
                            break

                        port_data = np.frombuffer(port_bytes, dtype=np.uint16).astype(np.float32)
                        starboard_data = np.frombuffer(starboard_bytes, dtype=np.uint16).astype(np.float32)

                        ping = SonarPing(
                            ping_number=ping_idx,
                            timestamp=timestamp,
                            port_data=port_data,
                            starboard_data=starboard_data,
                            range_meters=range_meters,
                            sound_velocity=sound_velocity,
                            frequency=frequency,
                        )
                        pings.append(ping)
                        ping_idx += 1
                    except struct.error:
                        break

                logger.info(f"Parsed XTF file: {len(pings)} pings, {num_samples} samples")
                return SonarData(
                    pings=pings,
                    num_samples=num_samples,
                    sample_rate=sample_rate,
                    water_depth=water_depth,
                    sonar_type="sidescan",
                )

        except Exception as e:
            logger.error(f"Error parsing XTF file: {e}")
            return None

    def _parse_sgf(self, file_path: str) -> Optional[SonarData]:
        try:
            with open(file_path, "rb") as f:
                magic = f.read(3)
                if magic != self.SGF_MAGIC:
                    logger.error("Invalid SGF file: wrong magic bytes")
                    return None

                f.seek(0)
                header = f.read(256)
                if len(header) < 256:
                    logger.error("Invalid SGF file: header too short")
                    return None

                num_samples = struct.unpack_from("<H", header, 20)[0]
                sample_rate = struct.unpack_from("<f", header, 28)[0]
                water_depth = struct.unpack_from("<f", header, 36)[0]
                sound_velocity = struct.unpack_from("<f", header, 44)[0]
                total_pings = struct.unpack_from("<I", header, 12)[0]

                pings = []
                sgf_ping_header_size = 64
                sample_bytes = num_samples * 2

                for i in range(min(total_pings, 100000)):
                    ping_pos = 256 + i * (sgf_ping_header_size + sample_bytes)
                    f.seek(ping_pos)
                    ping_header = f.read(sgf_ping_header_size)
                    if len(ping_header) < sgf_ping_header_size:
                        break

                    try:
                        timestamp = struct.unpack_from("<d", ping_header, 0)[0]
                        range_meters = struct.unpack_from("<f", ping_header, 16)[0]
                        frequency = struct.unpack_from("<f", ping_header, 32)[0]

                        data_bytes = f.read(num_samples * 2)
                        if len(data_bytes) < num_samples * 2:
                            break

                        raw_data = np.frombuffer(data_bytes, dtype=np.uint16).astype(np.float32)
                        half = num_samples // 2
                        port_data = raw_data[:half]
                        starboard_data = raw_data[half:]

                        ping = SonarPing(
                            ping_number=i,
                            timestamp=timestamp,
                            port_data=port_data,
                            starboard_data=starboard_data,
                            range_meters=range_meters,
                            sound_velocity=sound_velocity,
                            frequency=frequency,
                        )
                        pings.append(ping)
                    except struct.error:
                        break

                logger.info(f"Parsed SGF file: {len(pings)} pings, {num_samples} samples")
                return SonarData(
                    pings=pings,
                    num_samples=num_samples,
                    sample_rate=sample_rate,
                    water_depth=water_depth,
                    sonar_type="sidescan",
                )

        except Exception as e:
            logger.error(f"Error parsing SGF file: {e}")
            return None

    def generate_waterfall_image(
        self, sonar_data: SonarData, max_pings: int = 500, normalize: bool = True
    ) -> np.ndarray:
        if not sonar_data.pings:
            return np.zeros((max_pings, sonar_data.num_samples), dtype=np.uint8)

        pings = sonar_data.pings[:max_pings]
        num_samples = sonar_data.num_samples // 2
        num_pings = len(pings)

        waterfall = np.zeros((num_pings, num_samples * 2), dtype=np.float32)

        for i, ping in enumerate(pings):
            if len(ping.port_data) >= num_samples:
                waterfall[i, :num_samples] = ping.port_data[:num_samples]
            if len(ping.starboard_data) >= num_samples:
                waterfall[i, num_samples:] = ping.starboard_data[:num_samples]

        if normalize:
            waterfall = self._normalize_to_uint8(waterfall)

        return waterfall

    def _normalize_to_uint8(self, data: np.ndarray) -> np.ndarray:
        if data.max() > 0:
            data = (data - data.min()) / (data.max() - data.min() + 1e-8)
            data = (data * 255).astype(np.uint8)
        else:
            data = data.astype(np.uint8)
        return data

    def extract_frame(
        self, sonar_data: SonarData, frame_index: int, frame_height: int = 200
    ) -> np.ndarray:
        if not sonar_data.pings:
            return np.zeros((frame_height, sonar_data.num_samples), dtype=np.uint8)

        start = max(0, frame_index - frame_height // 2)
        end = min(len(sonar_data.pings), start + frame_height)
        actual_start = max(0, end - frame_height)

        num_samples = sonar_data.num_samples // 2
        frame = np.zeros((frame_height, num_samples * 2), dtype=np.float32)

        for i in range(end - actual_start):
            ping_idx = actual_start + i
            if ping_idx < len(sonar_data.pings):
                ping = sonar_data.pings[ping_idx]
                if len(ping.port_data) >= num_samples:
                    frame[i, :num_samples] = ping.port_data[:num_samples]
                if len(ping.starboard_data) >= num_samples:
                    frame[i, num_samples:] = ping.starboard_data[:num_samples]

        return self._normalize_to_uint8(frame)

    def get_frame_count(self, sonar_data: SonarData) -> int:
        return len(sonar_data.pings) if sonar_data.pings else 0


sonar_parser = SonarParser()
