import numpy as np
import pandas as pd
import plotly.graph_objects as go
from typing import Dict, List, Optional, Tuple
from ..processing.shear_anisotropy import compute_rose_bins


def generate_synthetic_trajectory(
    well_name: str,
    max_depth: float = 3000.0,
    azimuth: float = 90.0,
    dip: float = 0.0,
    build_rate: float = 0.0,
) -> pd.DataFrame:
    """
    生成合成井轨迹数据
    
    Parameters:
    -----------
    well_name: 井名
    max_depth: 最大深度 (m)
    azimuth: 方位角 (度)
    dip: 初始倾角 (度)
    build_rate: 造斜率 (度/30m)
    
    Returns:
    --------
    包含井轨迹的DataFrame: [MD, TVD, X, Y, AZIMUTH, DIP]
    """
    depths = np.arange(0, max_depth + 30, 30)
    
    md = depths
    tvd = np.zeros_like(md)
    x = np.zeros_like(md)
    y = np.zeros_like(md)
    
    current_dip = dip
    current_azimuth = azimuth
    
    for i in range(1, len(md)):
        delta_md = md[i] - md[i - 1]
        
        if build_rate != 0:
            current_dip += build_rate * delta_md / 30
            current_dip = min(max(current_dip, -90), 90)
        
        dip_rad = np.radians(current_dip)
        az_rad = np.radians(current_azimuth)
        
        delta_tvd = delta_md * np.cos(dip_rad)
        delta_x = delta_md * np.sin(dip_rad) * np.sin(az_rad)
        delta_y = delta_md * np.sin(dip_rad) * np.cos(az_rad)
        
        tvd[i] = tvd[i - 1] + delta_tvd
        x[i] = x[i - 1] + delta_x
        y[i] = y[i - 1] + delta_y
    
    return pd.DataFrame({
        "MD": md,
        "TVD": tvd,
        "X": x,
        "Y": y,
        "AZIMUTH": current_azimuth,
        "DIP": current_dip,
    })


def compute_camera_params(trajectories: List[Tuple[str, pd.DataFrame]]) -> dict:
    """
    计算大位移井轨迹的相机参数，修复旋转中心偏移问题
    
    Parameters:
    -----------
    trajectories: 井轨迹数据列表
    
    Returns:
    --------
    dict with camera 'eye', 'up', 'center' settings
    """
    all_x, all_y, all_z = [], [], []
    for _, traj_df in trajectories:
        if "X" in traj_df.columns and "Y" in traj_df.columns and "TVD" in traj_df.columns:
            all_x.extend(traj_df["X"].values)
            all_y.extend(traj_df["Y"].values)
            all_z.extend(-traj_df["TVD"].values)
    
    if not all_x:
        return {"eye": {"x": 1.5, "y": 1.5, "z": 1.5}, "up": {"x": 0, "y": 0, "z": 1}}
    
    cx = float(np.mean(all_x))
    cy = float(np.mean(all_y))
    cz = float(np.mean(all_z))
    
    span_x = float(np.max(all_x) - np.min(all_x))
    span_y = float(np.max(all_y) - np.min(all_y))
    span_z = float(np.max(all_z) - np.min(all_z))
    
    max_span = max(span_x, span_y, span_z, 1.0)
    distance = max_span * 2.0
    
    theta = np.pi / 6
    phi = np.pi / 6
    
    eye_x = cx + distance * np.cos(phi) * np.cos(theta)
    eye_y = cy + distance * np.cos(phi) * np.sin(theta)
    eye_z = cz + distance * np.sin(phi)
    
    is_extended_reach = max(span_x, span_y) > 2000
    
    if is_extended_reach:
        horizontal_dir = np.array([span_x, span_y])
        horizontal_dir = horizontal_dir / (np.linalg.norm(horizontal_dir) + 1e-9)
        eye_x = cx + horizontal_dir[0] * distance
        eye_y = cy + horizontal_dir[1] * distance
        eye_z = cz + distance * 0.5
    
    camera = {
        "eye": {"x": eye_x, "y": eye_y, "z": eye_z},
        "up": {"x": 0, "y": 0, "z": 1},
        "center": {"x": cx, "y": cy, "z": cz},
        "projection": {"type": "perspective"},
    }
    
    return camera


