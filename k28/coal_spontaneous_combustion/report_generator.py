"""
PDF报告生成模块
"""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image, PageBreak, KeepTogether
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os
from typing import List

from .data_models import CoalSample


def register_fonts():
    """注册中文字体"""
    font_paths = [
        'C:/Windows/Fonts/simsun.ttc',
        'C:/Windows/Fonts/msyh.ttc',
        '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
    ]
    
    for path in font_paths:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont('SimSun', path))
                return True
            except:
                continue
    return False


def create_pdf_report(sample: CoalSample, output_file: str, tg_dsc_plot: str = None, 
                      friedman_plot: str = None):
    """
    生成单个煤样的PDF分析报告
    """
    has_font = register_fonts()
    font_name = 'SimSun' if has_font else 'Helvetica'
    
    doc = SimpleDocTemplate(
        output_file,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontName=font_name,
        fontSize=18,
        alignment=1,
        spaceAfter=20
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontName=font_name,
        fontSize=14,
        spaceBefore=15,
        spaceAfter=10
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=10,
        leading=14
    )
    
    story = []
    
    story.append(Paragraph('煤自燃倾向性鉴定报告', title_style))
    story.append(Spacer(1, 0.5*cm))
    
    story.append(Paragraph('一、样品基本信息', heading_style))
    
    info_data = [
        ['样品编号', sample.sample_id, '样品名称', sample.sample_name],
        ['水分(%)', f'{sample.proximate.moisture:.2f}', '灰分(%)', f'{sample.proximate.ash:.2f}'],
        ['挥发分(%)', f'{sample.proximate.volatile:.2f}', '固定碳(%)', f'{sample.proximate.fixed_carbon:.2f}'],
        ['C(%)', f'{sample.ultimate.c:.2f}', 'H(%)', f'{sample.ultimate.h:.2f}'],
        ['O(%)', f'{sample.ultimate.o:.2f}', 'N(%)', f'{sample.ultimate.n:.2f}'],
        ['S(%)', f'{sample.ultimate.s:.2f}', '', ''],
    ]
    
    info_table = Table(info_data, colWidths=[3*cm, 3*cm, 3*cm, 3*cm])
    info_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), font_name),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('BACKGROUND', (0, 0), (0, -1), colors.lightblue),
        ('BACKGROUND', (2, 0), (2, -1), colors.lightblue),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.5*cm))
    
    story.append(Paragraph('二、动力学参数计算结果', heading_style))
    
    kinetic_data = [['方法', '活化能 Ea (kJ/mol)', '指前因子 lnA', '拟合优度 R²', '机理函数']]
    
    for method_name, result in sample.kinetic_results.items():
        lnA = f'{result.pre_exponential_factor:.2e}' if result.pre_exponential_factor > 0 else '-'
        if result.pre_exponential_factor > 0:
            import numpy as np
            lnA = f'{np.log(result.pre_exponential_factor):.2f}'
        
        mech = result.mechanism_function or '-'
        if mech and len(mech) > 20:
            mech = mech[:20] + '...'
        
        kinetic_data.append([
            method_name,
            f'{result.activation_energy:.2f}',
            lnA,
            f'{result.r_squared:.4f}',
            mech
        ])
    
    kinetic_table = Table(kinetic_data, colWidths=[2.5*cm, 3*cm, 2.5*cm, 2.5*cm, 4.5*cm])
    kinetic_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), font_name),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    story.append(kinetic_table)
    story.append(Spacer(1, 0.5*cm))
    
    story.append(Paragraph('三、自燃倾向性评判结果', heading_style))
    
    if sample.sc_result:
        risk_color = colors.red if sample.sc_result.risk_level == '容易自燃' else \
                     colors.orange if sample.sc_result.risk_level == '自燃' else \
                     colors.green if sample.sc_result.risk_level == '不易自燃' else colors.darkgreen
        
        sc_data = [
            ['交叉点温度 (°C)', f'{sample.sc_result.crossing_point_temp:.1f}'],
            ['平均活化能 (kJ/mol)', f'{sample.sc_result.activation_energy_avg:.2f}'],
            ['挥发分 (%)', f'{sample.sc_result.volatile_content:.2f}'],
            ['自燃风险指数', f'{sample.sc_result.risk_index:.2f}'],
            ['自燃倾向性等级', sample.sc_result.risk_level],
        ]
        
        sc_table = Table(sc_data, colWidths=[5*cm, 5*cm])
        sc_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), font_name),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('BACKGROUND', (0, 0), (0, -1), colors.lightblue),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('BACKGROUND', (1, -1), (1, -1), risk_color),
            ('TEXTCOLOR', (1, -1), (1, -1), colors.white),
        ]))
        story.append(sc_table)
    story.append(Spacer(1, 0.5*cm))
    
    if tg_dsc_plot and os.path.exists(tg_dsc_plot):
        story.append(Paragraph('四、TG-DSC曲线图', heading_style))
        img = Image(tg_dsc_plot, width=15*cm, height=10*cm)
        story.append(img)
        story.append(Spacer(1, 0.3*cm))
    
    if friedman_plot and os.path.exists(friedman_plot):
        story.append(Paragraph('五、Friedman等转化率分析', heading_style))
        img = Image(friedman_plot, width=14*cm, height=8*cm)
        story.append(img)
    
    story.append(Spacer(1, 1*cm))
    story.append(Paragraph('注：本报告基于GB/T 20104-2006《煤自燃倾向性色谱吸氧鉴定法》相关原理进行分析。', normal_style))
    
    doc.build(story)


