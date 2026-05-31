"""
可视化模块

使用 Matplotlib 生成:
  - 绝缘子串应力分布图
  - 风偏角示意图
  - 参数扫描等高线图 (风速 vs 风向角)
  - Base64 编码输出

内存优化:
  - 强制垃圾回收
  - 及时清理大型临时数组
  - 避免 Matplotlib 数据缓存
"""

import base64
import gc
import io
import warnings
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import rcParams

warnings.filterwarnings("ignore", category=UserWarning)

rcParams["font.sans-serif"] = ["SimHei", "Microsoft YaHei", "Arial", "DejaVu Sans"]
rcParams["axes.unicode_minus"] = False

THRESHOLD_DEG = 45.0


def fig_to_base64(fig) -> str:
    with io.BytesIO() as buf:
        fig.savefig(buf, format="png", dpi=120, bbox_inches="tight")
        buf.seek(0)
        b64 = base64.b64encode(buf.read()).decode("utf-8")
    fig.clear()
    plt.close(fig)
    plt.close("all")
    gc.collect()
    return b64


def plot_deflection(result: dict, string_length: float, string_type: str,
                     v_angle_deg: float) -> str:
    fig, ax = plt.subplots(1, 1, figsize=(8, 7))
    theta = result["deflection_angle_rad"]
    L = string_length
    safe = result["safe"]

    x_top = 0
    y_top = L
    x_bottom = L * np.sin(theta)
    y_bottom = 0

    ax.plot([x_top, x_bottom], [y_top, y_bottom], "b-o",
            linewidth=2.5, markersize=6, label="绝缘子串")

    if string_type in ("V", "VV"):
        beta = np.radians(v_angle_deg)
        x_left = -L * np.sin(beta)
        x_right = L * np.sin(beta)
        ax.plot([x_top, x_left], [y_top, y_bottom],
                "g--o", linewidth=1.5, markersize=4, alpha=0.5)
        ax.plot([x_top, x_right], [y_top, y_bottom],
                "g--o", linewidth=1.5, markersize=4, alpha=0.5)
        if string_type == "VV":
            ax.plot([x_top, x_left - 0.5], [y_top, y_bottom],
                    "g--o", linewidth=1.2, markersize=3, alpha=0.4)
            ax.plot([x_top, x_right + 0.5], [y_top, y_bottom],
                    "g--o", linewidth=1.2, markersize=3, alpha=0.4)

    ax.plot([x_top], [y_top], "s", color="black", markersize=12,
            label="悬挂点 (铁塔)")
    ax.plot([x_bottom], [y_bottom], "D", color="red", markersize=10,
            label="导线端")

    ax.annotate(f"风偏角: {result['deflection_angle_deg']:.2f}°",
                xy=(x_bottom, y_bottom),
                xytext=(x_bottom + 0.8, y_bottom + 0.8),
                fontsize=11, color="red", fontweight="bold",
                arrowprops=dict(arrowstyle="->", color="red"))

    wind_x = x_bottom + 0.5
    wind_y = y_bottom
    ax.annotate("", xy=(wind_x + 1.0, wind_y), xytext=(wind_x, wind_y),
                arrowprops=dict(arrowstyle="->", color="orange", lw=2))
    ax.text(wind_x + 0.3, wind_y + 0.15, "风向", fontsize=10, color="orange")

    arc_theta = np.linspace(0, theta, 50)
    ax.plot(0.3 * np.sin(arc_theta), L - 0.3 * np.cos(arc_theta),
            "r-", linewidth=1.5)

    ax.set_xlim(-L * 1.5, L * 1.5)
    ax.set_ylim(-0.5, L + 0.5)
    ax.set_aspect("equal")
    ax.set_xlabel("水平距离 (m)", fontsize=11)
    ax.set_ylabel("竖直距离 (m)", fontsize=11)
    title_safe = "✓ 安全" if safe else "✗ 超限"
    ax.set_title(f"绝缘子串风偏角示意图 [{string_type}串] - {title_safe}",
                 fontsize=13, fontweight="bold")
    ax.legend(loc="upper right", fontsize=9)
    ax.grid(True, alpha=0.3)

    threshold_line = np.radians(45.0)
    x_thresh = L * np.sin(threshold_line)
    ax.plot([0, x_thresh], [L, 0], "r--", linewidth=1, alpha=0.5,
            label="45°阈值")
    ax.legend(loc="upper right", fontsize=9)

    return fig_to_base64(fig)


