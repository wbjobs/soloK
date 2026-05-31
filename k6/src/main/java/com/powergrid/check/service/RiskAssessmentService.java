package com.powergrid.check.service;

import com.powergrid.check.model.dto.*;
import com.powergrid.check.model.graph.Load;
import com.powergrid.check.model.graph.PowerDevice;
import com.powergrid.check.repository.PowerDeviceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class RiskAssessmentService {

    private final MonteCarloSimulationService monteCarloService;
    private final EnergizedAreaService energizedAreaService;
    private final LoadManagementService loadManagementService;
    private final PowerDeviceRepository powerDeviceRepository;

    public RiskAssessmentResult assessRisk(SwitchingOrder order) {
        return assessRisk(order, new MonteCarloConfig());
    }

    public RiskAssessmentResult assessRisk(SwitchingOrder order, MonteCarloConfig config) {
        log.info("开始评估操作票[{}]的操作风险", order.getOrderId());

        RiskAssessmentResult result = new RiskAssessmentResult();
        result.setOrderId(order.getOrderId());
        result.setSimulationIterations(config.getIterations());

        MonteCarloSimulationService.SimulationResult simResult = monteCarloService.runSimulation(order, config);

        result.setLoadSheddingProbability(simResult.loadSheddingProbability);
        result.setExpectedEnergyLossMWh(Math.round(simResult.expectedEnergyLossMWh * 100.0) / 100.0);
        result.setMaxPotentialLossMWh(Math.round(simResult.maxEnergyLossMWh * 100.0) / 100.0);

        result.setOverallRiskLevel(calculateOverallRiskLevel(simResult));
        result.setRiskLevelDescription(getRiskLevelDescription(result.getOverallRiskLevel()));

        result.setRiskEvents(identifyRiskEvents(order, simResult));
        result.setMitigations(generateMitigations(result, order));

        log.info("操作票[{}]风险评估完成，风险等级: {}, 甩负荷概率: {:.2f}%, 期望损失电量: {:.2f} MW·h",
                order.getOrderId(),
                result.getRiskLevelDescription(),
                result.getLoadSheddingProbability() * 100,
                result.getExpectedEnergyLossMWh());

        return result;
    }

    private double calculateOverallRiskLevel(MonteCarloSimulationService.SimulationResult simResult) {
        double probabilityScore = simResult.loadSheddingProbability * 100;
        double impactScore = Math.min(simResult.expectedEnergyLossMWh / 100.0, 1.0) * 100;
        return (probabilityScore * 0.4 + impactScore * 0.6);
    }

    private String getRiskLevelDescription(double riskLevel) {
        if (riskLevel < 5) return "低风险";
        if (riskLevel < 20) return "中低风险";
        if (riskLevel < 40) return "中风险";
        if (riskLevel < 60) return "中高风险";
        if (riskLevel < 80) return "高风险";
        return "极高风险";
    }

    private List<RiskAssessmentResult.RiskEvent> identifyRiskEvents(
            SwitchingOrder order, MonteCarloSimulationService.SimulationResult simResult) {

        List<RiskAssessmentResult.RiskEvent> events = new ArrayList<>();

        Map<String, Double> eventProbs = simResult.eventProbabilities;
        Map<String, Integer> eventCounts = simResult.eventCounts;

        if (eventProbs.containsKey("OPERATOR_ERROR")) {
            RiskAssessmentResult.RiskEvent event = new RiskAssessmentResult.RiskEvent();
            event.setEventId("EVT-001");
            event.setDescription("操作人员误操作");
            event.setProbability(eventProbs.get("OPERATOR_ERROR"));
            event.setImpactMW(estimateImpactMW(order, "OPERATOR_ERROR"));
            event.setExpectedLossMWh(event.getProbability() * event.getImpactMW() * 4.0);
            event.setSeverity(getSeverity(event.getProbability(), event.getImpactMW()));
            event.setAffectedDevices(getAffectedDevicesDescription(order));
            events.add(event);
        }

        if (eventProbs.containsKey("BREAKER_FAILURE")) {
            RiskAssessmentResult.RiskEvent event = new RiskAssessmentResult.RiskEvent();
            event.setEventId("EVT-002");
            event.setDescription("断路器拒动或误动");
            event.setProbability(eventProbs.get("BREAKER_FAILURE"));
            event.setImpactMW(estimateImpactMW(order, "BREAKER_FAILURE"));
            event.setExpectedLossMWh(event.getProbability() * event.getImpactMW() * 4.0);
            event.setSeverity(getSeverity(event.getProbability(), event.getImpactMW()));
            event.setAffectedDevices(getAffectedDevicesDescription(order));
            events.add(event);
        }

        if (eventProbs.containsKey("RELAY_MALFUNCTION")) {
            RiskAssessmentResult.RiskEvent event = new RiskAssessmentResult.RiskEvent();
            event.setEventId("EVT-003");
            event.setDescription("继电保护装置误动或拒动");
            event.setProbability(eventProbs.get("RELAY_MALFUNCTION"));
            event.setImpactMW(estimateImpactMW(order, "RELAY_MALFUNCTION"));
            event.setExpectedLossMWh(event.getProbability() * event.getImpactMW() * 4.0);
            event.setSeverity(getSeverity(event.getProbability(), event.getImpactMW()));
            event.setAffectedDevices(getAffectedDevicesDescription(order));
            events.add(event);
        }

        if (eventProbs.containsKey("CASCADING_FAILURE")) {
            RiskAssessmentResult.RiskEvent event = new RiskAssessmentResult.RiskEvent();
            event.setEventId("EVT-004");
            event.setDescription("连锁故障扩大停电范围");
            event.setProbability(eventProbs.get("CASCADING_FAILURE"));
            event.setImpactMW(estimateImpactMW(order, "CASCADING_FAILURE") * 1.5);
            event.setExpectedLossMWh(event.getProbability() * event.getImpactMW() * 6.0);
            event.setSeverity("CRITICAL");
            event.setAffectedDevices("可能影响多个变电站");
            events.add(event);
        }

        if (simResult.loadSheddingCount > 0) {
            RiskAssessmentResult.RiskEvent event = new RiskAssessmentResult.RiskEvent();
            event.setEventId("EVT-005");
            event.setDescription("误操作导致甩负荷");
            event.setProbability(simResult.loadSheddingProbability);
            event.setImpactMW(simResult.maxEnergyLossMWh / 4.0);
            event.setExpectedLossMWh(simResult.expectedEnergyLossMWh);
            event.setSeverity(getSeverity(event.getProbability(), event.getImpactMW()));
            event.setAffectedDevices(getLoadDevicesDescription());
            events.add(event);
        }

        events.sort((a, b) -> Double.compare(b.getExpectedLossMWh(), a.getExpectedLossMWh()));

        return events;
    }

    private double estimateImpactMW(SwitchingOrder order, String eventType) {
        double totalLoad = loadManagementService.getTotalLoadMW();

        switch (eventType) {
            case "OPERATOR_ERROR":
                return totalLoad * 0.3;
            case "BREAKER_FAILURE":
                return totalLoad * 0.2;
            case "RELAY_MALFUNCTION":
                return totalLoad * 0.5;
            case "CASCADING_FAILURE":
                return totalLoad * 0.8;
            default:
                return totalLoad * 0.1;
        }
    }

    private String getSeverity(double probability, double impactMW) {
        double riskScore = probability * impactMW;

        if (riskScore > 10 || probability > 0.1 || impactMW > 100) return "CRITICAL";
        if (riskScore > 5 || probability > 0.05 || impactMW > 50) return "HIGH";
        if (riskScore > 1 || probability > 0.01 || impactMW > 10) return "MEDIUM";
        return "LOW";
    }

    private String getAffectedDevicesDescription(SwitchingOrder order) {
        if (order.getOperations() == null) return "";
        return order.getOperations().stream()
                .map(OperationStep::getDeviceName)
                .collect(Collectors.joining("、"));
    }

    private String getLoadDevicesDescription() {
        List<LoadInfo> loads = loadManagementService.getAllLoads();
        return loads.stream()
                .limit(5)
                .map(LoadInfo::getLoadName)
                .collect(Collectors.joining("、"))
                + (loads.size() > 5 ? "等" + loads.size() + "个负荷" : "");
    }

    private List<RiskAssessmentResult.RiskMitigation> generateMitigations(
            RiskAssessmentResult result, SwitchingOrder order) {

        List<RiskAssessmentResult.RiskMitigation> mitigations = new ArrayList<>();

        double riskLevel = result.getOverallRiskLevel();

        if (riskLevel >= 40) {
            RiskAssessmentResult.RiskMitigation m1 = new RiskAssessmentResult.RiskMitigation();
            m1.setSuggestion("建议重新编制操作票，优化操作顺序，降低操作复杂度");
            m1.setPriority("HIGH");
            m1.setRiskReductionPercent(30.0);
            mitigations.add(m1);
        }

        if (result.getLoadSheddingProbability() > 0.01) {
            RiskAssessmentResult.RiskMitigation m2 = new RiskAssessmentResult.RiskMitigation();
            m2.setSuggestion("操作前进行完整模拟预演，确认每一步操作的正确性");
            m2.setPriority("HIGH");
            m2.setRiskReductionPercent(25.0);
            mitigations.add(m2);
        }

        RiskAssessmentResult.RiskMitigation m3 = new RiskAssessmentResult.RiskMitigation();
        m3.setSuggestion("安排经验丰富的运行人员执行操作，设置专职监护人员");
        m3.setPriority("MEDIUM");
        m3.setRiskReductionPercent(20.0);
        mitigations.add(m3);

        RiskAssessmentResult.RiskMitigation m4 = new RiskAssessmentResult.RiskMitigation();
        m4.setSuggestion("操作前检查设备状态，确认继电保护装置整定值正确");
        m4.setPriority("MEDIUM");
        m4.setRiskReductionPercent(15.0);
        mitigations.add(m4);

        RiskAssessmentResult.RiskMitigation m5 = new RiskAssessmentResult.RiskMitigation();
        m5.setSuggestion("准备应急处置预案，一旦发生误操作能及时隔离故障");
        m5.setPriority("MEDIUM");
        m5.setRiskReductionPercent(10.0);
        mitigations.add(m5);

        return mitigations;
    }

    public Map<String, Object> getRiskDashboard() {
        Map<String, Object> dashboard = new HashMap<>();

        double totalLoad = loadManagementService.getTotalLoadMW();
        dashboard.put("totalSystemLoadMW", Math.round(totalLoad * 100.0) / 100.0);

        Map<String, Double> loadByPriority = new HashMap<>();
        loadByPriority.put("CRITICAL",
                loadManagementService.getLoadsByImportance("CRITICAL").stream()
                        .mapToDouble(LoadInfo::getCurrentLoadMW).sum());
        loadByPriority.put("HIGH",
                loadManagementService.getLoadsByImportance("HIGH").stream()
                        .mapToDouble(LoadInfo::getCurrentLoadMW).sum());
        loadByPriority.put("MEDIUM",
                loadManagementService.getLoadsByImportance("MEDIUM").stream()
                        .mapToDouble(LoadInfo::getCurrentLoadMW).sum());
        loadByPriority.put("LOW",
                loadManagementService.getLoadsByImportance("LOW").stream()
                        .mapToDouble(LoadInfo::getCurrentLoadMW).sum());
        dashboard.put("loadByPriorityMW", loadByPriority);

        Map<String, Double> failureRates = new HashMap<>();
        failureRates.put("operatorError", 0.001);
        failureRates.put("breakerFailure", 0.0001);
        failureRates.put("relayMalfunction", 0.0005);
        dashboard.put("equipmentFailureRates", failureRates);

        long deviceCount = powerDeviceRepository.count();
        dashboard.put("totalDevices", deviceCount);

        List<LoadInfo> allLoads = loadManagementService.getAllLoads();
        dashboard.put("totalLoads", allLoads.size());

        Map<String, Long> deviceTypeCounts = new HashMap<>();
        Iterable<PowerDevice> allDevices = powerDeviceRepository.findAll();
        for (PowerDevice d : allDevices) {
            String type = d.getClass().getSimpleName();
            deviceTypeCounts.merge(type, 1L, Long::sum);
        }
        dashboard.put("deviceTypeCounts", deviceTypeCounts);

        return dashboard;
    }

    public Map<String, Object> compareOperationRisks(List<SwitchingOrder> orders) {
        Map<String, Object> comparison = new HashMap<>();
        List<Map<String, Object>> results = new ArrayList<>();

        for (SwitchingOrder order : orders) {
            RiskAssessmentResult risk = assessRisk(order);
            Map<String, Object> item = new HashMap<>();
            item.put("orderId", order.getOrderId());
            item.put("orderName", order.getOrderName());
            item.put("overallRiskLevel", risk.getOverallRiskLevel());
            item.put("riskLevelDescription", risk.getRiskLevelDescription());
            item.put("loadSheddingProbability", risk.getLoadSheddingProbability());
            item.put("expectedEnergyLossMWh", risk.getExpectedEnergyLossMWh());
            results.add(item);
        }

        results.sort((a, b) ->
                Double.compare((Double) a.get("overallRiskLevel"), (Double) b.get("overallRiskLevel")));

        comparison.put("recommendedOrderIndex", 0);
        comparison.put("riskComparison", results);

        return comparison;
    }
}