def compute_scene_aspect(trajectories: List[Tuple[str, pd.DataFrame]]) -> dict:
    """
    计算合理的场景比例，避免大位移井时某个轴被过度压缩
    
    Returns:
    --------
    dict with aspectratio, ranges
    """
    all_x, all_y, all_z = [], [], []
    for _, traj_df in trajectories:
        if "X" in traj_df.columns and "Y" in traj_df.columns and "TVD" in traj_df.columns:
            all_x.extend(traj_df["X"].values)
            all_y.extend(traj_df["Y"].values)
            all_z.extend(-traj_df["TVD"].values)
    
    if not all_x:
        return {"mode": "data"}
    
    min_x, max_x = float(np.min(all_x)), float(np.max(all_x))
    min_y, max_y = float(np.min(all_y)), float(np.max(all_y))
    min_z, max_z = float(np.min(all_z)), float(np.max(all_z))
    
    pad_x = (max_x - min_x) * 0.05
    pad_y = (max_y - min_y) * 0.05
    pad_z = (max_z - min_z) * 0.05
    
    ranges = {
        "x": [min_x - pad_x, max_x + pad_x],
        "y": [min_y - pad_y, max_y + pad_y],
        "z": [min_z - pad_z, max_z + pad_z],
    }
    
    span_x = max_x - min_x
    span_y = max_y - min_y
    span_z = max_z - min_z
    max_span = max(span_x, span_y, span_z, 1.0)
    
    aspectratio = {
        "x": round(max(span_x / max_span, 0.1), 4),
        "y": round(max(span_y / max_span, 0.1), 4),
        "z": round(max(span_z / max_span, 0.1), 4),
    }
    
    return {
        "aspectmode": "manual",
        "aspectratio": aspectratio,
        "xaxis": {"title": 'X (m)', "range": ranges["x"]},
        "yaxis": {"title": 'Y (m)', "range": ranges["y"]},
        "zaxis": {"title": 'TVD (m)', "range": ranges["z"]},
    }


def create_3d_trajectory_plot(
    trajectories: List[Tuple[str, pd.DataFrame]],
    property_data: Optional[List[np.ndarray]] = None,
    property_name: str = "属性",
) -> go.Figure:
    """
    创建3D井轨迹可视化
    
    Parameters:
    -----------
    trajectories: [(well_name, trajectory_df), ...] 列表
        trajectory_df必须包含X, Y, TVD列
    property_data: 可选，每条轨迹对应的属性数据列表（用于颜色映射）
    property_name: 属性名称
    
    Returns:
    --------
    Plotly Figure对象
    """
    fig = go.Figure()
    
    colors = ["#E74C3C", "#3498DB", "#2ECC71", "#F39C12"]
    
    for i, (well_name, traj_df) in enumerate(trajectories):
        if "X" not in traj_df.columns or "Y" not in traj_df.columns or "TVD" not in traj_df.columns:
            continue
        
        color = colors[i % len(colors)]
        
        if property_data is not None and i < len(property_data):
            prop_values = property_data[i]
            
            fig.add_trace(
                go.Scatter3d(
                    x=traj_df["X"],
                    y=traj_df["Y"],
                    z=-traj_df["TVD"],
                    mode='lines',
                    line=dict(
                        color=prop_values,
                        colorscale='Viridis',
                        width=8,
                        colorbar=dict(title=property_name, x=0.95),
                    ),
                    name=well_name,
                    hovertemplate=f'{well_name}<br>X: %{{x:.1f}} m<br>Y: %{{y:.1f}} m<br>TVD: %{{z:.1f}} m',
                )
            )
        else:
            fig.add_trace(
                go.Scatter3d(
                    x=traj_df["X"],
                    y=traj_df["Y"],
                    z=-traj_df["TVD"],
                    mode='lines+markers',
                    line=dict(color=color, width=5),
                    marker=dict(size=3, color=color),
                    name=well_name,
                    hovertemplate=f'{well_name}<br>X: %{{x:.1f}} m<br>Y: %{{y:.1f}} m<br>TVD: %{{z:.1f}} m',
                )
            )
        
        fig.add_trace(
            go.Scatter3d(
                x=[0],
                y=[0],
                z=[0],
                mode='markers',
                marker=dict(size=8, color='black', symbol='square'),
                name='井口',
                showlegend=(i == 0),
            )
        )
    
    scene_config = compute_scene_aspect(trajectories)
    camera_params = compute_camera_params(trajectories)
    
    fig.update_layout(
        title="3D井轨迹可视化",
        scene=dict(
            **scene_config,
            camera=camera_params,
            dragmode='orbit',
        ),
        height=700,
        showlegend=True,
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        margin=dict(l=0, r=0, t=40, b=0),
    )
    
    return fig


