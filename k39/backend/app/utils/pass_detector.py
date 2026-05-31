import math
from typing import List, Dict, Any, Optional, Tuple


class PassDetector:
    def __init__(self, min_pass_distance: float = 2.0, max_pass_time: float = 3.0):
        self.min_pass_distance = min_pass_distance
        self.max_pass_time = max_pass_time
        self.last_ball_owner = None
        self.last_ball_position = None
        self.last_ball_time = None
        self.pass_start_position = None
        self.pass_start_time = None
        self.pass_start_player = None

    def detect(
        self,
        ball_positions: List[Dict[str, Any]],
        player_positions: List[Dict[str, Any]],
        timestamp: float
    ) -> Optional[Dict[str, Any]]:
        if not ball_positions or len(ball_positions) < 2:
            return None

        current_ball = ball_positions[-1]
        prev_ball = ball_positions[-2]

        ball_x, ball_y = current_ball['x'], current_ball['y']
        prev_ball_x, prev_ball_y = prev_ball['x'], prev_ball['y']

        ball_move_distance = math.sqrt(
            (ball_x - prev_ball_x) ** 2 + (ball_y - prev_ball_y) ** 2
        )

        current_owner = self._find_ball_owner(ball_x, ball_y, player_positions)

        if self.last_ball_owner is None:
            self.last_ball_owner = current_owner
            self.last_ball_position = (ball_x, ball_y)
            self.last_ball_time = timestamp
            return None

        if current_owner and self.last_ball_owner:
            if current_owner['player_id'] != self.last_ball_owner['player_id']:
                if current_owner['team'] == self.last_ball_owner['team']:
                    pass_event = self._analyze_pass(
                        self.last_ball_owner,
                        current_owner,
                        self.last_ball_position,
                        (ball_x, ball_y),
                        self.last_ball_time,
                        timestamp
                    )
                    self.last_ball_owner = current_owner
                    self.last_ball_position = (ball_x, ball_y)
                    self.last_ball_time = timestamp
                    return pass_event

        if ball_move_distance > self.min_pass_distance and self.pass_start_position is None:
            self.pass_start_position = (prev_ball_x, prev_ball_y)
            self.pass_start_time = self.last_ball_time
            self.pass_start_player = self.last_ball_owner

        if self.pass_start_position and current_owner:
            if self.pass_start_player and current_owner['player_id'] != self.pass_start_player['player_id']:
                if current_owner['team'] == self.pass_start_player['team']:
                    time_diff = timestamp - self.pass_start_time
                    if time_diff <= self.max_pass_time:
                        pass_event = self._analyze_pass(
                            self.pass_start_player,
                            current_owner,
                            self.pass_start_position,
                            (ball_x, ball_y),
                            self.pass_start_time,
                            timestamp
                        )
                        self.pass_start_position = None
                        self.pass_start_time = None
                        self.pass_start_player = None
                        self.last_ball_owner = current_owner
                        self.last_ball_position = (ball_x, ball_y)
                        self.last_ball_time = timestamp
                        return pass_event

        if timestamp - self.last_ball_time > self.max_pass_time:
            self.pass_start_position = None
            self.pass_start_time = None
            self.pass_start_player = None

        if current_owner:
            self.last_ball_owner = current_owner
            self.last_ball_position = (ball_x, ball_y)
            self.last_ball_time = timestamp

        return None

    def _find_ball_owner(
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
            if dist < 3.0 and dist < min_distance:
                min_distance = dist
                closest_player = player

        return closest_player

    def _analyze_pass(
        self,
        passer: Dict[str, Any],
        receiver: Dict[str, Any],
        start_pos: Tuple[float, float],
        end_pos: Tuple[float, float],
        start_time: float,
        end_time: float
    ) -> Dict[str, Any]:
        pass_distance = math.sqrt(
            (end_pos[0] - start_pos[0]) ** 2 + (end_pos[1] - start_pos[1]) ** 2
        )

        pass_direction = self._calculate_direction(start_pos, end_pos)
        pass_type = self._classify_pass_type(pass_distance)
        pass_speed = pass_distance / max(end_time - start_time, 0.001) if end_time > start_time else 0
        success = receiver is not None

        return {
            'event_type': 'pass',
            'timestamp': end_time,
            'x': end_pos[0],
            'y': end_pos[1],
            'player_id': passer['player_id'],
            'receiver_id': receiver['player_id'] if receiver else None,
            'team': passer['team'],
            'details': {
                'pass_type': pass_type,
                'pass_distance': round(pass_distance, 2),
                'pass_direction': pass_direction,
                'pass_speed': round(pass_speed, 2),
                'success': success,
                'start_position': {'x': start_pos[0], 'y': start_pos[1]},
                'end_position': {'x': end_pos[0], 'y': end_pos[1]},
                'start_time': start_time,
                'end_time': end_time
            }
        }

    def _calculate_direction(
        self,
        start_pos: Tuple[float, float],
        end_pos: Tuple[float, float]
    ) -> str:
        dx = end_pos[0] - start_pos[0]
        dy = end_pos[1] - start_pos[1]

        angle = math.degrees(math.atan2(dy, dx))

        if -22.5 <= angle < 22.5:
            return 'right'
        elif 22.5 <= angle < 67.5:
            return 'up_right'
        elif 67.5 <= angle < 112.5:
            return 'up'
        elif 112.5 <= angle < 157.5:
            return 'up_left'
        elif 157.5 <= angle or angle < -157.5:
            return 'left'
        elif -157.5 <= angle < -112.5:
            return 'down_left'
        elif -112.5 <= angle < -67.5:
            return 'down'
        else:
            return 'down_right'

    def _classify_pass_type(self, distance: float) -> str:
        if distance < 15:
            return 'short'
        elif 15 <= distance <= 30:
            return 'medium'
        else:
            return 'long'

    def reset(self):
        self.last_ball_owner = None
        self.last_ball_position = None
        self.last_ball_time = None
        self.pass_start_position = None
        self.pass_start_time = None
        self.pass_start_player = None
