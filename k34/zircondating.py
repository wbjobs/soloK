"""
锆石U-Pb同位素定年数据处理命令行工具
主入口文件，整合所有模块功能
"""

import argparse
import sys
import os
import json
import warnings
from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd

from core.data_parser import ZirconData
from core.age_calculator import (
    compute_individual_ages,
    concordia_age_tuffzirc,
    concordia_age_intercept,
    weighted_mean_age_isoplot,
    discordance_filter,
    AgeResult,
    U238_U235,
)
from core.plotting import (
    plot_wetherill,
    plot_tera_wasserburg,
    plot_age_spectrum,
)
from core.spectrum import (
    compute_kde,
    detect_peaks_kde,
    gaussian_mixture_decomposition,
    classify_age_groups,
    compute_kde_components,
)
from core.peak_detection import (
    detect_peaks_iterative,
    peak_decomposition_summary,
    MultiPeakResult,
)
from core.monte_carlo import (
    monte_carlo_age_uncertainty,
    monte_carlo_summary,
    plot_monte_carlo_results,
)
from core.lead_correction import (
    correct_using_204Pb,
    correct_using_stacey_kramers,
    common_lead_correction_summary,
)
from core.provenance_analysis import (
    match_peaks_to_provenance,
    plot_provenance_pie_chart,
    plot_age_vs_provenance,
)
from core.trace_elements import (
    compute_trace_element_ratios,
    classify_zircon_origin,
    plot_origin_discrimination,
    origin_summary,
)


def create_sample_data(output_file: str, n_samples: int = 30, include_trace: bool = True):
    """生成示例数据"""
    np.random.seed(42)

    true_ages = np.random.choice([250, 250, 250, 800, 800, 1800], size=n_samples)
    true_ages = true_ages + np.random.normal(0, 5, n_samples)

    from core.age_calculator import (
        LAMBDA238, LAMBDA235, U238_U235, concordia_ratios
    )

    data = []
    for age in true_ages:
        r75_true, r68_true = concordia_ratios(age)

        noise_level = 0.02
        r68 = r68_true * (1 + np.random.normal(0, noise_level))
        r75 = r75_true * (1 + np.random.normal(0, noise_level))
        r76 = r75 / (r68 * U238_U235) * (1 + np.random.normal(0, 0.01))
        r86 = 1.0 / r68

        s68 = r68 * 0.015
        s75 = r75 * 0.02
        s76 = r76 * 0.01
        s86 = r86 * 0.015
        rho = 0.85

        row = {
            "sample_name": "Sample-001",
            "grain_id": f"G{len(data)+1:03d}",
            "spot_id": f"S{len(data)+1:03d}",
            "206Pb/238U": f"{r68:.6f}",
            "207Pb/235U": f"{r75:.6f}",
            "207Pb/206Pb": f"{r76:.6f}",
            "238U/206Pb": f"{r86:.6f}",
            "206Pb/238U_1σ": f"{s68:.6f}",
            "207Pb/235U_1σ": f"{s75:.6f}",
            "207Pb/206Pb_1σ": f"{s76:.6f}",
            "238U/206Pb_1σ": f"{s86:.6f}",
            "rho": f"{rho:.3f}",
            "208Pb/232Th": f"{r68 * 0.1:.6f}",
            "208Pb/232Th_1σ": f"{s68 * 0.1:.6f}",
        }

        if include_trace:
            age_my = age / 1000
            u_ppm = 100 + 400 * np.random.random()
            th_ppm = u_ppm * (0.3 + 0.5 * np.random.random())
            yb_ppm = 0.5 + 2 * np.random.random()
            ce_ppm = 5 + 20 * np.random.random()
            la_ppm = 0.01 + 0.1 * np.random.random()
            pr_ppm = 0.05 + 0.3 * np.random.random()
            nd_ppm = 0.1 + 0.5 * np.random.random()
            sm_ppm = 0.3 + 1.5 * np.random.random()
            gd_ppm = 0.5 + 2 * np.random.random()
            lu_ppm = 0.1 + 0.5 * np.random.random()
            hf_ppm = 8000 + 4000 * np.random.random()
            ti_ppm = 5 + 15 * np.random.random()

            if age > 1500:
                th_ppm = u_ppm * 0.05
                yb_ppm = 0.2 + 0.5 * np.random.random()
                ce_ppm = 2 + 5 * np.random.random()
            elif age < 500:
                u_ppm = 200 + 600 * np.random.random()
                th_ppm = u_ppm * 0.8

            row.update({
                "U_ppm": f"{u_ppm:.2f}",
                "Th_ppm": f"{th_ppm:.2f}",
                "Yb_ppm": f"{yb_ppm:.3f}",
                "Ce_ppm": f"{ce_ppm:.2f}",
                "La_ppm": f"{la_ppm:.4f}",
                "Pr_ppm": f"{pr_ppm:.4f}",
                "Nd_ppm": f"{nd_ppm:.4f}",
                "Sm_ppm": f"{sm_ppm:.4f}",
                "Gd_ppm": f"{gd_ppm:.4f}",
                "Lu_ppm": f"{lu_ppm:.4f}",
                "Hf_ppm": f"{hf_ppm:.1f}",
                "Ti_ppm": f"{ti_ppm:.2f}",
            })

        data.append(row)

    df = pd.DataFrame(data)
    df.to_csv(output_file, index=False, encoding="utf-8-sig")
    print(f"示例数据已生成: {output_file}")
    print(f"共 {len(data)} 个分析点")
    if include_trace:
        print("包含微量元素数据")


