"""
普通铅校正模块
基于实测204Pb或Stacey-Kramers模型进行普通铅校正
"""

import numpy as np
from dataclasses import dataclass
from typing import Tuple, Optional

LAMBDA232 = 4.9475e-11
LAMBDA238 = 1.55125e-10
LAMBDA235 = 9.8485e-10
U238_U235 = 137.88


@dataclass
class LeadCorrectionResult:
    """普通铅校正结果"""
    r68_corrected: np.ndarray
    s68_corrected: np.ndarray
    r75_corrected: np.ndarray
    s75_corrected: np.ndarray
    r76_corrected: np.ndarray
    s76_corrected: np.ndarray
    correction_method: str
    correction_details: dict


def stacey_kramers_pb_isotope_ratios(t_ma: float) -> Tuple[float, float, float]:
    """
    Stacey-Kramers两阶段铅演化模型
    计算给定年龄的普通铅同位素比值

    参数:
        t_ma: 样品年龄 (Ma), 0表示现代

    返回:
        (206Pb/204Pb, 207Pb/204Pb, 208Pb/204Pb)
    """
    T_earth = 4.57e9
    T_stage1 = 0.87e9

    mu1 = 9.307
    mu2 = 9.730
    w1 = 35.49
    w2 = 36.14

    a0 = 11.152
    b0 = 12.998
    c0 = 29.486

    t = T_earth - t_ma * 1e6

    if t <= T_stage1:
        r206_204 = a0 + mu1 * (np.exp(LAMBDA238 * t) - 1.0)
        r207_204 = b0 + (mu1 / U238_U235) * (np.exp(LAMBDA235 * t) - 1.0)
        r208_204 = c0 + w1 * (np.exp(LAMBDA232 * t) - 1.0)
    else:
        dt2 = t - T_stage1
        r206_204 = (
            a0
            + mu1 * (np.exp(LAMBDA238 * T_stage1) - 1.0)
            + mu2 * (np.exp(LAMBDA238 * dt2) - 1.0)
        )
        r207_204 = (
            b0
            + (mu1 / U238_U235) * (np.exp(LAMBDA235 * T_stage1) - 1.0)
            + (mu2 / U238_U235) * (np.exp(LAMBDA235 * dt2) - 1.0)
        )
        r208_204 = (
            c0
            + w1 * (np.exp(LAMBDA232 * T_stage1) - 1.0)
            + w2 * (np.exp(LAMBDA232 * dt2) - 1.0)
        )

    return r206_204, r207_204, r208_204


def stacey_kramers_207Pb_206Pb(t_ma: float) -> float:
    """
    计算Stacey-Kramers模型下的207Pb/206Pb比值

    参数:
        t_ma: 年龄 (Ma)

    返回:
        207Pb/206Pb 比值
    """
    r206_204, r207_204, _ = stacey_kramers_pb_isotope_ratios(t_ma)
    return r207_204 / r206_204


def correct_using_204Pb(
    r68: np.ndarray,
    s68: np.ndarray,
    r75: np.ndarray,
    s75: np.ndarray,
    r76: np.ndarray,
    s76: np.ndarray,
    r204_206: np.ndarray,
    s204_206: np.ndarray,
    common_pb_r76_204: float = 0.0,
) -> LeadCorrectionResult:
    """
    基于实测204Pb的普通铅校正

    参数:
        r68: 206Pb/238U 比值数组
        s68: 206Pb/238U 1σ 数组
        r75: 207Pb/235U 比值数组
        s75: 207Pb/235U 1σ 数组
        r76: 207Pb/206Pb 比值数组
        s76: 207Pb/206Pb 1σ 数组
        r204_206: 204Pb/206Pb 比值数组
        s204_206: 204Pb/206Pb 1σ 数组
        common_pb_r76_204: 普通铅的207Pb/204Pb比值

    返回:
        LeadCorrectionResult
    """
    n = len(r68)

    r206_204_common = 1.0 / r204_206 if r204_206[0] > 0 else 18.0
    r207_204_common = common_pb_r76_204 if common_pb_r76_204 > 0 else 15.5

    r68_corr = np.zeros(n)
    s68_corr = np.zeros(n)
    r75_corr = np.zeros(n)
    s75_corr = np.zeros(n)
    r76_corr = np.zeros(n)
    s76_corr = np.zeros(n)

    for i in range(n):
        r68_measured = r68[i]
        r75_measured = r75[i]
        r76_measured = r76[i]

        r204_206_measured = r204_206[i] if i < len(r204_206) else 0.001

        r206_204_measured = 1.0 / max(r204_206_measured, 1e-10)

        r206pb_total = 1.0
        r206pb_common = r204_206_measured * r206_204_common
        r206pb_radiogenic = r206pb_total - r206pb_common

        r207pb_total = r76_measured
        r207pb_common = r204_206_measured * r207_204_common
        r207pb_radiogenic = r207pb_total - r207pb_common

        if r206pb_radiogenic > 0 and r207pb_radiogenic > 0:
            correction_factor = r206pb_radiogenic / r206pb_total
            correction_factor_75 = r207pb_radiogenic / r207pb_total if r207pb_total > 0 else 1.0

            r68_corr[i] = r68_measured / correction_factor
            r75_corr[i] = r75_measured / correction_factor_75
            r76_corr[i] = r207pb_radiogenic / max(r206pb_radiogenic, 1e-10)

            rel_err_204 = s204_206[i] / max(r204_206[i], 1e-10) if i < len(s204_206) else 0.05
            s68_corr[i] = s68[i] * np.sqrt(1.0 + rel_err_204 ** 2)
            s75_corr[i] = s75[i] * np.sqrt(1.0 + rel_err_204 ** 2)
            s76_corr[i] = s76[i] * np.sqrt(2.0) if s76[i] > 0 else 0.01
        else:
            r68_corr[i] = r68[i]
            s68_corr[i] = s68[i]
            r75_corr[i] = r75[i]
            s75_corr[i] = s75[i]
            r76_corr[i] = r76[i]
            s76_corr[i] = s76[i]

    details = {
        "method": "204Pb-based",
        "common_206Pb/204Pb": r206_204_common,
        "common_207Pb/204Pb": r207_204_common,
        "n_corrected": n,
    }

    return LeadCorrectionResult(
        r68_corrected=r68_corr,
        s68_corrected=s68_corr,
        r75_corrected=r75_corr,
        s75_corrected=s75_corr,
        r76_corrected=r76_corr,
        s76_corrected=s76_corr,
        correction_method="204Pb",
        correction_details=details,
    )


