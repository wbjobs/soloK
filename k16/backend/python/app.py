from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import numpy as np
import io
import os
from datetime import datetime
import tempfile

from config import Config
from data_processing import DataProcessor
from export_manager import ExportManager
from flutter_analysis import FlutterAnalyzer
from dmd_analysis import DMDAnalyzer

app = Flask(__name__)
CORS(app)

export_manager = ExportManager()
flutter_analyzer = FlutterAnalyzer(sample_rate=Config.SAMPLE_RATE, ar_order=20, ma_order=5)
dmd_analyzer = DMDAnalyzer(sample_rate=Config.SAMPLE_RATE, n_modes=10)

flutter_snapshot_history = []
dmd_snapshot_history = []
current_velocity = 50.0

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.now().isoformat(),
        'service': 'WindTunnel Backend API'
    })

@app.route('/api/calculate/aero-coefficients', methods=['POST'])
def calculate_aero_coefficients():
    data = request.json
    balance_data = data.get('balance_data', [0] * 6)
    velocity = data.get('velocity', Config.DEFAULT_VELOCITY)
    air_density = data.get('air_density', Config.AIR_DENSITY)
    reference_area = data.get('reference_area', Config.REFERENCE_AREA)
    chord_length = data.get('chord_length', Config.CHORD_LENGTH)
    
    coeffs = DataProcessor.calculate_aero_coefficients(
        balance_data, velocity, air_density, reference_area, chord_length
    )
    
    return jsonify(coeffs)

@app.route('/api/process/fft', methods=['POST'])
def process_fft():
    data = request.json
    signal_data = np.array(data.get('signal', []))
    sample_rate = data.get('sample_rate', Config.SAMPLE_RATE)
    window_type = data.get('window_type', 'hann')
    detrend = data.get('detrend', True)
    
    if len(signal_data) == 0:
        return jsonify({'error': 'Empty signal'}), 400
    
    result = DataProcessor.compute_windowed_fft(
        signal_data, sample_rate, window_type, detrend
    )
    return jsonify(result)

@app.route('/api/process/psd', methods=['POST'])
def process_psd():
    data = request.json
    signal_data = np.array(data.get('signal', []))
    sample_rate = data.get('sample_rate', Config.SAMPLE_RATE)
    nperseg = data.get('nperseg', 1024)
    noverlap = data.get('noverlap', None)
    window_type = data.get('window_type', 'hann')
    detrend = data.get('detrend', True)
    min_freq = data.get('min_freq', 10)
    max_freq = data.get('max_freq', 1000)
    
    if len(signal_data) == 0:
        return jsonify({'error': 'Empty signal'}), 400
    
    result = DataProcessor.compute_welch_psd(
        signal_data, sample_rate, nperseg, noverlap, window_type, detrend
    )
    
    vortex_freq = DataProcessor.find_vortex_shedding_freq(
        np.array(result['frequencies']),
        np.array(result['psd']),
        min_freq, max_freq
    )
    result['vortex_shedding_freq'] = vortex_freq
    
    peaks = DataProcessor.find_multiple_peaks(
        np.array(result['frequencies']),
        np.array(result['psd']),
        min_freq, max_freq
    )
    result['peaks'] = peaks
    
    return jsonify(result)

@app.route('/api/process/stft', methods=['POST'])
def process_stft():
    data = request.json
    signal_data = np.array(data.get('signal', []))
    sample_rate = data.get('sample_rate', Config.SAMPLE_RATE)
    nperseg = data.get('nperseg', 1024)
    noverlap = data.get('noverlap', None)
    window_type = data.get('window_type', 'hann')
    
    if len(signal_data) == 0:
        return jsonify({'error': 'Empty signal'}), 400
    
    result = DataProcessor.compute_stft(
        signal_data, sample_rate, nperseg, noverlap, window_type
    )
    return jsonify(result)

@app.route('/api/process/pressure-stats', methods=['POST'])
def process_pressure_stats():
    data = request.json
    pressure_data = np.array(data.get('pressure_data', []))
    
    if len(pressure_data) == 0:
        return jsonify({'error': 'Empty data'}), 400
    
    result = DataProcessor.compute_pressure_statistics(pressure_data)
    return jsonify(result)

@app.route('/api/process/pressure-contour', methods=['POST'])
def process_pressure_contour():
    data = request.json
    channel_values = data.get('channel_values', [])
    grid_size = data.get('grid_size', 50)
    
    if len(channel_values) == 0:
        return jsonify({'error': 'Empty channel values'}), 400
    
    result = DataProcessor.interpolate_pressure_distribution(channel_values, grid_size)
    
    x, y_upper, y_lower = DataProcessor.generate_airfoil_coords()
    result['airfoil_x'] = x.tolist()
    result['airfoil_y_upper'] = y_upper.tolist()
    result['airfoil_y_lower'] = y_lower.tolist()
    
    return jsonify(result)

