import os
import json
import tempfile
from typing import List, Dict, Any, Set
from detectors.python_detector import PythonSmellDetector
from detectors.javascript_detector import JavaScriptSmellDetector
from detectors.duplicate_detector import DuplicateCodeDetector


class CodeAnalyzer:
    SKIP_DIRS = frozenset({
        '.', '__', 'node_modules', 'venv', '.venv', 'env',
        '.git', '.hg', '.svn', 'site-packages', 'dist', 'build',
    })

    def __init__(self):
        self.python_detector = PythonSmellDetector()
        self.javascript_detector = JavaScriptSmellDetector()
        self.duplicate_detector = DuplicateCodeDetector()

    def analyze_directory(self, directory: str) -> Dict[str, Any]:
        result = {
            'files_analyzed': 0,
            'total_smells': 0,
            'smells': [],
            'summary': {}
        }

        code_files = self._collect_code_files(directory)
        result['files_analyzed'] = len(code_files)

        all_smells = []

        for file_path in code_files:
            rel_path = os.path.relpath(file_path, directory)
            
            if file_path.endswith('.py'):
                smells = self.python_detector.detect(file_path)
            elif file_path.endswith(('.js', '.jsx')):
                smells = self.javascript_detector.detect(file_path)
            else:
                continue

            for smell in smells:
                smell['file_path'] = rel_path
                all_smells.append(smell)

        duplicate_smells = self.duplicate_detector.detect(code_files)
        for smell in duplicate_smells:
            smell['file_path'] = os.path.relpath(smell['file_path'], directory)
            all_smells.append(smell)

        result['smells'] = all_smells
        result['total_smells'] = len(all_smells)
        result['summary'] = self._generate_summary(all_smells)

        return result

    def analyze_files(self, directory: str, file_paths: List[str]) -> Dict[str, Any]:
        result = {
            'files_analyzed': 0,
            'total_smells': 0,
            'smells': [],
            'summary': {}
        }

        all_smells = []
        analyzed_count = 0

        for rel_path in file_paths:
            abs_path = os.path.join(directory, rel_path)

            if not os.path.isfile(abs_path):
                continue
            if os.path.islink(abs_path):
                continue

            analyzed_count += 1

            if abs_path.endswith('.py'):
                smells = self.python_detector.detect(abs_path)
            elif abs_path.endswith(('.js', '.jsx')):
                smells = self.javascript_detector.detect(abs_path)
            else:
                continue

            for smell in smells:
                smell['file_path'] = rel_path
                all_smells.append(smell)

        if len(file_paths) >= 2:
            abs_paths = [os.path.join(directory, p) for p in file_paths if os.path.isfile(os.path.join(directory, p))]
            duplicate_smells = self.duplicate_detector.detect(abs_paths)
            for smell in duplicate_smells:
                smell['file_path'] = os.path.relpath(smell['file_path'], directory)
                all_smells.append(smell)

        result['files_analyzed'] = analyzed_count
        result['smells'] = all_smells
        result['total_smells'] = len(all_smells)
        result['summary'] = self._generate_summary(all_smells)

        return result

    def analyze_old_file(self, repo_handler, repo_dir: str, base_commit: str, file_path: str) -> List[Dict[str, Any]]:
        old_content = repo_handler.get_file_content_at_commit(repo_dir, base_commit, file_path)
        if old_content is None:
            return []

        ext = os.path.splitext(file_path)[1].lower()
        tmp = tempfile.NamedTemporaryFile(mode='w', suffix=ext, delete=False, encoding='utf-8')
        try:
            tmp.write(old_content)
            tmp.close()

            if ext == '.py':
                smells = self.python_detector.detect(tmp.name)
            elif ext in ('.js', '.jsx'):
                smells = self.javascript_detector.detect(tmp.name)
            else:
                return []

            for smell in smells:
                smell['file_path'] = file_path
            return smells
        except Exception:
            return []
        finally:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass

    @staticmethod
    def compute_smell_status(
        current_smells: List[Dict[str, Any]],
        previous_smells: List[Dict[str, Any]],
        changed_files: Set[str],
        deleted_files: Set[str]
    ) -> List[Dict[str, Any]]:
        prev_index = CodeAnalyzer._build_smell_index(previous_smells)
        matched_prev_keys = set()
        result = []

        for smell in current_smells:
            key = CodeAnalyzer._smell_key(smell)
            if smell['file_path'] in changed_files or smell['file_path'] in deleted_files:
                if key in prev_index:
                    smell['smell_status'] = 'persistent'
                    matched_prev_keys.add(key)
                else:
                    smell['smell_status'] = 'new'
            else:
                smell['smell_status'] = 'persistent'
                matched_prev_keys.add(key)
            result.append(smell)

        for smell in previous_smells:
            key = CodeAnalyzer._smell_key(smell)
            if key not in matched_prev_keys:
                resolved_smell = dict(smell)
                resolved_smell['smell_status'] = 'resolved'
                result.append(resolved_smell)

        return result

    @staticmethod
    def _smell_key(smell: Dict[str, Any]) -> tuple:
        return (
            smell.get('smell_type', ''),
            smell.get('file_path', ''),
            smell.get('start_line', 0),
            smell.get('end_line', 0),
        )

    @staticmethod
    def _build_smell_index(smells: List[Dict[str, Any]]) -> Dict[tuple, Dict[str, Any]]:
        index = {}
        for smell in smells:
            key = CodeAnalyzer._smell_key(smell)
            index[key] = smell
        return index

    def _is_submodule_dir(self, dir_path: str) -> bool:
        git_file = os.path.join(dir_path, '.git')
        if os.path.isfile(git_file):
            try:
                with open(git_file, 'r', encoding='utf-8') as f:
                    content = f.read().strip()
                if content.startswith('gitdir:'):
                    return True
            except (OSError, UnicodeDecodeError):
                pass
        return False

    def _collect_code_files(self, directory: str) -> List[str]:
        code_files = []
        visited_real_paths: Set[str] = set()
        real_root = os.path.realpath(directory)
        visited_real_paths.add(real_root)

        for root, dirs, files in os.walk(directory, followlinks=True):
            real_root_check = os.path.realpath(root)
            if real_root_check in visited_real_paths and real_root_check != real_root:
                dirs.clear()
                continue

            dirs_to_skip = []
            for name in dirs:
                full_path = os.path.join(root, name)

                if any(name.startswith(prefix) for prefix in self.SKIP_DIRS):
                    dirs_to_skip.append(name)
                    continue

                if os.path.islink(full_path):
                    real_target = os.path.realpath(full_path)
                    if real_target in visited_real_paths:
                        dirs_to_skip.append(name)
                        continue
                    visited_real_paths.add(real_target)

                if self._is_submodule_dir(full_path):
                    dirs_to_skip.append(name)
                    continue

            for name in dirs_to_skip:
                if name in dirs:
                    dirs.remove(name)

            for file in files:
                if file.startswith('.'):
                    continue

                file_path = os.path.join(root, file)

                if os.path.islink(file_path):
                    continue

                if file.endswith(('.py', '.js', '.jsx')):
                    code_files.append(file_path)

        return code_files

    def _generate_summary(self, smells: List[Dict[str, Any]]) -> Dict[str, Any]:
        summary = {
            'by_type': {},
            'by_severity': {},
            'by_language': {},
            'by_file': {},
            'by_status': {}
        }

        for smell in smells:
            smell_type = smell['smell_type']
            severity = smell['severity']
            language = smell['language']
            file_path = smell['file_path']
            smell_status = smell.get('smell_status', 'new')

            summary['by_type'][smell_type] = summary['by_type'].get(smell_type, 0) + 1
            summary['by_severity'][severity] = summary['by_severity'].get(severity, 0) + 1
            summary['by_language'][language] = summary['by_language'].get(language, 0) + 1
            summary['by_file'][file_path] = summary['by_file'].get(file_path, 0) + 1
            summary['by_status'][smell_status] = summary['by_status'].get(smell_status, 0) + 1

        summary['by_file'] = dict(sorted(
            summary['by_file'].items(), 
            key=lambda x: x[1], 
            reverse=True
        )[:10])

        return summary
