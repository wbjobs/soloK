import lasio
import numpy as np
import pandas as pd
from io import BytesIO
from typing import Dict, List, Optional, Tuple


class WellData:
    def __init__(self, well_name: str = ""):
        self.well_name = well_name
        self.df: Optional[pd.DataFrame] = None
        self.header: Dict = {}
        self.curves: List[str] = []
        self.units: Dict[str, str] = {}
        self.depth_unit: str = "m"

    def get_curve(self, curve_name: str) -> Optional[np.ndarray]:
        if self.df is not None and curve_name in self.df.columns:
            return self.df[curve_name].values
        return None

    def get_depth(self) -> Optional[np.ndarray]:
        return self.get_curve("DEPTH")

    def has_curve(self, curve_name: str) -> bool:
        return curve_name in self.curves


def load_las_file(file_content: bytes, well_name: str = "") -> WellData:
    well = WellData(well_name)
    try:
        las = lasio.read(BytesIO(file_content))
        well.df = las.df().reset_index()
        
        if "DEPTH" not in well.df.columns and "DEPT" in well.df.columns:
            well.df.rename(columns={"DEPT": "DEPTH"}, inplace=True)
        
        well.curves = list(well.df.columns)
        well.units = {curve.mnemonic: curve.unit for curve in las.curves}
        
        if hasattr(las, 'well'):
            for item in las.well:
                well.header[item.mnemonic] = {
                    'value': item.value,
                    'unit': item.unit,
                    'descr': item.descr
                }
            if "WELL" in well.header:
                well.well_name = str(well.header["WELL"]["value"]) or well_name
            if "STRT" in well.header:
                well.depth_unit = well.header["STRT"].get("unit", "m") or "m"
        
        return well
    except Exception as e:
        raise Exception(f"LAS文件解析失败: {str(e)}")


def load_las_from_path(file_path: str) -> WellData:
    with open(file_path, 'rb') as f:
        return load_las_file(f.read(), file_path.split('\\')[-1])


def generate_synthetic_well(well_name: str = "示例井A", depth_range: Tuple[float, float] = (1000, 3000), 
                            step: float = 0.1, seed: int = 42) -> WellData:
    np.random.seed(seed)
    depths = np.arange(depth_range[0], depth_range[1], step)
    n = len(depths)
    
    base_trend = (depths - depth_range[0]) / (depth_range[1] - depth_range[0])
    
    layer_markers = [int(n * 0.2), int(n * 0.4), int(n * 0.65), int(n * 0.85)]
    layer_params = [
        (60, 100, 2.65, 60),
        (75, 130, 2.4, 85),
        (55, 95, 2.7, 45),
        (85, 150, 2.35, 110),
        (65, 110, 2.55, 70),
    ]
    
    dt = np.zeros(n)
    dts = np.zeros(n)
    rho = np.zeros(n)
    gr = np.zeros(n)
    
    start_idx = 0
    for i, end_idx in enumerate(layer_markers + [n]):
        layer_len = end_idx - start_idx
        params = layer_params[min(i, len(layer_params) - 1)]
        
        dt[start_idx:end_idx] = params[0] + np.random.randn(layer_len) * 5
        dts[start_idx:end_idx] = params[1] + np.random.randn(layer_len) * 8
        rho[start_idx:end_idx] = params[2] + np.random.randn(layer_len) * 0.05
        gr[start_idx:end_idx] = params[3] + np.random.randn(layer_len) * 10
        start_idx = end_idx
    
    dt = np.clip(dt, 40, 120)
    dts = np.clip(dts, 70, 200)
    rho = np.clip(rho, 2.0, 3.0)
    gr = np.clip(gr, 10, 150)
    
    well = WellData(well_name)
    well.df = pd.DataFrame({
        "DEPTH": depths,
        "DT": dt,
        "DTS": dts,
        "RHOB": rho,
        "GR": gr,
    })
    well.curves = ["DEPTH", "DT", "DTS", "RHOB", "GR"]
    well.units = {
        "DEPTH": "m",
        "DT": "us/ft",
        "DTS": "us/ft",
        "RHOB": "g/cm3",
        "GR": "API",
    }
    well.depth_unit = "m"
    
    return well


def generate_synthetic_wells(count: int = 3) -> List[WellData]:
    wells = []
    names = ["示例井A", "示例井B", "示例井C", "示例井D"]
    for i in range(min(count, 4)):
        depth_shift = i * 50
        depth_range = (1000 + depth_shift, 3000 + depth_shift)
        well = generate_synthetic_well(names[i], depth_range=depth_range, seed=42 + i * 10)
        wells.append(well)
    return wells


def resample_well(well: WellData, target_depths: np.ndarray) -> WellData:
    if well.df is None:
        return well
    
    new_well = WellData(well.well_name)
    new_data = {"DEPTH": target_depths}
    
    source_depths = well.get_depth()
    
    for curve in well.curves:
        if curve == "DEPTH":
            continue
        values = well.get_curve(curve)
        if values is not None and source_depths is not None:
            new_data[curve] = np.interp(target_depths, source_depths, values, left=np.nan, right=np.nan)
    
    new_well.df = pd.DataFrame(new_data)
    new_well.curves = list(new_data.keys())
    new_well.units = well.units.copy()
    new_well.depth_unit = well.depth_unit
    new_well.header = well.header.copy()
    
    return new_well
