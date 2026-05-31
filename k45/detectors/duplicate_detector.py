import os
import re
import hashlib
from difflib import SequenceMatcher
from typing import List, Dict, Any, Tuple


class DuplicateCodeDetector:
    def __init__(self, min_lines: int = 5, similarity_threshold: float = 0.85):
        self.min_lines = min_lines
        self.similarity_threshold = similarity_threshold
        self.code_blocks = {}
        self.smells = []

    def detect(self, files: List[str]) -> List[Dict[str, Any]]:
        self.smells = []
        self.code_blocks = {}

        for file_path in files:
            try:
                language = self._detect_language(file_path)
                if language not in ['python', 'javascript']:
                    continue

                with open(file_path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()

                self._extract_code_blocks(file_path, lines, language)

            except Exception as e:
                continue

        self._find_duplicates()
        return self.smells

    def _detect_language(self, file_path: str) -> str:
        ext = os.path.splitext(file_path)[1].lower()
        if ext == '.py':
            return 'python'
        elif ext in ['.js', '.jsx', '.ts', '.tsx']:
            return 'javascript'
        return 'unknown'

    def _normalize_code(self, code: str, language: str) -> str:
        normalized = re.sub(r'//.*', '', code) if language == 'javascript' else re.sub(r'#.*', '', code)
        normalized = re.sub(r'/\*[\s\S]*?\*/', '', normalized) if language == 'javascript' else re.sub(r'"""[\s\S]*?"""', '', normalized)
        normalized = re.sub(r"'''[\s\S]*?'''", '', normalized) if language == 'python' else normalized
        normalized = re.sub(r'\s+', ' ', normalized).strip()
        normalized = re.sub(r'\b\w+\b', 'x', normalized)
        return normalized

    def _extract_code_blocks(self, file_path: str, lines: List[str], language: str):
        block_lines = []
        block_start = 0

        for i, line in enumerate(lines):
            stripped = line.strip()

            if stripped and not stripped.startswith(('//', '#', '/*', '*', '*/', '"""', "'''")):
                if not block_lines:
                    block_start = i + 1
                block_lines.append((i + 1, line))
            else:
                if len(block_lines) >= self.min_lines:
                    self._store_block(file_path, block_start, block_lines, language)
                block_lines = []

        if len(block_lines) >= self.min_lines:
            self._store_block(file_path, block_start, block_lines, language)

    def _store_block(self, file_path: str, start_line: int, block_lines: List[Tuple[int, str]], language: str):
        code_text = ''.join(line for _, line in block_lines)
        normalized = self._normalize_code(code_text, language)

        if len(normalized) < 20:
            return

        code_hash = hashlib.md5(normalized.encode()).hexdigest()

        if code_hash not in self.code_blocks:
            self.code_blocks[code_hash] = []

        self.code_blocks[code_hash].append({
            'file_path': file_path,
            'start_line': start_line,
            'end_line': block_lines[-1][0],
            'code': code_text,
            'language': language,
            'normalized': normalized
        })

    def _find_duplicates(self):
        exact_duplicates = []
        similar_blocks = []

        for code_hash, blocks in self.code_blocks.items():
            if len(blocks) >= 2:
                exact_duplicates.append(blocks)

        block_list = []
        for blocks in self.code_blocks.values():
            block_list.extend(blocks)

        for i in range(len(block_list)):
            for j in range(i + 1, len(block_list)):
                block1 = block_list[i]
                block2 = block_list[j]

                if block1['file_path'] == block2['file_path'] and block1['start_line'] == block2['start_line']:
                    continue

                similarity = SequenceMatcher(
                    None,
                    block1['normalized'],
                    block2['normalized']
                ).ratio()

                if similarity >= self.similarity_threshold:
                    similar_blocks.append((block1, block2, similarity))

        self._report_exact_duplicates(exact_duplicates)
        self._report_similar_blocks(similar_blocks)

    def _report_exact_duplicates(self, duplicate_groups: List[List[Dict]]):
        for blocks in duplicate_groups:
            for block in blocks:
                self.smells.append({
                    'smell_type': 'duplicate_code',
                    'file_path': block['file_path'],
                    'language': block['language'],
                    'start_line': block['start_line'],
                    'end_line': block['end_line'],
                    'description': f"检测到完全重复的代码块（共 {len(blocks)} 处）",
                    'suggestion': "考虑提取公共方法/函数，消除重复代码。使用DRY原则设计。",
                    'severity': 'high' if len(blocks) > 2 else 'medium',
                    'code_snippet': block['code'],
                    'metrics': {
                        'duplicate_count': len(blocks),
                        'line_count': block['end_line'] - block['start_line'] + 1,
                        'duplicate_type': 'exact'
                    }
                })

    def _report_similar_blocks(self, similar_pairs: List[Tuple[Dict, Dict, float]]):
        reported_pairs = set()

        for block1, block2, similarity in similar_pairs:
            pair_key = tuple(sorted([
                f"{block1['file_path']}:{block1['start_line']}",
                f"{block2['file_path']}:{block2['start_line']}"
            ]))

            if pair_key in reported_pairs:
                continue
            reported_pairs.add(pair_key)

            for block in [block1, block2]:
                self.smells.append({
                    'smell_type': 'duplicate_code',
                    'file_path': block['file_path'],
                    'language': block['language'],
                    'start_line': block['start_line'],
                    'end_line': block['end_line'],
                    'description': f"检测到相似度为 {similarity:.1%} 的代码片段",
                    'suggestion': "考虑重构相似代码，提取公共逻辑。使用策略模式或模板方法模式。",
                    'severity': 'medium',
                    'code_snippet': block['code'],
                    'metrics': {
                        'similarity': round(similarity, 2),
                        'line_count': block['end_line'] - block['start_line'] + 1,
                        'duplicate_type': 'similar',
                        'similar_file': block2['file_path'] if block is block1 else block1['file_path']
                    }
                })
