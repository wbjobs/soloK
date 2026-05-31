from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
import json

db = SQLAlchemy()


class AnalysisTask(db.Model):
    __tablename__ = 'analysis_tasks'

    id = db.Column(db.String(64), primary_key=True)
    status = db.Column(db.String(20), default='pending', index=True)
    source_type = db.Column(db.String(10), nullable=False)
    source = db.Column(db.String(500), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)
    error_message = db.Column(db.Text, nullable=True)
    total_files = db.Column(db.Integer, default=0)
    total_smells = db.Column(db.Integer, default=0)
    base_commit = db.Column(db.String(40), nullable=True)
    current_commit = db.Column(db.String(40), nullable=True)
    is_incremental = db.Column(db.Boolean, default=False)

    smells = db.relationship('CodeSmell', backref='task', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'task_id': self.id,
            'status': self.status,
            'source_type': self.source_type,
            'source': self.source,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'error_message': self.error_message,
            'total_files': self.total_files,
            'total_smells': self.total_smells,
            'base_commit': self.base_commit,
            'current_commit': self.current_commit,
            'is_incremental': self.is_incremental
        }


class CodeSmell(db.Model):
    __tablename__ = 'code_smells'

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.String(64), db.ForeignKey('analysis_tasks.id'), nullable=False)
    smell_type = db.Column(db.String(50), nullable=False, index=True)
    file_path = db.Column(db.String(500), nullable=False)
    language = db.Column(db.String(20), nullable=False)
    start_line = db.Column(db.Integer, nullable=False)
    end_line = db.Column(db.Integer, nullable=False)
    description = db.Column(db.Text, nullable=False)
    suggestion = db.Column(db.Text, nullable=False)
    severity = db.Column(db.String(20), default='medium')
    code_snippet = db.Column(db.Text, nullable=True)
    metrics = db.Column(db.Text, nullable=True)
    smell_status = db.Column(db.String(20), default='new', index=True)

    def to_dict(self):
        return {
            'id': self.id,
            'smell_type': self.smell_type,
            'file_path': self.file_path,
            'language': self.language,
            'start_line': self.start_line,
            'end_line': self.end_line,
            'description': self.description,
            'suggestion': self.suggestion,
            'severity': self.severity,
            'code_snippet': self.code_snippet,
            'metrics': json.loads(self.metrics) if self.metrics else None,
            'smell_status': self.smell_status
        }
