from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict
import math


class PossessionCalculator:
    def __init__(
        self,
        field_length: float = 105.0,
        field_width: float = 68.0,
        ownership_threshold: float = 3.0
    ):
        self.field_length = field_length
        self.field_width = field_width
        self.ownership_threshold = ownership_threshold

    def calculate(
        self,
        tracking_data: List[Dict[str, Any]],
        time_window: float = 1.0
    ) -> Dict[str, Any]:
        if not tracking_data:
            return {
                'team_a_possession': 0.0,
                'team_b_possession': 0.0,
                'total_time': 0.0,
                'team_a_time': 0.0,
                'team_b_time': 0.0,
                'contested_time': 0.0,
                'periods': {},
                '15min_intervals': {}
            }

        frames_by_time = self._group_frames_by_time(tracking_data, time_window)
        ownership_sequence = self._determine_ownership_sequence(frames_by_time)

        total_time = len(ownership_sequence) * time_window
        team_a_time = sum(1 for o in ownership_sequence if o == 'team_a') * time_window
        team_b_time = sum(1 for o in ownership_sequence if o == 'team_b') * time_window
        contested_time = sum(1 for o in ownership_sequence if o == 'contested') * time_window

        team_a_possession = (team_a_time / total_time * 100) if total_time > 0 else 0.0
        team_b_possession = (team_b_time / total_time * 100) if total_time > 0 else 0.0

        periods = self._calculate_period_stats(ownership_sequence, time_window)
        intervals = self._calculate_15min_intervals(ownership_sequence, time_window)

        return {
            'team_a_possession': round(team_a_possession, 2),
            'team_b_possession': round(team_b_possession, 2),
            'total_time': round(total_time, 2),
            'team_a_time': round(team_a_time, 2),
            'team_b_time': round(team_b_time, 2),
            'contested_time': round(contested_time, 2),
            'periods': periods,
            '15min_intervals': intervals
        }

    def _group_frames_by_time(
        self,
        tracking_data: List[Dict[str, Any]],
        time_window: float
    ) -> Dict[float, List[Dict[str, Any]]]:
        frames_by_time = defaultdict(list)

        for data in tracking_data:
            timestamp = data.get('timestamp', 0.0)
            window_key = math.floor(timestamp / time_window) * time_window
            frames_by_time[window_key].append(data)

        return dict(sorted(frames_by_time.items()))

    def _determine_ownership_sequence(
        self,
        frames_by_time: Dict[float, List[Dict[str, Any]]]
    ) -> List[str]:
        ownership_sequence = []

        for window_key in sorted(frames_by_time.keys()):
            frames = frames_by_time[window_key]
            owner = self._determine_window_owner(frames)
            ownership_sequence.append(owner)

        return ownership_sequence

    def _determine_window_owner(
        self,
        frames: List[Dict[str, Any]]
    ) -> str:
        player_positions = []
        ball_position = None

        for frame in frames:
            if frame.get('player_id') is not None:
                player_positions.append({
                    'player_id': frame.get('player_id'),
                    'team': frame.get('team'),
                    'x': frame.get('x'),
                    'y': frame.get('y')
                })
            elif 'x' in frame and 'y' in frame:
                ball_position = {'x': frame.get('x'), 'y': frame.get('y')}

        if not ball_position or not player_positions:
            return 'contested'

        closest_player = self._find_closest_player(ball_position, player_positions)

        if closest_player is None:
            return 'contested'

        return closest_player.get('team', 'contested')

    def _find_closest_player(
        self,
        ball_position: Dict[str, float],
        player_positions: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        min_distance = float('inf')
        closest_player = None

        for player in player_positions:
            dist = math.sqrt(
                (ball_position['x'] - player['x']) ** 2 +
                (ball_position['y'] - player['y']) ** 2
            )
            if dist < self.ownership_threshold and dist < min_distance:
                min_distance = dist
                closest_player = player

        return closest_player

    def _calculate_period_stats(
        self,
        ownership_sequence: List[str],
        time_window: float
    ) -> Dict[str, Any]:
        first_half_end = int(2700 / time_window)
        second_half_start = int(2700 / time_window)

        first_half = ownership_sequence[:first_half_end]
        second_half = ownership_sequence[second_half_start:]

        periods = {}

        if first_half:
            total = len(first_half) * time_window
            team_a = sum(1 for o in first_half if o == 'team_a') * time_window
            team_b = sum(1 for o in first_half if o == 'team_b') * time_window
            periods['first_half'] = {
                'team_a_possession': round(team_a / total * 100, 2) if total > 0 else 0.0,
                'team_b_possession': round(team_b / total * 100, 2) if total > 0 else 0.0,
                'total_time': round(total, 2),
                'team_a_time': round(team_a, 2),
                'team_b_time': round(team_b, 2)
            }

        if second_half:
            total = len(second_half) * time_window
            team_a = sum(1 for o in second_half if o == 'team_a') * time_window
            team_b = sum(1 for o in second_half if o == 'team_b') * time_window
            periods['second_half'] = {
                'team_a_possession': round(team_a / total * 100, 2) if total > 0 else 0.0,
                'team_b_possession': round(team_b / total * 100, 2) if total > 0 else 0.0,
                'total_time': round(total, 2),
                'team_a_time': round(team_a, 2),
                'team_b_time': round(team_b, 2)
            }

        return periods

    def _calculate_15min_intervals(
        self,
        ownership_sequence: List[str],
        time_window: float
    ) -> Dict[str, Any]:
        intervals = {}
        interval_duration = 900
        windows_per_interval = int(interval_duration / time_window)

        for i in range(0, len(ownership_sequence), windows_per_interval):
            interval_data = ownership_sequence[i:i + windows_per_interval]
            if not interval_data:
                continue

            total = len(interval_data) * time_window
            team_a = sum(1 for o in interval_data if o == 'team_a') * time_window
            team_b = sum(1 for o in interval_data if o == 'team_b') * time_window

            interval_num = (i // windows_per_interval) + 1
            interval_key = f'interval_{interval_num}'
            time_start = (i * time_window) / 60
            time_end = ((i + len(interval_data)) * time_window) / 60

            intervals[interval_key] = {
                'time_range': f'{int(time_start)}-{int(time_end)}min',
                'team_a_possession': round(team_a / total * 100, 2) if total > 0 else 0.0,
                'team_b_possession': round(team_b / total * 100, 2) if total > 0 else 0.0,
                'total_time': round(total, 2),
                'team_a_time': round(team_a, 2),
                'team_b_time': round(team_b, 2)
            }

        return intervals

    def calculate_zone_possession(
        self,
        tracking_data: List[Dict[str, Any]],
        zones: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        if zones is None:
            zones = [
                {'name': 'defensive_third', 'x_range': (0, 35)},
                {'name': 'midfield_third', 'x_range': (35, 70)},
                {'name': 'attacking_third', 'x_range': (70, 105)}
            ]

        zone_possession = {}

        for zone in zones:
            zone_data = [
                d for d in tracking_data
                if d.get('player_id') is None
                and zone['x_range'][0] <= d.get('x', 0) <= zone['x_range'][1]
            ]

            if zone_data:
                result = self.calculate(zone_data)
                zone_possession[zone['name']] = result

        return zone_possession
