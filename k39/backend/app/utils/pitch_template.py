from typing import List, Tuple, Dict


PITCH_DIMENSIONS = (105, 68)
PITCH_WIDTH, PITCH_HEIGHT = PITCH_DIMENSIONS


def get_standard_pitch_points() -> Dict[str, Tuple[float, float]]:
    return {
        "top_left": (0, 0),
        "top_right": (PITCH_WIDTH, 0),
        "bottom_left": (0, PITCH_HEIGHT),
        "bottom_right": (PITCH_WIDTH, PITCH_HEIGHT),
        "center_spot": (PITCH_WIDTH / 2, PITCH_HEIGHT / 2),
        "left_penalty_spot": (11, PITCH_HEIGHT / 2),
        "right_penalty_spot": (PITCH_WIDTH - 11, PITCH_HEIGHT / 2),
        "left_goal_left": (0, PITCH_HEIGHT / 2 - 7.32 / 2),
        "left_goal_right": (0, PITCH_HEIGHT / 2 + 7.32 / 2),
        "right_goal_left": (PITCH_WIDTH, PITCH_HEIGHT / 2 - 7.32 / 2),
        "right_goal_right": (PITCH_WIDTH, PITCH_HEIGHT / 2 + 7.32 / 2),
        "left_penalty_area_top_left": (0, PITCH_HEIGHT / 2 - 20.16),
        "left_penalty_area_top_right": (16.5, PITCH_HEIGHT / 2 - 20.16),
        "left_penalty_area_bottom_left": (0, PITCH_HEIGHT / 2 + 20.16),
        "left_penalty_area_bottom_right": (16.5, PITCH_HEIGHT / 2 + 20.16),
        "right_penalty_area_top_left": (PITCH_WIDTH - 16.5, PITCH_HEIGHT / 2 - 20.16),
        "right_penalty_area_top_right": (PITCH_WIDTH, PITCH_HEIGHT / 2 - 20.16),
        "right_penalty_area_bottom_left": (PITCH_WIDTH - 16.5, PITCH_HEIGHT / 2 + 20.16),
        "right_penalty_area_bottom_right": (PITCH_WIDTH, PITCH_HEIGHT / 2 + 20.16),
        "left_goal_area_top_left": (0, PITCH_HEIGHT / 2 - 9.16),
        "left_goal_area_top_right": (5.5, PITCH_HEIGHT / 2 - 9.16),
        "left_goal_area_bottom_left": (0, PITCH_HEIGHT / 2 + 9.16),
        "left_goal_area_bottom_right": (5.5, PITCH_HEIGHT / 2 + 9.16),
        "right_goal_area_top_left": (PITCH_WIDTH - 5.5, PITCH_HEIGHT / 2 - 9.16),
        "right_goal_area_top_right": (PITCH_WIDTH, PITCH_HEIGHT / 2 - 9.16),
        "right_goal_area_bottom_left": (PITCH_WIDTH - 5.5, PITCH_HEIGHT / 2 + 9.16),
        "right_goal_area_bottom_right": (PITCH_WIDTH, PITCH_HEIGHT / 2 + 9.16),
        "center_circle_top": (PITCH_WIDTH / 2, PITCH_HEIGHT / 2 - 9.15),
        "center_circle_bottom": (PITCH_WIDTH / 2, PITCH_HEIGHT / 2 + 9.15),
        "center_circle_left": (PITCH_WIDTH / 2 - 9.15, PITCH_HEIGHT / 2),
        "center_circle_right": (PITCH_WIDTH / 2 + 9.15, PITCH_HEIGHT / 2),
        "halfway_line_top": (PITCH_WIDTH / 2, 0),
        "halfway_line_bottom": (PITCH_WIDTH / 2, PITCH_HEIGHT),
    }


def get_pitch_lines() -> Dict[str, List[Tuple[float, float]]]:
    points = get_standard_pitch_points()
    return {
        "top_sideline": [points["top_left"], points["top_right"]],
        "bottom_sideline": [points["bottom_left"], points["bottom_right"]],
        "left_touchline": [points["top_left"], points["bottom_left"]],
        "right_touchline": [points["top_right"], points["bottom_right"]],
        "halfway_line": [points["halfway_line_top"], points["halfway_line_bottom"]],
        "left_penalty_area_front": [
            points["left_penalty_area_top_right"],
            points["left_penalty_area_bottom_right"],
        ],
        "left_penalty_area_top": [
            points["left_penalty_area_top_left"],
            points["left_penalty_area_top_right"],
        ],
        "left_penalty_area_bottom": [
            points["left_penalty_area_bottom_left"],
            points["left_penalty_area_bottom_right"],
        ],
        "right_penalty_area_front": [
            points["right_penalty_area_top_left"],
            points["right_penalty_area_bottom_left"],
        ],
        "right_penalty_area_top": [
            points["right_penalty_area_top_left"],
            points["right_penalty_area_top_right"],
        ],
        "right_penalty_area_bottom": [
            points["right_penalty_area_bottom_left"],
            points["right_penalty_area_bottom_right"],
        ],
        "left_goal_area_front": [
            points["left_goal_area_top_right"],
            points["left_goal_area_bottom_right"],
        ],
        "left_goal_area_top": [
            points["left_goal_area_top_left"],
            points["left_goal_area_top_right"],
        ],
        "left_goal_area_bottom": [
            points["left_goal_area_bottom_left"],
            points["left_goal_area_bottom_right"],
        ],
        "right_goal_area_front": [
            points["right_goal_area_top_left"],
            points["right_goal_area_bottom_left"],
        ],
        "right_goal_area_top": [
            points["right_goal_area_top_left"],
            points["right_goal_area_top_right"],
        ],
        "right_goal_area_bottom": [
            points["right_goal_area_bottom_left"],
            points["right_goal_area_bottom_right"],
        ],
    }


def get_penalty_area_points(side: str = "left") -> List[Tuple[float, float]]:
    points = get_standard_pitch_points()
    if side == "left":
        return [
            points["left_penalty_area_top_left"],
            points["left_penalty_area_top_right"],
            points["left_penalty_area_bottom_right"],
            points["left_penalty_area_bottom_left"],
        ]
    else:
        return [
            points["right_penalty_area_top_left"],
            points["right_penalty_area_top_right"],
            points["right_penalty_area_bottom_right"],
            points["right_penalty_area_bottom_left"],
        ]


def get_center_circle() -> Dict[str, float]:
    return {
        "center_x": PITCH_WIDTH / 2,
        "center_y": PITCH_HEIGHT / 2,
        "radius": 9.15,
    }
