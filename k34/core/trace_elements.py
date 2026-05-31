"""
微量元素示踪模块
实现锆石成因类型判别（岩浆/热液/变质）
基于微量元素比值（U/Yb, Th/U, Ce异常等）
"""

import numpy as np
from dataclasses import dataclass, field
from typing import List, Tuple, Optional, Dict
from enum import Enum


class ZirconOrigin(Enum):
    """锆石成因类型"""
    MAGMATIC = "岩浆锆石"
    HYDROTHERMAL = "热液锆石"
    METAMORPHIC = "变质锆石"
    UNCERTAIN = "成因不明"


@dataclass
class TraceElementData:
    """微量元素数据容器"""
    U_ppm: Optional[np.ndarray] = None
    Yb_ppm: Optional[np.ndarray] = None
    Th_ppm: Optional[np.ndarray] = None
    Ce_ppm: Optional[np.ndarray] = None
    La_ppm: Optional[np.ndarray] = None
    Pr_ppm: Optional[np.ndarray] = None
    Nd_ppm: Optional[np.ndarray] = None
    Sm_ppm: Optional[np.ndarray] = None
    Gd_ppm: Optional[np.ndarray] = None
    Lu_ppm: Optional[np.ndarray] = None
    Y_ppm: Optional[np.ndarray] = None
    Hf_ppm: Optional[np.ndarray] = None
    Ti_ppm: Optional[np.ndarray] = None
    Nb_ppm: Optional[np.ndarray] = None
    Ta_ppm: Optional[np.ndarray] = None


@dataclass
class TraceElementRatios:
    """微量元素比值"""
    U_Yb: np.ndarray
    Th_U: np.ndarray
    Ce_Ce_star: np.ndarray
    Eu_Eu_star: np.ndarray
    Yb_Sm: np.ndarray
    Lu_Gd: np.ndarray
    U_Th: np.ndarray
    Hf_U: np.ndarray
    Ti_in_zircon_temp: Optional[np.ndarray] = None


@dataclass
class OriginClassification:
    """成因分类结果"""
    origin: List[ZirconOrigin]
    probabilities: Dict[str, np.ndarray]
    scores: np.ndarray
    key_ratios: TraceElementRatios
    details: List[Dict]

    def origin_array(self) -> np.ndarray:
        return np.array([o.value for o in self.origin])


def compute_trace_element_ratios(
    trace_data: TraceElementData,
) -> TraceElementRatios:
    """
    计算微量元素比值

    参数:
        trace_data: 微量元素数据

    返回:
        TraceElementRatios 对象
    """
    n = len(trace_data.U_ppm) if trace_data.U_ppm is not None else 0

    def safe_divide(a, b):
        if a is None or b is None:
            return np.full(n, np.nan)
        b_safe = np.where(b == 0, np.nan, b)
        return np.where(np.isnan(b_safe), np.nan, a / b_safe)

    U_Yb = safe_divide(trace_data.U_ppm, trace_data.Yb_ppm)
    Th_U = safe_divide(trace_data.Th_ppm, trace_data.U_ppm)
    U_Th = safe_divide(trace_data.U_ppm, trace_data.Th_ppm)
    Hf_U = safe_divide(trace_data.Hf_ppm, trace_data.U_ppm)
    Yb_Sm = safe_divide(trace_data.Yb_ppm, trace_data.Sm_ppm)
    Lu_Gd = safe_divide(trace_data.Lu_ppm, trace_data.Gd_ppm)

    Ce_Ce_star = np.full(n, np.nan)
    if (trace_data.Ce_ppm is not None and
        trace_data.La_ppm is not None and
        trace_data.Pr_ppm is not None):
        La_safe = np.where(trace_data.La_ppm <= 0, np.nan, trace_data.La_ppm)
        Pr_safe = np.where(trace_data.Pr_ppm <= 0, np.nan, trace_data.Pr_ppm)
        Ce_star = np.sqrt(La_safe * Pr_safe)
        Ce_Ce_star = np.where(Ce_star > 0, trace_data.Ce_ppm / Ce_star, np.nan)

    Eu_Eu_star = np.full(n, np.nan)
    if (trace_data.Sm_ppm is not None and
        trace_data.Gd_ppm is not None):
        Sm_safe = np.where(trace_data.Sm_ppm <= 0, np.nan, trace_data.Sm_ppm)
        Gd_safe = np.where(trace_data.Gd_ppm <= 0, np.nan, trace_data.Gd_ppm)
        Eu_star = np.sqrt(Sm_safe * Gd_safe)
        Eu_Eu_star = np.where(Eu_star > 0, Eu_star / Eu_star, np.nan)

    Ti_temp = None
    if trace_data.Ti_ppm is not None:
        Ti_safe = np.where(trace_data.Ti_ppm <= 0, np.nan, trace_data.Ti_ppm)
        Ti_temp = 5000.0 / (6.011 - np.log10(Ti_safe)) - 273.15

    return TraceElementRatios(
        U_Yb=U_Yb,
        Th_U=Th_U,
        Ce_Ce_star=Ce_Ce_star,
        Eu_Eu_star=Eu_Eu_star,
        Yb_Sm=Yb_Sm,
        Lu_Gd=Lu_Gd,
        U_Th=U_Th,
        Hf_U=Hf_U,
        Ti_in_zircon_temp=Ti_temp,
    )


