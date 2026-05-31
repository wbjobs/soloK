import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import List, Dict, Tuple, Optional, Any
import numpy as np


class GraphConvolution(nn.Module):
    def __init__(self, in_features: int, out_features: int, bias: bool = True):
        super(GraphConvolution, self).__init__()
        self.in_features = in_features
        self.out_features = out_features
        self.weight = nn.Parameter(torch.FloatTensor(in_features, out_features))
        if bias:
            self.bias = nn.Parameter(torch.FloatTensor(out_features))
        else:
            self.register_parameter('bias', None)
        self.reset_parameters()

    def reset_parameters(self):
        stdv = 1. / np.sqrt(self.weight.size(1))
        self.weight.data.uniform_(-stdv, stdv)
        if self.bias is not None:
            self.bias.data.uniform_(-stdv, stdv)

    def forward(self, x: torch.Tensor, adj: torch.Tensor) -> torch.Tensor:
        support = torch.mm(x, self.weight)
        output = torch.spmm(adj, support)
        if self.bias is not None:
            return output + self.bias
        return output


class DiseaseGNN(nn.Module):
    def __init__(
        self,
        node_feature_dim: int = 12,
        hidden_dim: int = 64,
        num_layers: int = 3,
        dropout: float = 0.3
    ):
        super(DiseaseGNN, self).__init__()
        
        self.node_encoder = nn.Sequential(
            nn.Linear(node_feature_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout)
        )
        
        self.gc_layers = nn.ModuleList()
        for i in range(num_layers):
            self.gc_layers.append(GraphConvolution(
                hidden_dim if i == 0 else hidden_dim,
                hidden_dim
            ))
        
        self.risk_predictor = nn.Sequential(
            nn.Linear(hidden_dim, 32),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )
        
        self.transmission_predictor = nn.Sequential(
            nn.Linear(hidden_dim * 2, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )
        
        self.dropout = dropout

    def forward(
        self,
        x: torch.Tensor,
        adj: torch.Tensor
    ) -> Dict[str, torch.Tensor]:
        x = self.node_encoder(x)
        
        for gc_layer in self.gc_layers:
            x = F.relu(gc_layer(x, adj))
            x = F.dropout(x, self.dropout, training=self.training)
        
        node_risk = self.risk_predictor(x).squeeze()
        
        num_nodes = x.size(0)
        edge_features = []
        for i in range(num_nodes):
            for j in range(num_nodes):
                if i != j:
                    edge_feat = torch.cat([x[i], x[j]], dim=0)
                    edge_features.append(edge_feat)
        
        if edge_features:
            edge_features = torch.stack(edge_features)
            transmission_probs = self.transmission_predictor(edge_features).squeeze()
        else:
            transmission_probs = torch.tensor([])
        
        return {
            'node_risk': node_risk,
            'transmission_probs': transmission_probs,
            'node_embeddings': x
        }


class FieldTransmissionNetwork:
    def __init__(
        self,
        num_fields: int = 10,
        device: str = 'cpu'
    ):
        self.device = torch.device(device)
        self.num_fields = num_fields
        
        self.model = DiseaseGNN(
            node_feature_dim=12,
            hidden_dim=64,
            num_layers=3
        ).to(self.device)
        
        self.field_names = [f'田块_{i+1}' for i in range(num_fields)]
    
    def build_field_graph(
        self,
        field_data: List[Dict[str, Any]],
        distances: Optional[np.ndarray] = None,
        wind_direction: float = 0.0
    ) -> Tuple[np.ndarray, np.ndarray]:
        num_fields = len(field_data)
        
        if distances is None:
            distances = np.zeros((num_fields, num_fields))
            for i in range(num_fields):
                for j in range(num_fields):
                    if i != j:
                        distances[i, j] = np.random.uniform(0.5, 5.0)
        
        adjacency = np.zeros((num_fields, num_fields))
        for i in range(num_fields):
            for j in range(num_fields):
                if i != j:
                    distance_weight = np.exp(-distances[i, j] / 2.0)
                    
                    wind_rad = np.radians(wind_direction)
                    direction_factor = 1.0
                    if num_fields > 2:
                        direction_factor = 0.5 + 0.5 * np.cos(wind_rad)
                    
                    adjacency[i, j] = distance_weight * direction_factor
        
        row_sum = adjacency.sum(axis=1, keepdims=True)
        row_sum[row_sum == 0] = 1
        adjacency_normalized = adjacency / row_sum
        
        node_features = []
        for field in field_data:
            features = []
            
            features.append(field.get('disease_severity', 0) / 5.0)
            features.append(field.get('ndvi', 0.5))
            features.append(field.get('pri', 0.5))
            features.append(field.get('area', 1.0) / 10.0)
            
            weather = field.get('weather', {})
            features.append((weather.get('temperature', 20) - 10) / 30.0)
            features.append(weather.get('humidity', 60) / 100.0)
            features.append(weather.get('rainfall', 0) / 20.0)
            
            soil = field.get('soil', {})
            features.append((soil.get('ph', 7.0) - 5.0) / 5.0)
            features.append(soil.get('organic_matter', 0.03) / 0.1)
            features.append(soil.get('nitrogen', 100) / 200.0)
            features.append(soil.get('phosphorus', 50) / 100.0)
            features.append(soil.get('potassium', 150) / 300.0)
            
            node_features.append(features)
        
        return np.array(node_features), adjacency_normalized
    
    def analyze_transmission(
        self,
        field_data: List[Dict[str, Any]],
        distances: Optional[np.ndarray] = None,
        wind_direction: float = 0.0,
        forecast_days: int = 14
    ) -> Dict[str, Any]:
        self.model.eval()
        
        num_fields = len(field_data)
        node_features, adjacency = self.build_field_graph(
            field_data, distances, wind_direction
        )
        
        x_tensor = torch.FloatTensor(node_features).to(self.device)
        adj_tensor = torch.FloatTensor(adjacency).to(self.device)
        
        with torch.no_grad():
            outputs = self.model(x_tensor, adj_tensor)
        
        node_risks = outputs['node_risk'].cpu().numpy()
        transmission_probs = outputs['transmission_probs'].cpu().numpy()
        
        transmission_matrix = np.zeros((num_fields, num_fields))
        idx = 0
        for i in range(num_fields):
            for j in range(num_fields):
                if i != j:
                    transmission_matrix[i, j] = transmission_probs[idx] if idx < len(transmission_probs) else 0
                    idx += 1
        
        high_risk_fields = []
        for i, field in enumerate(field_data):
            if node_risks[i] > 0.5:
                high_risk_fields.append({
                    'field_id': field.get('id', i),
                    'field_name': field.get('name', f'田块_{i+1}'),
                    'risk_score': float(node_risks[i]),
                    'current_severity': field.get('disease_severity', 0),
                    'risk_level': 'high' if node_risks[i] > 0.7 else 'medium'
                })
        
        transmission_paths = []
        for i in range(num_fields):
            for j in range(num_fields):
                if i != j and transmission_matrix[i, j] > 0.3:
                    transmission_paths.append({
                        'from_field': field_data[i].get('name', f'田块_{i+1}'),
                        'to_field': field_data[j].get('name', f'田块_{j+1}'),
                        'transmission_probability': float(transmission_matrix[i, j]),
                        'estimated_days': int(3 + (1 - transmission_matrix[i, j]) * 10)
                    })
        
        forecast = self._forecast_spread(
            node_risks,
            transmission_matrix,
            [f.get('disease_severity', 0) for f in field_data],
            forecast_days
        )
        
        return {
            'num_fields': num_fields,
            'node_risks': node_risks.tolist(),
            'high_risk_fields': high_risk_fields,
            'transmission_matrix': transmission_matrix.tolist(),
            'transmission_paths': sorted(
                transmission_paths,
                key=lambda x: x['transmission_probability'],
                reverse=True
            )[:10],
            'spread_forecast': forecast,
            'recommendations': self._generate_recommendations(
                high_risk_fields,
                transmission_paths
            )
        }
    
    def _forecast_spread(
        self,
        initial_risks: np.ndarray,
        transmission_matrix: np.ndarray,
        initial_severity: List[float],
        forecast_days: int
    ) -> List[Dict[str, Any]]:
        num_fields = len(initial_risks)
        forecast = []
        
        current_severity = np.array(initial_severity, dtype=float)
        
        for day in range(0, forecast_days + 1, 7):
            for _ in range(min(7, forecast_days - day + 1)):
                spread_contribution = np.dot(transmission_matrix, current_severity * initial_risks.reshape(-1, 1))
                current_severity = np.minimum(5.0, current_severity + spread_contribution.flatten() * 0.1)
            
            newly_infected = np.sum((current_severity >= 1) & (np.array(initial_severity) < 1))
            
            forecast.append({
                'day': day,
                'avg_severity': float(np.mean(current_severity)),
                'max_severity': float(np.max(current_severity)),
                'infected_fields': int(np.sum(current_severity >= 1)),
                'newly_infected_fields': int(newly_infected),
                'severity_by_field': current_severity.tolist()
            })
        
        return forecast
    
    def _generate_recommendations(
        self,
        high_risk_fields: List[Dict[str, Any]],
        transmission_paths: List[Dict[str, Any]]
    ) -> List[str]:
        recommendations = []
        
        if high_risk_fields:
            high_risk_names = [f['field_name'] for f in high_risk_fields if f['risk_level'] == 'high']
            if high_risk_names:
                recommendations.append(
                    f"高风险田块 ({', '.join(high_risk_names)}) 建议立即喷施保护性杀菌剂"
                )
        
        if transmission_paths:
            top_paths = transmission_paths[:3]
            for path in top_paths:
                recommendations.append(
                    f"{path['from_field']} → {path['to_field']}: 传播风险 {path['transmission_probability']:.1%}, "
                    f"预计 {path['estimated_days']} 天内可能扩散，建议设置隔离带"
                )
        
        if not recommendations:
            recommendations.append("当前传播风险较低，建议继续监测")
        
        return recommendations


class MultiSourceFusionModel:
    def __init__(self):
        self.weather_weights = {
            'temperature': 0.3,
            'humidity': 0.4,
            'rainfall': 0.3
        }
        
        self.soil_weights = {
            'ph': 0.25,
            'organic_matter': 0.35,
            'nutrients': 0.4
        }
        
        self.spectral_weight = 0.5
        self.environmental_weight = 0.3
        self.soil_weight = 0.2
    
    def fuse_predictions(
        self,
        spectral_prediction: Dict[str, Any],
        weather_data: Dict[str, float],
        soil_data: Dict[str, float],
        historical_trend: Optional[float] = None
    ) -> Dict[str, Any]:
        spectral_risk = spectral_prediction.get('max_outbreak_prob', 0.5)
        
        temp_risk = self._calculate_temp_risk(weather_data.get('temperature', 20))
        humidity_risk = self._calculate_humidity_risk(weather_data.get('humidity', 60))
        rain_risk = self._calculate_rain_risk(weather_data.get('rainfall', 0))
        weather_risk = (temp_risk * self.weather_weights['temperature'] +
                       humidity_risk * self.weather_weights['humidity'] +
                       rain_risk * self.weather_weights['rainfall'])
        
        ph_risk = self._calculate_ph_risk(soil_data.get('ph', 7.0))
        om_risk = self._calculate_om_risk(soil_data.get('organic_matter', 0.03))
        nutrient_risk = self._calculate_nutrient_risk(
            soil_data.get('nitrogen', 100),
            soil_data.get('phosphorus', 50),
            soil_data.get('potassium', 150)
        )
        soil_risk = (ph_risk * self.soil_weights['ph'] +
                    om_risk * self.soil_weights['organic_matter'] +
                    nutrient_risk * self.soil_weights['nutrients'])
        
        fused_risk = (spectral_risk * self.spectral_weight +
                     weather_risk * self.environmental_weight +
                     soil_risk * self.soil_weight)
        
        if historical_trend is not None:
            trend_factor = 1.0 + historical_trend * 0.3
            fused_risk = min(1.0, fused_risk * trend_factor)
        
        risk_level = 'low' if fused_risk < 0.3 else 'medium' if fused_risk < 0.6 else 'high'
        
        return {
            'fused_risk_score': float(fused_risk),
            'risk_level': risk_level,
            'component_risks': {
                'spectral_risk': float(spectral_risk),
                'weather_risk': float(weather_risk),
                'soil_risk': float(soil_risk)
            },
            'weather_breakdown': {
                'temperature_risk': float(temp_risk),
                'humidity_risk': float(humidity_risk),
                'rainfall_risk': float(rain_risk)
            },
            'soil_breakdown': {
                'ph_risk': float(ph_risk),
                'organic_matter_risk': float(om_risk),
                'nutrient_risk': float(nutrient_risk)
            },
            'action_priority': self._calculate_action_priority(fused_risk, spectral_risk, weather_risk)
        }
    
    def _calculate_temp_risk(self, temp: float) -> float:
        optimal_min, optimal_max = 15, 25
        if temp < optimal_min:
            return max(0, 1 - (optimal_min - temp) / 15)
        elif temp > optimal_max:
            return max(0, 1 - (temp - optimal_max) / 15)
        else:
            return 1.0
    
    def _calculate_humidity_risk(self, humidity: float) -> float:
        return min(1.0, humidity / 80.0) if humidity < 100 else 1.0
    
    def _calculate_rain_risk(self, rainfall: float) -> float:
        return min(1.0, rainfall / 10.0) if rainfall < 20 else 1.0
    
    def _calculate_ph_risk(self, ph: float) -> float:
        optimal = 6.8
        deviation = abs(ph - optimal) / optimal
        return min(1.0, deviation * 1.5)
    
    def _calculate_om_risk(self, organic_matter: float) -> float:
        return 1.0 - min(1.0, organic_matter / 0.05)
    
    def _calculate_nutrient_risk(self, n: float, p: float, k: float) -> float:
        n_risk = 1.0 - min(1.0, n / 150.0)
        p_risk = 1.0 - min(1.0, p / 60.0)
        k_risk = 1.0 - min(1.0, k / 200.0)
        return (n_risk + p_risk + k_risk) / 3.0
    
    def _calculate_action_priority(
        self,
        fused_risk: float,
        spectral_risk: float,
        weather_risk: float
    ) -> str:
        if fused_risk > 0.7:
            if spectral_risk > 0.7:
                return '紧急 - 病害已显现，需立即防治'
            elif weather_risk > 0.7:
                return '紧急 - 气象条件高危，需提前预防'
            else:
                return '高优先 - 综合风险高，加强监测'
        elif fused_risk > 0.4:
            return '中优先 - 中等风险，定期监测'
        else:
            return '低优先 - 正常田间管理'
