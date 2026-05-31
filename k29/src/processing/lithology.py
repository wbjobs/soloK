import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from .las_loader import WellData


LITHOLOGY_TYPES = {
    "sandstone": {"name": "砂岩", "color": "#F4D03F", "dt_range": (50, 70), "rho_range": (2.3, 2.7)},
    "shale": {"name": "泥岩", "color": "#5D6D7E", "dt_range": (70, 120), "rho_range": (2.2, 2.6)},
    "limestone": {"name": "石灰岩", "color": "#85C1E9", "dt_range": (45, 55), "rho_range": (2.6, 2.8)},
    "dolomite": {"name": "白云岩", "color": "#BB8FCE", "dt_range": (43, 52), "rho_range": (2.7, 2.9)},
    "coal": {"name": "煤", "color": "#2C3E50", "dt_range": (100, 180), "rho_range": (1.3, 1.8)},
    "salt": {"name": "盐岩", "color": "#FDFEFE", "dt_range": (60, 75), "rho_range": (2.0, 2.2)},
}


def generate_training_data(n_samples: int = 5000, seed: int = 42) -> Tuple[np.ndarray, np.ndarray]:
    np.random.seed(seed)
    
    litho_params = {
        "sandstone": {"dt_mean": 60, "dt_std": 5, "rho_mean": 2.5, "rho_std": 0.1, "gr_mean": 50, "gr_std": 15},
        "shale": {"dt_mean": 90, "dt_std": 15, "rho_mean": 2.4, "rho_std": 0.15, "gr_mean": 120, "gr_std": 20},
        "limestone": {"dt_mean": 49, "dt_std": 3, "rho_mean": 2.7, "rho_std": 0.05, "gr_mean": 20, "gr_std": 8},
        "dolomite": {"dt_mean": 47, "dt_std": 3, "rho_mean": 2.8, "rho_std": 0.05, "gr_mean": 15, "gr_std": 5},
        "coal": {"dt_mean": 140, "dt_std": 20, "rho_mean": 1.5, "rho_std": 0.2, "gr_mean": 30, "gr_std": 10},
        "salt": {"dt_mean": 67, "dt_std": 5, "rho_mean": 2.1, "rho_std": 0.05, "gr_mean": 5, "gr_std": 3},
    }
    
    litho_keys = list(litho_params.keys())
    n_per_class = n_samples // len(litho_keys)
    
    features = []
    labels = []
    
    for i, litho in enumerate(litho_keys):
        params = litho_params[litho]
        dt = np.random.normal(params["dt_mean"], params["dt_std"], n_per_class)
        rho = np.random.normal(params["rho_mean"], params["rho_std"], n_per_class)
        gr = np.random.normal(params["gr_mean"], params["gr_std"], n_per_class)
        
        vp_vs = np.zeros(n_per_class)
        if litho == "shale":
            vp_vs = np.random.normal(2.2, 0.3, n_per_class)
        elif litho == "limestone":
            vp_vs = np.random.normal(1.8, 0.2, n_per_class)
        elif litho == "dolomite":
            vp_vs = np.random.normal(1.9, 0.2, n_per_class)
        elif litho == "sandstone":
            vp_vs = np.random.normal(1.7, 0.2, n_per_class)
        else:
            vp_vs = np.random.normal(2.0, 0.3, n_per_class)
        
        features.extend(np.column_stack([dt, rho, gr, vp_vs]))
        labels.extend([i] * n_per_class)
    
    return np.array(features), np.array(labels)


def train_lithology_classifier():
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline
    
    X, y = generate_training_data()
    
    pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('classifier', RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            min_samples_split=5,
            random_state=42,
            n_jobs=-1,
        ))
    ])
    
    pipeline.fit(X, y)
    
    return pipeline


def predict_lithology(well: WellData, classifier=None) -> pd.DataFrame:
    depth = well.get_depth()
    if depth is None:
        return pd.DataFrame()
    
    dt = well.get_curve("DT")
    rho = well.get_curve("RHOB")
    gr = well.get_curve("GR")
    
    if dt is None or rho is None or gr is None:
        missing = []
        if dt is None:
            missing.append("DT")
        if rho is None:
            missing.append("RHOB")
        if gr is None:
            missing.append("GR")
        raise ValueError(f"岩性判别需要曲线: {', '.join(missing)}")
    
    dts = well.get_curve("DTS")
    if dts is not None:
        vp_vs = dt / dts
    else:
        vp_vs = np.full_like(dt, 1.8)
    
    features = np.column_stack([dt, rho, gr, vp_vs])
    
    if classifier is None:
        classifier = train_lithology_classifier()
    
    predictions = classifier.predict(features)
    probabilities = classifier.predict_proba(features)
    
    litho_keys = ["sandstone", "shale", "limestone", "dolomite", "coal", "salt"]
    litho_names = [LITHOLOGY_TYPES[k]["name"] for k in litho_keys]
    litho_colors = [LITHOLOGY_TYPES[k]["color"] for k in litho_keys]
    
    pred_names = [litho_names[p] for p in predictions]
    pred_colors = [litho_colors[p] for p in predictions]
    max_prob = np.max(probabilities, axis=1)
    
    result = pd.DataFrame({
        "DEPTH": depth,
        "DT": dt,
        "RHOB": rho,
        "GR": gr,
        "LITHOLOGY": pred_names,
        "LITHOLOGY_COLOR": pred_colors,
        "CONFIDENCE": max_prob,
    })
    
    for i, key in enumerate(litho_keys):
        result[f"PROB_{key.upper()}"] = probabilities[:, i]
    
    return result


def get_lithology_color(lithology_name: str) -> str:
    for key, info in LITHOLOGY_TYPES.items():
        if info["name"] == lithology_name:
            return info["color"]
    return "#808080"