def classify_zircon_origin(
    ratios: TraceElementRatios,
) -> OriginClassification:
    """
    判别锆石成因类型
    基于多指标综合判别

    参数:
        ratios: 微量元素比值

    返回:
        OriginClassification 对象
    """
    n = len(ratios.U_Yb)
    origin = []
    details = []

    p_magmatic = np.zeros(n)
    p_hydrothermal = np.zeros(n)
    p_metamorphic = np.zeros(n)

    for i in range(n):
        scores = {}
        score_mag = 0.0
        score_hyd = 0.0
        score_met = 0.0
        n_criteria = 0

        if not np.isnan(ratios.Th_U[i]):
            n_criteria += 1
            if ratios.Th_U[i] > 0.5:
                score_mag += 1.0
            elif ratios.Th_U[i] < 0.1:
                score_met += 1.0
            if ratios.Th_U[i] < 0.3 and ratios.Th_U[i] > 0.01:
                score_hyd += 0.5

        if not np.isnan(ratios.U_Yb[i]):
            n_criteria += 1
            if ratios.U_Yb[i] < 100:
                score_mag += 1.0
            elif ratios.U_Yb[i] > 500:
                score_hyd += 1.0

        if not np.isnan(ratios.Ce_Ce_star[i]):
            n_criteria += 1
            if ratios.Ce_Ce_star[i] > 5:
                score_mag += 1.0
            elif ratios.Ce_Ce_star[i] < 2:
                score_hyd += 0.5
                score_met += 0.5

        if not np.isnan(ratios.Yb_Sm[i]):
            n_criteria += 1
            if ratios.Yb_Sm[i] > 50:
                score_mag += 0.5
            elif ratios.Yb_Sm[i] < 10:
                score_met += 1.0

        if not np.isnan(ratios.Lu_Gd[i]):
            n_criteria += 1
            if ratios.Lu_Gd[i] > 0.1:
                score_mag += 0.5
            elif ratios.Lu_Gd[i] < 0.01:
                score_met += 1.0

        if not np.isnan(ratios.Eu_Eu_star[i]):
            n_criteria += 1
            if ratios.Eu_Eu_star[i] < 0.5:
                score_mag += 0.5

        if not np.isnan(ratios.U_Th[i]):
            n_criteria += 1
            if ratios.U_Th[i] < 10:
                score_hyd += 1.0
            elif ratios.U_Th[i] > 50:
                score_met += 0.5

        if ratios.Ti_in_zircon_temp is not None and not np.isnan(ratios.Ti_in_zircon_temp[i]):
            n_criteria += 1
            if ratios.Ti_in_zircon_temp[i] > 700:
                score_mag += 0.5
            elif ratios.Ti_in_zircon_temp[i] < 600:
                score_hyd += 0.5

        if n_criteria > 0:
            score_mag = score_mag / n_criteria
            score_hyd = score_hyd / n_criteria
            score_met = score_met / n_criteria

        scores = {
            "magmatic": score_mag,
            "hydrothermal": score_hyd,
            "metamorphic": score_met,
        }

        p_magmatic[i] = score_mag
        p_hydrothermal[i] = score_hyd
        p_metamorphic[i] = score_met

        max_score = max(score_mag, score_hyd, score_met)

        if max_score < 0.25:
            origin.append(ZirconOrigin.UNCERTAIN)
            det = "成因不明：所有判别指标得分均较低"
        elif score_mag >= score_hyd and score_mag >= score_met and score_mag > 0.3:
            origin.append(ZirconOrigin.MAGMATIC)
            det = f"岩浆锆石：综合得分 {score_mag:.2f}"
        elif score_hyd >= score_mag and score_hyd >= score_met and score_hyd > 0.3:
            origin.append(ZirconOrigin.HYDROTHERMAL)
            det = f"热液锆石：综合得分 {score_hyd:.2f}"
        elif score_met >= score_mag and score_met >= score_hyd and score_met > 0.3:
            origin.append(ZirconOrigin.METAMORPHIC)
            det = f"变质锆石：综合得分 {score_met:.2f}"
        else:
            origin.append(ZirconOrigin.UNCERTAIN)
            det = "成因不明：多指标判别存在矛盾"

        details.append({"scores": scores, "determination": det})

    probabilities = {
        "magmatic": p_magmatic,
        "hydrothermal": p_hydrothermal,
        "metamorphic": p_metamorphic,
    }

    scores = np.max([p_magmatic, p_hydrothermal, p_metamorphic], axis=0)

    return OriginClassification(
        origin=origin,
        probabilities=probabilities,
        scores=scores,
        key_ratios=ratios,
        details=details,
    )


