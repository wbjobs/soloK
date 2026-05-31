import os
from typing import Dict, Generator, Optional, Tuple
import numpy as np
import cv2


def get_video_info(video_path: str) -> Dict:
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Failed to open video file: {video_path}")

    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration = frame_count / fps if fps > 0 else 0

        return {
            "fps": fps,
            "frame_count": frame_count,
            "width": width,
            "height": height,
            "resolution": (width, height),
            "duration": duration
        }
    finally:
        cap.release()


def extract_frame(video_path: str, frame_number: int) -> Optional[np.ndarray]:
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Failed to open video file: {video_path}")

    try:
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if frame_number < 0 or frame_number >= total_frames:
            raise ValueError(
                f"Frame number {frame_number} out of range (0 to {total_frames - 1})"
            )

        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
        ret, frame = cap.read()

        if not ret:
            return None

        return frame
    finally:
        cap.release()


def save_frame(frame: np.ndarray, output_path: str) -> bool:
    if frame is None or frame.size == 0:
        raise ValueError("Invalid frame data")

    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    return cv2.imwrite(output_path, frame)


def get_video_frames_generator(
    video_path: str,
    sample_rate: int = 1,
    start_frame: int = 0,
    end_frame: Optional[int] = None
) -> Generator[np.ndarray, None, None]:
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    if sample_rate < 1:
        raise ValueError("Sample rate must be at least 1")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Failed to open video file: {video_path}")

    try:
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        if end_frame is None:
            end_frame = total_frames

        start_frame = max(0, min(start_frame, total_frames - 1))
        end_frame = max(start_frame, min(end_frame, total_frames))

        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

        frame_idx = start_frame
        while frame_idx < end_frame:
            ret, frame = cap.read()

            if not ret:
                break

            if (frame_idx - start_frame) % sample_rate == 0:
                yield frame

            frame_idx += 1
    finally:
        cap.release()


def extract_frames_range(
    video_path: str,
    start_frame: int,
    end_frame: int,
    sample_rate: int = 1
) -> Tuple[np.ndarray, ...]:
    frames = []
    for frame in get_video_frames_generator(
        video_path,
        sample_rate=sample_rate,
        start_frame=start_frame,
        end_frame=end_frame
    ):
        frames.append(frame)
    return tuple(frames)


def save_video_frames(
    video_path: str,
    output_dir: str,
    sample_rate: int = 1,
    start_frame: int = 0,
    end_frame: Optional[int] = None,
    filename_format: str = "frame_{:06d}.jpg"
) -> Dict:
    if not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    info = get_video_info(video_path)
    saved_count = 0
    saved_paths = []

    for frame_idx, frame in enumerate(get_video_frames_generator(
        video_path,
        sample_rate=sample_rate,
        start_frame=start_frame,
        end_frame=end_frame
    ), start=start_frame):
        if (frame_idx - start_frame) % sample_rate == 0:
            output_path = os.path.join(output_dir, filename_format.format(frame_idx))
            if save_frame(frame, output_path):
                saved_count += 1
                saved_paths.append(output_path)

    return {
        "video_path": video_path,
        "output_dir": output_dir,
        "sample_rate": sample_rate,
        "total_frames": info["frame_count"],
        "saved_count": saved_count,
        "saved_paths": saved_paths
    }


def get_frame_at_timestamp(video_path: str, timestamp: float) -> Optional[np.ndarray]:
    info = get_video_info(video_path)
    fps = info["fps"]

    if fps <= 0:
        raise ValueError("Invalid video FPS")

    frame_number = int(timestamp * fps)
    return extract_frame(video_path, frame_number)


def resize_frame(frame: np.ndarray, width: int = None, height: int = None) -> np.ndarray:
    if frame is None:
        raise ValueError("Invalid frame")

    h, w = frame.shape[:2]

    if width is None and height is None:
        return frame

    if width is None:
        ratio = height / h
        width = int(w * ratio)
    elif height is None:
        ratio = width / w
        height = int(h * ratio)

    return cv2.resize(frame, (width, height))


def crop_frame(frame: np.ndarray, x1: int, y1: int, x2: int, y2: int) -> np.ndarray:
    if frame is None:
        raise ValueError("Invalid frame")

    h, w = frame.shape[:2]

    x1 = max(0, min(x1, w))
    y1 = max(0, min(y1, h))
    x2 = max(x1, min(x2, w))
    y2 = max(y1, min(y2, h))

    return frame[y1:y2, x1:x2]


def draw_bounding_box(
    frame: np.ndarray,
    bbox: Tuple[float, float, float, float],
    label: str = "",
    color: Tuple[int, int, int] = (0, 255, 0),
    thickness: int = 2
) -> np.ndarray:
    if frame is None:
        raise ValueError("Invalid frame")

    x1, y1, x2, y2 = [int(coord) for coord in bbox]

    frame = cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)

    if label:
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.5
        (text_width, text_height), _ = cv2.getTextSize(label, font, font_scale, thickness)

        background_y1 = max(0, y1 - text_height - 10)
        background_y2 = y1
        background_x1 = x1
        background_x2 = x1 + text_width + 10

        frame = cv2.rectangle(
            frame,
            (background_x1, background_y1),
            (background_x2, background_y2),
            color,
            -1
        )

        frame = cv2.putText(
            frame,
            label,
            (x1 + 5, y1 - 5),
            font,
            font_scale,
            (255, 255, 255),
            thickness
        )

    return frame
