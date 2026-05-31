import os
import json
from datetime import datetime
from celery_app import celery
from models import db, AnalysisTask, CodeSmell
from repo_handler import RepositoryHandler
from analyzer import CodeAnalyzer
import shutil


@celery.task(bind=True, name='tasks.analyze_repository')
def analyze_repository(self, task_id: str, source_type: str, source: str,
                       temp_path: str = None, base_commit: str = None):
    from app import create_app
    
    app = create_app()
    
    with app.app_context():
        task = AnalysisTask.query.get(task_id)
        if not task:
            return
        
        task.status = 'processing'
        if base_commit:
            task.is_incremental = True
            task.base_commit = base_commit
        db.session.commit()

        repo_handler = RepositoryHandler()
        analyzer = CodeAnalyzer()

        try:
            code_dir = None

            if source_type == 'zip':
                if temp_path and os.path.exists(temp_path):
                    code_dir = repo_handler.handle_zip_file(temp_path)
                else:
                    raise Exception("Zip file not found")
            elif source_type == 'github':
                if base_commit:
                    code_dir = repo_handler.handle_github_url_full(source)
                else:
                    code_dir = repo_handler.handle_github_url(source)
            else:
                raise Exception(f"Unknown source type: {source_type}")

            current_commit = repo_handler.get_current_commit(code_dir)
            if current_commit:
                task.current_commit = current_commit

            if base_commit and source_type == 'github':
                _run_incremental_analysis(task, code_dir, base_commit,
                                          repo_handler, analyzer)
            else:
                _run_full_analysis(task, code_dir, analyzer)

            task.status = 'completed'
            task.completed_at = datetime.utcnow()
            db.session.commit()

        except Exception as e:
            task.status = 'failed'
            task.error_message = str(e)
            task.completed_at = datetime.utcnow()
            db.session.commit()

        finally:
            repo_handler.cleanup()
            
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except:
                    pass
            
            if code_dir and os.path.exists(code_dir):
                try:
                    shutil.rmtree(code_dir, ignore_errors=True)
                except:
                    pass

        return {
            'task_id': task_id,
            'status': task.status,
            'total_files': task.total_files,
            'total_smells': task.total_smells
        }


def _run_full_analysis(task, code_dir, analyzer):
    analysis_result = analyzer.analyze_directory(code_dir)
    task.total_files = analysis_result['files_analyzed']
    task.total_smells = analysis_result['total_smells']

    for smell_data in analysis_result['smells']:
        smell = CodeSmell(
            task_id=task.id,
            smell_type=smell_data['smell_type'],
            file_path=smell_data['file_path'],
            language=smell_data['language'],
            start_line=smell_data['start_line'],
            end_line=smell_data['end_line'],
            description=smell_data['description'],
            suggestion=smell_data['suggestion'],
            severity=smell_data['severity'],
            code_snippet=smell_data.get('code_snippet'),
            metrics=json.dumps(smell_data.get('metrics', {})),
            smell_status='new'
        )
        db.session.add(smell)


def _run_incremental_analysis(task, code_dir, base_commit, repo_handler, analyzer):
    if not repo_handler.validate_commit(code_dir, base_commit):
        raise Exception(f"Invalid base commit: {base_commit}")

    added, modified, deleted = repo_handler.get_changed_files(code_dir, base_commit)
    changed_files = set(added + modified)
    all_changed = set(added + modified + deleted)

    current_result = analyzer.analyze_files(code_dir, added + modified)
    current_smells = current_result['smells']

    previous_smells = []
    for fp in modified:
        old_smells = analyzer.analyze_old_file(repo_handler, code_dir, base_commit, fp)
        previous_smells.extend(old_smells)

    for fp in deleted:
        old_smells = analyzer.analyze_old_file(repo_handler, code_dir, base_commit, fp)
        previous_smells.extend(old_smells)

    all_smells = CodeAnalyzer.compute_smell_status(
        current_smells, previous_smells, changed_files, set(deleted)
    )

    task.total_files = current_result['files_analyzed']
    task.total_smells = len(all_smells)

    for smell_data in all_smells:
        smell = CodeSmell(
            task_id=task.id,
            smell_type=smell_data['smell_type'],
            file_path=smell_data['file_path'],
            language=smell_data['language'],
            start_line=smell_data['start_line'],
            end_line=smell_data['end_line'],
            description=smell_data['description'],
            suggestion=smell_data['suggestion'],
            severity=smell_data['severity'],
            code_snippet=smell_data.get('code_snippet'),
            metrics=json.dumps(smell_data.get('metrics', {})),
            smell_status=smell_data.get('smell_status', 'new')
        )
        db.session.add(smell)
