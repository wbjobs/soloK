import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from typing import Dict, List, Optional, Tuple
from ..processing.las_loader import WellData


CURVE_COLORS = {
    "GR": "#27AE60",
    "DT": "#E74C3C",
    "DTS": "#9B59B6",
    "RHOB": "#3498DB",
    "PHI_WYLLIE": "#F39C12",
    "PHI_RAYMER": "#1ABC9C",
    "PHI_DENSITY": "#E67E22",
    "PHI_COMBINED": "#8E44AD",
    "VP": "#16A085",
    "VS": "#C0392B",
    "VP_VS": "#D35400",
    "YOUNGS_MODULUS": "#2980B9",
    "POISSONS_RATIO": "#8E44AD",
    "BULK_MODULUS": "#2C3E50",
    "SHEAR_MODULUS": "#7F8C8D",
    "BRITTLENESS": "#E74C3C",
    "FRACTURE_INTENSITY": "#E74C3C",
}


def create_log_plot(
    well: WellData,
    tracks: List[Dict],
    depth_range: Optional[Tuple[float, float]] = None,
    height: int = 800,
) -> go.Figure:
    """
    创建多道测井曲线图
    
    Parameters:
    -----------
    well: WellData对象
    tracks: 道配置列表，每个道包含curves和title
        示例: [{"curves": ["GR"], "title": "自然伽马"}, {"curves": ["DT", "DTS"], "title": "声波时差"}]
    depth_range: 深度范围 (top, bottom)
    height: 图表高度
    
    Returns:
    --------
    Plotly Figure对象
    """
    depth = well.get_depth()
    if depth is None:
        raise ValueError("井数据中没有深度信息")
    
    if depth_range is None:
        depth_range = (depth.min(), depth.max())
    
    mask = (depth >= depth_range[0]) & (depth <= depth_range[1])
    depth_plot = depth[mask]
    
    n_tracks = len(tracks)
    fig = make_subplots(rows=1, cols=n_tracks, shared_yaxes=True, horizontal_spacing=0.02)
    
    for i, track in enumerate(tracks):
        col = i + 1
        for curve_name in track["curves"]:
            curve_data = well.get_curve(curve_name)
            if curve_data is None:
                continue
            
            values_plot = curve_data[mask]
            color = CURVE_COLORS.get(curve_name, "#333333")
            
            fig.add_trace(
                go.Scatter(
                    x=values_plot,
                    y=depth_plot,
                    name=curve_name,
                    mode='lines',
                    line=dict(color=color, width=1.5),
                    hovertemplate=f'{curve_name}: %{{x:.2f}}<br>深度: %{{y:.1f}} m',
                ),
                row=1,
                col=col,
            )
        
        fig.update_xaxes(title_text=track["title"], row=1, col=col, showgrid=True, gridwidth=0.5)
    
    fig.update_yaxes(
        title_text="深度 (m)",
        autorange='reversed',
        row=1,
        col=1,
        showgrid=True,
        gridwidth=0.5,
    )
    
    fig.update_layout(
        title=f"{well.well_name} - 测井曲线图",
        height=height,
        showlegend=True,
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        margin=dict(l=60, r=20, t=80, b=40),
        hovermode='y unified',
    )
    
    return fig


def create_lithology_track(
    lithology_df: pd.DataFrame,
    depth_range: Optional[Tuple[float, float]] = None,
) -> go.Figure:
    """
    创建岩性道
    
    Parameters:
    -----------
    lithology_df: 岩性判别结果DataFrame
    depth_range: 深度范围
    
    Returns:
    --------
    Plotly Figure对象
    """
    if depth_range is None:
        depth_range = (lithology_df["DEPTH"].min(), lithology_df["DEPTH"].max())
    
    mask = (lithology_df["DEPTH"] >= depth_range[0]) & (lithology_df["DEPTH"] <= depth_range[1])
    df_plot = lithology_df[mask].copy()
    
    fig = go.Figure()
    
    litho_types = df_plot["LITHOLOGY"].unique()
    for litho in litho_types:
        litho_mask = df_plot["LITHOLOGY"] == litho
        if not litho_mask.any():
            continue
        
        litho_data = df_plot[litho_mask]
        color = litho_data["LITHOLOGY_COLOR"].iloc[0] if "LITHOLOGY_COLOR" in litho_data.columns else "#808080"
        
        fig.add_trace(
            go.Bar(
                x=[1] * len(litho_data),
                y=litho_data["DEPTH"],
                orientation='h',
                name=litho,
                marker=dict(color=color, line=dict(width=0)),
                width=1.0,
                hovertemplate=f'{litho}<br>深度: %{{y:.1f}} m',
            )
        )
    
    fig.update_layout(
        title="岩性剖面",
        xaxis=dict(showticklabels=False, showgrid=False),
        yaxis=dict(title="深度 (m)", autorange='reversed'),
        height=800,
        showlegend=True,
        margin=dict(l=60, r=20, t=40, b=40),
        barmode='stack',
    )
    
    return fig


