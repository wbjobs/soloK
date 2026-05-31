import os

class Config:
    INFLUXDB_URL = os.getenv('INFLUXDB_URL', 'http://localhost:8086')
    INFLUXDB_TOKEN = os.getenv('INFLUXDB_TOKEN', 'your-token')
    INFLUXDB_ORG = os.getenv('INFLUXDB_ORG', 'windtunnel')
    INFLUXDB_BUCKET = os.getenv('INFLUXDB_BUCKET', 'test_data')
    
    FLASK_HOST = os.getenv('FLASK_HOST', '0.0.0.0')
    FLASK_PORT = int(os.getenv('FLASK_PORT', 5000))
    
    WEBSOCKET_PORT = int(os.getenv('WEBSOCKET_PORT', 8080))
    
    AIR_DENSITY = 1.225
    REFERENCE_AREA = 0.1
    CHORD_LENGTH = 0.15
    DEFAULT_VELOCITY = 50.0
    
    PRESSURE_CHANNELS = 128
    BALANCE_CHANNELS = 6
    MIC_CHANNELS = 32
    SAMPLE_RATE = 2000