def plot_stress_distribution(stresses: list[dict], result: dict) -> str:
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))

    positions = [s["position_m"] for s in stresses]
    tensions = [s["tension_n"] for s in stresses]
    stresses_pa = [s["stress_pa"] for s in stresses]
    deflections = [s["deflection_x_m"] for s in stresses]

    ax1.fill_between(positions, 0, tensions, alpha=0.3, color="steelblue")
    ax1.plot(positions, tensions, "b-", linewidth=2)
    ax1.set_xlabel("绝缘子串位置 (m)", fontsize=11)
    ax1.set_ylabel("张力 (N)", fontsize=11)
    ax1.set_title(f"绝缘子串张力分布 [类型: {result['string_type']}]",
                  fontsize=12, fontweight="bold")
    ax1.grid(True, alpha=0.3)

    ax2.fill_between(positions, 0, [s / 1e6 for s in stresses_pa],
                     alpha=0.3, color="coral")
    ax2.plot(positions, [s / 1e6 for s in stresses_pa], "r-", linewidth=2)
    ax2.set_xlabel("绝缘子串位置 (m)", fontsize=11)
    ax2.set_ylabel("应力 (MPa)", fontsize=11)
    ax2.set_title("绝缘子串应力分布", fontsize=12, fontweight="bold")
    ax2.grid(True, alpha=0.3)

    fig.suptitle(
        f"风偏角: {result['deflection_angle_deg']:.2f}°  "
        f"风速: {result['wind_speed_m_s']} m/s  "
        f"风向: {result['wind_angle_deg']}°",
        fontsize=11, y=0.02)
    fig.tight_layout(rect=[0, 0.05, 1, 1])

    return fig_to_base64(fig)


def plot_contour(results_2d: list[list[dict]],
                  wind_speeds: list[float],
                  wind_angles: list[float],
                  string_type: str) -> str:
    n_v = len(wind_speeds)
    n_a = len(wind_angles)
    Z = np.zeros((n_v, n_a))
    safe_mask = np.zeros((n_v, n_a), dtype=np.uint8)

    for i in range(n_v):
        row = results_2d[i]
        for j in range(n_a):
            r = row[j]
            Z[i, j] = r["deflection_angle_deg"]
            safe_mask[i, j] = 1 if r["safe"] else 0

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))

    X, Y = np.meshgrid(wind_angles, wind_speeds)

    levels = np.arange(0, 70, 5)
    cf = ax1.contourf(X, Y, Z, levels=levels, cmap="RdYlGn_r", alpha=0.85)
    c1 = ax1.contour(X, Y, Z, levels=[45.0], colors="red",
                      linewidths=2.5, linestyles="--")
    labels = ax1.clabel(c1, inline=True, fmt="45°阈值", fontsize=10)
    for l in labels:
        l.set_color("red")
    fig.colorbar(cf, ax=ax1, label="风偏角 (°)")
    ax1.set_xlabel("风向角 (°)", fontsize=11)
    ax1.set_ylabel("风速 (m/s)", fontsize=11)
    ax1.set_title(f"风偏角等高线图 [{string_type}串]", fontsize=12,
                  fontweight="bold")
    ax1.grid(True, alpha=0.3)

    ax2.imshow(safe_mask, extent=[min(wind_angles), max(wind_angles),
                                    min(wind_speeds), max(wind_speeds)],
               origin="lower", aspect="auto", cmap="RdYlGn",
               interpolation="nearest")
    ax2.set_xlabel("风向角 (°)", fontsize=11)
    ax2.set_ylabel("风速 (m/s)", fontsize=11)
    ax2.set_title("安全区域判定 (绿=安全, 红=超限)", fontsize=12,
                  fontweight="bold")

    fig.tight_layout()

    b64 = fig_to_base64(fig)

    del Z, safe_mask, X, Y, cf, c1, labels, levels
    gc.collect()

    return b64


