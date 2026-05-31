import threading
import time
from datetime import datetime, timedelta
from flask import Flask
from flask_socketio import SocketIO, emit
from config import config
from app.services.data_generator import data_generator
from app.services.kriging_interpolator import kriging_interpolator
from app.services.data_store import data_store

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins=config.SOCKETIO_CORS_ORIGINS, 
                    async_mode='threading', logger=False, engineio_logger=False)

class RealTimeUpdater:
    def __init__(self):
        self.running = False
        self.thread = None
        self.update_interval = config.SENSOR_UPDATE_INTERVAL
        self.current_time_hours = 0
        self.speed_factor = 3600
        
    def start(self):
        if not self.running:
            self.running = True
            self.thread = threading.Thread(target=self._update_loop, daemon=True)
            self.thread.start()
            print("Real-time updater started")
            
    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join()
            print("Real-time updater stopped")
            
    def set_speed(self, speed_factor: int):
        self.speed_factor = max(1, speed_factor)
        self.update_interval = config.SENSOR_UPDATE_INTERVAL / self.speed_factor
        
    def _update_loop(self):
        while self.running:
            try:
                timestamp = datetime.now()
                
                sensor_data = data_generator.generate_all_sensor_data(
                    timestamp, self.current_time_hours
                )
                data_store.update_sensor_data(sensor_data)
                
                voxel_grid = kriging_interpolator.interpolate_3d(
                    sensor_data, config.DEFAULT_CONTAMINANT
                )
                data_store.update_voxel_grid(voxel_grid)
                
                risk_assessment = kriging_interpolator.compute_risk_assessment(
                    voxel_grid, config.CONTAMINANT_THRESHOLD
                )
                
                well_data = data_store.get_well_current_data()
                
                risk_dict = risk_assessment.model_dump()
                risk_dict['timestamp'] = risk_dict['timestamp'].isoformat()
                
                socketio.emit('sensor_update', {
                    'timestamp': timestamp.isoformat(),
                    'time_hours': self.current_time_hours,
                    'well_data': well_data,
                    'voxel_grid': {
                        'dimensions': voxel_grid.dimensions,
                        'data': voxel_grid.data,
                        'variance': voxel_grid.variance,
                        'contaminant': voxel_grid.contaminant
                    },
                    'risk_assessment': risk_dict
                }, namespace='/')
                
                self.current_time_hours += 1
                
            except Exception as e:
                print(f"Error in update loop: {e}")
                
            time.sleep(min(1.0, self.update_interval))

real_time_updater = RealTimeUpdater()

@socketio.on('connect')
def handle_connect():
    print(f"Client connected")
    if data_store.current_sensor_data:
        well_data = data_store.get_well_current_data()
        if data_store.current_voxel_grid:
            emit('initial_data', {
                'wells': data_store.get_well_locations(),
                'well_data': well_data,
                'voxel_grid': {
                    'dimensions': data_store.current_voxel_grid.dimensions,
                    'bounds': {
                        'x_min': data_store.current_voxel_grid.x_min,
                        'x_max': data_store.current_voxel_grid.x_max,
                        'y_min': data_store.current_voxel_grid.y_min,
                        'y_max': data_store.current_voxel_grid.y_max,
                        'z_min': data_store.current_voxel_grid.z_min,
                        'z_max': data_store.current_voxel_grid.z_max,
                    },
                    'resolution': data_store.current_voxel_grid.resolution,
                    'data': data_store.current_voxel_grid.data,
                    'variance': data_store.current_voxel_grid.variance,
                    'contaminant': data_store.current_voxel_grid.contaminant
                },
                'config': {
                    'contaminant_threshold': config.CONTAMINANT_THRESHOLD,
                    'site_bounds': config.SITE_BOUNDS,
                    'voxel_resolution': config.VOXEL_RESOLUTION
                }
            })

@socketio.on('disconnect')
def handle_disconnect():
    print("Client disconnected")

@socketio.on('set_speed')
def handle_set_speed(data):
    speed = data.get('speed', 3600)
    real_time_updater.set_speed(speed)
    emit('speed_changed', {'speed': speed})

@socketio.on('request_update')
def handle_request_update():
    if data_store.current_voxel_grid and data_store.current_sensor_data:
        well_data = data_store.get_well_current_data()
        risk_assessment = kriging_interpolator.compute_risk_assessment(
            data_store.current_voxel_grid, config.CONTAMINANT_THRESHOLD
        )
        risk_dict = risk_assessment.model_dump()
        risk_dict['timestamp'] = risk_dict['timestamp'].isoformat()
        emit('sensor_update', {
            'timestamp': datetime.now().isoformat(),
            'well_data': well_data,
            'voxel_grid': {
                'dimensions': data_store.current_voxel_grid.dimensions,
                'data': data_store.current_voxel_grid.data,
                'variance': data_store.current_voxel_grid.variance,
                'contaminant': data_store.current_voxel_grid.contaminant
            },
            'risk_assessment': risk_dict
        })

@socketio.on('get_well_trend')
def handle_get_well_trend(data):
    well_id = data.get('well_id')
    hours = data.get('hours', 720)
    if well_id:
        trend = data_generator.get_well_trend(well_id, hours)
        if trend and 'timestamps' in trend:
            trend['timestamps'] = [ts.isoformat() for ts in trend['timestamps']]
        emit('well_trend', {
            'well_id': well_id,
            'trend': trend
        })

def start_socketio_server():
    real_time_updater.start()
    socketio.run(app, host=config.API_HOST, port=config.SOCKETIO_PORT, debug=False)

if __name__ == '__main__':
    start_socketio_server()
