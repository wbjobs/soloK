from influxdb_client import InfluxDBClient, Point, WriteOptions
from influxdb_client.client.write_api import SYNCHRONOUS
from datetime import datetime
from typing import List, Dict, Optional
import numpy as np
from .config import settings


class InfluxDBManager:
    def __init__(self):
        self.client = InfluxDBClient(
            url=settings.INFLUXDB_URL,
            token=settings.INFLUXDB_TOKEN,
            org=settings.INFLUXDB_ORG
        )
        self.write_api = self.client.write_api(write_options=SYNCHRONOUS)
        self.query_api = self.client.query_api()
        self.bucket = settings.INFLUXDB_BUCKET
        self.org = settings.INFLUXDB_ORG

    def write_vibration_data(self, motor_id: str, x_data: np.ndarray, 
                             y_data: np.ndarray, z_data: np.ndarray, 
                             timestamp: Optional[datetime] = None):
        if timestamp is None:
            timestamp = datetime.utcnow()
        
        points = []
        for i in range(len(x_data)):
            point = Point("vibration") \
                .tag("motor_id", motor_id) \
                .field("x", float(x_data[i])) \
                .field("y", float(y_data[i])) \
                .field("z", float(z_data[i])) \
                .time(timestamp)
            points.append(point)
        
        self.write_api.write(bucket=self.bucket, org=self.org, record=points)

    def write_current_data(self, motor_id: str, phase_a: np.ndarray,
                           phase_b: np.ndarray, phase_c: np.ndarray,
                           timestamp: Optional[datetime] = None):
        if timestamp is None:
            timestamp = datetime.utcnow()
        
        points = []
        for i in range(len(phase_a)):
            point = Point("current") \
                .tag("motor_id", motor_id) \
                .field("phase_a", float(phase_a[i])) \
                .field("phase_b", float(phase_b[i])) \
                .field("phase_c", float(phase_c[i])) \
                .time(timestamp)
            points.append(point)
        
        self.write_api.write(bucket=self.bucket, org=self.org, record=points)

    def write_temperature_data(self, motor_id: str, bearing_temp: float,
                               winding_temp: float, 
                               timestamp: Optional[datetime] = None):
        if timestamp is None:
            timestamp = datetime.utcnow()
        
        point = Point("temperature") \
            .tag("motor_id", motor_id) \
            .field("bearing", bearing_temp) \
            .field("winding", winding_temp) \
            .time(timestamp)
        
        self.write_api.write(bucket=self.bucket, org=self.org, record=point)

    def query_data(self, motor_id: str, measurement: str, 
                   start_time: str, end_time: str) -> List[Dict]:
        flux_query = f'''
            from(bucket: "{self.bucket}")
                |> range(start: {start_time}, stop: {end_time})
                |> filter(fn: (r) => r["_measurement"] == "{measurement}")
                |> filter(fn: (r) => r["motor_id"] == "{motor_id}")
                |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        '''
        
        result = self.query_api.query(flux_query, org=self.org)
        data = []
        for table in result:
            for record in table.records:
                data.append(record.values)
        return data

    def close(self):
        self.client.close()


influxdb_manager = InfluxDBManager()
