from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict
import math
import random


class FormationDetector:
    def __init__(
        self,
        field_length: float = 105.0,
        field_width: float = 68.0,
        n_clusters: int = 4
    ):
        self.field_length = field_length
        self.field_width = field_width
        self.n_clusters = n_clusters

        self.formation_templates = {
            '4-4-2': [
                {'line': 'gk', 'x_range': (0, 10), 'count': 1},
                {'line': 'def', 'x_range': (10, 40), 'count': 4},
                {'line': 'mid', 'x_range': (40, 70), 'count': 4},
                {'line': 'fwd', 'x_range': (70, 105), 'count': 2}
            ],
            '4-3-3': [
                {'line': 'gk', 'x_range': (0, 10), 'count': 1},
                {'line': 'def', 'x_range': (10, 40), 'count': 4},
                {'line': 'mid', 'x_range': (40, 70), 'count': 3},
                {'line': 'fwd', 'x_range': (70, 105), 'count': 3}
            ],
            '3-5-2': [
                {'line': 'gk', 'x_range': (0, 10), 'count': 1},
                {'line': 'def', 'x_range': (10, 35), 'count': 3},
                {'line': 'mid', 'x_range': (35, 75), 'count': 5},
                {'line': 'fwd', 'x_range': (75, 105), 'count': 2}
            ],
            '5-3-2': [
                {'line': 'gk', 'x_range': (0, 10), 'count': 1},
                {'line': 'def', 'x_range': (10, 35), 'count': 5},
                {'line': 'mid', 'x_range': (35, 70), 'count': 3},
                {'line': 'fwd', 'x_range': (70, 105), 'count': 2}
            ],
            '4-2-3-1': [
                {'line': 'gk', 'x_range': (0, 10), 'count': 1},
                {'line': 'def', 'x_range': (10, 40), 'count': 4},
                {'line': 'def_mid', 'x_range': (40, 55), 'count': 2},
                {'line': 'att_mid', 'x_range': (55, 80), 'count': 3},
                {'line': 'fwd', 'x_range': (80, 105), 'count': 1}
            ]
        }

    def detect(
        self,
        tracking_data: List[Dict[str, Any]],
        team: str,
        method: str = 'kmeans'
    ) -> Dict[str, Any]:
        team_positions = self._extract_team_positions(tracking_data, team)

        if not team_positions:
            return {
                'formation': 'unknown',
                'confidence': 0.0,
                'player_lines': {},
                'cluster_centers': [],
                'method': method
            }

        avg_positions = self._calculate_avg_positions(team_positions)

        if method == 'kmeans':
            cluster_centers, labels = self._kmeans_clustering(avg_positions)
        else:
            cluster_centers, labels = self._simple_clustering(avg_positions)

        formation = self.classify_formation(cluster_centers, avg_positions)

        player_lines = self._assign_players_to_lines(avg_positions, formation)

        return {
            'formation': formation['name'],
            'confidence': formation['confidence'],
            'player_lines': player_lines,
            'cluster_centers': cluster_centers,
            'player_labels': labels,
            'avg_positions': avg_positions,
            'method': method,
            'line_counts': formation['line_counts']
        }

    def _extract_team_positions(
        self,
        tracking_data: List[Dict[str, Any]],
        team: str
    ) -> Dict[int, List[Dict[str, float]]]:
        team_positions = defaultdict(list)

        for data in tracking_data:
            if data.get('team') == team and data.get('player_id') is not None:
                player_id = data['player_id']
                team_positions[player_id].append({
                    'x': data.get('x', 0.0),
                    'y': data.get('y', 0.0),
                    'timestamp': data.get('timestamp', 0.0)
                })

        return dict(team_positions)

    def _calculate_avg_positions(
        self,
        team_positions: Dict[int, List[Dict[str, float]]]
    ) -> List[Dict[str, Any]]:
        avg_positions = []

        for player_id, positions in team_positions.items():
            if not positions:
                continue

            avg_x = sum(p['x'] for p in positions) / len(positions)
            avg_y = sum(p['y'] for p in positions) / len(positions)

            is_goalkeeper = any(p.get('is_goalkeeper', False) for p in positions)

            avg_positions.append({
                'player_id': player_id,
                'avg_x': avg_x,
                'avg_y': avg_y,
                'num_samples': len(positions),
                'is_goalkeeper': is_goalkeeper
            })

        return avg_positions

    def _kmeans_clustering(
        self,
        avg_positions: List[Dict[str, Any]],
        max_iterations: int = 100,
        tol: float = 1e-4
    ) -> Tuple[List[Dict[str, float]], List[int]]:
        n_samples = len(avg_positions)
        if n_samples == 0:
            return [], []

        n_clusters = min(self.n_clusters, n_samples)

        points = [(p['avg_x'], p['avg_y']) for p in avg_positions]

        centers = self._initialize_centers(points, n_clusters)

        for _ in range(max_iterations):
            labels = self._assign_clusters(points, centers)

            new_centers = self._update_centers(points, labels, n_clusters)

            diff = sum(
                math.sqrt((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2)
                for c1, c2 in zip(centers, new_centers)
            )

            centers = new_centers

            if diff < tol:
                break

        cluster_centers = [{'x': c[0], 'y': c[1]} for c in centers]

        return cluster_centers, labels

    def _initialize_centers(
        self,
        points: List[Tuple[float, float]],
        n_clusters: int
    ) -> List[Tuple[float, float]]:
        centers = []

        sorted_points = sorted(points, key=lambda p: p[0])

        step = len(sorted_points) / n_clusters
        for i in range(n_clusters):
            idx = int(i * step + step / 2)
            idx = min(idx, len(sorted_points) - 1)
            centers.append(sorted_points[idx])

        return centers

    def _assign_clusters(
        self,
        points: List[Tuple[float, float]],
        centers: List[Tuple[float, float]]
    ) -> List[int]:
        labels = []

        for point in points:
            min_dist = float('inf')
            best_cluster = 0

            for i, center in enumerate(centers):
                dist = math.sqrt((point[0] - center[0]) ** 2 + (point[1] - center[1]) ** 2)
                if dist < min_dist:
                    min_dist = dist
                    best_cluster = i

            labels.append(best_cluster)

        return labels

    def _update_centers(
        self,
        points: List[Tuple[float, float]],
        labels: List[int],
        n_clusters: int
    ) -> List[Tuple[float, float]]:
        new_centers = []

        for cluster in range(n_clusters):
            cluster_points = [
                points[i] for i, label in enumerate(labels) if label == cluster
            ]

            if cluster_points:
                avg_x = sum(p[0] for p in cluster_points) / len(cluster_points)
                avg_y = sum(p[1] for p in cluster_points) / len(cluster_points)
                new_centers.append((avg_x, avg_y))
            else:
                new_centers.append((random.uniform(0, self.field_length), random.uniform(0, self.field_width)))

        return new_centers

    def _simple_clustering(
        self,
        avg_positions: List[Dict[str, Any]]
    ) -> Tuple[List[Dict[str, float]], List[int]]:
        sorted_positions = sorted(avg_positions, key=lambda p: p['avg_x'])

        n = len(sorted_positions)
        if n == 0:
            return [], []

        n_clusters = min(self.n_clusters, n)

        cluster_size = n / n_clusters
        labels = [0] * n
        cluster_points = [[] for _ in range(n_clusters)]

        for i, pos in enumerate(sorted_positions):
            cluster = min(int(i / cluster_size), n_clusters - 1)
            original_idx = avg_positions.index(pos)
            labels[original_idx] = cluster
            cluster_points[cluster].append((pos['avg_x'], pos['avg_y']))

        cluster_centers = []
        for points in cluster_points:
            if points:
                avg_x = sum(p[0] for p in points) / len(points)
                avg_y = sum(p[1] for p in points) / len(points)
                cluster_centers.append({'x': avg_x, 'y': avg_y})
            else:
                cluster_centers.append({'x': 0.0, 'y': 0.0})

        return cluster_centers, labels

    def classify_formation(
        self,
        cluster_centers: List[Dict[str, float]],
        avg_positions: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        if not cluster_centers or not avg_positions:
            return {'name': 'unknown', 'confidence': 0.0, 'line_counts': {}}

        players_by_x = sorted(avg_positions, key=lambda p: p['avg_x'])

        total_players = len(avg_positions)
        if total_players < 10:
            return {'name': 'unknown', 'confidence': 0.0, 'line_counts': {}}

        line_counts = self._count_players_by_line(players_by_x)

        best_formation = None
        best_score = -1

        for formation_name, template in self.formation_templates.items():
            score = self._score_formation(line_counts, template)
            if score > best_score:
                best_score = score
                best_formation = formation_name

        confidence = best_score / max(sum(t['count'] for t in self.formation_templates[best_formation]), 1) if best_formation else 0.0

        return {
            'name': best_formation or 'unknown',
            'confidence': round(confidence, 4),
            'line_counts': line_counts
        }

    def _count_players_by_line(
        self,
        players_by_x: List[Dict[str, Any]]
    ) -> Dict[str, int]:
        total_players = len(players_by_x)

        line_ranges = [
            ('gk', 0, 1),
            ('def', 1, 5),
            ('mid', 5, 9),
            ('fwd', 9, total_players)
        ]

        line_counts = {}
        for line_name, start, end in line_ranges:
            count = len(players_by_x[start:end])
            if count > 0:
                line_counts[line_name] = count

        if 'def' in line_counts and 'mid' in line_counts:
            def_players = players_by_x[1:5]
            avg_def_x = sum(p['avg_x'] for p in def_players) / len(def_players) if def_players else 0

            mid_players = players_by_x[5:9]
            if len(mid_players) >= 5:
                sorted_mid = sorted(mid_players, key=lambda p: p['avg_x'])
                def_mid = sorted_mid[:2]
                att_mid = sorted_mid[2:]

                avg_def_mid_x = sum(p['avg_x'] for p in def_mid) / len(def_mid) if def_mid else 0
                avg_att_mid_x = sum(p['avg_x'] for p in att_mid) / len(att_mid) if att_mid else 0

                if avg_def_mid_x < avg_att_mid_x - 10:
                    line_counts['def_mid'] = len(def_mid)
                    line_counts['att_mid'] = len(att_mid)
                    del line_counts['mid']

        return line_counts

    def _score_formation(
        self,
        line_counts: Dict[str, int],
        template: List[Dict[str, Any]]
    ) -> float:
        score = 0.0

        for line_template in template:
            line_name = line_template['line']
            expected_count = line_template['count']
            actual_count = line_counts.get(line_name, 0)

            diff = abs(expected_count - actual_count)
            score += max(0, expected_count - diff)

        return score

    def _assign_players_to_lines(
        self,
        avg_positions: List[Dict[str, Any]],
        formation: Dict[str, Any]
    ) -> Dict[int, str]:
        player_lines = {}

        formation_name = formation['name']
        template = self.formation_templates.get(formation_name, [])

        if not template:
            sorted_players = sorted(avg_positions, key=lambda p: p['avg_x'])
            for i, player in enumerate(sorted_players):
                if i == 0:
                    player_lines[player['player_id']] = 'gk'
                elif i < 5:
                    player_lines[player['player_id']] = 'def'
                elif i < 9:
                    player_lines[player['player_id']] = 'mid'
                else:
                    player_lines[player['player_id']] = 'fwd'
            return player_lines

        sorted_players = sorted(avg_positions, key=lambda p: p['avg_x'])

        for player in sorted_players:
            if player.get('is_goalkeeper'):
                player_lines[player['player_id']] = 'gk'

        current_idx = 0
        for line_template in template:
            line_name = line_template['line']
            count = line_template['count']

            assigned = 0
            while assigned < count and current_idx < len(sorted_players):
                player = sorted_players[current_idx]
                if player['player_id'] not in player_lines:
                    player_lines[player['player_id']] = line_name
                    assigned += 1
                current_idx += 1

        return player_lines

    def detect_formation_changes(
        self,
        tracking_data: List[Dict[str, Any]],
        team: str,
        time_interval: float = 900.0
    ) -> List[Dict[str, Any]]:
        timestamps = sorted(set(d.get('timestamp', 0.0) for d in tracking_data if d.get('team') == team))

        if not timestamps:
            return []

        formation_changes = []
        current_formation = None

        for start_time in range(int(min(timestamps)), int(max(timestamps)) + 1, int(time_interval)):
            end_time = start_time + time_interval

            interval_data = [
                d for d in tracking_data
                if d.get('team') == team
                and start_time <= d.get('timestamp', 0.0) < end_time
            ]

            if len(interval_data) < 100:
                continue

            result = self.detect(interval_data, team)

            if result['formation'] != current_formation and result['formation'] != 'unknown':
                if current_formation is not None:
                    formation_changes.append({
                        'timestamp': start_time,
                        'time_minutes': start_time / 60,
                        'from_formation': current_formation,
                        'to_formation': result['formation'],
                        'confidence': result['confidence']
                    })
                current_formation = result['formation']

        return formation_changes
