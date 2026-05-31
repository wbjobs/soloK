import numpy as np
import os
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.decomposition import PCA
from scipy.spatial.distance import mahalanobis
from scipy.stats import chi2
from config import CLASSIFIER_CONFIG, MODEL_DIR, ODOR_CLASSES

class OdorClassifier:
    def __init__(self, method=None, config=None, confidence_threshold=0.5):
        self.config = config or CLASSIFIER_CONFIG
        self.method = method or self.config['default_method']
        self.scaler = StandardScaler()
        self.label_encoder = LabelEncoder()
        self.pca = None
        self.model = None
        self.classes_ = None
        
        self.confidence_threshold = confidence_threshold
        self.class_stats = {}
        self.overall_mean = None
        self.overall_cov = None
        self.is_fitted = False
        
        self._init_model()

    def _init_model(self):
        if self.method == 'random_forest':
            self.model = RandomForestClassifier(
                n_estimators=self.config['rf_n_estimators'],
                random_state=42,
                n_jobs=-1
            )
        elif self.method == 'svm':
            self.model = SVC(
                kernel=self.config['svm_kernel'],
                C=self.config['svm_C'],
                probability=True,
                random_state=42
            )
        else:
            raise ValueError(f"Unknown method: {self.method}")

    def prepare_data(self, feature_matrix, labels):
        X = np.array(feature_matrix)
        y = np.array(labels)
        
        if X.ndim == 3:
            n_samples, n_sensors, n_features = X.shape
            X = X.reshape(n_samples, n_sensors * n_features)
        
        return X, y

    def _compute_class_statistics(self, X, y_encoded):
        self.class_stats = {}
        unique_classes = np.unique(y_encoded)
        
        for cls in unique_classes:
            mask = y_encoded == cls
            X_cls = X[mask]
            
            if len(X_cls) > 1:
                mean = np.mean(X_cls, axis=0)
                cov = np.cov(X_cls, rowvar=False)
                cov += np.eye(cov.shape[0]) * 1e-5
                
                try:
                    cov_inv = np.linalg.inv(cov)
                except np.linalg.LinAlgError:
                    cov_inv = np.linalg.pinv(cov)
                
                class_name = self.label_encoder.inverse_transform([cls])[0]
                self.class_stats[class_name] = {
                    'mean': mean,
                    'cov': cov,
                    'cov_inv': cov_inv,
                    'n_samples': len(X_cls)
                }
        
        self.overall_mean = np.mean(X, axis=0)
        self.overall_cov = np.cov(X, rowvar=False)
        self.overall_cov += np.eye(self.overall_cov.shape[0]) * 1e-5
        
        try:
            self.overall_cov_inv = np.linalg.inv(self.overall_cov)
        except np.linalg.LinAlgError:
            self.overall_cov_inv = np.linalg.pinv(self.overall_cov)

    def _calculate_mahalanobis_distance(self, X, class_name=None):
        if class_name and class_name in self.class_stats:
            stats = self.class_stats[class_name]
            mean = stats['mean']
            cov_inv = stats['cov_inv']
        else:
            mean = self.overall_mean
            cov_inv = self.overall_cov_inv
        
        if X.ndim == 1:
            X = X.reshape(1, -1)
        
        diff = X - mean
        distances = np.sqrt(np.sum(np.dot(diff, cov_inv) * diff, axis=1))
        return distances

    def _calculate_outlier_score(self, X_scaled):
        distances = {}
        for class_name, stats in self.class_stats.items():
            dist = self._calculate_mahalanobis_distance(X_scaled, class_name)
            distances[class_name] = dist
        
        min_distances = np.min(list(distances.values()), axis=0)
        
        n_features = X_scaled.shape[1]
        p_values = 1 - chi2.cdf(min_distances ** 2, n_features)
        
        return p_values, min_distances

    def _calibrate_probabilities(self, probabilities, X_scaled):
        p_values, distances = self._calculate_outlier_score(X_scaled)
        
        calibrated = probabilities.copy()
        
        for i in range(len(probabilities)):
            max_prob_idx = np.argmax(probabilities[i])
            max_prob = probabilities[i, max_prob_idx]
            
            if p_values[i] < 0.05:
                calibration_factor = max(0.1, p_values[i])
                calibrated[i] = probabilities[i] * calibration_factor
                calibrated[i] = calibrated[i] / (np.sum(calibrated[i]) + 1e-10)
        
        return calibrated

    def fit(self, X, y, use_pca=False, pca_components=None):
        X, y = self.prepare_data(X, y)
        
        self.label_encoder.fit(y)
        y_encoded = self.label_encoder.transform(y)
        self.classes_ = self.label_encoder.classes_
        
        X_scaled = self.scaler.fit_transform(X)
        
        if use_pca:
            if pca_components is None:
                pca_components = self.config['pca_components']
            self.pca = PCA(n_components=pca_components)
            X_scaled = self.pca.fit_transform(X_scaled)
        
        self._compute_class_statistics(X_scaled, y_encoded)
        
        self.model.fit(X_scaled, y_encoded)
        
        train_pred = self.model.predict(X_scaled)
        accuracy = accuracy_score(y_encoded, train_pred)
        
        self.is_fitted = True
        
        return accuracy

    def predict(self, X):
        if self.model is None:
            raise ValueError("Model not trained. Call fit() first.")
        
        X = np.array(X)
        if X.ndim == 3:
            n_samples, n_sensors, n_features = X.shape
            X = X.reshape(n_samples, n_sensors * n_features)
        elif X.ndim == 1:
            X = X.reshape(1, -1)
        
        X_scaled = self.scaler.transform(X)
        
        if self.pca is not None:
            X_scaled = self.pca.transform(X_scaled)
        
        predictions = self.model.predict(X_scaled)
        return self.label_encoder.inverse_transform(predictions)

    def predict_proba(self, X, calibrate=True):
        if self.model is None:
            raise ValueError("Model not trained. Call fit() first.")
        
        X = np.array(X)
        if X.ndim == 3:
            n_samples, n_sensors, n_features = X.shape
            X = X.reshape(n_samples, n_sensors * n_features)
        elif X.ndim == 1:
            X = X.reshape(1, -1)
        
        X_scaled = self.scaler.transform(X)
        
        if self.pca is not None:
            X_scaled = self.pca.transform(X_scaled)
        
        probabilities = self.model.predict_proba(X_scaled)
        
        if calibrate and self.is_fitted:
            probabilities = self._calibrate_probabilities(probabilities, X_scaled)
        
        return probabilities

    def predict_top3(self, X, calibrate=True):
        probabilities = self.predict_proba(X, calibrate=calibrate)
        top3_indices = np.argsort(probabilities, axis=1)[:, -3:][:, ::-1]
        
        X_arr = np.array(X)
        if X_arr.ndim == 1:
            X_arr = X_arr.reshape(1, -1)
        elif X_arr.ndim > 2:
            n_samples = X_arr.shape[0]
            X_arr = X_arr.reshape(n_samples, -1)
        
        X_scaled = self.scaler.transform(X_arr)
        if self.pca is not None:
            X_scaled = self.pca.transform(X_scaled)
        
        p_values, distances = self._calculate_outlier_score(X_scaled)
        
        results = []
        for i in range(len(top3_indices)):
            top3 = []
            for idx in top3_indices[i]:
                class_name = self.label_encoder.inverse_transform([idx])[0]
                prob = probabilities[i, idx] * 100
                
                is_unknown = p_values[i] < 0.05
                if is_unknown and prob > 50:
                    prob = prob * 0.3
                
                top3.append({
                    'class': class_name, 
                    'similarity': round(prob, 2),
                    'is_unknown': is_unknown,
                    'p_value': round(p_values[i], 4)
                })
            results.append(top3)
        
        return results

    def is_unknown_sample(self, X, threshold=0.05):
        X = np.array(X)
        if X.ndim == 1:
            X = X.reshape(1, -1)
        
        X_scaled = self.scaler.transform(X)
        if self.pca is not None:
            X_scaled = self.pca.transform(X_scaled)
        
        p_values, _ = self._calculate_outlier_score(X_scaled)
        return p_values < threshold

    def evaluate(self, X, y):
        X, y = self.prepare_data(X, y)
        y_encoded = self.label_encoder.transform(y)
        
        X_scaled = self.scaler.transform(X)
        if self.pca is not None:
            X_scaled = self.pca.transform(X_scaled)
        
        predictions = self.model.predict(X_scaled)
        accuracy = accuracy_score(y_encoded, predictions)
        
        return {
            'accuracy': accuracy,
            'report': classification_report(
                y_encoded, predictions,
                target_names=self.label_encoder.classes_,
                output_dict=True
            ),
            'confusion_matrix': confusion_matrix(y_encoded, predictions)
        }

    def cross_validate(self, X, y, cv=5):
        X, y = self.prepare_data(X, y)
        y_encoded = self.label_encoder.fit_transform(y)
        
        X_scaled = self.scaler.fit_transform(X)
        if self.pca is not None:
            X_scaled = self.pca.fit_transform(X_scaled)
        
        scores = cross_val_score(self.model, X_scaled, y_encoded, cv=cv)
        return {
            'mean_accuracy': np.mean(scores),
            'std_accuracy': np.std(scores),
            'fold_scores': scores
        }

    def save_model(self, name):
        os.makedirs(MODEL_DIR, exist_ok=True)
        model_path = os.path.join(MODEL_DIR, f'{name}_{self.method}.pkl')
        
        model_data = {
            'model': self.model,
            'scaler': self.scaler,
            'label_encoder': self.label_encoder,
            'pca': self.pca,
            'method': self.method,
            'classes': self.classes_,
            'class_stats': self.class_stats,
            'overall_mean': self.overall_mean,
            'overall_cov': self.overall_cov,
            'overall_cov_inv': self.overall_cov_inv,
            'is_fitted': self.is_fitted,
            'confidence_threshold': self.confidence_threshold
        }
        
        joblib.dump(model_data, model_path)
        return model_path

    def load_model(self, model_path):
        model_data = joblib.load(model_path)
        self.model = model_data['model']
        self.scaler = model_data['scaler']
        self.label_encoder = model_data['label_encoder']
        self.pca = model_data.get('pca')
        self.method = model_data['method']
        self.classes_ = model_data['classes']
        self.class_stats = model_data.get('class_stats', {})
        self.overall_mean = model_data.get('overall_mean')
        self.overall_cov = model_data.get('overall_cov')
        self.overall_cov_inv = model_data.get('overall_cov_inv')
        self.is_fitted = model_data.get('is_fitted', False)
        self.confidence_threshold = model_data.get('confidence_threshold', 0.5)
        return self


