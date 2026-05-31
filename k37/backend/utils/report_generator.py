import os
import base64
import io
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import librosa.display
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from pathlib import Path

REPORT_DIR = Path(__file__).parent.parent / "reports"
REPORT_DIR.mkdir(exist_ok=True)

class PDFReportGenerator:
    def __init__(self):
        self.styles = getSampleStyleSheet()
        self._setup_styles()
    
    def _setup_styles(self):
        self.title_style = ParagraphStyle(
            'CustomTitle',
            parent=self.styles['Heading1'],
            fontSize=24,
            spaceAfter=30,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#2c3e50')
        )
        
        self.section_style = ParagraphStyle(
            'SectionTitle',
            parent=self.styles['Heading2'],
            fontSize=16,
            spaceAfter=15,
            spaceBefore=20,
            textColor=colors.HexColor('#3498db')
        )
        
        self.normal_style = ParagraphStyle(
            'CustomNormal',
            parent=self.styles['Normal'],
            fontSize=11,
            spaceAfter=8,
            leading=14
        )
        
        self.highlight_style = ParagraphStyle(
            'Highlight',
            parent=self.styles['Normal'],
            fontSize=12,
            spaceAfter=10,
            textColor=colors.HexColor('#e74c3c'),
            backColor=colors.HexColor('#fdf2f2')
        )
    
    def generate_waveform_image(self, audio, sr, suspicious_segments=None):
        fig, ax = plt.subplots(figsize=(10, 3))
        librosa.display.waveshow(audio, sr=sr, ax=ax, color='#3498db')
        ax.set_title('Waveform')
        ax.set_xlabel('Time (s)')
        ax.set_ylabel('Amplitude')
        
        if suspicious_segments:
            for seg in suspicious_segments:
                ax.axvspan(seg['start_time'], seg['end_time'], 
                          alpha=0.3, color='red', label='Suspicious')
        
        plt.tight_layout()
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=100)
        plt.close()
        buf.seek(0)
        return buf
    
    def generate_spectrogram_image(self, mag_db, sr, hop_length=256, heatmap=None, suspicious_segments=None):
        fig, ax = plt.subplots(figsize=(10, 4))
        img = librosa.display.specshow(mag_db, sr=sr, hop_length=hop_length,
                                     x_axis='time', y_axis='hz', ax=ax, cmap='viridis')
        ax.set_title('Spectrogram')
        fig.colorbar(img, ax=ax, format='%+2.0f dB')
        
        if suspicious_segments:
            for seg in suspicious_segments:
                ax.axvspan(seg['start_time'], seg['end_time'], 
                          alpha=0.3, color='red', label='Suspicious')
        
        plt.tight_layout()
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=100)
        plt.close()
        buf.seek(0)
        return buf
    
    def create_detection_summary_table(self, overall_score, model_scores, confidence):
        data = [
            ['检测项', '得分', '说明'],
            ['综合伪造概率', f'{overall_score:.1%}', '集成学习综合得分'],
            ['RawNet2', f"{model_scores.get('rawnet2', 0):.1%}", '端到端波形检测'],
            ['LFCC+GMM', f"{model_scores.get('lfcc_gmm', 0):.1%}", '声学特征匹配'],
            ['频谱一致性', f"{model_scores.get('spectral', 0):.1%}", '频域相位分析'],
            ['置信度', f'{confidence:.1%}', '模型一致性']
        ]
        
        table = Table(data, colWidths=[2*inch, 1.5*inch, 3*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3498db')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.whitesmoke),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#bdc3c7')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.whitesmoke, colors.HexColor('#f8f9fa')])
        ]))
        
        return table
    
    def create_traceability_table(self, engine_result, recompression_result):
        data = [
            ['溯源类型', '检测结果', '置信度'],
            ['TTS引擎', engine_result.get('detected_engine', 'Unknown'), 
             f"{engine_result.get('confidence', 0):.1%}"],
            ['原始格式', recompression_result.get('original_format', 'Unknown'),
             f"{recompression_result.get('format_confidence', 0):.1%}"],
            ['重压缩痕迹', '是' if recompression_result.get('is_recompressed', False) else '否', '']
        ]
        
        table = Table(data, colWidths=[1.5*inch, 2.5*inch, 2*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#9b59b6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#bdc3c7')),
        ]))
        
        return table
    
    def create_segments_table(self, segments):
        if not segments:
            return Paragraph('未检测到明显的伪造区域', self.normal_style)
        
        data = [['序号', '起始时间 (s)', '结束时间 (s)', '持续时间 (s)']]
        for i, seg in enumerate(segments, 1):
            data.append([
                str(i),
                f"{seg['start_time']:.3f}",
                f"{seg['end_time']:.3f}",
                f"{seg['duration']:.3f}"
            ])
        
        table = Table(data, colWidths=[1*inch, 2*inch, 2*inch, 2*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e74c3c')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#bdc3c7')),
        ]))
        
        return table
    
    def generate_report(self, filename, audio, sr, mag_db, hop_length,
                       overall_score, model_scores, confidence,
                       suspicious_segments, engine_result, recompression_result,
                       speaker_result=None, spoofing_result=None):
        
        report_path = REPORT_DIR / f"{filename}.pdf"
        
        doc = SimpleDocTemplate(
            str(report_path),
            pagesize=A4,
            rightMargin=2*cm,
            leftMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm
        )
        
        story = []
        
        story.append(Paragraph('语音深度伪造检测取证报告', self.title_style))
        story.append(Spacer(1, 0.2*inch))
        
        risk_level = '高风险' if overall_score > 0.7 else ('中风险' if overall_score > 0.3 else '低风险')
        risk_color = '#e74c3c' if overall_score > 0.7 else ('#f39c12' if overall_score > 0.3 else '#27ae60')
        
        risk_text = f'检测结果: <font color="{risk_color}" size="16"><b>{risk_level}</b></font> - 伪造概率 {overall_score:.1%}'
        story.append(Paragraph(risk_text, self.highlight_style))
        story.append(Spacer(1, 0.3*inch))
        
        story.append(Paragraph('一、检测摘要', self.section_style))
        story.append(self.create_detection_summary_table(overall_score, model_scores, confidence))
        story.append(Spacer(1, 0.2*inch))
        
        story.append(Paragraph('二、波形图分析', self.section_style))
        waveform_buf = self.generate_waveform_image(audio, sr, suspicious_segments)
        waveform_img = Image(waveform_buf, width=6*inch, height=1.8*inch)
        story.append(waveform_img)
        story.append(Spacer(1, 0.1*inch))
        
        story.append(Paragraph('三、频谱图分析', self.section_style))
        spec_buf = self.generate_spectrogram_image(mag_db, sr, hop_length, suspicious_segments=suspicious_segments)
        spec_img = Image(spec_buf, width=6*inch, height=2.4*inch)
        story.append(spec_img)
        story.append(Spacer(1, 0.1*inch))
        
        story.append(Paragraph('四、伪造区域定位', self.section_style))
        story.append(self.create_segments_table(suspicious_segments))
        story.append(Spacer(1, 0.2*inch))
        
        story.append(Paragraph('五、溯源分析', self.section_style))
        story.append(self.create_traceability_table(engine_result, recompression_result))
        story.append(Spacer(1, 0.2*inch))
        
        if speaker_result:
            story.append(Paragraph('六、说话人验证', self.section_style))
            speaker_data = [
                ['验证项', '结果'],
                ['验证状态', '通过' if speaker_result.get('verified', False) else '未通过'],
                ['匹配说话人', speaker_result.get('best_match', 'N/A')],
                ['相似度', f"{speaker_result.get('similarity', 0):.1%}"]
            ]
            speaker_table = Table(speaker_data, colWidths=[2*inch, 4*inch])
            speaker_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#27ae60')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#bdc3c7')),
            ]))
            story.append(speaker_table)
        
        story.append(PageBreak())
        
        story.append(Paragraph('七、检测详情说明', self.section_style))
        story.append(Paragraph('1. RawNet2: 基于原始波形的端到端深度伪造检测模型，擅长捕捉生成式语音的细微时域特征。', self.normal_style))
        story.append(Paragraph('2. LFCC+GMM: 使用线性频率倒谱系数结合高斯混合模型，检测传统声学特征的异常。', self.normal_style))
        story.append(Paragraph('3. 频谱一致性: 分析频域相位伪影和幅度一致性，检测合成音频的频域失真。', self.normal_style))
        story.append(Spacer(1, 0.2*inch))
        
        story.append(Paragraph('八、可读性评估', self.section_style))
        readability_score = 1 - overall_score
        readability_text = f'音频可读性评分: <b>{readability_score:.1%}</b>'
        story.append(Paragraph(readability_text, self.normal_style))
        story.append(Paragraph('注: 可读性评分表示音频作为真实语音证据的可信度，评分越高越可信。', self.normal_style))
        
        doc.build(story)
        
        return str(report_path)