@app.route('/api/process/quality-control', methods=['POST'])
def process_quality_control():
    data = request.json
    signal_data = np.array(data.get('data', []))
    window_size = data.get('window_size', 100)
    sigma_threshold = data.get('sigma_threshold', 3.0)
    
    if len(signal_data) == 0:
        return jsonify({'error': 'Empty data'}), 400
    
    result = DataProcessor.quality_control(signal_data, window_size, sigma_threshold)
    return jsonify(result)

@app.route('/api/export/csv', methods=['POST'])
def export_csv():
    data = request.json
    export_data = data.get('data', {})
    filename = data.get('filename', f'export_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv')
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        filepath = f.name
    
    try:
        export_manager.export_to_csv(export_data, filepath)
        
        return send_file(
            filepath,
            mimetype='text/csv',
            as_attachment=True,
            download_name=filename
        )
    finally:
        os.unlink(filepath)

@app.route('/api/export/mat', methods=['POST'])
def export_mat():
    data = request.json
    export_data = data.get('data', {})
    filename = data.get('filename', f'export_{datetime.now().strftime("%Y%m%d_%H%M%S")}.mat')
    
    with tempfile.NamedTemporaryFile(suffix='.mat', delete=False) as f:
        filepath = f.name
    
    try:
        export_manager.export_to_mat(export_data, filepath)
        
        return send_file(
            filepath,
            mimetype='application/octet-stream',
            as_attachment=True,
            download_name=filename
        )
    finally:
        os.unlink(filepath)

@app.route('/api/export/report', methods=['POST'])
def export_report():
    data = request.json
    test_info = data.get('test_info', {})
    data_summary = data.get('data_summary', {})
    plots_data = data.get('plots_data', [])
    filename = data.get('filename', f'test_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.pdf')
    
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
        filepath = f.name
    
    try:
        export_manager.generate_test_report(test_info, data_summary, plots_data, filepath)
        
        return send_file(
            filepath,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=filename
        )
    finally:
        os.unlink(filepath)

@app.route('/api/comparison/alpha-curves', methods=['POST'])
def generate_alpha_curves():
    data = request.json
    alpha_values = data.get('alpha_values', [-5, 0, 5, 10, 15, 20, 25, 30])
    
    curves = {
        'alpha': alpha_values,
        'Cl': [],
        'Cd': [],
        'Cm': [],
        'L_over_D': []
    }
    
    for alpha in alpha_values:
        alpha_rad = np.radians(alpha)
        Cl = 2 * np.pi * alpha_rad + 0.1 * np.sin(2 * alpha_rad)
        Cd = 0.01 + 0.05 * (alpha_rad ** 2)
        Cm = -0.1 * alpha_rad
        L_over_D = Cl / Cd if Cd != 0 else 0
        
        curves['Cl'].append(float(Cl))
        curves['Cd'].append(float(Cd))
        curves['Cm'].append(float(Cm))
        curves['L_over_D'].append(float(L_over_D))
    
    return jsonify(curves)

@app.route('/api/flutter/analyze', methods=['POST'])
def analyze_flutter():
    global flutter_snapshot_history, current_velocity
    
    data = request.json
    pressure_data = np.array(data.get('pressure_data', []))
    velocity = data.get('velocity', current_velocity)
    
    if len(pressure_data) == 0:
        return jsonify({'error': 'Empty pressure data'}), 400
    
    channel_idx = data.get('channel_idx', 0)
    if pressure_data.ndim > 1 and pressure_data.shape[1] > 1:
        signal_data = pressure_data[:, channel_idx]
    else:
        signal_data = pressure_data
    
    result = flutter_analyzer.process_pressure_signal(signal_data, velocity)
    
    flutter_snapshot_history.append({
        'timestamp': datetime.now().isoformat(),
        'velocity': velocity,
        'damping_ratio': result['damping_ratio'],
        'flutter_margin': result['flutter_margin']
    })
    
    return jsonify(result)

@app.route('/api/flutter/reset', methods=['POST'])
def reset_flutter_analysis():
    global flutter_snapshot_history
    flutter_analyzer.reset()
    flutter_snapshot_history = []
    return jsonify({'status': 'ok', 'message': 'Flutter analysis reset'})

@app.route('/api/flutter/margin', methods=['GET'])
def get_flutter_margin():
    result = flutter_analyzer.predict_flutter_speed()
    return jsonify({
        'flutter_speed': result.flutter_speed,
        'flutter_margin': result.flutter_margin,
        'damping_ratio': result.damping_ratio,
        'confidence': result.confidence,
        'warning_level': 'safe' if result.flutter_margin > 20 
                       else ('caution' if result.flutter_margin > 10 
                       else ('warning' if result.flutter_margin > 5 
                       else 'danger'))
    })

@app.route('/api/flutter/history', methods=['GET'])
def get_flutter_history():
    return jsonify({
        'history': flutter_snapshot_history[-100:],
        'velocity_history': flutter_analyzer._velocity_data,
        'damping_history': flutter_analyzer._damping_data
    })

