import numpy as np
import pandas as pd
from io import BytesIO
from typing import Dict, List, Optional
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.pdfgen import canvas
from reportlab.lib.enums import TA_CENTER, TA_LEFT


def export_to_excel(
    data_dict: Dict[str, pd.DataFrame],
    sheet_names: Optional[List[str]] = None,
) -> bytes:
    """
    将多个DataFrame导出为Excel文件
    
    Parameters:
    -----------
    data_dict: 字典，键为sheet名称，值为DataFrame
    sheet_names: 可选，自定义sheet名称列表
    
    Returns:
    --------
    Excel文件的字节内容
    """
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        for i, (key, df) in enumerate(data_dict.items()):
            sheet_name = sheet_names[i] if sheet_names and i < len(sheet_names) else str(key)
            sheet_name = sheet_name[:31]
            df.to_excel(writer, sheet_name=sheet_name, index=False)
    output.seek(0)
    return output.getvalue()


def create_interpretation_report(
    well_name: str,
    depth_range: tuple,
    lithology_stats: Dict,
    porosity_stats: Dict,
    brittleness_stats: Dict,
    fracture_zones: List[Dict],
    chart_images: Optional[List[bytes]] = None,
) -> bytes:
    """
    生成测井解释PDF报告
    
    Parameters:
    -----------
    well_name: 井名
    depth_range: 深度范围 (top, bottom)
    lithology_stats: 岩性统计
    porosity_stats: 孔隙度统计
    brittleness_stats: 脆性统计
    fracture_zones: 裂缝发育带列表
    chart_images: 图表图片字节列表
    
    Returns:
    --------
    PDF文件的字节内容
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], alignment=TA_CENTER, spaceAfter=12, textColor=colors.HexColor('#1F618D'))
    heading_style = ParagraphStyle('CustomHeading', parent=styles['Heading2'], textColor=colors.HexColor('#2980B9'), spaceBefore=8, spaceAfter=6)
    normal_style = ParagraphStyle('CustomNormal', parent=styles['BodyText'], fontSize=10, leading=14)
    
    story = []
    
    story.append(Paragraph("声波测井数据解释报告", title_style))
    story.append(Paragraph(f"井名: {well_name}", heading_style))
    story.append(Paragraph(f"解释深度段: {depth_range[0]} m - {depth_range[1]} m", normal_style))
    story.append(Spacer(1, 0.5 * cm))
    
    story.append(Paragraph("一、基本信息", heading_style))
    basic_data = [
        ["井名", well_name],
        ["解释井段", f"{depth_range[0]} - {depth_range[1]} m"],
        ["解释方法", "综合声波测井解释"],
    ]
    basic_table = Table(basic_data, colWidths=[4 * cm, 8 * cm])
    basic_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#EBF5FB')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(basic_table)
    story.append(Spacer(1, 0.5 * cm))
    
    story.append(Paragraph("二、岩性分析", heading_style))
    litho_data = [["岩性类型", "厚度(m)", "百分比(%)"]]
    for litho, stats in lithology_stats.items():
        litho_data.append([litho, f"{stats.get('thickness', 0):.2f}", f"{stats.get('percentage', 0):.1f}"])
    litho_table = Table(litho_data, colWidths=[4 * cm, 3 * cm, 3 * cm])
    litho_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2980B9')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(litho_table)
    story.append(Spacer(1, 0.5 * cm))
    
    story.append(Paragraph("三、储层参数统计", heading_style))
    reservoir_data = [
        ["参数", "最小值", "平均值", "最大值"],
        ["孔隙度 (%)", f"{porosity_stats.get('min', 0)*100:.2f}", f"{porosity_stats.get('mean', 0)*100:.2f}", f"{porosity_stats.get('max', 0)*100:.2f}"],
        ["脆性指数 (%)", f"{brittleness_stats.get('min', 0):.2f}", f"{brittleness_stats.get('mean', 0):.2f}", f"{brittleness_stats.get('max', 0):.2f}"],
    ]
    reservoir_table = Table(reservoir_data, colWidths=[3.5 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm])
    reservoir_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#27AE60')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(reservoir_table)
    story.append(Spacer(1, 0.5 * cm))
    
    if fracture_zones:
        story.append(Paragraph("四、裂缝发育带识别", heading_style))
        fracture_data = [["编号", "顶深(m)", "底深(m)", "厚度(m)", "裂缝等级"]]
        for i, zone in enumerate(fracture_zones, 1):
            fracture_data.append([
                str(i),
                f"{zone.get('top', 0):.2f}",
                f"{zone.get('bottom', 0):.2f}",
                f"{zone.get('thickness', 0):.2f}",
                zone.get('level', '未知'),
            ])
        fracture_table = Table(fracture_data, colWidths=[1.5 * cm, 2.5 * cm, 2.5 * cm, 2 * cm, 3 * cm])
        fracture_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E74C3C')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('PADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(fracture_table)
    
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()


def export_interpretation_table(
    well_name: str,
    df: pd.DataFrame,
    depth_interval: float = 1.0,
) -> pd.DataFrame:
    """
    导出解释成果表
    
    Parameters:
    -----------
    well_name: 井名
    df: 包含解释结果的DataFrame（必须包含DEPTH列）
    depth_interval: 采样间隔 (m)
    
    Returns:
    --------
    解释成果表DataFrame
    """
    if "DEPTH" not in df.columns:
        raise ValueError("DataFrame必须包含DEPTH列")
    
    depth = df["DEPTH"].values
    min_depth = np.floor(depth.min())
    max_depth = np.ceil(depth.max())
    
    result_depths = np.arange(min_depth, max_depth + depth_interval, depth_interval)
    
    result = pd.DataFrame({
        "井名": [well_name] * len(result_depths),
        "顶深(m)": result_depths,
        "底深(m)": result_depths + depth_interval,
    })
    
    for col in df.columns:
        if col == "DEPTH":
            continue
        values = df[col].values
        result[col] = np.interp(result_depths + depth_interval / 2, depth, values, left=np.nan, right=np.nan)
    
    return result
