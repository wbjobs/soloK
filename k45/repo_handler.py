import os
import zipfile
import tempfile
import shutil
import subprocess
from urllib.parse import urlparse
from typing import Optional, Set, List, Tuple


class RepositoryHandler:
    MAX_FIND_ROOT_DEPTH = 20

    def __init__(self):
        self.temp_dirs = []

    def handle_zip_file(self, zip_file_path: str) -> Optional[str]:
        temp_dir = tempfile.mkdtemp(prefix='code_analysis_')
        self.temp_dirs.append(temp_dir)

        try:
            with zipfile.ZipFile(zip_file_path, 'r') as zip_ref:
                self._safe_extract_zip(zip_ref, temp_dir)
            
            return self._find_code_root(temp_dir)
        except Exception as e:
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise e

    def _safe_extract_zip(self, zip_ref: zipfile.ZipFile, dest: str):
        for info in zip_ref.infolist():
            if info.is_dir():
                continue

            if self._is_symlink_zip_entry(info):
                real_target = zip_ref.read(info.filename)
                if isinstance(real_target, bytes):
                    real_target = real_target.decode('utf-8', errors='replace')

                link_path = os.path.join(dest, info.filename)
                if os.path.isabs(real_target):
                    continue

                os.makedirs(os.path.dirname(link_path), exist_ok=True)
                resolved_target = os.path.normpath(
                    os.path.join(os.path.dirname(link_path), real_target)
                )
                if not resolved_target.startswith(os.path.normpath(dest)):
                    continue

                try:
                    with open(link_path, 'w', encoding='utf-8') as f:
                        f.write(f"[symlink placeholder: {real_target}]")
                except OSError:
                    continue
            else:
                zip_ref.extract(info, dest)

    def _is_symlink_zip_entry(self, info: zipfile.ZipInfo) -> bool:
        return (info.external_attr >> 16) & 0o120000 == 0o120000

    def handle_github_url(self, github_url: str) -> Optional[str]:
        temp_dir = tempfile.mkdtemp(prefix='code_analysis_')
        self.temp_dirs.append(temp_dir)

        try:
            result = subprocess.run(
                ['git', 'clone', '--depth', '1', '--shallow-submodules', github_url, temp_dir],
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode != 0:
                shutil.rmtree(temp_dir, ignore_errors=True)
                raise Exception(f"Git clone failed: {result.stderr}")
            
            self._deinit_submodules(temp_dir)
            self._remove_symlinks(temp_dir)
            
            return temp_dir
        except subprocess.TimeoutExpired:
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise Exception("Git clone timeout")
        except Exception as e:
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise e

    def handle_github_url_full(self, github_url: str) -> Optional[str]:
        temp_dir = tempfile.mkdtemp(prefix='code_analysis_full_')
        self.temp_dirs.append(temp_dir)

        try:
            result = subprocess.run(
                ['git', 'clone', '--shallow-submodules', github_url, temp_dir],
                capture_output=True,
                text=True,
                timeout=600
            )
            
            if result.returncode != 0:
                shutil.rmtree(temp_dir, ignore_errors=True)
                raise Exception(f"Git clone failed: {result.stderr}")
            
            self._deinit_submodules(temp_dir)
            self._remove_symlinks(temp_dir)
            
            return temp_dir
        except subprocess.TimeoutExpired:
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise Exception("Git clone timeout (full history)")
        except Exception as e:
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise e

    def get_current_commit(self, repo_dir: str) -> Optional[str]:
        try:
            result = subprocess.run(
                ['git', 'rev-parse', 'HEAD'],
                cwd=repo_dir,
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except (subprocess.TimeoutExpired, Exception):
            pass
        return None

    def validate_commit(self, repo_dir: str, commit_hash: str) -> bool:
        try:
            result = subprocess.run(
                ['git', 'rev-parse', '--verify', commit_hash],
                cwd=repo_dir,
                capture_output=True,
                text=True,
                timeout=30
            )
            return result.returncode == 0
        except (subprocess.TimeoutExpired, Exception):
            return False

    def get_changed_files(self, repo_dir: str, base_commit: str, target_commit: str = 'HEAD') -> Tuple[List[str], List[str], List[str]]:
        added = []
        modified = []
        deleted = []

        try:
            result = subprocess.run(
                ['git', 'diff', '--name-status', base_commit, target_commit],
                cwd=repo_dir,
                capture_output=True,
                text=True,
                timeout=60
            )
            if result.returncode != 0:
                raise Exception(f"git diff failed: {result.stderr}")

            for line in result.stdout.strip().splitlines():
                if not line.strip():
                    continue
                parts = line.split('\t', 1)
                if len(parts) < 2:
                    continue
                status = parts[0][0]
                filepath = parts[1]

                if not filepath.endswith(('.py', '.js', '.jsx')):
                    continue

                if status == 'A':
                    added.append(filepath)
                elif status in ('M', 'R'):
                    modified.append(filepath)
                elif status == 'D':
                    deleted.append(filepath)

        except subprocess.TimeoutExpired:
            raise Exception("git diff timeout")
        except Exception as e:
            if "git diff" not in str(e):
                raise Exception(f"Failed to get changed files: {e}")

        return added, modified, deleted

    def get_file_content_at_commit(self, repo_dir: str, commit_hash: str, file_path: str) -> Optional[str]:
        try:
            result = subprocess.run(
                ['git', 'show', f'{commit_hash}:{file_path}'],
                cwd=repo_dir,
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                return result.stdout
        except (subprocess.TimeoutExpired, Exception):
            pass
        return None

    def _deinit_submodules(self, repo_dir: str):
        gitmodules = os.path.join(repo_dir, '.gitmodules')
        if not os.path.exists(gitmodules):
            return

        try:
            subprocess.run(
                ['git', 'submodule', 'deinit', '-f', '.'],
                cwd=repo_dir,
                capture_output=True,
                text=True,
                timeout=60
            )
        except (subprocess.TimeoutExpired, Exception):
            pass

    def _remove_symlinks(self, directory: str):
        visited: Set[str] = set()
        real_root = os.path.realpath(directory)
        visited.add(real_root)

        for root, dirs, files in os.walk(directory, followlinks=True):
            real_root_check = os.path.realpath(root)
            if real_root_check in visited and real_root_check != os.path.realpath(directory):
                dirs.clear()
                continue

            for name in files:
                full = os.path.join(root, name)
                if os.path.islink(full):
                    try:
                        os.remove(full)
                    except OSError:
                        pass

            dirs_to_remove = []
            for i, name in enumerate(dirs):
                full = os.path.join(root, name)
                if os.path.islink(full):
                    try:
                        os.remove(full)
                    except OSError:
                        pass
                    dirs_to_remove.append(name)
                else:
                    real_path = os.path.realpath(full)
                    if real_path in visited:
                        dirs_to_remove.append(name)
                    else:
                        visited.add(real_path)

            for name in dirs_to_remove:
                dirs.remove(name)

    def _find_code_root(self, directory: str, depth: int = 0) -> str:
        if depth >= self.MAX_FIND_ROOT_DEPTH:
            return directory

        real_dir = os.path.realpath(directory)
        items = os.listdir(directory)
        
        if len(items) == 1:
            item_path = os.path.join(directory, items[0])
            if os.path.islink(item_path):
                return directory
            if os.path.isdir(item_path):
                real_item = os.path.realpath(item_path)
                if real_item == real_dir:
                    return directory
                return self._find_code_root(item_path, depth + 1)
        
        return directory

    def cleanup(self):
        for temp_dir in self.temp_dirs:
            shutil.rmtree(temp_dir, ignore_errors=True)
        self.temp_dirs = []

    def is_valid_github_url(self, url: str) -> bool:
        try:
            parsed = urlparse(url)
            if parsed.netloc not in ['github.com', 'www.github.com']:
                return False
            
            path_parts = [p for p in parsed.path.split('/') if p]
            return len(path_parts) >= 2
        except Exception:
            return False
