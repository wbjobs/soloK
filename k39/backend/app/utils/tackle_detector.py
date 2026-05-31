import math
from typing import List, Dict, Any, Optional, Tuple


class TackleDetector:
    def __init__(
        self,
        min_distance_change: float = 1.0,
        tackle_distance_threshold: float = 2.0,
        min_velocity_change: float = 3.0,
        cooldown_period: float = 2.0
    ):
        self.min_distance_change = min_distance_change
        self.tackle_distance_threshold = tackle_distance_threshold
        self.min_velocity_change = min_velocity_change
        self.cooldown_period = cooldown_period
        self.last_tackle_time = -float('inf')
        self.previous_positions = {}
        self.ball_owner_history = []
        self.potential_tackles = []

    def detect(
        self,
        player_positions: List[Dict[str, Any]],
        ball_owner: Optional[Dict[str, Any]],
        timestamp: float
    ) -> Optional[Dict[str, Any]]:
        if timestamp - self.last_tackle_time < self.cooldown_period:
            self._update_state(player_positions, ball_owner)
            return None

        if not player_positions or ball_owner is None:
            self._update_state(player_positions, ball_owner)
            return None

        if len(self.ball_owner_history) >= 2:
            prev_owner = self.ball_owner_history[-1]
            if prev_owner and ball_owner:
                if prev_owner['team'] != ball_owner['team']:
                    tackle_event = self._analyze_tackle(
                        prev_owner, ball_owner, player_positions, timestamp
                    )
                    if tackle_event:
                        self.last_tackle_time = timestamp
                        self._update_state(player_positions, ball_owner)
                        return tackle_event

        distance_changes = self._calculate_distance_changes(player_positions)
        potential_tacklers = self._find_potential_tacklers(
            player_positions, ball_owner, distance_changes, timestamp
        )

        for tackler in potential_tacklers:
            tackle_event = self._verify_tackle(
                tackler, ball_owner, player_positions, timestamp
            )
            if tackle_event:
                self.last_tackle_time = timestamp
                self._update_state(player_positions, ball_owner)
                return tackle_event

        self._update_state(player_positions, ball_owner)
        return None

    def _update_state(
        self,
        player_positions: List[Dict[str, Any]],
        ball_owner: Optional[Dict[str, Any]]
    ):
        current_positions = {}
        for player in player_positions:
            if player.get('player_id') is not None:
                current_positions[player['player_id']] = {
                    'x': player['x'],
                    'y': player['y'],
                    'team': player.get('team')
                }

        self.previous_positions = current_positions
        self.ball_owner_history.append(ball_owner)
        if len(self.ball_owner_history) > 10:
            self.ball_owner_history.pop(0)

    def _calculate_distance_changes(
        self,
        player_positions: List[Dict[str, Any]]
    ) -> Dict[int, float]:
        distance_changes = {}

        for player in player_positions:
            player_id = player.get('player_id')
            if player_id is None:
                continue

            prev_pos = self.previous_positions.get(player_id)
            if prev_pos:
                dist = math.sqrt(
                    (player['x'] - prev_pos['x']) ** 2 +
                    (player['y'] - prev_pos['y']) ** 2
                )
                distance_changes[player_id] = dist

        return distance_changes

    def _find_potential_tacklers(
        self,
        player_positions: List[Dict[str, Any]],
        ball_owner: Dict[str, Any],
        distance_changes: Dict[int, float],
        timestamp: float
    ) -> List[Dict[str, Any]]:
        potential_tacklers = []
        owner_team = ball_owner.get('team')

        for player in player_positions:
            player_id = player.get('player_id')
            if player_id is None:
                continue

            if player.get('team') == owner_team:
                continue

            distance_to_ball = math.sqrt(
                (player['x'] - ball_owner['x']) ** 2 +
                (player['y'] - ball_owner['y']) ** 2
            )

            if distance_to_ball > self.tackle_distance_threshold:
                continue

            dist_change = distance_changes.get(player_id, 0)
            if dist_change < self.min_distance_change:
                continue

            potential_tacklers.append({
                **player,
                'distance_to_ball': distance_to_ball,
                'distance_change': dist_change
            })

        potential_tacklers.sort(key=lambda x: x['distance_to_ball'])
        return potential_tacklers[:3]

    def _analyze_tackle(
        self,
        prev_owner: Dict[str, Any],
        new_owner: Dict[str, Any],
        player_positions: List[Dict[str, Any]],
        timestamp: float
    ) -> Optional[Dict[str, Any]]:
        tackle_x = (prev_owner['x'] + new_owner['x']) / 2
        tackle_y = (prev_owner['y'] + new_owner['y']) / 2

        distance_between = math.sqrt(
            (prev_owner['x'] - new_owner['x']) ** 2 +
            (prev_owner['y'] - new_owner['y']) ** 2
        )

        if distance_between > 5.0:
            return None

        tackle_result = self._determine_tackle_result(prev_owner, new_owner)
        tackle_type = self._classify_tackle_type(
            prev_owner, new_owner, distance_between
        )

        return {
            'event_type': 'tackle',
            'timestamp': timestamp,
            'x': tackle_x,
            'y': tackle_y,
            'player_id': new_owner['player_id'],
            'team': new_owner['team'],
            'details': {
                'tackle_type': tackle_type,
                'tackle_result': tackle_result,
                'tackler_id': new_owner['player_id'],
                'tackler_team': new_owner['team'],
                'victim_id': prev_owner['player_id'],
                'victim_team': prev_owner['team'],
                'distance_between': round(distance_between, 2),
                'tackle_position': {'x': tackle_x, 'y': tackle_y},
                'tackler_position': {'x': new_owner['x'], 'y': new_owner['y']},
                'victim_position': {'x': prev_owner['x'], 'y': prev_owner['y']}
            }
        }

    def _verify_tackle(
        self,
        tackler: Dict[str, Any],
        ball_owner: Dict[str, Any],
        player_positions: List[Dict[str, Any]],
        timestamp: float
    ) -> Optional[Dict[str, Any]]:
        if len(self.ball_owner_history) < 2:
            return None

        prev_owner = self.ball_owner_history[-1]
        if not prev_owner:
            return None

        if prev_owner['player_id'] != ball_owner['player_id']:
            return None

        velocity_change = self._calculate_velocity_change(
            tackler, ball_owner, timestamp
        )

        if velocity_change < self.min_velocity_change:
            return None

        tackle_result = self._determine_tackle_result(prev_owner, tackler)
        tackle_type = self._classify_tackle_type(
            tackler, ball_owner, tackler['distance_to_ball']
        )

        return {
            'event_type': 'tackle',
            'timestamp': timestamp,
            'x': tackler['x'],
            'y': tackler['y'],
            'player_id': tackler['player_id'],
            'team': tackler['team'],
            'details': {
                'tackle_type': tackle_type,
                'tackle_result': tackle_result,
                'tackler_id': tackler['player_id'],
                'tackler_team': tackler['team'],
                'victim_id': ball_owner['player_id'],
                'victim_team': ball_owner['team'],
                'distance_between': round(tackler['distance_to_ball'], 2),
                'velocity_change': round(velocity_change, 2),
                'tackle_position': {'x': tackler['x'], 'y': tackler['y']},
                'ball_owner_position': {'x': ball_owner['x'], 'y': ball_owner['y']}
            }
        }

    def _calculate_velocity_change(
        self,
        tackler: Dict[str, Any],
        ball_owner: Dict[str, Any],
        timestamp: float
    ) -> float:
        tackler_prev = self.previous_positions.get(tackler['player_id'])
        owner_prev = self.previous_positions.get(ball_owner['player_id'])

        if not tackler_prev or not owner_prev:
            return 0

        prev_dist = math.sqrt(
            (tackler_prev['x'] - owner_prev['x']) ** 2 +
            (tackler_prev['y'] - owner_prev['y']) ** 2
        )

        curr_dist = math.sqrt(
            (tackler['x'] - ball_owner['x']) ** 2 +
            (tackler['y'] - ball_owner['y']) ** 2
        )

        return abs(prev_dist - curr_dist) / max(0.04, 0.001)

    def _determine_tackle_result(
        self,
        prev_owner: Dict[str, Any],
        new_owner: Dict[str, Any]
    ) -> str:
        if new_owner.get('team') != prev_owner.get('team'):
            return 'successful'
        return 'unsuccessful'

    def _classify_tackle_type(
        self,
        tackler: Dict[str, Any],
        victim: Dict[str, Any],
        distance: float
    ) -> str:
        if distance < 1.0:
            return 'sliding_tackle'
        elif distance < 1.5:
            return 'standing_tackle'
        else:
            return 'interception'

    def reset(self):
        self.last_tackle_time = -float('inf')
        self.previous_positions = {}
        self.ball_owner_history = []
        self.potential_tackles = []
