
import numpy as np
from typing import List, Dict, Tuple, Optional
import os
import warnings
warnings.filterwarnings('ignore')

try:
    import tensorflow as tf
    from tensorflow.keras import layers, models, regularizers
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False
    print("Warning: TensorFlow not available. Using fallback mode.")

try:
    import pywt
    PYWT_AVAILABLE = True
except ImportError:
    PYWT_AVAILABLE = False
    print("Warning: PyWavelets not available. Wavelet denoising disabled.")


class SignalPreprocessor:
    def __init__(self, sample_rate: int = 20000):
        self.sample_rate = sample_rate
        
    def wavelet_denoise(self, signal: np.ndarray, 
                        wavelet: str = 'db4',
                        level: int = 5,
                        mode: str = 'soft') -> np.ndarray:
        if not PYWT_AVAILABLE:
            return signal
        
        coeffs = pywt.wavedec(signal, wavelet, level=level)
        
        sigma = np.median(np.abs(coeffs[-1])) / 0.6745
        threshold = sigma * np.sqrt(2 * np.log(len(signal)))
        
        denoised_coeffs = [coeffs[0]]
        for i in range(1, len(coeffs)):
            if mode == 'soft':
                denoised_coeffs.append(pywt.threshold(coeffs[i], threshold, mode='soft'))
            else:
                denoised_coeffs.append(pywt.threshold(coeffs[i], threshold, mode='hard'))
        
        denoised_signal = pywt.waverec(denoised_coeffs, wavelet)
        
        if len(denoised_signal) > len(signal):
            denoised_signal = denoised_signal[:len(signal)]
        
        return denoised_signal
    
    def compute_spectral_kurtosis(self, signal: np.ndarray, 
                                  window_size: int = 256,
                                  overlap: int = 128) -> np.ndarray:
        n = len(signal)
        step = window_size - overlap
        num_windows = (n - window_size) // step + 1
        
        kurtosis_values = []
        
        for i in range(num_windows):
            start = i * step
            end = start + window_size
            segment = signal[start:end]
            
            segment = segment - np.mean(segment)
            std = np.std(segment)
            
            if std > 0:
                kurt = np.mean((segment / std) ** 4) - 3
                kurtosis_values.append(kurt)
            else:
                kurtosis_values.append(0)
        
        return np.array(kurtosis_values)
    
    def teager_energy_operator(self, signal: np.ndarray) -> np.ndarray:
        n = len(signal)
        teo = np.zeros(n)
        
        for i in range(1, n - 1):
            teo[i] = signal[i] ** 2 - signal[i - 1] * signal[i + 1]
        
        teo[0] = teo[1]
        teo[-1] = teo[-2]
        
        return teo
    
    def enhance_impulsive_features(self, signal: np.ndarray) -> np.ndarray:
        denoised = self.wavelet_denoise(signal, wavelet='db4', level=4, mode='soft')
        
        teo = self.teager_energy_operator(denoised)
        
        window = np.hanning(32)
        window = window / np.sum(window)
        smoothed_teo = np.convolve(teo, window, mode='same')
        
        enhanced = denoised + 0.5 * smoothed_teo
        
        return enhanced
    
    def multi_scale_analysis(self, signal: np.ndarray,
                             scales: List[int] = None) -> List[np.ndarray]:
        if scales is None:
            scales = [1, 2, 4, 8, 16]
        
        multi_scale_signals = []
        
        for scale in scales:
            if scale == 1:
                multi_scale_signals.append(signal)
            else:
                kernel_size = scale * 2 + 1
                kernel = np.ones(kernel_size) / kernel_size
                smoothed = np.convolve(signal, kernel, mode='same')
                
                if len(smoothed) >= len(signal):
                    smoothed = smoothed[:len(signal)]
                
                multi_scale_signals.append(smoothed)
        
        return multi_scale_signals
    
    def extract_enhanced_signal(self, signal: np.ndarray) -> np.ndarray:
        if len(signal) < 100:
            return signal
        
        enhanced = self.enhance_impulsive_features(signal)
        
        return enhanced


