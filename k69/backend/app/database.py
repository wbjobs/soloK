import os
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS
from dotenv import load_dotenv

load_dotenv()

class InfluxDBManager:
    MAX_QUERY_DAYS = 7
    MAX_POINTS_PER_QUERY = 50000

    def __init__(self):
        self.url = os.getenv("INFLUXDB_URL")
        self.token = os.getenv("INFLUXDB_TOKEN")
        self.org = os.getenv("INFLUXDB_ORG")
        self.bucket = os.getenv("INFLUXDB_BUCKET")
        self.client = None
        self.write_api = None
        self.query_api = None

    def connect(self):
        self.client = InfluxDBClient(
            url=self.url,
            token=self.token,
            org=self.org,
            timeout=300000
        )
        self.write_api = self.client.write_api(write_options=SYNCHRONOUS)
        self.query_api = self.client.query_api()

    def close(self):
        if self.client:
            self.client.close()

    def write_seismic_data(self, data_points: List[Dict]):
        points = []
        for dp in data_points:
            point = Point("seismic_wave") \
                .field("amplitude", dp["amplitude"]) \
                .time(dp["timestamp"], WritePrecision.MS)
            points.append(point)
        self.write_api.write(bucket=self.bucket, org=self.org, record=points)

    def _get_aggregation_interval(self, time_diff_seconds: float) -> Tuple[str, int]:
        if time_diff_seconds <= 300:
            return None, 1
        elif time_diff_seconds <= 3600:
            return "10ms", 1
        elif time_diff_seconds <= 21600:
            return "100ms", 1
        elif time_diff_seconds <= 86400:
            return "1s", 10
        elif time_diff_seconds <= 604800:
            return "10s", 100
        else:
            return "1m", 600

    def _validate_time_range(self, start_time: datetime, end_time: datetime) -> Tuple[datetime, datetime, bool]:
        time_diff = end_time - start_time
        max_diff = timedelta(days=self.MAX_QUERY_DAYS)
        was_truncated = False
        if time_diff > max_diff:
            end_time = start_time + max_diff
            was_truncated = True
        return start_time, end_time, was_truncated

    def query_seismic_data(self, start_time: datetime, end_time: datetime, max_points: int = None) -> Tuple[List[Dict], bool]:
        if max_points is None:
            max_points = self.MAX_POINTS_PER_QUERY
        start_time, end_time, was_truncated = self._validate_time_range(start_time, end_time)
        time_diff_seconds = (end_time - start_time).total_seconds()
        agg_interval, _ = self._get_aggregation_interval(time_diff_seconds)
        if agg_interval:
            flux_query = f'''
            from(bucket: "{self.bucket}")
                |> range(start: {start_time.isoformat()}Z, stop: {end_time.isoformat()}Z)
                |> filter(fn: (r) => r["_measurement"] == "seismic_wave")
                |> filter(fn: (r) => r["_field"] == "amplitude")
                |> aggregateWindow(every: {agg_interval}, fn: mean, createEmpty: false)
                |> sort(columns: ["_time"])
            '''
        else:
            flux_query = f'''
            from(bucket: "{self.bucket}")
                |> range(start: {start_time.isoformat()}Z, stop: {end_time.isoformat()}Z)
                |> filter(fn: (r) => r["_measurement"] == "seismic_wave")
                |> filter(fn: (r) => r["_field"] == "amplitude")
                |> sort(columns: ["_time"])
            '''
        result = self.query_api.query(flux_query)
        data = []
        for table in result:
            for record in table.records:
                data.append({
                    "timestamp": record.get_time().isoformat(),
                    "amplitude": record.get_value()
                })
        if len(data) > max_points:
            data = self._downsample_data(data, max_points)
            was_truncated = True
        return data, was_truncated

    def _downsample_data(self, data: List[Dict], max_points: int) -> List[Dict]:
        if len(data) <= max_points:
            return data
        ratio = len(data) // max_points
        if ratio <= 1:
            return data
        sampled = []
        for i in range(0, len(data), ratio):
            sampled.append(data[i])
        return sampled

    def query_seismic_data_pandas(self, start_time: datetime, end_time: datetime, max_points: int = None) -> Tuple[pd.DataFrame, bool]:
        if max_points is None:
            max_points = self.MAX_POINTS_PER_QUERY
        start_time, end_time, was_truncated = self._validate_time_range(start_time, end_time)
        time_diff_seconds = (end_time - start_time).total_seconds()
        agg_interval, _ = self._get_aggregation_interval(time_diff_seconds)
        if agg_interval:
            flux_query = f'''
            from(bucket: "{self.bucket}")
                |> range(start: {start_time.isoformat()}Z, stop: {end_time.isoformat()}Z)
                |> filter(fn: (r) => r["_measurement"] == "seismic_wave")
                |> filter(fn: (r) => r["_field"] == "amplitude")
                |> aggregateWindow(every: {agg_interval}, fn: mean, createEmpty: false)
                |> sort(columns: ["_time"])
            '''
        else:
            flux_query = f'''
            from(bucket: "{self.bucket}")
                |> range(start: {start_time.isoformat()}Z, stop: {end_time.isoformat()}Z)
                |> filter(fn: (r) => r["_measurement"] == "seismic_wave")
                |> filter(fn: (r) => r["_field"] == "amplitude")
                |> sort(columns: ["_time"])
            '''
        df = self.query_api.query_data_frame(flux_query)
        if not df.empty:
            df = df[['_time', '_value']].rename(columns={'_time': 'timestamp', '_value': 'amplitude'})
            df['timestamp'] = pd.to_datetime(df['timestamp'])
            df = df.set_index('timestamp')
            if len(df) > max_points:
                df = df.iloc[::len(df) // max_points]
                was_truncated = True
        return df, was_truncated

    def get_daily_stats(self, start_time: datetime, end_time: datetime) -> List[Dict]:
        start_time, end_time, _ = self._validate_time_range(start_time, end_time)
        flux_query = f'''
        from(bucket: "{self.bucket}")
            |> range(start: {start_time.isoformat()}Z, stop: {end_time.isoformat()}Z)
            |> filter(fn: (r) => r["_measurement"] == "seismic_wave")
            |> filter(fn: (r) => r["_field"] == "amplitude")
            |> aggregateWindow(every: 1d, fn: count)
            |> yield(name: "count")
        '''
        result = self.query_api.query(flux_query)
        stats = []
        for table in result:
            for record in table.records:
                stats.append({
                    "date": record.get_time().strftime('%Y-%m-%d'),
                    "count": record.get_value()
                })
        return stats

    def create_bucket(self):
        buckets_api = self.client.buckets_api()
        try:
            buckets_api.create_bucket(bucket_name=self.bucket, org=self.org)
            print(f"Bucket '{self.bucket}' created successfully.")
        except Exception as e:
            print(f"Bucket may already exist or error occurred: {e}")
