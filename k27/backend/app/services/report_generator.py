import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle, PageBreak
from reportlab.lib.units import inch, mm
from datetime import datetime
from typing import Dict, List, Tuple
import io
import os


class ReportGenerator:
    def __init__(self, output_dir: str = "./reports"):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        self.styles = getSampleStyleSheet()
        
    def _create_spectrum_plot(self, freqs: np.ndarray, spectrum: np.ndarray,
                              marked_freqs: List[Dict] = None,
                              title: str = "频谱图") -> bytes:
        fig, ax = plt.subplots(figsize=(10, 4))
        ax.plot(freqs, spectrum, linewidth=0.5)
        
        if marked_freqs:
            colors_map = {"bearing": "red", "rotor": "blue", "eccentricity": "green"}
            for mf in marked_freqs:
                color = colors_map.get(mf["type"], "orange")
                ax.axvline(x=mf["theoretical_freq"], color=color, 
                          linestyle='--', alpha=0.5, linewidth=1)
                ax.fill_betweenx([0, ax.get_ylim()[1]],
                               mf["theoretical_freq"] - mf["tolerance"],
                               mf["theoretical_freq"] + mf["tolerance"],
                               color=color, alpha=0.1)
        
        ax.set_xlabel("频率 (Hz)")
        ax.set_ylabel("幅值")
        ax.set_title(title)
        ax.grid(True, alpha=0.3)
        ax.set_xlim(0, min(2000, freqs[-1]))
        
        if marked_freqs:
            legend_elements = [plt.Line2D([0], [0], color='red', label='轴承故障'),
                             plt.Line2D([0], [0], color='blue', label='转子故障'),
                             plt.Line2D([0], [0], color='green', label='偏心故障')]
            ax.legend(handles=legend_elements, loc='upper right')
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
        plt.close(fig)
        buf.seek(0)
        return buf.getvalue()

    def _create_waveform_plot(self, signal: np.ndarray, sample_rate: int,
                              title: str = "时域波形") -> bytes:
        time = np.arange(len(signal)) / sample_rate
        
        fig, ax = plt.subplots(figsize=(10, 3))
        ax.plot(time, signal, linewidth=0.3)
        ax.set_xlabel("时间 (s)")
        ax.set_ylabel("幅值")
        ax.set_title(title)
        ax.grid(True, alpha=0.3)
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
        plt.close(fig)
        buf.seek(0)
        return buf.getvalue()

    def _create_severity_gauge(self, severity: float, title: str) -> bytes:
        fig, ax = plt.subplots(figsize=(4, 4), subplot_kw={'projection': 'polar'})
        
        theta = np.linspace(0, np.pi, 100)
        r = np.ones_like(theta)
        
        ax.fill_between(theta, 0, 1, color='lightgray', alpha=0.3)
        ax.fill_between(np.linspace(0, np.pi * severity / 100, 50), 
                       0, 1, 
                       color='green' if severity < 30 else 'orange' if severity < 60 else 'red',
                       alpha=0.7)
        
        ax.set_ylim(0, 1)
        ax.set_yticks([])
        ax.set_xticks(np.linspace(0, np.pi, 5))
        ax.set_xticklabels(['0%', '25%', '50%', '75%', '100%'])
        ax.set_title(title, y=1.1)
        ax.text(0, 0, f"{severity:.1f}%", ha='center', va='center', fontsize=20, fontweight='bold')
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
        plt.close(fig)
        buf.seek(0)
        return buf.getvalue()

    def generate_diagnosis_report(self, motor_id: str, diagnosis_result: Dict,
                                  signal_data: Dict, marked_freqs: List[Dict],
                                  features: Dict, thresholds: Dict = None) -> str:
        filename = f"{motor_id}_诊断报告_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        filepath = os.path.join(self.output_dir, filename)
        
        doc = SimpleDocTemplate(filepath, pagesize=A4,
                               leftMargin=20*mm, rightMargin=20*mm,
                               topMargin=20*mm, bottomMargin=20*mm)
        
        story = []
        
        title_style = ParagraphStyle('CustomTitle', parent=self.styles['Heading1'],
                                    fontSize=20, textColor=colors.HexColor('#1a365d'),
                                    alignment=1, spaceAfter=20)
        story.append(Paragraph("异步电机故障诊断报告", title_style))
        story.append(Spacer(1, 5*mm))
        
        info_data = [
            ["电机编号", motor_id],
            ["诊断时间", datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
            ["诊断结果", diagnosis_result.get("class_name", "未知")],
            ["置信度", f"{diagnosis_result.get('confidence', 0) * 100:.1f}%"],
            ["严重程度", f"{diagnosis_result.get('severity', 0):.1f}%"]
        ]
        
        info_table = Table(info_data, colWidths=[50*mm, 100*mm])
        info_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e2e8f0')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#1a365d')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
        ]))
        story.append(info_table)
        story.append(Spacer(1, 8*mm))
        
        severity = diagnosis_result.get('severity', 0)
        gauge_img = self._create_severity_gauge(severity, "故障严重程度")
        story.append(Image(io.BytesIO(gauge_img), width=60*mm, height=60*mm, hAlign='CENTER'))
        story.append(Spacer(1, 5*mm))
        
        story.append(Paragraph("维护建议", self.styles['Heading2']))
        recommendation = diagnosis_result.get("recommendation", "继续监测")
        story.append(Paragraph(recommendation, self.styles['BodyText']))
        story.append(Spacer(1, 5*mm))
        
        story.append(PageBreak())
        
        story.append(Paragraph("频谱分析", self.styles['Heading2']))
        
        if "vibration" in signal_data:
            vib_spec = self._create_spectrum_plot(
                signal_data["vibration"]["freqs"],
                signal_data["vibration"]["spectrum"],
                marked_freqs,
                "振动包络谱"
            )
            story.append(Image(io.BytesIO(vib_spec), width=170*mm, height=65*mm))
            story.append(Spacer(1, 3*mm))
        
        if "current" in signal_data:
            cur_spec = self._create_spectrum_plot(
                signal_data["current"]["freqs"],
                signal_data["current"]["spectrum"],
                marked_freqs,
                "电流频谱"
            )
            story.append(Image(io.BytesIO(cur_spec), width=170*mm, height=65*mm))
        
        story.append(Spacer(1, 5*mm))
        
        story.append(Paragraph("时域波形", self.styles['Heading2']))
        
        if "vibration" in signal_data:
            vib_wave = self._create_waveform_plot(
                signal_data["vibration"]["signal"][:2000],
                signal_data.get("sample_rate", 20000),
                "振动时域波形"
            )
            story.append(Image(io.BytesIO(vib_wave), width=170*mm, height=50*mm))
        
        story.append(Spacer(1, 5*mm))
        
        story.append(PageBreak())
        
        story.append(Paragraph("特征参数", self.styles['Heading2']))
        
        feature_data = [["特征名称", "数值", "阈值状态"]]
        for key, value in features.items():
            status = "正常"
            if thresholds and key in thresholds:
                th = thresholds[key]
                if value > th.get("ucl", float('inf')):
                    status = "偏高"
                elif value < th.get("lcl", float('-inf')):
                    status = "偏低"
            
            feature_data.append([key, f"{value:.4f}" if isinstance(value, float) else str(value), status])
        
        feature_table = Table(feature_data, colWidths=[60*mm, 50*mm, 40*mm])
        feature_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a365d')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
        ]))
        story.append(feature_table)
        
        if marked_freqs:
            story.append(Spacer(1, 5*mm))
            story.append(Paragraph("检测到的故障特征频率", self.styles['Heading2']))
            
            freq_data = [["故障类型", "特征名称", "理论频率(Hz)", "实际频率(Hz)", "幅值"]]
            for mf in marked_freqs:
                freq_data.append([mf.get("type", ""), mf.get("name", ""),
                                 f"{mf.get('theoretical_freq', 0):.2f}",
                                 f"{mf.get('actual_freq', 0):.2f}",
                                 f"{mf.get('amplitude', 0):.4f}"])
            
            freq_table = Table(freq_data, colWidths=[30*mm, 30*mm, 35*mm, 35*mm, 30*mm])
            freq_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a365d')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
            ]))
            story.append(freq_table)
        
        doc.build(story)
        return filepath
