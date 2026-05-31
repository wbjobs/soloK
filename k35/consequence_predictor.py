import numpy as np
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import logging

from schemas import MeasurementData
from state_estimation import WeightedLeastSquaresEstimator, StateEstimationResult

logger = logging.getLogger(__name__)


@dataclass
class VoltageViolation:
    node_id: int
    voltage_pu: float
    violation_type: str
    severity: float


@dataclass
class EconomicImpact:
    generation_cost_change_mw: float
    estimated_cost_change_usd: float
    redispatch_amount_mw: float
    affected_generators: List[int]
    load_shedding_mw: float


@dataclass
class ConsequencePrediction:
    economic_impact: EconomicImpact
    voltage_violations: List[VoltageViolation]
    max_voltage_deviation_pu: float
    voltage_violation_risk: float
    total_economic_loss_usd: float
    risk_level: str
    vulnerable_nodes: List[int]


class EconomicDispatchSimulator:
    def __init__(self, n_nodes: int, voltage_limits: Tuple[float, float] = (0.95, 1.05),
                 cost_coefficient_a: float = 0.01, cost_coefficient_b: float = 20.0,
                 cost_coefficient_c: float = 100.0):
        self.n_nodes = n_nodes
        self.voltage_min, self.voltage_max = voltage_limits
        self.cost_a = cost_coefficient_a
        self.cost_b = cost_coefficient_b
        self.cost_c = cost_coefficient_c

    def _compute_generation_cost(self, pg: np.ndarray) -> float:
        return float(np.sum(
            self.cost_a * pg ** 2 + self.cost_b * pg + self.cost_c
        ))

    def _simple_ed(self, active_power_demands: np.ndarray,
                   generator_indices: Optional[List[int]] = None,
                   total_generation_limit: float = 1000.0) -> np.ndarray:
        n = len(active_power_demands)
        total_demand = np.sum(np.abs(active_power_demands))

        if generator_indices is None:
            n_gens = max(1, n // 3)
            generator_indices = list(range(0, n, max(1, n // n_gens)))[:n_gens]

        pg = np.zeros(n)
        n_gens = len(generator_indices)
        if n_gens == 0:
            return pg

        incremental_costs = np.array([
            2 * self.cost_a * 1.0 + self.cost_b for _ in generator_indices
        ])
        sorted_indices = np.argsort(incremental_costs)

        remaining_demand = total_demand
        max_gen_per_unit = total_generation_limit / max(n_gens, 1)

        for idx in sorted_indices:
            gen_node = generator_indices[idx]
            allocation = min(remaining_demand, max_gen_per_unit)
            pg[gen_node] = allocation
            remaining_demand -= allocation
            if remaining_demand <= 0:
                break

        return pg

    def simulate_dispatch(self, measurements: List[MeasurementData],
                          se_result: StateEstimationResult) -> Tuple[float, np.ndarray]:
        active_power = np.array([m.active_power for m in measurements])
        pg = self._simple_ed(active_power)
        cost = self._compute_generation_cost(pg)
        return cost, pg

    def check_voltage_violations(self, voltage_magnitudes: np.ndarray,
                                  node_ids: List[int]) -> List[VoltageViolation]:
        violations = []
        for i, (v, nid) in enumerate(zip(voltage_magnitudes, node_ids)):
            if v < self.voltage_min:
                severity = (self.voltage_min - v) / (1.0 - self.voltage_min + 1e-10)
                severity = min(severity, 1.0)
                violations.append(VoltageViolation(
                    node_id=nid,
                    voltage_pu=float(v),
                    violation_type="undervoltage",
                    severity=float(severity)
                ))
            elif v > self.voltage_max:
                severity = (v - self.voltage_max) / (self.voltage_max - 1.0 + 1e-10)
                severity = min(severity, 1.0)
                violations.append(VoltageViolation(
                    node_id=nid,
                    voltage_pu=float(v),
                    violation_type="overvoltage",
                    severity=float(severity)
                ))
        return violations


class AttackConsequencePredictor:
    def __init__(self, n_nodes: int = 300,
                 voltage_limits: Tuple[float, float] = (0.95, 1.05),
                 cost_coefficients: Tuple[float, float, float] = (0.01, 20.0, 100.0),
                 electricity_price_usd_per_mwh: float = 50.0):
        self.n_nodes = n_nodes
        self.electricity_price = electricity_price_usd_per_mwh
        self.ed_simulator = EconomicDispatchSimulator(
            n_nodes=n_nodes,
            voltage_limits=voltage_limits,
            cost_coefficient_a=cost_coefficients[0],
            cost_coefficient_b=cost_coefficients[1],
            cost_coefficient_c=cost_coefficients[2]
        )
        self.voltage_min, self.voltage_max = voltage_limits

    def predict_consequences(self,
                             original_measurements: List[MeasurementData],
                             attacked_measurements: List[MeasurementData],
                             original_se_result: Optional[StateEstimationResult] = None,
                             attacked_se_result: Optional[StateEstimationResult] = None) -> ConsequencePrediction:
        n_nodes_orig = len(original_measurements)
        n_nodes_attack = len(attacked_measurements)
        n_nodes = max(n_nodes_orig, n_nodes_attack)

        if original_se_result is None:
            se_orig = WeightedLeastSquaresEstimator(n_nodes=n_nodes_orig)
            original_se_result = se_orig.estimate(original_measurements)

        if attacked_se_result is None:
            se_attack = WeightedLeastSquaresEstimator(n_nodes=n_nodes_attack)
            attacked_se_result = se_attack.estimate(attacked_measurements)

        orig_cost, orig_pg = self.ed_simulator.simulate_dispatch(
            original_measurements, original_se_result
        )
        attack_cost, attack_pg = self.ed_simulator.simulate_dispatch(
            attacked_measurements, attacked_se_result
        )

        cost_change = attack_cost - orig_cost
        redispatch = float(np.sum(np.abs(attack_pg - orig_pg)))

        redispatch_cost = redispatch * self.electricity_price

        orig_demands = np.array([m.active_power for m in original_measurements])
        attack_demands = np.array([m.active_power for m in attacked_measurements])
        demand_shift = np.sum(attack_demands) - np.sum(orig_demands)

        load_shedding = max(0.0, -demand_shift - redispatch * 0.5)

        node_ids = [m.node_id for m in attacked_measurements]
        orig_voltages = np.zeros(len(attacked_measurements))
        attack_voltages = attacked_se_result.voltage_magnitudes

        if len(original_se_result.voltage_magnitudes) >= len(attacked_measurements):
            orig_voltages = original_se_result.voltage_magnitudes[:len(attacked_measurements)]
        else:
            orig_voltages[:len(original_se_result.voltage_magnitudes)] = \
                original_se_result.voltage_magnitudes

        voltage_deviations = np.abs(attack_voltages - orig_voltages)
        max_deviation = float(np.max(voltage_deviations)) if len(voltage_deviations) > 0 else 0.0

        voltage_violations = self.ed_simulator.check_voltage_violations(
            attack_voltages, node_ids
        )

        violation_risk = 0.0
        if voltage_violations:
            max_severity = max(v.severity for v in voltage_violations)
            violation_ratio = len(voltage_violations) / max(len(attacked_measurements), 1)
            violation_risk = min(1.0, 0.5 * max_severity + 0.5 * violation_ratio)

        economic_impact = EconomicImpact(
            generation_cost_change_mw=float(cost_change),
            estimated_cost_change_usd=float(redispatch_cost),
            redispatch_amount_mw=float(redispatch),
            affected_generators=self._find_affected_generators(orig_pg, attack_pg),
            load_shedding_mw=float(load_shedding)
        )

        total_loss = redispatch_cost + load_shedding * self.electricity_price * 10

        vulnerable_nodes = self._identify_vulnerable_nodes(
            voltage_deviations, node_ids, voltage_violations
        )

        risk_level = self._compute_risk_level(violation_risk, total_loss)

        return ConsequencePrediction(
            economic_impact=economic_impact,
            voltage_violations=voltage_violations,
            max_voltage_deviation_pu=max_deviation,
            voltage_violation_risk=float(violation_risk),
            total_economic_loss_usd=float(total_loss),
            risk_level=risk_level,
            vulnerable_nodes=vulnerable_nodes
        )

    def _find_affected_generators(self, orig_pg: np.ndarray,
                                   attack_pg: np.ndarray) -> List[int]:
        diff = np.abs(attack_pg - orig_pg)
        threshold = 0.01 * np.max(orig_pg + 1e-10)
        affected = list(np.where(diff > threshold)[0])
        return affected[:20]

    def _identify_vulnerable_nodes(self, voltage_deviations: np.ndarray,
                                    node_ids: List[int],
                                    violations: List[VoltageViolation]) -> List[int]:
        vulnerable = set()
        for v in violations:
            vulnerable.add(v.node_id)

        if len(voltage_deviations) > 0:
            mean_dev = np.mean(voltage_deviations)
            std_dev = np.std(voltage_deviations) if len(voltage_deviations) > 1 else 0.01
            threshold = mean_dev + 2.0 * max(std_dev, 0.005)
            for i, (dev, nid) in enumerate(zip(voltage_deviations, node_ids)):
                if dev > threshold:
                    vulnerable.add(nid)

        return sorted(vulnerable)[:50]

    def _compute_risk_level(self, violation_risk: float,
                             economic_loss: float) -> str:
        loss_score = min(1.0, economic_loss / 10000.0)
        combined = 0.5 * violation_risk + 0.5 * loss_score

        if combined > 0.7:
            return "critical"
        elif combined > 0.4:
            return "high"
        elif combined > 0.2:
            return "medium"
        else:
            return "low"

    def predict_from_se_results(self,
                                 original_se: StateEstimationResult,
                                 attacked_se: StateEstimationResult,
                                 original_measurements: List[MeasurementData],
                                 attacked_measurements: List[MeasurementData]) -> ConsequencePrediction:
        return self.predict_consequences(
            original_measurements=original_measurements,
            attacked_measurements=attacked_measurements,
            original_se_result=original_se,
            attacked_se_result=attacked_se
        )
