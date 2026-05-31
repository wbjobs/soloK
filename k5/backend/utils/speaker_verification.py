import io
import numpy as np
from typing import Dict, List, Optional, Tuple
from sklearn.cluster import DBSCAN, AgglomerativeClustering
from sklearn.metrics.pairwise import cosine_similarity


class SpeakerEmbeddingExtractor:
    def __init__(self, use_speechbrain: bool = True):
        self.use_speechbrain = use_speechbrain
        self.model = None
        self._model_loaded = False

    def load_model(self):
        if self._model_loaded:
            return
        if not self.use_speechbrain:
            self._model_loaded = True
            return
        try:
            from speechbrain.pretrained import EncoderClassifier
            self.model = EncoderClassifier.from_hparams(
                source="speechbrain/spkrec-ecapa-voxceleb",
                savedir="./tmp/spkrec"
            )
            self._model_loaded = True
        except Exception as e:
            print(f"Warning: Failed to load SpeakerVerification model: {e}")
            self.use_speechbrain = False
            self._model_loaded = True

    def extract_embedding(self, audio: np.ndarray, sr: int = 16000) -> Dict:
        self.load_model()

        if self.model is not None:
            try:
                import torch
                audio_tensor = torch.FloatTensor(audio).unsqueeze(0)
                embedding = self.model.encode_batch(audio_tensor)
                embedding_np = embedding.squeeze().cpu().numpy()
                return {
                    'embedding': embedding_np.tolist(),
                    'embedding_dim': len(embedding_np),
                    'success': True,
                    'error': None,
                    'model': 'speechbrain-ecapa'
                }
            except Exception as e:
                return self._extract_fallback_embedding(audio, sr, str(e))
        else:
            return self._extract_fallback_embedding(audio, sr)

    def _extract_fallback_embedding(self, audio: np.ndarray, sr: int, error: Optional[str] = None) -> Dict:
        try:
            import librosa

            mfcc = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=40)
            mfcc_mean = mfcc.mean(axis=1)
            mfcc_std = mfcc.std(axis=1)

            spectral_centroid = librosa.feature.spectral_centroid(y=audio, sr=sr).mean()
            spectral_bandwidth = librosa.feature.spectral_bandwidth(y=audio, sr=sr).mean()
            spectral_rolloff = librosa.feature.spectral_rolloff(y=audio, sr=sr).mean()
            zcr = librosa.feature.zero_crossing_rate(audio).mean()
            rms = librosa.feature.rms(y=audio).mean()

            pitch, _ = librosa.piptrack(y=audio, sr=sr)
            pitch_mean = pitch[pitch > 0].mean() if np.any(pitch > 0) else 0.0
            pitch_std = pitch[pitch > 0].std() if np.any(pitch > 0) else 0.0

            harmonic, percussive = librosa.effects.hpss(audio)
            harmonic_ratio = np.mean(np.abs(harmonic)) / (np.mean(np.abs(percussive)) + 1e-10)

            embedding = np.concatenate([
                mfcc_mean,
                mfcc_std,
                [spectral_centroid, spectral_bandwidth, spectral_rolloff],
                [zcr, rms, pitch_mean, pitch_std, harmonic_ratio]
            ])

            embedding = embedding / (np.linalg.norm(embedding) + 1e-10)

            return {
                'embedding': embedding.tolist(),
                'embedding_dim': len(embedding),
                'success': True,
                'error': error,
                'model': 'librosa-fallback'
            }
        except Exception as e:
            return {
                'embedding': [],
                'embedding_dim': 0,
                'success': False,
                'error': str(e),
                'model': 'failed'
            }


_embedding_extractor = None


def get_speaker_embedding_extractor() -> SpeakerEmbeddingExtractor:
    global _embedding_extractor
    if _embedding_extractor is None:
        _embedding_extractor = SpeakerEmbeddingExtractor()
    return _embedding_extractor


def extract_speaker_embedding(audio: np.ndarray, sr: int = 16000) -> Dict:
    extractor = get_speaker_embedding_extractor()
    return extractor.extract_embedding(audio, sr)


def compute_cosine_similarity(embedding1: List[float], embedding2: List[float]) -> float:
    if not embedding1 or not embedding2:
        return 0.0
    try:
        arr1 = np.array(embedding1).reshape(1, -1)
        arr2 = np.array(embedding2).reshape(1, -1)
        return float(cosine_similarity(arr1, arr2)[0][0])
    except Exception:
        return 0.0


def cluster_speakers(embeddings: List[List[float]], audio_ids: List[str],
                    threshold: float = 0.7) -> Dict:
    if not embeddings:
        return {'clusters': [], 'audio_to_cluster': {}}

    embeddings_array = np.array(embeddings)

    try:
        clustering = DBSCAN(
            eps=1 - threshold,
            min_samples=1,
            metric='cosine'
        )
        labels = clustering.fit_predict(embeddings_array)
    except Exception:
        try:
            clustering = AgglomerativeClustering(
                n_clusters=None,
                distance_threshold=1 - threshold,
                affinity='cosine',
                linkage='average'
            )
            labels = clustering.fit_predict(embeddings_array)
        except Exception:
            labels = np.zeros(len(embeddings), dtype=int)

    clusters = {}
    for i, label in enumerate(labels):
        cluster_key = str(label)
        if cluster_key not in clusters:
            clusters[cluster_key] = []
        clusters[cluster_key].append(audio_ids[i])

    audio_to_cluster = {}
    for i, audio_id in enumerate(audio_ids):
        audio_to_cluster[audio_id] = str(labels[i])

    return {
        'clusters': clusters,
        'audio_to_cluster': audio_to_cluster,
        'num_clusters': len(clusters),
        'threshold': threshold
    }


def find_similar_speakers(target_embedding: List[float],
                          all_embeddings: Dict[str, List[float]],
                          top_k: int = 10,
                          threshold: float = 0.5) -> List[Dict]:
    if not target_embedding or not all_embeddings:
        return []

    results = []
    for audio_id, embedding in all_embeddings.items():
        similarity = compute_cosine_similarity(target_embedding, embedding)
        if similarity >= threshold:
            results.append({
                'audio_id': audio_id,
                'similarity': similarity,
                'similarity_percent': round(similarity * 100, 1)
            })

    results.sort(key=lambda x: x['similarity'], reverse=True)
    return results[:top_k]


def extract_embedding_for_audio_file(file_bytes: bytes, sr: int = 16000) -> Dict:
    from utils.audio_processing import load_audio
    try:
        audio, sample_rate = load_audio(file_bytes, sr=sr)
        return extract_speaker_embedding(audio, sr=sample_rate)
    except Exception as e:
        return {
            'embedding': [],
            'embedding_dim': 0,
            'success': False,
            'error': str(e),
            'model': 'failed'
        }


def get_2d_projection(embeddings: List[List[float]], method: str = 'pca') -> List[Tuple[float, float]]:
    if len(embeddings) < 2:
        return [(0, 0) for _ in embeddings]

    embeddings_array = np.array(embeddings)

    if method == 'pca':
        try:
            from sklearn.decomposition import PCA
            pca = PCA(n_components=2)
            projection = pca.fit_transform(embeddings_array)
            return [(float(p[0]), float(p[1])) for p in projection]
        except Exception:
            pass

    try:
        from sklearn.manifold import TSNE
        perplexity = min(30, len(embeddings) - 1)
        tsne = TSNE(n_components=2, perplexity=perplexity, random_state=42)
        projection = tsne.fit_transform(embeddings_array)
        return [(float(p[0]), float(p[1])) for p in projection]
    except Exception:
        return [(0, 0) for _ in embeddings]
