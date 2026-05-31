import numpy as np
import librosa
from sklearn.preprocessing import normalize
from scipy.spatial.distance import cosine
import joblib
from pathlib import Path
import pickle

REGISTRY_DIR = Path(__file__).parent.parent / "speaker_registry"
REGISTRY_DIR.mkdir(exist_ok=True)

class SpeakerVerifier:
    def __init__(self):
        self.registry_file = REGISTRY_DIR / "speaker_embeddings.pkl"
        self.embeddings = self._load_registry()
        self.threshold = 0.7
    
    def _load_registry(self):
        if self.registry_file.exists():
            with open(self.registry_file, 'rb') as f:
                return pickle.load(f)
        return {}
    
    def _save_registry(self):
        with open(self.registry_file, 'wb') as f:
            pickle.dump(self.embeddings, f)
    
    def extract_embedding(self, audio, sr):
        mfccs = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=40)
        mfcc_delta = librosa.feature.delta(mfccs)
        mfcc_delta2 = librosa.feature.delta(mfccs, order=2)
        
        features = np.vstack([mfccs, mfcc_delta, mfcc_delta2])
        
        stats = np.hstack([
            np.mean(features, axis=1),
            np.std(features, axis=1),
            np.percentile(features, 25, axis=1),
            np.percentile(features, 75, axis=1)
        ])
        
        embedding = normalize(stats.reshape(1, -1)).flatten()
        return embedding
    
    def register_speaker(self, speaker_id, audio, sr):
        embedding = self.extract_embedding(audio, sr)
        
        if speaker_id in self.embeddings:
            self.embeddings[speaker_id].append(embedding)
        else:
            self.embeddings[speaker_id] = [embedding]
        
        self._save_registry()
        
        return {
            'speaker_id': speaker_id,
            'num_enrollments': len(self.embeddings[speaker_id]),
            'status': 'success'
        }
    
    def verify_speaker(self, audio, sr, speaker_id=None):
        test_embedding = self.extract_embedding(audio, sr)
        
        if speaker_id:
            if speaker_id not in self.embeddings:
                return {
                    'verified': False,
                    'similarity': 0,
                    'best_match': None,
                    'message': f'说话人 {speaker_id} 未注册'
                }
            
            enroll_embeddings = self.embeddings[speaker_id]
            similarities = [1 - cosine(test_embedding, emb) for emb in enroll_embeddings]
            max_similarity = max(similarities)
            
            return {
                'verified': max_similarity >= self.threshold,
                'similarity': round(max_similarity, 4),
                'threshold': self.threshold,
                'speaker_id': speaker_id,
                'best_match': speaker_id
            }
        else:
            best_match = None
            best_similarity = 0
            
            for spk_id, enroll_embeddings in self.embeddings.items():
                similarities = [1 - cosine(test_embedding, emb) for emb in enroll_embeddings]
                max_sim = max(similarities)
                if max_sim > best_similarity:
                    best_similarity = max_sim
                    best_match = spk_id
            
            return {
                'verified': best_similarity >= self.threshold,
                'similarity': round(best_similarity, 4),
                'threshold': self.threshold,
                'best_match': best_match,
                'num_registered': len(self.embeddings)
            }
    
    def get_registered_speakers(self):
        return {
            speaker_id: len(embeddings)
            for speaker_id, embeddings in self.embeddings.items()
        }
    
    def delete_speaker(self, speaker_id):
        if speaker_id in self.embeddings:
            del self.embeddings[speaker_id]
            self._save_registry()
            return {'status': 'success', 'speaker_id': speaker_id}
        return {'status': 'error', 'message': 'Speaker not found'}
    
    def detect_spoofing(self, audio, sr, fake_prob):
        embedding = self.extract_embedding(audio, sr)
        
        embedding_var = np.var(embedding)
        
        mfccs = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=20)
        mfcc_pitch_variance = np.var(mfccs[1:5, :])
        
        spoofing_score = (
            fake_prob * 0.5 +
            min(1.0, (0.1 - embedding_var) * 10) * 0.25 +
            min(1.0, (5 - mfcc_pitch_variance) / 5) * 0.25
        )
        
        return {
            'spoofing_likelihood': round(spoofing_score, 4),
            'is_spoofed': spoofing_score > 0.5,
            'embedding_variance': round(embedding_var, 6),
            'pitch_variance': round(mfcc_pitch_variance, 4)
        }