def run_analysis(
    input_file: str,
    output_dir: str,
    options: dict,
) -> dict:
    """执行完整的数据分析流程"""
    results = {}
    os.makedirs(output_dir, exist_ok=True)

    print("\n" + "=" * 70)
    print("锆石U-Pb同位素定年数据处理工具")
    print("=" * 70)
    print(f"输入文件: {input_file}")
    print(f"输出目录: {output_dir}")
    print(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("-" * 70)

    print("\n[1/7] 读取数据...")
    try:
        zircon_data = ZirconData.from_csv(input_file)
        print(f"  成功读取 {len(zircon_data)} 个分析点")
        results["n_analyses"] = len(zircon_data)
    except Exception as e:
        print(f"  错误: {e}")
        return {"error": str(e)}

    if options.get("lead_correction"):
        print("\n[2/7] 普通铅校正...")
        method = options.get("lead_correction_method", "stacey_kramers")

        if method == "204Pb" and zircon_data.r204_206 is not None:
            corr_result = correct_using_204Pb(
                zircon_data.r68, zircon_data.s68,
                zircon_data.r75, zircon_data.s75,
                zircon_data.r76, zircon_data.s76,
                zircon_data.r204_206,
                zircon_data.df.get("s204_206", zircon_data.s68 * 0.1).values
                if "s204_206" in zircon_data.df.columns
                else zircon_data.s68 * 0.1,
            )
        else:
            assumed_age = options.get("assumed_age", 300.0)
            corr_result = correct_using_stacey_kramers(
                zircon_data.r68, zircon_data.s68,
                zircon_data.r75, zircon_data.s75,
                zircon_data.r76, zircon_data.s76,
                assumed_age,
            )

        print(common_lead_correction_summary(corr_result))

        r68 = corr_result.r68_corrected
        s68 = corr_result.s68_corrected
        r75 = corr_result.r75_corrected
        s75 = corr_result.s75_corrected
        r76 = corr_result.r76_corrected
        s76 = corr_result.s76_corrected
        results["lead_correction"] = corr_result.correction_details
    else:
        r68 = zircon_data.r68
        s68 = zircon_data.s68
        r75 = zircon_data.r75
        s75 = zircon_data.s75
        r76 = zircon_data.r76 if hasattr(zircon_data, 'r76') else None
        s76 = zircon_data.s76 if hasattr(zircon_data, 's76') else None

    rho = zircon_data.rho68_75
    r86 = 1.0 / r68
    s86 = s68 / (r68 ** 2)

    print("\n[3/7] 计算单点年龄...")
    individual_ages = compute_individual_ages(r68, s68, r75, s75, r76, s76)
    results["individual_ages"] = {
        k: {
            "ages": v["ages"].tolist() if isinstance(v, dict) else v.tolist(),
            "2sigma": v["2sigma"].tolist() if isinstance(v, dict) else None,
        }
        for k, v in individual_ages.items()
        if k != "concordance"
    }
    results["concordance"] = individual_ages.get(
        "concordance", np.array([])
    ).tolist()

    ages_68 = individual_ages["206Pb/238U"]["ages"]
    sigmas_68 = individual_ages["206Pb/238U"]["2sigma"] / 2.0

    print(f"  206Pb/238U年龄范围: {np.min(ages_68):.1f} - {np.max(ages_68):.1f} Ma")
    print(f"  谐和度范围: {np.nanmin(results['concordance']):.1f} - "
          f"{np.nanmax(results['concordance']):.1f} %")

    concordia_method = options.get("concordia_method", "tuffzirc")

    print(f"\n[4/7] 计算和谐年龄 ({concordia_method})...")
    if concordia_method == "intercept":
        conc_result = concordia_age_intercept(r68, s68, r75, s75, rho)
    else:
        conc_result = concordia_age_tuffzirc(r68, s68, r75, s75, rho)

    print(f"  和谐年龄: {conc_result.age:.1f} ± {conc_result.age_2sigma:.1f} Ma")
    print(f"  MSWD: {conc_result.mswd:.2f}")
    print(f"  概率: {conc_result.probability:.4f}")
    results["concordia_age"] = {
        "age": conc_result.age,
        "2sigma": conc_result.age_2sigma,
        "mswd": conc_result.mswd,
        "probability": conc_result.probability,
        "n_used": conc_result.n_used,
        "method": conc_result.method,
    }

    print("\n[5/7] 计算加权平均年龄 (Isoplot)...")
    if options.get("filter_concordance"):
        conc_mask = discordance_filter(
            individual_ages,
            options.get("min_concordance", 90.0),
            options.get("max_concordance", 110.0),
        )
        ages_filtered = ages_68[conc_mask]
        sigmas_filtered = sigmas_68[conc_mask]
        print(f"  谐和度过滤后剩余: {np.sum(conc_mask)}/{len(ages_68)} 个分析点")
    else:
        ages_filtered = ages_68
        sigmas_filtered = sigmas_68

    wm_result = weighted_mean_age_isoplot(
        ages_filtered,
        sigmas_filtered,
        outlier_rejection=options.get("outlier_rejection", True),
        threshold=options.get("outlier_threshold", 2.5),
    )

    print(f"  加权平均年龄: {wm_result.age:.1f} ± {wm_result.age_2sigma:.1f} Ma")
    print(f"  MSWD: {wm_result.mswd:.2f}")
    print(f"  使用点数: {wm_result.n_used}/{len(ages_filtered)}")
    if wm_result.n_rejected > 0:
        print(f"  剔除离群值: {wm_result.n_rejected} 个")
    results["weighted_mean_age"] = {
        "age": wm_result.age,
        "2sigma": wm_result.age_2sigma,
        "mswd": wm_result.mswd,
        "probability": wm_result.probability,
        "n_used": wm_result.n_used,
        "n_rejected": wm_result.n_rejected,
    }

    print("\n[6/7] 峰值检测与年龄谱分析...")
    kde_bw = options.get("kde_bandwidth", None)

    if options.get("peak_detection_method", "gmm") == "iterative":
        peak_result = detect_peaks_iterative(
            ages_68, sigmas_68,
            min_peak_distance=options.get("min_peak_distance", 50.0),
            kde_bandwidth=kde_bw,
        )
        results["peak_detection"] = {
            "method": peak_result.method,
            "n_peaks": len(peak_result.peaks),
            "peaks": [
                {
                    "center": p.center,
                    "sigma": p.sigma,
                    "n_points": p.n_points,
                    "mean_age": p.mean_age,
                }
                for p in peak_result.peaks
            ],
        }
        peak_labels = classify_age_groups(
            ages_68, peak_result.peaks
        ) if peak_result.peaks else None
    else:
        gmm, gmm_peaks = gaussian_mixture_decomposition(
            ages_68, sigmas_68,
            max_components=options.get("max_peaks", 5),
        )
        results["peak_detection"] = {
            "method": "GMM",
            "n_peaks": len(gmm_peaks),
            "peaks": [
                {
                    "center": p.center,
                    "sigma": p.sigma,
                    "n_points": p.n_points,
                    "mean_age": p.mean_age,
                }
                for p in gmm_peaks
            ],
        }
        peak_result = MultiPeakResult(
            peaks=gmm_peaks,
            method="GMM",
            n_components=len(gmm_peaks),
        )
        peak_labels = classify_age_groups(
            ages_68, gmm_peaks
        ) if gmm_peaks else None

    if peak_result.peaks:
        print(peak_decomposition_summary(peak_result.peaks, ages_68, sigmas_68))

    origin_classification = None
    if options.get("origin_discrimination", True) and zircon_data.has_trace_elements:
        print("\n[6b/10] 锆石成因类型判别...")
        trace_data = zircon_data.trace_elements
        trace_ratios = compute_trace_element_ratios(trace_data)
        origin_classification = classify_zircon_origin(trace_ratios)
        print(origin_summary(origin_classification))
        results["origin_discrimination"] = {
            "origins": [o.value for o in origin_classification.origin],
            "scores": origin_classification.scores.tolist(),
            "probabilities": {
                k: v.tolist() for k, v in origin_classification.probabilities.items()
            },
            "ratios": {
                "U_Yb": trace_ratios.U_Yb.tolist(),
                "Th_U": trace_ratios.Th_U.tolist(),
                "Ce_Ce_star": trace_ratios.Ce_Ce_star.tolist(),
                "Yb_Sm": trace_ratios.Yb_Sm.tolist(),
                "Lu_Gd": trace_ratios.Lu_Gd.tolist(),
            },
        }

    provenance_result = None
    if options.get("provenance_analysis", True) and peak_result.peaks:
        print("\n[6c/10] 物源区分析...")
        provenance_result = match_peaks_to_provenance(
            results["peak_detection"]["peaks"],
            ages_68,
            peak_labels if peak_labels is not None else np.full(len(ages_68), -1),
        )
        print(provenance_result.summary())
        results["provenance"] = {
            "matches": [
                {
                    "peak_age": m.peak_age,
                    "peak_sigma": m.peak_sigma,
                    "n_analyses": m.n_analyses,
                    "best_match": m.best_match.name if m.best_match else None,
                    "geological_period": m.geological_period,
                    "all_matches": [c.name for c in m.all_matches],
                }
                for m in provenance_result.matches
            ],
            "counts": provenance_result.provenance_counts,
            "percentages": provenance_result.provenance_percentages,
        }

    print("\n[7/10] 蒙特卡洛模拟...")
    if options.get("monte_carlo", True):
        n_mc = options.get("n_monte_carlo", 5000)
        mc_result = monte_carlo_age_uncertainty(
            r68, s68, r75, s75, rho,
            r76=r76, s76=s76,
            n_simulations=n_mc,
        )
        print(monte_carlo_summary(mc_result))
        results["monte_carlo"] = {
            "n_simulations": mc_result.n_simulations,
            "summary": mc_result.summary,
        }

        mc_output_dir = os.path.join(output_dir, "monte_carlo")
        os.makedirs(mc_output_dir, exist_ok=True)
        mc_files = plot_monte_carlo_results(mc_result, mc_output_dir)
        results["monte_carlo_plots"] = mc_files

    print("\n" + "-" * 70)
    print("生成图表...")

    output_format = options.get("output_format", "pdf")

    plot_files = {}

    origin_labels = None
    if origin_classification is not None:
        origin_labels = [o.value for o in origin_classification.origin]

    wetherill_path = os.path.join(
        output_dir, f"wetherill_concordia.{output_format}"
    )
    plot_wetherill(
        r68, s68, r75, s75, rho,
        wetherill_path,
        concordia_age=conc_result.age,
        title="Wetherill Concordia Diagram",
        n_sigma=options.get("error_ellipse_sigma", 2.0),
        origin_labels=origin_labels,
    )
    plot_files["wetherill"] = wetherill_path
    print(f"  Wetherill和谐图: {wetherill_path}")

    r76_vals = np.array([r75[i] / (U238_U235 * r68[i]) for i in range(len(r68))])
    s76_vals = np.array([
        np.sqrt((s75[i] / (U238_U235 * r68[i])) ** 2 +
                (r75[i] * s68[i] / (U238_U235 * r68[i] ** 2)) ** 2)
        for i in range(len(r68))
    ])
    rho_86_76 = np.array([-0.5] * len(r68))

    tw_path = os.path.join(
        output_dir, f"tera_wasserburg_concordia.{output_format}"
    )
    plot_tera_wasserburg(
        r86, s86, r76_vals, s76_vals, rho_86_76,
        tw_path,
        concordia_age=conc_result.age,
        title="Tera-Wasserburg Concordia Diagram",
        n_sigma=options.get("error_ellipse_sigma", 2.0),
        origin_labels=origin_labels,
    )
    plot_files["tera_wasserburg"] = tw_path
    print(f"  Tera-Wasserburg和谐图: {tw_path}")

    spec_path = os.path.join(output_dir, f"age_spectrum.{output_format}")
    plot_age_spectrum(
        ages_68, individual_ages["206Pb/238U"]["2sigma"],
        spec_path,
        title="Age Spectrum (206Pb/238U)",
        bandwidth=kde_bw,
        dpi=options.get("dpi", 300),
    )
    plot_files["age_spectrum"] = spec_path
    print(f"  年龄谱图: {spec_path}")

    if origin_classification is not None:
        origin_plot_path = os.path.join(output_dir, f"origin_discrimination.{output_format}")
        plot_origin_discrimination(
            origin_classification.key_ratios,
            origin_classification,
            origin_plot_path,
            dpi=options.get("dpi", 300),
        )
        plot_files["origin_discrimination"] = origin_plot_path
        print(f"  成因判别图: {origin_plot_path}")

    if provenance_result is not None:
        pie_path = os.path.join(output_dir, f"provenance_pie.{output_format}")
        plot_provenance_pie_chart(
            provenance_result,
            pie_path,
            dpi=options.get("dpi", 300),
        )
        plot_files["provenance_pie"] = pie_path
        print(f"  物源区饼图: {pie_path}")

        age_prov_path = os.path.join(output_dir, f"age_vs_provenance.{output_format}")
        plot_age_vs_provenance(
            provenance_result,
            ages_68,
            peak_labels if peak_labels is not None else np.full(len(ages_68), -1),
            age_prov_path,
            dpi=options.get("dpi", 300),
        )
        plot_files["age_vs_provenance"] = age_prov_path
        print(f"  年龄-物源区对应图: {age_prov_path}")

    results["plots"] = plot_files

    print("\n" + "-" * 70)
    print("导出结果表格...")
    export_tables(results, zircon_data, individual_ages, conc_result,
                  wm_result, peak_result, output_dir, peak_labels,
                  origin_classification, provenance_result)

    json_path = os.path.join(output_dir, "analysis_results.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False, default=str)
    print(f"  JSON结果: {json_path}")

    summary_path = os.path.join(output_dir, "analysis_summary.txt")
    write_summary(results, conc_result, wm_result, peak_result, summary_path)
    print(f"  摘要报告: {summary_path}")

    print("\n" + "=" * 70)
    print("分析完成!")
    print(f"结束时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    return results


def export_tables(
    results: dict,
    zircon_data: ZirconData,
    individual_ages: dict,
    conc_result: AgeResult,
    wm_result: AgeResult,
    peak_result: MultiPeakResult,
    output_dir: str,
    peak_labels: np.ndarray = None,
    origin_classification=None,
    provenance_result=None,
):
    """导出结果表格"""
    ages_68 = individual_ages["206Pb/238U"]["ages"]
    sigmas_68 = individual_ages["206Pb/238U"]["2sigma"]
    concordance = individual_ages.get("concordance", np.array([]))

    df_export = zircon_data.df.copy()
    df_export["Age_206Pb_238U_Ma"] = ages_68
    df_export["Age_206Pb_238U_2sigma_Ma"] = sigmas_68
    df_export["Concordance_pct"] = concordance

    if "207Pb/235U" in individual_ages:
        df_export["Age_207Pb_235U_Ma"] = individual_ages["207Pb/235U"]["ages"]
        df_export["Age_207Pb_235U_2sigma_Ma"] = individual_ages["207Pb/235U"]["2sigma"]

    if "207Pb/206Pb" in individual_ages:
        df_export["Age_207Pb_206Pb_Ma"] = individual_ages["207Pb/206Pb"]["ages"]
        df_export["Age_207Pb_206Pb_2sigma_Ma"] = individual_ages["207Pb/206Pb"]["2sigma"]

    if peak_labels is not None:
        df_export["Age_Group"] = peak_labels
        group_names = {
            i: f"Group_{i+1}_{p.center:.0f}Ma"
            for i, p in enumerate(peak_result.peaks)
        }
        df_export["Age_Group_Name"] = df_export["Age_Group"].map(
            lambda x: group_names.get(x, "Unassigned")
        )

    if origin_classification is not None:
        df_export["Zircon_Origin"] = [o.value for o in origin_classification.origin]
        df_export["Origin_Score"] = origin_classification.scores
        df_export["Th_U_Ratio"] = origin_classification.key_ratios.Th_U
        df_export["U_Yb_Ratio"] = origin_classification.key_ratios.U_Yb
        df_export["Ce_Ce_star"] = origin_classification.key_ratios.Ce_Ce_star

    if provenance_result is not None:
        prov_names = []
        for assignment in (peak_labels if peak_labels is not None else []):
            if assignment >= 0 and assignment < len(provenance_result.matches):
                match = provenance_result.matches[assignment]
                prov_names.append(match.best_match.name if match.best_match else "未匹配")
            else:
                prov_names.append("未匹配")
        if prov_names:
            df_export["Provenance"] = prov_names

    if wm_result.details and "used_indices" in wm_result.details:
        used_mask = np.zeros(len(df_export), dtype=bool)
        used_mask[wm_result.details["used_indices"]] = True
        df_export["Used_In_Weighted_Mean"] = used_mask

    data_path = os.path.join(output_dir, "zircon_ages_with_results.csv")
    df_export.to_csv(data_path, index=False, encoding="utf-8-sig")
    print(f"  完整数据表: {data_path}")

    summary_data = {
        "Parameter": [
            "Concordia Age (Ma)",
            "Concordia Age 2σ (Ma)",
            "Concordia MSWD",
            "Concordia Probability",
            "Weighted Mean Age (Ma)",
            "Weighted Mean 2σ (Ma)",
            "Weighted Mean MSWD",
            "Weighted Mean Probability",
            "Number of Analyses",
            "N Used in Weighted Mean",
            "N Rejected (Outliers)",
            "Number of Age Peaks",
        ],
        "Value": [
            f"{conc_result.age:.2f}",
            f"{conc_result.age_2sigma:.2f}",
            f"{conc_result.mswd:.3f}",
            f"{conc_result.probability:.4f}",
            f"{wm_result.age:.2f}",
            f"{wm_result.age_2sigma:.2f}",
            f"{wm_result.mswd:.3f}",
            f"{wm_result.probability:.4f}",
            len(zircon_data),
            wm_result.n_used,
            wm_result.n_rejected,
            len(peak_result.peaks),
        ],
    }
    summary_df = pd.DataFrame(summary_data)
    summary_path = os.path.join(output_dir, "summary_statistics.csv")
    summary_df.to_csv(summary_path, index=False, encoding="utf-8-sig")
    print(f"  统计摘要表: {summary_path}")

    if peak_result.peaks:
        peak_data = []
        for i, p in enumerate(peak_result.peaks):
            peak_data.append({
                "Peak": i + 1,
                "Center_Age_Ma": f"{p.center:.2f}",
                "Sigma_Ma": f"{p.sigma:.2f}",
                "Age_Range_Lower_Ma": f"{p.age_range[0]:.2f}",
                "Age_Range_Upper_Ma": f"{p.age_range[1]:.2f}",
                "N_Points": p.n_points,
                "Mean_Age_in_Peak_Ma": f"{p.mean_age:.2f}",
                "Median_Age_in_Peak_Ma": f"{p.median_age:.2f}",
            })
        peak_df = pd.DataFrame(peak_data)
        peak_path = os.path.join(output_dir, "age_peaks.csv")
        peak_df.to_csv(peak_path, index=False, encoding="utf-8-sig")
        print(f"  年龄峰值表: {peak_path}")


def write_summary(
    results: dict,
    conc_result: AgeResult,
    wm_result: AgeResult,
    peak_result: MultiPeakResult,
    output_path: str,
):
    """写入文本摘要报告"""
    lines = []
    lines.append("=" * 70)
    lines.append("锆石U-Pb同位素定年数据分析摘要报告")
    lines.append("=" * 70)
    lines.append(f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("")

    lines.append("-" * 40)
    lines.append("年龄计算结果")
    lines.append("-" * 40)
    lines.append(f"和谐年龄 ({conc_result.method}):")
    lines.append(f"  年龄: {conc_result.age:.2f} ± {conc_result.age_2sigma:.2f} Ma (2σ)")
    lines.append(f"  MSWD: {conc_result.mswd:.3f}")
    lines.append(f"  概率: {conc_result.probability:.4f}")
    lines.append(f"  使用分析点数: {conc_result.n_used}")
    lines.append("")

    lines.append(f"加权平均年龄 (Isoplot):")
    lines.append(f"  年龄: {wm_result.age:.2f} ± {wm_result.age_2sigma:.2f} Ma (2σ)")
    lines.append(f"  MSWD: {wm_result.mswd:.3f}")
    lines.append(f"  概率: {wm_result.probability:.4f}")
    lines.append(f"  使用分析点数: {wm_result.n_used}")
    if wm_result.n_rejected > 0:
        lines.append(f"  剔除离群值: {wm_result.n_rejected}")
    lines.append("")

    lines.append("-" * 40)
    lines.append("年龄峰值分解")
    lines.append("-" * 40)
    lines.append(f"检测方法: {peak_result.method}")
    lines.append(f"峰值数量: {len(peak_result.peaks)}")
    lines.append("")

    for i, p in enumerate(peak_result.peaks):
        lines.append(f"峰值 {i + 1}:")
        lines.append(f"  中心年龄: {p.center:.2f} ± {p.sigma:.2f} Ma (2σ)")
        lines.append(f"  年龄范围: {p.age_range[0]:.2f} - {p.age_range[1]:.2f} Ma")
        lines.append(f"  分析点数: {p.n_points}")
        lines.append(f"  峰值内平均年龄: {p.mean_age:.2f} Ma")
        if "provenance" in results and i < len(results["provenance"]["matches"]):
            prov = results["provenance"]["matches"][i]
            lines.append(f"  最佳物源区匹配: {prov.get('best_match', '未知')}")
            lines.append(f"  地质年代: {prov.get('geological_period', '未知')}")
        lines.append("")

    if "origin_discrimination" in results:
        lines.append("-" * 40)
        lines.append("锆石成因类型判别")
        lines.append("-" * 40)
        origins = results["origin_discrimination"]["origins"]
        origin_counts = {}
        for o in origins:
            origin_counts[o] = origin_counts.get(o, 0) + 1
        total = len(origins)
        for o, count in sorted(origin_counts.items(), key=lambda x: x[1], reverse=True):
            lines.append(f"  {o}: {count} ({count/total*100:.1f}%)")
        lines.append("")

    if "provenance" in results:
        lines.append("-" * 40)
        lines.append("物源区分析")
        lines.append("-" * 40)
        for name, pct in sorted(results["provenance"]["percentages"].items(),
                               key=lambda x: x[1], reverse=True):
            count = results["provenance"]["counts"].get(name, 0)
            lines.append(f"  {name}: {pct:.1f}% ({count} 个分析点)")
        lines.append("")

    if "monte_carlo" in results:
        lines.append("-" * 40)
        lines.append("蒙特卡洛不确定性分析")
        lines.append("-" * 40)
        mc = results["monte_carlo"]
        for key, stats in mc.get("summary", {}).items():
            if isinstance(stats, dict):
                lines.append(f"{key}:")
                lines.append(f"  均值: {stats.get('mean', 'N/A')}")
                lines.append(f"  中位数: {stats.get('median', 'N/A')}")
                lines.append(f"  标准差: {stats.get('std', 'N/A')}")
                ci = stats.get('ci_95', (0, 0))
                lines.append(f"  95% CI: [{ci[0]:.2f}, {ci[1]:.2f}]")
        lines.append("")

    lines.append("=" * 70)
    lines.append("报告结束")
    lines.append("=" * 70)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(
        description="锆石U-Pb同位素定年数据处理工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 基本分析
  python zircondating.py -i data.csv -o output/

  # 生成示例数据
  python zircondating.py --sample sample_data.csv

  # 使用Stacey-Kramers铅校正
  python zircondating.py -i data.csv -o output/ --lead-correction --assumed-age 300

  # 使用204Pb铅校正
  python zircondating.py -i data.csv -o output/ --lead-correction --method 204Pb

  # 自定义参数
  python zircondating.py -i data.csv -o output/ --concordia-method tuffzirc --max-peaks 5 --n-mc 10000
        """,
    )

    parser.add_argument(
        "-i", "--input", type=str, help="输入CSV数据文件路径"
    )
    parser.add_argument(
        "-o", "--output", type=str, default="output", help="输出目录 (默认: output)"
    )
    parser.add_argument(
        "--sample", type=str, help="生成示例数据文件"
    )

    parser.add_argument(
        "--lead-correction", action="store_true", help="启用普通铅校正"
    )
    parser.add_argument(
        "--lead-correction-method", type=str, default="stacey_kramers",
        choices=["stacey_kramers", "204Pb"],
        help="铅校正方法 (默认: stacey_kramers)"
    )
    parser.add_argument(
        "--assumed-age", type=float, default=300.0,
        help="Stacey-Kramers校正假设年龄 (Ma, 默认: 300)"
    )

    parser.add_argument(
        "--concordia-method", type=str, default="tuffzirc",
        choices=["tuffzirc", "intercept"],
        help="和谐年龄计算方法 (默认: tuffzirc)"
    )

    parser.add_argument(
        "--filter-concordance", action="store_true",
        help="加权平均前进行谐和度过滤"
    )
    parser.add_argument(
        "--min-concordance", type=float, default=90.0,
        help="最小谐和度 (%) (默认: 90)"
    )
    parser.add_argument(
        "--max-concordance", type=float, default=110.0,
        help="最大谐和度 (%) (默认: 110)"
    )

    parser.add_argument(
        "--no-outlier-rejection", action="store_true",
        help="禁用加权平均中的离群值剔除"
    )
    parser.add_argument(
        "--outlier-threshold", type=float, default=2.5,
        help="离群值剔除阈值 (默认: 2.5)"
    )

    parser.add_argument(
        "--peak-detection-method", type=str, default="iterative",
        choices=["gmm", "iterative"],
        help="峰值检测方法 (默认: iterative)"
    )
    parser.add_argument(
        "--max-peaks", type=int, default=5,
        help="最大峰值数量 (默认: 5)"
    )
    parser.add_argument(
        "--min-peak-distance", type=float, default=50.0,
        help="峰之间最小距离 (Ma, 默认: 50)"
    )
    parser.add_argument(
        "--kde-bandwidth", type=float, default=None,
        help="KDE带宽 (默认: 自动)"
    )

    parser.add_argument(
        "--no-monte-carlo", action="store_true",
        help="禁用蒙特卡洛模拟"
    )
    parser.add_argument(
        "--n-monte-carlo", type=int, default=5000,
        help="蒙特卡洛模拟次数 (默认: 5000)"
    )

    parser.add_argument(
        "--output-format", type=str, default="pdf",
        choices=["pdf", "svg", "png"],
        help="图表输出格式 (默认: pdf)"
    )
    parser.add_argument(
        "--dpi", type=int, default=300,
        help="图表DPI (默认: 300)"
    )
    parser.add_argument(
        "--error-ellipse-sigma", type=float, default=2.0,
        help="误差椭圆倍数 (默认: 2)"
    )
    parser.add_argument(
        "--no-origin-discrimination", action="store_true",
        help="禁用锆石成因类型判别"
    )
    parser.add_argument(
        "--no-provenance-analysis", action="store_true",
        help="禁用物源区分析"
    )

    args = parser.parse_args()

    if args.sample:
        create_sample_data(args.sample)
        return

    if not args.input:
        parser.print_help()
        print("\n错误: 请指定输入文件 (-i) 或生成示例数据 (--sample)")
        sys.exit(1)

    options = {
        "lead_correction": args.lead_correction,
        "lead_correction_method": args.lead_correction_method,
        "assumed_age": args.assumed_age,
        "concordia_method": args.concordia_method,
        "filter_concordance": args.filter_concordance,
        "min_concordance": args.min_concordance,
        "max_concordance": args.max_concordance,
        "outlier_rejection": not args.no_outlier_rejection,
        "outlier_threshold": args.outlier_threshold,
        "peak_detection_method": args.peak_detection_method,
        "max_peaks": args.max_peaks,
        "min_peak_distance": args.min_peak_distance,
        "kde_bandwidth": args.kde_bandwidth,
        "monte_carlo": not args.no_monte_carlo,
        "n_monte_carlo": args.n_monte_carlo,
        "output_format": args.output_format,
        "dpi": args.dpi,
        "error_ellipse_sigma": args.error_ellipse_sigma,
        "origin_discrimination": not args.no_origin_discrimination,
        "provenance_analysis": not args.no_provenance_analysis,
    }

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        results = run_analysis(args.input, args.output, options)

    return results


if __name__ == "__main__":
    main()
