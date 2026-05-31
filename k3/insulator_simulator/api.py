"""
Flask API 模块

提供绝缘子串风偏角仿真计算 RESTful API

内存优化:
  - 扫描结果采用精简结构
  - 限制最大扫描点数
  - 及时清理临时数据
"""

import base64
import gc
import io
import numpy as np
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

from .iec_wind import IECWindLoad
from .statics import InsulatorStatics
from .kaimal_wind import generate_wind_speed_series
from .timeseries_simulator import (
    TimeSeriesSimulator, FatigueAnalyzer,
    rainflow_count, estimate_fatigue_life,
)
from .visualization import (
    plot_deflection, plot_stress_distribution, plot_contour,
    plot_deflection_vs_wind,
    plot_wind_speed_timehistory, plot_deflection_timehistory,
    plot_fatigue_analysis,
)
from .storage import HistoryStorage
from .validation import ParameterValidator
from .pdf_report import PDFReport

app = Flask(__name__)
CORS(app)

storage = HistoryStorage()
validator = ParameterValidator()

MAX_SCAN_POINTS = 10000
COMPACT_RESULT_KEYS = (
    "deflection_angle_deg", "safe", "arm_stress_pa", "wind_force_n"
)


def _build_statics(params: dict) -> InsulatorStatics:
    return InsulatorStatics(
        string_type=params.get("string_type", "I"),
        string_length=params.get("string_length", 3.0),
        v_angle_deg=params.get("v_angle", 45.0),
        conductor_tension=params.get("conductor_tension", 30000.0),
        span_length=params.get("span_length", 300.0),
        conductor_diameter=params.get("conductor_diameter", 0.03),
        insulator_diameter=params.get("insulator_diameter", 0.05),
        ring_diameter=params.get("ring_diameter", 0.3),
    )


def _build_wind_loader(params: dict) -> IECWindLoad:
    return IECWindLoad(
        terrain_category=params.get("terrain_category", "B"),
        structure_height=params.get("structure_height", 20.0),
    )


def _serialize_result(result: dict, stress_data: list) -> dict:
    return {
        **result,
        "stress_distribution": stress_data,
    }


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "insulator-simulator"})


@app.route("/api/simulate", methods=["POST"])
def simulate():
    params = request.get_json(force=True)
    if not params:
        return jsonify({"error": "请求体不能为空"}), 400

    validation = validator.validate_simulate(params)
    if not validation.valid:
        return jsonify({
            "error": "参数校验失败",
            "validation": validation.to_dict(),
        }), 422

    try:
        statics = _build_statics(params)
        wind_loader = _build_wind_loader(params)

        wind_data = {
            "insulator": wind_loader.insulator_wind_load(
                params["wind_speed"], params["wind_angle"],
                statics.L, statics.d_i, statics.d_r),
            "conductor": wind_loader.conductor_wind_load(
                params["wind_speed"], params["wind_angle"],
                statics.d_c, statics.span),
        }

        result = statics.calculate(
            params["wind_speed"], params["wind_angle"], wind_data)
        stress_data = statics.stress_distribution(result)
        result_vr = validator.validate_result(result)

        images = {}
        try:
            images["deflection_plot"] = plot_deflection(
                result, statics.L, statics.string_type,
                params.get("v_angle", 45.0))
        except Exception as e:
            images["deflection_plot_error"] = str(e)

        try:
            images["stress_plot"] = plot_stress_distribution(stress_data, result)
        except Exception as e:
            images["stress_plot_error"] = str(e)

        try:
            images["wind_curve_plot"] = plot_deflection_vs_wind(result)
        except Exception as e:
            images["wind_curve_plot_error"] = str(e)

        sim_id = storage.save_simulation(params, result)

        response = {
            "simulation_id": sim_id,
            "params": params,
            "result": _serialize_result(result, stress_data),
            "validation": validation.to_dict(),
            "result_validation": result_vr.to_dict(),
            "images": images,
        }

        return jsonify(response)

    except Exception as e:
        return jsonify({"error": f"仿真计算失败: {str(e)}"}), 500


