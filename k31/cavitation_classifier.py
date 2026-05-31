"""
空化类型识别模块 - CNN-1D分类器
"""
import numpy as np
from typing import Dict, List, Tuple
from config import SystemConfig, DEFAULT_CONFIG, CAVITATION_TYPES

try:
    import tensorflow as tf
    from tensorflow.keras import layers, models
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False

class CNN1DClassifier:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG, input_length: int = 4096):
        self.config = config
        self.input_length = input_length
        self.num_classes = len(CAVITATION_TYPES)
        self.model = None
        self.class_names = CAVITATION_TYPES
        
        if TF_AVAILABLE:
            self._build_model()
        else:
            self._build_synthetic_model()
    
    def _build_model(self):
        if not TF_AVAILABLE:
            return
        
        inputs = layers.Input(shape=(self.input_length, 1))
        
        x = layers.Conv1D(32, kernel_size=7, strides=2, padding='same', activation='relu')(inputs)
        x = layers.BatchNormalization()(x)
        x = layers.MaxPooling1D(pool_size=2, strides=2)(x)
        
        x = layers.Conv1D(64, kernel_size=5, strides=1, padding='same', activation='relu')(x)
        x = layers.BatchNormalization()(x)
        x = layers.MaxPooling1D(pool_size=2, strides=2)(x)
        
        x = layers.Conv1D(128, kernel_size=3, strides=1, padding='same', activation='relu')(x)
        x = layers.BatchNormalization()(x)
        x = layers.MaxPooling1D(pool_size=2, strides=2)(x)
        
        x = layers.Conv1D(256, kernel_size=3, strides=1, padding='same', activation='relu')(x)
        x = layers.BatchNormalization()(x)
        x = layers.GlobalAveragePooling1D()(x)
        
        x = layers.Dense(128, activation='relu')(x)
        x = layers.Dropout(0.5)(x)
        x = layers.Dense(64, activation='relu')(x)
        x = layers.Dropout(0.3)(x)
        
        outputs = layers.Dense(self.num_classes, activation='softmax')(x)
        
        self.model = models.Model(inputs=inputs, outputs=outputs)
        self.model.compile(
            optimizer='adam',
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy']
        )
    
    def _build_synthetic_model(self):
        self.model = 'synthetic'
        self.class_weights = np.ones(self.num_classes) / self.num_classes
    
    def preprocess_signal(self, signal: np.ndarray) -> np.ndarray:
        if signal.ndim == 2:
            signal = signal[0, :]
        
        if len(signal) > self.input_length:
            signal = signal[:self.input_length]
        elif len(signal) < self.input_length:
            signal = np.pad(signal, (0, self.input_length - len(signal)), 'constant')
        
        signal = (signal - np.mean(signal)) / (np.std(signal) + 1e-10)
        
        if TF_AVAILABLE:
            return signal.reshape(1, self.input_length, 1)
        return signal.reshape(1, self.input_length, 1)
    
    def _synthetic_predict(self, features: Dict[str, np.ndarray]) -> np.ndarray:
        probs = np.zeros(self.num_classes)
        probs[0] = 0.5
        
        kurtosis = np.mean(features.get('kurtosis', np.array([0])))
        skewness = np.mean(np.abs(features.get('skewness', np.array([0]))))
        broadband_ratio = np.mean(features.get('broadband_ratio', np.array([0])))
        phase_coupling = np.mean(features.get('phase_coupling_strength', np.array([0])))
        bpf_ratio = np.mean(features.get('bpf_energy_ratio', np.array([1])))
        crest_factor = np.mean(features.get('crest_factor', np.array([0])))
        
        if kurtosis > 3 or broadband_ratio > 1:
            probs[0] = max(0.1, 0.5 - (kurtosis - 3) * 0.1)
            
            if 3 < kurtosis <= 5 and broadband_ratio < 3:
                probs[1] = min(0.8, (kurtosis - 3) * 0.3 + broadband_ratio * 0.1)
            elif kurtosis > 4 and bpf_ratio < 0.3:
                probs[2] = min(0.8, (kurtosis - 4) * 0.2 + (1 - bpf_ratio) * 0.5)
            elif kurtosis > 5 and phase_coupling > 0.3:
                probs[3] = min(0.8, (kurtosis - 5) * 0.15 + phase_coupling * 0.4)
            elif crest_factor > 8 and skewness > 1:
                probs[4] = min(0.8, (crest_factor - 8) * 0.1 + skewness * 0.2)
        
        total = np.sum(probs)
        if total > 0:
            probs = probs / total
        else:
            probs[0] = 1.0
        
        return probs
    
    def predict(self, signal: np.ndarray, features: Dict[str, np.ndarray] = None) -> Dict:
        if self.model == 'synthetic' or not TF_AVAILABLE:
            if features is not None:
                probs = self._synthetic_predict(features)
            else:
                kurt = np.mean(np.abs(signal[signal > 3 * np.std(signal)])) if len(signal[signal > 3 * np.std(signal)]) > 0 else 0
                features = {'kurtosis': np.array([kurt * 0.5])}
                probs = self._synthetic_predict(features)
        else:
            processed = self.preprocess_signal(signal)
            probs = self.model.predict(processed, verbose=0)[0]
        
        class_idx = np.argmax(probs)
        class_name = self.class_names[class_idx]
        confidence = probs[class_idx]
        
        return {
            'class_index': class_idx,
            'class_name': class_name,
            'confidence': confidence,
            'probabilities': {self.class_names[i]: float(probs[i]) for i in range(self.num_classes)}
        }
    
    def classify_multichannel(self, signals: np.ndarray, features: Dict[str, np.ndarray] = None) -> Dict:
        n_channels = signals.shape[0] if signals.ndim > 1 else 1
        
        all_probs = []
        for i in range(n_channels):
            sig = signals[i] if signals.ndim > 1 else signals
            result = self.predict(sig, features)
            all_probs.append([result['probabilities'][name] for name in self.class_names.values()])
        
        avg_probs = np.mean(all_probs, axis=0)
        class_idx = np.argmax(avg_probs)
        class_name = self.class_names[class_idx]
        confidence = avg_probs[class_idx]
        
        return {
            'class_index': class_idx,
            'class_name': class_name,
            'confidence': confidence,
            'probabilities': {self.class_names[i]: float(avg_probs[i]) for i in range(self.num_classes)},
            'channel_predictions': [
                {'channel': i, 'class_name': self.class_names[np.argmax(probs)], 'confidence': np.max(probs)}
                for i, probs in enumerate(all_probs)
            ]
        }
    
    def train(self, X_train: np.ndarray, y_train: np.ndarray, 
              X_val: np.ndarray = None, y_val: np.ndarray = None,
              epochs: int = 50, batch_size: int = 32):
        if not TF_AVAILABLE or self.model == 'synthetic':
            raise NotImplementedError("TensorFlow is required for training")
        
        X_train = X_train.reshape(-1, self.input_length, 1)
        if X_val is not None:
            X_val = X_val.reshape(-1, self.input_length, 1)
            validation_data = (X_val, y_val)
        else:
            validation_data = None
        
        history = self.model.fit(
            X_train, y_train,
            validation_data=validation_data,
            epochs=epochs,
            batch_size=batch_size,
            verbose=1
        )
        
        return history
    
    def save_model(self, filepath: str):
        if TF_AVAILABLE and self.model != 'synthetic':
            self.model.save(filepath)
    
    def load_model(self, filepath: str):
        if TF_AVAILABLE:
            self.model = models.load_model(filepath)

class CavitationTypeClassifier:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.classifier = CNN1DClassifier(config)
        self.class_names = CAVITATION_TYPES
    
    def classify(self, signal: np.ndarray, features: Dict[str, np.ndarray] = None) -> Dict:
        return self.classifier.classify_multichannel(signal, features)
    
    def get_type_description(self, class_idx: int) -> str:
        descriptions = {
            0: '正常运行状态，无明显空化现象',
            1: '叶梢涡空化：螺旋桨叶梢处形成的涡旋空化，通常在高载荷下出现',
            2: '叶面空化：发生在螺旋桨叶面（压力面）的空化，通常与正攻角有关',
            3: '叶背空化：发生在螺旋桨叶背（吸力面）的空化，最常见的空化形式',
            4: '根涡空化：在桨毂附近形成的涡旋空化，可能导致桨毂腐蚀'
        }
        return descriptions.get(class_idx, '未知类型')
    
    def get_severity_level(self, class_idx: int, confidence: float) -> str:
        if class_idx == 0:
            return '正常'
        elif confidence < 0.5:
            return '轻微'
        elif confidence < 0.8:
            return '中等'
        else:
            return '严重'
