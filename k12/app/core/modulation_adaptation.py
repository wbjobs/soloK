import numpy as np
from typing import List, Dict, Any, Tuple, Optional

MODULATION_CODING_SCHEMES = [
    {"name": "QPSK 1/2", "modulation": "QPSK", "code_rate": 0.5, "threshold": 2.5, "spectral_efficiency": 1.0},
    {"name": "QPSK 3/4", "modulation": "QPSK", "code_rate": 0.75, "threshold": 4.0, "spectral_efficiency": 1.5},
    {"name": "8PSK 1/2", "modulation": "8PSK", "code_rate": 0.5, "threshold": 5.0, "spectral_efficiency": 1.5},
    {"name": "8PSK 2/3", "modulation": "8PSK", "code_rate": 0.667, "threshold": 6.5, "spectral_efficiency": 2.0},
    {"name": "8PSK 3/4", "modulation": "8PSK", "code_rate": 0.75, "threshold": 7.5, "spectral_efficiency": 2.25},
    {"name": "16APSK 2/3", "modulation": "16APSK", "code_rate": 0.667, "threshold": 9.0, "spectral_efficiency": 2.67},
    {"name": "16APSK 3/4", "modulation": "16APSK", "code_rate": 0.75, "threshold": 10.0, "spectral_efficiency": 3.0},
    {"name": "16APSK 5/6", "modulation": "16APSK", "code_rate": 0.833, "threshold": 11.0, "spectral_efficiency": 3.33},
    {"name": "32APSK 3/4", "modulation": "32APSK", "code_rate": 0.75, "threshold": 12.5, "spectral_efficiency": 3.75},
    {"name": "32APSK 4/5", "modulation": "32APSK", "code_rate": 0.8, "threshold": 13.5, "spectral_efficiency": 4.0},
    {"name": "32APSK 5/6", "modulation": "32APSK", "code_rate": 0.833, "threshold": 14.0, "spectral_efficiency": 4.17},
    {"name": "64APSK 3/4", "modulation": "64APSK", "code_rate": 0.75, "threshold": 16.0, "spectral_efficiency": 4.5},
    {"name": "64APSK 4/5", "modulation": "64APSK", "code_rate": 0.8, "threshold": 17.0, "spectral_efficiency": 4.8},
    {"name": "64APSK 5/6", "modulation": "64APSK", "code_rate": 0.833, "threshold": 18.0, "spectral_efficiency": 5.0},
]


def recommend_modulation(link_margin: float, bandwidth: float = 36.0,
                         margin_backoff: float = 1.0) -> Dict[str, Any]:
    effective_margin = link_margin - margin_backoff

    best_scheme = MODULATION_CODING_SCHEMES[0]
    for scheme in MODULATION_CODING_SCHEMES:
        if effective_margin >= scheme["threshold"]:
            best_scheme = scheme

    throughput = bandwidth * 1e6 * best_scheme["spectral_efficiency"]

    return {
        "recommended_scheme": best_scheme["name"],
        "modulation": best_scheme["modulation"],
        "code_rate": best_scheme["code_rate"],
        "required_threshold": best_scheme["threshold"],
        "spectral_efficiency": best_scheme["spectral_efficiency"],
        "available_margin": link_margin,
        "effective_margin": effective_margin,
        "margin_above_threshold": effective_margin - best_scheme["threshold"],
        "throughput_bps": throughput,
        "throughput_mbps": throughput / 1e6
    }


def get_available_schemes(link_margin: float, margin_backoff: float = 1.0) -> List[Dict[str, Any]]:
    effective_margin = link_margin - margin_backoff
    available = []

    for scheme in MODULATION_CODING_SCHEMES:
        if effective_margin >= scheme["threshold"]:
            available.append({
                "scheme": scheme["name"],
                "modulation": scheme["modulation"],
                "code_rate": scheme["code_rate"],
                "threshold": scheme["threshold"],
                "spectral_efficiency": scheme["spectral_efficiency"],
                "margin_surplus": effective_margin - scheme["threshold"]
            })

    return sorted(available, key=lambda x: x["spectral_efficiency"], reverse=True)


def simulate_acm(margin_series: List[float], bandwidth: float = 36.0,
                 margin_backoff: float = 1.0,
                 switch_hysteresis: float = 1.5) -> Dict[str, Any]:
    current_scheme_idx = 0
    scheme_history = []
    throughput_history = []
    switch_events = []

    for t, margin in enumerate(margin_series):
        effective_margin = margin - margin_backoff

        current_threshold = MODULATION_CODING_SCHEMES[current_scheme_idx]["threshold"]

        if effective_margin < current_threshold - switch_hysteresis:
            for i in range(current_scheme_idx - 1, -1, -1):
                if effective_margin >= MODULATION_CODING_SCHEMES[i]["threshold"]:
                    switch_events.append({
                        "time": t,
                        "from_scheme": MODULATION_CODING_SCHEMES[current_scheme_idx]["name"],
                        "to_scheme": MODULATION_CODING_SCHEMES[i]["name"],
                        "reason": "margin_decrease",
                        "margin": margin
                    })
                    current_scheme_idx = i
                    break
        elif effective_margin >= current_threshold + switch_hysteresis:
            for i in range(current_scheme_idx + 1, len(MODULATION_CODING_SCHEMES)):
                if effective_margin < MODULATION_CODING_SCHEMES[i]["threshold"]:
                    break
                switch_events.append({
                    "time": t,
                    "from_scheme": MODULATION_CODING_SCHEMES[current_scheme_idx]["name"],
                    "to_scheme": MODULATION_CODING_SCHEMES[i]["name"],
                    "reason": "margin_increase",
                    "margin": margin
                })
                current_scheme_idx = i

        current_scheme = MODULATION_CODING_SCHEMES[current_scheme_idx]
        scheme_history.append(current_scheme["name"])
        throughput = bandwidth * 1e6 * current_scheme["spectral_efficiency"]
        throughput_history.append(throughput)

    avg_throughput = np.mean(throughput_history)
    total_data = avg_throughput * len(margin_series)

    scheme_stats = {}
    for scheme in MODULATION_CODING_SCHEMES:
        count = scheme_history.count(scheme["name"])
        if count > 0:
            scheme_stats[scheme["name"]] = {
                "usage_percentage": count / len(scheme_history) * 100,
                "count": count
            }

    return {
        "scheme_history": scheme_history,
        "throughput_history": [float(t) for t in throughput_history],
        "switch_events": switch_events,
        "switch_count": len(switch_events),
        "average_throughput_mbps": float(avg_throughput / 1e6),
        "total_data_gb": float(total_data / 8 / 1e9),
        "scheme_statistics": scheme_stats,
        "final_scheme": MODULATION_CODING_SCHEMES[current_scheme_idx]["name"]
    }


def generate_margin_series(duration: int, mean_margin: float = 10.0,
                           std_margin: float = 3.0, fade_depth: float = 10.0,
                           fade_duration: int = 10, fade_interval: int = 100) -> List[float]:
    margins = np.random.normal(mean_margin, std_margin, duration)

    for start in range(0, duration, fade_interval):
        end = min(start + fade_duration, duration)
        fade = np.linspace(0, fade_depth, end - start)
        margins[start:end] -= fade

    return margins.tolist()
