"""
年龄计算模块
实现锆石U-Pb定年中核心年龄计算算法
包括：单点年龄、和谐年龄（TuffZirc算法）、加权平均年龄（Isoplot算法）、MSWD
"""

import numpy as np
from scipy.optimize import brentq, minimize
from scipy.stats import chi2
from dataclasses import dataclass
from typing import Tuple, Optional, List


LAMBDA238 = 1.55125e-10
LAMBDA235 = 9.8485e-10
U238_U235 = 137.88


@dataclass
class AgeResult:
    """年龄计算结果容器"""
    age: float
    age_2sigma: float
    mswd: float
    probability: float
    n_used: int
    n_rejected: int = 0
    method: str = ""
    details: dict = None


def age_206Pb_238U(r68: float, s68: float) -> Tuple[float, float]:
    """
    由 206Pb/238U 比值计算年龄

    参数:
        r68: 206Pb/238U 比值
        s68: 206Pb/238U 1σ 标准偏差

    返回:
        (年龄(Ma), 2σ误差(Ma))
    """
    t = np.log(1.0 + r68) / LAMBDA238 / 1e6
    dt = s68 / (LAMBDA238 * (1.0 + r68)) / 1e6
    return t, 2.0 * dt


def age_207Pb_235U(r75: float, s75: float) -> Tuple[float, float]:
    """
    由 207Pb/235U 比值计算年龄

    参数:
        r75: 207Pb/235U 比值
        s75: 207Pb/235U 1σ 标准偏差

    返回:
        (年龄(Ma), 2σ误差(Ma))
    """
    t = np.log(1.0 + r75) / LAMBDA235 / 1e6
    dt = s75 / (LAMBDA235 * (1.0 + r75)) / 1e6
    return t, 2.0 * dt


def age_207Pb_206Pb(r76: float, s76: float) -> Tuple[float, float]:
    """
    由 207Pb/206Pb 比值计算年龄

    参数:
        r76: 207Pb/206Pb 比值
        s76: 207Pb/206Pb 1σ 标准偏差

    返回:
        (年龄(Ma), 2σ误差(Ma))
    """
    if r76 <= 0 or r76 > 100:
        return np.nan, np.nan

    def _f(t):
        return r76 * U238_U235 * (np.exp(LAMBDA238 * t * 1e6) - 1.0) - \
               (np.exp(LAMBDA235 * t * 1e6) - 1.0)

    def _fprime(t):
        return r76 * U238_U235 * LAMBDA238 * 1e6 * np.exp(LAMBDA238 * t * 1e6) - \
               LAMBDA235 * 1e6 * np.exp(LAMBDA235 * t * 1e6)

    try:
        from scipy.optimize import brenth, newton

        f_lo = _f(1.0)
        f_hi = _f(4500.0)

        if f_lo * f_hi < 0:
            t = brenth(_f, 1.0, 4500.0, xtol=1e-6)
        else:
            r75_approx = r76 * U238_U235
            t_guess = max(1.0, np.log(1.0 + r75_approx) / LAMBDA235 / 1e6)
            t = newton(_f, t_guess, fprime=_fprime, tol=1e-8, maxiter=100)

        if t < 1.0 or t > 4500.0:
            return np.nan, np.nan

        dt = s76 * np.abs(U238_U235 * (np.exp(LAMBDA238 * t * 1e6) - 1.0)) / \
             np.abs(_fprime(t)) * 1e6

        max_reasonable_error = max(t * 0.5, 10.0)
        dt = min(dt, max_reasonable_error)

        return t, 2.0 * max(dt, 0.1)

    except Exception:
        return np.nan, np.nan


def concordia_ratios(t_ma: float) -> Tuple[float, float]:
    """
    给定年龄，计算和谐曲线上的比值

    参数:
        t_ma: 年龄 (Ma)

    返回:
        (207Pb/235U, 206Pb/238U)
    """
    t = t_ma * 1e6
    r75 = np.exp(LAMBDA235 * t) - 1.0
    r68 = np.exp(LAMBDA238 * t) - 1.0
    return r75, r68