def plot_deflection_vs_wind(result: dict) -> str:
    fig, ax = plt.subplots(figsize=(8, 5))
    v_range = np.linspace(0, 60, 121)
    from .statics import InsulatorStatics
    statics = InsulatorStatics(
        string_type=result["string_type"],
        string_length=result.get("string_length", 3.0),
        v_angle_deg=result.get("v_angle_deg", 45.0),
        conductor_tension=result.get("conductor_tension", 30000.0),
    )
    angles = []
    for v in v_range:
        r = statics.calculate(v, result["wind_angle_deg"])
        angles.append(r["deflection_angle_deg"])

    ax.plot(v_range, angles, "b-", linewidth=2.5, label="风偏角")
    ax.axhline(y=45.0, color="red", linestyle="--", linewidth=2,
                label="设计阈值 45°")
    ax.axvline(x=30.0, color="orange", linestyle=":", linewidth=1.5,
                alpha=0.7, label="设计基准风速 30 m/s")
    ax.fill_between(v_range, 0, 45, alpha=0.1, color="green", label="安全区域")

    ax.set_xlabel("风速 (m/s)", fontsize=11)
    ax.set_ylabel("风偏角 (°)", fontsize=11)
    ax.set_title(f"风偏角-风速曲线 [{result['string_type']}串]",
                 fontsize=12, fontweight="bold")
    ax.legend(fontsize=9)
    ax.grid(True, alpha=0.3)
    ax.set_xlim(0, 60)
    ax.set_ylim(0, 70)

    return fig_to_base64(fig)


def plot_wind_speed_timehistory(wind_data: dict) -> str:
    """
    风速时程 + 功率谱密度图
    """
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 8))

    t = np.array(wind_data["time_s"])
    u = np.array(wind_data["speed_m_s"])

    ax1.plot(t, u, color="steelblue", linewidth=0.6, alpha=0.8)
    ax1.axhline(y=wind_data["mean_speed_m_s"], color="red", linestyle="--",
                linewidth=1.5, label=f'均值 {wind_data["mean_speed_m_s"]:.1f} m/s')
    ax1.fill_between(t,
                     wind_data["mean_speed_m_s"] - wind_data["std_speed_m_s"],
                     wind_data["mean_speed_m_s"] + wind_data["std_speed_m_s"],
                     alpha=0.15, color="orange", label="±1σ 脉动")
    ax1.set_xlabel("时间 (s)", fontsize=11)
    ax1.set_ylabel("风速 (m/s)", fontsize=11)
    ax1.set_title(
        f"Kaimal 脉动风速时程 [TI={wind_data['turbulence_intensity']:.3f}, "
        f"阵风因子={wind_data['gust_factor']:.2f}]",
        fontsize=12, fontweight="bold")
    ax1.legend(fontsize=9)
    ax1.grid(True, alpha=0.3)

    f = np.array(wind_data["psd_freq_hz"])
    psd = np.array(wind_data["psd_power_m2_s"])
    f_target = np.array(wind_data["target_spectrum_freq_hz"])
    S_target = np.array(wind_data["target_spectrum_power"])

    mask = f > 0
    ax2.loglog(f[mask], psd[mask], color="steelblue", linewidth=1.0,
               alpha=0.7, label="模拟 PSD")
    mask_t = f_target > 0
    ax2.loglog(f_target[mask_t], S_target[mask_t], "r--", linewidth=1.5,
               alpha=0.8, label="Kaimal 目标谱")
    ax2.set_xlabel("频率 (Hz)", fontsize=11)
    ax2.set_ylabel("PSD (m²/s)", fontsize=11)
    ax2.set_title("风速功率谱密度对比", fontsize=12, fontweight="bold")
    ax2.legend(fontsize=9)
    ax2.grid(True, alpha=0.3, which="both")

    fig.tight_layout()
    return fig_to_base64(fig)


