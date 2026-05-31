from dataclasses import dataclass
from typing import List
import math
from image_parser import PixelData


@dataclass
class Point3D:
    x: float
    y: float
    z: float
    char: str
    brightness: float


class PointCloudGenerator:
    ASCII_CHARS = ' .:-=+*#%@'
    DEPTH_SCALE = 10.0

    def __init__(self, pixels: List[PixelData], width: int, height: int):
        self.pixels = pixels
        self.width = width
        self.height = height
        self.points: List[Point3D] = []
        self.center_x = width / 2.0
        self.center_y = height / 2.0

    def _brightness_to_char(self, brightness: float) -> str:
        index = int(brightness * (len(self.ASCII_CHARS) - 1))
        return self.ASCII_CHARS[min(max(index, 0), len(self.ASCII_CHARS) - 1)]

    def generate(self) -> List[Point3D]:
        self.points = []
        
        for pixel in self.pixels:
            x = pixel.x - self.center_x
            y = -(pixel.y - self.center_y)
            z = pixel.brightness * self.DEPTH_SCALE
            char = self._brightness_to_char(pixel.brightness)
            
            self.points.append(Point3D(x, y, z, char, pixel.brightness))
        
        return self.points

    def rotate_y(self, angle_rad: float) -> List[Point3D]:
        cos_theta = math.cos(angle_rad)
        sin_theta = math.sin(angle_rad)
        
        rotated_points = []
        for p in self.points:
            x_rot = p.x * cos_theta + p.z * sin_theta
            z_rot = -p.x * sin_theta + p.z * cos_theta
            rotated_points.append(Point3D(x_rot, p.y, z_rot, p.char, p.brightness))
        
        return rotated_points

    def rotate_x(self, angle_rad: float) -> List[Point3D]:
        cos_theta = math.cos(angle_rad)
        sin_theta = math.sin(angle_rad)
        
        rotated_points = []
        for p in self.points:
            y_rot = p.y * cos_theta - p.z * sin_theta
            z_rot = p.y * sin_theta + p.z * cos_theta
            rotated_points.append(Point3D(p.x, y_rot, z_rot, p.char, p.brightness))
        
        return rotated_points
