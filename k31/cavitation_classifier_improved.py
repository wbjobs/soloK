"""
改进版空化类型识别模块 - 增强叶面/叶背空化区分能力
核心改进：BPF谐波衰减特征、频谱分布特征、多尺度卷积结构
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

class MultiScaleCNN1DClassifier:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG, input_length: int = 4096):
        self.config = config
        self.input_length = input_length
        self.num_classes = len(CAVITATION_TYPES)
        self.model = None
        self.class_names = CAVITATION_TYPES
        
        if TF_AVAILABLE:
            self._build_multiscale_model()
        else:
            self.model = 'synthetic'
    
    def _build_multiscale_model(self):
        if not TF_AVAILABLE:
            return
        
        inputs = layers.Input(shape=(self.input_length, 1))
        
        branch1 = layers.Conv1D(32, kernel_size=3, strides=1, padding='same', activation='relu')(inputs)
        branch1 = layers.BatchNormalization()(branch1)
        branch1 = layers.MaxPooling1D(pool_size=2)(branch1)
        branch1 = layers.Conv1D(64, kernel_size=3, strides=1, padding='same', activation='relu')(branch1)
        branch1 = layers.BatchNormalization()(branch1)
        
        branch2 = layers.Conv1D(32, kernel_size=7, strides=1, padding='same', activation='relu')(inputs)
        branch2 = layers.BatchNormalization()(branch2)
        branch2 = layers.MaxPooling1D(pool_size=2)(branch2)
        branch2 = layers.Conv1D(64, kernel_size=7, strides=1, padding='same', activation='relu')(branch2)
        branch2 = layers.BatchNormalization()(branch2)
        
        branch3 = layers.Conv1D(32, kernel_size=15, strides=1, padding='same', activation='relu')(inputs)
        branch3 = layers.BatchNormalization()(branch3)
        branch3 = layers.MaxPooling1D(pool_size=2)(branch3)
        branch3 = layers.Conv1D(64, kernel_size=15, strides=1, padding='same', activation='relu')(branch3)
        branch3 = layers.BatchNormalization()(branch3)
        
        merged = layers.concatenate([branch1, branch2, branch3], axis=-1)
        
        x = layers.Conv1D(128, kernel_size=3, strides=1, padding='same', activation='relu')(merged)
        x = layers.BatchNormalization()(x)
        x = layers.MaxPooling1D(pool_size=2)(x)
        
        x = layers.Conv1D(256, kernel_size=3, strides=1, padding='same', activation='relu')(x)
        x = layers.BatchNormalization()(x)
        
        attention = layers.GlobalAveragePooling1D()(x)
        attention = layers.Dense(256, activation='relu')(attention)
        attention = layers.Dense(256, activation='sigmoid')(attention)
        x = layers.multiply([x, attention[:, tf.newaxis, :]])
        
        x = layers.GlobalAveragePooling1D()(x)
        
        x = layers.Dense(256, activation='relu')(x)
        x = layers.Dropout(0.5)(x)
        x = layers.Dense(128, activation='relu')(x)
        x = layers.Dropout(0.3)(x)
        x = layers.Dense(64, activation='relu')(x)
        
        outputs = layers.Dense(self.num_classes, activation='softmax')(x)
        
        self.model = models.Model(inputs=inputs, outputs=outputs)
        self.model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy']
        )
    
    def preprocess_signal(self, input_signal: np.ndarray) -> np.ndarray:
        if input_signal.ndim == 2:
            input_signal = input_signal[0, :]
        
        if len(input_signal) > self.input_length:
            input_signal = input_signal[:self.input_length]
        elif len(input_signal) < self.input_length:
            input_signal = np.pad(input_signal, (0, self.input_length - len(input_signal)), 'constant')
        
        input_signal = (input_signal - np.mean(input_signal)) / (np.std(input_signal) + 1e-10)
        
        if TF_AVAILABLE:
            return input_signal.reshape(1, self.input_length, 1)
        return input_signal.reshape(1, self.input_length, 1)

class EnhancedCavitationClassifier:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.cnn = MultiScaleCNN1DClassifier(config)
        self.class_names = CAVITATION_TYPES
        self.num_classes = len(CAVITATION_TYPES)
        self.num_blades = config.propeller.num_blades
    
    def _extract_discriminative_features(self, features: Dict[str, np.ndarray]) -> Dict[str, float]:
        disc_features = {}
        
        disc_features['kurtosis'] = float(np.mean(features.get('kurtosis', np.zeros(1))))
        disc_features['skewness'] = float(np.mean(np.abs(features.get('skewness', np.zeros(1)))))
        disc_features['crest_factor'] = float(np.mean(features.get('crest_factor', np.zeros(1))))
        disc_features['broadband_ratio'] = float(np.mean(features.get('broadband_ratio', np.zeros(1))))
        disc_features['high_low_freq_ratio'] = float(np.mean(features.get('high_low_freq_ratio', np.zeros(1))))
        
        bpf_amplitudes = []
        for h in range(1, 13):
            key = f'bpf_h{h}_amplitude'
            if key in features:
                bpf_amplitudes.append(float(np.mean(features[key])))
            else:
                bpf_amplitudes.append(0.0)
        
        if len(bpf_amplitudes) >= 4:
            low_harmonics = np.array(bpf_amplitudes[:4])
            high_harmonics = np.array(bpf_amplitudes[4:8])
            disc_features['bpf_low_high_ratio'] = float(np.sum(low_harmonics) / (np.sum(high_harmonics) + 1e-10))
            
            if bpf_amplitudes[0] > 0:
                decay_rates = []
                for i in range(1, min(6, len(bpf_amplitudes))):
                    if bpf_amplitudes[i-1] > 0:
                        decay_rates.append(bpf_amplitudes[i] / bpf_amplitudes[i-1])
                disc_features['bpf_avg_decay'] = float(np.mean(decay_rates)) if decay_rates else 0.0
                disc_features['bpf_decay_std'] = float(np.std(decay_rates)) if decay_rates else 0.0
        
        disc_features['bpf_energy_ratio'] = float(np.mean(features.get('bpf_energy_ratio', np.zeros(1))))
        disc_features['even_odd_harmonic_ratio'] = float(np.mean(features.get('even_odd_harmonic_ratio', np.zeros(1))))
        disc_features['avg_sideband_ratio'] = float(np.mean(features.get('avg_sideband_ratio', np.zeros(1))))
        
        disc_features['spectral_centroid'] = float(np.mean(features.get('spectral_centroid', np.zeros(1))))
        disc_features['spectral_spread'] = float(np.mean(features.get('spectral_spread', np.zeros(1))))
        disc_features['spectral_entropy'] = float(np.mean(features.get('spectral_entropy', np.zeros(1))))
        disc_features['spectral_flatness'] = float(np.mean(features.get('spectral_flatness', np.zeros(1))))
        
        disc_features['phase_coupling_strength'] = float(np.mean(features.get('phase_coupling_strength', np.zeros(1))))
        disc_features['bispectrum_level'] = float(np.mean(features.get('bispectrum_level', np.zeros(1))))
        
        disc_features['modulation_depth'] = float(np.mean(features.get('modulation_depth', np.zeros(1))))
        disc_features['pulse_count'] = float(np.mean(features.get('pulse_count', np.zeros(1))))
        disc_features['rise_fall_ratio'] = float(np.mean(features.get('rise_fall_ratio', np.zeros(1))))
        
        disc_features['envelope_kurtosis'] = float(np.mean(features.get('envelope_kurtosis', np.zeros(1))))
        disc_features['envelope_variation'] = float(np.mean(features.get('envelope_variation', np.zeros(1))))
        
        return disc_features
    
    def _synthetic_classify_enhanced(self, disc_features: Dict[str, float]) -> np.ndarray:
        probs = np.zeros(self.num_classes)
        probs[0] = 0.6
        
        kurtosis = disc_features.get('kurtosis', 0)
        skewness = disc_features.get('skewness', 0)
        broadband_ratio = disc_features.get('broadband_ratio', 0)
        phase_coupling = disc_features.get('phase_coupling_strength', 0)
        bpf_energy_ratio = disc_features.get('bpf_energy_ratio', 1)
        crest_factor = disc_features.get('crest_factor', 0)
        modulation_depth = disc_features.get('modulation_depth', 0)
        high_low_ratio = disc_features.get('high_low_freq_ratio', 0)
        bpf_low_high_ratio = disc_features.get('bpf_low_high_ratio', 0)
        bpf_avg_decay = disc_features.get('bpf_avg_decay', 0)
        even_odd_ratio = disc_features.get('even_odd_harmonic_ratio', 0)
        avg_sideband_ratio = disc_features.get('avg_sideband_ratio', 0)
        spectral_entropy = disc_features.get('spectral_entropy', 0)
        pulse_count = disc_features.get('pulse_count', 0)
        rise_fall_ratio = disc_features.get('rise_fall_ratio', 0)
        
        is_cavitation_likely = (kurtosis > 3.5 or broadband_ratio > 0.8 or 
                               phase_coupling > 0.2 or bpf_energy_ratio < 0.6)
        
        if is_cavitation_likely:
            probs[0] = max(0.05, 0.6 - (kurtosis - 3) * 0.05 - broadband_ratio * 0.1)
            
            tip_vortex_score = 0.0
            if 3.5 < kurtosis <= 6 and broadband_ratio < 3 and pulse_count > 5:
                tip_vortex_score += (kurtosis - 3.5) * 0.15
                tip_vortex_score += pulse_count * 0.02
                tip_vortex_score += rise_fall_ratio * 0.2
                if high_low_ratio > 1.5:
                    tip_vortex_score += 0.2
            probs[1] = min(0.85, tip_vortex_score)
            
            face_cavitation_score = 0.0
            if kurtosis > 4 and bpf_energy_ratio < 0.5:
                face_cavitation_score += (kurtosis - 4) * 0.1
                face_cavitation_score += (1 - bpf_energy_ratio) * 0.4
                face_cavitation_score += modulation_depth * 0.3
                if bpf_avg_decay > 0.6:
                    face_cavitation_score += 0.2
                if even_odd_ratio > 1.2:
                    face_cavitation_score += 0.15
                if avg_sideband_ratio < 0.3:
                    face_cavitation_score += 0.15
            probs[2] = min(0.85, face_cavitation_score)
            
            back_cavitation_score = 0.0
            if kurtosis > 4 and phase_coupling > 0.25:
                back_cavitation_score += (kurtosis - 4) * 0.08
                back_cavitation_score += phase_coupling * 0.5
                back_cavitation_score += broadband_ratio * 0.15
                back_cavitation_score += high_low_ratio * 0.1
                if bpf_avg_decay < 0.5:
                    back_cavitation_score += 0.2
                if spectral_entropy > 0.7:
                    back_cavitation_score += 0.15
                if bpf_low_high_ratio < 3:
                    back_cavitation_score += 0.15
            probs[3] = min(0.85, back_cavitation_score)
            
            root_vortex_score = 0.0
            if crest_factor > 8 and skewness > 0.8:
                root_vortex_score += (crest_factor - 8) * 0.05
                root_vortex_score += skewness * 0.3
                root_vortex_score += modulation_depth * 0.2
                if pulse_count > 15:
                    root_vortex_score += 0.2
                if avg_sideband_ratio > 0.5:
                    root_vortex_score += 0.15
            probs[4] = min(0.85, root_vortex_score)
            
            if probs[2] > 0 and probs[3] > 0:
                if bpf_avg_decay > 0.55 and even_odd_ratio > 1.1:
                    probs[2] *= 1.3
                    probs[3] *= 0.7
                elif bpf_avg_decay < 0.45 and high_low_ratio > 2:
                    probs[2] *= 0.7
                    probs[3] *= 1.3
            
            max_prob_idx = np.argmax(probs)
            if max_prob_idx in [2, 3] and max(probs[2], probs[3]) < 0.4:
                if bpf_energy_ratio < 0.4:
                    probs[2] += 0.15
                if high_low_ratio > 2.5:
                    probs[3] += 0.15
        
        total = np.sum(probs)
        if total > 0:
            probs = probs / total
        else:
            probs[0] = 1.0
        
        return probs
    
    def predict(self, input_signal: np.ndarray, features: Dict[str, np.ndarray] = None) -> Dict:
        if self.cnn.model == 'synthetic' or not TF_AVAILABLE:
            if features is not None:
                disc_features = self._extract_discriminative_features(features)
                probs = self._synthetic_classify_enhanced(disc_features)
            else:
                kurt = np.mean(np.abs(input_signal[input_signal > 3 * np.std(input_signal)])) if len(input_signal[input_signal > 3 * np.std(input_signal)]) > 0 else 0
                features = {'kurtosis': np.array([kurt * 0.5])}
                disc_features = self._extract_discriminative_features(features)
                probs = self._synthetic_classify_enhanced(disc_features)
        else:
            processed = self.preprocess_signal(input_signal)
            probs = self.cnn.model.predict(processed, verbose=0)[0]
        
        class_idx = np.argmax(probs)
        class_name = self.class_names[class_idx]
        confidence = probs[class_idx]
        
        return {
            'class_index': class_idx,
            'class_name': class_name,
            'confidence': confidence,
            'probabilities': {self.class_names[i]: float(probs[i]) for i in range(self.num_classes)}
        }
    
    def classify_multichannel(self, input_signals: np.ndarray, features: Dict[str, np.ndarray] = None) -> Dict:
        n_channels = input_signals.shape[0] if input_signals.ndim > 1 else 1
        
        all_probs = []
        for i in range(n_channels):
            sig = input_signals[i] if input_signals.ndim > 1 else input_signals
            result = self.predict(sig, features)
            all_probs.append([result['probabilities'][name] for name in self.class_names.values()])
        
        weights = np.ones(n_channels) / n_channels
        if features and 'rms' in features:
            rms_values = features['rms']
            if len(rms_values) == n_channels:
                weights = rms_values / (np.sum(rms_values) + 1e-10)
        
        weighted_probs = np.average(all_probs, axis=0, weights=weights)
        
        class_idx = np.argmax(weighted_probs)
        class_name = self.class_names[class_idx]
        confidence = weighted_probs[class_idx]
        
        return {
            'class_index': class_idx,
            'class_name': class_name,
            'confidence': confidence,
            'probabilities': {self.class_names[i]: float(weighted_probs[i]) for i in range(self.num_classes)},
            'channel_predictions': [
                {'channel': i, 'class_name': self.class_names[np.argmax(probs)], 'confidence': float(np.max(probs))}
                for i, probs in enumerate(all_probs)
            ],
            'discriminative_features': self._extract_discriminative_features(features) if features else {}
        }
    
    def train(self, X_train: np.ndarray, y_train: np.ndarray, 
              X_val: np.ndarray = None, y_val: np.ndarray = None,
              epochs: int = 50, batch_size: int = 32):
        if not TF_AVAILABLE or self.cnn.model == 'synthetic':
            raise NotImplementedError("TensorFlow is required for training")
        
        X_train = X_train.reshape(-1, self.cnn.input_length, 1)
        if X_val is not None:
            X_val = X_val.reshape(-1, self.cnn.input_length, 1)
            validation_data = (X_val, y_val)
        else:
            validation_data = None
        
        lr_scheduler = tf.keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss', factor=0.5, patience=5, min_lr=1e-6
        )
        early_stopping = tf.keras.callbacks.EarlyStopping(
            monitor='val_loss', patience=10, restore_best_weights=True
        )
        
        class_weights = {
            0: 1.0,
            1: 1.5,
            2: 2.0,
            3: 2.0,
            4: 1.5
        }
        
        history = self.cnn.model.fit(
            X_train, y_train,
            validation_data=validation_data,
            epochs=epochs,
            batch_size=batch_size,
            callbacks=[lr_scheduler, early_stopping],
            class_weight=class_weights,
            verbose=1
        )
        
        return history
    
    def save_model(self, filepath: str):
        if TF_AVAILABLE and self.cnn.model != 'synthetic':
            self.cnn.model.save(filepath)
    
    def load_model(self, filepath: str):
        if TF_AVAILABLE:
            self.cnn.model = models.load_model(filepath)
    
    def get_type_description(self, class_idx: int) -> str:
        descriptions = {
            0: '正常运行状态，无明显空化现象',
            1: '叶梢涡空化：螺旋桨叶梢处形成的涡旋空化，通常在高载荷下出现',
            2: '叶面空化：发生在螺旋桨叶面（压力面）的空化，通常与正攻角有关，BPF谐波衰减较慢',
            3: '叶背空化：发生在螺旋桨叶背（吸力面）的空化，最常见的空化形式，高频能量更突出',
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