def plot_deflection_timehistory(deflection_result: dict,
                                time_series: list[float]) -> str:
    """
    风偏角时程 + 超限概率图
    """
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 8))

    t = np.array(time_series)
    angles = np.array(deflection_result["deflection_deg"])
    stats = deflection_result["statistics"]

    ax1.plot(t, angles, color="purple", linewidth=0.6, alpha=0.85)
    ax1.axhline(y=THRESHOLD_DEG, color="red", linestyle="--", linewidth=2,
                label=f"设计阈值 {THRESHOLD_DEG}°")
    ax1.axhline(y=stats["mean_deg"], color="orange", linestyle=":", linewidth=1.5,
                label=f'均值 {stats["mean_deg"]:.1f}°')
    ax1.axhline(y=stats["peak_threshold_deg"], color="darkred",
                linestyle=":", linewidth=1, alpha=0.7,
                label=f'3σ 峰值 {stats["peak_threshold_deg"]:.1f}°')

    exceed_mask = angles > THRESHOLD_DEG
    if np.any(exceed_mask):
        ax1.fill_between(t, THRESHOLD_DEG, angles, where=exceed_mask,
                         alpha=0.3, color="red", label="超限区域")

    ax1.set_xlabel("时间 (s)", fontsize=11)
    ax1.set_ylabel("风偏角 (°)", fontsize=11)
    ax1.set_title(
        f"风偏角时程曲线 [超限率 {stats['exceed_ratio']*100:.1f}%, "
        f"峰值 {stats['max_deg']:.1f}°]",
        fontsize=12, fontweight="bold")
    ax1.legend(fontsize=8, loc="upper right")
    ax1.grid(True, alpha=0.3)

    levels = list(deflection_result["exceedance_probability"].keys())
    probs = [deflection_result["exceedance_probability"][l]["probability"]
             for l in levels]
    levels_f = [float(l) for l in levels]

    ax2.bar(levels_f, [p * 100 for p in probs], width=3.5,
            color="steelblue", alpha=0.8, edgecolor="navy")
    for i, (lv, pb) in enumerate(zip(levels_f, probs)):
        if pb > 0:
            ax2.text(lv, pb * 100 + 0.5, f"{pb*100:.1f}%",
                     ha="center", fontsize=9, fontweight="bold")
    ax2.axhline(y=5.0, color="red", linestyle="--", linewidth=1.5,
                label="5% 可接受水平")
    ax2.set_xlabel("风偏角阈值 (°)", fontsize=11)
    ax2.set_ylabel("超限概率 (%)", fontsize=11)
    ax2.set_title("各级风偏角超限概率分布", fontsize=12, fontweight="bold")
    ax2.legend(fontsize=9)
    ax2.grid(True, alpha=0.3, axis="y")

    fig.tight_layout()
    return fig_to_base64(fig)


def plot_fatigue_analysis(fatigue_result: dict) -> str:
    """
    疲劳损伤分析图: 雨流计数直方图 + 损伤贡献条形图
    """
    cycles = fatigue_result.get("rainflow_cycles", [])
    damage = fatigue_result.get("damage_analysis", {})
    life = fatigue_result.get("fatigue_life", {})

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 8))

    if cycles:
        amps = [c["amplitude"] / 1e6 for c in cycles]
        cnts = [c["count"] for c in cycles]
        ax1.bar(range(len(amps)), cnts,
                color="coral", alpha=0.8, edgecolor="darkred", width=0.8)
        ax1.set_xticks(range(len(amps)))
        ax1.set_xticklabels([f"{a:.2f}" for a in amps], rotation=45,
                             ha="right", fontsize=7)
        ax1.set_xlabel("应力幅 (MPa)", fontsize=10)
        ax1.set_ylabel("循环次数", fontsize=11)
        ax1.set_title(
            f"雨流计数结果 [总循环 {damage.get('n_cycles', 0)} 次, "
            f"幅值级数 {damage.get('n_levels', 0)} 级]",
            fontsize=12, fontweight="bold")
        ax1.grid(True, alpha=0.3, axis="y")
    else:
        ax1.text(0.5, 0.5, "无有效循环数据", ha="center", va="center",
                 fontsize=14, color="gray")

    detail = damage.get("damage_detail", [])
    if detail:
        detail_sorted = sorted(detail, key=lambda x: x["damage"], reverse=True)[:10]
        amps_m = [d["amplitude_pa"] / 1e6 for d in detail_sorted]
        dam = [d["damage"] for d in detail_sorted]
        colors = ["#e74c3c" if d > 0.01 else "#f39c12" if d > 0.001
                   else "#3498db" for d in dam]
        ax2.barh(range(len(amps_m)), dam, color=colors, alpha=0.85,
                 edgecolor="black")
        ax2.set_yticks(range(len(amps_m)))
        ax2.set_yticklabels([f"{a:.2f} MPa" for a in amps_m], fontsize=8)
        ax2.set_xlabel("损伤贡献", fontsize=11)
        ax2.set_title("各级应力幅损伤贡献 (Top 10)", fontsize=12,
                       fontweight="bold")

        total_d = damage.get("total_damage", 0)
        safety = life.get('design_life_safety', True)
        info_text = (
            f"总损伤 D = {total_d:.6f}\n"
            f"安全裕度 = {damage.get('safety_ratio', 0):.1f}\n"
            f"估算寿命 = {life.get('life_years', 0):.1f} 年\n"
            f"设计寿命安全 = {'✓' if safety else '✗'}"
        )
        ax2.text(0.98, 0.02, info_text, transform=ax2.transAxes,
                 fontsize=10, verticalalignment="bottom",
                 horizontalalignment="right",
                 bbox=dict(boxstyle="round", facecolor="wheat", alpha=0.8))

        ax2.grid(True, alpha=0.3, axis="x")

    fig.tight_layout()
    return fig_to_base64(fig)