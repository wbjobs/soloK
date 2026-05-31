import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Tuple, List, Optional, Dict, Any
import numpy as np
from scipy.interpolate import interp1d


class LSTM_DiseasePredictor(nn.Module):
    def __init__(
        self,
        input_size: int = 150,
        hidden_size: int = 128,
        num_layers: int = 2,
        num_growth_stages: int = 4,
        forecast_horizon: int = 14,
        dropout: float = 0.3
    ):
        super(LSTM_DiseasePredictor, self).__init__()
        
        self.input_size = input_size
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.forecast_horizon = forecast_horizon
        
        self.spectral_encoder = nn.Sequential(
            nn.Linear(input_size, 256),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Dropout(dropout)
        )
        
        self.temporal_encoder = nn.LSTM(
            input_size=128,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0,
            bidirectional=True
        )
        
        self.outbreak_predictor = nn.Sequential(
            nn.Linear(hidden_size * 2, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, forecast_horizon),
            nn.Sigmoid()
        )
        
        self.severity_predictor = nn.Sequential(
            nn.Linear(hidden_size * 2, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, forecast_horizon),
            nn.Sigmoid()
        )
        
        self.spread_decoder = nn.Sequential(
            nn.Linear(hidden_size * 2, 64),
            nn.ReLU(),
            nn.Linear(64, 2)
        )

    def forward(self, x: torch.Tensor) -> Dict[str, torch.Tensor]:
        batch_size, seq_len, _ = x.shape
        
        spectral_features = self.spectral_encoder(x.reshape(-1, self.input_size))
        spectral_features = spectral_features.reshape(batch_size, seq_len, -1)
        
        lstm_out, _ = self.temporal_encoder(spectral_features)
        final_hidden = lstm_out[:, -1, :]
        
        outbreak_prob = self.outbreak_predictor(final_hidden)
        
        severity = self.severity_predictor(final_hidden) * 5
        
        spread_params = self.spread_decoder(final_hidden)
        spread_direction = F.normalize(spread_params, dim=1)
        
        return {
            'outbreak_prob': outbreak_prob,
            'severity_forecast': severity,
            'spread_direction': spread_direction
        }


