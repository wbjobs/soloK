from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict
import math


class RunAnalyzer:
    def __init__(
        self,
        field_length: float = 105.0,
        field_width: float = 68.0
    ):
        self.field_length = field_length
        self.field_width = field_width

        self.speed_thresholds = {
            'walk': 7.2,
            'jog': 14.4,
            'run': 20.0,
            'sprint': float('inf')
        }

    def calculate_total_distance(
        self,
        tracking_data: List[Dict[str, Any]],
        player_id: int
    ) -> Dict[str, Any]:
        player_data = self._extract_player_data(tracking_data, player_id)

        if len(player_data) < 2:
            return {
                'player_id': player_id,
                'total_distance': 0.0,
                'total_time': 0.0,
                'avg_speed': 0.0,
                'max_speed': 0.0,
                'num_samples': len(player_data),
                'distance_by_type': {
                    'walk': 0.0,
                    'jog': 0.0,
                    'run': 0.0,
                    'sprint': 0.0
                },
                'time_by_type': {
                    'walk': 0.0,
                    'jog': 0.0,
                    'run': 0.0,
                    'sprint': 0.0
                }
            }

        total_distance = 0.0
        total_time = 0.0
        max_speed = 0.0

        distance_by_type = defaultdict(float)
        time_by_type = defaultdict(float)
        speed_samples = []

        for i in range(1, len(player_data)):
            prev = player_data[i - 1]
            curr = player_data[i]

            distance = math.sqrt(
                (curr['x'] - prev['x']) ** 2 +
                (curr['y'] - prev['y']) ** 2
            )

            time_diff = curr['timestamp'] - prev['timestamp']
            if time_diff <= 0:
                continue

            speed = (distance / time_diff) * 3.6

            total_distance += distance
            total_time += time_diff
            max_speed = max(max_speed, speed)
            speed_samples.append(speed)

            run_type = self._classify_speed(speed)
            distance_by_type[run_type] += distance
            time_by_type[run_type] += time_diff

        avg_speed = (total_distance / total_time * 3.6) if total_time > 0 else 0.0

        return {
            'player_id': player_id,
            'total_distance': round(total_distance, 2),
            'total_time': round(total_time, 2),
            'avg_speed': round(avg_speed, 2),
            'max_speed': round(max_speed, 2),
            'num_samples': len(player_data),
            'distance_by_type': {k: round(v, 2) for k, v in distance_by_type.items()},
            'time_by_type': {k: round(v, 2) for k, v in time_by_type.items()},
            'speed_percentiles': self._calculate_speed_percentiles(speed_samples)
        }

    def calculate_high_intensity_runs(
        self,
        tracking_data: List[Dict[str, Any]],
        player_id: int,
        threshold: float = 20.0
    ) -> Dict[str, Any]:
        player_data = self._extract_player_data(tracking_data, player_id)

        if len(player_data) < 2:
            return {
                'player_id': player_id,
                'high_intensity_runs': [],
                'total_hi_runs': 0,
                'total_hi_distance': 0.0,
                'avg_hi_distance': 0.0,
                'max_hi_distance': 0.0,
                'avg_hi_speed': 0.0,
                'max_hi_speed': 0.0,
                'threshold': threshold
            }

        high_intensity_runs = []
        current_run = None

        for i in range(1, len(player_data)):
            prev = player_data[i - 1]
            curr = player_data[i]

            distance = math.sqrt(
                (curr['x'] - prev['x']) ** 2 +
                (curr['y'] - prev['y']) ** 2
            )

            time_diff = curr['timestamp'] - prev['timestamp']
            if time_diff <= 0:
                continue

            speed = (distance / time_diff) * 3.6

            if speed >= threshold:
                if current_run is None:
                    current_run = {
                        'start_time': prev['timestamp'],
                        'start_x': prev['x'],
                        'start_y': prev['y'],
                        'end_time': curr['timestamp'],
                        'end_x': curr['x'],
                        'end_y': curr['y'],
                        'distance': distance,
                        'max_speed': speed,
                        'avg_speed_sum': speed,
                        'speed_count': 1,
                        'speeds': [speed]
                    }
                else:
                    current_run['end_time'] = curr['timestamp']
                    current_run['end_x'] = curr['x']
                    current_run['end_y'] = curr['y']
                    current_run['distance'] += distance
                    current_run['max_speed'] = max(current_run['max_speed'], speed)
                    current_run['avg_speed_sum'] += speed
                    current_run['speed_count'] += 1
                    current_run['speeds'].append(speed)
            else:
                if current_run is not None:
                    if current_run['distance'] >= 5.0:
                        current_run['avg_speed'] = current_run['avg_speed_sum'] / current_run['speed_count']
                        current_run['duration'] = current_run['end_time'] - current_run['start_time']
                        del current_run['avg_speed_sum']
                        del current_run['speed_count']
                        del current_run['speeds']
                        for key in ['distance', 'max_speed', 'avg_speed', 'duration']:
                            if key in current_run:
                                current_run[key] = round(current_run[key], 2)
                        high_intensity_runs.append(current_run)
                    current_run = None

        if current_run is not None and current_run['distance'] >= 5.0:
            current_run['avg_speed'] = current_run['avg_speed_sum'] / current_run['speed_count']
            current_run['duration'] = current_run['end_time'] - current_run['start_time']
            del current_run['avg_speed_sum']
            del current_run['speed_count']
            del current_run['speeds']
            for key in ['distance', 'max_speed', 'avg_speed', 'duration']:
                if key in current_run:
                    current_run[key] = round(current_run[key], 2)
            high_intensity_runs.append(current_run)

        total_hi_distance = sum(r['distance'] for r in high_intensity_runs)
        avg_hi_distance = total_hi_distance / len(high_intensity_runs) if high_intensity_runs else 0.0
        max_hi_distance = max((r['distance'] for r in high_intensity_runs), default=0.0)
        avg_hi_speed = sum(r['avg_speed'] for r in high_intensity_runs) / len(high_intensity_runs) if high_intensity_runs else 0.0
        max_hi_speed = max((r['max_speed'] for r in high_intensity_runs), default=0.0)

        return {
            'player_id': player_id,
            'high_intensity_runs': high_intensity_runs,
            'total_hi_runs': len(high_intensity_runs),
            'total_hi_distance': round(total_hi_distance, 2),
            'avg_hi_distance': round(avg_hi_distance, 2),
            'max_hi_distance': round(max_hi_distance, 2),
            'avg_hi_speed': round(avg_hi_speed, 2),
            'max_hi_speed': round(max_hi_speed, 2),
            'threshold': threshold
        }

    def _extract_player_data(
        self,
        tracking_data: List[Dict[str, Any]],
        player_id: int
    ) -> List[Dict[str, Any]]:
        player_data = []

        for data in tracking_data:
            if data.get('player_id') == player_id:
                player_data.append({
                    'x': data.get('x', 0.0),
                    'y': data.get('y', 0.0),
                    'timestamp': data.get('timestamp', 0.0)
                })

        player_data.sort(key=lambda d: d['timestamp'])
        return player_data

    def _classify_speed(self, speed: float) -> str:
        if speed < self.speed_thresholds['walk']:
            return 'walk'
        elif speed < self.speed_thresholds['jog']:
            return 'jog'
        elif speed < self.speed_thresholds['run']:
            return 'run'
        else:
            return 'sprint'

    def _calculate_speed_percentiles(
        self,
        speeds: List[float]
    ) -> Dict[str, float]:
        if not speeds:
            return {
                'p25': 0.0,
                'p50': 0.0,
                'p75': 0.0,
                'p90': 0.0,
                'p95': 0.0
            }

        sorted_speeds = sorted(speeds)
        n = len(sorted_speeds)

        def percentile(p):
            k = (n - 1) * p
            f = math.floor(k)
            c = math.ceil(k)
            if f == c:
                return sorted_speeds[int(k)]
            d0 = sorted_speeds[int(f)] * (c - k)
            d1 = sorted_speeds[int(c)] * (k - f)
            return d0 + d1

        return {
            'p25': round(percentile(0.25), 2),
            'p50': round(percentile(0.50), 2),
            'p75': round(percentile(0.75), 2),
            'p90': round(percentile(0.90), 2),
            'p95': round(percentile(0.95), 2)
        }

    def calculate_team_runs(
        self,
        tracking_data: List[Dict[str, Any]],
        team: str
    ) -> Dict[str, Any]:
        player_ids = set(
            d.get('player_id') for d in tracking_data
            if d.get('team') == team and d.get('player_id') is not None
        )

        team_results = {}
        for player_id in player_ids:
            team_results[player_id] = self.calculate_total_distance(tracking_data, player_id)

        total_distance = sum(r['total_distance'] for r in team_results.values())
        avg_distance = total_distance / len(team_results) if team_results else 0.0
        total_high_intensity = sum(
            r['distance_by_type'].get('sprint', 0) + r['distance_by_type'].get('run', 0)
            for r in team_results.values()
        )
        high_intensity_ratio = (total_high_intensity / total_distance * 100) if total_distance > 0 else 0.0

        return {
            'team': team,
            'player_results': team_results,
            'total_team_distance': round(total_distance, 2),
            'avg_player_distance': round(avg_distance, 2),
            'total_high_intensity_distance': round(total_high_intensity, 2),
            'high_intensity_ratio': round(high_intensity_ratio, 2),
            'num_players': len(team_results)
        }

    def calculate_sprint_analysis(
        self,
        tracking_data: List[Dict[str, Any]],
        player_id: int
    ) -> Dict[str, Any]:
        hi_runs = self.calculate_high_intensity_runs(tracking_data, player_id, threshold=25.0)

        sprints = hi_runs['high_intensity_runs']

        sprint_directions = []
        for sprint in sprints:
            dx = sprint['end_x'] - sprint['start_x']
            dy = sprint['end_y'] - sprint['start_y']
            direction = math.degrees(math.atan2(dy, dx))
            sprint_directions.append({
                'run_id': len(sprint_directions),
                'direction': round(direction, 2),
                'distance': sprint['distance'],
                'max_speed': sprint['max_speed']
            })

        directional_distribution = self._analyze_sprint_directions(sprint_directions)

        return {
            'player_id': player_id,
            'total_sprints': len(sprints),
            'total_sprint_distance': hi_runs['total_hi_distance'],
            'avg_sprint_distance': hi_runs['avg_hi_distance'],
            'max_sprint_distance': hi_runs['max_hi_distance'],
            'avg_sprint_speed': hi_runs['avg_hi_speed'],
            'max_sprint_speed': hi_runs['max_hi_speed'],
            'sprints': sprints,
            'sprint_directions': sprint_directions,
            'directional_distribution': directional_distribution
        }

    def _analyze_sprint_directions(
        self,
        sprint_directions: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        if not sprint_directions:
            return {
                'forward': 0,
                'backward': 0,
                'left': 0,
                'right': 0,
                'forward_left': 0,
                'forward_right': 0,
                'backward_left': 0,
                'backward_right': 0
            }

        direction_counts = defaultdict(int)

        for sd in sprint_directions:
            angle = sd['direction']

            if -22.5 <= angle < 22.5:
                direction_counts['forward'] += 1
            elif 22.5 <= angle < 67.5:
                direction_counts['forward_right'] += 1
            elif 67.5 <= angle < 112.5:
                direction_counts['right'] += 1
            elif 112.5 <= angle < 157.5:
                direction_counts['backward_right'] += 1
            elif angle >= 157.5 or angle < -157.5:
                direction_counts['backward'] += 1
            elif -157.5 <= angle < -112.5:
                direction_counts['backward_left'] += 1
            elif -112.5 <= angle < -67.5:
                direction_counts['left'] += 1
            elif -67.5 <= angle < -22.5:
                direction_counts['forward_left'] += 1

        total = len(sprint_directions)
        direction_percentages = {
            k: round(v / total * 100, 2) for k, v in direction_counts.items()
        }

        return {
            'counts': dict(direction_counts),
            'percentages': direction_percentages
        }

    def calculate_workload_index(
        self,
        tracking_data: List[Dict[str, Any]],
        player_id: int
    ) -> Dict[str, Any]:
        distance_data = self.calculate_total_distance(tracking_data, player_id)

        distance_by_type = distance_data.get('distance_by_type', {})

        walk_dist = distance_by_type.get('walk', 0)
        jog_dist = distance_by_type.get('jog', 0)
        run_dist = distance_by_type.get('run', 0)
        sprint_dist = distance_by_type.get('sprint', 0)

        workload = (
            walk_dist * 1.0 +
            jog_dist * 2.0 +
            run_dist * 3.5 +
            sprint_dist * 5.0
        )

        hi_runs = self.calculate_high_intensity_runs(tracking_data, player_id)
        total_hi_runs = hi_runs['total_hi_runs']

        acwr = self._calculate_acwr(tracking_data, player_id)

        return {
            'player_id': player_id,
            'total_workload': round(workload, 2),
            'workload_per_minute': round(workload / max(distance_data['total_time'] / 60, 1), 2),
            'weighted_distances': {
                'walk': round(walk_dist * 1.0, 2),
                'jog': round(jog_dist * 2.0, 2),
                'run': round(run_dist * 3.5, 2),
                'sprint': round(sprint_dist * 5.0, 2)
            },
            'high_intensity_count': total_hi_runs,
            'acwr': acwr
        }

    def _calculate_acwr(
        self,
        tracking_data: List[Dict[str, Any]],
        player_id: int,
        acute_days: int = 7,
        chronic_days: int = 28
    ) -> Dict[str, Any]:
        timestamps = sorted(set(d.get('timestamp', 0.0) for d in tracking_data if d.get('player_id') == player_id))

        if not timestamps:
            return {'acute': 0.0, 'chronic': 0.0, 'ratio': 0.0}

        total_duration = max(timestamps) - min(timestamps)
        total_days = total_duration / 86400

        player_data = [d for d in tracking_data if d.get('player_id') == player_id]

        if total_days < 1:
            distance_data = self.calculate_total_distance(player_data, player_id)
            workload = self._calculate_single_workload(distance_data)
            return {'acute': workload, 'chronic': workload, 'ratio': 1.0}

        acute_data = [
            d for d in player_data
            if d.get('timestamp', 0.0) > max(timestamps) - acute_days * 86400
        ]
        chronic_data = [
            d for d in player_data
            if d.get('timestamp', 0.0) > max(timestamps) - chronic_days * 86400
        ]

        acute_distance = self.calculate_total_distance(acute_data, player_id)
        chronic_distance = self.calculate_total_distance(chronic_data, player_id)

        acute_workload = self._calculate_single_workload(acute_distance)
        chronic_workload = self._calculate_single_workload(chronic_distance)

        ratio = (acute_workload / acute_days) / (chronic_workload / chronic_days) if chronic_workload > 0 else 0.0

        return {
            'acute': round(acute_workload, 2),
            'chronic': round(chronic_workload, 2),
            'ratio': round(ratio, 2)
        }

    def _calculate_single_workload(self, distance_data: Dict[str, Any]) -> float:
        distance_by_type = distance_data.get('distance_by_type', {})
        return (
            distance_by_type.get('walk', 0) * 1.0 +
            distance_by_type.get('jog', 0) * 2.0 +
            distance_by_type.get('run', 0) * 3.5 +
            distance_by_type.get('sprint', 0) * 5.0
        )
