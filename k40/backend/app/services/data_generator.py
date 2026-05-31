import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict
from config import config
from app.models.data_models import MonitoringWell, SensorData

class DataGenerator:
    def __init__(self):
        self.wells: List[MonitoringWell] = []
        self.historical_data: Dict[str, List[SensorData]] = {}
        self._initialize_wells()
        self.plume_center = (50, 50, 10)
        self.decay_rate = 0.001
        
    def _initialize_wells(self):
        np.random.seed(42)
        x_min, x_max, y_min, y_max, z_min, z_max = config.SITE_BOUNDS
        
        for i in range(config.NUM_MONITORING_WELLS):
            x = np.random.uniform(x_min + 5, x_max - 5)
            y = np.random.uniform(y_min + 5, y_max - 5)
            z = np.random.uniform(z_min, z_max)
            
            well = MonitoringWell(
                well_id=f"MW-{i+1:03d}",
                x=x,
                y=y,
                z=z,
                screen_top=z + 2,
                screen_bottom=z - 2,
                active=True
            )
            self.wells.append(well)
            self.historical_data[well.well_id] = []
        
    def _generate_contaminant_plume(self, x: float, y: float, z: float, 
                                     time_hours: float = 0) -> Dict[str, float]:
        cx, cy, cz = self.plume_center
        dx = x - cx + time_hours * 0.01
        dy = y - cy + time_hours * 0.005
        dz = z - cz
        
        distance = np.sqrt(dx**2 + dy**2 + dz**2)
        base_concentration = 100 * np.exp(-distance**2 / (2 * 20**2))
        base_concentration *= np.exp(-self.decay_rate * time_hours)
        
        if base_concentration < 0.1:
            base_concentration = np.random.uniform(0, 0.5)
            
        concentration_1d = np.zeros_like(x) if hasattr(x, '__len__') else 0.0
        if hasattr(x, '__len__'):
            concentration_1d = base_concentration * (1 + 0.2 * np.sin(dx * 0.1) * np.cos(dy * 0.1))
        else:
            concentration_1d = base_concentration * (1 + 0.2 * np.sin(dx * 0.1) * np.cos(dy * 0.1))
        
        return {
            "TCE": max(0.1, concentration_1d),
            "PCE": max(0.05, concentration_1d * 0.6),
            "Chromium": max(0.01, concentration_1d * 0.3),
            "Lead": max(0.005, concentration_1d * 0.15)
        }
    
    def generate_sensor_data(self, well_id: str, timestamp: datetime = None,
                             time_hours: float = 0) -> SensorData:
        if timestamp is None:
            timestamp = datetime.now()
            
        well = next(w for w in self.wells if w.well_id == well_id)
        
        base_conductivity = 500 + 100 * np.sin(time_hours * 0.01)
        
        data = SensorData(
            well_id=well_id,
            timestamp=timestamp,
            water_level=np.random.normal(5, 0.5),
            conductivity=np.random.normal(base_conductivity, 20),
            temperature=np.random.normal(15, 1),
            ph=np.random.normal(7.2, 0.3),
            redox_potential=np.random.normal(200, 30),
            contaminant_concentration=self._generate_contaminant_plume(
                well.x, well.y, well.z, time_hours
            )
        )
        
        self.historical_data[well_id].append(data)
        if len(self.historical_data[well_id]) > 8760:
            self.historical_data[well_id] = self.historical_data[well_id][-8760:]
            
        return data
    
    def generate_all_sensor_data(self, timestamp: datetime = None, 
                                  time_hours: float = 0) -> List[SensorData]:
        if timestamp is None:
            timestamp = datetime.now()
            
        return [
            self.generate_sensor_data(well.well_id, timestamp, time_hours)
            for well in self.wells if well.active
        ]
    
    def generate_historical_dataset(self, start_time: datetime, 
                                     end_time: datetime,
                                     interval_hours: int = 1) -> List[Dict]:
        time_points = []
        current_time = start_time
        hours_elapsed = 0
        
        while current_time <= end_time:
            sensor_data = self.generate_all_sensor_data(current_time, hours_elapsed)
            time_points.append({
                "timestamp": current_time,
                "sensor_data": sensor_data,
                "time_hours": hours_elapsed
            })
            current_time += timedelta(hours=interval_hours)
            hours_elapsed += interval_hours
            
        return time_points
    
    def get_well_data(self, well_id: str) -> List[SensorData]:
        return self.historical_data.get(well_id, [])
    
    def get_well_trend(self, well_id: str, hours: int = 720) -> Dict:
        data = self.get_well_data(well_id)
        if not data:
            return {}
            
        recent_data = data[-min(len(data), hours):]
        timestamps = [d.timestamp for d in recent_data]
        tce_values = [d.contaminant_concentration.get("TCE", 0) for d in recent_data]
        
        return {
            "well_id": well_id,
            "timestamps": timestamps,
            "tce_concentration": tce_values,
            "water_level": [d.water_level for d in recent_data],
            "temperature": [d.temperature for d in recent_data]
        }

data_generator = DataGenerator()
