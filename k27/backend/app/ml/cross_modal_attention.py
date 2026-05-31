
import numpy as np
from typing import Dict, List, Tuple, Optional
import warnings
warnings.filterwarnings('ignore')

try:
    import tensorflow as tf
    from tensorflow.keras import layers, Model
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False
    print("Warning: TensorFlow not available. Cross-modal attention in simplified mode.")


class CrossModalAttentionLayer(layers.Layer if TF_AVAILABLE else object):
    def __init__(self, 
                 d_model: int = 128,
                 num_heads: int = 8,
                 dropout_rate: float = 0.1,
                 **kwargs):
        if TF_AVAILABLE:
            super().__init__(**kwargs)
        self.d_model = d_model
        self.num_heads = num_heads
        self.dropout_rate = dropout_rate
        
        self.d_k = d_model // num_heads
        
        if TF_AVAILABLE:
            self.W_q = layers.Dense(d_model)
            self.W_k = layers.Dense(d_model)
            self.W_v = layers.Dense(d_model)
            self.W_o = layers.Dense(d_model)
            self.dropout = layers.Dropout(dropout_rate)
            self.layer_norm = layers.LayerNormalization(epsilon=1e-6)
    
    def build(self, input_shape):
        if not TF_AVAILABLE:
            return
        super().build(input_shape)
    
    def scaled_dot_product_attention(self, q, k, v, mask=None):
        matmul_qk = tf.matmul(q, k, transpose_b=True)
        dk = tf.cast(tf.shape(k)[-1], tf.float32)
        scaled_attention_logits = matmul_qk / tf.math.sqrt(dk)
        
        if mask is not None:
            scaled_attention_logits += (mask * -1e9)
        
        attention_weights = tf.nn.softmax(scaled_attention_logits, axis=-1)
        output = tf.matmul(attention_weights, v)
        
        return output, attention_weights
    
    def split_heads(self, x, batch_size):
        x = tf.reshape(x, (batch_size, -1, self.num_heads, self.d_k))
        return tf.transpose(x, perm=[0, 2, 1, 3])
    
    def call(self, inputs, training=False, mask=None):
        if not TF_AVAILABLE:
            return inputs, None
        
        if isinstance(inputs, dict):
            vibration_feat = inputs['vibration']
            current_feat = inputs['current']
            temperature_feat = inputs['temperature']
        elif isinstance(inputs, list) and len(inputs) >= 3:
            vibration_feat, current_feat, temperature_feat = inputs[0], inputs[1], inputs[2]
        else:
            return inputs, None
        
        batch_size = tf.shape(vibration_feat)[0]
        
        q = self.W_q(vibration_feat)
        k_v = self.W_k(current_feat)
        v_v = self.W_v(current_feat)
        
        k_t = self.W_k(temperature_feat)
        v_t = self.W_v(temperature_feat)
        
        q = self.split_heads(q, batch_size)
        k_v = self.split_heads(k_v, batch_size)
        v_v = self.split_heads(v_v, batch_size)
        k_t = self.split_heads(k_t, batch_size)
        v_t = self.split_heads(v_t, batch_size)
        
        attn_output_v, attn_weights_v = self.scaled_dot_product_attention(
            q, k_v, v_v, mask)
        attn_output_t, attn_weights_t = self.scaled_dot_product_attention(
            q, k_t, v_t, mask)
        
        attn_output_v = tf.transpose(attn_output_v, perm=[0, 2, 1, 3])
        attn_output_t = tf.transpose(attn_output_t, perm=[0, 2, 1, 3])
        
        concat_attn_v = tf.reshape(attn_output_v, (batch_size, -1, self.d_model))
        concat_attn_t = tf.reshape(attn_output_t, (batch_size, -1, self.d_model))
        
        output_v = self.W_o(concat_attn_v)
        output_t = self.W_o(concat_attn_t)
        
        combined_output = output_v + output_t
        
        if training:
            combined_output = self.dropout(combined_output, training=training)
        
        combined_output = self.layer_norm(vibration_feat + combined_output)
        
        attention_weights = {
            'vibration_to_current': attn_weights_v,
            'vibration_to_temperature': attn_weights_t
        }
        
        return combined_output, attention_weights
    
    def get_config(self):
        config = {
            'd_model': self.d_model,
            'num_heads': self.num_heads,
            'dropout_rate': self.dropout_rate
        }
        if TF_AVAILABLE:
            base_config = super().get_config()
            return {**base_config, **config}
        return config


