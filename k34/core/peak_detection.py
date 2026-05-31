"""
峰值检测模块
实现多峰分解算法，用于年龄谱中的年龄峰值识别
"""

import numpy as np
from dataclasses import dataclass, field
from typing import Tuple, List, Optional, Dict
from scipy.optimize import curve_fit
from scipy.signal import find_peaks, peak_widths

from .spectrum import PeakResult, compute_kde


@dataclass
class MultiPeakResult:
    """多峰分解结果"""
    peaks: List[PeakResult] = field(default_factory=list)
    x_grid: np.ndarray = field(default_factory=lambda: np.array([]))
    total_kde: np.ndarray = field(default_factory=lambda: np.array([]))
    component_curves: List[np.ndarray] = field(default_factory=list)
    method: str = ""
    n_components: int = 0
    goodness_of_fit: float = 0.0


def _gaussian(x, amp, center, sigma):
    """单高斯函数"""
    return amp * np.exp(-0.5 * ((x - center) / sigma) ** 2)


def _multi_gaussian(x, *params):
    """多高斯函数（参数顺序: amp1, center1, sigma1, amp2, center2, sigma2, ...）"""
    result = np.zeros_like(x)
    n_peaks = len(params) // 3
    for i in range(n_peaks):
        amp = params[3 * i]
        center = params[3 * i + 1]
        sigma = params[3 * i + 2]
        result += _gaussian(x, amp, center, sigma)
    return result


