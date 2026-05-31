from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
from midi_parser import parse_midi, filter_by_instrument, export_measures_range
from database import init_db, cache_midi_analysis, get_cached_analysis, get_all_cached_files, get_analysis_by_id

app = Flask(__name__, static_folder='static', static_url_path='/static')
CORS(app)

init_db()

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/upload', methods=['POST'])
def upload_midi():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if not file.filename.lower().endswith('.mid') and not file.filename.lower().endswith('.midi'):
        return jsonify({'error': 'Only .mid or .midi files are allowed'}), 400
    
    file_content = file.read()
    
    cached = get_cached_analysis(file_content)
    if cached:
        return jsonify({
            'cached': True,
            'data': cached
        })
    
    try:
        analysis_data = parse_midi(file_content)
        file_id, file_hash = cache_midi_analysis(file_content, file.filename, analysis_data)
        analysis_data['id'] = file_id
        return jsonify({
            'cached': False,
            'file_hash': file_hash,
            'data': analysis_data
        })
    except Exception as e:
        return jsonify({'error': f'Failed to parse MIDI: {str(e)}'}), 500

@app.route('/api/files', methods=['GET'])
def list_files():
    files = get_all_cached_files()
    return jsonify(files)

@app.route('/api/files/<int:file_id>', methods=['GET'])
def get_file(file_id):
    data = get_analysis_by_id(file_id)
    if data is None:
        return jsonify({'error': 'File not found'}), 404
    return jsonify(data)

@app.route('/api/filter/instrument', methods=['POST'])
def filter_instrument():
    body = request.get_json()
    if not body:
        return jsonify({'error': 'Missing request body'}), 400
    
    file_id = body.get('file_id')
    instrument = body.get('instrument')
    
    if not file_id or not instrument:
        return jsonify({'error': 'Missing file_id or instrument'}), 400
    
    analysis_data = get_analysis_by_id(file_id)
    if analysis_data is None:
        return jsonify({'error': 'File not found'}), 404
    
    filtered = filter_by_instrument(analysis_data, instrument)
    return jsonify(filtered)

@app.route('/api/export/measures', methods=['POST'])
def export_measures():
    body = request.get_json()
    if not body:
        return jsonify({'error': 'Missing request body'}), 400
    
    file_id = body.get('file_id')
    start_measure = body.get('start_measure')
    end_measure = body.get('end_measure')
    
    if not file_id or start_measure is None or end_measure is None:
        return jsonify({'error': 'Missing file_id, start_measure or end_measure'}), 400
    
    analysis_data = get_analysis_by_id(file_id)
    if analysis_data is None:
        return jsonify({'error': 'File not found'}), 404
    
    if start_measure < 1 or end_measure > analysis_data['total_measures'] or start_measure > end_measure:
        return jsonify({'error': f'Invalid measure range. Valid range: 1-{analysis_data["total_measures"]}'}), 400
    
    exported = export_measures_range(analysis_data, start_measure, end_measure)
    return jsonify(exported)

@app.route('/api/report/<int:file_id>', methods=['GET'])
def generate_report(file_id):
    analysis_data = get_analysis_by_id(file_id)
    if analysis_data is None:
        return jsonify({'error': 'File not found'}), 404
    
    velocity_stats = {}
    if analysis_data['notes']:
        velocities = [n['velocity'] for n in analysis_data['notes']]
        velocity_stats = {
            'min': min(velocities),
            'max': max(velocities),
            'avg': sum(velocities) / len(velocities),
            'distribution': {}
        }
        for v in velocities:
            bucket = (v // 16) * 16
            velocity_stats['distribution'][str(bucket)] = velocity_stats['distribution'].get(str(bucket), 0) + 1
    
    note_distribution = {}
    for n in analysis_data['notes']:
        note_name = n['name']
        note_distribution[note_name] = note_distribution.get(note_name, 0) + 1
    
    report = {
        'summary': {
            'total_notes': analysis_data['total_notes'],
            'total_measures': analysis_data['total_measures'],
            'duration_seconds': analysis_data['duration_seconds'],
            'tempo_bpm': analysis_data['tempo_bpm'],
            'time_signature': analysis_data['time_signature'],
            'track_count': len(analysis_data['tracks'])
        },
        'instruments': analysis_data['instrument_types'],
        'tracks': [
            {
                'name': t['name'],
                'note_count': t['note_count'],
                'instruments': [i['name'] for i in t['instruments']]
            }
            for t in analysis_data['tracks']
        ],
        'velocity_stats': velocity_stats,
        'note_distribution': note_distribution
    }
    
    return jsonify(report)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
