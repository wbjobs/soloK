
import numpy as np
from typing import List, Dict, Tuple, Optional
import os
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

try:
    import tensorflow as tf
    from tensorflow.keras import layers, models
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False
    print("Warning: TensorFlow not available. LSTM predictor in fallback mode.")


class SimpleTrendPredictor:
    def __init__(self):
        pass
    
    def predict_linear_trend(self, data: np.ndarray, output_len: int) -> np.ndarray:
        n_samples, n_features = data.shape
        
        predictions = np.zeros((output_len, n_features))
        
        x = np.arange(n_samples)
        
        for feat in range(n_features):
            y = data[:, feat]
            
            if len(y) >= 2:
                z = np.polyfit(x, y, 1)
                p = np.poly1d(z)
                
                future_x = np.arange(n_samples, n_samples + output_len)
                predictions[:, feat] = p(future_x)
            else:
                predictions[:, feat] = y[-1] if len(y) > 0 else 0
        
        return predictions
    
    def predict_ema(self, data: np.ndarray, output_len: int, alpha: float = 0.3) -> np.ndarray:
        n_samples, n_features = data.shape
        predictions = np.zeros((output_len, n_features))
        
        for feat in range(n_features):
            y = data[:, feat]
            
            if len(y) >= 1:
                ema = y[0]
                for i in range(1, len(y)):
                    ema = alpha * y[i] + (1 - alpha) * ema
                
                for i in range(output_len):
                    predictions[i, feat] = ema
                    ema = alpha * predictions[i, feat] + (1 - alpha) * ema
            else:
                predictions[:, feat] = 0
        
        return predictions


