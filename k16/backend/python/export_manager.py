import numpy as np
import pandas as pd
from scipy.io import savemat
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Image, PageBreak
from reportlab.lib.units import cm
import matplotlib.pyplot as plt
import io
from datetime import datetime

class ExportManager:
    @staticmethod
    def export_to_csv(data, filepath, columns=None):
        if isinstance(data, dict):
            df = pd.DataFrame(data)
        else:
            df = pd.DataFrame(data, columns=columns)
        df.to_csv(filepath, index=False)
        return filepath
    
    @staticmethod
    def export_to_mat(data, filepath):
        mat_data = {}
        for key, value in data.items():
            if isinstance(value, list):
                mat_data[key] = np.array(value)
            else:
                mat_data[key] = value
        savemat(filepath, mat_data)
        return filepath
    
    @staticmethod
    def generate_test_report(test_info, data_summary, plots_data, filepath):
        doc = SimpleDocTemplate(filepath, pagesize=A4,
                                rightMargin=2*cm, leftMargin=2*cm,
                                topMargin=2*cm, bottomMargin=2*cm)
        
        story = []
        styles = getSampleStyleSheet()
        
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            spaceAfter=30,
            alignment=1
        )
        
        story.append(Paragraph('风洞试验报告', title_style))
        story.append(Paragraph(f'试验编号: {test_info.get("test_id", "N/A")}', styles['Heading2']))
        story.append(Paragraph(f'试验日期: {test_info.get("date", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))}', styles['Normal']))
        story.append(Paragraph(f'试验模型: {test_info.get("model", "N/A")}', styles['Normal']))
        story.append(Paragraph(f'试验风速: {test_info.get("velocity", "N/A")} m/s', styles['Normal']))
        story.append(Paragraph(f'攻角范围: {test_info.get("alpha_range", "N/A")}', styles['Normal']))
        story.append(Paragraph('<br/>', styles['Normal']))
        
        story.append(Paragraph('一、试验概述', styles['Heading2']))
        story.append(Paragraph(test_info.get('description', '无描述信息'), styles['Normal']))
        story.append(Paragraph('<br/>', styles['Normal']))
        
        story.append(Paragraph('二、数据摘要', styles['Heading2']))
        summary_data = [
            ['参数', '最小值', '最大值', '平均值', '标准差'],
        ]
        
        for param, stats in data_summary.items():
            summary_data.append([
                param,
                f'{stats.get("min", 0):.4f}',
                f'{stats.get("max", 0):.4f}',
                f'{stats.get("mean", 0):.4f}',
                f'{stats.get("std", 0):.4f}'
            ])
        
        t = Table(summary_data)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        story.append(t)
        story.append(Paragraph('<br/>', styles['Normal']))
        
        story.append(PageBreak())
        story.append(Paragraph('三、试验曲线', styles['Heading2']))
        
        for plot_info in plots_data:
            story.append(Paragraph(plot_info['title'], styles['Heading3']))
            
            img = ExportManager._create_plot(plot_info)
            story.append(img)
            story.append(Paragraph('<br/>', styles['Normal']))
        
        story.append(PageBreak())
        story.append(Paragraph('四、结论', styles['Heading2']))
        story.append(Paragraph(test_info.get('conclusion', '暂无结论'), styles['Normal']))
        
        doc.build(story)
        return filepath
    
    @staticmethod
    def _create_plot(plot_info):
        fig, ax = plt.subplots(figsize=(10, 6))
        
        plot_type = plot_info.get('type', 'line')
        
        if plot_type == 'line':
            for i, y_data in enumerate(plot_info['y_data']):
                label = plot_info.get('labels', [f'曲线{i+1}'])[i]
                ax.plot(plot_info['x_data'], y_data, label=label, linewidth=1.5)
        elif plot_type == 'contour':
            contour = ax.contourf(plot_info['x'], plot_info['y'], plot_info['z'], 
                                  cmap='jet', levels=20)
            plt.colorbar(contour, ax=ax)
        
        ax.set_xlabel(plot_info.get('xlabel', 'X'))
        ax.set_ylabel(plot_info.get('ylabel', 'Y'))
        ax.set_title(plot_info.get('title', ''))
        ax.grid(True, alpha=0.3)
        if plot_type == 'line':
            ax.legend()
        
        img_buffer = io.BytesIO()
        plt.savefig(img_buffer, format='png', dpi=150, bbox_inches='tight')
        plt.close(fig)
        img_buffer.seek(0)
        
        img = Image(img_buffer, width=16*cm, height=9.6*cm)
        return img
    
    @staticmethod
    def export_multi_condition_comparison(conditions_data, filepath, format='mat'):
        if format == 'mat':
            return ExportManager.export_to_mat(conditions_data, filepath)
        elif format == 'csv':
            all_data = []
            for cond_name, cond_data in conditions_data.items():
                df = pd.DataFrame(cond_data)
                df['condition'] = cond_name
                all_data.append(df)
            combined = pd.concat(all_data)
            combined.to_csv(filepath, index=False)
            return filepath