class ClassifierEnsemble:
    def __init__(self):
        self.classifiers = {}
        self.weights = {}

    def add_classifier(self, name, classifier, weight=1.0):
        self.classifiers[name] = classifier
        self.weights[name] = weight

    def predict_proba(self, X, calibrate=True):
        all_probs = []
        total_weight = sum(self.weights.values())
        
        for name, clf in self.classifiers.items():
            probs = clf.predict_proba(X, calibrate=calibrate)
            weight = self.weights[name] / total_weight
            all_probs.append(probs * weight)
        
        return sum(all_probs)

    def predict(self, X):
        probs = self.predict_proba(X)
        class_indices = np.argmax(probs, axis=1)
        
        first_clf = list(self.classifiers.values())[0]
        return first_clf.label_encoder.inverse_transform(class_indices)

    def predict_top3(self, X, calibrate=True):
        probabilities = self.predict_proba(X, calibrate=calibrate)
        top3_indices = np.argsort(probabilities, axis=1)[:, -3:][:, ::-1]
        
        first_clf = list(self.classifiers.values())[0]
        results = []
        for i in range(len(top3_indices)):
            top3 = []
            for idx in top3_indices[i]:
                class_name = first_clf.label_encoder.inverse_transform([idx])[0]
                prob = probabilities[i, idx] * 100
                top3.append({'class': class_name, 'similarity': round(prob, 2)})
            results.append(top3)
        
        return results
