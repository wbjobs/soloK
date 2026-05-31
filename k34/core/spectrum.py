"""
年龄谱分析模块
核密度估计(KDE)、年龄分布直方图、多峰分解算法
"""

import numpy as np
from scipy.stats import gaussian_kde
from scipy.signal import find_peaks
from sklearn.mixture import GaussianMixture
from dataclasses import dataclass
from typing import Tuple, List, Optional


@dataclass
class PeakResult:
    """峰值检测结果"""
    center: float
    sigma: float
    amplitude: float
    age_range: Tuple[float, float]
    n_points: int
    mean_age: float
    median_age: float


def compute_kde(
    ages: np.ndarray,
    bandwidth: float = None,
    n_points: int = 500,
    x_range: Tuple[float, float] = None,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    计算核密度估计

    参数:
        ages: 年龄数组
        bandwidth: 带宽参数 (None表示自动选择)
        n_points: 输出网格点数
        x_range: x轴范围

    返回:
        (x网格, KDE值)
    """
    valid_mask = ~np.isnan(ages) & ~np.isinf(ages)
    ages = ages[valid_mask]

    if len(ages) < 2:
        return np.array([]), np.array([])

    if x_range is None:
        x_range = (np.min(ages) * 0.95, np.max(ages) * 1.05)

    x_grid = np.linspace(x_range[0], x_range[1], n_points)

    try:
        if bandwidth is not None:
            kde = gaussian_kde(ages, bw_method=bandwidth)
        else:
            kde = gaussian_kde(ages)
        kde_values = kde(x_grid)
    except np.linalg.LinAlgError:
        return np.array([]), np.array([])

    return x_grid, kde_values


def detect_peaks_kde(
    ages: np.ndarray,
    min_distance: float = 50.0,
    min_prominence: float = 0.01,
    bandwidth: float = None,
) -> List[PeakResult]:
    """
    基于KDE的峰值检测

    参数:
        ages: 年龄数组
        min_distance: 峰之间最小距离 (Ma)
        min_prominence: 最小峰突出度
        bandwidth: KDE带宽

    返回:
        PeakResult 列表
    """
    valid_mask = ~np.isnan(ages) & ~np.isinf(ages)
    ages_valid = ages[valid_mask]

    if len(ages_valid) < 3:
        return []

    x_grid, kde_values = compute_kde(ages_valid, bandwidth=bandwidth)

    if len(kde_values) == 0:
        return []

    dx = x_grid[1] - x_grid[0]
    min_distance_samples = max(1, int(min_distance / dx))

    peaks, properties = find_peaks(
        kde_values,
        distance=min_distance_samples,
        prominence=min_prominence * np.max(kde_values),
    )

    results = []
    for peak_idx in peaks:
        peak_age = x_grid[peak_idx]
        peak_height = kde_values[peak_idx]

        half_max = peak_height / 2.0
        left_idx = peak_idx
        while left_idx > 0 and kde_values[left_idx] > half_max:
            left_idx -= 1
        right_idx = peak_idx
        while right_idx < len(kde_values) - 1 and kde_values[right_idx] > half_max:
            right_idx += 1

        fwhm = (x_grid[right_idx] - x_grid[left_idx]) / 2.355
        sigma = fwhm

        peak_mask = np.abs(ages_valid - peak_age) < 2.0 * sigma
        n_pts = np.sum(peak_mask)

        if n_pts > 0:
            results.append(
                PeakResult(
                    center=peak_age,
                    sigma=sigma,
                    amplitude=peak_height,
                    age_range=(x_grid[left_idx], x_grid[right_idx]),
                    n_points=n_pts,
                    mean_age=np.mean(ages_valid[peak_mask]),
                    median_age=np.median(ages_valid[peak_mask]),
                )
            )

    return sorted(results, key=lambda x: x.center)


def gaussian_mixture_decomposition(
    ages: np.ndarray,
    sigmas: np.ndarray = None,
    max_components: int = 5,
    random_state: int = 42,
    n_init: int = 20,
) -> Tuple[GaussianMixture, List[PeakResult]]:
    """
    基于高斯混合模型(GMM)的多峰分解

    参数:
        ages: 年龄数组
        sigmas: 年龄误差数组 (用于加权)
        max_components: 最大组分数
        random_state: 随机种子
        n_init: 初始化次数
        use_aic: 是否使用AIC进行模型选择 (否则使用BIC)

    返回:
        (GMM模型, PeakResult列表)
    """
    valid_mask = ~np.isnan(ages) & ~np.isinf(ages)
    ages_valid = ages[valid_mask].reshape(-1, 1)

    if sigmas is not None:
        sigmas_valid = sigmas[valid_mask]
        sample_weight = 1.0 / (sigmas_valid ** 2 + 1e-10)
        sample_weight = sample_weight / np.sum(sample_weight) * len(sample_weight)
    else:
        sample_weight = None

    if len(ages_valid) < 3:
        return None, []

    best_gmm = None
    best_bic = np.inf
    best_n = 1

    for n_components in range(1, min(max_components, len(ages_valid) // 2) + 1):
        try:
            gmm = GaussianMixture(
                n_components=n_components,
                covariance_type="full",
                random_state=random_state,
                n_init=n_init,
                reg_covar=1e-4,
                tol=1e-4,
                max_iter=200,
            )

            if sample_weight is not None and n_components > 1:
                gmm.fit(ages_valid, sample_weight=sample_weight)
            else:
                gmm.fit(ages_valid)

            bic = gmm.bic(ages_valid)
            if bic < best_bic:
                best_bic = bic
                best_gmm = gmm
                best_n = n_components
        except Exception:
            continue

    if best_gmm is None:
        return None, []

    results = []
    for i in range(best_gmm.n_components):
        mean = best_gmm.means_[i][0]
        var = best_gmm.covariances_[i][0][0]
        sigma = np.sqrt(max(var, 1.0))
        weight = best_gmm.weights_[i]

        peak_mask = np.abs(ages_valid.flatten() - mean) < 2.0 * sigma
        n_pts = np.sum(peak_mask)

        results.append(
            PeakResult(
                center=mean,
                sigma=sigma,
                amplitude=weight,
                age_range=(mean - 2.0 * sigma, mean + 2.0 * sigma),
                n_points=n_pts,
                mean_age=mean,
                median_age=np.median(ages_valid[peak_mask]) if n_pts > 0 else mean,
            )
        )

    return best_gmm, sorted(results, key=lambda x: x.center)


def classify_age_groups(
    ages: np.ndarray,
    peaks: List[PeakResult],
    sigma_threshold: float = 2.0,
) -> np.ndarray:
    """
    根据检测到的峰对年龄进行分组

    参数:
        ages: 年龄数组
        peaks: PeakResult列表
        sigma_threshold: 分组阈值 (标准偏差倍数)

    返回:
        分组标签数组 (-1表示未分组)
    """
    labels = np.full(len(ages), -1, dtype=int)

    for i, age in enumerate(ages):
        for j, peak in enumerate(peaks):
            if np.abs(age - peak.center) <= sigma_threshold * peak.sigma:
                if labels[i] == -1:
                    labels[i] = j
                else:
                    dist_current = np.abs(age - peaks[labels[i]].center)
                    dist_new = np.abs(age - peak.center)
                    if dist_new < dist_current:
                        labels[i] = j

    return labels


def compute_kde_components(
    ages: np.ndarray,
    gmm: GaussianMixture,
    n_points: int = 500,
    x_range: Tuple[float, float] = None,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    计算GMM各组分的KDE曲线

    参数:
        ages: 年龄数组
        gmm: 拟合好的GMM模型
        n_points: 网格点数
        x_range: x轴范围

    返回:
        (x网格, 总KDE, 各组分KDE矩阵)
    """
    if gmm is None:
        return np.array([]), np.array([]), np.array([])

    valid_mask = ~np.isnan(ages) & ~np.isinf(ages)
    ages_valid = ages[valid_mask]

    if x_range is None:
        x_range = (np.min(ages_valid) * 0.95, np.max(ages_valid) * 1.05)

    x_grid = np.linspace(x_range[0], x_range[1], n_points)

    component_curves = np.zeros((gmm.n_components, n_points))

    for i in range(gmm.n_components):
        mean = gmm.means_[i][0]
        var = gmm.covariances_[i][0][0]
        weight = gmm.weights_[i]
        sigma = np.sqrt(max(var, 1.0))

        component_curves[i] = weight * np.exp(
            -0.5 * ((x_grid - mean) / sigma) ** 2
        ) / (sigma * np.sqrt(2 * np.pi))

    total_kde = np.sum(component_curves, axis=0)

    return x_grid, total_kde, component_curves
