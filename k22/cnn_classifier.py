import numpy as np
from typing import List, Dict, Any, Tuple
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
import joblib
import os
from config import settings
from database import SessionLocal, KilnSample
from preprocessing import preprocessor

try:
    import tensorflow as tf
    from tensorflow.keras import layers, models, optimizers
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False
    print("TensorFlow not available. CNN classifier will be disabled.")


class CNNKilnClassifier:
    def __init__(self):
        self.elements = settings.ELEMENTS
        self.rare_earth_elements = settings.RARE_EARTH_ELEMENTS
        self.all_elements = settings.ALL_ELEMENTS
        self.model_dir = "models"
        os.makedirs(self.model_dir, exist_ok=True)

        self.model = None
        self.scaler = None
        self.label_encoder = None
        self.is_trained = False
        self.accuracy = 0.0

        if TF_AVAILABLE:
            self._load_or_train_models()

    def _load_training_data(self) -> Tuple[np.ndarray, np.ndarray]:
        db = SessionLocal()
        samples = db.query(KilnSample).all()
        db.close()

        if not samples:
            raise Exception("No training data found in database")

        X = []
        y = []

        for sample in samples:
            composition = []
            for elem in self.all_elements:
                val = getattr(sample, elem, np.nan)
                composition.append(val if not np.isnan(val) else 0.0)
            X.append(composition)
            y.append(sample.kiln_id)

        return np.array(X), np.array(y)

    def _build_model(self, input_shape: int, n_classes: int) -> models.Model:
        model = models.Sequential([
            layers.Reshape((input_shape, 1), input_shape=(input_shape,)),

            layers.Conv1D(64, kernel_size=3, activation='relu', padding='same'),
            layers.BatchNormalization(),
            layers.Conv1D(64, kernel_size=3, activation='relu', padding='same'),
            layers.MaxPooling1D(pool_size=2),
            layers.Dropout(0.3),

            layers.Conv1D(128, kernel_size=3, activation='relu', padding='same'),
            layers.BatchNormalization(),
            layers.Conv1D(128, kernel_size=3, activation='relu', padding='same'),
            layers.MaxPooling1D(pool_size=2),
            layers.Dropout(0.3),

            layers.Conv1D(256, kernel_size=3, activation='relu', padding='same'),
            layers.BatchNormalization(),
            layers.GlobalAveragePooling1D(),

            layers.Dense(256, activation='relu'),
            layers.Dropout(0.4),
            layers.Dense(128, activation='relu'),
            layers.Dropout(0.3),
            layers.Dense(n_classes, activation='softmax')
        ])

        model.compile(
            optimizer=optimizers.Adam(learning_rate=0.001),
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy']
        )

        return model

    def _train_models(self):
        X, y = self._load_training_data()

        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)

        self.label_encoder = LabelEncoder()
        y_encoded = self.label_encoder.fit_transform(y)

        X_train, X_test, y_train, y_test = train_test_split(
            X_scaled, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
        )

        n_classes = len(self.label_encoder.classes_)
        self.model = self._build_model(X_scaled.shape[1], n_classes)

        early_stopping = tf.keras.callbacks.EarlyStopping(
            monitor='val_loss', patience=20, restore_best_weights=True
        )
        reduce_lr = tf.keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss', factor=0.5, patience=10, min_lr=1e-6
        )

        self.model.fit(
            X_train, y_train,
            validation_data=(X_test, y_test),
            epochs=200,
            batch_size=32,
            callbacks=[early_stopping, reduce_lr],
            verbose=1
        )

        y_pred = np.argmax(self.model.predict(X_test, verbose=0), axis=1)
        self.accuracy = accuracy_score(y_test, y_pred)
        print(f"CNN classifier accuracy: {self.accuracy:.4f}")

        self._save_models()
        self.is_trained = True

    def _save_models(self):
        if self.model:
            self.model.save(os.path.join(self.model_dir, "cnn_classifier.h5"))
        joblib.dump(self.scaler, os.path.join(self.model_dir, "cnn_scaler.pkl"))
        joblib.dump(self.label_encoder, os.path.join(self.model_dir, "cnn_label_encoder.pkl"))
        joblib.dump(self.accuracy, os.path.join(self.model_dir, "cnn_accuracy.pkl"))

    def _load_or_train_models(self):
        model_files = ["cnn_classifier.h5", "cnn_scaler.pkl", "cnn_label_encoder.pkl", "cnn_accuracy.pkl"]
        all_exist = all(os.path.exists(os.path.join(self.model_dir, f)) for f in model_files)

        if all_exist:
            try:
                self.model = models.load_model(os.path.join(self.model_dir, "cnn_classifier.h5"))
                self.scaler = joblib.load(os.path.join(self.model_dir, "cnn_scaler.pkl"))
                self.label_encoder = joblib.load(os.path.join(self.model_dir, "cnn_label_encoder.pkl"))
                self.accuracy = joblib.load(os.path.join(self.model_dir, "cnn_accuracy.pkl"))
                self.is_trained = True
                return
            except Exception as e:
                print(f"Could not load CNN models: {e}. Will retrain.")

        try:
            self._train_models()
        except Exception as e:
            print(f"Warning: Could not train CNN models: {e}")

    def _composition_to_array(self, composition: Dict[str, float]) -> np.ndarray:
        values = []
        for elem in self.all_elements:
            val = composition.get(elem, 0.0)
            values.append(val if val is not None else 0.0)
        return np.array([values])

    def predict(self, composition: Dict[str, float]) -> Dict[str, Any]:
        if not TF_AVAILABLE or not self.is_trained:
            return None

        X = self._composition_to_array(composition)
        X_scaled = self.scaler.transform(X)

        probabilities = self.model.predict(X_scaled, verbose=0)[0]
        pred_idx = np.argmax(probabilities)
        confidence = float(probabilities[pred_idx])

        kiln_id = self.label_encoder.inverse_transform([pred_idx])[0]
        kiln_name = settings.KILN_NAMES.get(kiln_id, kiln_id)

        all_probs = []
        for i, prob in enumerate(probabilities):
            kid = self.label_encoder.inverse_transform([i])[0]
            all_probs.append({
                "kiln_id": kid,
                "kiln_name": settings.KILN_NAMES.get(kid, kid),
                "probability": float(prob)
            })

        all_probs.sort(key=lambda x: x["probability"], reverse=True)

        return {
            "kiln_id": kiln_id,
            "kiln_name": kiln_name,
            "confidence": confidence,
            "is_reliable": confidence >= 0.95,
            "model_accuracy": self.accuracy,
            "top_predictions": all_probs[:3]
        }

    def batch_predict(self, compositions: List[Dict[str, float]]) -> List[Dict[str, Any]]:
        return [self.predict(comp) for comp in compositions]


if TF_AVAILABLE:
    cnn_classifier = CNNKilnClassifier()
else:
    cnn_classifier = None
