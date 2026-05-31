import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class IndexResult:
    name: str
    values: np.ndarray
    mean: float
    std: float
    min: float
    max: float
    description: str


class VegetationIndexCalculator:
    def __init__(self, wavelengths: Optional[np.ndarray] = None):
        self.wavelengths = wavelengths
        self.index_descriptions = {
            'NDVI': '归一化植被指数，反映植被覆盖度和生长状况',
            'PRI': '光化学反射指数，反映植被光合效率',
            'PSRI': '植物衰老反射指数，反映植被衰老程度',
            'CCCI': '冠层叶绿素含量指数，反映叶绿素含量',
            'NDRE': '归一化红边指数，反映植被氮素状况',
            'GNDVI': '绿色归一化植被指数，对叶绿素更敏感',
            'SAVI': '土壤调整植被指数，减少土壤背景影响',
            'EVI': '增强型植被指数，减少大气和土壤影响'
        }

    def _find_band(self, target_wl: float) -> int:
        if self.wavelengths is None:
            raise ValueError("Wavelengths not provided")
        return np.argmin(np.abs(self.wavelengths - target_wl))

    def calculate_ndvi(self, hypercube: np.ndarray) -> IndexResult:
        nir_band = self._find_band(800)
        red_band = self._find_band(670)
        
        nir = hypercube[:, :, nir_band]
        red = hypercube[:, :, red_band]
        
        ndvi = (nir - red) / (nir + red + 1e-8)
        ndvi = np.clip(ndvi, -1, 1)
        
        return IndexResult(
            name='NDVI',
            values=ndvi,
            mean=float(np.nanmean(ndvi)),
            std=float(np.nanstd(ndvi)),
            min=float(np.nanmin(ndvi)),
            max=float(np.nanmax(ndvi)),
            description=self.index_descriptions['NDVI']
        )

    def calculate_pri(self, hypercube: np.ndarray) -> IndexResult:
        band531 = self._find_band(531)
        band570 = self._find_band(570)
        
        r531 = hypercube[:, :, band531]
        r570 = hypercube[:, :, band570]
        
        pri = (r531 - r570) / (r531 + r570 + 1e-8)
        pri = np.clip(pri, -1, 1)
        
        return IndexResult(
            name='PRI',
            values=pri,
            mean=float(np.nanmean(pri)),
            std=float(np.nanstd(pri)),
            min=float(np.nanmin(pri)),
            max=float(np.nanmax(pri)),
            description=self.index_descriptions['PRI']
        )

    def calculate_psri(self, hypercube: np.ndarray) -> IndexResult:
        band680 = self._find_band(680)
        band500 = self._find_band(500)
        band750 = self._find_band(750)
        
        r680 = hypercube[:, :, band680]
        r500 = hypercube[:, :, band500]
        r750 = hypercube[:, :, band750]
        
        psri = (r680 - r500) / (r750 + 1e-8)
        
        return IndexResult(
            name='PSRI',
            values=psri,
            mean=float(np.nanmean(psri)),
            std=float(np.nanstd(psri)),
            min=float(np.nanmin(psri)),
            max=float(np.nanmax(psri)),
            description=self.index_descriptions['PSRI']
        )

    def calculate_ccci(self, hypercube: np.ndarray) -> IndexResult:
        nir_band = self._find_band(800)
        red_band = self._find_band(670)
        rededge_band = self._find_band(720)
        
        nir = hypercube[:, :, nir_band]
        red = hypercube[:, :, red_band]
        rededge = hypercube[:, :, rededge_band]
        
        ndre = (nir - rededge) / (nir + rededge + 1e-8)
        ndvi = (nir - red) / (nir + red + 1e-8)
        
        ccci = ndre / (ndvi + 1e-8)
        
        return IndexResult(
            name='CCCI',
            values=ccci,
            mean=float(np.nanmean(ccci)),
            std=float(np.nanstd(ccci)),
            min=float(np.nanmin(ccci)),
            max=float(np.nanmax(ccci)),
            description=self.index_descriptions['CCCI']
        )

    def calculate_ndre(self, hypercube: np.ndarray) -> IndexResult:
        nir_band = self._find_band(800)
        rededge_band = self._find_band(720)
        
        nir = hypercube[:, :, nir_band]
        rededge = hypercube[:, :, rededge_band]
        
        ndre = (nir - rededge) / (nir + rededge + 1e-8)
        ndre = np.clip(ndre, -1, 1)
        
        return IndexResult(
            name='NDRE',
            values=ndre,
            mean=float(np.nanmean(ndre)),
            std=float(np.nanstd(ndre)),
            min=float(np.nanmin(ndre)),
            max=float(np.nanmax(ndre)),
            description=self.index_descriptions['NDRE']
        )

    def calculate_gndvi(self, hypercube: np.ndarray) -> IndexResult:
        nir_band = self._find_band(800)
        green_band = self._find_band(550)
        
        nir = hypercube[:, :, nir_band]
        green = hypercube[:, :, green_band]
        
        gndvi = (nir - green) / (nir + green + 1e-8)
        gndvi = np.clip(gndvi, -1, 1)
        
        return IndexResult(
            name='GNDVI',
            values=gndvi,
            mean=float(np.nanmean(gndvi)),
            std=float(np.nanstd(gndvi)),
            min=float(np.nanmin(gndvi)),
            max=float(np.nanmax(gndvi)),
            description=self.index_descriptions['GNDVI']
        )

    def calculate_savi(self, hypercube: np.ndarray, L: float = 0.5) -> IndexResult:
        nir_band = self._find_band(800)
        red_band = self._find_band(670)
        
        nir = hypercube[:, :, nir_band]
        red = hypercube[:, :, red_band]
        
        savi = (nir - red) * (1 + L) / (nir + red + L + 1e-8)
        savi = np.clip(savi, -1, 1)
        
        return IndexResult(
            name='SAVI',
            values=savi,
            mean=float(np.nanmean(savi)),
            std=float(np.nanstd(savi)),
            min=float(np.nanmin(savi)),
            max=float(np.nanmax(savi)),
            description=self.index_descriptions['SAVI']
        )

    def calculate_evi(self, hypercube: np.ndarray) -> IndexResult:
        nir_band = self._find_band(800)
        red_band = self._find_band(670)
        blue_band = self._find_band(450)
        
        nir = hypercube[:, :, nir_band]
        red = hypercube[:, :, red_band]
        blue = hypercube[:, :, blue_band]
        
        evi = 2.5 * (nir - red) / (nir + 6 * red - 7.5 * blue + 1 + 1e-8)
        evi = np.clip(evi, -1, 1)
        
        return IndexResult(
            name='EVI',
            values=evi,
            mean=float(np.nanmean(evi)),
            std=float(np.nanstd(evi)),
            min=float(np.nanmin(evi)),
            max=float(np.nanmax(evi)),
            description=self.index_descriptions['EVI']
        )

    def calculate_all(self, hypercube: np.ndarray) -> Dict[str, IndexResult]:
        return {
            'NDVI': self.calculate_ndvi(hypercube),
            'PRI': self.calculate_pri(hypercube),
            'PSRI': self.calculate_psri(hypercube),
            'CCCI': self.calculate_ccci(hypercube),
            'NDRE': self.calculate_ndre(hypercube),
            'GNDVI': self.calculate_gndvi(hypercube),
            'SAVI': self.calculate_savi(hypercube),
            'EVI': self.calculate_evi(hypercube)
        }


