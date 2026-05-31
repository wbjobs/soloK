import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from .las_loader import WellData


try:
    import torch
    import torch.nn as nn
    from torch.utils.data import Dataset, DataLoader
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False


FACIES_NAMES = [
    "砂岩", "泥岩", "粉砂岩", "石灰岩", "白云岩",
    "煤", "盐岩", "硬石膏", "砾岩"
]


def normalize_features(X: np.ndarray, mean: Optional[np.ndarray] = None, 
                      std: Optional[np.ndarray] = None) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    if mean is None:
        mean = np.nanmean(X, axis=(0, 1)) if X.ndim == 3 else np.nanmean(X, axis=0)
    if std is None:
        std = np.nanstd(X, axis=(0, 1)) if X.ndim == 3 else np.nanstd(X, axis=0)
        std = np.where(std < 1e-8, 1.0, std)
    
    X_norm = (X - mean) / std
    return X_norm, mean, std


def create_sequences(data: np.ndarray, labels: Optional[np.ndarray], 
                     seq_length: int = 50, step: int = 10) -> Tuple[np.ndarray, Optional[np.ndarray]]:
    n_samples = len(data)
    sequences = []
    seq_labels = []
    
    for i in range(0, n_samples - seq_length + 1, step):
        sequences.append(data[i:i + seq_length])
        if labels is not None:
            seq_labels.append(labels[i + seq_length // 2])
    
    X = np.array(sequences)
    y = np.array(seq_labels) if seq_labels else None
    
    return X, y


class LithofaciesLSTM(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int = 64, num_layers: int = 2, 
                 num_classes: int = 9, dropout: float = 0.3):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        
        self.lstm = nn.LSTM(
            input_dim, hidden_dim, num_layers,
            batch_first=True, bidirectional=True, dropout=dropout
        )
        
        self.fc = nn.Sequential(
            nn.Linear(hidden_dim * 2, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, num_classes)
        )
    
    def forward(self, x):
        lstm_out, _ = self.lstm(x)
        out = self.fc(lstm_out[:, -1, :])
        return out


class LithofaciesTransformer(nn.Module):
    def __init__(self, input_dim: int, d_model: int = 64, nhead: int = 4, 
                 num_layers: int = 2, num_classes: int = 9, dropout: float = 0.3):
        super().__init__()
        self.d_model = d_model
        
        self.embedding = nn.Linear(input_dim, d_model)
        self.pos_encoding = nn.Parameter(torch.randn(1, 500, d_model))
        
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model, nhead=nhead, dim_feedforward=d_model*4,
            dropout=dropout, batch_first=True
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers)
        
        self.fc = nn.Sequential(
            nn.Linear(d_model, d_model // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 2, num_classes)
        )
    
    def forward(self, x):
        batch_size, seq_len, _ = x.shape
        x = self.embedding(x) + self.pos_encoding[:, :seq_len, :]
        x = self.transformer(x)
        out = self.fc(x.mean(dim=1))
        return out


class WellDataset(Dataset):
    def __init__(self, X: np.ndarray, y: Optional[np.ndarray] = None):
        self.X = torch.FloatTensor(X)
        self.y = torch.LongTensor(y) if y is not None else None
    
    def __len__(self):
        return len(self.X)
    
    def __getitem__(self, idx):
        if self.y is not None:
            return self.X[idx], self.y[idx]
        return self.X[idx]


def generate_synthetic_labels_for_well(well: WellData, n_classes: int = 6) -> np.ndarray:
    depth = well.get_depth()
    if depth is None:
        return np.array([])
    
    n = len(depth)
    labels = np.zeros(n, dtype=int)
    
    boundaries = np.sort(np.random.choice(n, size=n_classes - 1, replace=False))
    prev = 0
    for i, bound in enumerate(boundaries):
        labels[prev:bound] = i
        prev = bound
    labels[prev:] = n_classes - 1
    
    noise = np.random.choice([0, 1, -1], size=n, p=[0.9, 0.05, 0.05])
    labels = np.clip(labels + noise, 0, n_classes - 1)
    
    return labels


def extract_features_from_well(well: WellData) -> np.ndarray:
    features = []
    
    dt = well.get_curve("DT")
    dts = well.get_curve("DTS")
    rho = well.get_curve("RHOB")
    gr = well.get_curve("GR")
    
    for name, curve in [("DT", dt), ("DTS", dts), ("RHOB", rho), ("GR", gr)]:
        if curve is not None:
            features.append(curve)
    
    if dt is not None and dts is not None:
        features.append(dt / dts)
    
    if dt is not None and rho is not None:
        vp = 1e6 / (dt * 3.28084)
        features.append(vp * rho * 1000)
    
    return np.column_stack(features)


def train_lithofacies_model(
    training_wells: List[WellData],
    labels_list: Optional[List[np.ndarray]] = None,
    model_type: str = "lstm",
    seq_length: int = 50,
    epochs: int = 20,
    batch_size: int = 32,
    learning_rate: float = 0.001,
    verbose: bool = False,
) -> Tuple[object, Dict]:
    if not TORCH_AVAILABLE:
        raise ImportError("PyTorch is required for deep learning models. Please install it first.")
    
    all_features = []
    all_labels = []
    
    for i, well in enumerate(training_wells):
        features = extract_features_from_well(well)
        if labels_list is not None and i < len(labels_list):
            labels = labels_list[i]
        else:
            labels = generate_synthetic_labels_for_well(well)
        
        if len(features) > seq_length:
            all_features.append(features)
            all_labels.append(labels[:len(features)])
    
    if not all_features:
        raise ValueError("No valid training data")
    
    input_dim = all_features[0].shape[1]
    num_classes = max([len(np.unique(l)) for l in all_labels])
    
    all_features_norm, mean, std = normalize_features(np.vstack(all_features))
    
    seq_list = []
    label_list = []
    for feats, lbls in zip(all_features, all_labels):
        feats_norm = (feats - mean) / std
        seqs, seq_lbls = create_sequences(feats_norm, lbls, seq_length=seq_length, step=seq_length//2)
        seq_list.append(seqs)
        label_list.append(seq_lbls)
    
    X_train = np.vstack(seq_list)
    y_train = np.concatenate(label_list)
    
    dataset = WellDataset(X_train, y_train)
    dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)
    
    if model_type.lower() == "lstm":
        model = LithofaciesLSTM(input_dim, num_classes=num_classes)
    elif model_type.lower() == "transformer":
        model = LithofaciesTransformer(input_dim, num_classes=num_classes)
    else:
        raise ValueError(f"Unknown model type: {model_type}")
    
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    
    history = {"loss": [], "accuracy": []}
    
    model.train()
    for epoch in range(epochs):
        total_loss = 0
        correct = 0
        total = 0
        
        for batch_X, batch_y in dataloader:
            optimizer.zero_grad()
            outputs = model(batch_X)
            loss = criterion(outputs, batch_y)
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
            _, predicted = torch.max(outputs.data, 1)
            total += batch_y.size(0)
            correct += (predicted == batch_y).sum().item()
        
        avg_loss = total_loss / len(dataloader)
        accuracy = correct / total
        history["loss"].append(avg_loss)
        history["accuracy"].append(accuracy)
        
        if verbose:
            print(f"Epoch {epoch+1}/{epochs}, Loss: {avg_loss:.4f}, Acc: {accuracy:.4f}")
    
    model_info = {
        "mean": mean,
        "std": std,
        "input_dim": input_dim,
        "num_classes": num_classes,
        "seq_length": seq_length,
        "model_type": model_type,
        "history": history,
    }
    
    return model, model_info


def predict_lithofacies(
    well: WellData,
    model: nn.Module,
    model_info: Dict,
) -> pd.DataFrame:
    if not TORCH_AVAILABLE:
        raise ImportError("PyTorch is required for deep learning models.")
    
    depth = well.get_depth()
    if depth is None:
        return pd.DataFrame()
    
    features = extract_features_from_well(well)
    seq_length = model_info["seq_length"]
    mean = model_info["mean"]
    std = model_info["std"]
    
    features_norm = (features - mean) / std
    
    n = len(features)
    predictions = np.zeros(n, dtype=int)
    probabilities = np.zeros((n, model_info["num_classes"]))
    
    model.eval()
    with torch.no_grad():
        half = seq_length // 2
        
        for i in range(half, n - half):
            seq = features_norm[i - half:i + half]
            seq_tensor = torch.FloatTensor(seq).unsqueeze(0)
            outputs = model(seq_tensor)
            probs = torch.softmax(outputs, dim=1).numpy()[0]
            predictions[i] = np.argmax(probs)
            probabilities[i] = probs
        
        for i in range(half):
            predictions[i] = predictions[half]
            probabilities[i] = probabilities[half]
        for i in range(n - half, n):
            predictions[i] = predictions[n - half - 1]
            probabilities[i] = probabilities[n - half - 1]
    
    result = pd.DataFrame({
        "DEPTH": depth,
        "LITHOFACIES_DL": [FACIES_NAMES[min(p, len(FACIES_NAMES)-1)] for p in predictions],
        "CONFIDENCE_DL": np.max(probabilities, axis=1),
    })
    
    for i in range(model_info["num_classes"]):
        result[f"PROB_DL_{FACIES_NAMES[i] if i < len(FACIES_NAMES) else f'class_{i}'}"] = probabilities[:, i]
    
    return result


def compare_predictions(
    traditional_df: pd.DataFrame,
    dl_df: pd.DataFrame,
) -> pd.DataFrame:
    merged = pd.merge(traditional_df[["DEPTH", "LITHOLOGY", "CONFIDENCE"]],
                      dl_df[["DEPTH", "LITHOFACIES_DL", "CONFIDENCE_DL"]],
                      on="DEPTH", how="inner")
    
    merged["AGREEMENT"] = (merged["LITHOLOGY"] == merged["LITHOFACIES_DL"]).astype(int)
    
    return merged
