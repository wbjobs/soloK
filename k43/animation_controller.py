import sys
import os
import time
import math
from typing import List
from point_cloud_generator import PointCloudGenerator
from ascii_renderer import ASCIIRenderer


def _enable_windows_vt100() -> None:
    if sys.platform != 'win32':
        return
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        STD_OUTPUT_HANDLE = -11
        ENABLE_VIRTUAL_TERMINAL_PROCESSING = 0x0004
        handle = kernel32.GetStdHandle(STD_OUTPUT_HANDLE)
        mode = ctypes.c_ulong()
        kernel32.GetConsoleMode(handle, ctypes.byref(mode))
        kernel32.SetConsoleMode(handle, mode.value | ENABLE_VIRTUAL_TERMINAL_PROCESSING)
    except Exception:
        pass


class AnimationController:
    def __init__(
        self,
        point_cloud_gen: PointCloudGenerator,
        renderer: ASCIIRenderer,
        frames_per_second: int = 30,
        rotation_speed: float = 0.1
    ):
        self.point_cloud_gen = point_cloud_gen
        self.renderer = renderer
        self.fps = frames_per_second
        self.rotation_speed = rotation_speed
        self.current_angle = 0.0
        self.is_running = False
        self.frame_delay = 1.0 / self.fps
        self._vt100_enabled = False

    def _ensure_vt100(self) -> None:
        if not self._vt100_enabled:
            _enable_windows_vt100()
            self._vt100_enabled = True

    def _write_raw(self, data: bytes) -> None:
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()

    def _write_ctrl(self, seq: str) -> None:
        self._write_raw(seq.encode('utf-8'))

    def _enter_alt_screen(self) -> None:
        self._write_ctrl('\033[?1049h')

    def _leave_alt_screen(self) -> None:
        self._write_ctrl('\033[?1049l')

    def _hide_cursor(self) -> None:
        self._write_ctrl('\033[?25l')

    def _show_cursor(self) -> None:
        self._write_ctrl('\033[?25h')

    def render_static_frame(self) -> str:
        points = self.point_cloud_gen.points
        self.renderer.render_points(points)
        return self.renderer.get_frame()

    def render_static_plain(self) -> str:
        points = self.point_cloud_gen.points
        self.renderer.render_points(points)
        return self.renderer.get_plain_frame()

    def render_rotated_frame(self, angle_rad: float) -> None:
        rotated_points = self.point_cloud_gen.rotate_y(angle_rad)
        self.renderer.render_points(rotated_points)

    def _render_and_display_frame(self, angle_rad: float) -> str:
        self.render_rotated_frame(angle_rad)
        output = self.renderer.get_animated_bytes()
        self._write_raw(output)
        return self.renderer.get_frame()

    def _start_animation(self) -> None:
        self._ensure_vt100()
        self._enter_alt_screen()
        self._hide_cursor()

    def _stop_animation(self) -> None:
        self._show_cursor()
        self._leave_alt_screen()

    def print_animation(self, duration: float = 10.0) -> List[str]:
        frames = []
        total_frames = int(duration * self.fps)

        self._start_animation()

        try:
            for i in range(total_frames):
                start_time = time.time()

                angle = (i * self.rotation_speed) % (2 * math.pi)
                frame = self._render_and_display_frame(angle)
                frames.append(frame)

                elapsed = time.time() - start_time
                sleep_time = max(0, self.frame_delay - elapsed)
                if sleep_time > 0:
                    time.sleep(sleep_time)
        finally:
            self._stop_animation()

        return frames

    def play_animation_continuous(self) -> None:
        self._start_animation()

        try:
            while True:
                start_time = time.time()

                self._render_and_display_frame(self.current_angle)

                self.current_angle += self.rotation_speed
                if self.current_angle >= 2 * math.pi:
                    self.current_angle -= 2 * math.pi

                elapsed = time.time() - start_time
                sleep_time = max(0, self.frame_delay - elapsed)
                if sleep_time > 0:
                    time.sleep(sleep_time)
        except KeyboardInterrupt:
            pass
        finally:
            self._stop_animation()

    def export_animation(self, file_path: str, duration: float = 10.0) -> None:
        total_frames = int(duration * self.fps)
        with open(file_path, 'w', encoding='utf-8') as f:
            for i in range(total_frames):
                angle = (i * self.rotation_speed) % (2 * math.pi)
                self.render_rotated_frame(angle)
                frame = self.renderer.get_plain_frame()
                f.write(f"Frame {i + 1}:\n{frame}\n\n")