def create_multi_well_comparison(
    wells: List[WellData],
    curve_name: str,
    depth_range: Optional[Tuple[float, float]] = None,
    resample_step: float = 1.0,
) -> go.Figure:
    """
    创建多井对比曲线图
    
    Parameters:
    -----------
    wells: WellData对象列表
    curve_name: 要对比的曲线名称
    depth_range: 深度范围
    resample_step: 重采样间隔
    
    Returns:
    --------
    Plotly Figure对象
    """
    fig = go.Figure()
    
    colors = ["#E74C3C", "#3498DB", "#2ECC71", "#F39C12", "#9B59B6"]
    
    for i, well in enumerate(wells):
        depth = well.get_depth()
        curve_data = well.get_curve(curve_name)
        
        if depth is None or curve_data is None:
            continue
        
        if depth_range is None:
            if i == 0:
                depth_range = (depth.min(), depth.max())
            else:
                continue
        
        mask = (depth >= depth_range[0]) & (depth <= depth_range[1])
        depth_plot = depth[mask]
        values_plot = curve_data[mask]
        
        target_depths = np.arange(depth_range[0], depth_range[1] + resample_step, resample_step)
        resampled_values = np.interp(target_depths, depth_plot, values_plot, left=np.nan, right=np.nan)
        
        color = colors[i % len(colors)]
        
        fig.add_trace(
            go.Scatter(
                x=resampled_values,
                y=target_depths,
                name=well.well_name,
                mode='lines',
                line=dict(color=color, width=2),
                hovertemplate=f'{well.well_name}: %{{x:.2f}}<br>深度: %{{y:.1f}} m',
            )
        )
    
    fig.update_layout(
        title=f"多井对比 - {curve_name}",
        xaxis_title=curve_name,
        yaxis_title="深度 (m)",
        yaxis_autorange='reversed',
        height=800,
        showlegend=True,
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        margin=dict(l=60, r=20, t=80, b=40),
        hovermode='y unified',
    )
    
    return fig


def _downsample_for_plot(
    x_data: np.ndarray,
    y_data: np.ndarray,
    color_data: Optional[np.ndarray],
    max_points: int = 5000,
) -> Tuple[np.ndarray, np.ndarray, Optional[np.ndarray]]:
    """
    大数据点降采样，避免Plotly渲染卡顿
    使用均匀采样+端点保留策略
    
    Parameters:
    -----------
    x_data, y_data, color_data: 原始数据
    max_points: 最大保留点数
    
    Returns:
    --------
    降采样后的数据
    """
    n = len(x_data)
    if n <= max_points:
        return x_data, y_data, color_data
    
    step = max(1, n // max_points)
    indices = np.arange(0, n, step)
    
    if len(indices) > max_points:
        indices = indices[:max_points]
    
    if indices[-1] != n - 1:
        indices = np.append(indices, n - 1)
    
    x_down = x_data[indices]
    y_down = y_data[indices]
    color_down = color_data[indices] if color_data is not None else None
    
    return x_down, y_down, color_down


def create_crossplot(
    x_data: np.ndarray,
    y_data: np.ndarray,
    color_data: Optional[np.ndarray] = None,
    x_label: str = "X",
    y_label: str = "Y",
    color_label: str = "颜色",
    title: str = "交会图",
    max_points: int = 8000,
) -> go.Figure:
    """
    创建交会图（如纵横波交会图）
    
    对于大数据点(>10000点)，使用Scattergl(WebGL)渲染以避免卡顿。
    同时在数据量过大时自动降采样。
    
    Parameters:
    -----------
    x_data: X轴数据
    y_data: Y轴数据
    color_data: 颜色映射数据
    x_label: X轴标签
    y_label: Y轴标签
    color_label: 颜色条标签
    title: 图表标题
    max_points: 超过此点数时触发降采样（默认8000）
    
    Returns:
    --------
    Plotly Figure对象
    """
    original_count = len(x_data)
    use_webgl = original_count > 3000
    
    x_plot, y_plot, color_plot = _downsample_for_plot(
        x_data, y_data, color_data, max_points=max_points
    )
    
    scatter_class = go.Scattergl if use_webgl else go.Scatter
    
    fig = go.Figure()
    
    if color_plot is not None:
        fig.add_trace(
            scatter_class(
                x=x_plot,
                y=y_plot,
                mode='markers',
                marker=dict(
                    color=color_plot,
                    colorscale='Viridis',
                    size=3 if not use_webgl else 2,
                    opacity=0.7,
                    colorbar=dict(title=color_label),
                ),
                hovertemplate=f'{x_label}: %{{x:.2f}}<br>{y_label}: %{{y:.2f}}<br>{color_label}: %{{marker.color:.2f}}',
            )
        )
    else:
        fig.add_trace(
            scatter_class(
                x=x_plot,
                y=y_plot,
                mode='markers',
                marker=dict(size=3 if not use_webgl else 2, opacity=0.7, color='#3498DB'),
                hovertemplate=f'{x_label}: %{{x:.2f}}<br>{y_label}: %{{y:.2f}}',
            )
        )
    
    if original_count > max_points:
        title += f" (共{original_count:,}点, 显示{len(x_plot):,}点)"
    
    fig.update_layout(
        title=title,
        xaxis_title=x_label,
        yaxis_title=y_label,
        height=600,
        showlegend=False,
        margin=dict(l=60, r=60, t=40, b=40),
    )
    
    return fig
