import math
from typing import List, Dict, Any, Optional, Tuple


class FoulDetector:
    def __init__(
        self,
        contact_distance_threshold: float = 0.8,
        min_velocity_change: float = 4.0,
        min_distance_change: float = 2.0,
        sliding_tackle_speed: float = 5.0,
        cooldown_period: float = 3.0,
        field_length: float = 105.0,
        field_width: float = 68.0
    ):
        self.contact_distance_threshold = contact_distance_threshold
        self.min_velocity_change = min_velocity_change
        self.min_distance_change = min_distance_change
        self.sliding_tackle_speed = sliding_tackle_speed
        self.cooldown_period = cooldown_period
        self.field_length = field_length
        self.field_width = field_width
        self.last_foul_time = -float('inf')
        self.previous_positions = {}
        self.previous_velocities = {}
        self.contact_history = {}

    def detect(
        self,
        player_positions: List[Dict[str, Any]],
        player_velocities: Dict[int, Dict[str, float]],
        timestamp: float
    ) -> Optional[Dict[str, Any]]:
        if timestamp - self.last_foul_time < self.cooldown_period:
            self._update_state(player_positions, player_velocities)
            return None

        if not player_positions:
            self._update_state(player_positions, player_velocities)
            return None

        contacts = self._detect_contacts(player_positions)

        for contact in contacts:
            foul_event = self._analyze_contact(
                contact, player_velocities, timestamp
            )
            if foul_event:
                self.last_foul_time = timestamp
                self._update_state(player_positions, player_velocities)
                return foul_event

        foul_event = self._detect_sudden_velocity_changes(
            player_positions, player_velocities, timestamp
        )
        if foul_event:
            self.last_foul_time = timestamp
            self._update_state(player_positions, player_velocities)
            return foul_event

        sliding_foul = self._detect_sliding_tackle_foul(
            player_positions, player_velocities, timestamp
        )
        if sliding_foul:
            self.last_foul_time = timestamp
            self._update_state(player_positions, player_velocities)
            return sliding_foul

        self._update_state(player_positions, player_velocities)
        return None

    def _update_state(
        self,
        player_positions: List[Dict[str, Any]],
        player_velocities: Dict[int, Dict[str, float]]
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
        self.previous_velocities = player_velocities.copy() if player_velocities else {}

    def _detect_contacts(
        self,
        player_positions: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        contacts = []
        valid_players = [p for p in player_positions if p.get('player_id') is not None]

        for i in range(len(valid_players)):
            for j in range(i + 1, len(valid_players)):
                p1 = valid_players[i]
                p2 = valid_players[j]

                if p1.get('team') == p2.get('team'):
                    continue

                distance = math.sqrt(
                    (p1['x'] - p2['x']) ** 2 + (p1['y'] - p2['y']) ** 2
                )

                if distance < self.contact_distance_threshold:
                    contacts.append({
                        'player1': p1,
                        'player2': p2,
                        'distance': distance
                    })

        return contacts

    def _analyze_contact(
        self,
        contact: Dict[str, Any],
        player_velocities: Dict[int, Dict[str, float]],
        timestamp: float
    ) -> Optional[Dict[str, Any]]:
        p1 = contact['player1']
        p2 = contact['player2']

        p1_id = p1['player_id']
        p2_id = p2['player_id']

        p1_velocity = player_velocities.get(p1_id, {'vx': 0, 'vy': 0})
        p2_velocity = player_velocities.get(p2_id, {'vx': 0, 'vy': 0})

        p1_speed = math.sqrt(p1_velocity['vx'] ** 2 + p1_velocity['vy'] ** 2)
        p2_speed = math.sqrt(p2_velocity['vx'] ** 2 + p2_velocity['vy'] ** 2)

        p1_prev_vel = self.previous_velocities.get(p1_id, {'vx': 0, 'vy': 0})
        p2_prev_vel = self.previous_velocities.get(p2_id, {'vx': 0, 'vy': 0})

        p1_prev_speed = math.sqrt(p1_prev_vel['vx'] ** 2 + p1_prev_vel['vy'] ** 2)
        p2_prev_speed = math.sqrt(p2_prev_vel['vx'] ** 2 + p2_prev_vel['vy'] ** 2)

        p1_velocity_change = abs(p1_speed - p1_prev_speed)
        p2_velocity_change = abs(p2_speed - p2_prev_speed)

        max_velocity_change = max(p1_velocity_change, p2_velocity_change)

        if max_velocity_change < self.min_velocity_change:
            return None

        if p1_speed > p2_speed:
            fouler = p1
            victim = p2
            velocity_change = p1_velocity_change
        else:
            fouler = p2
            victim = p1
            velocity_change = p2_velocity_change

        foul_type = self._classify_foul_type(
            fouler, victim, max_velocity_change, contact['distance']
        )

        foul_x = (fouler['x'] + victim['x']) / 2
        foul_y = (fouler['y'] + victim['y']) / 2

        return {
            'event_type': 'foul',
            'timestamp': timestamp,
            'x': foul_x,
            'y': foul_y,
            'player_id': fouler['player_id'],
            'team': fouler['team'],
            'details': {
                'foul_type': foul_type,
                'fouler_id': fouler['player_id'],
                'fouler_team': fouler['team'],
                'victim_id': victim['player_id'],
                'victim_team': victim['team'],
                'contact_distance': round(contact['distance'], 2),
                'velocity_change': round(max_velocity_change, 2),
                'fouler_speed': round(max(p1_speed, p2_speed), 2),
                'victim_speed': round(min(p1_speed, p2_speed), 2),
                'foul_position': {'x': foul_x, 'y': foul_y},
                'fouler_position': {'x': fouler['x'], 'y': fouler['y']},
                'victim_position': {'x': victim['x'], 'y': victim['y']}
            }
        }

    def _classify_foul_type(
        self,
        fouler: Dict[str, Any],
        victim: Dict[str, Any],
        velocity_change: float,
        contact_distance: float
    ) -> str:
        if velocity_change > 8.0:
            return 'pushing'
        elif velocity_change > 6.0:
            return 'holding'
        elif contact_distance < 0.5:
            return 'sliding_tackle_foul'
        elif velocity_change > 4.0:
            return 'charging'
        else:
            return 'physical_contact'

    def _detect_sudden_velocity_changes(
        self,
        player_positions: List[Dict[str, Any]],
        player_velocities: Dict[int, Dict[str, float]],
        timestamp: float
    ) -> Optional[Dict[str, Any]]:
        for player in player_positions:
            player_id = player.get('player_id')
            if player_id is None:
                continue

            current_vel = player_velocities.get(player_id, {'vx': 0, 'vy': 0})
            previous_vel = self.previous_velocities.get(player_id, {'vx': 0, 'vy': 0})

            current_speed = math.sqrt(current_vel['vx'] ** 2 + current_vel['vy'] ** 2)
            previous_speed = math.sqrt(previous_vel['vx'] ** 2 + previous_vel['vy'] ** 2)

            velocity_change = abs(current_speed - previous_speed)

            if velocity_change > self.min_velocity_change * 1.5:
                nearby_opponent = self._find_nearby_opponent(player, player_positions)

                if nearby_opponent:
                    foul_x = (player['x'] + nearby_opponent['x']) / 2
                    foul_y = (player['y'] + nearby_opponent['y']) / 2

                    return {
                        'event_type': 'foul',
                        'timestamp': timestamp,
                        'x': foul_x,
                        'y': foul_y,
                        'player_id': nearby_opponent['player_id'],
                        'team': nearby_opponent['team'],
                        'details': {
                            'foul_type': 'pulling',
                            'fouler_id': nearby_opponent['player_id'],
                            'fouler_team': nearby_opponent['team'],
                            'victim_id': player_id,
                            'victim_team': player.get('team'),
                            'velocity_change': round(velocity_change, 2),
                            'victim_velocity_change': round(velocity_change, 2),
                            'distance_to_opponent': round(
                                math.sqrt(
                                    (player['x'] - nearby_opponent['x']) ** 2 +
                                    (player['y'] - nearby_opponent['y']) ** 2
                                ), 2
                            ),
                            'foul_position': {'x': foul_x, 'y': foul_y}
                        }
                    }

        return None

    def _find_nearby_opponent(
        self,
        player: Dict[str, Any],
        all_players: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        player_id = player.get('player_id')
        player_team = player.get('team')
        min_distance = float('inf')
        nearest_opponent = None

        for other in all_players:
            other_id = other.get('player_id')
            if other_id is None or other_id == player_id:
                continue
            if other.get('team') == player_team:
                continue

            distance = math.sqrt(
                (player['x'] - other['x']) ** 2 + (player['y'] - other['y']) ** 2
            )

            if distance < 2.0 and distance < min_distance:
                min_distance = distance
                nearest_opponent = other

        return nearest_opponent

    def _detect_sliding_tackle_foul(
        self,
        player_positions: List[Dict[str, Any]],
        player_velocities: Dict[int, Dict[str, float]],
        timestamp: float
    ) -> Optional[Dict[str, Any]]:
        for player in player_positions:
            player_id = player.get('player_id')
            if player_id is None:
                continue

            velocity = player_velocities.get(player_id, {'vx': 0, 'vy': 0})
            speed = math.sqrt(velocity['vx'] ** 2 + velocity['vy'] ** 2)

            if speed < self.sliding_tackle_speed:
                continue

            prev_pos = self.previous_positions.get(player_id)
            if not prev_pos:
                continue

            distance_moved = math.sqrt(
                (player['x'] - prev_pos['x']) ** 2 +
                (player['y'] - prev_pos['y']) ** 2
            )

            if distance_moved < self.min_distance_change:
                continue

            nearby_opponent = self._find_nearby_opponent(player, player_positions)
            if nearby_opponent:
                distance = math.sqrt(
                    (player['x'] - nearby_opponent['x']) ** 2 +
                    (player['y'] - nearby_opponent['y']) ** 2
                )

                if distance < 1.5:
                    foul_x = (player['x'] + nearby_opponent['x']) / 2
                    foul_y = (player['y'] + nearby_opponent['y']) / 2

                    return {
                        'event_type': 'foul',
                        'timestamp': timestamp,
                        'x': foul_x,
                        'y': foul_y,
                        'player_id': player_id,
                        'team': player.get('team'),
                        'details': {
                            'foul_type': 'sliding_tackle_foul',
                            'fouler_id': player_id,
                            'fouler_team': player.get('team'),
                            'victim_id': nearby_opponent['player_id'],
                            'victim_team': nearby_opponent.get('team'),
                            'tackle_speed': round(speed, 2),
                            'distance_moved': round(distance_moved, 2),
                            'contact_distance': round(distance, 2),
                            'foul_position': {'x': foul_x, 'y': foul_y},
                            'fouler_position': {'x': player['x'], 'y': player['y']},
                            'victim_position': {'x': nearby_opponent['x'], 'y': nearby_opponent['y']}
                        }
                    }

        return None

    def reset(self):
        self.last_foul_time = -float('inf')
        self.previous_positions = {}
        self.previous_velocities = {}
        self.contact_history = {}
