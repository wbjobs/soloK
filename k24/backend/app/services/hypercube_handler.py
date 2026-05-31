import numpy as np
import os
import tempfile
from typing import Tuple, Optional, Dict, Any, List
from pathlib import Path
import spectral
import rasterio
from rasterio.transform import from_origin
from scipy.ndimage import label, find_objects


class HypercubeHandler:
    def __init__(self, upload_dir: str = "uploads"):
        self.upload_dir = Path(upload_dir)
        self.upload_dir.mkdir(exist_ok=True)
        self.hypercubes: Dict[str, Dict] = {}

    def load_envi_file(
        self,
        hdr_path: str,
        dat_path: Optional[str] = None
    ) -> Tuple[np.ndarray, np.ndarray]:
        img = spectral.open_image(hdr_path)
        
        if dat_path is None:
            dat_path = hdr_path.replace('.hdr', '.dat')
            if not os.path.exists(dat_path):
                dat_path = hdr_path.replace('.hdr', '.img')
        
        hypercube = img.load()
        
        wavelengths = None
        if hasattr(img, 'bands') and img.bands.centers is not None:
            wavelengths = np.array(img.bands.centers)
        else:
            n_bands = hypercube.shape[2]
            wavelengths = np.linspace(400, 1000, n_bands)
        
        return hypercube, wavelengths

    def load_from_array(
        self,
        data: np.ndarray,
        wavelengths: Optional[np.ndarray] = None
    ) -> Tuple[np.ndarray, np.ndarray]:
        if data.ndim == 2:
            data = data.reshape(data.shape[0], data.shape[1], 1)
        
        if wavelengths is None:
            n_bands = data.shape[2]
            wavelengths = np.linspace(400, 1000, n_bands)
        
        return data, wavelengths

    def save_hypercube(
        self,
        hypercube: np.ndarray,
        wavelengths: np.ndarray,
        file_id: str,
        metadata: Optional[Dict] = None
    ) -> str:
        save_path = self.upload_dir / f"{file_id}.npy"
        np.save(save_path, hypercube)
        
        self.hypercubes[file_id] = {
            'path': str(save_path),
            'wavelengths': wavelengths,
            'shape': hypercube.shape,
            'metadata': metadata or {}
        }
        
        return str(save_path)

    def get_hypercube(self, file_id: str) -> Optional[Tuple[np.ndarray, np.ndarray]]:
        if file_id not in self.hypercubes:
            return None
        
        cube_info = self.hypercubes[file_id]
        hypercube = np.load(cube_info['path'])
        wavelengths = cube_info['wavelengths']
        
        return hypercube, wavelengths

    def get_mean_spectrum(self, hypercube: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        mean_spec = np.mean(hypercube, axis=(0, 1))
        std_spec = np.std(hypercube, axis=(0, 1))
        return mean_spec, std_spec

    def get_rgb_preview(
        self,
        hypercube: np.ndarray,
        wavelengths: np.ndarray,
        contrast: float = 0.02
    ) -> np.ndarray:
        r_idx = np.argmin(np.abs(wavelengths - 650))
        g_idx = np.argmin(np.abs(wavelengths - 550))
        b_idx = np.argmin(np.abs(wavelengths - 450))
        
        rgb = hypercube[:, :, [r_idx, g_idx, b_idx]].copy()
        
        for i in range(3):
            band = rgb[:, :, i]
            low = np.percentile(band, contrast * 100)
            high = np.percentile(band, (1 - contrast) * 100)
            if high > low:
                rgb[:, :, i] = np.clip((band - low) / (high - low), 0, 1)
        
        return (rgb * 255).astype(np.uint8)

    def generate_geojson(
        self,
        classification_map: np.ndarray,
        severity_map: np.ndarray,
        class_names: list,
        bbox: Optional[Tuple[float, float, float, float]] = None
    ) -> Dict[str, Any]:
        height, width = classification_map.shape
        
        if bbox is None:
            bbox = (0, 0, width, height)
        
        min_x, min_y, max_x, max_y = bbox
        pixel_width = (max_x - min_x) / width
        pixel_height = (max_y - min_y) / height
        
        features = []
        
        for i in range(height):
            for j in range(width):
                class_id = int(classification_map[i, j])
                severity = float(severity_map[i, j])
                
                x1 = min_x + j * pixel_width
                y1 = min_y + i * pixel_height
                x2 = x1 + pixel_width
                y2 = y1 + pixel_height
                
                polygon = [
                    [x1, y1],
                    [x2, y1],
                    [x2, y2],
                    [x1, y2],
                    [x1, y1]
                ]
                
                feature = {
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [polygon]
                    },
                    "properties": {
                        "class_id": class_id,
                        "class_name": class_names[class_id],
                        "severity": severity,
                        "pixel_x": j,
                        "pixel_y": i
                    }
                }
                features.append(feature)
        
        return {
            "type": "FeatureCollection",
            "features": features,
            "bbox": bbox
        }

    def detect_small_lesions(
        self,
        classification_map: np.ndarray,
        severity_map: np.ndarray,
        min_area_ratio: float = 0.001,
        background_class: int = 0
    ) -> Tuple[np.ndarray, List[Dict[str, Any]]]:
        height, width = classification_map.shape
        total_pixels = height * width
        
        diseased_mask = (classification_map != background_class) & (severity_map >= 2)
        
        labeled, num_features = label(diseased_mask)
        
        enhanced_severity = severity_map.copy()
        small_lesions = []
        
        if num_features > 0:
            objects = find_objects(labeled)
            
            for i, obj_slice in enumerate(objects):
                region_mask = (labeled[obj_slice] == (i + 1))
                region_area = np.sum(region_mask)
                area_ratio = region_area / total_pixels
                
                if area_ratio < 0.01 and area_ratio >= min_area_ratio:
                    region_severity = severity_map[obj_slice][region_mask]
                    mean_severity = float(np.mean(region_severity))
                    max_severity = float(np.max(region_severity))
                    
                    center_y = (obj_slice[0].start + obj_slice[0].stop) // 2
                    center_x = (obj_slice[1].start + obj_slice[1].stop) // 2
                    
                    class_ids, counts = np.unique(
                        classification_map[obj_slice][region_mask],
                        return_counts=True
                    )
                    dominant_class = int(class_ids[np.argmax(counts)])
                    
                    enhanced_severity[obj_slice][region_mask] = np.maximum(
                        enhanced_severity[obj_slice][region_mask],
                        mean_severity * 1.3
                    )
                    
                    small_lesions.append({
                        'id': i,
                        'center': [center_x, center_y],
                        'area_pixels': int(region_area),
                        'area_ratio': float(area_ratio),
                        'mean_severity': mean_severity,
                        'max_severity': max_severity,
                        'dominant_class': dominant_class,
                        'bbox': [
                            obj_slice[1].start,
                            obj_slice[0].start,
                            obj_slice[1].stop,
                            obj_slice[0].stop
                        ]
                    })
        
        return enhanced_severity, small_lesions

    def generate_enhanced_heatmap(
        self,
        classification_map: np.ndarray,
        severity_map: np.ndarray,
        enhance_small_lesions: bool = True,
        background_class: int = 0
    ) -> Tuple[np.ndarray, List[Dict[str, Any]]]:
        small_lesions = []
        
        if enhance_small_lesions:
            severity_map, small_lesions = self.detect_small_lesions(
                classification_map,
                severity_map,
                background_class=background_class
            )
        
        return severity_map, small_lesions

    def generate_prescription_map(
        self,
        severity_map: np.ndarray,
        base_rate: float = 100.0,
        fertilizer_types: list = None
    ) -> Tuple[np.ndarray, Dict[str, float]]:
        fertilizer_types = fertilizer_types or ["氮肥", "磷肥", "钾肥"]
        
        height, width = severity_map.shape
        prescription = np.zeros((height, width, len(fertilizer_types)))
        
        for i, fert_type in enumerate(fertilizer_types):
            if fert_type == "氮肥":
                rate_multiplier = 1 + (severity_map - 1) * 0.3
            elif fert_type == "磷肥":
                rate_multiplier = 1 + (severity_map - 1) * 0.2
            elif fert_type == "钾肥":
                rate_multiplier = 1 + (severity_map - 1) * 0.25
            else:
                rate_multiplier = 1 + (severity_map - 1) * 0.2
            
            prescription[:, :, i] = base_rate * rate_multiplier
        
        totals = {
            fert: float(np.sum(prescription[:, :, i])) 
            for i, fert in enumerate(fertilizer_types)
        }
        
        return prescription, totals
