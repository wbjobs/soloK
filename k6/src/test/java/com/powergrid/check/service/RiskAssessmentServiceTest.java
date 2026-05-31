package com.powergrid.check.service;

import com.powergrid.check.model.dto.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class RiskAssessmentServiceTest {

    @Autowired
    private EnergizedAreaService energizedAreaService;

    @Autowired
    private MonteCarloSimulationService monteCarloSimulationService;

    @Autowired
    private RiskAssessmentService riskAssessmentService;

    @Autowired
    private OrderCheckService orderCheckService;

    @Autowired
    private LoadManagementService loadManagementService;

    @Test
    void testGetCurrentEnergizedStates() {
        List<DeviceEnergizedState> states = energizedAreaService.calculateAllEnergizedStates();

        assertNotNull(states);
        assertFalse(states.isEmpty());
        System.out.println("设备带电状态总数: " + states.size());

        long energizedCount = states.stream().filter(DeviceEnergizedState::isEnergized).count();
        long deEnergizedCount = states.size() - energizedCount;

        System.out.println("带电设备数: " + energizedCount + " (红色 #FF4444)");
        System.out.println("停电设备数: " + deEnergizedCount + " (灰色 #888888)");

        states.forEach(state -> {
            System.out.println("  " + state.getDeviceId() + " - " + state.getDeviceName()
                    + " -> " + state.getDisplayStatus() + " [" + state.getDisplayColor() + "]");
        });

        states.forEach(state -> {
            assertNotNull(state.getDeviceId());
            assertNotNull(state.getDisplayColor());
            if (state.isEnergized()) {
                assertEquals("#FF4444", state.getDisplayColor());
                assertEquals("带电", state.getDisplayStatus());
            } else {
                assertEquals("#888888", state.getDisplayColor());
                assertEquals("停电", state.getDisplayStatus());
            }
        });
    }

    @Test
    void testSimulateWithEnergizedStates() {
        SwitchingOrder order = createPowerOnOrder();
        SimulationResult result = orderCheckService.simulateSwitchingOrder(order);

        assertNotNull(result);
        System.out.println("模拟预演结果:");
        System.out.println("  操作票: " + result.getOrderId());
        System.out.println("  成功: " + result.isSuccess());

        result.getSteps().forEach(step -> {
            System.out.println("\n  步骤" + step.getStepNumber() + ": " + step.getDeviceName()
                    + " " + step.getOperationType() + " -> " + (step.isSuccess() ? "成功" : "失败"));

            if (step.getEnergizedStates() != null && !step.getEnergizedStates().isEmpty()) {
                long energizedCount = step.getEnergizedStates().stream()
                        .filter(DeviceEnergizedState::isEnergized).count();
                System.out.println("    带电设备: " + energizedCount + " 台");
                System.out.println("    停电设备: " + (step.getEnergizedStates().size() - energizedCount) + " 台");

                step.getEnergizedStates().stream()
                        .filter(s -> s.getDeviceId().startsWith("LOAD"))
                        .forEach(s -> System.out.println("      " + s.getDeviceName()
                                + " -> " + s.getDisplayStatus() + " [" + s.getDisplayColor() + "]"));
            }
        });

        if (result.getRiskAssessment() != null) {
            RiskAssessmentResult risk = result.getRiskAssessment();
            System.out.println("\n  风险评估结果:");
            System.out.println("    整体风险等级: " + risk.getOverallRiskLevel() + " - " + risk.getRiskLevelDescription());
            System.out.println("    甩负荷概率: " + String.format("%.2f%%", risk.getLoadSheddingProbability() * 100));
            System.out.println("    期望损失电量: " + String.format("%.4f MW·h", risk.getExpectedEnergyLossMWh()));
            System.out.println("    最大潜在损失: " + String.format("%.4f MW·h", risk.getMaxPotentialLossMWh()));
            System.out.println("    仿真迭代次数: " + risk.getSimulationIterations());

            if (risk.getRiskEvents() != null) {
                System.out.println("    风险事件:");
                risk.getRiskEvents().forEach(event ->
                        System.out.println("      - " + event.getDescription()
                                + " (概率: " + String.format("%.2f%%", event.getProbability() * 100)
                                + ", 影响: " + event.getImpactMW() + " MW, 严重度: " + event.getSeverity() + ")"));
            }

            if (risk.getMitigations() != null) {
                System.out.println("    缓解措施:");
                risk.getMitigations().forEach(m -> System.out.println("      [" + m.getPriority() + "] "
                        + m.getSuggestion() + " (降低风险: " + String.format("%.1f%%", m.getRiskReductionPercent()) + ")"));
            }
        }
    }

    @Test
    void testMonteCarloSimulation() {
        SwitchingOrder order = createPowerOnOrder();
        MonteCarloConfig config = new MonteCarloConfig();
        config.setIterations(1000);
        config.setEnableParallelSimulation(false);
        config.setOperatorErrorRate(0.001);
        config.setBreakerFailureRate(0.0001);
        config.setRelayMalfunctionRate(0.0005);

        MonteCarloSimulationService.SimulationResult monteResult = monteCarloSimulationService.runSimulation(order, config);

        assertNotNull(monteResult);
        System.out.println("蒙特卡洛仿真结果:");
        System.out.println("  迭代次数: " + monteResult.totalIterations);
        System.out.println("  执行时间: " + monteResult.simulationTimeMs + " ms");
        System.out.println("  甩负荷概率: " + String.format("%.4f", monteResult.loadSheddingProbability));
        System.out.println("  期望损失电量: " + String.format("%.4f MW·h", monteResult.expectedEnergyLossMWh));
        System.out.println("  甩负荷事件数: " + monteResult.loadSheddingCount);
        System.out.println("  最大损失电量: " + String.format("%.2f MW·h", monteResult.maxEnergyLossMWh));
        System.out.println("  置信区间: ±" + String.format("%.4f", monteResult.confidenceInterval));

        assertTrue(monteResult.loadSheddingProbability >= 0);
        assertTrue(monteResult.loadSheddingProbability <= 1);
        assertTrue(monteResult.expectedEnergyLossMWh >= 0);
    }

    @Test
    void testParallelMonteCarloSimulation() {
        SwitchingOrder order = createPowerOnOrder();
        MonteCarloConfig config = new MonteCarloConfig();
        config.setIterations(2000);
        config.setEnableParallelSimulation(true);
        config.setParallelThreads(4);

        MonteCarloSimulationService.SimulationResult result = monteCarloSimulationService.runSimulation(order, config);

        assertNotNull(result);
        System.out.println("并行蒙特卡洛仿真结果:");
        System.out.println("  迭代次数: " + result.totalIterations);
        System.out.println("  线程数: " + config.getParallelThreads());
        System.out.println("  执行时间: " + result.simulationTimeMs + " ms");
        System.out.println("  甩负荷概率: " + String.format("%.4f", result.loadSheddingProbability));
        System.out.println("  期望损失电量: " + String.format("%.4f MW·h", result.expectedEnergyLossMWh));
    }

    @Test
    void testRiskAssessment() {
        SwitchingOrder order = createPowerOnOrder();
        RiskAssessmentResult result = riskAssessmentService.assessRisk(order);

        assertNotNull(result);
        System.out.println("风险评估结果:");
        System.out.println("  整体风险等级: " + result.getOverallRiskLevel() + " - " + result.getRiskLevelDescription());
        System.out.println("  甩负荷概率: " + String.format("%.2f%%", result.getLoadSheddingProbability() * 100));
        System.out.println("  期望损失电量: " + String.format("%.4f MW·h", result.getExpectedEnergyLossMWh()));

        assertNotNull(result.getRiskLevelDescription());
        assertTrue(result.getLoadSheddingProbability() >= 0);
        assertTrue(result.getExpectedEnergyLossMWh() >= 0);

        List<Double> validLevels = java.util.Arrays.asList(1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
        assertTrue(validLevels.contains(result.getOverallRiskLevel()));
    }

    @Test
    void testLoadManagementService() {
        List<LoadInfo> loads = loadManagementService.getAllLoads();

        assertNotNull(loads);
        assertFalse(loads.isEmpty());
        System.out.println("负荷总数: " + loads.size());

        loads.forEach(load -> {
            System.out.println("  " + load.getDeviceId() + " - " + load.getLoadName()
                    + " | 容量: " + load.getRatedCapacityMW() + " MW"
                    + " | 当前: " + load.getCurrentLoadMW() + " MW"
                    + " | 等级: " + load.getImportanceLevel()
                    + " | 优先级: " + load.getPriority());
            assertNotNull(load.getDeviceId());
            assertNotNull(load.getImportanceLevel());
        });

        List<LoadInfo> criticalLoads = loadManagementService.getLoadsByImportance("CRITICAL");
        System.out.println("重要负荷数: " + criticalLoads.size());
        assertFalse(criticalLoads.isEmpty());

        double totalLoad = loadManagementService.getTotalLoadMW();
        System.out.println("总负荷: " + totalLoad + " MW");
        assertTrue(totalLoad > 0);
    }

    @Test
    void testCheckWithRiskAssessment() {
        SwitchingOrder order = createPowerOnOrder();
        CheckResult result = orderCheckService.checkSwitchingOrder(order);

        assertNotNull(result);
        System.out.println("校核结果 (含风险评估):");
        System.out.println("  合法: " + result.isValid());
        System.out.println("  违规数: " + result.getViolations().size());

        if (result.getRiskAssessment() != null) {
            RiskAssessmentResult risk = result.getRiskAssessment();
            System.out.println("  风险等级: " + risk.getOverallRiskLevel() + " - " + risk.getRiskLevelDescription());
            System.out.println("  甩负荷概率: " + String.format("%.2f%%", risk.getLoadSheddingProbability() * 100));
            System.out.println("  期望损失: " + String.format("%.4f MW·h", risk.getExpectedEnergyLossMWh()));
        }
    }

    private SwitchingOrder createPowerOnOrder() {
        SwitchingOrder order = new SwitchingOrder();
        order.setOrderId("ORDER-RISK-001");
        order.setOrderName("主变及35kV系统送电操作票");
        order.setSubstation("TEST_SUB");
        order.setOperator("OP-003");

        List<OperationStep> operations = new ArrayList<>();

        OperationStep step1 = new OperationStep();
        step1.setStepNumber(1);
        step1.setDeviceId("DS-201-BUS");
        step1.setDeviceName("主变高压侧母线侧刀闸");
        step1.setOperationType(OperationStep.OperationType.CLOSE);
        step1.setDeviceType("Disconnector");
        operations.add(step1);

        OperationStep step2 = new OperationStep();
        step2.setStepNumber(2);
        step2.setDeviceId("DS-201-LINE");
        step2.setDeviceName("主变高压侧线路侧刀闸");
        step2.setOperationType(OperationStep.OperationType.CLOSE);
        step2.setDeviceType("Disconnector");
        operations.add(step2);

        OperationStep step3 = new OperationStep();
        step3.setStepNumber(3);
        step3.setDeviceId("CB-201");
        step3.setDeviceName("主变高压侧断路器");
        step3.setOperationType(OperationStep.OperationType.CLOSE);
        step3.setDeviceType("Breaker");
        operations.add(step3);

        OperationStep step4 = new OperationStep();
        step4.setStepNumber(4);
        step4.setDeviceId("DS-301-LINE");
        step4.setDeviceName("主变低压侧线路侧刀闸");
        step4.setOperationType(OperationStep.OperationType.CLOSE);
        step4.setDeviceType("Disconnector");
        operations.add(step4);

        OperationStep step5 = new OperationStep();
        step5.setStepNumber(5);
        step5.setDeviceId("DS-301-BUS");
        step5.setDeviceName("主变低压侧母线侧刀闸");
        step5.setOperationType(OperationStep.OperationType.CLOSE);
        step5.setDeviceType("Disconnector");
        operations.add(step5);

        OperationStep step6 = new OperationStep();
        step6.setStepNumber(6);
        step6.setDeviceId("CB-301");
        step6.setDeviceName("主变低压侧断路器");
        step6.setOperationType(OperationStep.OperationType.CLOSE);
        step6.setDeviceType("Breaker");
        operations.add(step6);

        OperationStep step7 = new OperationStep();
        step7.setStepNumber(7);
        step7.setDeviceId("DS-302-BUS");
        step7.setDeviceName("35kV馈线母线侧刀闸");
        step7.setOperationType(OperationStep.OperationType.CLOSE);
        step7.setDeviceType("Disconnector");
        operations.add(step7);

        OperationStep step8 = new OperationStep();
        step8.setStepNumber(8);
        step8.setDeviceId("DS-302-LINE");
        step8.setDeviceName("35kV馈线线路侧刀闸");
        step8.setOperationType(OperationStep.OperationType.CLOSE);
        step8.setDeviceType("Disconnector");
        operations.add(step8);

        OperationStep step9 = new OperationStep();
        step9.setStepNumber(9);
        step9.setDeviceId("CB-302");
        step9.setDeviceName("35kV馈线断路器");
        step9.setOperationType(OperationStep.OperationType.CLOSE);
        step9.setDeviceType("Breaker");
        operations.add(step9);

        order.setOperations(operations);
        return order;
    }
}
