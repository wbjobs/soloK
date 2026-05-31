import numpy as np
import pandas as pd
from statsmodels.tsa.seasonal import STL
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from typing import List, Dict, Tuple, Optional
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

class AnomalyDetector:
    ALGORITHMS = ['stl_3sigma', 'isolation_forest', 'ensemble']
    
    def __init__(
        self,
        sigma_threshold: float = 3.0,
        seasonal_period: int = 1440,
        algorithm: str = 'stl_3sigma',
        contamination: float = 0.01
    ):
        self.sigma_threshold = sigma_threshold
        self.seasonal_period = seasonal_period
        self.algorithm = algorithm
        self.contamination = contamination
        self._iforest_model = None
        self._scaler = None

    def set_algorithm(self, algorithm: str):
        if algorithm not in self.ALGORITHMS:
            raise ValueError(f"不支持的算法: {algorithm}. 支持的算法: {self.ALGORITHMS}")
        self.algorithm = algorithm

    def _preprocess_series(self, series: pd.Series) -> pd.Series:
        series = series.astype(float)
        series = series.replace([np.inf, -np.inf], np.nan)
        nan_mask = series.isna()
        if nan_mask.sum() > 0:
            series = series.interpolate(method='time', limit_direction='both')
            series = series.fillna(series.median())
            series = series.fillna(0)
        if len(series) > 100:
            rolling_median = series.rolling(window=50, center=True).median()
            rolling_median = rolling_median.fillna(series.median())
            mad = np.median(np.abs(series - rolling_median))
            if mad > 0:
                modified_z_score = 0.6745 * (series - rolling_median) / mad
                extreme_mask = np.abs(modified_z_score) > 15
                series.loc[extreme_mask] = np.nan
                series = series.interpolate(method='time', limit_direction='both')
        return series

    def _robust_stats(self, data: np.ndarray) -> Tuple[float, float]:
        data = data[~np.isnan(data)]
        if len(data) == 0:
            return 0.0, 1.0
        median = np.median(data)
        mad = np.median(np.abs(data - median))
        if mad == 0:
            mad = np.std(data)
        if mad == 0:
            mad = 1.0
        sigma_equivalent = mad * 1.4826
        return median, sigma_equivalent

    def _extract_features(self, series: pd.Series) -> np.ndarray:
        features = []
        values = series.values
        
        for i in range(len(values)):
            window_start = max(0, i - 50)
            window_end = min(len(values), i + 51)
            window = values[window_start:window_end]
            
            features.append([
                values[i],
                np.mean(window) if len(window) > 0 else 0,
                np.std(window) if len(window) > 1 else 0,
                np.median(window) if len(window) > 0 else 0,
                np.max(window) if len(window) > 0 else 0,
                np.min(window) if len(window) > 0 else 0,
                values[i] - np.mean(window) if len(window) > 0 else 0,
                (values[i] - np.mean(window)) / (np.std(window) + 1e-10) if np.std(window) > 0 else 0
            ])
        
        return np.array(features)

    def detect_anomalies(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, List[Dict]]:
        if df.empty:
            return df, []
        
        if self.algorithm == 'stl_3sigma':
            return self._stl_anomaly_detection(df)
        elif self.algorithm == 'isolation_forest':
            return self._isolation_forest_detection(df)
        elif self.algorithm == 'ensemble':
            return self._ensemble_detection(df)
        else:
            return self._stl_anomaly_detection(df)

    def _stl_anomaly_detection(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, List[Dict]]:
        original_series = df['amplitude'].astype(float)
        clean_series = self._preprocess_series(original_series)
        
        if len(clean_series) < self.seasonal_period * 2:
            return self._simple_anomaly_detection(df)
        
        try:
            period = min(self.seasonal_period, len(clean_series) // 3)
            period = max(period, 7)
            
            if len(clean_series) < period * 2:
                return self._simple_anomaly_detection(df)
            
            stl = STL(
                clean_series,
                period=period,
                robust=True,
                seasonal=min(15, period // 2),
                trend=period * 2 + 1,
                low_pass=period + 1
            )
            result = stl.fit()
            residual = result.resid
            residual = pd.Series(residual).replace([np.inf, -np.inf], np.nan)
            residual = residual.fillna(residual.median())
            
            residual_mean, residual_std = self._robust_stats(residual.values)
            if residual_std == 0:
                residual_std = np.std(residual.values)
            if residual_std == 0:
                residual_std = 1.0
            
            upper_bound = residual_mean + self.sigma_threshold * residual_std
            lower_bound = residual_mean - self.sigma_threshold * residual_std
            
            anomalies_mask = (residual > upper_bound) | (residual < lower_bound)
            anomalies_mask = anomalies_mask & (~original_series.isna())
            
        except Exception as e:
            print(f"STL decomposition failed, falling back to simple detection: {e}")
            return self._simple_anomaly_detection(df)
        
        df['is_anomaly'] = anomalies_mask.values
        df['trend'] = result.trend.values
        df['seasonal'] = result.seasonal.values
        df['residual'] = residual.values
        df['upper_bound'] = upper_bound
        df['lower_bound'] = lower_bound
        df['algorithm'] = 'stl_3sigma'
        df['anomaly_score'] = np.abs(residual - residual_mean) / residual_std
        
        anomalies = []
        for idx, row in df[df['is_anomaly']].iterrows():
            resid_val = row['residual'] if not pd.isna(row['residual']) else 0
            deviation = abs(resid_val - residual_mean) / residual_std if residual_std > 0 else 0
            anomalies.append({
                'timestamp': idx.isoformat() if isinstance(idx, pd.Timestamp) else str(idx),
                'amplitude': float(row['amplitude']) if not pd.isna(row['amplitude']) else 0.0,
                'residual': float(resid_val),
                'deviation': float(deviation),
                'score': float(row['anomaly_score']) if not pd.isna(row['anomaly_score']) else 0.0,
                'type': 'spike' if resid_val > residual_mean else 'dip',
                'algorithm': 'stl_3sigma'
            })
        
        return df, anomalies

    def _isolation_forest_detection(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, List[Dict]]:
        original_series = df['amplitude'].astype(float)
        clean_series = self._preprocess_series(original_series)
        
        try:
            features = self._extract_features(clean_series)
            
            self._scaler = StandardScaler()
            features_scaled = self._scaler.fit_transform(features)
            
            n_samples = len(features_scaled)
            contamination = min(self.contamination, 0.5)
            n_estimators = min(100, max(10, n_samples // 100))
            
            self._iforest_model = IsolationForest(
                n_estimators=n_estimators,
                max_samples='auto',
                contamination=contamination,
                random_state=42,
                n_jobs=-1
            )
            
            anomaly_labels = self._iforest_model.fit_predict(features_scaled)
            anomaly_scores = self._iforest_model.decision_function(features_scaled)
            
            anomalies_mask = anomaly_labels == -1
            anomalies_mask = anomalies_mask & (~original_series.isna().values)
            
            percentile_threshold = np.percentile(anomaly_scores, self.contamination * 100)
            anomalies_mask = anomalies_mask | (anomaly_scores <= percentile_threshold)
            
        except Exception as e:
            print(f"Isolation Forest detection failed, falling back to STL: {e}")
            return self._stl_anomaly_detection(df)
        
        df['is_anomaly'] = anomalies_mask
        df['anomaly_score'] = anomaly_scores
        df['algorithm'] = 'isolation_forest'
        
        score_mean = np.mean(anomaly_scores)
        score_std = np.std(anomaly_scores) if np.std(anomaly_scores) > 0 else 1.0
        
        anomalies = []
        for idx, row in df[df['is_anomaly']].iterrows():
            amp = row['amplitude'] if not pd.isna(row['amplitude']) else 0.0
            score = row['anomaly_score'] if not pd.isna(row['anomaly_score']) else 0.0
            deviation = abs(score - score_mean) / score_std if score_std > 0 else 0
            
            anomalies.append({
                'timestamp': idx.isoformat() if isinstance(idx, pd.Timestamp) else str(idx),
                'amplitude': float(amp),
                'score': float(score),
                'deviation': float(deviation),
                'type': 'spike' if amp > clean_series.median() else 'dip',
                'algorithm': 'isolation_forest'
            })
        
        return df, anomalies

    def _ensemble_detection(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, List[Dict]]:
        df_stl, anomalies_stl = self._stl_anomaly_detection(df.copy())
        df_if, anomalies_if = self._isolation_forest_detection(df.copy())
        
        stl_mask = df_stl['is_anomaly'].values
        if_mask = df_if['is_anomaly'].values
        
        ensemble_mask = stl_mask | if_mask
        
        df['is_anomaly'] = ensemble_mask
        df['anomaly_score_stl'] = df_stl['anomaly_score'].values
        df['anomaly_score_if'] = df_if['anomaly_score'].values
        df['algorithm'] = 'ensemble'
        
        anomaly_dict = {}
        for a in anomalies_stl:
            key = a['timestamp']
            if key not in anomaly_dict:
                anomaly_dict[key] = a
                anomaly_dict[key]['algorithm'] = ['stl_3sigma']
            else:
                anomaly_dict[key]['algorithm'].append('stl_3sigma')
        
        for a in anomalies_if:
            key = a['timestamp']
            if key not in anomaly_dict:
                anomaly_dict[key] = a
                anomaly_dict[key]['algorithm'] = ['isolation_forest']
            else:
                anomaly_dict[key]['algorithm'].append('isolation_forest')
                anomaly_dict[key]['deviation'] = max(anomaly_dict[key]['deviation'], a['deviation'])
        
        anomalies = list(anomaly_dict.values())
        for a in anomalies:
            a['algorithm'] = ' & '.join(a['algorithm']) if isinstance(a['algorithm'], list) else a['algorithm']
        
        return df, anomalies

    def _simple_anomaly_detection(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, List[Dict]]:
        series = df['amplitude'].astype(float)
        series = series.replace([np.inf, -np.inf], np.nan)
        valid_data = series[~series.isna()]
        
        if len(valid_data) == 0:
            df['is_anomaly'] = False
            df['upper_bound'] = 0
            df['lower_bound'] = 0
            return df, []
        
        mean_val, std_val = self._robust_stats(valid_data.values)
        if std_val == 0:
            std_val = np.std(valid_data.values)
        if std_val == 0:
            std_val = 1.0
        
        upper_bound = mean_val + self.sigma_threshold * std_val
        lower_bound = mean_val - self.sigma_threshold * std_val
        
        anomalies_mask = (series > upper_bound) | (series < lower_bound)
        anomalies_mask = anomalies_mask & (~series.isna())
        
        df['is_anomaly'] = anomalies_mask.values
        df['upper_bound'] = upper_bound
        df['lower_bound'] = lower_bound
        df['algorithm'] = 'simple_3sigma'
        df['anomaly_score'] = np.abs(series - mean_val) / std_val
        
        anomalies = []
        for idx, row in df[df['is_anomaly']].iterrows():
            amp = row['amplitude'] if not pd.isna(row['amplitude']) else mean_val
            deviation = abs(amp - mean_val) / std_val if std_val > 0 else 0
            anomalies.append({
                'timestamp': idx.isoformat() if isinstance(idx, pd.Timestamp) else str(idx),
                'amplitude': float(amp),
                'deviation': float(deviation),
                'score': float(row['anomaly_score']) if not pd.isna(row['anomaly_score']) else 0.0,
                'type': 'spike' if amp > mean_val else 'dip',
                'algorithm': 'simple_3sigma'
            })
        
        return df, anomalies

    def get_anomaly_segments(self, anomalies: List[Dict], max_gap_seconds: int = 5) -> List[Dict]:
        if not anomalies:
            return []
        
        sorted_anomalies = sorted(anomalies, key=lambda x: x['timestamp'])
        segments = []
        current_segment = [sorted_anomalies[0]]
        
        for anomaly in sorted_anomalies[1:]:
            try:
                current_time = datetime.fromisoformat(anomaly['timestamp'].replace('Z', '+00:00'))
                last_time = datetime.fromisoformat(current_segment[-1]['timestamp'].replace('Z', '+00:00'))
                gap_seconds = (current_time - last_time).total_seconds()
                
                if gap_seconds <= max_gap_seconds:
                    current_segment.append(anomaly)
                else:
                    segments.append({
                        'start_time': current_segment[0]['timestamp'],
                        'end_time': current_segment[-1]['timestamp'],
                        'anomaly_count': len(current_segment),
                        'anomalies': current_segment,
                        'max_deviation': max(a['deviation'] for a in current_segment),
                        'avg_deviation': sum(a['deviation'] for a in current_segment) / len(current_segment),
                        'algorithms': list(set(a.get('algorithm', 'unknown') for a in current_segment))
                    })
                    current_segment = [anomaly]
            except:
                continue
        
        if current_segment:
            segments.append({
                'start_time': current_segment[0]['timestamp'],
                'end_time': current_segment[-1]['timestamp'],
                'anomaly_count': len(current_segment),
                'anomalies': current_segment,
                'max_deviation': max(a['deviation'] for a in current_segment),
                'avg_deviation': sum(a['deviation'] for a in current_segment) / len(current_segment),
                'algorithms': list(set(a.get('algorithm', 'unknown') for a in current_segment))
            })
        
        return segments

    def get_daily_anomaly_stats(self, df_with_anomalies: pd.DataFrame) -> List[Dict]:
        if df_with_anomalies.empty:
            return []
        
        df = df_with_anomalies.copy()
        df['date'] = df.index.date
        
        daily_stats = df.groupby('date').agg(
            total_points=('amplitude', 'count'),
            anomaly_count=('is_anomaly', 'sum'),
            anomaly_rate=('is_anomaly', 'mean'),
            max_amplitude=('amplitude', 'max'),
            min_amplitude=('amplitude', 'min'),
            avg_score=('anomaly_score', 'mean')
        ).reset_index()
        
        stats = []
        for _, row in daily_stats.iterrows():
            stats.append({
                'date': str(row['date']),
                'total_points': int(row['total_points']) if not pd.isna(row['total_points']) else 0,
                'anomaly_count': int(row['anomaly_count']) if not pd.isna(row['anomaly_count']) else 0,
                'anomaly_rate': float(row['anomaly_rate']) if not pd.isna(row['anomaly_rate']) else 0.0,
                'max_amplitude': float(row['max_amplitude']) if not pd.isna(row['max_amplitude']) else 0.0,
                'min_amplitude': float(row['min_amplitude']) if not pd.isna(row['min_amplitude']) else 0.0,
                'avg_score': float(row['avg_score']) if not pd.isna(row['avg_score']) else 0.0
            })
        
        return stats
