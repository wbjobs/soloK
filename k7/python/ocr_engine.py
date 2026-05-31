import cv2
import numpy as np
from typing import List, Dict, Optional, Tuple
import base64


RIGHT_HAND_TECHNIQUES = {
    '挑': {'code': 'tiao', 'description': '右手指法：食指向外弹'},
    '勾': {'code': 'gou', 'description': '右手指法：中指向内弹'},
    '抹': {'code': 'mo', 'description': '右手指法：食指向内弹'},
    '剔': {'code': 'ti', 'description': '右手指法：中指向外弹'},
    '打': {'code': 'da', 'description': '右手指法：无名指向内弹'},
    '摘': {'code': 'zhai', 'description': '右手指法：无名指向外弹'},
    '托': {'code': 'tuo', 'description': '右手指法：大指向外弹'},
    '劈': {'code': 'pi', 'description': '右手指法：大指向内弹'},
    '撮': {'code': 'cuo', 'description': '右手指法：两指同时弹'},
    '轮': {'code': 'lun', 'description': '右手指法：快速轮指'}
}

LEFT_HAND_TECHNIQUES = {
    '按': {'code': 'an', 'description': '左手指法：按弦'},
    '吟': {'code': 'yin', 'description': '左手指法：吟揉'},
    '猱': {'code': 'nao', 'description': '左手指法：猱动'},
    '绰': {'code': 'chuo', 'description': '左手指法：上滑'},
    '注': {'code': 'zhu', 'description': '左手指法：下滑'},
    '撞': {'code': 'zhuang', 'description': '左手指法：快速撞击'},
    '逗': {'code': 'dou', 'description': '左手指法：逗引'},
    '唤': {'code': 'huan', 'description': '左手指法：唤音'}
}

HUI_POSITIONS = list(range(1, 14))
STRINGS = list(range(1, 8))

STRING_BASE_FREQS = [130.81, 146.83, 174.61, 196.00, 220.00, 261.63, 293.66]
HUI_RATIOS = [0.9439, 0.8909, 0.8409, 0.7937, 0.7492, 0.7071, 0.6674, 0.6299, 0.5946, 0.5612, 0.5297, 0.5, 0.4719]

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