def concordia_age_tuffzirc(
    r68: np.ndarray,
    s68: np.ndarray,
    r75: np.ndarray,
    s75: np.ndarray,
    rho: np.ndarray,
    t_min: float = 1.0,
    t_max: float = 4500.0,
) -> AgeResult:
    """
    TuffZirc 和谐年龄算法
    寻找使MSWD最小的和谐年龄

    参数:
        r68: 206Pb/238U 比值数组
        s68: 206Pb/238U 1σ 数组
        r75: 207Pb/235U 比值数组
        s75: 207Pb/235U 1σ 数组
        rho: r68与r75误差相关系数
        t_min: 年龄下限 (Ma)
        t_max: 年龄上限 (Ma)

    返回:
        AgeResult
    """
    def _mswd(t):
        r75c, r68c = concordia_ratios(t)
        diff_68 = r68 - r68c
        diff_75 = r75 - r75c

        mswd_sum = 0.0
        for i in range(len(r68)):
            cov = rho[i] * s68[i] * s75[i]
            inv_det = 1.0 / (s68[i] ** 2 * s75[i] ** 2 - cov ** 2)
            mswd_sum += (
                inv_det * s75[i] ** 2 * diff_68[i] ** 2
                + inv_det * s68[i] ** 2 * diff_75[i] ** 2
                - 2.0 * inv_det * cov * diff_68[i] * diff_75[i]
            )
        return mswd_sum / max(1, 2 * len(r68) - 1)

    def _mswd_negative(t):
        return -_mswd(t)

    res = minimize(
        _mswd,
        x0=age_206Pb_238U(np.mean(r68), 0)[0],
        method="Nelder-Mead",
        bounds=[(t_min, t_max)],
    )

    t_best = res.x[0]
    mswd_val = _mswd(t_best)

    try:
        lo = t_min
        hi = t_max
        f_lo = _mswd(lo)
        f_hi = _mswd(hi)
        if f_lo > mswd_val + 1:
            for test_t in np.linspace(lo, t_best, 200):
                if _mswd(test_t) >= mswd_val + 1:
                    lo = test_t
                    break
        if f_hi > mswd_val + 1:
            for test_t in np.linspace(t_best, hi, 200):
                if _mswd(test_t) >= mswd_val + 1:
                    hi = test_t
                    break
        age_2sigma = (hi - lo) / 2.0
    except Exception:
        age_2sigma = t_best * 0.02

    dof = max(1, 2 * len(r68) - 1)
    prob = 1.0 - chi2.cdf(mswd_val * dof, dof)

    return AgeResult(
        age=t_best,
        age_2sigma=age_2sigma,
        mswd=mswd_val,
        probability=prob,
        n_used=len(r68),
        method="TuffZirc",
    )


