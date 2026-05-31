"""
碎屑锆石物源区分析模块
将年龄峰匹配到全球岩浆事件数据库，生成物源区贡献饼图
"""

import numpy as np
from dataclasses import dataclass, field
from typing import List, Tuple, Optional, Dict
from collections import defaultdict

from .provenance import (
    ProvenanceRegion,
    match_peak_to_provenance,
    get_geological_period,
    PROVENANCE_REGIONS,
)


@dataclass
class PeakProvenanceMatch:
    """年龄峰-物源区匹配结果"""
    peak_age: float
    peak_sigma: float
    n_analyses: int
    best_match: Optional[ProvenanceRegion]
    all_matches: List[ProvenanceRegion]
    geological_period: str


@dataclass
class ProvenanceAnalysisResult:
    """物源区分析结果"""
    matches: List[PeakProvenanceMatch]
    provenance_counts: Dict[str, int]
    provenance_percentages: Dict[str, float]
    total_analyses: int

    def summary(self) -> str:
        lines = []
        lines.append("=" * 70)
        lines.append("物源区分析结果")
        lines.append("=" * 70)
        lines.append(f"总分析点数: {self.total_analyses}")
        lines.append(f"匹配的年龄峰数: {len(self.matches)}")
        lines.append("")

        lines.append("年龄峰匹配详情:")
        for i, match in enumerate(self.matches, 1):
            best_name = match.best_match.name if match.best_match else "未匹配"
            lines.append(f"  峰{i}: {match.peak_age:.1f} ± {match.peak_sigma:.1f} Ma")
            lines.append(f"    分析点数: {match.n_analyses}")
            lines.append(f"    地质年代: {match.geological_period}")
            lines.append(f"    最佳匹配: {best_name}")
            if match.all_matches:
                names = [m.name for m in match.all_matches[:3]]
                lines.append(f"    其他候选: {', '.join(names)}")
            lines.append("")

        lines.append("物源区贡献比例:")
        for name, pct in sorted(self.provenance_percentages.items(), key=lambda x: x[1], reverse=True):
            lines.append(f"  {name}: {pct:.1f}% ({self.provenance_counts.get(name, 0)} 个分析点)")

        lines.append("=" * 70)
        return "\n".join(lines)


def match_peaks_to_provenance(
    peaks: List[Dict],
    individual_ages: np.ndarray,
    peak_assignments: np.ndarray,
) -> ProvenanceAnalysisResult:
    """
    将检测到的年龄峰匹配到物源区

    参数:
        peaks: 峰值检测结果列表，每个元素包含'age', 'sigma', 'n_analyses'
        individual_ages: 单个分析点的年龄数组
        peak_assignments: 每个分析点所属峰的编号（-1表示未分配）

    返回:
        ProvenanceAnalysisResult 对象
    """
    matches = []

    for peak in peaks:
        peak_age = peak.get("age", peak.get("center", 0))
        peak_sigma = peak.get("sigma", peak.get("std", peak_age * 0.1))
        n_analyses = peak.get("n_analyses", peak.get("count", 0))

        best_match, all_matches = match_peak_to_provenance(peak_age, peak_sigma)
        geo_period = get_geological_period(peak_age)

        matches.append(PeakProvenanceMatch(
            peak_age=peak_age,
            peak_sigma=peak_sigma,
            n_analyses=n_analyses,
            best_match=best_match,
            all_matches=all_matches,
            geological_period=geo_period,
        ))

    provenance_counts = defaultdict(int)
    for i, assignment in enumerate(peak_assignments):
        if assignment >= 0 and assignment < len(matches):
            match = matches[assignment]
            if match.best_match:
                provenance_counts[match.best_match.name] += 1
            else:
                provenance_counts["未匹配"] += 1
        else:
            provenance_counts["未匹配"] += 1

    total = max(len(individual_ages), 1)
    provenance_percentages = {
        name: count / total * 100
        for name, count in provenance_counts.items()
    }

    return ProvenanceAnalysisResult(
        matches=matches,
        provenance_counts=dict(provenance_counts),
        provenance_percentages=provenance_percentages,
        total_analyses=total,
    )