if TF_AVAILABLE:
    class SEBlock1D(layers.Layer):
        def __init__(self, filters: int, reduction_ratio: int = 16, **kwargs):
            super().__init__(**kwargs)
            self.filters = filters
            self.reduction_ratio = reduction_ratio
            
            self.global_avg_pool = layers.GlobalAveragePooling1D()
            self.dense1 = layers.Dense(filters // reduction_ratio, activation='relu')
            self.dense2 = layers.Dense(filters, activation='sigmoid')
            self.reshape = layers.Reshape((1, filters))
            
        def call(self, inputs: tf.Tensor, training: bool = False) -> tf.Tensor:
            x = self.global_avg_pool(inputs)
            x = self.dense1(x)
            x = self.dense2(x)
            x = self.reshape(x)
            return inputs * x
        
        def get_config(self) -> Dict:
            config = super().get_config()
            config.update({
                'filters': self.filters,
                'reduction_ratio': self.reduction_ratio
            })
            return config


    class MultiScaleConvBlock(layers.Layer):
        def __init__(self, filters: int, **kwargs):
            super().__init__(**kwargs)
            self.filters = filters
            
            self.conv1 = layers.Conv1D(filters, 3, padding='same', use_bias=False)
            self.conv2 = layers.Conv1D(filters, 5, padding='same', use_bias=False)
            self.conv3 = layers.Conv1D(filters, 7, padding='same', use_bias=False)
            
            self.bn1 = layers.BatchNormalization()
            self.bn2 = layers.BatchNormalization()
            self.bn3 = layers.BatchNormalization()
            
            self.activation = layers.Activation('relu')
            self.concat = layers.Concatenate(axis=-1)
            self.conv_fuse = layers.Conv1D(filters, 1, padding='same', use_bias=False)
            self.bn_fuse = layers.BatchNormalization()
            
        def call(self, inputs: tf.Tensor, training: bool = False) -> tf.Tensor:
            x1 = self.conv1(inputs)
            x1 = self.bn1(x1, training=training)
            x1 = self.activation(x1)
            
            x2 = self.conv2(inputs)
            x2 = self.bn2(x2, training=training)
            x2 = self.activation(x2)
            
            x3 = self.conv3(inputs)
            x3 = self.bn3(x3, training=training)
            x3 = self.activation(x3)
            
            x = self.concat([x1, x2, x3])
            x = self.conv_fuse(x)
            x = self.bn_fuse(x, training=training)
            x = self.activation(x)
            
            return x
        
        def get_config(self) -> Dict:
            config = super().get_config()
            config.update({'filters': self.filters})
            return config


    class ResidualBlockWithAttention(layers.Layer):
        def __init__(self, filters: int, kernel_size: int = 3, stride: int = 1,
                     use_se: bool = True, **kwargs):
            super().__init__(**kwargs)
            self.filters = filters
            self.kernel_size = kernel_size
            self.stride = stride
            self.use_se = use_se
            
            self.conv1 = layers.Conv1D(filters, kernel_size, strides=stride, 
                                       padding='same', use_bias=False)
            self.bn1 = layers.BatchNormalization()
            self.activation = layers.Activation('relu')
            
            self.conv2 = layers.Conv1D(filters, kernel_size, strides=1, 
                                       padding='same', use_bias=False)
            self.bn2 = layers.BatchNormalization()
            
            if use_se:
                self.se = SEBlock1D(filters, reduction_ratio=16)
            
            if stride != 1:
                self.shortcut_conv = layers.Conv1D(filters, 1, strides=stride, 
                                                   padding='same', use_bias=False)
                self.shortcut_bn = layers.BatchNormalization()
            else:
                self.shortcut_conv = None
                self.shortcut_bn = None
            
            self.add = layers.Add()
            
        def call(self, inputs: tf.Tensor, training: bool = False) -> tf.Tensor:
            shortcut = inputs
            
            x = self.conv1(inputs)
            x = self.bn1(x, training=training)
            x = self.activation(x)
            
            x = self.conv2(x)
            x = self.bn2(x, training=training)
            
            if self.use_se:
                x = self.se(x, training=training)
            
            if self.shortcut_conv is not None:
                shortcut = self.shortcut_conv(shortcut)
                shortcut = self.shortcut_bn(shortcut, training=training)
            
            if shortcut.shape[-1] != x.shape[-1]:
                pad_dim = x.shape[-1] - shortcut.shape[-1]
                shortcut = tf.pad(shortcut, [[0, 0], [0, 0], [0, pad_dim]])
            
            x = self.add([x, shortcut])
            x = self.activation(x)
            
            return x
        
        def get_config(self) -> Dict:
            config = super().get_config()
            config.update({
                'filters': self.filters,
                'kernel_size': self.kernel_size,
                'stride': self.stride,
                'use_se': self.use_se
            })
            return config
else:
    class SEBlock1D:
        pass
    
    class MultiScaleConvBlock:
        pass
    
    class ResidualBlockWithAttention:
        pass


class EnhancedResNet1D:
    def __init__(self, input_shape = (1024, 1), 
                 num_classes: int = 10,
                 use_multi_scale: bool = True,
                 use_attention: bool = True):
        self.input_shape = input_shape
        self.num_classes = num_classes
        self.use_multi_scale = use_multi_scale
        self.use_attention = use_attention
        self.preprocessor = SignalPreprocessor(sample_rate=20000)
        
        self.class_names = [
            "正常", "轴承内圈故障", "轴承外圈故障", 
            "轴承滚动体故障", "轴承保持架故障",
            "转子断条", "转子偏心", "定子匝间短路",
            "不对中", "不平衡"
        ]
        
        if TF_AVAILABLE:
            self.model = self.build_model()
        else:
            self.model = None
    
    def build_model(self):
        if not TF_AVAILABLE:
            return None
        inputs = layers.Input(shape=self.input_shape)
        
        if self.use_multi_scale:
            x = MultiScaleConvBlock(64)(inputs)
        else:
            x = layers.Conv1D(64, 7, strides=2, padding='same', use_bias=False)(inputs)
            x = layers.BatchNormalization()(x)
            x = layers.Activation('relu')(x)
        
        x = layers.MaxPooling1D(pool_size=3, strides=2, padding='same')(x)
        
        x = ResidualBlockWithAttention(64, stride=1, use_se=self.use_attention)(x)
        x = ResidualBlockWithAttention(64, stride=1, use_se=self.use_attention)(x)
        
        x = ResidualBlockWithAttention(128, stride=2, use_se=self.use_attention)(x)
        x = ResidualBlockWithAttention(128, stride=1, use_se=self.use_attention)(x)
        
        x = ResidualBlockWithAttention(256, stride=2, use_se=self.use_attention)(x)
        x = ResidualBlockWithAttention(256, stride=1, use_se=self.use_attention)(x)
        
        x = ResidualBlockWithAttention(512, stride=2, use_se=self.use_attention)(x)
        x = ResidualBlockWithAttention(512, stride=1, use_se=self.use_attention)(x)
        
        x = layers.GlobalAveragePooling1D()(x)
        
        x = layers.Dense(512, activation='relu', 
                         kernel_regularizer=regularizers.l2(0.001))(x)
        x = layers.BatchNormalization()(x)
        x = layers.Dropout(0.5)(x)
        
        x = layers.Dense(256, activation='relu',
                         kernel_regularizer=regularizers.l2(0.001))(x)
        x = layers.BatchNormalization()(x)
        x = layers.Dropout(0.3)(x)
        
        outputs = layers.Dense(self.num_classes, activation='softmax')(x)
        
        model = models.Model(inputs=inputs, outputs=outputs)
        
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
            loss=self.focal_loss(gamma=2.0, alpha=0.25),
            metrics=['accuracy']
        )
        
        return model
    
    def focal_loss(self, gamma: float = 2.0, alpha: float = 0.25):
        def loss(y_true, y_pred):
            y_true = tf.cast(y_true, tf.int32)
            y_true_one_hot = tf.one_hot(y_true, self.num_classes)
            
            y_pred = tf.clip_by_value(y_pred, 1e-7, 1.0 - 1e-7)
            
            cross_entropy = -y_true_one_hot * tf.math.log(y_pred)
            
            p_t = tf.reduce_sum(y_true_one_hot * y_pred, axis=-1, keepdims=True)
            focal_weight = alpha * tf.pow((1 - p_t), gamma)
            
            loss = focal_weight * cross_entropy
            
            return tf.reduce_mean(loss)
        
        return loss
    
    def preprocess_signal(self, signal: np.ndarray, 
                          enhance: bool = True) -> np.ndarray:
        if len(signal) < self.input_shape[0]:
            signal = np.pad(signal, (0, self.input_shape[0] - len(signal)), mode='reflect')
        else:
            signal = signal[:self.input_shape[0]]
        
        if enhance:
            signal = self.preprocessor.extract_enhanced_signal(signal)
        
        signal = signal - np.mean(signal)
        signal_std = np.std(signal)
        if signal_std > 0:
            signal = signal / signal_std
        
        return signal.reshape(1, self.input_shape[0], self.input_shape[1])
    
    def preprocess_multi_scale(self, signal: np.ndarray) -> List[np.ndarray]:
        multi_scale_signals = self.preprocessor.multi_scale_analysis(
            signal, scales=[1, 2, 4, 8])
        
        processed_signals = []
        for sig in multi_scale_signals:
            processed = self.preprocess_signal(sig, enhance=False)
            processed_signals.append(processed)
        
        return processed_signals
    
    def predict(self, signal: np.ndarray, 
                use_ensemble: bool = True) -> Dict:
        if not TF_AVAILABLE or self.model is None:
            return self._fallback_predict(signal)
        
        if use_ensemble:
            predictions = []
            
            processed_original = self.preprocess_signal(signal, enhance=False)
            pred_original = self.model.predict(processed_original, verbose=0)
            predictions.append(pred_original[0])
            
            processed_enhanced = self.preprocess_signal(signal, enhance=True)
            pred_enhanced = self.model.predict(processed_enhanced, verbose=0)
            predictions.append(pred_enhanced[0])
            
            multi_scale_signals = self.preprocessor.multi_scale_analysis(
                signal, scales=[2, 4])
            for ms_signal in multi_scale_signals:
                processed_ms = self.preprocess_signal(ms_signal, enhance=False)
                pred_ms = self.model.predict(processed_ms, verbose=0)
                predictions.append(pred_ms[0])
            
            ensemble_pred = np.mean(predictions, axis=0)
        else:
            processed = self.preprocess_signal(signal, enhance=True)
            ensemble_pred = self.model.predict(processed, verbose=0)[0]
        
        predicted_class = int(np.argmax(ensemble_pred))
        confidence = float(ensemble_pred[predicted_class])
        
        features = self._extract_statistical_features(signal)
        if predicted_class > 0:
            confidence = min(1.0, confidence + features['impulsiveness_score'] * 0.1)
        
        return {
            "predicted_class": predicted_class,
            "class_name": self.class_names[predicted_class] if predicted_class < len(self.class_names) else "未知",
            "confidence": confidence,
            "probabilities": ensemble_pred.tolist(),
            "features": features,
            "ensemble_used": use_ensemble
        }
    
    def _extract_statistical_features(self, signal: np.ndarray) -> Dict:
        signal = signal - np.mean(signal)
        std = np.std(signal)
        
        if std > 0:
            normalized = signal / std
            kurtosis = np.mean(normalized ** 4) - 3
            skewness = np.mean(normalized ** 3)
        else:
            kurtosis = 0
            skewness = 0
        
        rms = np.sqrt(np.mean(signal ** 2))
        peak = np.max(np.abs(signal))
        crest_factor = peak / rms if rms > 0 else 0
        
        if PYWT_AVAILABLE:
            coeffs = pywt.wavedec(signal, 'db4', level=3)
            detail_energy = [np.sum(c ** 2) for c in coeffs[1:]]
            total_energy = sum(detail_energy) + np.sum(coeffs[0] ** 2)
            if total_energy > 0:
                high_freq_ratio = sum(detail_energy[:2]) / total_energy
            else:
                high_freq_ratio = 0
        else:
            high_freq_ratio = 0
        
        impulsiveness_score = min(1.0, (kurtosis / 10 + crest_factor / 10) / 2)
        
        return {
            "RMS": float(rms),
            "Peak": float(peak),
            "Crest_Factor": float(crest_factor),
            "Kurtosis": float(kurtosis),
            "Skewness": float(skewness),
            "High_Freq_Ratio": float(high_freq_ratio),
            "impulsiveness_score": float(impulsiveness_score)
        }
    
    def _fallback_predict(self, signal: np.ndarray) -> Dict:
        features = self._extract_statistical_features(signal)
        
        impulsiveness = features['impulsiveness_score']
        kurtosis = features['Kurtosis']
        crest = features['Crest_Factor']
        
        probabilities = np.zeros(self.num_classes)
        probabilities[0] = 0.5
        
        if impulsiveness > 0.3 or kurtosis > 3 or crest > 4:
            for i in range(1, 5):
                probabilities[i] = 0.1
            probabilities[0] = 0.5 - sum(probabilities[1:5])
        
        probabilities = probabilities / np.sum(probabilities)
        predicted_class = int(np.argmax(probabilities))
        
        return {
            "predicted_class": predicted_class,
            "class_name": self.class_names[predicted_class] if predicted_class < len(self.class_names) else "未知",
            "confidence": float(probabilities[predicted_class]),
            "probabilities": probabilities.tolist(),
            "features": features,
            "ensemble_used": False,
            "note": "Fallback prediction (TensorFlow not available)"
        }
    
    def predict_batch(self, signals: np.ndarray) -> List[Dict]:
        results = []
        for signal in signals:
            results.append(self.predict(signal))
        return results
    
    def save_model(self, path: str):
        if TF_AVAILABLE and self.model is not None:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            self.model.save(path)
    
    def load_model(self, path: str):
        if TF_AVAILABLE:
            if os.path.exists(path):
                self.model = models.load_model(
                    path,
                    custom_objects={
                        'SEBlock1D': SEBlock1D,
                        'MultiScaleConvBlock': MultiScaleConvBlock,
                        'ResidualBlockWithAttention': ResidualBlockWithAttention
                    }
                )
                return True
        return False


