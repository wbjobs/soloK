from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict
import math
import json
import os


class HeatmapGenerator:
    def __init__(
        self,
        field_length: float = 105.0,
        field_width: float = 68.0,
        bandwidth: float = 5.0
    ):
        self.field_length = field_length
        self.field_width = field_width
        self.bandwidth = bandwidth

    def generate(
        self,
        tracking_data: List[Dict[str, Any]],
        grid_size: Tuple[int, int] = (10, 10),
        player_id: Optional[int] = None,
        team: Optional[str] = None
    ) -> Dict[str, Any]:
        positions = self._extract_positions(tracking_data, player_id, team)

        if not positions:
            return {
                'grid_size': grid_size,
                'field_length': self.field_length,
                'field_width': self.field_width,
                'heatmap': [[0.0 for _ in range(grid_size[1])] for _ in range(grid_size[0])],
                'max_intensity': 0.0,
                'min_intensity': 0.0,
                'num_samples': 0,
                'player_id': player_id,
                'team': team
            }

        grid_x, grid_y = grid_size
        cell_width = self.field_length / grid_x
        cell_height = self.field_width / grid_y

        heatmap = [[0.0 for _ in range(grid_y)] for _ in range(grid_x)]

        for pos in positions:
            x = pos.get('x', 0.0)
            y = pos.get('y', 0.0)

            for i in range(grid_x):
                cell_center_x = i * cell_width + cell_width / 2
                for j in range(grid_y):
                    cell_center_y = j * cell_height + cell_height / 2

                    distance = math.sqrt(
                        (x - cell_center_x) ** 2 +
                        (y - cell_center_y) ** 2
                    )

                    density = self._gaussian_kernel(distance, self.bandwidth)
                    heatmap[i][j] += density

        max_intensity = max(max(row) for row in heatmap) if heatmap else 0.0
        min_intensity = min(min(row) for row in heatmap) if heatmap else 0.0

        if max_intensity > 0:
            for i in range(grid_x):
                for j in range(grid_y):
                    heatmap[i][j] = heatmap[i][j] / max_intensity

        return {
            'grid_size': grid_size,
            'field_length': self.field_length,
            'field_width': self.field_width,
            'heatmap': [[round(val, 4) for val in row] for row in heatmap],
            'max_intensity': round(max_intensity, 4),
            'min_intensity': round(min_intensity, 4),
            'num_samples': len(positions),
            'player_id': player_id,
            'team': team
        }

    def _extract_positions(
        self,
        tracking_data: List[Dict[str, Any]],
        player_id: Optional[int],
        team: Optional[str]
    ) -> List[Dict[str, float]]:
        positions = []

        for data in tracking_data:
            data_player_id = data.get('player_id')
            data_team = data.get('team')

            if player_id is not None:
                if data_player_id != player_id:
                    continue
            elif team is not None:
                if data_team != team:
                    continue
            elif data_player_id is None:
                continue

            if 'x' in data and 'y' in data:
                positions.append({
                    'x': data['x'],
                    'y': data['y']
                })

        return positions

    def _gaussian_kernel(
        self,
        distance: float,
        bandwidth: float
    ) -> float:
        if bandwidth <= 0:
            return 0.0

        exponent = -0.5 * (distance / bandwidth) ** 2
        coefficient = 1.0 / (bandwidth * math.sqrt(2 * math.pi))

        return coefficient * math.exp(exponent)

    def generate_by_zone(
        self,
        tracking_data: List[Dict[str, Any]],
        zones: Optional[List[Dict[str, Any]]] = None,
        player_id: Optional[int] = None,
        team: Optional[str] = None
    ) -> Dict[str, Any]:
        if zones is None:
            zones = [
                {'name': 'left_back', 'x_range': (0, 35), 'y_range': (0, 22.7)},
                {'name': 'center_back', 'x_range': (0, 35), 'y_range': (22.7, 45.3)},
                {'name': 'right_back', 'x_range': (0, 35), 'y_range': (45.3, 68)},
                {'name': 'left_midfield', 'x_range': (35, 70), 'y_range': (0, 22.7)},
                {'name': 'center_midfield', 'x_range': (35, 70), 'y_range': (22.7, 45.3)},
                {'name': 'right_midfield', 'x_range': (35, 70), 'y_range': (45.3, 68)},
                {'name': 'left_forward', 'x_range': (70, 105), 'y_range': (0, 22.7)},
                {'name': 'center_forward', 'x_range': (70, 105), 'y_range': (22.7, 45.3)},
                {'name': 'right_forward', 'x_range': (70, 105), 'y_range': (45.3, 68)}
            ]

        positions = self._extract_positions(tracking_data, player_id, team)
        zone_counts = defaultdict(int)

        for pos in positions:
            x = pos.get('x', 0.0)
            y = pos.get('y', 0.0)

            for zone in zones:
                x_min, x_max = zone['x_range']
                y_min, y_max = zone['y_range']

                if x_min <= x <= x_max and y_min <= y <= y_max:
                    zone_counts[zone['name']] += 1
                    break

        total = sum(zone_counts.values())
        zone_percentages = {}
        for zone_name, count in zone_counts.items():
            zone_percentages[zone_name] = round(count / total * 100, 2) if total > 0 else 0.0

        return {
            'zone_counts': dict(zone_counts),
            'zone_percentages': zone_percentages,
            'total_positions': len(positions),
            'player_id': player_id,
            'team': team
        }

    def export_to_image(
        self,
        heatmap_data: Dict[str, Any],
        output_path: str
    ) -> bool:
        try:
            import numpy as np
            import matplotlib.pyplot as plt
            from matplotlib.colors import LinearSegmentedColormap

            heatmap = heatmap_data.get('heatmap', [])
            if not heatmap:
                return False

            heatmap_array = np.array(heatmap)

            colors = [
                (0.0, 1.0, 0.0, 0.0),
                (0.0, 1.0, 0.0, 0.3),
                (1.0, 1.0, 0.0, 0.6),
                (1.0, 0.5, 0.0, 0.8),
                (1.0, 0.0, 0.0, 1.0)
            ]
            cmap = LinearSegmentedColormap.from_list('custom_heatmap', colors, N=256)

            fig, ax = plt.subplots(figsize=(10.5, 6.8))

            field_length = heatmap_data.get('field_length', 105.0)
            field_width = heatmap_data.get('field_width', 68.0)

            extent = [0, field_length, 0, field_width]

            im = ax.imshow(
                heatmap_array.T,
                cmap=cmap,
                extent=extent,
                origin='lower',
                aspect='auto',
                interpolation='bilinear'
            )

            ax.set_xlim(0, field_length)
            ax.set_ylim(0, field_width)

            self._draw_pitch(ax, field_length, field_width)

            plt.colorbar(im, ax=ax, label='Intensity')

            title = 'Heatmap'
            if heatmap_data.get('player_id'):
                title += f' - Player {heatmap_data["player_id"]}'
            elif heatmap_data.get('team'):
                title += f' - {heatmap_data["team"]}'
            ax.set_title(title)
            ax.set_xlabel('X (meters)')
            ax.set_ylabel('Y (meters)')

            plt.tight_layout()
            plt.savefig(output_path, dpi=150, bbox_inches='tight')
            plt.close()

            return True
        except ImportError:
            return self._export_to_simple_image(heatmap_data, output_path)
        except Exception:
            return False

    def _draw_pitch(
        self,
        ax: Any,
        field_length: float,
        field_width: float
    ) -> None:
        try:
            import matplotlib.patches as patches

            ax.add_patch(patches.Rectangle((0, 0), field_length, field_width, fill=False, linewidth=2, color='black'))

            ax.plot([field_length / 2, field_length / 2], [0, field_width], 'k-', linewidth=2)
            ax.add_patch(patches.Circle((field_length / 2, field_width / 2), 9.15, fill=False, linewidth=2, color='black'))
            ax.add_patch(patches.Circle((field_length / 2, field_width / 2), 0.5, fill=True, color='black'))

            for x in [0, field_length]:
                goal_y = (field_width - 7.32) / 2
                ax.plot([x, x], [goal_y, goal_y + 7.32], 'k-', linewidth=2)

                ax.plot([x, x + 16.5], [(field_width - 40.3) / 2, (field_width - 40.3) / 2], 'k-', linewidth=2)
                ax.plot([x, x + 16.5], [(field_width + 40.3) / 2, (field_width + 40.3) / 2], 'k-', linewidth=2)
                ax.plot([x + 16.5, x + 16.5], [(field_width - 40.3) / 2, (field_width + 40.3) / 2], 'k-', linewidth=2)

                ax.plot([x, x + 5.5], [(field_width - 18.32) / 2, (field_width - 18.32) / 2], 'k-', linewidth=2)
                ax.plot([x, x + 5.5], [(field_width + 18.32) / 2, (field_width + 18.32) / 2], 'k-', linewidth=2)
                ax.plot([x + 5.5, x + 5.5], [(field_width - 18.32) / 2, (field_width + 18.32) / 2], 'k-', linewidth=2)

                penalty_x = x + 11 if x == 0 else x - 11
                ax.add_patch(patches.Circle((penalty_x, field_width / 2), 0.5, fill=True, color='black'))
        except Exception:
            pass

    def _export_to_simple_image(
        self,
        heatmap_data: Dict[str, Any],
        output_path: str
    ) -> bool:
        try:
            heatmap = heatmap_data.get('heatmap', [])
            if not heatmap:
                return False

            svg_content = self._generate_svg_heatmap(heatmap_data)

            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(svg_content)

            return True
        except Exception:
            return False

    def _generate_svg_heatmap(
        self,
        heatmap_data: Dict[str, Any]
    ) -> str:
        heatmap = heatmap_data.get('heatmap', [])
        grid_size = heatmap_data.get('grid_size', (10, 10))
        field_length = heatmap_data.get('field_length', 105.0)
        field_width = heatmap_data.get('field_width', 68.0)

        scale = 5
        width = int(field_length * scale)
        height = int(field_width * scale)
        cell_width = width / grid_size[0]
        cell_height = height / grid_size[1]

        svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">']
        svg.append(f'<rect width="{width}" height="{height}" fill="#ffffff"/>')

        for i in range(grid_size[0]):
            for j in range(grid_size[1]):
                intensity = heatmap[i][j] if i < len(heatmap) and j < len(heatmap[i]) else 0.0

                r, g, b, a = self._intensity_to_color(intensity)

                x = i * cell_width
                y = (grid_size[1] - 1 - j) * cell_height

                svg.append(
                    f'<rect x="{x}" y="{y}" width="{cell_width}" height="{cell_height}" '
                    f'fill="rgba({int(r*255)}, {int(g*255)}, {int(b*255)}, {a})"/>'
                )

        svg.append(self._generate_svg_pitch(width, height, field_length, field_width))

        svg.append('</svg>')
        return '\n'.join(svg)

    def _intensity_to_color(
        self,
        intensity: float
    ) -> Tuple[float, float, float, float]:
        intensity = max(0.0, min(1.0, intensity))

        if intensity < 0.25:
            t = intensity / 0.25
            return (0.0, 1.0, 0.0, t * 0.3)
        elif intensity < 0.5:
            t = (intensity - 0.25) / 0.25
            return (t, 1.0, 0.0, 0.3 + t * 0.3)
        elif intensity < 0.75:
            t = (intensity - 0.5) / 0.25
            return (1.0, 1.0 - t * 0.5, 0.0, 0.6 + t * 0.2)
        else:
            t = (intensity - 0.75) / 0.25
            return (1.0, 0.5 - t * 0.5, 0.0, 0.8 + t * 0.2)

    def _generate_svg_pitch(
        self,
        width: int,
        height: int,
        field_length: float,
        field_width: float
    ) -> str:
        elements = []

        elements.append(f'<rect x="0" y="0" width="{width}" height="{height}" fill="none" stroke="black" stroke-width="2"/>')

        mid_x = width / 2
        elements.append(f'<line x1="{mid_x}" y1="0" x2="{mid_x}" y2="{height}" stroke="black" stroke-width="2"/>')

        center_radius = 9.15 * (width / field_length)
        elements.append(f'<circle cx="{mid_x}" cy="{height/2}" r="{center_radius}" fill="none" stroke="black" stroke-width="2"/>')
        elements.append(f'<circle cx="{mid_x}" cy="{height/2}" r="3" fill="black"/>')

        goal_width = 7.32 * (height / field_width)
        goal_y_start = (height - goal_width) / 2
        goal_y_end = goal_y_start + goal_width

        for x in [0, width]:
            elements.append(f'<line x1="{x}" y1="{goal_y_start}" x2="{x}" y2="{goal_y_end}" stroke="black" stroke-width="3"/>')

            box_width = 16.5 * (width / field_length)
            box_height = 40.3 * (height / field_width)
            box_y_start = (height - box_height) / 2
            box_x = x if x == 0 else x - box_width
            elements.append(f'<rect x="{box_x}" y="{box_y_start}" width="{box_width}" height="{box_height}" fill="none" stroke="black" stroke-width="2"/>')

            small_box_width = 5.5 * (width / field_length)
            small_box_height = 18.32 * (height / field_width)
            small_box_y_start = (height - small_box_height) / 2
            small_box_x = x if x == 0 else x - small_box_width
            elements.append(f'<rect x="{small_box_x}" y="{small_box_y_start}" width="{small_box_width}" height="{small_box_height}" fill="none" stroke="black" stroke-width="2"/>')

            penalty_x = 11 * (width / field_length) if x == 0 else width - 11 * (width / field_length)
            elements.append(f'<circle cx="{penalty_x}" cy="{height/2}" r="3" fill="black"/>')

        return '\n'.join(elements)

    def export_to_json(
        self,
        heatmap_data: Dict[str, Any],
        output_path: str
    ) -> bool:
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(heatmap_data, f, indent=2, ensure_ascii=False)
            return True
        except Exception:
            return False