@app.route("/api/scan", methods=["POST"])
def scan():
    params = request.get_json(force=True)
    if not params:
        return jsonify({"error": "请求体不能为空"}), 400

    validation = validator.validate_scan(params)
    if not validation.valid:
        return jsonify({
            "error": "参数校验失败",
            "validation": validation.to_dict(),
        }), 422

    try:
        v_min, v_max, v_step = params["wind_speed_range"]
        a_min, a_max, a_step = params["wind_angle_range"]

        wind_speeds = np.arange(v_min, v_max + v_step / 2, v_step)
        wind_angles = np.arange(a_min, a_max + a_step / 2, a_step)

        n_total = len(wind_speeds) * len(wind_angles)
        if n_total > MAX_SCAN_POINTS:
            return jsonify({
                "error": f"扫描点数过多: {n_total} > {MAX_SCAN_POINTS}, "
                         f"请增大步长以减少计算量",
            }), 413

        statics = _build_statics(params)
        wind_loader = _build_wind_loader(params)

        n_v = len(wind_speeds)
        n_a = len(wind_angles)

        compact_2d = []
        max_angle = 0.0
        max_cell = None
        safe_count = 0

        for i, v in enumerate(wind_speeds):
            row = []
            for j, a in enumerate(wind_angles):
                ins_load = wind_loader.insulator_wind_load(
                    v, a, statics.L, statics.d_i, statics.d_r)
                cond_load = wind_loader.conductor_wind_load(
                    v, a, statics.d_c, statics.span)
                wind_data = {
                    "insulator": ins_load,
                    "conductor": cond_load,
                }

                r = statics.calculate(v, a, wind_data)

                angle = r["deflection_angle_deg"]
                if angle > max_angle:
                    max_angle = angle
                    max_cell = {"wind_speed": float(v), "wind_angle": float(a)}
                if r["safe"]:
                    safe_count += 1

                row.append({
                    "deflection_angle_deg": angle,
                    "safe": r["safe"],
                    "arm_stress_pa": r["arm_stress_pa"],
                    "wind_force_n": r["wind_force_n"],
                })

                del r, wind_data, ins_load, cond_load

            compact_2d.append(row)

        safe_ratio = safe_count / n_total if n_total > 0 else 0

        contour_b64 = plot_contour(
            compact_2d, wind_speeds.tolist(), wind_angles.tolist(),
            statics.string_type)

        scan_id = storage.save_scan(params, {
            "wind_speeds": wind_speeds.tolist(),
            "wind_angles": wind_angles.tolist(),
            "results": compact_2d,
        })

        response = {
            "scan_id": scan_id,
            "params": params,
            "wind_speeds": wind_speeds.tolist(),
            "wind_angles": wind_angles.tolist(),
            "results": compact_2d,
            "summary": {
                "max_deflection_deg": max_angle,
                "max_location": max_cell,
                "safe_count": safe_count,
                "total_count": n_total,
                "safe_ratio": safe_ratio,
            },
            "contour_plot": contour_b64,
        }

        del compact_2d, contour_b64
        gc.collect()

        return jsonify(response)

    except Exception as e:
        return jsonify({"error": f"参数扫描失败: {str(e)}"}), 500


@app.route("/api/history", methods=["GET"])
def get_history():
    limit = request.args.get("limit", 50, type=int)
    limit = min(limit, 200)
    records = storage.get_history(limit)
    return jsonify({"count": len(records), "records": records})


@app.route("/api/history/<int:sim_id>", methods=["GET"])
def get_history_item(sim_id):
    record = storage.get_by_id(sim_id)
    if record is None:
        return jsonify({"error": "记录不存在"}), 404
    return jsonify(record)


@app.route("/api/compare", methods=["POST"])
def compare():
    data = request.get_json(force=True)
    sim_id = data.get("simulation_id")
    if sim_id is None:
        return jsonify({"error": "缺少 simulation_id"}), 400

    current_params = data.get("params", {})
    validation = validator.validate_simulate(current_params)
    if not validation.valid:
        return jsonify({
            "error": "参数校验失败",
            "validation": validation.to_dict(),
        }), 422

    try:
        statics = _build_statics(current_params)
        wind_loader = _build_wind_loader(current_params)
        wind_data = {
            "insulator": wind_loader.insulator_wind_load(
                current_params["wind_speed"], current_params["wind_angle"],
                statics.L, statics.d_i, statics.d_r),
            "conductor": wind_loader.conductor_wind_load(
                current_params["wind_speed"], current_params["wind_angle"],
                statics.d_c, statics.span),
        }
        current_result = statics.calculate(
            current_params["wind_speed"], current_params["wind_angle"],
            wind_data)

        comparison = storage.compare_with_history(current_result, sim_id)
        return jsonify(comparison)

    except Exception as e:
        return jsonify({"error": f"对比分析失败: {str(e)}"}), 500