def plot_origin_discrimination(
    ratios: TraceElementRatios,
    classification: OriginClassification,
    output_path: str,
    figsize: Tuple[float, float] = (16, 12),
    dpi: int = 300,
) -> str:
    """
    绘制成因判别图解

    参数:
        ratios: 微量元素比值
        classification: 成因分类结果
        output_path: 输出文件路径
        figsize: 图像尺寸
        dpi: DPI

    返回:
        输出文件路径
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    origin_colors = {
        ZirconOrigin.MAGMATIC: "#ff7f0e",
        ZirconOrigin.HYDROTHERMAL: "#2ca02c",
        ZirconOrigin.METAMORPHIC: "#d62728",
        ZirconOrigin.UNCERTAIN: "#7f7f7f",
    }

    origin_markers = {
        ZirconOrigin.MAGMATIC: "o",
        ZirconOrigin.HYDROTHERMAL: "s",
        ZirconOrigin.METAMORPHIC: "^",
        ZirconOrigin.UNCERTAIN: "x",
    }

    fig = plt.figure(figsize=figsize)

    ax1 = plt.subplot(2, 3, 1)
    for orig in ZirconOrigin:
        mask = np.array([o == orig for o in classification.origin])
        if np.any(mask) and not all(np.isnan(ratios.Th_U[mask])):
            ax1.scatter(
                np.log10(np.maximum(ratios.Th_U[mask], 1e-3)),
                ratios.Ce_Ce_star[mask] if not all(np.isnan(ratios.Ce_Ce_star)) else np.zeros_like(ratios.Th_U[mask]),
                c=origin_colors[orig],
                marker=origin_markers[orig],
                label=orig.value,
                s=60,
                alpha=0.7,
                edgecolors="black",
                linewidths=0.5,
            )
    ax1.set_xlabel("log(Th/U)", fontsize=11)
    ax1.set_ylabel("Ce/Ce*", fontsize=11)
    ax1.set_title("Th/U vs Ce异常", fontsize=12)
    ax1.axvline(np.log10(0.1), color="gray", linestyle="--", alpha=0.5)
    ax1.axvline(np.log10(0.5), color="gray", linestyle="--", alpha=0.5)
    ax1.legend(fontsize=9)
    ax1.grid(True, alpha=0.3)

    ax2 = plt.subplot(2, 3, 2)
    for orig in ZirconOrigin:
        mask = np.array([o == orig for o in classification.origin])
        if np.any(mask):
            ax2.scatter(
                np.log10(np.maximum(ratios.U_Yb[mask], 1e-3)),
                np.log10(np.maximum(ratios.Yb_Sm[mask], 1e-3)),
                c=origin_colors[orig],
                marker=origin_markers[orig],
                label=orig.value,
                s=60,
                alpha=0.7,
                edgecolors="black",
                linewidths=0.5,
            )
    ax2.set_xlabel("log(U/Yb)", fontsize=11)
    ax2.set_ylabel("log(Yb/Sm)", fontsize=11)
    ax2.set_title("U/Yb vs Yb/Sm", fontsize=12)
    ax2.grid(True, alpha=0.3)

    ax3 = plt.subplot(2, 3, 3)
    for orig in ZirconOrigin:
        mask = np.array([o == orig for o in classification.origin])
        if np.any(mask):
            ax3.scatter(
                np.log10(np.maximum(ratios.Lu_Gd[mask], 1e-5)),
                np.log10(np.maximum(ratios.Th_U[mask], 1e-3)),
                c=origin_colors[orig],
                marker=origin_markers[orig],
                label=orig.value,
                s=60,
                alpha=0.7,
                edgecolors="black",
                linewidths=0.5,
            )
    ax3.set_xlabel("log(Lu/Gd)", fontsize=11)
    ax3.set_ylabel("log(Th/U)", fontsize=11)
    ax3.set_title("Lu/Gd vs Th/U", fontsize=12)
    ax3.grid(True, alpha=0.3)

    ax4 = plt.subplot(2, 3, 4)
    for orig in ZirconOrigin:
        mask = np.array([o == orig for o in classification.origin])
        if np.any(mask):
            ax4.scatter(
                np.log10(np.maximum(ratios.U_Th[mask], 1e-3)),
                np.log10(np.maximum(ratios.U_Yb[mask], 1e-3)),
                c=origin_colors[orig],
                marker=origin_markers[orig],
                label=orig.value,
                s=60,
                alpha=0.7,
                edgecolors="black",
                linewidths=0.5,
            )
    ax4.set_xlabel("log(U/Th)", fontsize=11)
    ax4.set_ylabel("log(U/Yb)", fontsize=11)
    ax4.set_title("U/Th vs U/Yb", fontsize=12)
    ax4.grid(True, alpha=0.3)

    ax5 = plt.subplot(2, 3, 5)
    origin_counts = {}
    for orig in classification.origin:
        origin_counts[orig] = origin_counts.get(orig, 0) + 1
    labels = [orig.value for orig in origin_counts.keys()]
    sizes = list(origin_counts.values())
    colors = [origin_colors[orig] for orig in origin_counts.keys()]
    ax5.pie(
        sizes,
        labels=labels,
        colors=colors,
        autopct="%1.1f%%",
        startangle=90,
        textprops={"fontsize": 10},
    )
    ax5.set_title("锆石成因类型分布", fontsize=12)

    ax6 = plt.subplot(2, 3, 6)
    origin_labels = [o.value for o in classification.origin]
    scores_mag = classification.probabilities["magmatic"]
    scores_hyd = classification.probabilities["hydrothermal"]
    scores_met = classification.probabilities["metamorphic"]

    x_pos = np.arange(len(classification.origin))
    bar_width = 0.25

    ax6.bar(x_pos - bar_width, scores_mag, bar_width, label="岩浆", color=origin_colors[ZirconOrigin.MAGMATIC], alpha=0.7)
    ax6.bar(x_pos, scores_hyd, bar_width, label="热液", color=origin_colors[ZirconOrigin.HYDROTHERMAL], alpha=0.7)
    ax6.bar(x_pos + bar_width, scores_met, bar_width, label="变质", color=origin_colors[ZirconOrigin.METAMORPHIC], alpha=0.7)

    ax6.set_xlabel("分析点", fontsize=11)
    ax6.set_ylabel("判别得分", fontsize=11)
    ax6.set_title("各分析点成因判别得分", fontsize=12)
    ax6.set_xticks(x_pos[::max(1, len(x_pos) // 10)])
    ax6.set_xticklabels([str(i + 1) for i in range(len(x_pos))][::max(1, len(x_pos) // 10)], rotation=45, fontsize=8)
    ax6.legend(fontsize=9)
    ax6.set_ylim(0, 1.1)

    plt.tight_layout()
    fig.savefig(output_path, dpi=dpi, bbox_inches="tight")
    plt.close(fig)

    return output_path


def origin_summary(classification: OriginClassification) -> str:
    """
    生成成因分类摘要

    参数:
        classification: 成因分类结果

    返回:
        格式化摘要字符串
    """
    lines = []
    lines.append("=" * 70)
    lines.append("锆石成因类型判别结果")
    lines.append("=" * 70)

    origin_counts = {}
    for orig in classification.origin:
        origin_counts[orig] = origin_counts.get(orig, 0) + 1

    total = len(classification.origin)
    lines.append(f"总分析点数: {total}")
    lines.append("")

    for orig, count in sorted(origin_counts.items(), key=lambda x: x[1], reverse=True):
        pct = count / total * 100
        prob_key = orig.name.lower() if orig.name.lower() in classification.probabilities else None
        if prob_key:
            avg_score = np.mean([
                classification.probabilities[prob_key][i]
                for i, o in enumerate(classification.origin)
                if o == orig
            ])
            lines.append(f"{orig.value}: {count} ({pct:.1f}%), 平均得分: {avg_score:.2f}")
        else:
            lines.append(f"{orig.value}: {count} ({pct:.1f}%)")

    lines.append("")
    lines.append("判别指标说明:")
    lines.append("  岩浆锆石: Th/U > 0.5, Ce/Ce* > 5, U/Yb < 100, 重稀土富集")
    lines.append("  热液锆石: Th/U < 0.3, U/Yb > 500, U/Th < 10, 低温")
    lines.append("  变质锆石: Th/U < 0.1, Yb/Sm < 10, Lu/Gd < 0.01, 平坦稀土模式")
    lines.append("=" * 70)

    return "\n".join(lines)