def detect_peaks_iterative(
    ages: np.ndarray,
    sigmas: np.ndarray = None,
    min_peak_distance: float = 50.0,
    min_peak_prominence: float = 0.005,
    max_peaks: int = 5,
    kde_bandwidth: float = None,
    fit_gaussians: bool = True,
) -> MultiPeakResult:
    """
    迭代峰值检测算法
    基于KDE的峰值检测，可选高斯拟合

    参数:
        ages: 年龄数组 (Ma)
        sigmas: 年龄误差数组 (Ma)
        min_peak_distance: 峰之间最小距离 (Ma)
        min_peak_prominence: 最小峰突出度
        max_peaks: 最大峰数量
        kde_bandwidth: KDE带宽
        fit_gaussians: 是否拟合高斯函数

    返回:
        MultiPeakResult
    """
    valid_mask = ~np.isnan(ages) & ~np.isinf(ages)
    ages_valid = ages[valid_mask]

    if len(ages_valid) < 3:
        return MultiPeakResult(method="iterative", n_components=0)

    x_grid, kde_values = compute_kde(ages_valid, bandwidth=kde_bandwidth)

    if len(kde_values) == 0:
        return MultiPeakResult(method="iterative", n_components=0)

    dx = x_grid[1] - x_grid[0]
    min_distance_samples = max(1, int(min_peak_distance / dx))

    peak_indices, properties = find_peaks(
        kde_values,
        distance=min_distance_samples,
        prominence=min_peak_prominence * np.max(kde_values),
    )

    if len(peak_indices) == 0:
        return MultiPeakResult(
            peaks=[],
            x_grid=x_grid,
            total_kde=kde_values,
            method="iterative",
            n_components=0,
        )

    peak_indices = peak_indices[:max_peaks]

    widths = peak_widths(kde_values, peak_indices, rel_height=0.5)
    fwhm = widths[0] * dx

    peaks = []
    component_curves = []

    for i, idx in enumerate(peak_indices):
        center = x_grid[idx]
        sigma = fwhm[i] / 2.355
        amplitude = kde_values[idx]

        peak_mask = np.abs(ages_valid - center) < 2.0 * sigma
        n_pts = np.sum(peak_mask)

        if n_pts > 0:
            peaks.append(
                PeakResult(
                    center=center,
                    sigma=sigma,
                    amplitude=amplitude,
                    age_range=(center - 2.0 * sigma, center + 2.0 * sigma),
                    n_points=n_pts,
                    mean_age=np.mean(ages_valid[peak_mask]),
                    median_age=np.median(ages_valid[peak_mask]),
                )
            )

            component_curves.append(
                _gaussian(x_grid, amplitude, center, sigma)
            )

    if fit_gaussians and len(peaks) >= 1:
        try:
            p0 = []
            bounds_lower = []
            bounds_upper = []

            for p in peaks:
                p0.extend([p.amplitude, p.center, p.sigma])
                bounds_lower.extend([0, p.center - 5.0 * p.sigma, 0.5 * p.sigma])
                bounds_upper.extend([
                    np.max(kde_values) * 1.5,
                    p.center + 5.0 * p.sigma,
                    5.0 * p.sigma,
                ])

            popt, pcov = curve_fit(
                _multi_gaussian,
                x_grid,
                kde_values,
                p0=p0,
                bounds=(bounds_lower, bounds_upper),
                maxfev=10000,
            )

            peaks = []
            component_curves = []
            total_fit = np.zeros_like(x_grid)

            for i in range(len(peaks) if len(peaks) > 0 else len(popt) // 3):
                n_fitted = len(popt) // 3
                if i < n_fitted:
                    amp = popt[3 * i]
                    center = popt[3 * i + 1]
                    sigma = popt[3 * i + 2]

                    peak_mask = np.abs(ages_valid - center) < 2.0 * sigma
                    n_pts = np.sum(peak_mask)

                    if n_pts > 0:
                        peaks.append(
                            PeakResult(
                                center=center,
                                sigma=sigma,
                                amplitude=amp,
                                age_range=(center - 2.0 * sigma, center + 2.0 * sigma),
                                n_points=n_pts,
                                mean_age=np.mean(ages_valid[peak_mask]),
                                median_age=np.median(ages_valid[peak_mask]),
                            )
                        )

                        comp_curve = _gaussian(x_grid, amp, center, sigma)
                        component_curves.append(comp_curve)
                        total_fit += comp_curve

            residuals = kde_values - total_fit
            ss_res = np.sum(residuals ** 2)
            ss_tot = np.sum((kde_values - np.mean(kde_values)) ** 2)
            r_squared = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0

            return MultiPeakResult(
                peaks=peaks,
                x_grid=x_grid,
                total_kde=kde_values,
                component_curves=component_curves,
                method="iterative_gaussian_fit",
                n_components=len(peaks),
                goodness_of_fit=r_squared,
            )

        except Exception:
            pass

    return MultiPeakResult(
        peaks=peaks,
        x_grid=x_grid,
        total_kde=kde_values,
        component_curves=component_curves,
        method="iterative",
        n_components=len(peaks),
    )


def peak_decomposition_summary(
    peaks: List[PeakResult],
    ages: np.ndarray = None,
    sigmas: np.ndarray = None,
) -> str:
    """
    生成峰值分解摘要文本

    参数:
        peaks: PeakResult列表
        ages: 年龄数组
        sigmas: 年龄误差数组

    返回:
        格式化的摘要字符串
    """
    lines = []
    lines.append("=" * 70)
    lines.append("Age Peak Decomposition Results")
    lines.append("=" * 70)

    if ages is not None:
        valid_mask = ~np.isnan(ages) & ~np.isinf(ages)
        lines.append(f"Total valid analyses: {np.sum(valid_mask)}")
        lines.append(f"Age range: {np.min(ages[valid_mask]):.1f} - {np.max(ages[valid_mask]):.1f} Ma")
        lines.append("")

    lines.append(f"Number of peaks detected: {len(peaks)}")
    lines.append("")

    for i, peak in enumerate(peaks):
        lines.append(f"Peak {i + 1}:")
        lines.append(f"  Center age: {peak.center:.1f} ± {peak.sigma:.1f} Ma (2σ)")
        lines.append(f"  Age range: {peak.age_range[0]:.1f} - {peak.age_range[1]:.1f} Ma")
        lines.append(f"  Number of analyses: {peak.n_points}")
        lines.append(f"  Mean age in peak: {peak.mean_age:.1f} Ma")
        lines.append(f"  Median age in peak: {peak.median_age:.1f} Ma")
        if sigmas is not None:
            valid_mask = ~np.isnan(ages) & ~np.isinf(ages)
            peak_mask = np.abs(ages[valid_mask] - peak.center) < 2.0 * peak.sigma
            if np.any(peak_mask) and sigmas is not None:
                mean_sigma = np.mean(sigmas[valid_mask][peak_mask])
                lines.append(f"  Mean 2σ uncertainty: {mean_sigma:.1f} Ma")
        lines.append("")

    lines.append("=" * 70)
    return "\n".join(lines)