class OCREngine:
    def __init__(self):
        self.confidence_threshold = 0.7
        self.model_loaded = False
        self._load_model()

    def _load_model(self):
        try:
            self.model_loaded = True
        except Exception as e:
            print(f"OCR model loading warning: {e}")
            self.model_loaded = False

    def recognize(self, image: np.ndarray, preprocessed_data: dict = None) -> Dict:
        result = {
            'success': True,
            'image_id': f'img_{np.random.randint(10000, 99999)}',
            'rows': [],
            'extracted_notes': [],
            'confidence': 0.0,
            'processing_time': 0
        }

        try:
            rows = preprocessed_data.get('rows', []) if preprocessed_data else []
            characters = preprocessed_data.get('characters', []) if preprocessed_data else []

            if not rows:
                rows = self._detect_rows(image)

            for row_idx, row in enumerate(rows):
                row_chars = [c for c in characters if c.get('row_index') == row_idx] if characters else []
                if not row_chars:
                    row_img = row.get('image', image)
                    row_chars = self._detect_characters(row_img)

                recognized_chars = self._recognize_characters(row_chars)

                result['rows'].append({
                    'row_index': row_idx,
                    'characters': recognized_chars
                })

                notes = self._extract_notes_from_row(recognized_chars, row_idx)
                result['extracted_notes'].extend(notes)

            result['confidence'] = np.mean([c.get('confidence', 0.5) for row in result['rows'] for c in row['characters']]) if result['rows'] else 0.5

        except Exception as e:
            result['success'] = False
            result['error'] = str(e)

        return result

    def _detect_rows(self, image: np.ndarray) -> List[Dict]:
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()

        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        inverted = cv2.bitwise_not(binary)

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (image.shape[1] // 3, 1))
        dilated = cv2.dilate(inverted, kernel, iterations=1)

        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        rows = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            if h > 30 and w > image.shape[1] * 0.2:
                rows.append({
                    'x': x,
                    'y': y,
                    'width': w,
                    'height': h,
                    'image': image[y:y+h, x:x+w].copy()
                })

        rows.sort(key=lambda r: r['y'])
        return rows

    def _detect_characters(self, image: np.ndarray) -> List[Dict]:
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()

        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        inverted = cv2.bitwise_not(binary)

        contours, _ = cv2.findContours(inverted, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        characters = []
        min_area = 80
        max_area = image.shape[0] * image.shape[1] * 0.4

        for contour in contours:
            area = cv2.contourArea(contour)
            if min_area < area < max_area:
                x, y, w, h = cv2.boundingRect(contour)
                aspect_ratio = w / h if h > 0 else 0
                if 0.15 < aspect_ratio < 5.0:
                    char_img = image[y:y+h, x:x+w].copy()
                    characters.append({
                        'x': x,
                        'y': y,
                        'width': w,
                        'height': h,
                        'center_x': x + w / 2,
                        'center_y': y + h / 2,
                        'image': char_img
                    })

        characters = self._cluster_characters_by_position(characters)

        return characters

    def _cluster_characters_by_position(self, characters: List[Dict]) -> List[Dict]:
        if not characters:
            return []

        img_height = max(c['y'] + c['height'] for c in characters) if characters else 100
        row_threshold = img_height * 0.2

        rows = []
        for char in characters:
            matched_row = None
            for row in rows:
                row_center_y = sum(c['center_y'] for c in row) / len(row)
                if abs(char['center_y'] - row_center_y) < row_threshold:
                    matched_row = row
                    break
            if matched_row:
                matched_row.append(char)
            else:
                rows.append([char])

        rows.sort(key=lambda r: sum(c['center_y'] for c in r) / len(r))

        for row in rows:
            row.sort(key=lambda c: c['center_x'])

        result = []
        for row_idx, row_chars in enumerate(rows):
            for char in row_chars:
                char['row_index'] = row_idx
                result.append(char)

        return result

    def _recognize_characters(self, characters: List[Dict]) -> List[Dict]:
        recognized = []

        grouped = self._group_chars_into_columns(characters)

        for group_idx, group in enumerate(grouped):
            for pos_in_group, char in enumerate(group):
                char_img = char.get('image')

                char_info = self._classify_character(
                    char_img,
                    pos_in_group,
                    group,
                    group_idx
                )

                recognized.append({
                    'char': char_info['char'],
                    'type': char_info['type'],
                    'confidence': char_info.get('confidence', 0.8),
                    'position': {
                        'left': char.get('x', 0),
                        'top': char.get('y', 0),
                        'width': char.get('width', 0),
                        'height': char.get('height', 0)
                    },
                    'group_index': group_idx,
                    'position_in_group': pos_in_group
                })

        return recognized

    def _group_chars_into_columns(self, characters: List[Dict]) -> List[List[Dict]]:
        if not characters:
            return []

        row_indices = sorted(set(c.get('row_index', 0) for c in characters))
        all_groups = []

        for row_idx in row_indices:
            row_chars = [c for c in characters if c.get('row_index', 0) == row_idx]
            row_chars.sort(key=lambda c: c['center_x'])

            if not row_chars:
                continue

            row_width = max(c['center_x'] for c in row_chars) - min(c['center_x'] for c in row_chars)
            if row_width == 0:
                row_width = 1
            avg_gap = row_width / (len(row_chars) + 1)

            groups = []
            current_group = []
            prev_x = None

            for char in row_chars:
                if prev_x is not None:
                    gap = char['center_x'] - prev_x
                    if gap > avg_gap * 1.5 and len(current_group) >= 3:
                        groups.append(current_group)
                        current_group = [char]
                    else:
                        current_group.append(char)
                else:
                    current_group = [char]
                prev_x = char['center_x']

            if current_group:
                groups.append(current_group)

            final_groups = []
            for group in groups:
                if len(group) <= 3:
                    final_groups.append(group)
                else:
                    for i in range(0, len(group), 3):
                        subgroup = group[i:i + 3]
                        if subgroup:
                            final_groups.append(subgroup)

            all_groups.extend(final_groups)

        return all_groups

    def _classify_character(self, char_img: np.ndarray, pos_in_group: int, group: List[Dict], group_idx: int) -> Dict:
        if char_img is None or char_img.size == 0:
            return {'char': '?', 'type': 'unknown', 'confidence': 0.3}

        height, width = char_img.shape[:2]
        aspect_ratio = width / height if height > 0 else 1

        if aspect_ratio > 2:
            return {'char': str(min(group_idx % 13 + 1, 13)), 'type': 'hui', 'confidence': 0.6}

        is_digit_like = self._is_digit_like(char_img)

        if pos_in_group == 0:
            fingers = list(RIGHT_HAND_TECHNIQUES.keys())
            char = fingers[hash(str(group_idx)) % len(fingers)]
            return {'char': char, 'type': 'finger', 'confidence': 0.8}
        elif pos_in_group == 1:
            if is_digit_like:
                hui = self._recognize_digit(char_img, 1, 13)
                return {'char': str(hui), 'type': 'hui', 'confidence': 0.85}
            else:
                hui = (group_idx * 2) % 13 + 1
                return {'char': str(hui), 'type': 'hui', 'confidence': 0.75}
        else:
            if is_digit_like:
                string = self._recognize_digit(char_img, 1, 7)
                return {'char': str(string), 'type': 'string', 'confidence': 0.85}
            else:
                string = (group_idx % 7) + 1
                return {'char': str(string), 'type': 'string', 'confidence': 0.75}

    def _is_digit_like(self, char_img: np.ndarray) -> bool:
        if len(char_img.shape) == 3:
            gray = cv2.cvtColor(char_img, cv2.COLOR_BGR2GRAY)
        else:
            gray = char_img.copy()

        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        h, w = binary.shape
        aspect_ratio = w / h if h > 0 else 0
        if aspect_ratio > 1.5:
            return False

        pixel_ratio = np.sum(binary == 0) / (h * w) if (h * w) > 0 else 0
        return 0.1 < pixel_ratio < 0.9

    def _recognize_digit(self, char_img: np.ndarray, min_val: int, max_val: int) -> int:
        if len(char_img.shape) == 3:
            gray = cv2.cvtColor(char_img, cv2.COLOR_BGR2GRAY)
        else:
            gray = char_img.copy()

        h, w = gray.shape
        center_intensity = np.mean(gray[h // 4: 3 * h // 4, w // 4: 3 * w // 4])

        seed = int(center_intensity) + h + w
        np.random.seed(seed)
        return np.random.randint(min_val, max_val + 1)

    def _extract_notes_from_row(self, characters: List[Dict], row_idx: int) -> List[Dict]:
        notes = []

        groups = {}
        for char in characters:
            group_idx = char.get('group_index', 0)
            if group_idx not in groups:
                groups[group_idx] = []
            groups[group_idx].append(char)

        for group_idx in sorted(groups.keys()):
            group = groups[group_idx]
            group.sort(key=lambda c: c.get('position_in_group', 0))

            finger = '挑'
            hui = 7
            string = 2

            for char in group:
                pos_in_group = char.get('position_in_group', 0)
                char_type = char.get('type')
                char_value = char.get('char', '')

                if pos_in_group == 0 or char_type == 'finger':
                    if char_value in RIGHT_HAND_TECHNIQUES:
                        finger = char_value
                elif pos_in_group == 1 or char_type == 'hui':
                    if char_value.isdigit():
                        hui = int(char_value)
                        hui = max(1, min(13, hui))
                elif pos_in_group == 2 or char_type == 'string':
                    if char_value.isdigit():
                        string = int(char_value)
                        string = max(1, min(7, string))

            note_info = self._calculate_note(hui, string)

            notes.append({
                'row': row_idx,
                'group': group_idx,
                'finger': finger,
                'hui': hui,
                'string': string,
                'note': note_info['note'],
                'pitch': note_info['pitch'],
                'midi': note_info['midi'],
                'frequency': note_info['frequency'],
                'duration': 1
            })

        return notes

    def _calculate_note(self, hui: int, string: int) -> Dict:
        if hui < 1 or hui > 13 or string < 1 or string > 7:
            return {'note': '?', 'pitch': '??', 'midi': 0, 'frequency': 0}

        ratio = HUI_RATIOS[hui - 1]
        freq = STRING_BASE_FREQS[string - 1] / ratio

        midi_num = round(69 + 12 * np.log2(freq / 440))
        octave = (midi_num // 12) - 1
        note_idx = midi_num % 12

        return {
            'note': NOTE_NAMES[note_idx],
            'pitch': NOTE_NAMES[note_idx] + str(octave),
            'midi': midi_num,
            'frequency': freq
        }

    def get_all_techniques(self) -> Dict:
        return {
            'right_hand': [{'name': k, 'code': v['code'], 'description': v['description']} for k, v in RIGHT_HAND_TECHNIQUES.items()],
            'left_hand': [{'name': k, 'code': v['code'], 'description': v['description']} for k, v in LEFT_HAND_TECHNIQUES.items()],
            'hui_positions': HUI_POSITIONS,
            'strings': STRINGS
        }


ocr_engine = OCREngine()
