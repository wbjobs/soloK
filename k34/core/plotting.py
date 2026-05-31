"""
和谐图绘制模块
实现Wetherill和谐图和Tera-Wasserburg和谐图
支持误差椭圆绘制（考虑误差相关性）
"""

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Ellipse
from matplotlib.collections import PatchCollection
from typing import Tuple, Optional, List
from enum import Enum

from .age_calculator import (
    concordia_ratios,
    LAMBDA238,
    LAMBDA235,
    U238_U235,
)


class OriginStyle(Enum):
    """锆石成因类型绘图样式"""
    MAGMATIC = {"marker": "o", "color": "#ff7f0e", "label": "岩浆锆石", "size": 8}
    HYDROTHERMAL = {"marker": "s", "color": "#2ca02c", "label": "热液锆石", "size": 8}
    METAMORPHIC = {"marker": "^", "color": "#d62728", "label": "变质锆石", "size": 8}
    UNCERTAIN = {"marker": "x", "color": "#7f7f7f", "label": "成因不明", "size": 7}


def _get_origin_style(origin_name: str) -> dict:
    """根据成因类型名称获取绘图样式"""
    for style in OriginStyle:
        if style.value["label"] == origin_name:
            return style.value
    return OriginStyle.UNCERTAIN.value


def _error_ellipse(
    x_mean: float,
    y_mean: float,
    sx: float,
    sy: float,
    rho: float,
    n_sigma: float = 2.0,
    min_eigenvalue_ratio: float = 0.01,
) -> Ellipse:
    """
    生成误差椭圆
    处理非正定协方差矩阵导致的椭圆畸变问题

    参数:
        x_mean: x均值
        y_mean: y均值
        sx: x方向1σ
        sy: y方向1σ
        rho: x与y的相关系数
        n_sigma: 误差倍数 (通常为2)
        min_eigenvalue_ratio: 特征值最小比率，防止椭圆畸变

    返回:
        matplotlib Ellipse 对象
    """
    rho = np.clip(rho, -0.9999, 0.9999)
    sx = max(sx, 1e-10)
    sy = max(sy, 1e-10)

    cov = np.array([[sx ** 2, rho * sx * sy],
                     [rho * sx * sy, sy ** 2]])

    eigvals, eigvecs = np.linalg.eigh(cov)

    eigvals = np.maximum(eigvals, 1e-20)

    max_eigval = np.max(eigvals)
    min_eigval = max_eigval * min_eigenvalue_ratio
    eigvals = np.maximum(eigvals, min_eigval)

    angle = np.degrees(np.arctan2(eigvecs[1, 1], eigvecs[0, 1]))
    width = 2.0 * n_sigma * np.sqrt(eigvals[1])
    height = 2.0 * n_sigma * np.sqrt(eigvals[0])

    width = min(width, 1e10)
    height = min(height, 1e10)

    if width <= 0 or height <= 0:
        width = max(2.0 * n_sigma * sx, 1e-10)
        height = max(2.0 * n_sigma * sy, 1e-10)
        angle = 0.0

    return Ellipse((x_mean, y_mean), width, height, angle=angle)


