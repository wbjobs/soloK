import io
import base64
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image, PageBreak, HRFlowable
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT

class ReportGenerator:
    def __init__(self):
        self._setup_matplotlib()

    def _setup_matplotlib(self):
        plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'Arial Unicode MS']
        plt.rcParams['axes.unicode_minus'] = False
        plt.rcParams['figure.dpi'] = 150

    def _create_waveform_plot(
        self,
        data: List[Dict],
        anomalies: List[Dict],
        title: str = "地震波形图"
    ) -> bytes:
        if not data:
            return b''
        
        timestamps = [pd.to_datetime(d['timestamp']) for d in data]
        amplitudes = [d['amplitude'] for d in data]
        
        anomaly_timestamps = [pd.to_datetime(a['timestamp']) for a in anomalies]
        anomaly_amplitudes = [a['amplitude'] for a in anomalies]
        
        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 6), height_ratios=[3, 1])
        fig.suptitle(title, fontsize=14, fontweight='bold')
        
        ax1.plot(timestamps, amplitudes, label='波形数据', color='#409EFF', linewidth=0.8)
        if anomaly_timestamps:
            ax1.scatter(anomaly_timestamps, anomaly_amplitudes, 
                       color='#F56C6C', s=30, zorder=5, label='异常点')
        ax1.set_ylabel('振幅')
        ax1.legend(loc='upper right')
        ax1.grid(True, alpha=0.3)
        ax1.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M:%S'))
        
        ax2.plot(timestamps, amplitudes, color='#909399', linewidth=0.5)
        ax2.set_ylabel('概览')
        ax2.grid(True, alpha=0.3)
        ax2.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M:%S'))
        
        plt.tight_layout()
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', dpi=150)
        plt.close(fig)
        buf.seek(0)
        
        return buf.getvalue()

    def _create_anomaly_distribution_plot(
        self,
        anomalies: List[Dict],
        title: str = "异常分布图"
    ) -> bytes:
        if not anomalies:
            return b''
        
        timestamps = [pd.to_datetime(a['timestamp']) for a in anomalies]
        deviations = [a.get('deviation', 0) for a in anomalies]
        types = [a.get('type', 'unknown') for a in anomalies]
        
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
        
        colors_map = {'spike': '#F56C6C', 'dip': '#E6A23C'}
        point_colors = [colors_map.get(t, '#909399') for t in types]
        
        ax1.scatter(timestamps, deviations, c=point_colors, s=40, alpha=0.7)
        ax1.axhline(y=3, color='red', linestyle='--', linewidth=1, label='3σ阈值')
        ax1.set_xlabel('时间')
        ax1.set_ylabel('偏离程度 (σ)')
        ax1.set_title('异常偏离程度')
        ax1.legend()
        ax1.grid(True, alpha=0.3)
        ax1.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
        plt.setp(ax1.xaxis.get_majorticklabels(), rotation=45)
        
        type_counts = pd.Series(types).value_counts()
        ax2.pie(type_counts.values, labels=type_counts.index, 
                colors=[colors_map.get(t, '#909399') for t in type_counts.index],
                autopct='%1.1f%%', startangle=90)
        ax2.set_title('异常类型分布')
        
        plt.tight_layout()
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', dpi=150)
        plt.close(fig)
        buf.seek(0)
        
        return buf.getvalue()

    def _create_daily_stats_plot(
        self,
        daily_stats: List[Dict],
        title: str = "每日异常统计"
    ) -> bytes:
        if not daily_stats:
            return b''
        
        dates = [s['date'] for s in daily_stats]
        anomaly_counts = [s['anomaly_count'] for s in daily_stats]
        anomaly_rates = [s['anomaly_rate'] * 100 for s in daily_stats]
        
        fig, ax1 = plt.subplots(figsize=(12, 4))
        
        bars = ax1.bar(dates, anomaly_counts, color='#409EFF', alpha=0.7, label='异常数量')
        ax1.set_xlabel('日期')
        ax1.set_ylabel('异常数量', color='#409EFF')
        ax1.tick_params(axis='y', labelcolor='#409EFF')
        
        ax2 = ax1.twinx()
        ax2.plot(dates, anomaly_rates, color='#F56C6C', marker='o', linewidth=2, label='异常率')
        ax2.set_ylabel('异常率 (%)', color='#F56C6C')
        ax2.tick_params(axis='y', labelcolor='#F56C6C')
        
        for bar, count in zip(bars, anomaly_counts):
            height = bar.get_height()
            ax1.text(bar.get_x() + bar.get_width()/2., height,
                    f'{count}', ha='center', va='bottom', fontsize=9)
        
        plt.title(title, fontsize=12, fontweight='bold')
        plt.xticks(rotation=45)
        
        lines1, labels1 = ax1.get_legend_handles_labels()
        lines2, labels2 = ax2.get_legend_handles_labels()
        ax1.legend(lines1 + lines2, labels1 + labels2, loc='upper left')
        
        plt.tight_layout()
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', dpi=150)
        plt.close(fig)
        buf.seek(0)
        
        return buf.getvalue()

    def generate_report(
        self,
        data: List[Dict],
        anomalies: List[Dict],
        segments: List[Dict],
        daily_stats: List[Dict],
        start_time: str,
        end_time: str,
        algorithm: str = 'stl_3sigma'
    ) -> bytes:
        buf = io.BytesIO()
        
        doc = SimpleDocTemplate(
            buf,
            pagesize=A4,
            rightMargin=2*cm,
            leftMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm
        )
        
        styles = getSampleStyleSheet()
        story = []
        
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#303133'),
            alignment=TA_CENTER,
            spaceAfter=20
        )
        
        subtitle_style = ParagraphStyle(
            'CustomSubtitle',
            parent=styles['Heading2'],
            fontSize=14,
            textColor=colors.HexColor('#606266'),
            alignment=TA_CENTER,
            spaceAfter=15
        )
        
        section_style = ParagraphStyle(
            'SectionTitle',
            parent=styles['Heading2'],
            fontSize=16,
            textColor=colors.HexColor('#409EFF'),
            spaceBefore=15,
            spaceAfter=10
        )
        
        normal_style = ParagraphStyle(
            'NormalText',
            parent=styles['BodyText'],
            fontSize=11,
            textColor=colors.HexColor('#303133'),
            leading=18
        )
        
        story.append(Paragraph('地震波形异常检测报告', title_style))
        story.append(Paragraph(f'检测时间范围: {start_time} ~ {end_time}', subtitle_style))
        story.append(Paragraph(f'检测算法: {self._get_algorithm_name(algorithm)}', subtitle_style))
        story.append(Paragraph(f'报告生成时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}', subtitle_style))
        
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E4E7ED'), spaceBefore=10, spaceAfter=20))
        
        summary_data = [
            ['统计项', '数值'],
            ['总数据点数', f'{len(data):,}'],
            ['检测到异常点', f'{len(anomalies):,}'],
            ['异常率', f'{(len(anomalies)/len(data)*100):.4f}%' if data else '0.0000%'],
            ['异常片段数', f'{len(segments)}'],
            ['最大偏离程度', f'{max((a.get("deviation", 0) for a in anomalies), default=0):.2f}σ'],
            ['平均偏离程度', f'{np.mean([a.get("deviation", 0) for a in anomalies]) if anomalies else 0:.2f}σ']
        ]
        
        summary_table = Table(summary_data, colWidths=[2.5*inch, 2.5*inch])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#409EFF')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F5F7FA')),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E4E7ED')),
            ('FONTSIZE', (0, 1), (-1, -1), 11),
        ]))
        
        story.append(Paragraph('一、检测摘要', section_style))
        story.append(summary_table)
        story.append(Spacer(1, 20))
        
        waveform_img = self._create_waveform_plot(data, anomalies, "地震波形及异常标记")
        if waveform_img:
            story.append(Paragraph('二、波形图', section_style))
            story.append(Image(io.BytesIO(waveform_img), width=17*cm, height=8*cm))
            story.append(Spacer(1, 15))
        
        anomaly_plot = self._create_anomaly_distribution_plot(anomalies, "异常分布分析")
        if anomaly_plot:
            story.append(Paragraph('三、异常分布', section_style))
            story.append(Image(io.BytesIO(anomaly_plot), width=17*cm, height=5.5*cm))
            story.append(Spacer(1, 15))
        
        if daily_stats:
            daily_plot = self._create_daily_stats_plot(daily_stats, "每日异常趋势")
            if daily_plot:
                story.append(Paragraph('四、每日统计', section_style))
                story.append(Image(io.BytesIO(daily_plot), width=17*cm, height=5.5*cm))
                story.append(Spacer(1, 15))
        
        if segments:
            story.append(Paragraph('五、异常片段详情', section_style))
            
            segment_data = [['ID', '开始时间', '结束时间', '异常点数', '最大偏离', '平均偏离']]
            for i, seg in enumerate(segments[:20], 1):
                segment_data.append([
                    str(i),
                    seg['start_time'][:19].replace('T', ' '),
                    seg['end_time'][:19].replace('T', ' '),
                    str(seg['anomaly_count']),
                    f'{seg.get("max_deviation", 0):.2f}σ',
                    f'{seg.get("avg_deviation", 0):.2f}σ'
                ])
            
            if len(segments) > 20:
                segment_data.append(['...', '...', '...', '...', '...', '...'])
            
            segment_table = Table(segment_data, colWidths=[0.6*inch, 1.5*inch, 1.5*inch, 0.8*inch, 0.8*inch, 0.8*inch])
            segment_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F56C6C')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#FEF0F0')),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#FBC4C4')),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
            ]))
            
            story.append(segment_table)
        
        story.append(PageBreak())
        
        if anomalies:
            story.append(Paragraph('六、异常点详情', section_style))
            
            anomaly_data = [['序号', '时间', '振幅', '偏离程度', '类型', '算法']]
            for i, a in enumerate(anomalies[:50], 1):
                anomaly_data.append([
                    str(i),
                    a['timestamp'][:19].replace('T', ' '),
                    f'{a["amplitude"]:.4f}',
                    f'{a.get("deviation", 0):.2f}σ',
                    self._get_type_name(a.get('type', 'unknown')),
                    a.get('algorithm', '-')
                ])
            
            if len(anomalies) > 50:
                anomaly_data.append(['...', '...', '...', '...', '...', '...'])
            
            anomaly_table = Table(anomaly_data, colWidths=[0.5*inch, 1.3*inch, 0.8*inch, 0.8*inch, 0.5*inch, 0.8*inch])
            anomaly_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E6A23C')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#FDF6EC')),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#F3D19E')),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
            ]))
            
            story.append(anomaly_table)
        
        story.append(Spacer(1, 30))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#E4E7ED'), spaceBefore=10, spaceAfter=10))
        story.append(Paragraph('本报告由地震波形监测系统自动生成', styles['Italic']))
        
        doc.build(story)
        buf.seek(0)
        
        return buf.getvalue()

    def _get_algorithm_name(self, algorithm: str) -> str:
        names = {
            'stl_3sigma': 'STL分解 + 3-sigma',
            'isolation_forest': '孤立森林 (Isolation Forest)',
            'ensemble': '集成算法 (STL + 孤立森林)',
            'simple_3sigma': '简单 3-sigma'
        }
        return names.get(algorithm, algorithm)

    def _get_type_name(self, type_str: str) -> str:
        names = {
            'spike': '尖峰',
            'dip': '下跌',
            'burst': '爆发'
        }
        return names.get(type_str, type_str)
