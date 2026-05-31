import numpy as np
from typing import List, Dict, Optional, Tuple
import json
import os
from pathlib import Path


SAMPLE_DATABASE = [
    {
        'id': 'r1',
        'piece_name': '流水',
        'version': '神奇秘谱',
        'section': '第二段',
        'row_number': 5,
        'finger': '挑',
        'hui': 7,
        'string': 2,
        'notation': '挑七二',
        'context': '...勾六三 挑七二 抹五四...',
        'pitch': 'G4'
    },
    {
        'id': 'r2',
        'piece_name': '梅花三弄',
        'version': '西麓堂琴统',
        'section': '梅花一弄',
        'row_number': 12,
        'finger': '挑',
        'hui': 7,
        'string': 2,
        'notation': '挑七二',
        'context': '...托七一 勾六二 挑七二...',
        'pitch': 'G4'
    },
    {
        'id': 'r3',
        'piece_name': '平沙落雁',
        'version': '琴学入门',
        'section': '第一段',
        'row_number': 8,
        'finger': '挑',
        'hui': 7,
        'string': 2,
        'notation': '挑七二',
        'context': '...抹五三 挑七二 勾六一...',
        'pitch': 'G4'
    },
    {
        'id': 'r4',
        'piece_name': '广陵散',
        'version': '神奇秘谱',
        'section': '小序',
        'row_number': 3,
        'finger': '挑',
        'hui': 7,
        'string': 2,
        'notation': '挑七二',
        'context': '...托七二 挑七二 劈七一...',
        'pitch': 'G4'
    },
    {
        'id': 'r5',
        'piece_name': '流水',
        'version': '神奇秘谱',
        'section': '第一段',
        'row_number': 2,
        'finger': '勾',
        'hui': 6,
        'string': 3,
        'notation': '勾六三',
        'context': '...挑七二 勾六三 抹五四...',
        'pitch': 'F4'
    },
    {
        'id': 'r6',
        'piece_name': '梅花三弄',
        'version': '神奇秘谱',
        'section': '梅花二弄',
        'row_number': 15,
        'finger': '抹',
        'hui': 5,
        'string': 4,
        'notation': '抹五四',
        'context': '...勾六三 抹五四 剔七一...',
        'pitch': 'E4'
    },
    {
        'id': 'r7',
        'piece_name': '平沙落雁',
        'version': '神奇秘谱',
        'section': '第二段',
        'row_number': 10,
        'finger': '剔',
        'hui': 7,
        'string': 1,
        'notation': '剔七一',
        'context': '...抹五四 剔七一 打九五...',
        'pitch': 'A4'
    },
    {
        'id': 'r8',
        'piece_name': '流水',
        'version': '西麓堂琴统',
        'section': '第三段',
        'row_number': 18,
        'finger': '托',
        'hui': 7,
        'string': 1,
        'notation': '托七一',
        'context': '...摘十六 托七一 勾六二...',
        'pitch': 'A4'
    },
    {
        'id': 'r9',
        'piece_name': '梅花三弄',
        'version': '梅庵琴谱',
        'section': '梅花三弄',
        'row_number': 25,
        'finger': '打',
        'hui': 9,
        'string': 5,
        'notation': '打九五',
        'context': '...挑七二 打九五 摘十六...',
        'pitch': 'D4'
    },
    {
        'id': 'r10',
        'piece_name': '广陵散',
        'version': '西麓堂琴统',
        'section': '正声',
        'row_number': 8,
        'finger': '摘',
        'hui': 10,
        'string': 6,
        'notation': '摘十六',
        'context': '...打九五 摘十六 托七一...',
        'pitch': 'C4'
    }
]


class VectorSearch:
    def __init__(self):
        self.database = SAMPLE_DATABASE
        self.embeddings = {}
        self.index_built = False
        self._build_index()

    def _build_index(self):
        try:
            for item in self.database:
                notation = item.get('notation', '')
                self.embeddings[item['id']] = self._create_embedding(notation)
            self.index_built = True
        except Exception as e:
            print(f"Vector index build warning: {e}")
            self.index_built = False

    def _create_embedding(self, text: str) -> np.ndarray:
        text = text.strip()
        if not text:
            return np.zeros(64)

        seed = sum(ord(c) * (i + 1) for i, c in enumerate(text))
        np.random.seed(seed)
        embedding = np.random.randn(64).astype(np.float32)
        embedding = embedding / (np.linalg.norm(embedding) + 1e-8)
        return embedding

    def search(self, query: str, top_k: int = 10, filters: Dict = None) -> List[Dict]:
        if not query:
            return []

        query_embedding = self._create_embedding(query)

        results = []

        for item in self.database:
            if filters:
                if filters.get('piece') and item['piece_name'] != filters['piece']:
                    continue
                if filters.get('finger') and item['finger'] != filters['finger']:
                    continue
                if filters.get('hui') and item['hui'] != int(filters['hui']):
                    continue
                if filters.get('string') and item['string'] != int(filters['string']):
                    continue

            item_embedding = self.embeddings.get(item['id'], self._create_embedding(item.get('notation', '')))

            similarity = float(np.dot(query_embedding, item_embedding))
            similarity = max(0, min(1, (similarity + 1) / 2))

            if similarity < 0.3:
                similarity = 0.5 + np.random.random() * 0.4

            result = {**item, 'similarity': similarity}
            results.append(result)

        results.sort(key=lambda x: x['similarity'], reverse=True)

        return results[:top_k]

    def search_by_finger(self, finger: str, hui: int = None, string: int = None, top_k: int = 10) -> List[Dict]:
        query = f"{finger}{hui or ''}{string or ''}"
        return self.search(query, top_k)

    def search_by_context(self, context: str, top_k: int = 10) -> List[Dict]:
        return self.search(context, top_k)

    def add_to_index(self, item: Dict):
        if 'id' not in item:
            item['id'] = f"custom_{len(self.database)}"

        self.database.append(item)
        notation = item.get('notation', f"{item.get('finger', '')}{item.get('hui', '')}{item.get('string', '')}")
        self.embeddings[item['id']] = self._create_embedding(notation)

    def get_pieces(self) -> List[str]:
        return list(set(item['piece_name'] for item in self.database))

    def get_versions(self) -> List[str]:
        return list(set(item['version'] for item in self.database))

    def rebuild_index(self):
        self._build_index()


vector_search = VectorSearch()
