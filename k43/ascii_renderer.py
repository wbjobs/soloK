from dataclasses import dataclass
from typing import List, Optional
from point_cloud_generator import Point3D


ANSI_COLORS = [
    '30',
    '34',
    '36',
    '32',
    '35',
    '31',
    '33',
    '37',
    '90',
    '94',
    '96',
    '92',
    '95',
    '91',
    '93',
    '97',
]
ANSI_RESET = '\033[0m'
MAX_DEPTH = 10.0


@dataclass
class RenderedPixel:
    char: str
    depth: float
    color_code: Optional[str] = None


class ASCIIRenderer:
    def __init__(self, width: int, height: int, aspect_ratio: float = 2.0, use_color: bool = False):
        self.width = width
        self.height = height
        self.aspect_ratio = aspect_ratio
        self.use_color = use_color
        self.buffer: List[List[Optional[RenderedPixel]]] = []
        self._blank_line = ' ' * width
        self._init_buffer()

    def _init_buffer(self) -> None:
        self.buffer = [[None for _ in range(self.width)] for _ in range(self.height)]

    def clear(self) -> None:
        self._init_buffer()

    def project_point(self, point: Point3D) -> tuple[int, int]:
        screen_x = int(point.x + self.width / 2)
        screen_y = int(self.height / 2 - point.y / self.aspect_ratio)
        return screen_x, screen_y

    def _depth_to_color(self, depth: float) -> str:
        normalized = max(0.0, min(1.0, (depth + MAX_DEPTH) / (2 * MAX_DEPTH)))
        index = int(normalized * (len(ANSI_COLORS) - 1))
        return ANSI_COLORS[min(max(index, 0), len(ANSI_COLORS) - 1)]

    def render_points(self, points: List[Point3D]) -> None:
        self.clear()

        sorted_points = sorted(points, key=lambda p: p.z, reverse=True)

        for point in sorted_points:
            screen_x, screen_y = self.project_point(point)

            if 0 <= screen_x < self.width and 0 <= screen_y < self.height:
                current = self.buffer[screen_y][screen_x]
                if current is None or point.z > current.depth:
                    color_code = self._depth_to_color(point.z) if self.use_color else None
                    self.buffer[screen_y][screen_x] = RenderedPixel(point.char, point.z, color_code)

    def _get_display_char(self, pixel: Optional[RenderedPixel]) -> str:
        if pixel is None:
            return ' '
        if self.use_color and pixel.color_code:
            return f'\033[{pixel.color_code}m{pixel.char}{ANSI_RESET}'
        return pixel.char

    def get_frame(self, line_ending: str = '\n') -> str:
        lines = []
        for row in self.buffer:
            line_chars = []
            for pixel in row:
                line_chars.append(self._get_display_char(pixel))
            line = ''.join(line_chars)
            lines.append(line)
        return line_ending.join(lines)

    def get_animated_bytes(self) -> bytes:
        frame = self.get_frame(line_ending='\r\n')
        output = '\033[H' + frame
        if self.use_color:
            output += ANSI_RESET
        return output.encode('utf-8')

    def get_plain_frame(self, line_ending: str = '\n') -> str:
        lines = []
        for row in self.buffer:
            line_chars = []
            for pixel in row:
                line_chars.append(pixel.char if pixel else ' ')
            line = ''.join(line_chars)
            lines.append(line)
        return line_ending.join(lines)

    def export_frame(self, file_path: str) -> None:
        frame = self.get_plain_frame(line_ending='\n')
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(frame)