def concordia_age_intercept(
    r68: np.ndarray,
    s68: np.ndarray,
    r75: np.ndarray,
    s75: np.ndarray,
    rho: np.ndarray,
    t_min: float = 1.0,
    t_max: float = 4500.0,
) -> AgeResult:
    """
    和谐曲线截距法和谐年龄
    基于数据点到和谐线的正交距离最小化
    使用网格搜索+多起点全局优化避免局部最小值

    参数:
        r68: 206Pb/238U 比值数组
        s68: 206Pb/238U 1σ 数组
        r75: 207Pb/235U 比值数组
        s75: 207Pb/235U 1σ 数组
        rho: r68与r75误差相关系数
        t_min: 年龄下限 (Ma)
        t_max: 年龄上限 (Ma)

    返回:
        AgeResult
    """
    def _f(t):
        r75c, r68c = concordia_ratios(t)
        total = 0.0
        for i in range(len(r68)):
            cov = rho[i] * s68[i] * s75[i]
            det = s68[i] ** 2 * s75[i] ** 2 - cov ** 2
            if det <= 0:
                det = 1e-12
            inv_det = 1.0 / det
            d68 = r68[i] - r68c
            d75 = r75[i] - r75c
            total += (
                inv_det * s75[i] ** 2 * d68 ** 2
                + inv_det * s68[i] ** 2 * d75 ** 2
                - 2.0 * inv_det * cov * d68 * d75
            )
        return total

    t_ages_68 = np.array([age_206Pb_238U(r, s)[0] for r, s in zip(r68, s68)])
    t_ages_75 = np.array([age_207Pb_235U(r, s)[0] for r, s in zip(r75, s75)])

    grid_search_points = np.unique(np.concatenate([
        t_ages_68,
        t_ages_75,
        np.linspace(t_min, t_max, 100),
        [np.median(t_ages_68), np.median(t_ages_75)],
        [np.mean(t_ages_68), np.mean(t_ages_75)],
    ]))
    grid_search_points = grid_search_points[(grid_search_points >= t_min) & (grid_search_points <= t_max)]

    grid_results = []
    for t_test in grid_search_points:
        grid_results.append((t_test, _f(t_test)))

    grid_results.sort(key=lambda x: x[1])
    best_grid_t, best_grid_val = grid_results[0]

    best_t = best_grid_t
    best_val = best_grid_val

    candidates = [best_grid_t]
    candidates.extend([t for t, _ in grid_results[:20]])
    candidates.extend([
        np.median(t_ages_68),
        np.median(t_ages_75),
        np.mean(t_ages_68),
        np.mean(t_ages_75),
    ])

    for x0 in np.unique(candidates):
        if x0 < t_min or x0 > t_max:
            continue
        try:
            res = minimize(
                _f,
                x0=x0,
                method="L-BFGS-B",
                bounds=[(t_min, t_max)],
                options={"ftol": 1e-15, "gtol": 1e-12, "maxiter": 2000},
            )
            if res.fun < best_val:
                best_val = res.fun
                best_t = res.x[0]
        except Exception:
            continue

    try:
        from scipy.optimize import dual_annealing
        da_result = dual_annealing(
            _f,
            bounds=[(t_min, t_max)],
            maxiter=1000,
            seed=42,
            initial_temp=5230.0,
            restart_temp_ratio=2e-05,
        )
        if da_result.fun < best_val:
            best_val = da_result.fun
            best_t = da_result.x[0]
    except Exception:
        pass

    try:
        from scipy.optimize import differential_evolution
        de_result = differential_evolution(
            _f,
            bounds=[(t_min, t_max)],
            maxiter=2000,
            tol=1e-15,
            popsize=50,
            mutation=(0.3, 1.5),
            recombination=0.8,
            seed=42,
            polish=True,
            workers=1,
        )
        if de_result.fun < best_val:
            best_val = de_result.fun
            best_t = de_result.x[0]
    except Exception:
        pass

    t_best = best_t
    mswd_val = best_val / max(1, 2 * len(r68) - 1)

    try:
        f_best = _f(t_best)
        f_target = f_best + 1.0

        lo_candidates = []
        for test_t in np.linspace(t_min, t_best, 500):
            if _f(test_t) >= f_target:
                lo_candidates.append(test_t)
                break
        if not lo_candidates:
            lo_candidates = [t_min]

        hi_candidates = []
        for test_t in np.linspace(t_best, t_max, 500):
            if _f(test_t) >= f_target:
                hi_candidates.append(test_t)
                break
        if not hi_candidates:
            hi_candidates = [t_max]

        age_2sigma = max((hi_candidates[0] - lo_candidates[0]) / 2.0, 0.1)
    except Exception:
        age_2sigma = max(2.0 * np.std(t_ages_68), 1.0)

    dof = max(1, 2 * len(r68) - 1)
    prob = 1.0 - chi2.cdf(mswd_val * dof, dof)

    return AgeResult(
        age=t_best,
        age_2sigma=age_2sigma,
        mswd=mswd_val,
        probability=prob,
        n_used=len(r68),
        method="Intercept_GlobalOpt",
    )


