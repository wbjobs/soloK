import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np

MIN_AUDIO_SAMPLES = 24000

class RawNet2BasicBlock(nn.Module):
    def __init__(self, in_channels, out_channels, stride=1):
        super().__init__()
        self.conv1 = nn.Conv1d(in_channels, out_channels, kernel_size=3, stride=stride, padding=1)
        self.bn1 = nn.BatchNorm1d(out_channels)
        self.conv2 = nn.Conv1d(out_channels, out_channels, kernel_size=3, stride=1, padding=1)
        self.bn2 = nn.BatchNorm1d(out_channels)
        
        self.shortcut = nn.Sequential()
        if stride != 1 or in_channels != out_channels:
            self.shortcut = nn.Sequential(
                nn.Conv1d(in_channels, out_channels, kernel_size=1, stride=stride),
                nn.BatchNorm1d(out_channels)
            )
    
    def forward(self, x):
        identity = x
        out = F.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out += self.shortcut(identity)
        out = F.relu(out)
        return out

class RawNet2(nn.Module):
    def __init__(self, n_classes=2):
        super().__init__()
        self.in_channels = 128
        
        self.conv1 = nn.Conv1d(1, 128, kernel_size=3, stride=3, padding=1)
        self.bn1 = nn.BatchNorm1d(128)
        
        self.layer1 = self._make_layer(128, 2, stride=1)
        self.layer2 = self._make_layer(256, 2, stride=2)
        self.layer3 = self._make_layer(512, 2, stride=2)
        self.layer4 = self._make_layer(512, 2, stride=2)
        
        self.attention = nn.Sequential(
            nn.Conv1d(512, 128, kernel_size=1),
            nn.ReLU(),
            nn.Conv1d(128, 1, kernel_size=1),
            nn.Sigmoid()
        )
        
        self.fc1 = nn.Linear(512, 256)
        self.fc2 = nn.Linear(256, n_classes)
        self.dropout = nn.Dropout(0.5)
    
    def _make_layer(self, out_channels, num_blocks, stride):
        strides = [stride] + [1] * (num_blocks - 1)
        layers = []
        for s in strides:
            layers.append(RawNet2BasicBlock(self.in_channels, out_channels, s))
            self.in_channels = out_channels
        return nn.Sequential(*layers)
    
    def forward(self, x):
        x = x.unsqueeze(1)
        out = F.relu(self.bn1(self.conv1(x)))
        
        out = self.layer1(out)
        out = self.layer2(out)
        out = self.layer3(out)
        out = self.layer4(out)
        
        attn_weights = self.attention(out)
        attended = out * attn_weights
        
        pooled = F.adaptive_avg_pool1d(attended, 1).squeeze(-1)
        
        x = self.dropout(F.relu(self.fc1(pooled)))
        logits = self.fc2(x)
        
        return logits, attn_weights.squeeze(1)

def load_rawnet2_model():
    model = RawNet2(n_classes=2)
    model.eval()
    return model

def _pad_audio(audio_tensor, target_length):
    current_length = audio_tensor.shape[0]
    if current_length >= target_length:
        return audio_tensor, 0
    
    pad_length = target_length - current_length
    left_pad = pad_length // 2
    right_pad = pad_length - left_pad
    padded = F.pad(audio_tensor, (left_pad, right_pad), mode='constant', value=0.0)
    return padded, left_pad

def predict_rawnet2(model, audio_tensor, device='cpu'):
    model = model.to(device)
    original_length = audio_tensor.shape[0]
    
    needs_pad = original_length < MIN_AUDIO_SAMPLES
    
    if needs_pad:
        audio_tensor, _ = _pad_audio(audio_tensor, MIN_AUDIO_SAMPLES)
    
    audio_tensor = audio_tensor.to(device)
    
    with torch.no_grad():
        try:
            logits, attn = model(audio_tensor.unsqueeze(0))
            probs = F.softmax(logits, dim=1)
            fake_prob = probs[0, 1].item()
            
            if needs_pad and attn.shape[0] > 0:
                total_attn_len = attn.shape[0]
                original_attn_len = max(1, int(total_attn_len * original_length / MIN_AUDIO_SAMPLES))
                start = (total_attn_len - original_attn_len) // 2
                attn = attn[start:start + original_attn_len]
                
                if attn.shape[0] == 0:
                    attn = torch.ones(1, device=device)
        except RuntimeError as e:
            if "shape" in str(e) or "size" in str(e):
                fallback_prob = 0.5
                fallback_attn = np.ones(1, dtype=np.float32) * 0.5
                return fallback_prob, fallback_attn
            raise
    
    return fake_prob, attn.squeeze(0).cpu().numpy()