def _concordia_curve_wetherill(
    t_min: float = 1.0,
    t_max: float = 4500.0,
    n_points: int = 500,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    生成Wetherill和谐曲线

    返回:
        (206Pb/238U数组, 207Pb/235U数组, 年龄数组)
    """
    ages = np.linspace(t_min, t_max, n_points)
    r75, r68 = concordia_ratios(ages)
    return r68, r75, ages


def _concordia_curve_tera_wasserburg(
    t_min: float = 1.0,
    t_max: float = 4500.0,
    n_points: int = 500,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    生成Tera-Wasserburg和谐曲线

    返回:
        (238U/206Pb数组, 207Pb/206Pb数组, 年龄数组)
    """
    ages = np.linspace(t_min, t_max, n_points)
    r75, r68 = concordia_ratios(ages)

    r86 = 1.0 / r68
    r76 = r75 / (r68 * U238_U235)

    return r86, r76, ages


def _concordia_line_wetherill(
    t1: float,
    t2: float,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Wetherill图中连接两个年龄的连线(不一致线)
    """
    r75_1, r68_1 = concordia_ratios(t1)
    r75_2, r68_2 = concordia_ratios(t2)
    return np.array([r68_1, r68_2]), np.array([r75_1, r75_2])


def _concordia_line_tera_wasserburg(
    t1: float,
    t2: float,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Tera-Wasserburg图中连接两个年龄的连线(不一致线)
    """
    r75_1, r68_1 = concordia_ratios(t1)
    r75_2, r68_2 = concordia_ratios(t2)

    r86_1 = 1.0 / r68_1
    r76_1 = r75_1 / (r68_1 * U238_U235)
    r86_2 = 1.0 / r68_2
    r76_2 = r75_2 / (r68_2 * U238_U235)

    return np.array([r86_1, r86_2]), np.array([r76_1, r76_2])


def plot_wetherill(
    r68: np.ndarray,
    s68: np.ndarray,
    r75: np.ndarray,
    s75: np.ndarray,
    rho: np.ndarray,
    output_path: str,
    concordia_age: float = None,
    upper_intercept: float = None,
    lower_intercept: float = None,
    title: str = "Wetherill Concordia Diagram",
    show_ellipses: bool = True,
    figsize: Tuple[float, float] = (10, 8),
    n_sigma: float = 2.0,
    xlabel: str = "$^{206}$Pb/$^{238}$U",
    ylabel: str = "$^{207}$Pb/$^{235}$U",
    dpi: int = 300,
    origin_labels: Optional[List[str]] = None,
) -> str:
    """
    绘制Wetherill和谐图

    参数:
        r68: 206Pb/238U 比值数组
        s68: 206Pb/238U 1σ 数组
        r75: 207Pb/235U 比值数组
        s75: 207Pb/235U 1σ 数组
        rho: r68与r75误差相关系数
        output_path: 输出文件路径
        concordia_age: 和谐年龄 (Ma)
        upper_intercept: 上交点年龄 (Ma)
        lower_intercept: 下交点年龄 (Ma)
        title: 图标题
        show_ellipses: 是否显示误差椭圆
        figsize: 图像尺寸
        n_sigma: 误差椭圆倍数
        dpi: 输出DPI
        origin_labels: 锆石成因类型标签列表

    返回:
        输出文件路径
    """
    fig, ax = plt.subplots(figsize=figsize)

    curve_x, curve_y, ages = _concordia_curve_wetherill()
    ax.plot(curve_x, curve_y, "k-", linewidth=1.5, label="Concordia")

    tick_ages = [100, 200, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500]
    for ta in tick_ages:
        r75_t, r68_t = concordia_ratios(ta)
        ax.plot(r68_t, r75_t, "k.", markersize=3)

    if upper_intercept is not None and lower_intercept is not None:
        line_x, line_y = _concordia_line_wetherill(lower_intercept, upper_intercept)
        ax.plot(line_x, line_y, "r--", linewidth=1.5, label=f"Discordia line")

    if concordia_age is not None:
        r75_c, r68_c = concordia_ratios(concordia_age)
        ax.plot(r68_c, r75_c, "g*", markersize=15, zorder=5,
                label=f"Concordia age: {concordia_age:.1f} Ma")

    if show_ellipses and len(r68) > 0:
        ellipses = []
        for i in range(len(r68)):
            ell = _error_ellipse(r68[i], r75[i], s68[i], s75[i], rho[i], n_sigma)
            ellipses.append(ell)

        pc = PatchCollection(
            ellipses,
            facecolor="none",
            edgecolor="steelblue",
            linewidth=0.8,
            alpha=0.5,
        )
        ax.add_collection(pc)

    if origin_labels is not None and len(origin_labels) == len(r68):
        unique_origins = {}
        for i in range(len(r68)):
            orig = origin_labels[i]
            style = _get_origin_style(orig)
            if orig not in unique_origins:
                unique_origins[orig] = {"style": style, "x": [], "y": []}
            unique_origins[orig]["x"].append(r68[i])
            unique_origins[orig]["y"].append(r75[i])

        for orig, data in unique_origins.items():
            ax.scatter(
                data["x"], data["y"],
                marker=data["style"]["marker"],
                c=data["style"]["color"],
                s=data["style"]["size"] * 8,
                label=data["style"]["label"],
                alpha=0.8,
                edgecolors="black",
                linewidths=0.5,
                zorder=4,
            )
    else:
        ax.plot(r68, r75, "o", color="steelblue", markersize=5, alpha=0.7, zorder=4)

    age_labels = [100, 500, 1000, 2000, 3000, 4000]
    for ta in age_labels:
        r75_t, r68_t = concordia_ratios(ta)
        ax.annotate(f"{ta}", xy=(r68_t, r75_t),
                    xytext=(r68_t * 1.02, r75_t * 0.98),
                    fontsize=7, color="gray")

    ax.set_xlabel(xlabel, fontsize=12)
    ax.set_ylabel(ylabel, fontsize=12)
    ax.set_title(title, fontsize=14, fontweight="bold")
    ax.legend(loc="upper left", fontsize=10)
    ax.grid(True, alpha=0.3)

    margin_x = 0.1 * (np.max(r68) - np.min(r68)) if len(r68) > 0 else 0.1
    margin_y = 0.1 * (np.max(r75) - np.min(r75)) if len(r75) > 0 else 0.5
    ax.set_xlim(max(0, np.min(r68) - margin_x) if len(r68) > 0 else 0,
                np.max(curve_x) * 1.05)
    ax.set_ylim(max(0, np.min(r75) - margin_y) if len(r75) > 0 else 0,
                np.max(curve_y) * 1.05)

    plt.tight_layout()
    fig.savefig(output_path, dpi=dpi, bbox_inches="tight")
    plt.close(fig)

    return output_path


def plot_tera_wasserburg(
    r86: np.ndarray,
    s86: np.ndarray,
    r76: np.ndarray,
    s76: np.ndarray,
    rho_86_76: np.ndarray,
    output_path: str,
    concordia_age: float = None,
    upper_intercept: float = None,
    lower_intercept: float = None,
    title: str = "Tera-Wasserburg Concordia Diagram",
    show_ellipses: bool = True,
    figsize: Tuple[float, float] = (10, 8),
    n_sigma: float = 2.0,
    xlabel: str = "$^{238}$U/$^{206}$Pb",
    ylabel: str = "$^{207}$Pb/$^{206}$Pb",
    dpi: int = 300,
    origin_labels: Optional[List[str]] = None,
) -> str:
    """
    绘制Tera-Wasserburg和谐图

    参数:
        r86: 238U/206Pb 比值数组
        s86: 238U/206Pb 1σ 数组
        r76: 207Pb/206Pb 比值数组
        s76: 207Pb/206Pb 1σ 数组
        rho_86_76: r86与r76误差相关系数
        output_path: 输出文件路径
        concordia_age: 和谐年龄 (Ma)
        upper_intercept: 上交点年龄 (Ma)
        lower_intercept: 下交点年龄 (Ma)
        title: 图标题
        show_ellipses: 是否显示误差椭圆
        figsize: 图像尺寸
        n_sigma: 误差椭圆倍数
        dpi: 输出DPI
        origin_labels: 锆石成因类型标签列表

    返回:
        输出文件路径
    """
    fig, ax = plt.subplots(figsize=figsize)

    curve_x, curve_y, ages = _concordia_curve_tera_wasserburg()
    ax.plot(curve_x, curve_y, "k-", linewidth=1.5, label="Concordia")

    tick_ages = [100, 200, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500]
    for ta in tick_ages:
        r75_t, r68_t = concordia_ratios(ta)
        r86_t = 1.0 / r68_t
        r76_t = r75_t / (r68_t * U238_U235)
        ax.plot(r86_t, r76_t, "k.", markersize=3)

    if upper_intercept is not None and lower_intercept is not None:
        line_x, line_y = _concordia_line_tera_wasserburg(
            lower_intercept, upper_intercept
        )
        ax.plot(line_x, line_y, "r--", linewidth=1.5, label="Discordia line")

    if concordia_age is not None:
        r75_c, r68_c = concordia_ratios(concordia_age)
        r86_c = 1.0 / r68_c
        r76_c = r75_c / (r68_c * U238_U235)
        ax.plot(r86_c, r76_c, "g*", markersize=15, zorder=5,
                label=f"Concordia age: {concordia_age:.1f} Ma")

    if show_ellipses and len(r86) > 0:
        ellipses = []
        for i in range(len(r86)):
            ell = _error_ellipse(
                r86[i], r76[i], s86[i], s76[i], rho_86_76[i], n_sigma
            )
            ellipses.append(ell)

        pc = PatchCollection(
            ellipses,
            facecolor="none",
            edgecolor="darkorange",
            linewidth=0.8,
            alpha=0.5,
        )
        ax.add_collection(pc)

    if origin_labels is not None and len(origin_labels) == len(r86):
        unique_origins = {}
        for i in range(len(r86)):
            orig = origin_labels[i]
            style = _get_origin_style(orig)
            if orig not in unique_origins:
                unique_origins[orig] = {"style": style, "x": [], "y": []}
            unique_origins[orig]["x"].append(r86[i])
            unique_origins[orig]["y"].append(r76[i])

        for orig, data in unique_origins.items():
            ax.scatter(
                data["x"], data["y"],
                marker=data["style"]["marker"],
                c=data["style"]["color"],
                s=data["style"]["size"] * 8,
                label=data["style"]["label"],
                alpha=0.8,
                edgecolors="black",
                linewidths=0.5,
                zorder=4,
            )
    else:
        ax.plot(r86, r76, "o", color="darkorange", markersize=5, alpha=0.7, zorder=4)

    age_labels = [100, 500, 1000, 2000, 3000, 4000]
    for ta in age_labels:
        r75_t, r68_t = concordia_ratios(ta)
        r86_t = 1.0 / r68_t
        r76_t = r75_t / (r68_t * U238_U235)
        ax.annotate(f"{ta}", xy=(r86_t, r76_t),
                    xytext=(r86_t * 1.02, r76_t * 1.02),
                    fontsize=7, color="gray")

    ax.set_xlabel(xlabel, fontsize=12)
    ax.set_ylabel(ylabel, fontsize=12)
    ax.set_title(title, fontsize=14, fontweight="bold")
    ax.legend(loc="upper right", fontsize=10)
    ax.grid(True, alpha=0.3)

    margin_x = 0.1 * (np.max(r86) - np.min(r86)) if len(r86) > 0 else 5
    margin_y = 0.1 * (np.max(r76) - np.min(r76)) if len(r76) > 0 else 0.01
    ax.set_xlim(max(0, np.min(r86) - margin_x) if len(r86) > 0 else 0,
                np.max(curve_x) * 1.05)
    ax.set_ylim(max(0, np.min(r76) - margin_y) if len(r76) > 0 else 0,
                np.max(curve_y) * 1.05)

    plt.tight_layout()
    fig.savefig(output_path, dpi=dpi, bbox_inches="tight")
    plt.close(fig)

    return output_path


def plot_age_spectrum(
    ages: np.ndarray,
    sigmas: np.ndarray,
    output_path: str,
    title: str = "Age Spectrum",
    figsize: Tuple[float, float] = (12, 6),
    dpi: int = 300,
    bandwidth: float = None,
    bins: int = 30,
    show_kde: bool = True,
    show_histogram: bool = True,
    xlabel: str = "Age (Ma)",
    age_range: Tuple[float, float] = None,
) -> str:
    """
    绘制年龄谱图 (核密度估计 + 直方图)

    参数:
        ages: 年龄数组 (Ma)
        sigmas: 年龄2σ误差数组 (Ma)
        output_path: 输出文件路径
        title: 图标题
        figsize: 图像尺寸
        dpi: 输出DPI
        bandwidth: KDE带宽
        bins: 直方图箱数
        show_kde: 是否显示KDE
        show_histogram: 是否显示直方图
        xlabel: x轴标签
        age_range: 年龄范围

    返回:
        输出文件路径
    """
    from scipy.stats import gaussian_kde

    fig, ax = plt.subplots(figsize=figsize)

    valid_mask = ~np.isnan(ages) & ~np.isinf(ages)
    ages_valid = ages[valid_mask]
    sigmas_valid = sigmas[valid_mask] if sigmas is not None else None

    if age_range is not None:
        range_mask = (ages_valid >= age_range[0]) & (ages_valid <= age_range[1])
        ages_valid = ages_valid[range_mask]
        sigmas_valid = sigmas_valid[range_mask] if sigmas_valid is not None else None

    if len(ages_valid) == 0:
        ax.text(0.5, 0.5, "No valid data", transform=ax.transAxes,
                ha="center", va="center", fontsize=16)
        fig.savefig(output_path, dpi=dpi, bbox_inches="tight")
        plt.close(fig)
        return output_path

    if show_histogram and len(ages_valid) > 1:
        ax.hist(ages_valid, bins=bins, density=True, alpha=0.5,
                color="steelblue", edgecolor="white", label="Histogram")

    if show_kde and len(ages_valid) > 1:
        try:
            if bandwidth is not None:
                kde = gaussian_kde(ages_valid, bw_method=bandwidth)
            else:
                kde = gaussian_kde(ages_valid)

            x_grid = np.linspace(
                np.min(ages_valid) * 0.95,
                np.max(ages_valid) * 1.05,
                500,
            )
            kde_values = kde(x_grid)

            ax.plot(x_grid, kde_values, "r-", linewidth=2, label="KDE")
            ax.fill_between(x_grid, kde_values, alpha=0.2, color="red")
        except np.linalg.LinAlgError:
            pass

    if sigmas_valid is not None and len(sigmas_valid) > 0 and len(ages_valid) > 0:
        ax.errorbar(
            ages_valid,
            np.zeros_like(ages_valid),
            yerr=None,
            xerr=sigmas_valid,
            fmt="none",
            ecolor="gray",
            elinewidth=1.0,
            capsize=2,
            alpha=0.6,
            label="2σ uncertainty",
        )

    ax.set_xlabel(xlabel, fontsize=12)
    ax.set_ylabel("Density", fontsize=12)
    ax.set_title(title, fontsize=14, fontweight="bold")
    ax.legend(loc="upper right", fontsize=10)
    ax.grid(True, alpha=0.3)
    ax.set_ylim(bottom=0)

    plt.tight_layout()
    fig.savefig(output_path, dpi=dpi, bbox_inches="tight")
    plt.close(fig)

    return output_path