def create_batch_report(samples: List[CoalSample], output_file: str, 
                        comparison_plots: List[str] = None):
    """
    生成批量煤样的对比分析报告
    """
    has_font = register_fonts()
    font_name = 'SimSun' if has_font else 'Helvetica'
    
    doc = SimpleDocTemplate(
        output_file,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontName=font_name,
        fontSize=18,
        alignment=1,
        spaceAfter=20
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontName=font_name,
        fontSize=14,
        spaceBefore=15,
        spaceAfter=10
    )
    
    story = []
    
    story.append(Paragraph('煤自燃倾向性批量对比分析报告', title_style))
    story.append(Spacer(1, 0.5*cm))
    
    story.append(Paragraph('一、批量煤样分析结果汇总', heading_style))
    
    summary_data = [['样品名称', '挥发分(%)', '交叉点温度(°C)', '风险指数', '自燃等级']]
    
    for sample in samples:
        if sample.sc_result:
            summary_data.append([
                sample.sample_name,
                f'{sample.proximate.volatile:.2f}',
                f'{sample.sc_result.crossing_point_temp:.1f}',
                f'{sample.sc_result.risk_index:.2f}',
                sample.sc_result.risk_level
            ])
    
    summary_table = Table(summary_data, colWidths=[3*cm, 2.5*cm, 3*cm, 2.5*cm, 3*cm])
    summary_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), font_name),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 0.5*cm))
    
    story.append(Paragraph('二、动力学参数对比', heading_style))
    
    kine_comp_data = [['样品名称', '方法', 'Ea(kJ/mol)', 'R²']]
    
    for sample in samples:
        for method, result in list(sample.kinetic_results.items())[:2]:
            kine_comp_data.append([
                sample.sample_name,
                method,
                f'{result.activation_energy:.2f}',
                f'{result.r_squared:.4f}'
            ])
    
    kine_table = Table(kine_comp_data, colWidths=[3*cm, 2.5*cm, 3*cm, 2.5*cm])
    kine_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), font_name),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    story.append(kine_table)
    
    if comparison_plots:
        story.append(PageBreak())
        story.append(Paragraph('三、对比分析图', heading_style))
        
        for plot_file in comparison_plots:
            if os.path.exists(plot_file):
                img = Image(plot_file, width=15*cm, height=8*cm)
                story.append(img)
                story.append(Spacer(1, 0.3*cm))
    
    doc.build(story)