@app.route("/api/export_pdf", methods=["POST"])
def export_pdf():
    data = request.get_json(force=True)
    sim_id = data.get("simulation_id")

    if sim_id is not None:
        record = storage.get_by_id(sim_id)
        if record is None:
            return jsonify({"error": "记录不存在"}), 404
        params = record["params"]
        result = record["result"]
    else:
        params = data.get("params", {})
        result = data.get("result")
        if result is None:
            return jsonify({"error": "需要 simulation_id 或 result"}), 400

    validation = data.get("validation", {})

    images = {}
    if data.get("include_images", True):
        try:
            statics = _build_statics(params)
            stress_data = statics.stress_distribution(result)
            images["风偏角示意图"] = plot_deflection(
                result, statics.L, statics.string_type,
                params.get("v_angle", 45.0))
            images["应力分布图"] = plot_stress_distribution(
                stress_data, result)
        except Exception:
            pass

    pdf_gen = PDFReport()
    pdf_bytes = pdf_gen.generate(params, result, images, validation)

    return send_file(
        io.BytesIO(pdf_bytes),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"insulator_report_{sim_id or 'custom'}.pdf",
    )


@app.route("/api/export_pdf_base64", methods=["POST"])
def export_pdf_base64():
    data = request.get_json(force=True)
    sim_id = data.get("simulation_id")

    if sim_id is not None:
        record = storage.get_by_id(sim_id)
        if record is None:
            return jsonify({"error": "记录不存在"}), 404
        params = record["params"]
        result = record["result"]
    else:
        params = data.get("params", {})
        result = data.get("result")
        if result is None:
            return jsonify({"error": "需要 simulation_id 或 result"}), 400

    validation = data.get("validation", {})

    images = {}
    if data.get("include_images", True):
        try:
            statics = _build_statics(params)
            stress_data = statics.stress_distribution(result)
            images["风偏角示意图"] = plot_deflection(
                result, statics.L, statics.string_type,
                params.get("v_angle", 45.0))
            images["应力分布图"] = plot_stress_distribution(
                stress_data, result)
        except Exception:
            pass

    pdf_gen = PDFReport()
    pdf_bytes = pdf_gen.generate(params, result, images, validation)
    b64 = base64.b64encode(pdf_bytes).decode("utf-8")

    return jsonify({
        "pdf_base64": b64,
        "filename": f"insulator_report_{sim_id or 'custom'}.pdf",
        "size_bytes": len(pdf_bytes),
    })


# ============================================================
#  时程模拟 & 疲劳分析 API
# ============================================================

@app.route("/api/timeseries", methods=["POST"])
def timeseries():
    """
    10分钟风偏角时程模拟 (Kaimal谱)

    请求参数:
        mean_speed: 平均风速 (m/s), 0-60
        turbulence_intensity: 湍流强度, 0.05-0.30, 默认 0.12
        duration: 模拟时长 (s), 默认 600 (10分钟)
        dt: 时间步长 (s), 默认 0.25
        seed: 随机数种子 (可选)
        wind_angle: 风向角 (度), 默认 90
        string_type: 串型 I/V/VV
        string_length: 串长 (m)
        v_angle: V串半角 (度)
        conductor_tension: 导线张力 (N)
        terrain_category: 地形类别 A/B/C/D
    """
    params = request.get_json(force=True)
    if not params:
        return jsonify({"error": "请求体不能为空"}), 400

    mean_speed = params.get("mean_speed")
    if mean_speed is None or mean_speed < 0 or mean_speed > 60:
        return jsonify({"error": "mean_speed 范围: 0-60 m/s"}), 422

    ti = params.get("turbulence_intensity", 0.12)
    if ti < 0.03 or ti > 0.5:
        return jsonify({"error": "turbulence_intensity 范围: 0.03-0.50"}), 422

    duration = params.get("duration", 600.0)
    if duration < 10 or duration > 7200:
        return jsonify({"error": "duration 范围: 10-7200 s"}), 422

    dt = params.get("dt", 0.25)
    if dt < 0.01 or dt > 5.0:
        return jsonify({"error": "dt 范围: 0.01-5.0 s"}), 422

    seed = params.get("seed", None)
    wind_angle = params.get("wind_angle", 90.0)
    height = params.get("structure_height", 20.0)

    try:
        wind_series = generate_wind_speed_series(
            mean_speed=mean_speed,
            turbulence_intensity=ti,
            duration=duration,
            dt=dt,
            height=height,
            seed=seed,
        )

        statics = _build_statics(params)
        wind_loader = _build_wind_loader(params)

        ts = TimeSeriesSimulator(statics, wind_loader)
        deflection_result = ts.simulate_deflection_series(
            wind_series["speed_m_s"], wind_angle)

        fatigue_analyzer = FatigueAnalyzer()
        fatigue_result = fatigue_analyzer.fatigue_from_deflection(
            deflection_result["deflection_deg"],
            deflection_result["statistics"].get("mean_deg", 0),
        )

        life_result = estimate_fatigue_life(
            fatigue_result["damage_analysis"],
            simulation_duration_h=duration / 3600.0,
            design_life_years=30.0,
        )
        fatigue_result["fatigue_life"] = life_result

        images = {}
        try:
            images["wind_speed_plot"] = plot_wind_speed_timehistory(
                wind_series)
        except Exception as e:
            images["wind_speed_plot_error"] = str(e)

        try:
            images["deflection_plot"] = plot_deflection_timehistory(
                deflection_result, wind_series["time_s"])
        except Exception as e:
            images["deflection_plot_error"] = str(e)

        try:
            images["fatigue_plot"] = plot_fatigue_analysis(fatigue_result)
        except Exception as e:
            images["fatigue_plot_error"] = str(e)

        response = {
            "params": params,
            "wind_series": {
                k: v for k, v in wind_series.items()
                if k not in ("time_s", "speed_m_s", "fluctuation_m_s",
                              "psd_freq_hz", "psd_power_m2_s",
                              "target_spectrum_freq_hz", "target_spectrum_power")
            },
            "deflection_result": {
                "statistics": deflection_result["statistics"],
                "exceedance_probability": deflection_result["exceedance_probability"],
                "percentiles": deflection_result["percentiles"],
                "threshold_deg": deflection_result["threshold_deg"],
            },
            "fatigue_result": {
                "damage_analysis": fatigue_result["damage_analysis"],
                "fatigue_life": fatigue_result["fatigue_life"],
                "rainflow_cycles_count": len(fatigue_result.get("rainflow_cycles", [])),
            },
            "images": images,
        }

        return jsonify(response)

    except Exception as e:
        import traceback
        return jsonify({
            "error": f"时程模拟失败: {str(e)}",
            "traceback": traceback.format_exc(),
        }), 500


