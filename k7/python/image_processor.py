import cv2
import numpy as np
from PIL import Image
import io
import base64


class ImageProcessor:
    def __init__(self):
        self.default_threshold = 128
        self.denoise_strength = 3

    def decode_image(self, image_data: str) -> np.ndarray:
        if image_data.startswith('data:'):
            image_data = image_data.split(',')[1]
        img_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("无法解码图片")
        return img

    def encode_image(self, img: np.ndarray, fmt: str = '.png') -> str:
        _, buffer = cv2.imencode(fmt, img)
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        return f"data:image/{fmt[1:]};base64,{img_base64}"

    def preprocess(self, img: np.ndarray, options: dict = None) -> dict:
        options = options or {}
        results = {}

        if options.get('binarization', True):
            results['binarized'] = self.binarize(img, options.get('threshold', self.default_threshold))

        if options.get('denoise', True):
            denoised = self.denoise(img, options.get('strength', self.denoise_strength))
            results['denoised'] = denoised
            if options.get('binarization', True):
                results['denoised_binarized'] = self.binarize(denoised, options.get('threshold', self.default_threshold))

        if options.get('row_segmentation', True):
            results['rows'] = self.segment_rows(img)

        if options.get('character_localization', True):
            base_img = results.get('denoised_binarized', results.get('binarized', img))
            results['characters'] = self.localize_characters(base_img, results.get('rows', []))

        return results

    def binarize(self, img: np.ndarray, threshold: int = None) -> np.ndarray:
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img.copy()

        if threshold is None:
            _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        else:
            _, binary = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)

        return binary

    def denoise(self, img: np.ndarray, strength: int = 3) -> np.ndarray:
        if len(img.shape) == 3:
            denoised = cv2.fastNlMeansDenoisingColored(img, None, strength, strength, 7, 21)
        else:
            denoised = cv2.fastNlMeansDenoising(img, None, strength, 7, 21)
        return denoised

    def segment_rows(self, img: np.ndarray) -> list:
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img.copy()

        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        inverted = cv2.bitwise_not(binary)

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (img.shape[1] // 4, 1))
        dilated = cv2.dilate(inverted, kernel, iterations=1)

        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        rows = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            if h > 20 and w > img.shape[1] * 0.3:
                rows.append({
                    'x': x,
                    'y': y,
                    'width': w,
                    'height': h,
                    'image': img[y:y+h, x:x+w].copy()
                })

        rows.sort(key=lambda r: r['y'])
        return rows

    def localize_characters(self, img: np.ndarray, rows: list = None) -> list:
        all_characters = []

        if rows:
            for row_idx, row in enumerate(rows):
                row_img = row.get('image', img)
                chars = self._detect_characters_in_region(row_img, row.get('y', 0), row.get('x', 0))
                for char in chars:
                    char['row_index'] = row_idx
                all_characters.extend(chars)
        else:
            all_characters = self._detect_characters_in_region(img, 0, 0)

        return all_characters

    def _detect_characters_in_region(self, img: np.ndarray, offset_y: int = 0, offset_x: int = 0) -> list:
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img.copy()

        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        inverted = cv2.bitwise_not(binary)

        contours, _ = cv2.findContours(inverted, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        characters = []
        min_area = 100
        max_area = img.shape[0] * img.shape[1] * 0.5

        for contour in contours:
            area = cv2.contourArea(contour)
            if min_area < area < max_area:
                x, y, w, h = cv2.boundingRect(contour)
                aspect_ratio = w / h if h > 0 else 0
                if 0.2 < aspect_ratio < 5.0:
                    char_img = img[y:y+h, x:x+w].copy()
                    characters.append({
                        'x': x + offset_x,
                        'y': y + offset_y,
                        'width': w,
                        'height': h,
                        'image': char_img,
                        'center_x': x + w / 2 + offset_x,
                        'center_y': y + h / 2 + offset_y
                    })

        characters.sort(key=lambda c: (c['x'], c['y']))
        return characters

    def enhance_image(self, img: np.ndarray) -> np.ndarray:
        if len(img.shape) == 3:
            lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            l = clahe.apply(l)
            enhanced = cv2.merge([l, a, b])
            enhanced = cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)
        else:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(img)
        return enhanced

    def deskew_image(self, img: np.ndarray) -> np.ndarray:
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img.copy()

        gray = cv2.bitwise_not(gray)
        coords = np.column_stack(np.where(gray > 0))

        if len(coords) == 0:
            return img

        angle = cv2.minAreaRect(coords)[-1]

        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle

        (h, w) = img.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

        return rotated


image_processor = ImageProcessor()
