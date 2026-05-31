import numpy as np
import msgpack
from datetime import datetime
from typing import List, Optional, Dict
from config import config
from app.models.data_models import SensorData, VoxelGrid, InjectionWell

class DataStore:
    def __init__(self):
        self.current_sensor_data: List[SensorData] = []
        self.current_voxel_grid: Optional[VoxelGrid] = None
        self.historical_voxel_grids: List[Dict] = []
        self.time_series_cache: Dict[str, List] = {}
        self.injection_wells: Dict[str, InjectionWell] = {}
        
    def update_sensor_data(self, sensor_data: List[SensorData]):
        self.current_sensor_data = sensor_data
        
    def update_voxel_grid(self, voxel_grid: VoxelGrid):
        self.current_voxel_grid = voxel_grid
        
        if len(self.historical_voxel_grids) > 1000:
            self.historical_voxel_grids = self.historical_voxel_grids[-1000:]
    
    def add_injection_well(self, well: InjectionWell):
        self.injection_wells[well.well_id] = well
        
    def remove_injection_well(self, well_id: str):
        if well_id in self.injection_wells:
            del self.injection_wells[well_id]
            
    def get_injection_wells(self) -> List[Dict]:
        return [w.model_dump() for w in self.injection_wells.values()]
        
    def clear_injection_wells(self):
        self.injection_wells.clear()
            
    def get_compressed_voxel_data(self) -> bytes:
        if self.current_voxel_grid is None:
            return b''
            
        data = np.array(self.current_voxel_grid.data, dtype=np.float32)
        variance = np.array(self.current_voxel_grid.variance, dtype=np.float32) if self.current_voxel_grid.variance else None
        
        header = {
            "x_min": self.current_voxel_grid.x_min,
            "x_max": self.current_voxel_grid.x_max,
            "y_min": self.current_voxel_grid.y_min,
            "y_max": self.current_voxel_grid.y_max,
            "z_min": self.current_voxel_grid.z_min,
            "z_max": self.current_voxel_grid.z_max,
            "resolution": list(self.current_voxel_grid.resolution),
            "dimensions": list(self.current_voxel_grid.dimensions),
            "contaminant": self.current_voxel_grid.contaminant,
            "timestamp": self.current_voxel_grid.timestamp.isoformat(),
            "data_shape": list(data.shape),
            "has_variance": variance is not None
        }
        
        header_bytes = msgpack.packb(header)
        header_len = len(header_bytes).to_bytes(4, 'little')
        
        result = header_len + header_bytes + data.tobytes()
        if variance is not None:
            result += variance.tobytes()
            
        return result
    
    @staticmethod
    def decompress_voxel_data(compressed: bytes) -> Dict:
        if not compressed:
            return {}
            
        header_len = int.from_bytes(compressed[:4], 'little')
        header = msgpack.unpackb(compressed[4:4 + header_len])
        
        data_offset = 4 + header_len
        data_size = np.prod(header["data_shape"]) * 4
        data = np.frombuffer(compressed[data_offset:data_offset + data_size], dtype=np.float32)
        
        variance = None
        if header.get("has_variance"):
            var_offset = data_offset + data_size
            variance = np.frombuffer(compressed[var_offset:var_offset + data_size], dtype=np.float32)
            
        return {
            "header": header,
            "data": data.tolist(),
            "variance": variance.tolist() if variance is not None else None
        }
    
    def get_well_locations(self) -> List[Dict]:
        from app.services.data_generator import data_generator
        return [
            {
                "well_id": w.well_id,
                "x": w.x,
                "y": w.y,
                "z": w.z,
                "screen_top": w.screen_top,
                "screen_bottom": w.screen_bottom
            }
            for w in data_generator.wells
        ]
    
    def get_well_current_data(self) -> List[Dict]:
        from app.services.data_generator import data_generator
        
        well_dict = {w.well_id: w for w in data_generator.wells}
        result = []
        
        for sd in self.current_sensor_data:
            well = well_dict.get(sd.well_id)
            if well:
                result.append({
                    "well_id": sd.well_id,
                    "x": well.x,
                    "y": well.y,
                    "z": well.z,
                    "contaminants": sd.contaminant_concentration,
                    "water_level": sd.water_level,
                    "conductivity": sd.conductivity,
                    "temperature": sd.temperature,
                    "ph": sd.ph,
                    "redox_potential": sd.redox_potential,
                    "timestamp": sd.timestamp.isoformat()
                })
                
        return result

data_store = DataStore()
