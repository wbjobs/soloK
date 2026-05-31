import math
from typing import List, Dict, Any, Optional, Tuple


class OffsideDetector:
    def __init__(
        self,
        offside_margin: float = 0.1,
        min_attacking_players: int = 2,
        min_defending_players: int = 2,
        field_length: float = 105.0,
        field_width: float = 68.0,
        cooldown_period: float = 1.0
    ):
        self.offside_margin = offside_margin
        self.min_attacking_players = min_attacking_players
        self.min_defending_players = min_defending_players
        self.field_length = field_length
        self.field_width = field_width
        self.cooldown_period = cooldown_period
        self.last_offside_time = -float('inf')
        self.attacking_direction = None
        self.halfway_line = field_length / 2

    def detect(
        self,
        attacker_positions: List[Dict[str, Any]],
        defender_positions: List[Dict[str, Any]],
        ball_position: Dict[str, Any],
        timestamp: float
    ) -> Optional[Dict[str, Any]]:
        if timestamp - self.last_offside_time < self.cooldown_period:
            return None

        if len(attacker_positions) < self.min_attacking_players:
            return None

        if len(defender_positions) < self.min_defending_players:
            return None

        if self.attacking_direction is None:
            self._determine_attacking_direction(attacker_positions, defender_positions)

        if self.attacking_direction == 'right':
            offside_line_x = self._calculate_offside_line_right(defender_positions)
        else:
            offside_line_x = self._calculate_offside_line_left(defender_positions)

        offside_players = self._find_offside_players(
            attacker_positions, ball_position, offside_line_x
        )

        if not offside_players:
            return None

        ball_in_own_half = self._is_ball_in_own_half(ball_position)
        if ball_in_own_half:
            return None

        for player in offside_players:
            if self._is_involved_in_play(player, ball_position, attacker_positions):
                self.last_offside_time = timestamp
                offside_distance = self._calculate_offside_distance(
                    player, offside_line_x
                )

                second_last_defender = self._find_second_last_defender(defender_positions)

                return {
                    'event_type': 'offside',
                    'timestamp': timestamp,
                    'x': player['x'],
                    'y': player['y'],
                    'player_id': player.get('player_id'),
                    'team': player.get('team'),
                    'details': {
                        'offside_line_x': round(offside_line_x, 2),
                        'offside_distance': round(offside_distance, 2),
                        'attacking_direction': self.attacking_direction,
                        'ball_position': {'x': ball_position['x'], 'y': ball_position['y']},
                        'player_position': {'x': player['x'], 'y': player['y']},
                        'second_last_defender': {
                            'player_id': second_last_defender.get('player_id'),
                            'x': second_last_defender['x'],
                            'y': second_last_defender['y']
                        } if second_last_defender else None,
                        'all_defenders': [
                            {'player_id': d.get('player_id'), 'x': d['x'], 'y': d['y']}
                            for d in defender_positions
                        ],
                        'offside_players_count': len(offside_players),
                        'involved_in_play': True,
                        'ball_in_own_half': ball_in_own_half
                    }
                }

        return None

    def _determine_attacking_direction(
        self,
        attackers: List[Dict[str, Any]],
        defenders: List[Dict[str, Any]]
    ):
        attackers_x = [a['x'] for a in attackers]
        defenders_x = [d['x'] for d in defenders]

        avg_attackers_x = sum(attackers_x) / len(attackers_x)
        avg_defenders_x = sum(defenders_x) / len(defenders_x)

        if avg_attackers_x < avg_defenders_x:
            self.attacking_direction = 'right'
        else:
            self.attacking_direction = 'left'

    def _calculate_offside_line_right(
        self,
        defender_positions: List[Dict[str, Any]]
    ) -> float:
        sorted_defenders = sorted(defender_positions, key=lambda d: d['x'], reverse=True)

        if len(sorted_defenders) >= 2:
            second_last_defender = sorted_defenders[1]
        else:
            second_last_defender = sorted_defenders[0]

        return second_last_defender['x']

    def _calculate_offside_line_left(
        self,
        defender_positions: List[Dict[str, Any]]
    ) -> float:
        sorted_defenders = sorted(defender_positions, key=lambda d: d['x'])

        if len(sorted_defenders) >= 2:
            second_last_defender = sorted_defenders[1]
        else:
            second_last_defender = sorted_defenders[0]

        return second_last_defender['x']

    def _find_offside_players(
        self,
        attacker_positions: List[Dict[str, Any]],
        ball_position: Dict[str, Any],
        offside_line_x: float
    ) -> List[Dict[str, Any]]:
        offside_players = []

        for attacker in attacker_positions:
            if attacker.get('is_goalkeeper', False):
                continue

            if self.attacking_direction == 'right':
                if attacker['x'] > offside_line_x + self.offside_margin:
                    if attacker['x'] > ball_position['x'] + self.offside_margin:
                        offside_players.append(attacker)
            else:
                if attacker['x'] < offside_line_x - self.offside_margin:
                    if attacker['x'] < ball_position['x'] - self.offside_margin:
                        offside_players.append(attacker)

        return offside_players

    def _is_ball_in_own_half(self, ball_position: Dict[str, Any]) -> bool:
        if self.attacking_direction == 'right':
            return ball_position['x'] <= self.halfway_line
        else:
            return ball_position['x'] >= self.halfway_line

    def _is_involved_in_play(
        self,
        player: Dict[str, Any],
        ball_position: Dict[str, Any],
        all_attackers: List[Dict[str, Any]]
    ) -> bool:
        distance_to_ball = math.sqrt(
            (player['x'] - ball_position['x']) ** 2 +
            (player['y'] - ball_position['y']) ** 2
        )

        if distance_to_ball < 5.0:
            return True

        closest_attacker_dist = float('inf')
        for attacker in all_attackers:
            if attacker.get('player_id') == player.get('player_id'):
                continue
            dist = math.sqrt(
                (attacker['x'] - ball_position['x']) ** 2 +
                (attacker['y'] - ball_position['y']) ** 2
            )
            if dist < closest_attacker_dist:
                closest_attacker_dist = dist

        if distance_to_ball < closest_attacker_dist * 1.5:
            return True

        return False

    def _calculate_offside_distance(
        self,
        player: Dict[str, Any],
        offside_line_x: float
    ) -> float:
        if self.attacking_direction == 'right':
            return max(0, player['x'] - offside_line_x)
        else:
            return max(0, offside_line_x - player['x'])

    def _find_second_last_defender(
        self,
        defender_positions: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        if len(defender_positions) < 2:
            return defender_positions[0] if defender_positions else None

        if self.attacking_direction == 'right':
            sorted_defenders = sorted(defender_positions, key=lambda d: d['x'], reverse=True)
        else:
            sorted_defenders = sorted(defender_positions, key=lambda d: d['x'])

        return sorted_defenders[1]

    def set_attacking_direction(self, direction: str):
        self.attacking_direction = direction

    def reset(self):
        self.last_offside_time = -float('inf')
        self.attacking_direction = None