class ModalWeightGenerator(layers.Layer if TF_AVAILABLE else object):
    def __init__(self, num_modals: int = 3, reduction_ratio: int = 4, **kwargs):
        if TF_AVAILABLE:
            super().__init__(**kwargs)
        self.num_modals = num_modals
        self.reduction_ratio = reduction_ratio
        
        if TF_AVAILABLE:
            self.global_pool = layers.GlobalAveragePooling1D()
            self.dense1 = layers.Dense(num_modals * 16, activation='relu')
            self.dense2 = layers.Dense(num_modals, activation='softmax')
    
    def call(self, modal_features, training=False):
        if not TF_AVAILABLE:
            return np.ones(self.num_modals) / self.num_modals
        
        pooled = [self.global_pool(feat) for feat in modal_features]
        concatenated = tf.concat(pooled, axis=-1)
        
        weights = self.dense1(concatenated)
        weights = self.dense2(weights)
        
        return weights
    
    def get_config(self):
        config = {
            'num_modals': self.num_modals,
            'reduction_ratio': self.reduction_ratio
        }
        if TF_AVAILABLE:
            base_config = super().get_config()
            return {**base_config, **config}
        return config


class MultiModalFusionEncoder(layers.Layer if TF_AVAILABLE else object):
    def __init__(self, 
                 vibration_dim: int = 256,
                 current_dim: int = 128,
                 temperature_dim: int = 32,
                 fusion_dim: int = 256,
                 num_heads: int = 8,
                 **kwargs):
        if TF_AVAILABLE:
            super().__init__(**kwargs)
        self.vibration_dim = vibration_dim
        self.current_dim = current_dim
        self.temperature_dim = temperature_dim
        self.fusion_dim = fusion_dim
        self.num_heads = num_heads
        
        if TF_AVAILABLE:
            self.vibration_proj = layers.Dense(fusion_dim)
            self.current_proj = layers.Dense(fusion_dim)
            self.temperature_proj = layers.Dense(fusion_dim)
            
            self.cross_modal_attn = CrossModalAttentionLayer(
                d_model=fusion_dim,
                num_heads=num_heads
            )
            
            self.modal_weight_gen = ModalWeightGenerator(num_modals=3)
            
            self.output_layer = layers.Dense(fusion_dim, activation='relu')
            self.layer_norm = layers.LayerNormalization(epsilon=1e-6)
    
    def call(self, vibration_feat, current_feat, temperature_feat, training=False):
        if not TF_AVAILABLE:
            return {
                'fused_features': np.zeros(self.fusion_dim),
                'modal_weights': np.ones(3) / 3,
                'attention_weights': None
            }
        
        vib_proj = self.vibration_proj(vibration_feat)
        cur_proj = self.current_proj(current_feat)
        temp_proj = self.temperature_proj(temperature_feat)
        
        modal_weights = self.modal_weight_gen(
            [vib_proj, cur_proj, temp_proj], training=training)
        
        attn_input = {
            'vibration': vib_proj,
            'current': cur_proj,
            'temperature': temp_proj
        }
        attn_output, attention_weights = self.cross_modal_attn(
            attn_input, training=training)
        
        weighted_vib = vib_proj * modal_weights[:, 0:1, tf.newaxis]
        weighted_cur = cur_proj * modal_weights[:, 1:2, tf.newaxis]
        weighted_temp = temp_proj * modal_weights[:, 2:3, tf.newaxis]
        
        combined = attn_output + weighted_vib + weighted_cur + weighted_temp
        
        fused = self.output_layer(combined)
        fused = self.layer_norm(fused)
        
        return {
            'fused_features': fused,
            'modal_weights': modal_weights,
            'attention_weights': attention_weights
        }
    
    def get_config(self):
        config = {
            'vibration_dim': self.vibration_dim,
            'current_dim': self.current_dim,
            'temperature_dim': self.temperature_dim,
            'fusion_dim': self.fusion_dim,
            'num_heads': self.num_heads
        }
        if TF_AVAILABLE:
            base_config = super().get_config()
            return {**base_config, **config}
        return config


