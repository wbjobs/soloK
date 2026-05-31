import os
import tempfile
import numpy as np
from typing import List, Dict, Optional
from datetime import datetime
from app.core.logging import logger

try:
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    from reportlab.platypus import (
        SimpleDocTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
        Image as RLImage,
        PageBreak,
    )
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from PIL import Image as PILImage
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle

    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False
    logger.warning("ReportLab not available. PDF generation will be limited.")


class ReportGenerator:
    def __init__(self):
        self.temp_dir = tempfile.mkdtemp()

    def generate_mission_report(
        self,
        mission_data: Dict,
        detections: List[Dict],
        tracks: List[Dict],
        measurements: List[Dict],
        annotated_image: Optional[np.ndarray] = None,
        output_path: Optional[str] = None,
    ) -> str:
        if not REPORTLAB_AVAILABLE:
            logger.error("ReportLab not available")
            return ""

        if output_path is None:
            output_path = os.path.join(
                self.temp_dir,
                f"mission_{mission_data.get('id', 'unknown')}_report.pdf",
            )

        try:
            doc = SimpleDocTemplate(
                output_path,
                pagesize=landscape(A4),
                rightMargin=15 * mm,
                leftMargin=15 * mm,
                topMargin=15 * mm,
                bottomMargin=15 * mm,
            )

            styles = getSampleStyleSheet()
            title_style = ParagraphStyle(
                "CustomTitle",
                parent=styles["Heading1"],
                fontSize=20,
                textColor=colors.HexColor("#1a5276"),
                alignment=TA_CENTER,
                spaceAfter=10 * mm,
            )

            section_style = ParagraphStyle(
                "CustomSection",
                parent=styles["Heading2"],
                fontSize=14,
                textColor=colors.HexColor("#2874a6"),
                alignment=TA_LEFT,
                spaceBefore=5 * mm,
                spaceAfter=3 * mm,
            )

            normal_style = ParagraphStyle(
                "CustomNormal",
                parent=styles["Normal"],
                fontSize=10,
                alignment=TA_LEFT,
            )

            story = []

            story.append(Paragraph("水下声呐图像检测报告", title_style))
            story.append(Spacer(1, 5 * mm))

            info_data = [
                ["任务名称", mission_data.get("name", "N/A")],
                ["任务ID", str(mission_data.get("id", "N/A"))],
                ["文件名称", mission_data.get("file_name", "N/A")],
                ["文件格式", mission_data.get("file_format", "N/A")],
                ["创建时间", str(mission_data.get("created_at", "N/A"))],
                ["状态", mission_data.get("status", "N/A")],
            ]
            info_table = Table(info_data, colWidths=[30 * mm, 80 * mm])
            info_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#d5e8f3")),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#1a5276")),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            story.append(info_table)

            if mission_data.get("description"):
                story.append(Spacer(1, 3 * mm))
                story.append(Paragraph(f"任务描述: {mission_data['description']}", normal_style))

            story.append(PageBreak())

            story.append(Paragraph("一、检测统计", section_style))
            story.append(Spacer(1, 3 * mm))

            stats = self._calculate_statistics(detections, tracks)

            stat_data = [
                ["总检测数", str(stats["total_detections"])],
                ["活跃跟踪数", str(stats["active_tracks"])],
                ["检测目标类型", ", ".join(stats["class_names"]) if stats["class_names"] else "N/A"],
            ]
            stat_table = Table(stat_data, colWidths=[30 * mm, 50 * mm])
            stat_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#d5e8f3")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
            ]))
            story.append(stat_table)

            pie_chart_path = self._generate_classification_pie(stats, mission_data.get("id", 0))
            if pie_chart_path and os.path.exists(pie_chart_path):
                story.append(Spacer(1, 3 * mm))
                story.append(RLImage(pie_chart_path, width=60 * mm, height=50 * mm))

            story.append(PageBreak())

            story.append(Paragraph("二、目标检测详情", section_style))
            story.append(Spacer(1, 3 * mm))

            if detections:
                det_header = ["序号", "类型", "置信度", "位置(x,y)", "尺寸(w,h)"]
                det_data = [det_header]
                for i, det in enumerate(detections[:20], 1):
                    bbox = det.get("bbox", {})
                    if isinstance(bbox, dict):
                        pos_str = f"({bbox.get('x', 0)}, {bbox.get('y', 0)})"
                        size_str = f"({bbox.get('width', 0)}, {bbox.get('height', 0)})"
                    elif isinstance(bbox, (tuple, list)) and len(bbox) >= 4:
                        pos_str = f"({bbox[0]}, {bbox[1]})"
                        size_str = f"({bbox[2]}, {bbox[3]})"
                    else:
                        pos_str = "N/A"
                        size_str = "N/A"

                    det_data.append([
                        str(i),
                        det.get("class_name", "N/A"),
                        f"{det.get('confidence', 0):.3f}",
                        pos_str,
                        size_str,
                    ])

                det_table = Table(det_data, colWidths=[10 * mm, 25 * mm, 20 * mm, 35 * mm, 25 * mm])
                det_table.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2874a6")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f6f7")]),
                ]))
                story.append(det_table)
            else:
                story.append(Paragraph("未检测到目标", normal_style))

            story.append(PageBreak())

            story.append(Paragraph("三、跟踪与测量结果", section_style))
            story.append(Spacer(1, 3 * mm))

            if tracks:
                trk_header = ["跟踪ID", "类型", "起始帧", "结束帧", "轨迹长度", "估计长度(m)", "估计宽度(m)"]
                trk_data = [trk_header]
                for trk in tracks[:20]:
                    trajectory = trk.get("trajectory", [])
                    if isinstance(trajectory, list):
                        traj_len = len(trajectory)
                    elif isinstance(trajectory, dict):
                        traj_len = len(trajectory.get("points", []))
                    else:
                        traj_len = 0

                    trk_data.append([
                        str(trk.get("track_id", "N/A")),
                        trk.get("class_name", "N/A"),
                        str(trk.get("frame_start", "N/A")),
                        str(trk.get("frame_end", "N/A")),
                        str(traj_len),
                        f"{trk.get('length_estimate', 0):.2f}",
                        f"{trk.get('width_estimate', 0):.2f}",
                    ])

                trk_table = Table(trk_data, colWidths=[15 * mm, 20 * mm, 15 * mm, 15 * mm, 18 * mm, 20 * mm, 20 * mm])
                trk_table.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2874a6")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f6f7")]),
                ]))
                story.append(trk_table)
            else:
                story.append(Paragraph("无跟踪数据", normal_style))

            if annotated_image is not None:
                story.append(PageBreak())
                story.append(Paragraph("四、检测结果图像", section_style))
                story.append(Spacer(1, 3 * mm))

                img_path = self._save_annotated_image(annotated_image, mission_data.get("id", 0))
                if img_path and os.path.exists(img_path):
                    story.append(RLImage(img_path, width=160 * mm, height=80 * mm))

            story.append(Spacer(1, 5 * mm))
            story.append(Paragraph(
                f"报告生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
                normal_style,
            ))

            doc.build(story)
            logger.info(f"Report generated: {output_path}")
            return output_path

        except Exception as e:
            logger.error(f"Report generation error: {e}")
            return ""

    def _calculate_statistics(
        self,
        detections: List[Dict],
        tracks: List[Dict],
    ) -> Dict:
        class_counts = {}
        for det in detections:
            cls = det.get("class_name", "unknown")
            class_counts[cls] = class_counts.get(cls, 0) + 1

        class_names = list(class_counts.keys())
        active_tracks = sum(1 for t in tracks if t.get("is_active", True))

        return {
            "total_detections": len(detections),
            "total_tracks": len(tracks),
            "active_tracks": active_tracks,
            "class_counts": class_counts,
            "class_names": class_names,
        }

    def _generate_classification_pie(
        self,
        stats: Dict,
        mission_id: int,
    ) -> Optional[str]:
        if not REPORTLAB_AVAILABLE:
            return None

        try:
            fig, ax = plt.subplots(figsize=(6, 5))

            class_counts = stats.get("class_counts", {})
            if not class_counts:
                return None

            labels = list(class_counts.keys())
            sizes = list(class_counts.values())

            color_map = {
                "shipwreck": "#e74c3c",
                "pipeline": "#27ae60",
                "reef": "#f39c12",
                "fish_school": "#3498db",
                "unknown": "#95a5a6",
            }
            chart_colors = [color_map.get(label, "#3498db") for label in labels]

            wedges, texts, autotexts = ax.pie(
                sizes,
                labels=labels,
                colors=chart_colors,
                autopct="%1.1f%%",
                startangle=90,
            )

            ax.set_title("目标类型分布", fontsize=14, pad=20)

            pie_path = os.path.join(
                self.temp_dir, f"mission_{mission_id}_pie.png"
            )
            fig.savefig(pie_path, dpi=150, bbox_inches="tight")
            plt.close(fig)

            return pie_path

        except Exception as e:
            logger.error(f"Pie chart generation error: {e}")
            return None

    def _save_annotated_image(
        self,
        image: np.ndarray,
        mission_id: int,
    ) -> Optional[str]:
        try:
            img_path = os.path.join(
                self.temp_dir, f"mission_{mission_id}_annotated.png"
            )

            if len(image.shape) == 2:
                pil_img = PILImage.fromarray(image, "L")
            else:
                pil_img = PILImage.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))

            pil_img.save(img_path)
            return img_path

        except Exception as e:
            logger.error(f"Image save error: {e}")
            return None


report_generator = ReportGenerator()