class ImprovedFaultSeverityEstimator:
    def __init__(self):
        self.normal_ranges = {
            "轴承内圈故障": (0.05, 0.8),
            "轴承外圈故障": (0.05, 0.8),
            "轴承滚动体故障": (0.05, 0.6),
            "轴承保持架故障": (0.05, 0.5),
            "转子断条": (0.03, 0.5),
            "转子偏心": (0.05, 0.6),
            "定子匝间短路": (0.03, 0.5),
            "不对中": (0.05, 0.6),
            "不平衡": (0.05, 0.6)
        }
        
        self.early_fault_thresholds = {
            "kurtosis_min": 3.5,
            "crest_min": 3.5,
            "impulsiveness_min": 0.2
        }
    
    def estimate_severity(self, fault_type: str, features: Dict[str, float]) -> float:
        base_range = self.normal_ranges.get(fault_type, (0.05, 0.8))
        
        rms = features.get("RMS", 0.05)
        kurtosis = features.get("Kurtosis", 3.0)
        peak = features.get("Peak_to_Peak", 0.3)
        crest = features.get("Crest_Factor", 3.0)
        impulsiveness = features.get("impulsiveness_score", 0.0)
        
        severity_score = 0.0
        
        is_early_fault = (kurtosis > self.early_fault_thresholds["kurtosis_min"] or
                         crest > self.early_fault_thresholds["crest_min"] or
                         impulsiveness > self.early_fault_thresholds["impulsiveness_min"])
        
        if is_early_fault and fault_type != "正常":
            severity_score += 15.0
        
        if rms > 0:
            severity_score += min(25.0, rms / base_range[1] * 25)
        
        if kurtosis > 3:
            severity_score += min(25.0, (kurtosis - 3) * 4)
        
        if peak > 0:
            severity_score += min(20.0, peak / base_range[1] * 15)
        
        if crest > 3:
            severity_score += min(15.0, (crest - 3) * 5)
        
        severity_score += min(15.0, impulsiveness * 20)
        
        confidence = features.get("confidence", 0.5)
        if confidence > 0.3:
            severity_score *= (0.5 + confidence * 0.5)
        
        return min(100.0, severity_score)
    
    def get_maintenance_recommendation(self, fault_type: str, severity: float,
                                       is_early_fault: bool = False) -> str:
        if is_early_fault and severity < 30:
            return f"早期{fault_type}征兆：建议加强监测频次，做好维护准备"
        elif severity < 30:
            return f"轻微{fault_type}：建议继续监测，下次维护时检查"
        elif severity < 60:
            return f"中等程度{fault_type}：建议安排计划维护"
        else:
            return f"严重{fault_type}：建议立即停机检修"


