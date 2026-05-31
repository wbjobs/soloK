import math
from typing import List, Dict, Any, Optional, Tuple


class ShotDetector:
    def __init__(
        self,
        min_shot_speed: float = 10.0,
        penalty_area_x: float = 83.5,
        penalty_area_y_min: float = 18.5,
        penalty_area_y_max: float = 61.5,
        goal_width: float = 7.32,
        field_length: float = 105.0,
        field_width: float = 68.0
    ):
        self.min_shot_speed = min_shot_speed
        self.penalty_area_x = penalty_area_x
        self.penalty_area_y_min = penalty_area_y_min
        self.penalty_area_y_max = penalty_area_y_max
        self.goal_width = goal_width
        self.field_length = field_length
        self.field_width = field_width
        self.trajectory_window = []
        self.last_ball_owner = None

    def detect(
        self,
        ball_trajectory: List[Dict[str, Any]],
        player_positions: List[Dict[str, Any]],
        goal_position: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        if not ball_trajectory or len(ball_trajectory) < 3:
            return None

        self.trajectory_window = ball_trajectory[-10:]

        current_ball = ball_trajectory[-1]
        prev_ball = ball_trajectory[-2]

        ball_x, ball_y = current_ball['x'], current_ball['y']
        timestamp = current_ball.get('timestamp', 0)
        prev_timestamp = prev_ball.get('timestamp', timestamp - 0.04)

        time_diff = max(timestamp - prev_timestamp, 0.001)

        velocity = self._calculate_velocity(prev_ball, current_ball, time_diff)
        speed = math.sqrt(velocity['vx'] ** 2 + velocity['vy'] ** 2)

        if speed < self.min_shot_speed:
            self._update_ball_owner(ball_x, ball_y, player_positions)
            return None

        direction_to_goal = self._calculate_direction_to_goal(
            ball_x, ball_y, goal_position
        )
        ball_direction = math.atan2(velocity['vy'], velocity['vx'])

        angle_diff = abs(ball_direction - direction_to_goal)
        angle_diff = min(angle_diff, 2 * math.pi - angle_diff)

        if angle_diff > math.pi / 4:
            self._update_ball_owner(ball_x, ball_y, player_positions)
            return None

        is_towards_goal = self._is_moving_towards_goal(
            ball_trajectory[-5:], goal_position
        )

        if not is_towards_goal:
            self._update_ball_owner(ball_x, ball_y, player_positions)
            return None

        shooter = self._find_shooter(ball_x, ball_y, player_positions)
        if shooter is None and self.last_ball_owner:
            shooter = self.last_ball_owner

        if shooter is None:
            return None

        shot_angle = self._calculate_shot_angle(ball_x, ball_y, goal_position)
        shot_zone = self._classify_shot_zone(ball_x, ball_y)
        is_on_target, target_position = self._is_shot_on_target(
            ball_trajectory, goal_position
        )

        shot_event = {
            'event_type': 'shot',
            'timestamp': timestamp,
            'x': ball_x,
            'y': ball_y,
            'player_id': shooter['player_id'],
            'team': shooter['team'],
            'details': {
                'shot_speed': round(speed, 2),
                'shot_angle': round(math.degrees(shot_angle), 2),
                'shot_zone': shot_zone,
                'on_target': is_on_target,
                'target_position': target_position,
                'goal_position': goal_position,
                'velocity': {'vx': round(velocity['vx'], 2), 'vy': round(velocity['vy'], 2)},
                'shooter_position': {'x': shooter['x'], 'y': shooter['y']},
                'distance_to_goal': round(self._calculate_distance_to_goal(ball_x, ball_y, goal_position), 2)
            }
        }

        return shot_event

    def _calculate_velocity(
        self,
        prev_ball: Dict[str, Any],
        curr_ball: Dict[str, Any],
        time_diff: float
    ) -> Dict[str, float]:
        vx = (curr_ball['x'] - prev_ball['x']) / time_diff
        vy = (curr_ball['y'] - prev_ball['y']) / time_diff
        return {'vx': vx, 'vy': vy}

    def _calculate_direction_to_goal(
        self,
        ball_x: float,
        ball_y: float,
        goal_position: Dict[str, Any]
    ) -> float:
        goal_center_x = goal_position['x']
        goal_center_y = goal_position['y']
        return math.atan2(goal_center_y - ball_y, goal_center_x - ball_x)

    def _is_moving_towards_goal(
        self,
        recent_trajectory: List[Dict[str, Any]],
        goal_position: Dict[str, Any]
    ) -> bool:
        if len(recent_trajectory) < 2:
            return False

        first_dist = self._calculate_distance_to_goal(
            recent_trajectory[0]['x'], recent_trajectory[0]['y'], goal_position
        )
        last_dist = self._calculate_distance_to_goal(
            recent_trajectory[-1]['x'], recent_trajectory[-1]['y'], goal_position
        )

        return last_dist < first_dist * 0.95

    def _calculate_distance_to_goal(
        self,
        x: float,
        y: float,
        goal_position: Dict[str, Any]
    ) -> float:
        return math.sqrt(
            (x - goal_position['x']) ** 2 + (y - goal_position['y']) ** 2
        )

    def _find_shooter(
        self,
        ball_x: float,
        ball_y: float,
        player_positions: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        min_distance = float('inf')
        closest_player = None

        for player in player_positions:
            if player.get('player_id') is None:
                continue
            dist = math.sqrt(
                (ball_x - player['x']) ** 2 + (ball_y - player['y']) ** 2
            )
            if dist < 5.0 and dist < min_distance:
                min_distance = dist
                closest_player = player

        return closest_player

    def _update_ball_owner(
        self,
        ball_x: float,
        ball_y: float,
        player_positions: List[Dict[str, Any]]
    ):
        owner = self._find_shooter(ball_x, ball_y, player_positions)
        if owner:
            self.last_ball_owner = owner

    def _calculate_shot_angle(
        self,
        x: float,
        y: float,
        goal_position: Dict[str, Any]
    ) -> float:
        goal_left = goal_position['y'] - self.goal_width / 2
        goal_right = goal_position['y'] + self.goal_width / 2

        angle_left = math.atan2(goal_left - y, goal_position['x'] - x)
        angle_right = math.atan2(goal_right - y, goal_position['x'] - x)

        return abs(angle_right - angle_left)

    def _classify_shot_zone(self, x: float, y: float) -> str:
        if x >= self.penalty_area_x:
            if self.penalty_area_y_min <= y <= self.penalty_area_y_max:
                return 'penalty_area'
            else:
                return 'byline'
        elif x >= 66.5:
            return 'box_edge'
        elif x >= 52.5:
            return 'final_third'
        else:
            return 'long_range'

    def _is_shot_on_target(
        self,
        trajectory: List[Dict[str, Any]],
        goal_position: Dict[str, Any]
    ) -> Tuple[bool, Dict[str, float]]:
        if len(trajectory) < 3:
            return False, {'x': goal_position['x'], 'y': goal_position['y']}

        vx_list = []
        vy_list = []
        for i in range(1, min(5, len(trajectory))):
            time_diff = max(trajectory[i]['timestamp'] - trajectory[i-1]['timestamp'], 0.001)
            vx_list.append((trajectory[i]['x'] - trajectory[i-1]['x']) / time_diff)
            vy_list.append((trajectory[i]['y'] - trajectory[i-1]['y']) / time_diff)

        avg_vx = sum(vx_list) / len(vx_list) if vx_list else 0
        avg_vy = sum(vy_list) / len(vy_list) if vy_list else 0

        last_ball = trajectory[-1]
        if abs(avg_vx) < 0.001:
            return False, {'x': last_ball['x'], 'y': last_ball['y']}

        time_to_goal = (goal_position['x'] - last_ball['x']) / avg_vx

        if time_to_goal < 0:
            return False, {'x': last_ball['x'], 'y': last_ball['y']}

        predicted_y = last_ball['y'] + avg_vy * time_to_goal

        goal_top = goal_position['y'] + self.goal_width / 2
        goal_bottom = goal_position['y'] - self.goal_width / 2

        is_on_target = goal_bottom <= predicted_y <= goal_top

        return is_on_target, {'x': goal_position['x'], 'y': round(predicted_y, 2)}

    def reset(self):
        self.trajectory_window = []
        self.last_ball_owner = None