def correct_using_stacey_kramers(
    r68: np.ndarray,
    s68: np.ndarray,
    r75: np.ndarray,
    s75: np.ndarray,
    r76: np.ndarray,
    s76: np.ndarray,
    assumed_age_ma: float,
) -> LeadCorrectionResult:
    """
    基于Stacey-Kramers模型的普通铅校正

    参数:
        r68: 206Pb/238U 比值数组
        s68: 206Pb/238U 1σ 数组
        r75: 207Pb/235U 比值数组
        s75: 207Pb/235U 1σ 数组
        r76: 207Pb/206Pb 比值数组
        s76: 207Pb/206Pb 1σ 数组
        assumed_age_ma: 假设的年龄 (Ma)

    返回:
        LeadCorrectionResult
    """
    n = len(r68)

    r206_204_common, r207_204_common, _ = stacey_kramers_pb_isotope_ratios(
        assumed_age_ma
    )
    r76_common = r207_204_common / r206_204_common

    r68_corr = np.zeros(n)
    s68_corr = np.zeros(n)
    r75_corr = np.zeros(n)
    s75_corr = np.zeros(n)
    r76_corr = np.zeros(n)
    s76_corr = np.zeros(n)

    for i in range(n):
        r76_measured = r76[i]

        r68_corr[i] = r68[i]
        s68_corr[i] = s68[i]

        if r76_measured > r76_common:
            r76_corr[i] = r76_measured - r76_common
            r75_corr[i] = r75[i] * (1.0 - r76_common / max(r76_measured, 1e-10))
        else:
            r76_corr[i] = r76_measured
            r75_corr[i] = r75[i]

        s75_corr[i] = s75[i]
        s76_corr[i] = np.sqrt(s76[i] ** 2 + (0.001) ** 2)

    details = {
        "method": "Stacey-Kramers",
        "assumed_age_Ma": assumed_age_ma,
        "common_207Pb/206Pb": r76_common,
        "common_206Pb/204Pb": r206_204_common,
        "common_207Pb/204Pb": r207_204_common,
        "n_corrected": n,
    }

    return LeadCorrectionResult(
        r68_corrected=r68_corr,
        s68_corrected=s68_corr,
        r75_corrected=r75_corr,
        s75_corrected=s75_corr,
        r76_corrected=r76_corr,
        s76_corrected=s76_corr,
        correction_method="Stacey-Kramers",
        correction_details=details,
    )


def common_lead_correction_summary(result: LeadCorrectionResult) -> str:
    """
    生成普通铅校正摘要

    参数:
        result: LeadCorrectionResult

    返回:
        格式化摘要字符串
    """
    lines = []
    lines.append("=" * 70)
    lines.append("Common Lead Correction Results")
    lines.append("=" * 70)
    lines.append(f"Method: {result.correction_method}")

    for key, value in result.correction_details.items():
        lines.append(f"  {key}: {value}")

    lines.append("")
    lines.append("Corrected ratios (mean ± std):")
    lines.append(f"  206Pb/238U: {np.mean(result.r68_corrected):.6f} ± {np.std(result.r68_corrected):.6f}")
    lines.append(f"  207Pb/235U: {np.mean(result.r75_corrected):.6f} ± {np.std(result.r75_corrected):.6f}")
    lines.append(f"  207Pb/206Pb: {np.mean(result.r76_corrected):.6f} ± {np.std(result.r76_corrected):.6f}")
    lines.append("=" * 70)

    return "\n".join(lines)
