from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict
import math


class PassNetworkBuilder:
    def __init__(
        self,
        field_length: float = 105.0,
        field_width: float = 68.0
    ):
        self.field_length = field_length
        self.field_width = field_width

    def build(
        self,
        pass_events: List[Dict[str, Any]],
        team: str
    ) -> Dict[str, Any]:
        team_passes = [
            p for p in pass_events
            if p.get('team') == team
            and p.get('event_type') == 'pass'
        ]

        if not team_passes:
            return {
                'nodes': [],
                'edges': [],
                'metrics': {
                    'total_passes': 0,
                    'successful_passes': 0,
                    'success_rate': 0.0,
                    'avg_passes_per_player': 0.0
                }
            }

        nodes = self._build_nodes(team_passes)
        edges = self._build_edges(team_passes)
        metrics = self._calculate_network_metrics(nodes, edges, team_passes)

        centrality_metrics = self._calculate_centrality(nodes, edges)
        for player_id, centrality in centrality_metrics.items():
            for node in nodes:
                if node['player_id'] == player_id:
                    node.update(centrality)
                    break

        return {
            'nodes': nodes,
            'edges': edges,
            'metrics': metrics
        }

    def _build_nodes(
        self,
        pass_events: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        player_stats = defaultdict(lambda: {
            'passes_sent': 0,
            'passes_received': 0,
            'successful_sent': 0,
            'successful_received': 0,
            'positions': []
        })

        for pass_event in pass_events:
            from_player = pass_event.get('player_id')
            details = pass_event.get('details', {})
            to_player = details.get('to_player_id')
            success = details.get('success', True)

            if from_player is not None:
                player_stats[from_player]['passes_sent'] += 1
                if success:
                    player_stats[from_player]['successful_sent'] += 1
                if 'x' in pass_event and 'y' in pass_event:
                    player_stats[from_player]['positions'].append({
                        'x': pass_event['x'],
                        'y': pass_event['y']
                    })

            if to_player is not None:
                player_stats[to_player]['passes_received'] += 1
                if success:
                    player_stats[to_player]['successful_received'] += 1

        nodes = []
        for player_id, stats in player_stats.items():
            avg_x = sum(p['x'] for p in stats['positions']) / len(stats['positions']) if stats['positions'] else None
            avg_y = sum(p['y'] for p in stats['positions']) / len(stats['positions']) if stats['positions'] else None

            send_success_rate = (stats['successful_sent'] / stats['passes_sent'] * 100) if stats['passes_sent'] > 0 else 0.0

            nodes.append({
                'player_id': player_id,
                'passes_sent': stats['passes_sent'],
                'passes_received': stats['passes_received'],
                'successful_sent': stats['successful_sent'],
                'successful_received': stats['successful_received'],
                'send_success_rate': round(send_success_rate, 2),
                'avg_x': avg_x,
                'avg_y': avg_y,
                'total_passes': stats['passes_sent'] + stats['passes_received']
            })

        return nodes

    def _build_edges(
        self,
        pass_events: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        edge_stats = defaultdict(lambda: {
            'total': 0,
            'successful': 0
        })

        for pass_event in pass_events:
            from_player = pass_event.get('player_id')
            details = pass_event.get('details', {})
            to_player = details.get('to_player_id')
            success = details.get('success', True)

            if from_player is not None and to_player is not None:
                edge_key = (min(from_player, to_player), max(from_player, to_player))
                edge_stats[edge_key]['total'] += 1
                if success:
                    edge_stats[edge_key]['successful'] += 1

        edges = []
        for (from_id, to_id), stats in edge_stats.items():
            success_rate = (stats['successful'] / stats['total'] * 100) if stats['total'] > 0 else 0.0
            edges.append({
                'from_player_id': from_id,
                'to_player_id': to_id,
                'total_passes': stats['total'],
                'successful_passes': stats['successful'],
                'success_rate': round(success_rate, 2),
                'weight': stats['successful']
            })

        edges.sort(key=lambda x: x['weight'], reverse=True)
        return edges

    def _calculate_network_metrics(
        self,
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
        pass_events: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        total_passes = len(pass_events)
        successful_passes = sum(1 for p in pass_events if p.get('details', {}).get('success', True))
        success_rate = (successful_passes / total_passes * 100) if total_passes > 0 else 0.0
        avg_passes_per_player = (total_passes / len(nodes)) if nodes else 0.0

        return {
            'total_passes': total_passes,
            'successful_passes': successful_passes,
            'success_rate': round(success_rate, 2),
            'avg_passes_per_player': round(avg_passes_per_player, 2),
            'num_players': len(nodes),
            'num_connections': len(edges)
        }

    def _calculate_centrality(
        self,
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]]
    ) -> Dict[int, Dict[str, float]]:
        player_ids = [node['player_id'] for node in nodes]
        n = len(player_ids)

        if n == 0:
            return {}

        adjacency = defaultdict(list)
        for edge in edges:
            from_id = edge['from_player_id']
            to_id = edge['to_player_id']
            weight = edge['weight']
            adjacency[from_id].append((to_id, weight))
            adjacency[to_id].append((from_id, weight))

        degree_centrality = self._calculate_degree_centrality(nodes, edges, n)
        pagerank = self._calculate_pagerank(nodes, edges)
        betweenness = self._calculate_betweenness_centrality(player_ids, adjacency)

        centrality = {}
        for player_id in player_ids:
            centrality[player_id] = {
                'degree_centrality': round(degree_centrality.get(player_id, 0.0), 4),
                'pagerank': round(pagerank.get(player_id, 0.0), 4),
                'betweenness_centrality': round(betweenness.get(player_id, 0.0), 4)
            }

        return centrality

    def _calculate_degree_centrality(
        self,
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
        n: int
    ) -> Dict[int, float]:
        if n <= 1:
            return {node['player_id']: 0.0 for node in nodes}

        degree = defaultdict(int)
        for edge in edges:
            degree[edge['from_player_id']] += 1
            degree[edge['to_player_id']] += 1

        return {
            node['player_id']: degree.get(node['player_id'], 0) / (n - 1)
            for node in nodes
        }

    def _calculate_pagerank(
        self,
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
        damping: float = 0.85,
        iterations: int = 100,
        tol: float = 1e-6
    ) -> Dict[int, float]:
        player_ids = [node['player_id'] for node in nodes]
        n = len(player_ids)

        if n == 0:
            return {}

        adjacency = defaultdict(dict)
        for edge in edges:
            from_id = edge['from_player_id']
            to_id = edge['to_player_id']
            weight = edge['weight']
            if to_id not in adjacency[from_id] or weight > adjacency[from_id][to_id]:
                adjacency[from_id][to_id] = weight
            if from_id not in adjacency[to_id] or weight > adjacency[to_id][from_id]:
                adjacency[to_id][from_id] = weight

        out_degree = defaultdict(float)
        for player_id in player_ids:
            out_degree[player_id] = sum(adjacency[player_id].values())

        pagerank = {pid: 1.0 / n for pid in player_ids}

        for _ in range(iterations):
            new_pagerank = {}
            for pid in player_ids:
                rank = (1 - damping) / n
                for other_id in player_ids:
                    if other_id != pid and pid in adjacency[other_id] and out_degree[other_id] > 0:
                        rank += damping * pagerank[other_id] * (adjacency[other_id][pid] / out_degree[other_id])
                new_pagerank[pid] = rank

            diff = sum(abs(new_pagerank[pid] - pagerank[pid]) for pid in player_ids)
            pagerank = new_pagerank
            if diff < tol:
                break

        return pagerank

    def _calculate_betweenness_centrality(
        self,
        player_ids: List[int],
        adjacency: Dict[int, List[Tuple[int, float]]]
    ) -> Dict[int, float]:
        n = len(player_ids)
        if n <= 2:
            return {pid: 0.0 for pid in player_ids}

        betweenness = {pid: 0.0 for pid in player_ids}

        for s in player_ids:
            for t in player_ids:
                if s == t:
                    continue

                paths = self._find_shortest_paths(s, t, adjacency)
                if not paths:
                    continue

                total_paths = len(paths)
                for path in paths:
                    for node in path[1:-1]:
                        betweenness[node] += 1.0 / total_paths

        for pid in betweenness:
            betweenness[pid] /= ((n - 1) * (n - 2) / 2)

        return betweenness

    def _find_shortest_paths(
        self,
        start: int,
        end: int,
        adjacency: Dict[int, List[Tuple[int, float]]]
    ) -> List[List[int]]:
        queue = [(start, [start])]
        visited = set()
        paths = []
        min_length = float('inf')

        while queue:
            current, path = queue.pop(0)

            if len(path) > min_length:
                continue

            if current == end:
                if len(path) < min_length:
                    min_length = len(path)
                    paths = [path]
                elif len(path) == min_length:
                    paths.append(path)
                continue

            if current in visited:
                continue
            visited.add(current)

            for neighbor, _ in adjacency.get(current, []):
                if neighbor not in path:
                    queue.append((neighbor, path + [neighbor]))

        return paths

    def export_to_graphml(
        self,
        network_data: Dict[str, Any],
        output_path: str
    ) -> bool:
        try:
            nodes = network_data.get('nodes', [])
            edges = network_data.get('edges', [])

            with open(output_path, 'w', encoding='utf-8') as f:
                f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
                f.write('<graphml xmlns="http://graphml.graphdrawing.org/xmlns">\n')
                f.write('  <graph id="pass_network" edgedefault="undirected">\n')

                for node in nodes:
                    f.write(f'    <node id="{node["player_id"]}">\n')
                    for key, value in node.items():
                        if key != 'player_id' and value is not None:
                            f.write(f'      <data key="{key}">{value}</data>\n')
                    f.write('    </node>\n')

                for i, edge in enumerate(edges):
                    f.write(f'    <edge id="e{i}" source="{edge["from_player_id"]}" target="{edge["to_player_id"]}">\n')
                    for key, value in edge.items():
                        if key not in ['from_player_id', 'to_player_id'] and value is not None:
                            f.write(f'      <data key="{key}">{value}</data>\n')
                    f.write('    </edge>\n')

                f.write('  </graph>\n')
                f.write('</graphml>\n')

            return True
        except Exception:
            return False