class CrossModalFeatureExtractor:
    def __init__(self, sample_rate_vib: int = 20000, 
                 sample_rate_cur: int = 10000):
        self.sample_rate_vib = sample_rate_vib
        self.sample_rate_cur = sample_rate_cur
        
        self.vibration_feature_names = [
            'RMS_X', 'RMS_Y', 'RMS_Z', 
            'Kurtosis_X', 'Kurtosis_Y', 'Kurtosis_Z',
            'Crest_X', 'Crest_Y', 'Crest_Z',
            'Skewness_X', 'Skewness_Y', 'Skewness_Z',
            'Peak_X', 'Peak_Y', 'Peak_Z'
        ]
        
        self.current_feature_names = [
            'RMS_A', 'RMS_B', 'RMS_C',
            'THD_A', 'THD_B', 'THD_C',
            'Unbalance_Ratio',
            'Negative_Sequence',
            'Fundamental_Amp',
            'Sideband_Strength'
        ]
        
        self.temperature_feature_names = [
            'Bearing_Temp',
            'Winding_Temp',
            'Temp_Gradient',
            'Temp_Rate_Change'
        ]
    
    def extract_vibration_features(self, x: np.ndarray, y: np.ndarray, 
                                    z: np.ndarray) -> Dict[str, float]:
        features = {}
        
        for name, sig in [('X', x), ('Y', y), ('Z', z)]:
            sig_demean = sig - np.mean(sig)
            std = np.std(sig_demean)
            
            features[f'RMS_{name}'] = float(np.sqrt(np.mean(sig_demean ** 2)))
            features[f'Peak_{name}'] = float(np.max(np.abs(sig_demean)))
            features[f'Crest_{name}'] = float(features[f'Peak_{name}'] / (features[f'RMS_{name}'] + 1e-8))
            
            if std > 0:
                norm_sig = sig_demean / std
                features[f'Kurtosis_{name}'] = float(np.mean(norm_sig ** 4) - 3)
                features[f'Skewness_{name}'] = float(np.mean(norm_sig ** 3))
            else:
                features[f'Kurtosis_{name}'] = 0.0
                features[f'Skewness_{name}'] = 0.0
        
        return features
    
    def extract_current_features(self, phase_a: np.ndarray, phase_b: np.ndarray,
                                  phase_c: np.ndarray) -> Dict[str, float]:
        features = {}
        
        for name, sig in [('A', phase_a), ('B', phase_b), ('C', phase_c)]:
            sig_demean = sig - np.mean(sig)
            features[f'RMS_{name}'] = float(np.sqrt(np.mean(sig_demean ** 2)))
            
            fft = np.fft.rfft(sig_demean)
            freqs = np.fft.rfftfreq(len(sig_demean), 1/self.sample_rate_cur)
            
            fundamental_mask = np.abs(freqs - 50) < 2
            harmonic_mask = (freqs > 100) & (freqs < 1000)
            
            fundamental_energy = np.sum(np.abs(fft[fundamental_mask]) ** 2)
            harmonic_energy = np.sum(np.abs(fft[harmonic_mask]) ** 2)
            
            if fundamental_energy > 0:
                features[f'THD_{name}'] = float(np.sqrt(harmonic_energy / fundamental_energy))
                features[f'Fundamental_Amp'] = float(np.max(np.abs(fft[fundamental_mask])))
            else:
                features[f'THD_{name}'] = 0.0
                features[f'Fundamental_Amp'] = 0.0
        
        rms_a = features.get('RMS_A', 0)
        rms_b = features.get('RMS_B', 0)
        rms_c = features.get('RMS_C', 0)
        
        features['Unbalance_Ratio'] = float(
            np.max([rms_a, rms_b, rms_c]) / (np.mean([rms_a, rms_b, rms_c]) + 1e-8)
        )
        
        negative_seq = np.sqrt(
            ((rms_a - rms_b)**2 + (rms_b - rms_c)**2 + (rms_c - rms_a)**2) / 2
        )
        features['Negative_Sequence'] = float(negative_seq)
        
        features['Sideband_Strength'] = float(np.std([rms_a, rms_b, rms_c]))
        
        return features
    
    def extract_temperature_features(self, bearing_temp: float, winding_temp: float,
                                     history_temps: List[float] = None) -> Dict[str, float]:
        features = {
            'Bearing_Temp': float(bearing_temp),
            'Winding_Temp': float(winding_temp),
            'Temp_Gradient': float(winding_temp - bearing_temp)
        }
        
        if history_temps and len(history_temps) > 1:
            temp_array = np.array(history_temps)
            if len(temp_array) > 1:
                features['Temp_Rate_Change'] = float(
                    (temp_array[-1] - temp_array[0]) / len(temp_array)
                )
            else:
                features['Temp_Rate_Change'] = 0.0
        else:
            features['Temp_Rate_Change'] = 0.0
        
        return features
    
    def extract_all_features(self, vibration_data: Dict, current_data: Dict,
                              temperature_data: Dict) -> Dict:
        vib_features = self.extract_vibration_features(
            np.array(vibration_data.get('x', [])),
            np.array(vibration_data.get('y', [])),
            np.array(vibration_data.get('z', []))
        )
        
        cur_features = self.extract_current_features(
            np.array(current_data.get('phase_a', [])),
            np.array(current_data.get('phase_b', [])),
            np.array(current_data.get('phase_c', []))
        )
        
        temp_features = self.extract_temperature_features(
            temperature_data.get('bearing_temp', 0),
            temperature_data.get('winding_temp', 0),
            temperature_data.get('history_temps', [])
        )
        
        return {
            'vibration_features': vib_features,
            'current_features': cur_features,
            'temperature_features': temp_features
        }