class ChangeDetector:
    def __init__(self, wavelengths: Optional[np.ndarray] = None):
        self.wavelengths = wavelengths
        self.vi_calculator = VegetationIndexCalculator(wavelengths)

    def detect_changes(
        self,
        hypercube1: np.ndarray,
        hypercube2: np.ndarray,
        index_name: str = 'NDVI'
    ) -> Dict:
        vi_func = getattr(self.vi_calculator, f'calculate_{index_name.lower()}')
        vi1 = vi_func(hypercube1)
        vi2 = vi_func(hypercube2)
        
        diff = vi2.values - vi1.values
        
        change_mask = np.abs(diff) > 0.1
        
        positive_changes = np.sum(diff > 0.1)
        negative_changes = np.sum(diff < -0.1)
        total_pixels = diff.size
        
        change_magnitude = np.mean(np.abs(diff))
        
        direction = self._calculate_direction(diff)
        
        rate = change_magnitude
        
        return {
            'index_name': index_name,
            'vi_mean_before': vi1.mean,
            'vi_mean_after': vi2.mean,
            'vi_change': vi2.mean - vi1.mean,
            'change_map': diff.tolist(),
            'change_magnitude': float(change_magnitude),
            'positive_change_ratio': float(positive_changes / total_pixels),
            'negative_change_ratio': float(negative_changes / total_pixels),
            'no_change_ratio': float((total_pixels - positive_changes - negative_changes) / total_pixels),
            'spread_direction': direction,
            'spread_rate': float(rate),
            'change_summary': self._summarize_changes(diff)
        }

    def _calculate_direction(self, diff: np.ndarray) -> Dict:
        height, width = diff.shape
        
        center_y, center_x = height // 2, width // 2
        
        negative_mask = diff < -0.1
        
        if np.sum(negative_mask) == 0:
            return {'angle': 0, 'direction': '无明显变化'}
        
        y_coords, x_coords = np.where(negative_mask)
        
        if len(y_coords) == 0:
            return {'angle': 0, 'direction': '无明显变化'}
        
        centroid_y = np.mean(y_coords)
        centroid_x = np.mean(x_coords)
        
        dy = centroid_y - center_y
        dx = centroid_x - center_x
        
        angle = np.arctan2(dy, dx) * 180 / np.pi
        
        direction_names = [
            '东', '东南', '南', '西南',
            '西', '西北', '北', '东北'
        ]
        idx = int(((angle + 180 + 22.5) % 360) // 45)
        direction_name = direction_names[idx]
        
        return {
            'angle': float(angle),
            'direction': direction_name,
            'centroid': {'x': float(centroid_x), 'y': float(centroid_y)},
            'center': {'x': float(center_x), 'y': float(center_y)}
        }

    def _summarize_changes(self, diff: np.ndarray) -> List[Dict]:
        percentiles = [10, 25, 50, 75, 90]
        summary = []
        
        for p in percentiles:
            summary.append({
                'percentile': p,
                'value': float(np.percentile(diff, p))
            })
        
        return summary

    def compare_timestamps(
        self,
        hypercubes: List[np.ndarray],
        dates: List[str],
        index_name: str = 'NDVI'
    ) -> Dict:
        vi_func = getattr(self.vi_calculator, f'calculate_{index_name.lower()}')
        
        vi_timeseries = []
        for hc in hypercubes:
            vi = vi_func(hc)
            vi_timeseries.append({
                'mean': vi.mean,
                'std': vi.std,
                'min': vi.min,
                'max': vi.max
            })
        
        changes = []
        for i in range(1, len(hypercubes)):
            change = self.detect_changes(hypercubes[i-1], hypercubes[i], index_name)
            changes.append({
                'from_date': dates[i-1],
                'to_date': dates[i],
                'vi_change': change['vi_change'],
                'change_magnitude': change['change_magnitude'],
                'spread_direction': change['spread_direction']
            })
        
        return {
            'index_name': index_name,
            'dates': dates,
            'timeseries': vi_timeseries,
            'changes': changes,
            'overall_trend': vi_timeseries[-1]['mean'] - vi_timeseries[0]['mean']
        }
