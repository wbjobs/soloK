import io
import os
import tempfile
from typing import Optional, Dict, Any, List
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.match import Match
from app.models.event import Event
from app.models.analysis_result import AnalysisResult
from app.services.tactical_analyzer import TacticalAnalyzer


class ReportGenerator:
    """报告生成器，支持PDF报告、HTML报告、战术动画和事件剪辑的生成。"""

    def __init__(self, db: Session, match_id: int) -> None:
        """
        初始化报告生成器。

        Args:
            db: 数据库会话。
            match_id: 比赛ID。
        """
        self.db = db
        self.match_id = match_id
        self.tactical_analyzer = TacticalAnalyzer(db=db, match_id=match_id)
        self._match_data: Optional[Dict[str, Any]] = None
        self._events_data: Optional[List[Dict[str, Any]]] = None
        self._analysis_data: Optional[Dict[str, Any]] = None

    def generate_pdf_report(
        self,
        include_heatmaps: bool = True,
        include_pass_network: bool = True,
        include_events: bool = True
    ) -> str:
        """
        生成PDF格式的比赛分析报告。

        Args:
            include_heatmaps: 是否包含热力图，默认True。
            include_pass_network: 是否包含传球网络图，默认True。
            include_events: 是否包含事件列表，默认True。

        Returns:
            生成的PDF文件路径。
        """
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle
        )
        from reportlab.lib import colors

        self._load_match_data()

        output_dir = tempfile.mkdtemp(prefix=f"report_{self.match_id}_")
        pdf_path = os.path.join(output_dir, f"match_{self.match_id}_report.pdf")

        doc = SimpleDocTemplate(
            pdf_path,
            pagesize=A4,
            rightMargin=20 * mm,
            leftMargin=20 * mm,
            topMargin=20 * mm,
            bottomMargin=20 * mm,
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'ReportTitle',
            parent=styles['Title'],
            fontSize=24,
            spaceAfter=30,
        )
        heading_style = ParagraphStyle(
            'SectionHeading',
            parent=styles['Heading2'],
            fontSize=16,
            spaceAfter=12,
            spaceBefore=20,
        )

        elements: List = []

        match_info = self._match_data or {}
        title = match_info.get('title', f'Match {self.match_id}')
        elements.append(Paragraph(f"Match Analysis Report: {title}", title_style))
        elements.append(Spacer(1, 10 * mm))

        elements.append(Paragraph("Match Information", heading_style))
        match_table_data = [
            ['Field', 'Value'],
            ['Match', title],
            ['Home Team', match_info.get('home_team', 'N/A')],
            ['Away Team', match_info.get('away_team', 'N/A')],
            ['Date', str(match_info.get('match_date', 'N/A'))],
            ['Generated', datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')],
        ]
        match_table = Table(match_table_data, colWidths=[80 * mm, 80 * mm])
        match_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
        ]))
        elements.append(match_table)
        elements.append(Spacer(1, 10 * mm))

        possession_chart_path = self._create_possession_chart()
        if possession_chart_path and os.path.exists(possession_chart_path):
            elements.append(Paragraph("Possession", heading_style))
            elements.append(Image(possession_chart_path, width=140 * mm, height=80 * mm))
            elements.append(Spacer(1, 10 * mm))

        if include_heatmaps:
            heatmap_path = self._create_heatmap_image()
            if heatmap_path and os.path.exists(heatmap_path):
                elements.append(Paragraph("Heatmap", heading_style))
                elements.append(Image(heatmap_path, width=140 * mm, height=90 * mm))
                elements.append(Spacer(1, 10 * mm))

        if include_pass_network:
            pass_network_path = self._create_pass_network_image()
            if pass_network_path and os.path.exists(pass_network_path):
                elements.append(Paragraph("Pass Network", heading_style))
                elements.append(Image(pass_network_path, width=140 * mm, height=90 * mm))
                elements.append(Spacer(1, 10 * mm))

        if include_events and self._events_data:
            elements.append(Paragraph("Key Events", heading_style))
            event_table_data = [['Time', 'Type', 'Team', 'Position']]
            for event in self._events_data[:30]:
                event_table_data.append([
                    f"{event.get('timestamp', 0):.1f}s",
                    event.get('event_type', 'N/A'),
                    event.get('team', 'N/A'),
                    f"({event.get('x', 0):.1f}, {event.get('y', 0):.1f})",
                ])
            event_table = Table(event_table_data, colWidths=[30 * mm, 40 * mm, 30 * mm, 60 * mm])
            event_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
            ]))
            elements.append(event_table)

        doc.build(elements)
        return pdf_path

    def generate_html_report(
        self,
        include_heatmaps: bool = True,
        include_pass_network: bool = True,
        include_events: bool = True
    ) -> str:
        """
        生成HTML格式的比赛分析报告。

        Args:
            include_heatmaps: 是否包含热力图，默认True。
            include_pass_network: 是否包含传球网络图，默认True。
            include_events: 是否包含事件列表，默认True。

        Returns:
            生成的HTML文件路径。
        """
        self._load_match_data()

        output_dir = tempfile.mkdtemp(prefix=f"report_html_{self.match_id}_")
        html_path = os.path.join(output_dir, f"match_{self.match_id}_report.html")

        match_info = self._match_data or {}
        title = match_info.get('title', f'Match {self.match_id}')

        html_parts = [
            '<!DOCTYPE html>',
            '<html lang="en">',
            '<head>',
            '<meta charset="UTF-8">',
            f'<title>Match Report - {title}</title>',
            '<style>',
            'body { font-family: Arial, sans-serif; margin: 20px; }',
            'h1 { color: #333; }',
            'h2 { color: #555; border-bottom: 2px solid #ddd; padding-bottom: 5px; }',
            'table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }',
            'th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }',
            'th { background-color: #4CAF50; color: white; }',
            'tr:nth-child(even) { background-color: #f2f2f2; }',
            '.section { margin-bottom: 30px; }',
            '.chart-container { text-align: center; margin: 20px 0; }',
            '</style>',
            '</head>',
            '<body>',
            f'<h1>Match Analysis Report: {title}</h1>',
            '<div class="section">',
            '<h2>Match Information</h2>',
            '<table>',
            f'<tr><td>Match</td><td>{title}</td></tr>',
            f'<tr><td>Home Team</td><td>{match_info.get("home_team", "N/A")}</td></tr>',
            f'<tr><td>Away Team</td><td>{match_info.get("away_team", "N/A")}</td></tr>',
            f'<tr><td>Date</td><td>{match_info.get("match_date", "N/A")}</td></tr>',
            f'<tr><td>Generated</td><td>{datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")}</td></tr>',
            '</table>',
            '</div>',
        ]

        possession_chart_path = self._create_possession_chart()
        if possession_chart_path and os.path.exists(possession_chart_path):
            html_parts.append('<div class="section"><h2>Possession</h2>')
            html_parts.append(
                f'<div class="chart-container"><img src="{possession_chart_path}" '
                f'style="max-width: 100%;"></div></div>'
            )

        if include_heatmaps:
            heatmap_path = self._create_heatmap_image()
            if heatmap_path and os.path.exists(heatmap_path):
                html_parts.append('<div class="section"><h2>Heatmap</h2>')
                html_parts.append(
                    f'<div class="chart-container"><img src="{heatmap_path}" '
                    f'style="max-width: 100%;"></div></div>'
                )

        if include_pass_network:
            pass_network_path = self._create_pass_network_image()
            if pass_network_path and os.path.exists(pass_network_path):
                html_parts.append('<div class="section"><h2>Pass Network</h2>')
                html_parts.append(
                    f'<div class="chart-container"><img src="{pass_network_path}" '
                    f'style="max-width: 100%;"></div></div>'
                )

        if include_events and self._events_data:
            html_parts.append('<div class="section"><h2>Key Events</h2><table>')
            html_parts.append('<tr><th>Time</th><th>Type</th><th>Team</th><th>Position</th></tr>')
            for event in self._events_data[:50]:
                html_parts.append(
                    f'<tr>'
                    f'<td>{event.get("timestamp", 0):.1f}s</td>'
                    f'<td>{event.get("event_type", "N/A")}</td>'
                    f'<td>{event.get("team", "N/A")}</td>'
                    f'<td>({event.get("x", 0):.1f}, {event.get("y", 0):.1f})</td>'
                    f'</tr>'
                )
            html_parts.append('</table></div>')

        html_parts.append('</body></html>')

        with open(html_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(html_parts))

        return html_path

    def generate_tactical_animation(
        self,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        format: str = 'mp4'
    ) -> str:
        """
        生成战术动画视频，展示球员移动轨迹和阵型变化。

        Args:
            start_time: 动画起始时间（秒），默认从头开始。
            end_time: 动画结束时间（秒），默认到比赛结束。
            format: 输出视频格式，默认 'mp4'。

        Returns:
            生成的视频文件路径。
        """
        from moviepy.editor import ImageSequenceClip

        output_dir = tempfile.mkdtemp(prefix=f"tactical_anim_{self.match_id}_")
        output_path = os.path.join(output_dir, f"tactical_{self.match_id}.{format}")

        tracking_data = self._load_tracking_data(start_time, end_time)
        if not tracking_data:
            return output_path

        frames = self._render_tactical_frames(tracking_data)

        if frames:
            fps = 25
            clip = ImageSequenceClip(frames, fps=fps)
            codec = 'libx264' if format == 'mp4' else 'png'
            clip.write_videofile(output_path, codec=codec, logger=None)
            clip.close()

        return output_path

    def generate_event_clip(
        self,
        event: Dict[str, Any],
        pre_seconds: float = 5.0,
        post_seconds: float = 5.0,
        format: str = 'mp4'
    ) -> str:
        """
        根据事件生成视频剪辑片段。

        Args:
            event: 事件字典，需包含 timestamp 和 match_id 字段。
            pre_seconds: 事件前开始的时间（秒），默认5秒。
            post_seconds: 事件后结束的时间（秒），默认5秒。
            format: 输出视频格式，默认 'mp4'。

        Returns:
            生成的视频剪辑文件路径。
        """
        from moviepy.editor import VideoFileClip

        output_dir = tempfile.mkdtemp(prefix=f"event_clip_{self.match_id}_")
        output_path = os.path.join(output_dir, f"event_clip.{format}")

        match = self.db.query(Match).filter(Match.id == self.match_id).first()
        if not match or not match.video_path:
            return output_path

        event_time = event.get('timestamp', 0.0)
        start_time = max(0, event_time - pre_seconds)

        try:
            clip = VideoFileClip(match.video_path)
            end_time = min(clip.duration, event_time + post_seconds)

            subclip = clip.subclip(start_time, end_time)
            codec = 'libx264' if format == 'mp4' else 'png'
            subclip.write_videofile(output_path, codec=codec, logger=None)
            subclip.close()
            clip.close()
        except Exception:
            pass

        return output_path

    def _create_possession_chart(self) -> Optional[str]:
        """
        创建控球率饼图。

        Returns:
            图表文件路径，失败时返回 None。
        """
        try:
            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt
        except ImportError:
            return None

        analysis = self._analysis_data
        if not analysis:
            return None

        possession = analysis.get('possession', {})
        team_a = possession.get('team_a_possession', 50.0)
        team_b = possession.get('team_b_possession', 50.0)

        if team_a == 0 and team_b == 0:
            team_a = 50.0
            team_b = 50.0

        output_dir = tempfile.mkdtemp(prefix="chart_")
        chart_path = os.path.join(output_dir, "possession.png")

        fig, ax = plt.subplots(figsize=(8, 5))
        labels = ['Team A', 'Team B']
        sizes = [team_a, team_b]
        colors_chart = ['#4CAF50', '#2196F3']
        ax.pie(sizes, labels=labels, colors=colors_chart, autopct='%1.1f%%', startangle=90)
        ax.set_title('Ball Possession')
        fig.savefig(chart_path, dpi=100, bbox_inches='tight')
        plt.close(fig)

        return chart_path

    def _create_heatmap_image(self) -> Optional[str]:
        """
        创建热力图。

        Returns:
            热力图文件路径，失败时返回 None。
        """
        try:
            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt
            import numpy as np
        except ImportError:
            return None

        analysis = self._analysis_data
        if not analysis:
            return None

        heatmap_a = analysis.get('heatmap_team_a', {})
        grid_a = heatmap_a.get('grid')
        heatmap_b = analysis.get('heatmap_team_b', {})
        grid_b = heatmap_b.get('grid')

        if grid_a is None and grid_b is None:
            return None

        output_dir = tempfile.mkdtemp(prefix="heatmap_")
        chart_path = os.path.join(output_dir, "heatmap.png")

        fig, axes = plt.subplots(1, 2, figsize=(16, 6))

        if grid_a is not None:
            grid_arr = np.array(grid_a) if not isinstance(grid_a, np.ndarray) else grid_a
            axes[0].imshow(grid_arr, cmap='Greens', aspect='auto', origin='lower')
            axes[0].set_title('Team A Heatmap')
        else:
            axes[0].text(0.5, 0.5, 'No data', ha='center', va='center')
            axes[0].set_title('Team A Heatmap')

        if grid_b is not None:
            grid_arr = np.array(grid_b) if not isinstance(grid_b, np.ndarray) else grid_b
            axes[1].imshow(grid_arr, cmap='Blues', aspect='auto', origin='lower')
            axes[1].set_title('Team B Heatmap')
        else:
            axes[1].text(0.5, 0.5, 'No data', ha='center', va='center')
            axes[1].set_title('Team B Heatmap')

        fig.suptitle('Team Heatmaps', fontsize=14)
        fig.savefig(chart_path, dpi=100, bbox_inches='tight')
        plt.close(fig)

        return chart_path

    def _create_pass_network_image(self) -> Optional[str]:
        """
        创建传球网络图。

        Returns:
            传球网络图文件路径，失败时返回 None。
        """
        try:
            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt
            import numpy as np
        except ImportError:
            return None

        analysis = self._analysis_data
        if not analysis:
            return None

        pass_network_a = analysis.get('pass_network_team_a', {})
        pass_network_b = analysis.get('pass_network_team_b', {})

        if not pass_network_a and not pass_network_b:
            return None

        output_dir = tempfile.mkdtemp(prefix="pass_net_")
        chart_path = os.path.join(output_dir, "pass_network.png")

        fig, axes = plt.subplots(1, 2, figsize=(16, 6))

        self._draw_pass_network(axes[0], pass_network_a, 'Team A', '#4CAF50')
        self._draw_pass_network(axes[1], pass_network_b, 'Team B', '#2196F3')

        fig.suptitle('Pass Networks', fontsize=14)
        fig.savefig(chart_path, dpi=100, bbox_inches='tight')
        plt.close(fig)

        return chart_path

    def _draw_pass_network(
        self,
        ax,
        network: Dict[str, Any],
        title: str,
        color: str
    ) -> None:
        """
        在matplotlib轴上绘制传球网络。

        Args:
            ax: matplotlib轴对象。
            network: 传球网络数据。
            title: 图表标题。
            color: 节点颜色。
        """
        nodes = network.get('nodes', [])
        edges = network.get('edges', [])

        if not nodes:
            ax.text(0.5, 0.5, 'No data', ha='center', va='center', transform=ax.transAxes)
            ax.set_title(title)
            return

        for node in nodes:
            x = node.get('avg_x', 52.5)
            y = node.get('avg_y', 34.0)
            size = node.get('total_passes', 1) * 20
            ax.scatter(x, y, s=size, c=color, alpha=0.7, edgecolors='white')

        for edge in edges:
            src = edge.get('from')
            dst = edge.get('to')
            weight = edge.get('count', 1)

            src_node = next((n for n in nodes if n.get('player_id') == src), None)
            dst_node = next((n for n in nodes if n.get('player_id') == dst), None)

            if src_node and dst_node:
                ax.annotate(
                    '',
                    xy=(dst_node.get('avg_x', 0), dst_node.get('avg_y', 0)),
                    xytext=(src_node.get('avg_x', 0), src_node.get('avg_y', 0)),
                    arrowprops=dict(
                        arrowstyle='->', color='gray',
                        alpha=min(weight / 10.0, 1.0), lw=1.0
                    ),
                )

        ax.set_xlim(0, 105)
        ax.set_ylim(0, 68)
        ax.set_title(title)
        ax.set_aspect('equal')

    def _load_match_data(self) -> None:
        """
        从数据库加载比赛数据、事件和分析结果。
        """
        if self._match_data is not None:
            return

        match = self.db.query(Match).filter(Match.id == self.match_id).first()
        if match:
            self._match_data = {
                'id': match.id,
                'title': match.title,
                'home_team': match.home_team,
                'away_team': match.away_team,
                'match_date': match.match_date.isoformat() if match.match_date else None,
                'video_path': match.video_path,
                'status': match.status.value if match.status else None,
            }
        else:
            self._match_data = {}

        events = self.db.query(Event).filter(Event.match_id == self.match_id).all()
        self._events_data = [
            {
                'id': e.id,
                'event_type': e.event_type,
                'timestamp': e.timestamp,
                'frame_number': e.frame_number,
                'team': e.team,
                'x': e.x,
                'y': e.y,
                'details': e.details,
            }
            for e in events
        ]

        analysis_results = self.db.query(AnalysisResult).filter(
            AnalysisResult.match_id == self.match_id
        ).all()

        self._analysis_data = {}
        for result in analysis_results:
            self._analysis_data[result.analysis_type] = result.data

    def _load_tracking_data(
        self,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """
        加载指定时间范围内的追踪数据。

        Args:
            start_time: 起始时间（秒）。
            end_time: 结束时间（秒）。

        Returns:
            追踪数据列表。
        """
        from app.models.tracking_data import TrackingData

        query = self.db.query(TrackingData).filter(
            TrackingData.match_id == self.match_id
        )

        if start_time is not None:
            query = query.filter(TrackingData.timestamp >= start_time)
        if end_time is not None:
            query = query.filter(TrackingData.timestamp <= end_time)

        query = query.order_by(TrackingData.timestamp, TrackingData.frame_number)

        results = query.all()

        return [
            {
                'id': t.id,
                'frame_number': t.frame_number,
                'timestamp': t.timestamp,
                'player_id': t.player_id,
                'x': t.x,
                'y': t.y,
                'team': t.team,
                'camera_id': t.camera_id,
            }
            for t in results
        ]

    def _render_tactical_frames(
        self,
        tracking_data: List[Dict[str, Any]]
    ) -> List[Any]:
        """
        渲染战术动画帧序列。

        Args:
            tracking_data: 追踪数据列表。

        Returns:
            帧图像列表（numpy数组）。
        """
        import numpy as np

        if not tracking_data:
            return []

        frames_by_time: Dict[float, List[Dict[str, Any]]] = {}
        for t in tracking_data:
            ts = round(t['timestamp'], 2)
            if ts not in frames_by_time:
                frames_by_time[ts] = []
            frames_by_time[ts].append(t)

        rendered_frames = []
        for timestamp in sorted(frames_by_time.keys()):
            tracks = frames_by_time[timestamp]

            frame_img = np.ones((680, 1050, 3), dtype=np.uint8) * 34

            cv2.line(frame_img, (0, 340), (1050, 340), (255, 255, 255), 1)
            cv2.circle(frame_img, (525, 340), 60, (255, 255, 255), 1)

            for track in tracks:
                x = int(track['x'] * 10)
                y = int(track['y'] * 10)
                team = track.get('team', 'unknown')

                if team == 'team_a':
                    color = (0, 200, 0)
                elif team == 'team_b':
                    color = (200, 0, 0)
                else:
                    color = (200, 200, 200)

                cv2.circle(frame_img, (x, y), 8, color, -1)

            rendered_frames.append(frame_img)

        return rendered_frames
