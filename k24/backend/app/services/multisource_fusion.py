from typing import List, Dict, Optional, Any, Tuple
import numpy as np
from datetime import datetime, timedelta

from app.models.temporal_models import (
    DiseaseForecastModel,
    WeatherDataIntegrator,
    SoilDataIntegrator
)
from app.models.gnn_models import (
    FieldTransmissionNetwork,
    MultiSourceFusionModel
)


class MultiSourceAnalysisService:
    def __init__(self):
        self.forecast_model = DiseaseForecastModel()
        self.weather_integrator = WeatherDataIntegrator()
        self.soil_integrator = SoilDataIntegrator()
        self.transmission_network = FieldTransmissionNetwork()
        self.fusion_model = MultiSourceFusionModel()
    
    def analyze_temporal_forecast(
        self,
        temporal_spectra: List[List[float]],
        current_disease_map: Optional[List[List[float]]] = None,
        field_size: Tuple[int, int] = (100, 100),
        growth_stages: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        spectra_arrays = [np.array(s) for s in temporal_spectra]
        
        spatial_map = None
        if current_disease_map:
            spatial_map = np.array(current_disease_map)
        
        forecast_result = self.forecast_model.predict(
            spectra_arrays,
            spatial_map,
            field_size
        )
        
        growth_stages = growth_stages or ['分蘖期', '拔节期', '抽穗期', '灌浆期']
        
        return {
            **forecast_result,
            'growth_stages': growth_stages,
            'forecast_horizon_days': 14,
            'analysis_timestamp': datetime.now().isoformat()
        }
    
    def analyze_weather_impact(
        self,
        temperature: float,
        humidity: float,
        rainfall: float,
        disease_type: Optional[str] = None,
        forecast_days: int = 7
    ) -> Dict[str, Any]:
        weather_risk = self.weather_integrator.calculate_weather_risk(
            temperature, humidity, rainfall, disease_type
        )
        
        forecast_risks = []
        for day in range(forecast_days):
            temp_variation = np.sin(day * 0.5) * 3
            humidity_variation = np.cos(day * 0.3) * 5
            rain_prob = 1.0 if day % 3 == 0 else 0.0
            
            day_risk = self.weather_integrator.calculate_weather_risk(
                temperature + temp_variation,
                max(0, min(100, humidity + humidity_variation)),
                rainfall * rain_prob,
                disease_type
            )
            
            forecast_risks.append({
                'day': day + 1,
                'risk': day_risk.get('overall_risk', 0.5) if isinstance(day_risk, dict) else day_risk,
                'temperature_forecast': temperature + temp_variation,
                'humidity_forecast': max(0, min(100, humidity + humidity_variation)),
                'rain_probability': rain_prob
            })
        
        return {
            'current_risk': weather_risk,
            'forecast_risks': forecast_risks,
            'optimal_conditions': self.weather_integrator.disease_optimal_conditions.get(
                disease_type, '通用条件'
            ) if disease_type else self.weather_integrator.disease_optimal_conditions
        }
    
    def analyze_soil_susceptibility(
        self,
        ph: float,
        organic_matter: float,
        nitrogen: Optional[float] = None,
        phosphorus: Optional[float] = None,
        potassium: Optional[float] = None,
        field_history: Optional[str] = None
    ) -> Dict[str, Any]:
        soil_analysis = self.soil_integrator.calculate_soil_susceptibility(
            ph, organic_matter, nitrogen, phosphorus, potassium
        )
        
        history_factor = 1.0
        if field_history == 'continuous_disease':
            history_factor = 1.3
        elif field_history == 'rotation':
            history_factor = 0.8
        elif field_history == 'fallow':
            history_factor = 0.6
        
        adjusted_susceptibility = min(1.0, soil_analysis['susceptibility'] * history_factor)
        
        return {
            **soil_analysis,
            'adjusted_susceptibility': float(adjusted_susceptibility),
            'history_factor': history_factor,
            'field_history': field_history
        }
    
    def analyze_field_transmission(
        self,
        fields: List[Dict[str, Any]],
        distances: Optional[List[List[float]]] = None,
        wind_direction: float = 0.0,
        wind_speed: float = 5.0
    ) -> Dict[str, Any]:
        distance_matrix = None
        if distances:
            distance_matrix = np.array(distances)
        
        wind_factor = min(1.0, wind_speed / 15.0)
        adjusted_wind_direction = wind_direction
        
        transmission_result = self.transmission_network.analyze_transmission(
            fields,
            distance_matrix,
            adjusted_wind_direction
        )
        
        return {
            **transmission_result,
            'wind_impact': {
                'direction_degrees': wind_direction,
                'speed_kmh': wind_speed,
                'influence_factor': wind_factor
            }
        }
    
    def integrated_risk_assessment(
        self,
        spectral_prediction: Dict[str, Any],
        weather_data: Dict[str, float],
        soil_data: Dict[str, float],
        field_data: Optional[Dict[str, Any]] = None,
        historical_trend: Optional[float] = None
    ) -> Dict[str, Any]:
        fused_result = self.fusion_model.fuse_predictions(
            spectral_prediction,
            weather_data,
            soil_data,
            historical_trend
        )
        
        prevention_timing = self._calculate_prevention_window(
            fused_result['fused_risk_score'],
            spectral_prediction.get('outbreak_probabilities', [])
        )
        
        management_recommendations = self._generate_management_plan(
            fused_result,
            field_data
        )
        
        return {
            **fused_result,
            'prevention_timing': prevention_timing,
            'management_recommendations': management_recommendations,
            'assessment_timestamp': datetime.now().isoformat()
        }
    
    def _calculate_prevention_window(
        self,
        risk_score: float,
        outbreak_probs: List[float]
    ) -> Dict[str, Any]:
        if not outbreak_probs:
            return {
                'critical_window_start': 0,
                'critical_window_end': 7,
                'optimal_application_day': 3
            }
        
        high_risk_days = [i for i, p in enumerate(outbreak_probs) if p > 0.5]
        
        if high_risk_days:
            start_day = max(0, min(high_risk_days) - 2)
            end_day = min(len(outbreak_probs) - 1, max(high_risk_days) + 2)
            optimal_day = start_day + (end_day - start_day) // 2
        else:
            start_day = 0
            end_day = 7
            optimal_day = 3
        
        return {
            'critical_window_start': start_day,
            'critical_window_end': end_day,
            'optimal_application_day': optimal_day,
            'window_duration_days': end_day - start_day + 1,
            'urgency': 'high' if risk_score > 0.7 else 'medium' if risk_score > 0.4 else 'low'
        }
    
    def _generate_management_plan(
        self,
        fused_result: Dict[str, Any],
        field_data: Optional[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        recommendations = []
        risk_level = fused_result['risk_level']
        component_risks = fused_result['component_risks']
        
        if risk_level == 'high':
            recommendations.append({
                'type': 'chemical',
                'priority': 1,
                'action': '立即喷施三唑类杀菌剂',
                'details': '推荐使用戊唑醇或丙环唑，剂量为推荐剂量上限',
                'timing': '3天内完成第一次喷施，7天后复查'
            })
        elif risk_level == 'medium':
            recommendations.append({
                'type': 'chemical',
                'priority': 2,
                'action': '喷施保护性杀菌剂',
                'details': '推荐使用代森锰锌或百菌清',
                'timing': '7天内完成喷施'
            })
        
        if component_risks.get('weather_risk', 0) > 0.6:
            recommendations.append({
                'type': 'cultural',
                'priority': 2,
                'action': '加强田间排水',
                'details': '高湿条件易促进病害发展，及时排除田间积水',
                'timing': '立即执行'
            })
        
        if component_risks.get('soil_risk', 0) > 0.5:
            recommendations.append({
                'type': 'soil_management',
                'priority': 3,
                'action': '增施钾肥和硅肥',
                'details': '提高作物抗病性，改善土壤微生态',
                'timing': '下一个施肥期'
            })
        
        recommendations.append({
            'type': 'monitoring',
            'priority': 1 if risk_level == 'high' else 2,
            'action': '加强田间监测',
            'details': f'当前综合风险等级: {risk_level.upper()}',
            'timing': '每3天巡查一次' if risk_level == 'high' else '每周巡查一次'
        })
        
        return sorted(recommendations, key=lambda x: x['priority'])
