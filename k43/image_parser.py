from PIL import Image
from dataclasses import dataclass
from typing import Tuple, List


@dataclass
class PixelData:
    x: int
    y: int
    r: int
    g: int
    b: int
    brightness: float


class ImageParser:
    def __init__(self, image_path: str, sample_rate: float = 0.1):
        self.image_path = image_path
        self.sample_rate = max(0.01, min(1.0, sample_rate))
        self.image = None
        self.pixels: List[PixelData] = []

    def load_image(self) -> None:
        self.image = Image.open(self.image_path).convert('RGB')

    def downsample(self) -> Tuple[int, int]:
        if self.image is None:
            self.load_image()
        
        original_width, original_height = self.image.size
        new_width = max(1, int(original_width * self.sample_rate))
        new_height = max(1, int(original_height * self.sample_rate))
        
        self.image = self.image.resize((new_width, new_height), Image.Resampling.LANCZOS)
        return new_width, new_height

    def extract_pixels(self) -> List[PixelData]:
        if self.image is None:
            self.load_image()
            self.downsample()
        
        width, height = self.image.size
        self.pixels = []
        
        for y in range(height):
            for x in range(width):
                r, g, b = self.image.getpixel((x, y))
                brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
                self.pixels.append(PixelData(x, y, r, g, b, brightness))
        
        return self.pixels

    def get_dimensions(self) -> Tuple[int, int]:
        if self.image is None:
            self.load_image()
        return self.image.size

    def process(self) -> Tuple[List[PixelData], int, int]:
        self.load_image()
        width, height = self.downsample()
        pixels = self.extract_pixels()
        return pixels, width, height