class LSTMPredictor:
    def __init__(self, input_seq_len: int = 30, 
                 output_seq_len: int = 7, 
                 n_features: int = 10):
        self.input_seq_len = input_seq_len
        self.output_seq_len = output_seq_len
        self.n_features = n_features
        self.mean = np.zeros(n_features)
        self.std = np.ones(n_features)
        self.simple_predictor = SimpleTrendPredictor()
        
        if TF_AVAILABLE:
            self.model = self.build_model()
        else:
            self.model = None
    
    def build_model(self):
        if not TF_AVAILABLE:
            return None
        
        encoder_inputs = layers.Input(shape=(self.input_seq_len, self.n_features))
        
        encoder = layers.LSTM(128, return_state=True)
        encoder_outputs, state_h, state_c = encoder(encoder_inputs)
        encoder_states = [state_h, state_c]
        
        decoder_inputs = layers.Input(shape=(self.output_seq_len, self.n_features))
        
        decoder_lstm = layers.LSTM(128, return_sequences=True, return_state=True)
        decoder_outputs, _, _ = decoder_lstm(decoder_inputs, initial_state=encoder_states)
        
        decoder_dense = layers.Dense(self.n_features)
        decoder_outputs = decoder_dense(decoder_outputs)
        
        model = models.Model([encoder_inputs, decoder_inputs], decoder_outputs)
        
        model.compile(optimizer='adam', loss='mse', metrics=['mae'])
        
        return model
    
    def create_sequences(self, data: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        X, y = [], []
        for i in range(len(data) - self.input_seq_len - self.output_seq_len + 1):
            X.append(data[i:(i + self.input_seq_len), :])
            y.append(data[(i + self.input_seq_len):(i + self.input_seq_len + self.output_seq_len), :])
        return np.array(X), np.array(y)
    
    def preprocess(self, data: np.ndarray) -> np.ndarray:
        self.mean = np.mean(data, axis=0)
        self.std = np.std(data, axis=0) + 1e-8
        normalized = (data - self.mean) / self.std
        return normalized
    
    def inverse_transform(self, data: np.ndarray) -> np.ndarray:
        return data * self.std + self.mean
    
    def train(self, data: np.ndarray, epochs: int = 100, 
              batch_size: int = 32, validation_split: float = 0.2):
        if not TF_AVAILABLE or self.model is None:
            return None
        
        normalized = self.preprocess(data)
        X, y = self.create_sequences(normalized)
        
        if len(X) == 0:
            return None
        
        decoder_input_data = np.zeros((X.shape[0], self.output_seq_len, self.n_features))
        decoder_input_data[:, 0, :] = X[:, -1, :]
        
        history = self.model.fit(
            [X, decoder_input_data], y,
            epochs=epochs,
            batch_size=batch_size,
            validation_split=validation_split,
            verbose=0
        )
        
        return history.history
    
    def predict(self, input_sequence: np.ndarray) -> np.ndarray:
        if not TF_AVAILABLE or self.model is None:
            return self.simple_predictor.predict_linear_trend(
                input_sequence, self.output_seq_len)
        
        if input_sequence.shape != (self.input_seq_len, self.n_features):
            input_sequence = input_sequence[:self.input_seq_len, :]
        
        normalized = (input_sequence - self.mean) / self.std
        normalized = normalized.reshape(1, self.input_seq_len, self.n_features)
        
        decoder_input = np.zeros((1, self.output_seq_len, self.n_features))
        decoder_input[0, 0, :] = normalized[0, -1, :]
        
        predictions = self.model.predict([normalized, decoder_input], verbose=0)
        predictions = predictions[0]
        
        return self.inverse_transform(predictions)
    
    def predict_future(self, historical_data: np.ndarray, 
                     feature_names: List[str]) -> Dict:
        if len(historical_data.shape) == 1:
            historical_data = historical_data.reshape(-1, 1)
        
        if len(historical_data) < self.input_seq_len:
            padding = np.tile(historical_data[-1:, :], (self.input_seq_len - len(historical_data), 1))
            input_seq = np.vstack([padding, historical_data])
        else:
            input_seq = historical_data[-self.input_seq_len:, :]
        
        if input_seq.shape[1] < self.n_features:
            padding = np.zeros((input_seq.shape[0], self.n_features - input_seq.shape[1]))
            input_seq = np.hstack([input_seq, padding])
        elif input_seq.shape[1] > self.n_features:
            input_seq = input_seq[:, :self.n_features]
        
        predictions = self.predict(input_seq)
        
        dates = []
        today = datetime.now()
        for i in range(self.output_seq_len):
            dates.append((today + timedelta(days=i+1)).strftime("%Y-%m-%d"))
        
        result = {
            "dates": dates,
            "predictions": {},
            "method": "LSTM" if TF_AVAILABLE and self.model is not None else "Linear Regression (Fallback)"
        }
        
        for i, name in enumerate(feature_names):
            if i < predictions.shape[1]:
                result["predictions"][name] = predictions[:, i].tolist()
        
        return result
    
    def save_model(self, path: str):
        if TF_AVAILABLE and self.model is not None:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            self.model.save(path)
    
    def load_model(self, path: str):
        if TF_AVAILABLE:
            if os.path.exists(path):
                self.model = models.load_model(path)
                return True
        return False


class TrendAnalyzer:
    def __init__(self):
        pass
    
    def calculate_trend(self, values: List[float]) -> Dict:
        if len(values) < 2:
            return {"slope": 0.0, "trend": "stable", "change_rate": 0.0}
        
        x = np.arange(len(values))
        y = np.array(values)
        
        slope, intercept = np.polyfit(x, y, 1)
        
        change_rate = ((values[-1] - values[0]) / abs(values[0]) * 100) if values[0] != 0 else 0
        
        if slope > 0.01:
            trend = "increasing"
        elif slope < -0.01:
            trend = "decreasing"
        else:
            trend = "stable"
        
        return {
            "slope": float(slope),
            "trend": trend,
            "change_rate": float(change_rate)
        }
    
    def generate_alert(self, feature_name: str, trend: Dict, 
                         thresholds: Dict) -> Optional[Dict]:
        if trend["trend"] == "increasing" and trend["change_rate"] > thresholds.get("warning_increase", 20):
            return {
                "level": "warning",
                "message": f"{feature_name}呈上升趋势，增长率{trend['change_rate']:.1f}%",
                "feature": feature_name
            }
        elif trend["trend"] == "decreasing" and abs(trend["change_rate"]) > thresholds.get("warning_decrease", 30):
            return {
                "level": "warning",
                "message": f"{feature_name}呈下降趋势，下降率{abs(trend['change_rate']):.1f}%",
                "feature": feature_name
            }
        return None
