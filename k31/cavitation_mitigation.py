"""
空化消除策略与经济性评估模块
功能：
1. 计算消除空化所需的航速降幅
2. 计算消除空化所需的螺旋桨浸深调整量
3. 经济性评估：燃油消耗增加 vs 空化损伤代价
"""
import numpy as np
from dataclasses import dataclass, field
from typing import Dict, Tuple, Optional, List
from config import SystemConfig, DEFAULT_CONFIG

@dataclass
class VesselCharacteristics:
    displacement: float = 35000.0
    length: float = 180.0
    width: float = 30.0
    draft_design: float = 10.0
    service_speed: float = 15.0
    main_engine_power: float = 12000.0
    specific_fuel_consumption: float = 190.0
    fuel_price: float = 650.0
    propeller_repair_cost: float = 500000.0
    propeller_lifespan: float = 15.0
    efficiency_loss_per_cavitation: float = 0.05

@dataclass
class MitigationStrategy:
    strategy_type: str
    adjustment_amount: float
    new_operating_condition: float
    sigma_achieved: float
    fuel_consumption_increase: float
    cost_increase_per_day: float
    annual_cost_increase: float
    damage_reduction: float
    net_benefit: float
    is_recommended: bool
    description: str

class CavitationMitigationCalculator:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG, 
                 vessel: VesselCharacteristics = None):
        self.config = config
        self.propeller = config.propeller
        self.vessel = vessel or VesselCharacteristics()
        self.g = 9.81
        self.rho = config.conditions.water_density
        self.p_atm = 101325
        self.p_vapor = 2339
    
    def compute_cavitation_number(self, ship_speed: float, depth: float, rpm: float = None) -> float:
        p_static = self.p_atm + self.rho * self.g * depth
        
        if rpm is not None:
            tip_speed = (rpm * np.pi / 30) * (self.propeller.diameter / 2)
            advance_speed = ship_speed * 0.7
            reference_speed = np.sqrt(tip_speed ** 2 + advance_speed ** 2)
        else:
            reference_speed = ship_speed
        
        p_dynamic = 0.5 * self.rho * reference_speed ** 2
        sigma = (p_static - self.p_vapor) / p_dynamic
        
        return sigma
    
    def compute_critical_cavitation_number(self, thrust_coefficient: float = 0.2) -> float:
        skew_factor = np.cos(np.radians(self.propeller.skew_angle))
        area_factor = self.propeller.blade_area_ratio
        sigma_c = 0.5 * thrust_coefficient * (1 / area_factor) * skew_factor
        return sigma_c
    
    def compute_required_speed_reduction(self, current_speed: float, current_depth: float, 
                                          current_rpm: float, target_sigma_ratio: float = 1.2,
                                          min_speed: float = 5.0) -> MitigationStrategy:
        sigma_c = self.compute_critical_cavitation_number()
        target_sigma = sigma_c * target_sigma_ratio
        
        current_sigma = self.compute_cavitation_number(current_speed, current_depth, current_rpm)
        
        if current_sigma >= target_sigma:
            return MitigationStrategy(
                strategy_type='speed_reduction',
                adjustment_amount=0.0,
                new_operating_condition=current_speed,
                sigma_achieved=current_sigma,
                fuel_consumption_increase=0.0,
                cost_increase_per_day=0.0,
                annual_cost_increase=0.0,
                damage_reduction=0.0,
                net_benefit=0.0,
                is_recommended=True,
                description='当前工况无空化，无需降速'
            )
        
        required_speed = current_speed
        for speed in np.linspace(current_speed, min_speed, 100):
            sigma = self.compute_cavitation_number(speed, current_depth, current_rpm * (speed / current_speed))
            if sigma >= target_sigma:
                required_speed = speed
                break
        
        speed_reduction = current_speed - required_speed
        
        fuel_increase = self._compute_fuel_consumption_change(current_speed, required_speed)
        
        damage_reduction = self._estimate_damage_cost(current_sigma, sigma_c)
        
        annual_cost = fuel_increase * 300
        annual_saving = damage_reduction
        net_benefit = annual_saving - annual_cost
        
        return MitigationStrategy(
            strategy_type='speed_reduction',
            adjustment_amount=speed_reduction,
            new_operating_condition=required_speed,
            sigma_achieved=self.compute_cavitation_number(required_speed, current_depth, current_rpm * (required_speed / current_speed)),
            fuel_consumption_increase=fuel_increase,
            cost_increase_per_day=fuel_increase * self.vessel.fuel_price / 1000,
            annual_cost_increase=annual_cost * self.vessel.fuel_price / 1000,
            damage_reduction=damage_reduction,
            net_benefit=net_benefit,
            is_recommended=net_benefit > 0,
            description=f'航速从 {current_speed:.1f} kn 降至 {required_speed:.1f} kn，降幅 {speed_reduction:.1f} kn'
        )
    
    def compute_required_depth_increase(self, current_speed: float, current_depth: float,
                                         current_rpm: float, target_sigma_ratio: float = 1.2,
                                         max_depth_increase: float = 3.0) -> MitigationStrategy:
        sigma_c = self.compute_critical_cavitation_number()
        target_sigma = sigma_c * target_sigma_ratio
        
        current_sigma = self.compute_cavitation_number(current_speed, current_depth, current_rpm)
        
        if current_sigma >= target_sigma:
            return MitigationStrategy(
                strategy_type='depth_increase',
                adjustment_amount=0.0,
                new_operating_condition=current_depth,
                sigma_achieved=current_sigma,
                fuel_consumption_increase=0.0,
                cost_increase_per_day=0.0,
                annual_cost_increase=0.0,
                damage_reduction=0.0,
                net_benefit=0.0,
                is_recommended=True,
                description='当前工况无空化，无需增加浸深'
            )
        
        required_depth = current_depth
        for depth in np.linspace(current_depth, current_depth + max_depth_increase, 100):
            sigma = self.compute_cavitation_number(current_speed, depth, current_rpm)
            if sigma >= target_sigma:
                required_depth = depth
                break
        
        depth_increase = required_depth - current_depth
        
        fuel_increase = self._compute_draft_fuel_penalty(depth_increase)
        
        damage_reduction = self._estimate_damage_cost(current_sigma, sigma_c)
        
        annual_cost = fuel_increase * 300
        annual_saving = damage_reduction
        net_benefit = annual_saving - annual_cost
        
        return MitigationStrategy(
            strategy_type='depth_increase',
            adjustment_amount=depth_increase,
            new_operating_condition=required_depth,
            sigma_achieved=self.compute_cavitation_number(current_speed, required_depth, current_rpm),
            fuel_consumption_increase=fuel_increase,
            cost_increase_per_day=fuel_increase * self.vessel.fuel_price / 1000,
            annual_cost_increase=annual_cost * self.vessel.fuel_price / 1000,
            damage_reduction=damage_reduction,
            net_benefit=net_benefit,
            is_recommended=net_benefit > 0 and depth_increase <= max_depth_increase,
            description=f'浸深从 {current_depth:.1f} m 增加至 {required_depth:.1f} m，增量 {depth_increase:.2f} m'
        )
    
    def compute_optimal_strategy(self, current_speed: float, current_depth: float,
                                  current_rpm: float) -> Dict[str, MitigationStrategy]:
        strategies = {}
        
        strategies['speed_reduction'] = self.compute_required_speed_reduction(
            current_speed, current_depth, current_rpm
        )
        
        strategies['depth_increase'] = self.compute_required_depth_increase(
            current_speed, current_depth, current_rpm
        )
        
        return strategies
    
    def _compute_fuel_consumption_change(self, original_speed: float, new_speed: float) -> float:
        power_ratio = (new_speed / original_speed) ** 3
        fuel_change = (power_ratio - 1) * self.vessel.main_engine_power * 24
        return max(0, fuel_change)
    
    def _compute_draft_fuel_penalty(self, depth_increase: float) -> float:
        resistance_increase = 0.02 * depth_increase
        power_increase = resistance_increase * self.vessel.main_engine_power * 24
        return power_increase
    
    def _estimate_damage_cost(self, sigma: float, sigma_c: float) -> float:
        if sigma >= sigma_c:
            return 0.0
        
        sigma_ratio = sigma / sigma_c
        
        if sigma_ratio > 0.8:
            severity = 0.2
        elif sigma_ratio > 0.6:
            severity = 0.5
        elif sigma_ratio > 0.4:
            severity = 1.0
        else:
            severity = 2.0
        
        efficiency_loss = severity * self.vessel.efficiency_loss_per_cavitation
        annual_efficiency_cost = efficiency_loss * self.vessel.main_engine_power * 24 * 300 * self.vessel.fuel_price / 1000
        
        repair_cost_per_year = self.vessel.propeller_repair_cost / self.vessel.propeller_lifespan * severity
        
        total_damage_cost = annual_efficiency_cost + repair_cost_per_year
        
        return total_damage_cost
    
    def generate_comprehensive_report(self, current_speed: float, current_depth: float,
                                       current_rpm: float, severity_level: str,
                                       noise_level: float) -> Dict:
        sigma_current = self.compute_cavitation_number(current_speed, current_depth, current_rpm)
        sigma_c = self.compute_critical_cavitation_number()
        
        strategies = self.compute_optimal_strategy(current_speed, current_depth, current_rpm)
        
        baseline_damage_cost = self._estimate_damage_cost(sigma_current, sigma_c)
        
        report = {
            'current_conditions': {
                'ship_speed': current_speed,
                'draft': current_depth,
                'rpm': current_rpm,
                'sigma': sigma_current,
                'sigma_c': sigma_c,
                'sigma_ratio': sigma_current / sigma_c,
                'severity_level': severity_level,
                'noise_level': noise_level
            },
            'mitigation_strategies': strategies,
            'economic_analysis': {
                'baseline_annual_damage_cost': baseline_damage_cost,
                'recommended_strategy': self._get_best_strategy(strategies),
                'payback_analysis': self._compute_payback_period(strategies, baseline_damage_cost)
            },
            'recommendations': self._generate_recommendations(sigma_current, sigma_c, strategies)
        }
        
        return report
    
    def _get_best_strategy(self, strategies: Dict[str, MitigationStrategy]) -> str:
        best_benefit = -float('inf')
        best_strategy = None
        
        for name, strategy in strategies.items():
            if strategy.is_recommended and strategy.net_benefit > best_benefit:
                best_benefit = strategy.net_benefit
                best_strategy = name
        
        return best_strategy or 'no_action'
    
    def _compute_payback_period(self, strategies: Dict[str, MitigationStrategy], 
                                 baseline_cost: float) -> Dict:
        payback = {}
        
        for name, strategy in strategies.items():
            if strategy.annual_cost_increase > 0:
                damage_saving = strategy.damage_reduction
                annual_net = damage_saving - strategy.annual_cost_increase
                if annual_net > 0:
                    initial_investment = 0
                    payback[name] = initial_investment / annual_net if annual_net > 0 else float('inf')
                else:
                    payback[name] = float('inf')
            else:
                payback[name] = 0
        
        return payback
    
    def _generate_recommendations(self, sigma: float, sigma_c: float,
                                    strategies: Dict[str, MitigationStrategy]) -> List[str]:
        recommendations = []
        
        sigma_ratio = sigma / sigma_c
        
        if sigma_ratio >= 1.2:
            recommendations.append('✓ 当前运行工况良好，无空化风险')
        elif sigma_ratio >= 1.0:
            recommendations.append('⚠ 空化边界状态，建议密切监测')
        else:
            recommendations.append(f'✗ 检测到空化现象 (σ/σ_c = {sigma_ratio:.2f})，需采取措施')
            
            best_strategy = self._get_best_strategy(strategies)
            if best_strategy in strategies:
                s = strategies[best_strategy]
                recommendations.append(f'★ 推荐方案: {s.description}')
                recommendations.append(f'  年度净收益: ${s.net_benefit:,.0f}')
            
            speed_strategy = strategies.get('speed_reduction')
            if speed_strategy and speed_strategy.adjustment_amount > 0:
                recommendations.append(f'  降速方案: {speed_strategy.description}')
            
            depth_strategy = strategies.get('depth_increase')
            if depth_strategy and depth_strategy.adjustment_amount > 0:
                recommendations.append(f'  增深方案: {depth_strategy.description}')
        
        return recommendations