def plot_provenance_pie_chart(
    result: ProvenanceAnalysisResult,
    output_path: str,
    min_percentage: float = 2.0,
    figsize: Tuple[float, float] = (14, 10),
    dpi: int = 300,
) -> str:
    """
    绘制物源区贡献饼图

    参数:
        result: 物源区分析结果
        output_path: 输出文件路径
        min_percentage: 小于该百分比的物源区合并为"其他"
        figsize: 图像尺寸
        dpi: DPI

    返回:
        输出文件路径
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    provenance_colors = {
        r.name: r.color for r in PROVENANCE_REGIONS
    }

    percentages = result.provenance_percentages.copy()
    counts = result.provenance_counts.copy()

    other_pct = 0.0
    other_count = 0
    keys_to_remove = []

    for name, pct in percentages.items():
        if pct < min_percentage and name != "未匹配":
            other_pct += pct
            other_count += counts.get(name, 0)
            keys_to_remove.append(name)

    for key in keys_to_remove:
        del percentages[key]
        if key in counts:
            del counts[key]

    if other_pct > 0:
        percentages["其他"] = other_pct
        counts["其他"] = other_count

    sorted_items = sorted(percentages.items(), key=lambda x: x[1], reverse=True)
    labels = [item[0] for item in sorted_items]
    sizes = [item[1] for item in sorted_items]

    colors = []
    for label in labels:
        if label == "其他":
            colors.append("#B0B0B0")
        else:
            colors.append(provenance_colors.get(label, "#808080"))

    fig = plt.figure(figsize=figsize)
    gs = fig.add_gridspec(2, 2, height_ratios=[3, 1], width_ratios=[3, 1])

    ax_pie = fig.add_subplot(gs[0, 0])
    wedges, texts, autotexts = ax_pie.pie(
        sizes,
        labels=labels,
        colors=colors,
        autopct=lambda pct: f"{pct:.1f}%" if pct > min_percentage else "",
        startangle=90,
        textprops={"fontsize": 11},
        wedgeprops=dict(edgecolor="white", linewidth=1.5),
        pctdistance=0.75,
        labeldistance=1.1,
    )

    for autotext in autotexts:
        autotext.set_color("white")
        autotext.set_fontweight("bold")
        autotext.set_fontsize(10)

    ax_pie.set_title("物源区贡献比例", fontsize=16, fontweight="bold", pad=20)

    ax_table = fig.add_subplot(gs[1, :])
    ax_table.axis("off")

    table_data = []
    for i, (label, pct) in enumerate(sorted_items):
        count = counts.get(label, 0)
        table_data.append([label, f"{pct:.1f}%", f"{count}"])

    if table_data:
        table = ax_table.table(
            cellText=table_data,
            colLabels=["物源区", "百分比", "分析点数"],
            loc="center",
            cellLoc="center",
            colWidths=[0.5, 0.2, 0.3],
        )
        table.auto_set_font_size(False)
        table.set_fontsize(10)
        table.scale(1, 1.8)

        for j in range(len(table_data) + 1):
            for k in range(3):
                cell = table[(j, k)]
                if j == 0:
                    cell.set_facecolor("#f0f0f0")
                    cell.set_text_props(fontweight="bold")
                cell.set_edgecolor("white")

    ax_text = fig.add_subplot(gs[0, 1])
    ax_text.axis("off")

    info_text = []
    info_text.append(f"总分析点数: {result.total_analyses}")
    info_text.append(f"年龄峰数: {len(result.matches)}")
    info_text.append("")
    info_text.append("年龄峰详情:")
    for i, match in enumerate(result.matches[:10], 1):
        best = match.best_match.name if match.best_match else "未匹配"
        info_text.append(f"  峰{i}: {match.peak_age:.0f} Ma ({match.n_analyses}点)")
        info_text.append(f"    → {best}")
        info_text.append(f"    [{match.geological_period}]")

    ax_text.text(
        0, 1, "\n".join(info_text),
        ha="left", va="top", fontsize=10,
        transform=ax_text.transAxes,
        bbox=dict(boxstyle="round", facecolor="#f8f8f8", edgecolor="#cccccc"),
    )

    plt.tight_layout()
    fig.savefig(output_path, dpi=dpi, bbox_inches="tight")
    plt.close(fig)

    return output_path


def plot_age_vs_provenance(
    result: ProvenanceAnalysisResult,
    individual_ages: np.ndarray,
    peak_assignments: np.ndarray,
    output_path: str,
    figsize: Tuple[float, float] = (16, 8),
    dpi: int = 300,
) -> str:
    """
    绘制年龄分布与物源区对应图

    参数:
        result: 物源区分析结果
        individual_ages: 单个分析点年龄数组
        peak_assignments: 每个分析点所属峰的编号
        output_path: 输出文件路径
        figsize: 图像尺寸
        dpi: DPI

    返回:
        输出文件路径
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Patch

    provenance_colors = {
        r.name: r.color for r in PROVENANCE_REGIONS
    }

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=figsize, height_ratios=[2, 1])

    sorted_indices = np.argsort(individual_ages)
    sorted_ages = individual_ages[sorted_indices]
    sorted_assignments = peak_assignments[sorted_indices]

    colors = []
    for assignment in sorted_assignments:
        if assignment >= 0 and assignment < len(result.matches):
            match = result.matches[assignment]
            if match.best_match:
                colors.append(provenance_colors.get(match.best_match.name, "#808080"))
            else:
                colors.append("#808080")
        else:
            colors.append("#808080")

    x_pos = np.arange(len(sorted_ages))
    ax1.scatter(x_pos, sorted_ages, c=colors, s=40, alpha=0.8, edgecolors="black", linewidths=0.3)
    ax1.set_xlabel("分析点（按年龄排序）", fontsize=12)
    ax1.set_ylabel("年龄 (Ma)", fontsize=12)
    ax1.set_title("碎屑锆石年龄分布与物源区归属", fontsize=14, fontweight="bold")
    ax1.grid(True, alpha=0.3, axis="y")

    legend_elements = []
    unique_colors = {}
    for assignment, color in zip(sorted_assignments, colors):
        if assignment >= 0 and assignment < len(result.matches):
            match = result.matches[assignment]
            if match.best_match and match.best_match.name not in unique_colors:
                unique_colors[match.best_match.name] = color
        elif "未匹配" not in unique_colors:
            unique_colors["未匹配"] = "#808080"

    for name, color in unique_colors.items():
        legend_elements.append(Patch(facecolor=color, label=name, edgecolor="black", linewidth=0.5))

    ax1.legend(
        handles=legend_elements,
        loc="upper left",
        bbox_to_anchor=(1.01, 1),
        fontsize=10,
        title="物源区",
        title_fontsize=11,
    )

    ax2.hist(individual_ages, bins=50, color="#337ab7", alpha=0.7, edgecolor="black", linewidth=0.5)
    ax2.set_xlabel("年龄 (Ma)", fontsize=12)
    ax2.set_ylabel("频数", fontsize=12)
    ax2.set_title("年龄分布直方图", fontsize=12)
    ax2.grid(True, alpha=0.3, axis="y")

    for i, match in enumerate(result.matches):
        ax2.axvline(match.peak_age, color="red", linestyle="--", alpha=0.7, linewidth=1)
        ax2.text(
            match.peak_age,
            ax2.get_ylim()[1] * 0.9,
            f"  峰{i+1}\n  {match.peak_age:.0f} Ma",
            fontsize=8,
            color="red",
            ha="left",
            va="top",
        )

    plt.tight_layout()
    fig.savefig(output_path, dpi=dpi, bbox_inches="tight")
    plt.close(fig)

    return output_path
