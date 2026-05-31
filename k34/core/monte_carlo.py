"""
蒙特卡洛模拟模块
评估年龄不确定性，通过模拟误差传播计算年龄分布
"""

import numpy as np
from dataclasses import dataclass, field
from typing import Tuple, Optional, List
from scipy.stats import multivariate_normal, norm

from .age_calculator import (
    age_206Pb_238U,
    age_207Pb_235U,
    age_207Pb_206Pb,
    concordia_ratios,
    LAMBDA238,
    LAMBDA235,
    U238_U235,
    AgeResult,
    weighted_mean_age_isoplot,
)


@dataclass
class MonteCarloResult:
    """蒙特卡洛模拟结果"""
    ages_206Pb_238U: np.ndarray = field(default_factory=lambda: np.array([]))
    ages_207Pb_235U: np.ndarray = field(default_factory=lambda: np.array([]))
    ages_207Pb_206Pb: np.ndarray = field(default_factory=lambda: np.array([]))
    concordia_ages: np.ndarray = field(default_factory=lambda: np.array([]))
    weighted_mean_ages: np.ndarray = field(default_factory=lambda: np.array([]))
    n_simulations: int = 0
    summary: dict = field(default_factory=dict)


def simulate_ratio_uncertainties(
    r68: np.ndarray,
    s68: np.ndarray,
    r75: np.ndarray,
    s75: np.ndarray,
    rho: np.ndarray,
    n_simulations: int = 10000,
    random_state: int = 42,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    模拟同位素比值的不确定性
    使用多元正态分布生成模拟比值

    参数:
        r68: 206Pb/238U 比值数组
        s68: 206Pb/238U 1σ 数组
        r75: 207Pb/235U 比值数组
        s75: 207Pb/235U 1σ 数组
        rho: r68与r75误差相关系数
        n_simulations: 模拟次数
        random_state: 随机种子

    返回:
        (模拟r68数组 [n, n_sim], 模拟r75数组 [n, n_sim])
    """
    rng = np.random.RandomState(random_state)
    n = len(r68)

    sim_r68 = np.zeros((n, n_simulations))
    sim_r75 = np.zeros((n, n_simulations))

    for i in range(n):
        mean = np.array([r68[i], r75[i]])
        cov = np.array([
            [s68[i] ** 2, rho[i] * s68[i] * s75[i]],
            [rho[i] * s68[i] * s75[i], s75[i] ** 2],
        ])

        try:
            samples = rng.multivariate_normal(mean, cov, size=n_simulations)
            sim_r68[i, :] = np.maximum(samples[:, 0], 1e-10)
            sim_r75[i, :] = np.maximum(samples[:, 1], 1e-10)
        except np.linalg.LinAlgError:
            sim_r68[i, :] = np.maximum(
                rng.normal(r68[i], s68[i], n_simulations), 1e-10
            )
            sim_r75[i, :] = np.maximum(
                rng.normal(r75[i], s75[i], n_simulations), 1e-10
            )

    return sim_r68, sim_r75


def monte_carlo_age_uncertainty(
    r68: np.ndarray,
    s68: np.ndarray,
    r75: np.ndarray,
    s75: np.ndarray,
    rho: np.ndarray,
    r76: np.ndarray = None,
    s76: np.ndarray = None,
    n_simulations: int = 10000,
    random_state: int = 42,
) -> MonteCarloResult:
    """
    蒙特卡洛模拟年龄不确定性

    参数:
        r68: 206Pb/238U 比值数组
        s68: 206Pb/238U 1σ 数组
        r75: 207Pb/235U 比值数组
        s75: 207Pb/235U 1σ 数组
        rho: r68与r75误差相关系数
        r76: 207Pb/206Pb 比值数组 (可选)
        s76: 207Pb/206Pb 1σ 数组 (可选)
        n_simulations: 模拟次数
        random_state: 随机种子

    返回:
        MonteCarloResult
    """
    sim_r68, sim_r75 = simulate_ratio_uncertainties(
        r68, s68, r75, s75, rho, n_simulations, random_state
    )

    n = len(r68)
    ages_68 = np.zeros((n, n_simulations))
    ages_75 = np.zeros((n, n_simulations))

    for i in range(n):
        for j in range(n_simulations):
            t68, _ = age_206Pb_238U(sim_r68[i, j], 0)
            t75, _ = age_207Pb_235U(sim_r75[i, j], 0)
            ages_68[i, j] = t68
            ages_75[i, j] = t75

    ages_76 = np.array([])
    if r76 is not None and s76 is not None:
        rng = np.random.RandomState(random_state + 1)
        ages_76 = np.zeros((len(r76), n_simulations))
        for i in range(len(r76)):
            sim_r76 = np.maximum(
                rng.normal(r76[i], s76[i], n_simulations), 1e-10
            )
            for j in range(n_simulations):
                try:
                    t76, _ = age_207Pb_206Pb(sim_r76[j], 0)
                    ages_76[i, j] = t76
                except Exception:
                    ages_76[i, j] = np.nan

    concordia_ages = np.zeros(n_simulations)
    for j in range(n_simulations):
        try:
            from .age_calculator import concordia_age_tuffzirc
            result = concordia_age_tuffzirc(
                sim_r68[:, j], np.ones(n) * 0.001,
                sim_r75[:, j], np.ones(n) * 0.001,
                np.zeros(n),
            )
            concordia_ages[j] = result.age
        except Exception:
            concordia_ages[j] = np.nan

    weighted_means = np.zeros(n_simulations)
    for j in range(n_simulations):
        try:
            ages_list = []
            sigmas_list = []
            for i in range(n):
                ages_list.append(ages_68[i, j])
                sigmas_list.append(5.0)
            result = weighted_mean_age_isoplot(
                np.array(ages_list), np.array(sigmas_list), outlier_rejection=False
            )
            weighted_means[j] = result.age
        except Exception:
            weighted_means[j] = np.nan

    summary = {}
    valid_68 = ages_68[~np.isnan(ages_68)]
    if len(valid_68) > 0:
        summary["206Pb/238U"] = {
            "mean": np.mean(valid_68),
            "median": np.median(valid_68),
            "std": np.std(valid_68),
            "ci_95": (np.percentile(valid_68, 2.5), np.percentile(valid_68, 97.5)),
        }

    valid_75 = ages_75[~np.isnan(ages_75)]
    if len(valid_75) > 0:
        summary["207Pb/235U"] = {
            "mean": np.mean(valid_75),
            "median": np.median(valid_75),
            "std": np.std(valid_75),
            "ci_95": (np.percentile(valid_75, 2.5), np.percentile(valid_75, 97.5)),
        }

    valid_conc = concordia_ages[~np.isnan(concordia_ages)]
    if len(valid_conc) > 0:
        summary["concordia"] = {
            "mean": np.mean(valid_conc),
            "median": np.median(valid_conc),
            "std": np.std(valid_conc),
            "ci_95": (np.percentile(valid_conc, 2.5), np.percentile(valid_conc, 97.5)),
        }

    valid_wm = weighted_means[~np.isnan(weighted_means)]
    if len(valid_wm) > 0:
        summary["weighted_mean"] = {
            "mean": np.mean(valid_wm),
            "median": np.median(valid_wm),
            "std": np.std(valid_wm),
            "ci_95": (np.percentile(valid_wm, 2.5), np.percentile(valid_wm, 97.5)),
        }

    return MonteCarloResult(
        ages_206Pb_238U=ages_68,
        ages_207Pb_235U=ages_75,
        ages_207Pb_206Pb=ages_76,
        concordia_ages=concordia_ages,
        weighted_mean_ages=weighted_means,
        n_simulations=n_simulations,
        summary=summary,
    )


def monte_carlo_summary(mc_result: MonteCarloResult) -> str:
    """
    生成蒙特卡洛模拟摘要

    参数:
        mc_result: MonteCarloResult

    返回:
        格式化摘要字符串
    """
    lines = []
    lines.append("=" * 70)
    lines.append("Monte Carlo Uncertainty Analysis")
    lines.append(f"Number of simulations: {mc_result.n_simulations}")
    lines.append("=" * 70)

    for key, stats in mc_result.summary.items():
        lines.append(f"\n{key} age:")
        lines.append(f"  Mean: {stats['mean']:.2f} Ma")
        lines.append(f"  Median: {stats['median']:.2f} Ma")
        lines.append(f"  Std Dev: {stats['std']:.2f} Ma")
        lines.append(f"  95% CI: [{stats['ci_95'][0]:.2f}, {stats['ci_95'][1]:.2f}] Ma")

    lines.append("\n" + "=" * 70)
    return "\n".join(lines)


def plot_monte_carlo_results(
    mc_result: MonteCarloResult,
    output_dir: str,
    dpi: int = 300,
) -> List[str]:
    """
    绘制蒙特卡洛模拟结果图

    参数:
        mc_result: MonteCarloResult
        output_dir: 输出目录
        dpi: 输出DPI

    返回:
        生成的文件路径列表
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    output_files = []

    plot_configs = [
        ("206Pb/238U", mc_result.ages_206Pb_238U.flatten(),
         "206Pb/238U Age (Ma)", "mc_206Pb_238U.png"),
        ("207Pb/235U", mc_result.ages_207Pb_235U.flatten(),
         "207Pb/235U Age (Ma)", "mc_207Pb_235U.png"),
        ("Concordia", mc_result.concordia_ages,
         "Concordia Age (Ma)", "mc_concordia.png"),
        ("Weighted Mean", mc_result.weighted_mean_ages,
         "Weighted Mean Age (Ma)", "mc_weighted_mean.png"),
    ]

    for title, data, xlabel, filename in plot_configs:
        valid_data = data[~np.isnan(data)]
        if len(valid_data) == 0:
            continue

        fig, axes = plt.subplots(1, 2, figsize=(14, 5))

        axes[0].hist(valid_data, bins=50, density=True, alpha=0.7,
                     color="steelblue", edgecolor="white")
        axes[0].axvline(np.mean(valid_data), color="red", linestyle="--",
                        linewidth=2, label=f"Mean: {np.mean(valid_data):.1f}")
        axes[0].axvline(np.median(valid_data), color="green", linestyle="--",
                        linewidth=2, label=f"Median: {np.median(valid_data):.1f}")
        axes[0].set_xlabel(xlabel, fontsize=12)
        axes[0].set_ylabel("Density", fontsize=12)
        axes[0].set_title(f"{title} Age Distribution", fontsize=14)
        axes[0].legend(fontsize=10)
        axes[0].grid(True, alpha=0.3)

        sorted_data = np.sort(valid_data)
        cdf = np.arange(1, len(sorted_data) + 1) / len(sorted_data)
        axes[1].plot(sorted_data, cdf, "b-", linewidth=2)
        axes[1].axvline(np.percentile(valid_data, 2.5), color="orange",
                        linestyle="--", linewidth=1.5, label="2.5%")
        axes[1].axvline(np.percentile(valid_data, 97.5), color="orange",
                        linestyle="--", linewidth=1.5, label="97.5%")
        axes[1].set_xlabel(xlabel, fontsize=12)
        axes[1].set_ylabel("Cumulative Probability", fontsize=12)
        axes[1].set_title(f"{title} CDF", fontsize=14)
        axes[1].legend(fontsize=10)
        axes[1].grid(True, alpha=0.3)

        filepath = f"{output_dir}/{filename}"
        fig.savefig(filepath, dpi=dpi, bbox_inches="tight")
        plt.close(fig)
        output_files.append(filepath)

    return output_files
