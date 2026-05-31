import numpy as np
import json
import os
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from collections import defaultdict, Counter
import random


class NgramPredictor:
    def __init__(self, n=3):
        self.n = n
        self.ngram_counts = defaultdict(Counter)
        self.sequence_counts = defaultdict(int)
        self.style_models = {}
        self._build_corpus()

    def _build_corpus(self):
        corpus_dir = Path(__file__).parent / 'corpus'
        corpus_dir.mkdir(exist_ok=True)

        self.corpus = self._generate_synthetic_corpus()

        for style, pieces in self.corpus.items():
            self.style_models[style] = self._train_style_model(pieces)

        all_pieces = []
        for pieces in self.corpus.values():
            all_pieces.extend(pieces)
        self._train_ngram_model(all_pieces)

    def _generate_synthetic_corpus(self) -> Dict[str, List[List[Dict]]]:
        fingers = ['挑', '勾', '抹', '剔', '托', '摘', '打', '劈']
        huis = list(range(1, 14))
        strings = list(range(1, 8))

        styles = {
            'traditional': {
                'finger_weights': [0.25, 0.25, 0.15, 0.1, 0.1, 0.05, 0.05, 0.05],
                'hui_preference': lambda: random.choices([5, 6, 7, 8, 9, 10], weights=[0.1, 0.15, 0.3, 0.2, 0.15, 0.1])[0],
                'string_bias': [0.05, 0.15, 0.25, 0.25, 0.15, 0.1, 0.05]
            },
            'modern': {
                'finger_weights': [0.2, 0.2, 0.2, 0.15, 0.1, 0.05, 0.05, 0.05],
                'hui_preference': lambda: random.randint(4, 11),
                'string_bias': [0.1, 0.15, 0.2, 0.2, 0.15, 0.1, 0.1]
            },
            'meian': {
                'finger_weights': [0.15, 0.2, 0.15, 0.1, 0.2, 0.1, 0.07, 0.03],
                'hui_preference': lambda: random.choices([7, 8, 9, 10, 11], weights=[0.1, 0.2, 0.3, 0.25, 0.15])[0],
                'string_bias': [0.2, 0.2, 0.15, 0.15, 0.1, 0.1, 0.1]
            }
        }

        corpus = {}
        piece_names = ['流水', '梅花三弄', '平沙落雁', '渔樵问答', '潇湘水云',
                       '阳关三叠', '醉渔唱晚', '酒狂', '良宵引', '普庵咒',
                       '龙翔操', '墨子悲丝', '山居吟', '樵歌', '梧叶舞秋风',
                       '捣衣', '秋鸿', '碣石调幽兰', '大胡笳', '离骚']

        for style, params in styles.items():
            pieces = []
            for _ in range(200 // 3):
                piece_length = random.randint(30, 150)
                piece = []
                prev_string = random.choices(strings, weights=params['string_bias'])[0]

                for _ in range(piece_length):
                    finger = random.choices(fingers, weights=params['finger_weights'])[0]
                    hui = params['hui_preference']()

                    string_probs = params['string_bias'].copy()
                    if prev_string > 1:
                        string_probs[prev_string - 2] *= 1.5
                    if prev_string < 7:
                        string_probs[prev_string] *= 1.3
                    total = sum(string_probs)
                    string_probs = [p / total for p in string_probs]
                    string = random.choices(strings, weights=string_probs)[0]
                    prev_string = string

                    piece.append({
                        'finger': finger,
                        'hui': hui,
                        'string': string
                    })

                pieces.append(piece)
            corpus[style] = pieces

        return corpus

    def _train_ngram_model(self, pieces: List[List[Dict]]):
        for piece in pieces:
            for i in range(len(piece) - self.n + 1):
                window = piece[i:i + self.n]
                prefix = tuple(
                    (n['finger'], n['hui'], n['string'])
                    for n in window[:-1]
                )
                next_note = (window[-1]['finger'], window[-1]['hui'], window[-1]['string'])
                self.ngram_counts[prefix][next_note] += 1

    def _train_style_model(self, pieces: List[List[Dict]]) -> Dict:
        transitions = defaultdict(Counter)
        finger_transitions = defaultdict(Counter)
        string_transitions = defaultdict(Counter)

        for piece in pieces:
            for i in range(len(piece) - 1):
                current = (piece[i]['finger'], piece[i]['hui'], piece[i]['string'])
                next_note = (piece[i + 1]['finger'], piece[i + 1]['hui'], piece[i + 1]['string'])
                transitions[current][next_note] += 1
                finger_transitions[piece[i]['finger']][piece[i + 1]['finger']] += 1
                string_transitions[piece[i]['string']][piece[i + 1]['string']] += 1

        return {
            'transitions': transitions,
            'finger_transitions': finger_transitions,
            'string_transitions': string_transitions,
            'finger_dist': Counter(n['finger'] for p in pieces for n in p),
            'hui_dist': Counter(n['hui'] for p in pieces for n in p),
            'string_dist': Counter(n['string'] for p in pieces for n in p)
        }

    def predict_next(self, sequence: List[Dict], style: str = None, top_k: int = 5) -> List[Tuple[Dict, float]]:
        if len(sequence) < self.n - 1:
            return self._predict_from_style(sequence, style, top_k)

        prefix = tuple(
            (n['finger'], n['hui'], n['string'])
            for n in sequence[-(self.n - 1):]
        )

        candidates = self.ngram_counts.get(prefix, Counter())

        if not candidates and style:
            return self._predict_from_style(sequence, style, top_k)

        total = sum(candidates.values())
        if total == 0:
            return self._predict_from_style(sequence, style, top_k)

        results = []
        for (finger, hui, string), count in candidates.most_common(top_k):
            results.append((
                {'finger': finger, 'hui': hui, 'string': string},
                count / total
            ))

        return results

    def _predict_from_style(self, sequence: List[Dict], style: str, top_k: int) -> List[Tuple[Dict, float]]:
        if not style or style not in self.style_models:
            style = 'traditional'

        model = self.style_models[style]

        if sequence:
            last_note = sequence[-1]
            last_finger = last_note['finger']
            last_string = last_note['string']

            finger_candidates = model['finger_transitions'].get(last_finger, model['finger_dist'])
            string_candidates = model['string_transitions'].get(last_string, model['string_dist'])
        else:
            finger_candidates = model['finger_dist']
            string_candidates = model['string_dist']

        results = []
        hui_common = model['hui_dist'].most_common(5)

        for finger, f_count in finger_candidates.most_common(3):
            for hui, h_count in hui_common[:3]:
                for string, s_count in string_candidates.most_common(2):
                    score = (f_count * h_count * s_count) ** (1/3)
                    results.append(({'finger': finger, 'hui': hui, 'string': string}, score))

        results.sort(key=lambda x: x[1], reverse=True)
        total = sum(r[1] for r in results[:top_k]) or 1

        return [(r[0], r[1] / total) for r in results[:top_k]]

    def generate_sequence(self, seed: List[Dict], length: int, style: str = None) -> List[Dict]:
        result = seed.copy()

        for _ in range(length):
            predictions = self.predict_next(result, style, top_k=3)
            if not predictions:
                break

            notes, probs = zip(*predictions)
            probs = np.array(probs)
            probs = probs / probs.sum()

            chosen = np.random.choice(len(notes), p=probs)
            result.append(notes[chosen])

        return result[len(seed):]

    def generate_schemes(self, seed: List[Dict], length: int, num_schemes: int = 3) -> List[Dict]:
        styles = ['traditional', 'modern', 'meian']
        style_names = {
            'traditional': '经典传承方案',
            'modern': '现代演奏方案',
            'meian': '梅庵派方案'
        }
        style_descs = {
            'traditional': '基于《神奇秘谱》等古谱传承指法',
            'modern': '适合现代舞台表演的流畅编配',
            'meian': '梅庵琴派刚劲有力的传谱风格'
        }

        schemes = []
        for i in range(min(num_schemes, len(styles))):
            style = styles[i]
            sequence = self.generate_sequence(seed, length, style)

            confidence = self._calculate_confidence(seed, sequence, style)

            schemes.append({
                'id': f'scheme{i + 1}',
                'name': style_names[style],
                'description': style_descs[style],
                'style': style,
                'confidence': confidence,
                'notes': sequence
            })

        return schemes

    def _calculate_confidence(self, seed: List[Dict], generated: List[Dict], style: str) -> float:
        if not generated:
            return 0.5

        model = self.style_models.get(style, self.style_models['traditional'])
        total_prob = 0
        count = 0

        full_sequence = seed + generated
        for i in range(len(seed), len(full_sequence)):
            prev = full_sequence[i - 1]
            curr = full_sequence[i]

            finger_trans = model['finger_transitions'].get(prev['finger'], Counter())
            finger_total = sum(finger_trans.values()) or 1
            finger_prob = finger_trans.get(curr['finger'], 0) / finger_total

            string_trans = model['string_transitions'].get(prev['string'], Counter())
            string_total = sum(string_trans.values()) or 1
            string_prob = string_trans.get(curr['string'], 0) / string_total

            hui_prob = model['hui_dist'].get(curr['hui'], 0) / (sum(model['hui_dist'].values()) or 1)

            total_prob += (finger_prob + string_prob + hui_prob) / 3
            count += 1

        return min(0.95, (total_prob / count if count > 0 else 0.5) + 0.2)


ngram_predictor = NgramPredictor(n=3)