class MultiModalDiagnosticModel:
    def __init__(self, num_classes: int = 10, d_model: int = 128):
        self.num_classes = num_classes
        self.d_model = d_model
        self.feature_extractor = CrossModalFeatureExtractor()
        
        self.class_names = [
            "正常", "轴承内圈故障", "轴承外圈故障", 
            "轴承滚动体故障", "轴承保持架故障",
            "转子断条", "转子偏心", "定子匝间短路",
            "不对中", "不平衡"
        ]
        
        if TF_AVAILABLE:
            self.model = self._build_model()
        else:
            self.model = None
    
    def _build_model(self):
        vibration_input = layers.Input(shape=(15,), name='vibration_input')
        current_input = layers.Input(shape=(10,), name='current_input')
        temperature_input = layers.Input(shape=(4,), name='temperature_input')
        
        vib_dense = layers.Dense(64, activation='relu')(vibration_input)
        cur_dense = layers.Dense(32, activation='relu')(current_input)
        temp_dense = layers.Dense(16, activation='relu')(temperature_input)
        
        vib_seq = layers.Reshape((1, 64))(vib_dense)
        cur_seq = layers.Reshape((1, 32))(cur_dense)
        temp_seq = layers.Reshape((1, 16))(temp_dense)
        
        vib_proj = layers.Dense(self.d_model)(vib_seq)
        cur_proj = layers.Dense(self.d_model)(cur_seq)
        temp_proj = layers.Dense(self.d_model)(temp_seq)
        
        fusion_encoder = MultiModalFusionEncoder(
            vibration_dim=64,
            current_dim=32,
            temperature_dim=16,
            fusion_dim=self.d_model,
            num_heads=8
        )
        
        fusion_result = fusion_encoder(vib_proj, cur_proj, temp_proj)
        fused_features = fusion_result['fused_features']
        modal_weights = fusion_result['modal_weights']
        
        gap = layers.GlobalAveragePooling1D()(fused_features)
        
        dense1 = layers.Dense(256, activation='relu')(gap)
        drop1 = layers.Dropout(0.3)(dense1)
        dense2 = layers.Dense(128, activation='relu')(drop1)
        drop2 = layers.Dropout(0.2)(dense2)
        
        outputs = layers.Dense(self.num_classes, activation='softmax', 
                              name='diagnosis_output')(drop2)
        
        model = Model(
            inputs=[vibration_input, current_input, temperature_input],
            outputs=[outputs, modal_weights]
        )
        
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
            loss={
                'diagnosis_output': 'sparse_categorical_crossentropy'
            },
            metrics={'diagnosis_output': ['accuracy']}
        )
        
        return model
    
    def predict(self, vibration_data: Dict, current_data: Dict, 
                temperature_data: Dict) -> Dict:
        features = self.feature_extractor.extract_all_features(
            vibration_data, current_data, temperature_data
        )
        
        if TF_AVAILABLE and self.model is not None:
            vib_array = np.array([list(features['vibration_features'].values())])
            cur_array = np.array([list(features['current_features'].values())])
            temp_array = np.array([list(features['temperature_features'].values())])
            
            predictions, weights = self.model.predict(
                [vib_array, cur_array, temp_array], verbose=0)
            
            predicted_class = int(np.argmax(predictions[0]))
            confidence = float(predictions[0][predicted_class])
            
            modal_weights = weights[0].tolist() if weights is not None else [0.5, 0.3, 0.2]
        else:
            predicted_class, confidence, modal_weights = self._fallback_predict(features)
        
        return {
            'predicted_class': predicted_class,
            'class_name': self.class_names[predicted_class] if predicted_class < len(self.class_names) else "未知",
            'confidence': confidence,
            'modal_weights': {
                'vibration_weight': modal_weights[0],
                'current_weight': modal_weights[1],
                'temperature_weight': modal_weights[2]
            },
            'features': features
        }
    
    def _fallback_predict(self, features: Dict) -> Tuple[int, float, List[float]]:
        vib_features = features['vibration_features']
        cur_features = features['current_features']
        temp_features = features['temperature_features']
        
        vib_score = np.mean([abs(v) for v in vib_features.values()])
        cur_score = np.mean([abs(v) for v in cur_features.values()])
        temp_score = np.mean([abs(v) for v in temp_features.values()])
        
        total = vib_score + cur_score + temp_score + 1e-8
        weights = [vib_score/total, cur_score/total, temp_score/total]
        
        combined_score = vib_score * 0.5 + cur_score * 0.3 + temp_score * 0.2
        
        if combined_score > 3.0:
            predicted_class = 1
            confidence = 0.6
        elif combined_score > 2.0:
            predicted_class = 2
            confidence = 0.5
        elif combined_score > 1.5:
            predicted_class = 5
            confidence = 0.5
        else:
            predicted_class = 0
            confidence = 0.7
        
        return predicted_class, confidence, weights
    
    def save_model(self, path: str):
        if TF_AVAILABLE and self.model is not None:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            self.model.save(path)
    
    def load_model(self, path: str):
        if TF_AVAILABLE:
            if os.path.exists(path):
                self.model = tf.keras.models.load_model(
                    path,
                    custom_objects={
                        'MultiModalFusionEncoder': MultiModalFusionEncoder,
                        'CrossModalAttentionLayer': CrossModalAttentionLayer,
                        'ModalWeightGenerator': ModalWeightGenerator
                    }
                )
                return True
        return False


if not TF_AVAILABLE:
    CrossModalAttentionLayer = object
    ModalWeightGenerator = object
    MultiModalFusionEncoder = object
