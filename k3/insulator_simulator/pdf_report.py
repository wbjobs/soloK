"""
PDF 报告导出模块

使用 ReportLab 生成专业仿真报告
支持中文渲染
"""

import base64
import io
import time
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image, PageBreak, KeepTogether,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


def _register_cn_font():
    candidates = [
        ("C:/Windows/Fonts/msyh.ttc", "SimHei"),
        ("C:/Windows/Fonts/simhei.ttf", "SimHei"),
        ("C:/Windows/Fonts/simsun.ttc", "SimSun"),
        ("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", "SimHei"),
    ]
    for path, name in candidates:
        if Path(path).exists():
            try:
                pdfmetrics.registerFont(TTFont("CN", path))
                return "CN"
            except Exception:
                continue
    return "Helvetica"


FONT_NAME = _register_cn_font()


class PDFReport:
    """PDF 报告生成器"""

    def __init__(self):
        self.styles = getSampleStyleSheet()
        self._setup_styles()

    def _setup_styles(self):
        self.title_style = ParagraphStyle(
            "CNTitle", parent=self.styles["Title"],
            fontName=FONT_NAME, fontSize=22, leading=28,
            alignment=TA_CENTER, spaceAfter=10 * mm,
        )
        self.h2_style = ParagraphStyle(
            "CNH2", parent=self.styles["Heading2"],
            fontName=FONT_NAME, fontSize=14, leading=18,
            textColor=colors.HexColor("#2c3e50"), spaceBefore=6 * mm,
            spaceAfter=3 * mm,
        )
        self.h3_style = ParagraphStyle(
            "CNH3", parent=self.styles["Heading3"],
            fontName=FONT_NAME, fontSize=12, leading=16,
            textColor=colors.HexColor("#34495e"), spaceBefore=4 * mm,
            spaceAfter=2 * mm,
        )
        self.body_style = ParagraphStyle(
            "CNBody", parent=self.styles["Normal"],
            fontName=FONT_NAME, fontSize=10, leading=15,
            alignment=TA_LEFT,
        )
        self.info_style = ParagraphStyle(
            "CNInfo", parent=self.body_style,
            textColor=colors.HexColor("#7f8c8d"),
        )
        self.warn_style = ParagraphStyle(
            "CNWarn", parent=self.body_style,
            textColor=colors.HexColor("#e74c3c"),
        )
        self.safe_style = ParagraphStyle(
            "CNSafe", parent=self.body_style,
            textColor=colors.HexColor("#27ae60"),
        )

    def _b64_to_image(self, b64_str: str, width: float = 150 * mm) -> Image:
        img_data = base64.b64decode(b64_str)
        img = Image(io.BytesIO(img_data))
        aspect = img.imageHeight / img.imageWidth if img.imageWidth > 0 else 0.6
        img.drawWidth = width
        img.drawHeight = width * aspect
        return img

    def generate(self, params: dict, result: dict,
                 images: dict, validation: dict,
                 output_path: str | None = None) -> bytes:
        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf, pagesize=A4,
            leftMargin=20 * mm, rightMargin=20 * mm,
            topMargin=20 * mm, bottomMargin=20 * mm,
        )

        story = []

        story.append(Paragraph("绝缘子串风偏角仿真报告", self.title_style))
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph(
            f"生成时间: {time.strftime('%Y-%m-%d %H:%M:%S')}",
            self.info_style,
        ))
        story.append(Spacer(1, 5 * mm))

        story.append(Paragraph("一、输入参数", self.h2_style))
        story.append(self._params_table(params))

        story.append(Paragraph("二、校验结果", self.h2_style))
        story.append(self._validation_section(validation))

        story.append(Paragraph("三、计算结果", self.h2_style))
        story.append(self._result_table(result))

        if images:
            story.append(Paragraph("四、可视化图表", self.h2_style))
            for label, b64 in images.items():
                story.append(Paragraph(label, self.h3_style))
                try:
                    img = self._b64_to_image(b64)
                    story.append(img)
                except Exception:
                    story.append(Paragraph(
                        f"[图表生成失败: {label}]", self.warn_style))
                story.append(Spacer(1, 3 * mm))

        story.append(Paragraph("五、结论与建议", self.h2_style))
        story.append(self._conclusion(result, validation))

        doc.build(story)
        pdf_bytes = buf.getvalue()

        if output_path:
            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, "wb") as f:
                f.write(pdf_bytes)

        return pdf_bytes

    def _params_table(self, params: dict) -> Table:
        st = self.styles["Normal"]
        st.fontName = FONT_NAME
        st.fontSize = 9

        data = [["参数名称", "参数值", "单位"]]
        mapping = {
            "string_type": "绝缘子串型",
            "wind_speed": "风速",
            "wind_angle": "风向角",
            "string_length": "绝缘子串长度",
            "v_angle": "V串半角",
            "conductor_tension": "导线张力",
            "ring_diameter": "均压环直径",
            "terrain_category": "地形类别",
            "span_length": "档距",
        }
        units = {
            "wind_speed": "m/s",
            "wind_angle": "°",
            "string_length": "m",
            "v_angle": "°",
            "conductor_tension": "N",
            "ring_diameter": "m",
            "span_length": "m",
        }
        type_names = {"I": "I型悬垂串", "V": "V型串", "VV": "双V型串"}
        terrain_names = {"A": "A类(沿海)", "B": "B类(开阔)", "C": "C类(城郊)", "D": "D类(市区)"}

        for key, label in mapping.items():
            val = params.get(key, "-")
            if key == "string_type" and isinstance(val, str):
                val = type_names.get(val, val)
            if key == "terrain_category" and isinstance(val, str):
                val = terrain_names.get(val, val)
            if key == "conductor_tension" and isinstance(val, (int, float)):
                val = f"{val / 1000:.1f}"
                unit = "kN"
            else:
                unit = units.get(key, "")
            data.append([label, str(val), unit])

        t = Table(data, colWidths=[45 * mm, 50 * mm, 25 * mm])
        t.setStyle(TableStyle([
            ("FONT", (0, 0), (-1, -1), FONT_NAME, 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#34495e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1),
             [colors.HexColor("#ecf0f1"), colors.white]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        return t

    def _validation_section(self, validation: dict) -> Table:
        data = [["级别", "信息"]]
        for err in validation.get("errors", []):
            data.append(["错误", err])
        for warn in validation.get("warnings", []):
            data.append(["警告", warn])
        if not data[1:]:
            data.append(["通过", "所有参数校验通过"])

        t = Table(data, colWidths=[25 * mm, 120 * mm])
        styles = [
            ("FONT", (0, 0), (-1, -1), FONT_NAME, 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#34495e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]
        for i, row in enumerate(data[1:], start=1):
            if row[0] == "错误":
                styles.append(("TEXTCOLOR", (0, i), (-1, i),
                               colors.HexColor("#e74c3c")))
            elif row[0] == "警告":
                styles.append(("TEXTCOLOR", (0, i), (-1, i),
                               colors.HexColor("#f39c12")))
            else:
                styles.append(("TEXTCOLOR", (0, i), (-1, i),
                               colors.HexColor("#27ae60")))
        t.setStyle(TableStyle(styles))
        return t

    def _result_table(self, result: dict) -> Table:
        data = [["指标", "计算值", "限值/备注"]]

        items = [
            ("风偏角", f"{result['deflection_angle_deg']:.2f}", "° (≤45°为安全)"),
            ("绝缘子张力", f"{result['arm_tension_n']:.0f}", "N"),
            ("绝缘子应力", f"{result['arm_stress_pa'] / 1e6:.2f}", "MPa (≤200 MPa)"),
            ("风荷载合力", f"{result['wind_force_n']:.0f}", "N"),
            ("水平位移", f"{result['wind_horizontal_m']:.3f}", "m"),
            ("风压", f"{result['wind_pressure_n_m2']:.1f}", "N/m²"),
            ("阵风响应因子", f"{result['gust_factor']:.3f}", "-"),
            ("安全判定", "✓ 安全" if result.get("safe") else "✗ 超限", ""),
        ]
        for label, val, unit in items:
            data.append([label, val, unit])

        t = Table(data, colWidths=[40 * mm, 45 * mm, 55 * mm])
        styles = [
            ("FONT", (0, 0), (-1, -1), FONT_NAME, 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#34495e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1),
             [colors.HexColor("#ecf0f1"), colors.white]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]
        if not result.get("safe"):
            styles.append(("BACKGROUND", (1, -1), (2, -1),
                           colors.HexColor("#fadbd8")))
            styles.append(("TEXTCOLOR", (1, -1), (2, -1),
                           colors.HexColor("#c0392b")))
        t.setStyle(TableStyle(styles))
        return t

    def _conclusion(self, result: dict, validation: dict) -> Paragraph:
        lines = []
        angle = result["deflection_angle_deg"]
        safe = result.get("safe")

        if safe:
            lines.append(
                f"本次仿真结果显示风偏角为 {angle:.2f}°, "
                f"小于设计允许值 45°, 结构安全。"
            )
        else:
            lines.append(
                f"⚠ 警告: 风偏角为 {angle:.2f}°, 超过设计允许值 45°, "
                f"结构不安全! 建议采取以下措施:"
            )
            lines.append("  1. 增大绝缘子串长度以降低应力水平")
            lines.append("  2. 改用 V 串或双 V 串提高抗风偏能力")
            lines.append("  3. 降低导线张力以减小水平荷载")
            lines.append("  4. 校核塔头间隙和电气距离")

        if validation.get("warnings"):
            lines.append("")
            lines.append(f"系统警告: {len(validation['warnings'])} 条, 请查阅第二节。")

        return Paragraph("<br/>".join(lines), self.body_style)