class DiseaseForecastModel:
    def __init__(
        self,
        num_bands: int = 150,
        num_growth_stages: int = 4,
        forecast_days: int = 14,
        device: str = 'cpu'
    ):
        self.device = torch.device(device)
        self.num_bands = num_bands
        self.num_growth_stages = num_growth_stages
        self.forecast_days = forecast_days
        
        self.model = LSTM_DiseasePredictor(
            input_size=num_bands,
            num_growth_stages=num_growth_stages,
            forecast_horizon=forecast_days
        ).to(self.device)
        
        self.growth_stage_names = [
            '分蘖期',
            '拔节期',
            '抽穗期',
            '灌浆期'
        ]
    
    def resample_spectrum(self, spectrum: np.ndarray, src_bands: int) -> np.ndarray:
        if src_bands == self.num_bands:
            return spectrum
        
        src_points = np.linspace(0, 1, src_bands)
        dst_points = np.linspace(0, 1, self.num_bands)
        f = interp1d(src_points, spectrum, kind='linear', fill_value='extrapolate')
        return f(dst_points)
    
    def preprocess_temporal_data(
        self,
        temporal_spectra: List[np.ndarray],
        wavelengths: Optional[List[np.ndarray]] = None
    ) -> np.ndarray:
        processed = []
        
        for i, spectrum in enumerate(temporal_spectra):
            if spectrum.ndim == 3:
                spectrum = np.mean(spectrum, axis=(0, 1))
            elif spectrum.ndim == 2:
                spectrum = np.mean(spectrum, axis=0)
            
            if spectrum.shape[0] != self.num_bands:
                spectrum = self.resample_spectrum(spectrum, spectrum.shape[0])
            
            processed.append(spectrum)
        
        while len(processed) < self.num_growth_stages:
            processed.append(processed[-1] if processed else np.zeros(self.num_bands))
        
        return np.array(processed[:self.num_growth_stages])
    
    def predict(
        self,
        temporal_spectra: List[np.ndarray],
        current_spatial_map: Optional[np.ndarray] = None,
        field_size: Tuple[int, int] = (100, 100)
    ) -> Dict[str, Any]:
        self.model.eval()
        
        processed_data = self.preprocess_temporal_data(temporal_spectra)
        input_tensor = torch.FloatTensor(processed_data).unsqueeze(0).to(self.device)
        
        with torch.no_grad():
            outputs = self.model(input_tensor)
        
        outbreak_probs = outputs['outbreak_prob'][0].cpu().numpy()
        severity_forecast = outputs['severity_forecast'][0].cpu().numpy()
        spread_direction = outputs['spread_direction'][0].cpu().numpy()
        
        high_risk_days = []
        for day in range(self.forecast_days):
            if outbreak_probs[day] > 0.5:
                high_risk_days.append({
                    'day': day + 1,
                    'probability': float(outbreak_probs[day]),
                    'predicted_severity': float(severity_forecast[day])
                })
        
        spread_forecast = self._predict_spread_area(
            current_spatial_map,
            spread_direction,
            outbreak_probs,
            field_size
        )
        
        return {
            'outbreak_probabilities': outbreak_probs.tolist(),
            'severity_forecast': severity_forecast.tolist(),
            'high_risk_days': high_risk_days,
            'max_outbreak_prob': float(np.max(outbreak_probs)),
            'avg_severity_forecast': float(np.mean(severity_forecast)),
            'spread_direction': {
                'x': float(spread_direction[0]),
                'y': float(spread_direction[1]),
                'angle_degrees': float(np.degrees(np.arctan2(spread_direction[1], spread_direction[0])))
            },
            'spread_forecast': spread_forecast
        }
    
    def _predict_spread_area(
        self,
        current_map: Optional[np.ndarray],
        direction: np.ndarray,
        outbreak_probs: np.ndarray,
        field_size: Tuple[int, int]
    ) -> List[Dict[str, Any]]:
        height, width = field_size
        
        if current_map is None:
            current_map = np.zeros(field_size)
            center_h, center_w = height // 2, width // 2
            current_map[center_h-5:center_h+5, center_w-5:center_w+5] = 1
        
        spread_areas = []
        max_prob = np.max(outbreak_probs)
        
        for week in range(2):
            week_idx = week * 7
            prob_at_week = outbreak_probs[min(week_idx, len(outbreak_probs) - 1)]
            
            spread_distance = int(5 + prob_at_week * 15)
            
            dx = int(direction[0] * spread_distance)
            dy = int(direction[1] * spread_distance)
            
            spread_mask = np.zeros_like(current_map)
            diseased_pixels = np.where(current_map >= 2)
            
            if len(diseased_pixels[0]) > 0:
                for y, x in zip(diseased_pixels[0], diseased_pixels[1]):
                    new_y = np.clip(y + dy, 0, height - 1)
                    new_x = np.clip(x + dx, 0, width - 1)
                    
                    y_min = max(0, new_y - spread_distance // 2)
                    y_max = min(height, new_y + spread_distance // 2)
                    x_min = max(0, new_x - spread_distance // 2)
                    x_max = min(width, new_x + spread_distance // 2)
                    
                    spread_mask[y_min:y_max, x_min:x_max] = 1
            
            new_infected_area = int(np.sum(spread_mask))
            total_infected = int(np.sum(current_map >= 2)) + new_infected_area
            
            spread_areas.append({
                'week': week + 1,
                'spread_distance': spread_distance,
                'new_infected_pixels': new_infected_area,
                'total_infected_pixels': total_infected_area,
                'infection_ratio': total_infected_area / (height * width),
                'spread_mask': spread_mask.tolist()
            })
        
        return spread_areas


class WeatherDataIntegrator:
    def __init__(self):
        self.disease_optimal_conditions = {
            '条锈病': {'temp_min': 10, 'temp_max': 15, 'humidity_min': 80, 'rain_min': 5},
            '叶锈病': {'temp_min': 15, 'temp_max': 25, 'humidity_min': 70, 'rain_min': 3},
            '白粉病': {'temp_min': 15, 'temp_max': 22, 'humidity_min': 60, 'rain_min': 0},
            '赤霉病': {'temp_min': 20, 'temp_max': 30, 'humidity_min': 85, 'rain_min': 10}
        }
    
    def calculate_weather_risk(
        self,
        temperature: float,
        humidity: float,
        rainfall: float,
        disease_type: Optional[str] = None
    ) -> Dict[str, float]:
        if disease_type and disease_type in self.disease_optimal_conditions:
            cond = self.disease_optimal_conditions[disease_type]
            return self._calculate_single_risk(temperature, humidity, rainfall, cond)
        
        risks = {}
        for disease, cond in self.disease_optimal_conditions.items():
            risks[disease] = self._calculate_single_risk(temperature, humidity, rainfall, cond)
        
        return {
            'overall_risk': max(risks.values()),
            'disease_risks': risks,
            'most_likely_disease': max(risks, key=risks.get)
        }
    
    def _calculate_single_risk(
        self,
        temp: float,
        humidity: float,
        rainfall: float,
        conditions: Dict[str, float]
    ) -> float:
        temp_optimal = (conditions['temp_min'] + conditions['temp_max']) / 2
        temp_range = (conditions['temp_max'] - conditions['temp_min']) / 2
        temp_score = np.exp(-((temp - temp_optimal) ** 2) / (2 * temp_range ** 2))
        
        humidity_score = min(1.0, humidity / conditions['humidity_min']) if humidity < 100 else 1.0
        
        if conditions['rain_min'] > 0:
            rain_score = min(1.0, rainfall / conditions['rain_min']) if rainfall < 20 else 1.0
        else:
            rain_score = 1.0 - min(1.0, rainfall / 20)
        
        return float(temp_score * 0.4 + humidity_score * 0.4 + rain_score * 0.2)


class SoilDataIntegrator:
    def __init__(self):
        self.soil_impact_factors = {
            'ph_optimal': (6.0, 7.5),
            'organic_matter_low': 0.02,
            'organic_matter_high': 0.05
        }
    
    def calculate_soil_susceptibility(
        self,
        ph: float,
        organic_matter: float,
        nitrogen: Optional[float] = None,
        phosphorus: Optional[float] = None,
        potassium: Optional[float] = None
    ) -> Dict[str, Any]:
        ph_optimal_min, ph_optimal_max = self.soil_impact_factors['ph_optimal']
        ph_optimal = (ph_optimal_min + ph_optimal_max) / 2
        ph_deviation = abs(ph - ph_optimal) / ph_optimal
        ph_score = max(0, 1 - ph_deviation * 2)
        
        om_score = 1.0 - min(1.0, organic_matter / self.soil_impact_factors['organic_matter_high'])
        
        nutrient_balance = 0.5
        if nitrogen is not None and phosphorus is not None and potassium is not None:
            npk_ratio = nitrogen / (phosphorus + potassium + 1e-6)
            nutrient_balance = np.exp(-((npk_ratio - 2) ** 2) / 2)
        
        susceptibility = 1.0 - (ph_score * 0.3 + (1 - om_score) * 0.4 + nutrient_balance * 0.3)
        
        return {
            'susceptibility': float(susceptibility),
            'ph_score': float(ph_score),
            'organic_matter_risk': float(1 - om_score),
            'nutrient_balance': float(nutrient_balance),
            'risk_level': 'low' if susceptibility < 0.3 else 'medium' if susceptibility < 0.6 else 'high',
            'recommendations': self._generate_recommendations(ph, organic_matter, nitrogen, phosphorus, potassium)
        }
    
    def _generate_recommendations(
        self,
        ph: float,
        organic_matter: float,
        nitrogen: Optional[float],
        phosphorus: Optional[float],
        potassium: Optional[float]
    ) -> List[str]:
        recommendations = []
        
        if ph < 5.5:
            recommendations.append("土壤过酸，建议施用石灰调节pH值")
        elif ph > 8.0:
            recommendations.append("土壤过碱，建议施用硫磺或有机肥调节")
        
        if organic_matter < 0.02:
            recommendations.append("有机质含量低，建议增施有机肥或秸秆还田")
        
        if nitrogen is not None and nitrogen < 50:
            recommendations.append("氮素不足，建议适量增施氮肥")
        if phosphorus is not None and phosphorus < 20:
            recommendations.append("磷素不足，建议增施磷肥")
        if potassium is not None and potassium < 100:
            recommendations.append("钾素不足，建议增施钾肥")
        
        if not recommendations:
            recommendations.append("土壤条件良好，建议维持现有管理措施")
        
        return recommendations
