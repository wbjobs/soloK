from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS
from config import Config
import time

class InfluxDBManager:
    def __init__(self):
        self.client = InfluxDBClient(
            url=Config.INFLUXDB_URL,
            token=Config.INFLUXDB_TOKEN,
            org=Config.INFLUXDB_ORG
        )
        self.write_api = self.client.write_api(write_options=SYNCHRONOUS)
        self.query_api = self.client.query_api()
        self.bucket = Config.INFLUXDB_BUCKET
    
    def write_pressure_data(self, timestamp, values, test_id="default"):
        points = []
        for i, value in enumerate(values):
            point = Point("pressure") \
                .tag("test_id", test_id) \
                .tag("channel", str(i)) \
                .field("value", float(value)) \
                .time(timestamp, WritePrecision.NS)
            points.append(point)
        self.write_api.write(bucket=self.bucket, org=Config.INFLUXDB_ORG, record=points)
    
    def write_balance_data(self, timestamp, values, test_id="default"):
        names = ["Fx", "Fy", "Fz", "Mx", "My", "Mz"]
        points = []
        for i, value in enumerate(values):
            point = Point("balance") \
                .tag("test_id", test_id) \
                .tag("component", names[i]) \
                .field("value", float(value)) \
                .time(timestamp, WritePrecision.NS)
            points.append(point)
        self.write_api.write(bucket=self.bucket, org=Config.INFLUXDB_ORG, record=points)
    
    def write_aero_coefficients(self, timestamp, cl, cd, cm, ld, test_id="default"):
        point = Point("aero_coefficients") \
            .tag("test_id", test_id) \
            .field("Cl", float(cl)) \
            .field("Cd", float(cd)) \
            .field("Cm", float(cm)) \
            .field("L_over_D", float(ld)) \
            .time(timestamp, WritePrecision.NS)
        self.write_api.write(bucket=self.bucket, org=Config.INFLUXDB_ORG, record=point)
    
    def query_pressure_data(self, test_id, start_time, end_time, channel=None):
        flux_query = f'''
            from(bucket: "{self.bucket}")
                |> range(start: {start_time}, stop: {end_time})
                |> filter(fn: (r) => r["_measurement"] == "pressure")
                |> filter(fn: (r) => r["test_id"] == "{test_id}")
        '''
        if channel is not None:
            flux_query += f'|> filter(fn: (r) => r["channel"] == "{channel}")'
        
        return self.query_api.query(flux_query)
    
    def query_aero_coefficients(self, test_id, start_time, end_time):
        flux_query = f'''
            from(bucket: "{self.bucket}")
                |> range(start: {start_time}, stop: {end_time})
                |> filter(fn: (r) => r["_measurement"] == "aero_coefficients")
                |> filter(fn: (r) => r["test_id"] == "{test_id}")
        '''
        return self.query_api.query(flux_query)
    
    def get_test_list(self):
        flux_query = f'''
            import "influxdata/influxdb/schema"
            schema.tagValues(bucket: "{self.bucket}", tag: "test_id")
        '''
        result = self.query_api.query(flux_query)
        test_ids = []
        for table in result:
            for record in table.records:
                test_ids.append(record.get_value())
        return list(set(test_ids))
    
    def close(self):
        self.client.close()