def create_top_view_trajectory(
    trajectories: List[Tuple[str, pd.DataFrame]],
) -> go.Figure:
    """
    创建井轨迹俯视图
    
    Parameters:
    -----------
    trajectories: [(well_name, trajectory_df), ...] 列表
    
    Returns:
    --------
    Plotly Figure对象
    """
    fig = go.Figure()
    
    colors = ["#E74C3C", "#3498DB", "#2ECC71", "#F39C12"]
    
    for i, (well_name, traj_df) in enumerate(trajectories):
        color = colors[i % len(colors)]
        
        fig.add_trace(
            go.Scatter(
                x=traj_df["X"],
                y=traj_df["Y"],
                mode='lines+markers',
                line=dict(color=color, width=3),
                marker=dict(size=5, color=color),
                name=well_name,
                hovertemplate=f'{well_name}<br>X: %{{x:.1f}} m<br>Y: %{{y:.1f}} m',
            )
        )
    
    fig.add_trace(
        go.Scatter(
            x=[0],
            y=[0],
            mode='markers',
            marker=dict(size=12, color='black', symbol='square'),
            name='井口',
        )
    )
    
    fig.update_layout(
        title="井轨迹俯视图",
        xaxis_title='X (m)',
        yaxis_title='Y (m)',
        height=600,
        showlegend=True,
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        margin=dict(l=60, r=60, t=80, b=40),
    )
    
    return fig


def create_3d_anisotropy_rose(
    directions: np.ndarray,
    depths: np.ndarray,
    anisotropy_magnitude: Optional[np.ndarray] = None,
    n_direction_bins: int = 18,
    n_depth_sections: int = 5,
    scale_factor: float = 500.0,
    base_position: Tuple[float, float, float] = (0, 0, 0),
) -> go.Figure:
    """
    创建3D各向异性玫瑰花图（沿深度方向）
    
    Parameters:
    -----------
    directions: 快横波方向数组 (度)
    depths: 深度数组
    anisotropy_magnitude: 各向异性强度（可选，用于加权）
    n_direction_bins: 方向分箱数
    n_depth_sections: 深度分段数
    scale_factor: 玫瑰花图大小缩放因子
    base_position: 基准位置 (x0, y0, z0)
    
    Returns:
    --------
    Plotly Figure对象
    """
    fig = go.Figure()
    
    if anisotropy_magnitude is None:
        anisotropy_magnitude = np.ones_like(directions)
    
    depth_min, depth_max = depths.min(), depths.max()
    depth_sections = np.linspace(depth_min, depth_max, n_depth_sections + 1)
    
    for i in range(n_depth_sections):
        d_top, d_bottom = depth_sections[i], depth_sections[i + 1]
        mask = (depths >= d_top) & (depths < d_bottom)
        
        if not mask.any():
            continue
        
        d_mid = (d_top + d_bottom) / 2
        z_pos = base_position[2] - d_mid
        
        section_dirs = directions[mask]
        section_weights = anisotropy_magnitude[mask]
        
        bin_centers, bin_values = compute_rose_bins(
            section_dirs, weights=section_weights, n_bins=n_direction_bins
        )
        
        if bin_values.sum() > 0:
            bin_values = bin_values / bin_values.max()
        
        for j, (theta, val) in enumerate(zip(bin_centers, bin_values)):
            theta_rad = np.deg2rad(theta)
            
            x_start = base_position[0]
            y_start = base_position[1]
            x_end = base_position[0] + val * scale_factor * np.cos(theta_rad)
            y_end = base_position[1] + val * scale_factor * np.sin(theta_rad)
            
            color_intensity = val
            fig.add_trace(
                go.Scatter3d(
                    x=[x_start, x_end],
                    y=[y_start, y_end],
                    z=[z_pos, z_pos],
                    mode='lines',
                    line=dict(
                        color=f'rgba({int(231 + (1-color_intensity)*50)}, '
                              f'{int(76 + color_intensity*100)}, '
                              f'{int(60 + (1-color_intensity)*100)}, 0.8)',
                        width=4 + val * 4,
                    ),
                    name=f'{d_mid:.0f}m - {theta:.0f}°',
                    showlegend=False,
                    hovertemplate=f'深度: {d_mid:.1f}m<br>方向: {theta:.0f}°<br>强度: {val:.2f}',
                )
            )
        
        theta_circle = np.deg2rad(np.linspace(0, 180, 72))
        x_circle = base_position[0] + scale_factor * 0.3 * np.cos(theta_circle)
        y_circle = base_position[1] + scale_factor * 0.3 * np.sin(theta_circle)
        z_circle = np.full_like(x_circle, z_pos)
        
        fig.add_trace(
            go.Scatter3d(
                x=x_circle,
                y=y_circle,
                z=z_circle,
                mode='lines',
                line=dict(color='rgba(150,150,150,0.3)', width=1),
                name=f'{d_mid:.0f}m 参考圆',
                showlegend=False,
            )
        )
        
        fig.add_trace(
            go.Scatter3d(
                x=[base_position[0]],
                y=[base_position[1]],
                z=[z_pos],
                mode='text',
                text=[f'{d_mid:.0f}m'],
                textposition='middle right',
                showlegend=False,
            )
        )
    
    fig.add_trace(
        go.Scatter3d(
            x=[base_position[0], base_position[0] + scale_factor],
            y=[base_position[1], base_position[1]],
            z=[base_position[2], base_position[2]],
            mode='lines+text',
            line=dict(color='black', width=2),
            text=['', 'E (0°)'],
            textposition='top right',
            name='东向',
            showlegend=False,
        )
    )
    
    fig.add_trace(
        go.Scatter3d(
            x=[base_position[0], base_position[0]],
            y=[base_position[1], base_position[1] + scale_factor],
            z=[base_position[2], base_position[2]],
            mode='lines+text',
            line=dict(color='black', width=2),
            text=['', 'N (90°)'],
            textposition='top center',
            name='北向',
            showlegend=False,
        )
    )
    
    all_x = [base_position[0], base_position[0] + scale_factor]
    all_y = [base_position[1], base_position[1] + scale_factor]
    all_z = [base_position[2] - depth_min, base_position[2] - depth_max]
    
    fig.update_layout(
        title="3D横波各向异性玫瑰花图",
        scene=dict(
            xaxis_title='X (m)',
            yaxis_title='Y (m)',
            zaxis_title='深度 (m)',
            aspectmode='manual',
            aspectratio=dict(x=1, y=1, z=1.5),
            camera=dict(
                eye=dict(x=1.5, y=-2, z=1),
                up=dict(x=0, y=0, z=1),
            ),
        ),
        height=700,
        showlegend=False,
        margin=dict(l=0, r=0, t=40, b=0),
    )
    
    return fig


