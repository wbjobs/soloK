import os
import uuid
import time
from functools import wraps
from flask import Flask, request, jsonify, g
from werkzeug.utils import secure_filename
from config import Config
from models import db, AnalysisTask, CodeSmell
from celery_app import make_celery
from repo_handler import RepositoryHandler


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)

    celery = make_celery(app)
    app.celery = celery

    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    rate_limit_store = {}

    def require_api_key(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            api_key = request.headers.get('X-API-Key')
            
            if not api_key:
                return jsonify({'error': 'API Key is required'}), 401
            
            if api_key not in app.config['API_KEYS']:
                return jsonify({'error': 'Invalid API Key'}), 401
            
            g.api_key = api_key
            return f(*args, **kwargs)
        
        return decorated_function

    def rate_limit(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            api_key = g.get('api_key', 'anonymous')
            current_time = time.time()
            
            if api_key not in rate_limit_store:
                rate_limit_store[api_key] = []
            
            request_times = rate_limit_store[api_key]
            request_times = [t for t in request_times 
                           if current_time - t < app.config['RATE_LIMIT_PERIOD']]
            rate_limit_store[api_key] = request_times
            
            if len(request_times) >= app.config['RATE_LIMIT']:
                return jsonify({
                    'error': 'Rate limit exceeded',
                    'limit': app.config['RATE_LIMIT'],
                    'period_seconds': app.config['RATE_LIMIT_PERIOD']
                }), 429
            
            request_times.append(current_time)
            return f(*args, **kwargs)
        
        return decorated_function

    @app.route('/api/health', methods=['GET'])
    def health_check():
        return jsonify({
            'status': 'healthy',
            'service': 'code-smell-detector-api',
            'version': '1.0.0'
        })

    @app.route('/api/analyze', methods=['POST'])
    @require_api_key
    @rate_limit
    def analyze_repository():
        source_type = None
        source = None
        temp_zip_path = None
        base_commit = None

        if 'file' in request.files:
            file = request.files['file']
            if file.filename == '':
                return jsonify({'error': 'No file selected'}), 400
            
            if not file.filename.endswith('.zip'):
                return jsonify({'error': 'Only ZIP files are allowed'}), 400
            
            filename = secure_filename(file.filename)
            task_id = str(uuid.uuid4())
            temp_zip_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{task_id}_{filename}")
            file.save(temp_zip_path)
            
            source_type = 'zip'
            source = filename
        
        elif request.is_json:
            data = request.get_json()
            github_url = data.get('github_url')
            base_commit = data.get('base_commit')
            
            if not github_url:
                return jsonify({'error': 'github_url is required'}), 400
            
            repo_handler = RepositoryHandler()
            if not repo_handler.is_valid_github_url(github_url):
                return jsonify({'error': 'Invalid GitHub URL'}), 400

            if base_commit:
                if not isinstance(base_commit, str) or len(base_commit) > 40:
                    return jsonify({'error': 'Invalid base_commit hash'}), 400
            
            source_type = 'github'
            source = github_url
            task_id = str(uuid.uuid4())
        
        else:
            return jsonify({
                'error': 'Either upload a ZIP file or provide a GitHub URL'
            }), 400

        task = AnalysisTask(
            id=task_id,
            status='pending',
            source_type=source_type,
            source=source,
            is_incremental=bool(base_commit),
            base_commit=base_commit
        )
        db.session.add(task)
        db.session.commit()

        from tasks import analyze_repository
        analyze_repository.delay(task_id, source_type, source, temp_zip_path, base_commit)

        response = {
            'task_id': task_id,
            'status': 'pending',
            'message': 'Analysis task has been queued'
        }
        if base_commit:
            response['is_incremental'] = True
            response['base_commit'] = base_commit

        return jsonify(response), 202

    @app.route('/api/tasks/<task_id>', methods=['GET'])
    @require_api_key
    @rate_limit
    def get_task_status(task_id):
        task = AnalysisTask.query.get(task_id)
        
        if not task:
            return jsonify({'error': 'Task not found'}), 404
        
        return jsonify(task.to_dict())

    @app.route('/api/tasks/<task_id>/results', methods=['GET'])
    @require_api_key
    @rate_limit
    def get_task_results(task_id):
        task = AnalysisTask.query.get(task_id)
        
        if not task:
            return jsonify({'error': 'Task not found'}), 404
        
        if task.status != 'completed':
            return jsonify({
                'error': 'Task not completed',
                'status': task.status
            }), 400
        
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        smell_type = request.args.get('type')
        severity = request.args.get('severity')
        smell_status = request.args.get('status')
        
        query = CodeSmell.query.filter_by(task_id=task_id)
        
        if smell_type:
            query = query.filter_by(smell_type=smell_type)
        if severity:
            query = query.filter_by(severity=severity)
        if smell_status:
            query = query.filter_by(smell_status=smell_status)
        
        pagination = query.paginate(page=page, per_page=per_page, error_out=False)
        
        results = {
            'task': task.to_dict(),
            'smells': [smell.to_dict() for smell in pagination.items],
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total_pages': pagination.pages,
                'total_items': pagination.total
            }
        }
        
        return jsonify(results)

    @app.route('/api/tasks/<task_id>/summary', methods=['GET'])
    @require_api_key
    @rate_limit
    def get_task_summary(task_id):
        task = AnalysisTask.query.get(task_id)
        
        if not task:
            return jsonify({'error': 'Task not found'}), 404
        
        smells = CodeSmell.query.filter_by(task_id=task_id).all()
        
        summary = {
            'task': task.to_dict(),
            'by_type': {},
            'by_severity': {},
            'by_language': {},
            'by_file': {},
            'by_status': {}
        }
        
        for smell in smells:
            summary['by_type'][smell.smell_type] = summary['by_type'].get(smell.smell_type, 0) + 1
            summary['by_severity'][smell.severity] = summary['by_severity'].get(smell.severity, 0) + 1
            summary['by_language'][smell.language] = summary['by_language'].get(smell.language, 0) + 1
            summary['by_file'][smell.file_path] = summary['by_file'].get(smell.file_path, 0) + 1
            summary['by_status'][smell.smell_status] = summary['by_status'].get(smell.smell_status, 0) + 1
        
        summary['by_file'] = dict(sorted(
            summary['by_file'].items(),
            key=lambda x: x[1],
            reverse=True
        )[:10])
        
        return jsonify(summary)

    @app.route('/api/smell-types', methods=['GET'])
    @require_api_key
    def get_smell_types():
        smell_types = [
            {
                'type': 'long_method',
                'name': '长方法',
                'description': '方法/函数代码行数过多',
                'severity': 'medium'
            },
            {
                'type': 'duplicate_code',
                'name': '重复代码',
                'description': '存在相同或高度相似的代码片段',
                'severity': 'high'
            },
            {
                'type': 'large_class',
                'name': '过大类',
                'description': '类代码行数或方法数量过多',
                'severity': 'medium'
            },
            {
                'type': 'too_many_parameters',
                'name': '参数过多',
                'description': '方法/函数参数数量过多',
                'severity': 'medium'
            },
            {
                'type': 'global_data_abuse',
                'name': '全局数据滥用',
                'description': '过度使用全局变量',
                'severity': 'high'
            },
            {
                'type': 'shotgun_surgery',
                'name': '霰弹式修改',
                'description': '单个方法访问/修改多个不同对象的数据',
                'severity': 'medium'
            },
            {
                'type': 'feature_envy',
                'name': '依恋情结',
                'description': '方法过度依赖其他类的功能',
                'severity': 'medium'
            },
            {
                'type': 'data_clumps',
                'name': '数据泥团',
                'description': '相同的参数组在多个地方重复出现',
                'severity': 'medium'
            }
        ]
        
        return jsonify({'smell_types': smell_types})

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({'error': 'Endpoint not found'}), 404

    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({'error': 'Internal server error'}), 500

    with app.app_context():
        db.create_all()

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=True)