@app.route("/api/fatigue", methods=["POST"])
def fatigue():
    """
    独立疲劳损伤评估接口

    请求参数:
        deflection_series: 风偏角时程数组 (度)
        stress_conversion: 张力-应力换算系数, 默认 1.0e6
        design_life_years: 设计寿命 (年), 默认 30
    """
    data = request.get_json(force=True)
    if not data:
        return jsonify({"error": "请求体不能为空"}), 400

    deflection_series = data.get("deflection_series")
    if deflection_series is None or len(deflection_series) < 10:
        return jsonify({"error": "deflection_series 需要至少10个数据点"}), 422

    try:
        fatigue_analyzer = FatigueAnalyzer()
        fatigue_result = fatigue_analyzer.fatigue_from_deflection(
            deflection_series,
            data.get("arm_tension_n", 30000.0),
            data.get("stress_conversion", 1.0e6),
        )

        duration_h = data.get("duration_hours", 0.167)
        design_life = data.get("design_life_years", 30.0)
        life_result = estimate_fatigue_life(
            fatigue_result["damage_analysis"],
            simulation_duration_h=duration_h,
            design_life_years=design_life,
        )
        fatigue_result["fatigue_life"] = life_result

        images = {}
        try:
            images["fatigue_plot"] = plot_fatigue_analysis(fatigue_result)
        except Exception as e:
            images["fatigue_plot_error"] = str(e)

        return jsonify({
            "fatigue_result": fatigue_result,
            "images": images,
        })

    except Exception as e:
        import traceback
        return jsonify({
            "error": f"疲劳评估失败: {str(e)}",
            "traceback": traceback.format_exc(),
        }), 500


@app.route("/api/generate_wind", methods=["POST"])
def generate_wind():
    """
    独立 Kaimal 风速时程生成接口

    请求参数:
        mean_speed: 平均风速 (m/s)
        turbulence_intensity: 湍流强度
        duration: 模拟时长 (s)
        dt: 时间步长 (s)
        seed: 随机数种子
    """
    params = request.get_json(force=True)
    if not params:
        return jsonify({"error": "请求体不能为空"}), 400

    try:
        wind_series = generate_wind_speed_series(
            mean_speed=params.get("mean_speed", 15.0),
            turbulence_intensity=params.get("turbulence_intensity", 0.12),
            duration=params.get("duration", 600.0),
            dt=params.get("dt", 0.25),
            height=params.get("structure_height", 20.0),
            seed=params.get("seed"),
        )

        images = {}
        try:
            images["wind_speed_plot"] = plot_wind_speed_timehistory(
                wind_series)
        except Exception as e:
            images["wind_speed_plot_error"] = str(e)

        return jsonify({
            "wind_series": wind_series,
            "images": images,
        })

    except Exception as e:
        return jsonify({"error": f"风速生成失败: {str(e)}"}), 500


@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "接口不存在"}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "服务器内部错误"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
