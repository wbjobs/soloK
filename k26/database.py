import sqlite3
import os
import numpy as np
import pandas as pd
from datetime import datetime
from config import DB_PATH, DATA_DIR, ODOR_CLASSES

class Database:
    def __init__(self, db_path=None):
        if db_path is None:
            db_path = DB_PATH
        self.db_path = db_path
        self._init_database()

    def _init_database(self):
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                odor_class TEXT NOT NULL,
                sensor_count INTEGER NOT NULL,
                sampling_rate REAL NOT NULL,
                duration REAL NOT NULL,
                batch_date TEXT NOT NULL,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sensor_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sample_id INTEGER NOT NULL,
                sensor_idx INTEGER NOT NULL,
                time_values TEXT NOT NULL,
                response_values TEXT NOT NULL,
                FOREIGN KEY (sample_id) REFERENCES samples (id)
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS features (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sample_id INTEGER NOT NULL,
                sensor_idx INTEGER NOT NULL,
                max_value REAL,
                steady_value REAL,
                rise_time REAL,
                area REAL,
                slope REAL,
                response_recovery_ratio REAL,
                FOREIGN KEY (sample_id) REFERENCES samples (id)
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS models (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                model_type TEXT NOT NULL,
                model_path TEXT NOT NULL,
                scaler_path TEXT,
                pca_path TEXT,
                accuracy REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()

    def add_sample(self, name, odor_class, sensor_count, sampling_rate, 
                   duration, batch_date, notes=''):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO samples (name, odor_class, sensor_count, sampling_rate,
                               duration, batch_date, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (name, odor_class, sensor_count, sampling_rate, 
              duration, batch_date, notes))
        sample_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return sample_id

    def add_sensor_data(self, sample_id, sensor_idx, time_values, response_values):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        time_str = ','.join(map(str, time_values))
        resp_str = ','.join(map(str, response_values))
        cursor.execute('''
            INSERT INTO sensor_data (sample_id, sensor_idx, time_values, response_values)
            VALUES (?, ?, ?, ?)
        ''', (sample_id, sensor_idx, time_str, resp_str))
        data_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return data_id

    def add_features(self, sample_id, sensor_idx, features):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO features (sample_id, sensor_idx, max_value, steady_value,
                                rise_time, area, slope, response_recovery_ratio)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (sample_id, sensor_idx, 
              features.get('max_value'),
              features.get('steady_value'),
              features.get('rise_time'),
              features.get('area'),
              features.get('slope'),
              features.get('response_recovery_ratio')))
        feat_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return feat_id

    def get_all_samples(self):
        conn = sqlite3.connect(self.db_path)
        df = pd.read_sql_query('SELECT * FROM samples ORDER BY created_at DESC', conn)
        conn.close()
        return df

    def get_samples_by_class(self, odor_class):
        conn = sqlite3.connect(self.db_path)
        df = pd.read_sql_query(
            'SELECT * FROM samples WHERE odor_class = ? ORDER BY created_at DESC',
            conn, params=(odor_class,)
        )
        conn.close()
        return df

    def get_sensor_data(self, sample_id):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            SELECT sensor_idx, time_values, response_values 
            FROM sensor_data WHERE sample_id = ? ORDER BY sensor_idx
        ''', (sample_id,))
        rows = cursor.fetchall()
        conn.close()
        
        data = {}
        for row in rows:
            sensor_idx = row[0]
            times = np.array(list(map(float, row[1].split(','))))
            responses = np.array(list(map(float, row[2].split(','))))
            data[sensor_idx] = {'time': times, 'response': responses}
        return data

    def get_features(self, sample_id):
        conn = sqlite3.connect(self.db_path)
        df = pd.read_sql_query(
            'SELECT * FROM features WHERE sample_id = ? ORDER BY sensor_idx',
            conn, params=(sample_id,)
        )
        conn.close()
        return df

    def get_all_features(self):
        conn = sqlite3.connect(self.db_path)
        query = '''
            SELECT f.*, s.odor_class, s.batch_date
            FROM features f
            JOIN samples s ON f.sample_id = s.id
        '''
        df = pd.read_sql_query(query, conn)
        conn.close()
        return df

    def get_feature_matrix(self):
        conn = sqlite3.connect(self.db_path)
        query = '''
            SELECT s.id as sample_id, s.odor_class, s.batch_date,
                   f.sensor_idx, f.max_value, f.steady_value, 
                   f.rise_time, f.area, f.slope, f.response_recovery_ratio
            FROM features f
            JOIN samples s ON f.sample_id = s.id
        '''
        df = pd.read_sql_query(query, conn)
        conn.close()
        return df

    def update_sample(self, sample_id, name=None, odor_class=None, notes=None):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        updates = []
        params = []
        if name is not None:
            updates.append('name = ?')
            params.append(name)
        if odor_class is not None:
            updates.append('odor_class = ?')
            params.append(odor_class)
        if notes is not None:
            updates.append('notes = ?')
            params.append(notes)
        if updates:
            params.append(sample_id)
            cursor.execute(f'UPDATE samples SET {", ".join(updates)} WHERE id = ?', params)
            conn.commit()
        conn.close()

    def delete_sample(self, sample_id):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM sensor_data WHERE sample_id = ?', (sample_id,))
        cursor.execute('DELETE FROM features WHERE sample_id = ?', (sample_id,))
        cursor.execute('DELETE FROM samples WHERE id = ?', (sample_id,))
        conn.commit()
        conn.close()

    def save_model(self, name, model_type, model_path, scaler_path=None, 
                   pca_path=None, accuracy=None):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO models (name, model_type, model_path, scaler_path, 
                              pca_path, accuracy)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (name, model_type, model_path, scaler_path, pca_path, accuracy))
        model_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return model_id

    def get_all_models(self):
        conn = sqlite3.connect(self.db_path)
        df = pd.read_sql_query('SELECT * FROM models ORDER BY created_at DESC', conn)
        conn.close()
        return df

    def delete_model(self, model_id):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM models WHERE id = ?', (model_id,))
        conn.commit()
        conn.close()