@app.route('/api/dmd/analyze', methods=['POST'])
def analyze_dmd():
    global dmd_snapshot_history
    
    data = request.json
    pressure_data = np.array(data.get('pressure_data', []))
    
    if pressure_data.size == 0:
        return jsonify({'error': 'Empty pressure data'}), 400
    
    dmd_analyzer.reset()
    
    n_snapshots = min(100, pressure_data.shape[0] if pressure_data.ndim > 1 else 1)
    
    if pressure_data.ndim > 1 and pressure_data.shape[1] == 128:
        for i in range(0, min(n_snapshots, pressure_data.shape[0]), max(1, pressure_data.shape[0] // 50)):
            dmd_analyzer.add_snapshot(pressure_data[i, :])
    else:
        dmd_analyzer.add_snapshot(pressure_data.flatten())
    
    dmd_result = dmd_analyzer.compute_dmd()
    
    mode_visualizations = []
    for mode in dmd_result.modes[:5]:
        vis = dmd_analyzer.generate_mode_visualization(mode, (4, 32))
        animation_frames = dmd_analyzer.get_mode_animation_frames(mode, 30)
        
        vis['animation_frames'] = [frame.tolist() for frame in animation_frames]
        mode_visualizations.append(vis)
    
    flow_structures = dmd_analyzer.analyze_flow_structures()
    
    dmd_snapshot_history.append({
        'timestamp': datetime.now().isoformat(),
        'n_modes': len(dmd_result.modes),
        'reconstruction_error': dmd_result.reconstruction_error,
        'dominant_frequencies': [m.frequency for m in dmd_result.modes[:3]]
    })
    
    return jsonify({
        'modes': mode_visualizations,
        'reconstruction_error': dmd_result.reconstruction_error,
        'reconstruction_quality': 1.0 - dmd_result.reconstruction_error,
        'optimal_rank': dmd_result.optimal_rank,
        'singular_values': dmd_result.singular_values[:20],
        'cumulative_energy': dmd_result.cumulative_energy[:20],
        'flow_structures': flow_structures
    })

@app.route('/api/dmd/reset', methods=['POST'])
def reset_dmd_analysis():
    global dmd_snapshot_history
    dmd_analyzer.reset()
    dmd_snapshot_history = []
    return jsonify({'status': 'ok', 'message': 'DMD analysis reset'})

@app.route('/api/dmd/history', methods=['GET'])
def get_dmd_history():
    return jsonify({
        'history': dmd_snapshot_history[-50:]
    })

@app.route('/api/analysis/realtime', methods=['POST'])
def realtime_analysis():
    global flutter_snapshot_history, dmd_snapshot_history, current_velocity
    
    data = request.json
    pressure_data = np.array(data.get('pressure_data', []))
    velocity = data.get('velocity', current_velocity)
    current_velocity = velocity
    
    if pressure_data.size == 0:
        return jsonify({'error': 'Empty pressure data'}), 400
    
    channel_idx = data.get('channel_idx', 0)
    
    if pressure_data.ndim > 1:
        signal_data = pressure_data[:, channel_idx] if pressure_data.shape[1] > channel_idx else pressure_data[:, 0]
        spatial_data = pressure_data
    else:
        signal_data = pressure_data
        spatial_data = pressure_data.reshape(1, -1)
    
    flutter_result = flutter_analyzer.process_pressure_signal(signal_data, velocity)
    
    if len(dmd_analyzer._pressure_history) % 10 == 0 or len(dmd_analyzer._pressure_history) < 5:
        dmd_analyzer.add_snapshot(spatial_data[-1] if spatial_data.ndim > 1 else spatial_data)
    
    dmd_summary = dmd_analyzer.analyze_flow_structures()
    
    return jsonify({
        'flutter': flutter_result,
        'dmd': dmd_summary,
        'velocity': velocity,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/config', methods=['GET'])
def get_config():
    return jsonify({
        'pressure_channels': Config.PRESSURE_CHANNELS,
        'balance_channels': Config.BALANCE_CHANNELS,
        'mic_channels': Config.MIC_CHANNELS,
        'sample_rate': Config.SAMPLE_RATE,
        'air_density': Config.AIR_DENSITY,
        'reference_area': Config.REFERENCE_AREA,
        'chord_length': Config.CHORD_LENGTH,
        'default_velocity': Config.DEFAULT_VELOCITY,
        'flutter': {
            'ar_order': 20,
            'ma_order': 5,
            'warning_thresholds': {
                'safe': 20,
                'caution': 10,
                'warning': 5,
                'danger': 0
            }
        },
        'dmd': {
            'n_modes': 10,
            'optimal_rank': None,
            'energy_threshold': 0.99
        }
    })

if __name__ == '__main__':
    print(f'Starting WindTunnel API server on {Config.FLASK_HOST}:{Config.FLASK_PORT}')
    app.run(host=Config.FLASK_HOST, port=Config.FLASK_PORT, debug=True)