FaultSeverityEstimator = ImprovedFaultSeverityEstimator
ResNet1D = EnhancedResNet1D


class MultiModalResNet1D:
    def __init__(self, input_shape=(1024, 1), num_classes: int = 10,
                 use_cross_modal: bool = True):
        self.input_shape = input_shape
        self.num_classes = num_classes
        self.use_cross_modal = use_cross_modal
        self.vibration_model = EnhancedResNet1D(input_shape, num_classes)
        self.preprocessor = SignalPreprocessor(sample_rate=20000)
        
        self.class_names = [
            "正常", "轴承内圈故障", "轴承外圈故障", 
            "轴承滚动体故障", "轴承保持架故障",
            "转子断条", "转子偏心", "定子匝间短路",
            "不对中", "不平衡"
        ]
        
        if TF_AVAILABLE and use_cross_modal:
            self.fusion_model = self._build_fusion_model()
        else:
            self.fusion_model = None
    
    def _build_fusion_model(self):
        vibration_input = layers.Input(shape=input_shape, name='vibration_signal')
        
        x = self.vibration_model.model.layers[1](vibration_input)
        for layer in self.vibration_model.model.layers[2:8]:
            x = layer(x)
        
        vib_features = layers.GlobalAveragePooling1D()(x)
        
        current_features_input = layers.Input(shape=(16,), name='current_features')
        temp_features_input = layers.Input(shape=(4,), name='temperature_features')
        
        cur_dense = layers.Dense(64, activation='relu')(current_features_input)
        temp_dense = layers.Dense(16, activation='relu')(temp_features_input)
        
        combined = layers.Concatenate()([vib_features, cur_dense, temp_dense])
        
        attn_weights = layers.Dense(128, activation='relu')(combined)
        attn_weights = layers.Dense(3, activation='softmax', name='modal_weights')(attn_weights)
        
        weighted_vib = vib_features * attn_weights[:, 0:1]
        weighted_cur = cur_dense * attn_weights[:, 1:2]
        weighted_temp = temp_dense * attn_weights[:, 2:3]
        
        weighted_combined = layers.Concatenate()([weighted_vib, weighted_cur, weighted_temp])
        
        dense1 = layers.Dense(256, activation='relu', 
                             kernel_regularizer=regularizers.l2(0.001))(weighted_combined)
        drop1 = layers.Dropout(0.4)(dense1)
        dense2 = layers.Dense(128, activation='relu',
                             kernel_regularizer=regularizers.l2(0.001))(drop1)
        drop2 = layers.Dropout(0.3)(dense2)
        
        outputs = layers.Dense(self.num_classes, activation='softmax', name='diagnosis')(drop2)
        
        model = models.Model(
            inputs=[vibration_input, current_features_input, temp_features_input],
            outputs=[outputs, attn_weights]
        )
        
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
            loss={'diagnosis': 'sparse_categorical_crossentropy'},
            metrics={'diagnosis': ['accuracy']}
        )
        
        return model
    
    def predict(self, vibration_signal: np.ndarray, 
                current_features: Dict = None,
                temperature_features: Dict = None,
                use_ensemble: bool = True) -> Dict:
        vib_result = self.vibration_model.predict(vibration_signal, use_ensemble)
        
        if self.fusion_model is None or current_features is None or temperature_features is None:
            return vib_result
        
        try:
            processed_vib = self.vibration_model.preprocess_signal(vibration_signal, enhance=True)
            
            cur_array = np.array([list(current_features.values())])
            temp_array = np.array([list(temperature_features.values())])
            
            predictions, weights = self.fusion_model.predict(
                [processed_vib, cur_array, temp_array], verbose=0
            )
            
            pred_class = int(np.argmax(predictions[0]))
            confidence = float(predictions[0][pred_class])
            
            modal_weights = weights[0].tolist()
            
            final_class = pred_class if confidence > vib_result['confidence'] else vib_result['predicted_class']
            final_confidence = max(confidence, vib_result['confidence'])
            
            return {
                'predicted_class': final_class,
                'class_name': self.class_names[final_class] if final_class < len(self.class_names) else "未知",
                'confidence': final_confidence,
                'probabilities': predictions[0].tolist(),
                'modal_weights': {
                    'vibration_weight': modal_weights[0],
                    'current_weight': modal_weights[1],
                    'temperature_weight': modal_weights[2]
                },
                'vibration_result': vib_result,
                'features': vib_result.get('features', {})
            }
        except Exception as e:
            print(f"Fusion prediction failed, falling back to vibration only: {e}")
            return vib_result