def create_anisotropy_rose_2d(
    directions: np.ndarray,
    anisotropy_magnitude: Optional[np.ndarray] = None,
    n_bins: int = 36,
    title: str = "横波各向异性玫瑰花图",
) -> go.Figure:
    """
    创建2D各向异性玫瑰花图
    
    Parameters:
    -----------
    directions: 快横波方向数组 (度)
    anisotropy_magnitude: 各向异性强度（可选）
    n_bins: 分箱数量
    title: 图表标题
    
    Returns:
    --------
    Plotly Figure对象
    """
    bin_centers, bin_values = compute_rose_bins(
        directions, weights=anisotropy_magnitude, n_bins=n_bins
    )
    
    if bin_values.sum() > 0:
        bin_values = bin_values / bin_values.max() * 100
    
    theta = np.deg2rad(bin_centers)
    
    fig = go.Figure()
    
    fig.add_trace(
        go.Barpolar(
            r=bin_values,
            theta=bin_centers,
            width=180 / n_bins * 0.8,
            marker=dict(
                color=bin_values,
                colorscale='Reds',
                showscale=True,
                colorbar=dict(title='相对强度 (%)'),
            ),
            hovertemplate='方向: %{theta:.0f}°<br>强度: %{r:.1f}%',
        )
    )
    
    fig.update_layout(
        title=title,
        polar=dict(
            angularaxis=dict(
                tickmode='array',
                tickvals=[0, 45, 90, 135, 180],
                ticktext=['0° (E)', '45°', '90° (N)', '135°', '180°'],
                direction='counterclockwise',
            ),
            radialaxis=dict(title='相对强度 (%)'),
        ),
        height=600,
        margin=dict(l=60, r=60, t=60, b=60),
    )
    
    return fig