def weighted_mean_age_isoplot(
    ages: np.ndarray,
    sigmas: np.ndarray,
    outlier_rejection: bool = True,
    threshold: float = 2.5,
) -> AgeResult:
    """
    Isoplot算法加权平均年龄

    参数:
        ages: 单点年龄数组 (Ma)
        sigmas: 单点年龄1σ误差数组 (Ma)
        outlier_rejection: 是否启用离群值剔除
        threshold: 离群值剔除阈值 (标准偏差倍数)

    返回:
        AgeResult
    """
    ages = np.asarray(ages, dtype=float)
    sigmas = np.asarray(sigmas, dtype=float)

    mask = np.ones(len(ages), dtype=bool)
    n_total = len(ages)

    for iteration in range(20):
        w = 1.0 / sigmas[mask] ** 2
        w_sum = np.sum(w)
        if w_sum <= 0:
            break

        t_mean = np.sum(w * ages[mask]) / w_sum
        s_mean = np.sqrt(1.0 / w_sum)

        mswd = np.sum(w * (ages[mask] - t_mean) ** 2) / max(1, np.sum(mask) - 1)

        if not outlier_rejection or np.sum(mask) <= 2:
            break

        residuals = np.abs(ages - t_mean) / sigmas
        max_residual_idx = np.argmax(residuals)

        if residuals[max_residual_idx] > threshold and mask[max_residual_idx]:
            mask[max_residual_idx] = False
        else:
            break

    n_used = np.sum(mask)
    n_rejected = n_total - n_used

    w = 1.0 / sigmas[mask] ** 2
    w_sum = np.sum(w)
    t_mean = np.sum(w * ages[mask]) / w_sum
    s_mean = np.sqrt(1.0 / w_sum)
    mswd = np.sum(w * (ages[mask] - t_mean) ** 2) / max(1, n_used - 1)

    dof = max(1, n_used - 1)
    prob = 1.0 - chi2.cdf(mswd * dof, dof)

    return AgeResult(
        age=t_mean,
        age_2sigma=2.0 * s_mean,
        mswd=mswd,
        probability=prob,
        n_used=n_used,
        n_rejected=n_rejected,
        method="Isoplot",
        details={"used_indices": np.where(mask)[0].tolist()},
    )


def compute_individual_ages(
    r68: np.ndarray,
    s68: np.ndarray,
    r75: np.ndarray,
    s75: np.ndarray,
    r76: np.ndarray = None,
    s76: np.ndarray = None,
) -> dict:
    """
    计算所有单点年龄

    参数:
        r68: 206Pb/238U 比值数组
        s68: 206Pb/238U 1σ 数组
        r75: 207Pb/235U 比值数组
        s75: 207Pb/235U 1σ 数组
        r76: 207Pb/206Pb 比值数组 (可选)
        s76: 207Pb/206Pb 1σ 数组 (可选)

    返回:
        dict 包含各年龄体系结果
    """
    results = {}

    t68, dt68 = [], []
    for r, s in zip(r68, s68):
        t, dt = age_206Pb_238U(r, s)
        t68.append(t)
        dt68.append(dt)

    results["206Pb/238U"] = {
        "ages": np.array(t68),
        "2sigma": np.array(dt68),
    }

    t75, dt75 = [], []
    for r, s in zip(r75, s75):
        t, dt = age_207Pb_235U(r, s)
        t75.append(t)
        dt75.append(dt)

    results["207Pb/235U"] = {
        "ages": np.array(t75),
        "2sigma": np.array(dt75),
    }

    if r76 is not None and s76 is not None:
        t76, dt76 = [], []
        for r, s in zip(r76, s76):
            try:
                t, dt = age_207Pb_206Pb(r, s)
                t76.append(t)
                dt76.append(dt)
            except Exception:
                t76.append(np.nan)
                dt76.append(np.nan)

        results["207Pb/206Pb"] = {
            "ages": np.array(t76),
            "2sigma": np.array(dt76),
        }

    concordance = []
    for t68i, t75i in zip(t68, t75):
        if t75i > 0:
            concordance.append(t68i / t75i * 100.0)
        else:
            concordance.append(np.nan)

    results["concordance"] = np.array(concordance)

    return results


def discordance_filter(
    ages_dict: dict,
    min_concordance: float = 90.0,
    max_concordance: float = 110.0,
) -> np.ndarray:
    """
    谐和度过滤器

    参数:
        ages_dict: compute_individual_ages 的返回值
        min_concordance: 最小谐和度 (%)
        max_concordance: 最大谐和度 (%)

    返回:
        布尔掩码数组
    """
    conc = ages_dict.get("concordance", np.array([]))
    mask = (conc >= min_concordance) & (conc <= max_concordance)
    return mask
