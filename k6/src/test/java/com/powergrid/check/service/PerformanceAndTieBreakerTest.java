package com.powergrid.check.service;

import com.powergrid.check.model.dto.*;
import com.powergrid.check.model.graph.Breaker;
import com.powergrid.check.model.graph.PowerDevice;
import com.powergrid.check.repository.PowerDeviceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class PerformanceAndTieBreakerTest {

    @Autowired
    private TopologyAnalysisService topologyAnalysisService;

    @Autowired
    private OrderCheckService orderCheckService;

    @Autowired
    private PowerDeviceRepository powerDeviceRepository;

    @BeforeEach
    void setUp() {
        topologyAnalysisService.clearGroundSwitchCache();
    }

    @Test
    void testCrossSubstationPerformance() {
        long startTime = System.currentTimeMillis();

        SwitchingOrder order = createCrossSubstationOrder();
        CheckResult result = orderCheckService.checkSwitchingOrder(order);

        long endTime = System.currentTimeMillis();
        long duration = endTime - startTime;

        System.out.println("跨站操作票校核耗时: " + duration + "ms");
        System.out.println("校核结果: valid=" + result.isValid() + ", violations=" + result.getViolations().size());

        assertTrue(duration < 1000, "跨站查询性能应小于1秒，实际耗时: " + duration + "ms");
        assertNotNull(result);
    }

    @Test
    void testMultipleSubstationGroundSwitchQueryPerformance() {
        Optional<PowerDevice> tieBreakerOpt = powerDeviceRepository.findByDeviceId("TIE-101");
        assertTrue(tieBreakerOpt.isPresent(), "联络断路器应存在");

        long startTime = System.currentTimeMillis();

        for (int i = 0; i < 10; i++) {
            topologyAnalysisService.getNearbyGroundSwitches("TIE-101");
        }

        long endTime = System.currentTimeMillis();
        long duration = endTime - startTime;
        double avgDuration = duration / 10.0;

        System.out.println("10次接地刀闸查询总耗时: " + duration + "ms, 平均: " + avgDuration + "ms/次");
        assertTrue(avgDuration < 100, "平均查询时间应小于100ms，实际: " + avgDuration + "ms");
    }

    @Test
    void testSubstationBoundaryInRecursiveTraversal() {
        long startTime = System.currentTimeMillis();

        boolean isEnergized = topologyAnalysisService.isDeviceEnergized("CB-101");

        long endTime = System.currentTimeMillis();
        long duration = endTime - startTime;

        System.out.println("设备带电状态查询耗时: " + duration + "ms, 结果: " + isEnergized);
        assertTrue(duration < 100, "带电状态查询应小于100ms，实际: " + duration + "ms");
    }

    @Test
    void testTieBreakerDetection() {
        Optional<PowerDevice> deviceOpt = powerDeviceRepository.findByDeviceId("TIE-101");
        assertTrue(deviceOpt.isPresent());
        assertTrue(deviceOpt.get() instanceof Breaker);

        Breaker tieBreaker = (Breaker) deviceOpt.get();
        assertTrue(tieBreaker.isTieBreaker(), "TIE-101应被识别为联络断路器");
        assertEquals("TEST_SUB", tieBreaker.getLeftSideSubstation());
        assertEquals("SUB-II", tieBreaker.getRightSideSubstation());
        System.out.println("联络断路器属性验证通过: " + tieBreaker.getDeviceId());
    }

    @Test
    void testTieBreakerBothSidesEnergizedCheck() {
        Optional<PowerDevice> deviceOpt = powerDeviceRepository.findByDeviceId("TIE-101");
        assertTrue(deviceOpt.isPresent());

        Map<String, Boolean> result = topologyAnalysisService.checkTieBreakerBothSides("TIE-101");

        System.out.println("联络断路器两侧状态: " + result);
        assertNotNull(result);
        assertTrue(result.containsKey("leftEnergized"));
        assertTrue(result.containsKey("rightEnergized"));
        assertTrue(result.containsKey("bothSidesEnergized"));

        assertTrue(result.get("leftEnergized"), "左侧TEST_SUB母线带电，左侧应检测为带电");
        assertTrue(result.get("rightEnergized"), "右侧SUB-II母线带电，右侧应检测为带电");
        assertTrue(result.get("bothSidesEnergized"), "两侧均应检测为带电");
    }

    @Test
    void testTieBreakerOperationWithBothSidesEnergized() {
        SwitchingOrder order = createTieBreakerOpenOrder();
        CheckResult result = orderCheckService.checkSwitchingOrder(order);

        System.out.println("联络断路器（两侧均带电）分闸操作校核结果:");
        System.out.println("  valid=" + result.isValid());
        for (Violation v : result.getViolations()) {
            System.out.println("  违规: " + v.getRule() + " - " + v.getDevice() + " - " + v.getSuggestion());
        }

        boolean hasTieBreakerWarning = result.getViolations().stream()
                .anyMatch(v -> "联络断路器操作".equals(v.getRule()));
        assertTrue(hasTieBreakerWarning, "两侧均带电的联络断路器分闸应给出警告，但不应阻止操作");

        boolean hasBlockingViolation = result.getViolations().stream()
                .anyMatch(v -> "CRITICAL".equals(v.getSeverity()) && !"联络断路器操作".equals(v.getRule()));
        assertFalse(hasBlockingViolation, "联络断路器操作不应被误判为CRITICAL级别的违规");
    }

    @Test
    void testTieBreakerOperationSingleSideEnergized() {
        SwitchingOrder order = createTieBreakerCloseOrder();
        CheckResult result = orderCheckService.checkSwitchingOrder(order);

        System.out.println("联络断路器合闸操作校核结果:");
        System.out.println("  valid=" + result.isValid());
        for (Violation v : result.getViolations()) {
            System.out.println("  违规: " + v.getRule() + " - " + v.getDevice() + " - " + v.getSuggestion());
        }

        boolean hasWrongBlocking = result.getViolations().stream()
                .anyMatch(v -> "防止误分合断路器".equals(v.getRule()) && "CRITICAL".equals(v.getSeverity()));
        assertFalse(hasWrongBlocking, "联络断路器不应被误判为不允许操作");
    }

    @Test
    void testNormalBreakerNotAffectedByTieBreakerFix() {
        SwitchingOrder order = createNormalBreakerOrder();
        CheckResult result = orderCheckService.checkSwitchingOrder(order);

        System.out.println("普通断路器操作校核结果:");
        System.out.println("  valid=" + result.isValid());
        for (Violation v : result.getViolations()) {
            System.out.println("  违规: " + v.getRule() + " - " + v.getDevice() + " - " + v.getSuggestion());
        }

        assertNotNull(result);
    }

    @Test
    void testGroundSwitchCachePerformance() {
        long firstQueryStart = System.currentTimeMillis();
        topologyAnalysisService.getNearbyGroundSwitches("CB-101");
        long firstQueryEnd = System.currentTimeMillis();
        long firstDuration = firstQueryEnd - firstQueryStart;

        long secondQueryStart = System.currentTimeMillis();
        topologyAnalysisService.getNearbyGroundSwitches("CB-101");
        long secondQueryEnd = System.currentTimeMillis();
        long secondDuration = secondQueryEnd - secondQueryStart;

        System.out.println("第一次接地刀闸查询: " + firstDuration + "ms");
        System.out.println("第二次接地刀闸查询(缓存): " + secondDuration + "ms");

        assertTrue(secondDuration < firstDuration, "缓存查询应快于首次查询");
    }

    private SwitchingOrder createCrossSubstationOrder() {
        SwitchingOrder order = new SwitchingOrder();
        order.setOrderId("ORDER-CROSS-001");
        order.setOrderName("跨站操作票");
        order.setSubstation("MULTI_SUB");
        order.setOperator("OP-TEST");

        List<OperationStep> operations = new ArrayList<>();

        OperationStep step1 = new OperationStep();
        step1.setStepNumber(1);
        step1.setDeviceId("CB-201");
        step1.setDeviceName("主变高压侧断路器");
        step1.setOperationType(OperationStep.OperationType.CLOSE);
        step1.setDeviceType("Breaker");
        operations.add(step1);

        OperationStep step2 = new OperationStep();
        step2.setStepNumber(2);
        step2.setDeviceId("TIE-101");
        step2.setDeviceName("110kV联络断路器");
        step2.setOperationType(OperationStep.OperationType.CLOSE);
        step2.setDeviceType("Breaker");
        operations.add(step2);

        OperationStep step3 = new OperationStep();
        step3.setStepNumber(3);
        step3.setDeviceId("CB-301");
        step3.setDeviceName("主变低压侧断路器");
        step3.setOperationType(OperationStep.OperationType.CLOSE);
        step3.setDeviceType("Breaker");
        operations.add(step3);

        order.setOperations(operations);
        return order;
    }

    private SwitchingOrder createTieBreakerOpenOrder() {
        SwitchingOrder order = new SwitchingOrder();
        order.setOrderId("ORDER-TIE-OPEN-001");
        order.setOrderName("联络断路器分闸操作");
        order.setOperator("OP-TEST");

        List<OperationStep> operations = new ArrayList<>();

        OperationStep step1 = new OperationStep();
        step1.setStepNumber(1);
        step1.setDeviceId("TIE-101");
        step1.setDeviceName("110kV联络断路器");
        step1.setOperationType(OperationStep.OperationType.OPEN);
        step1.setDeviceType("Breaker");
        operations.add(step1);

        order.setOperations(operations);
        return order;
    }

    private SwitchingOrder createTieBreakerCloseOrder() {
        SwitchingOrder order = new SwitchingOrder();
        order.setOrderId("ORDER-TIE-CLOSE-001");
        order.setOrderName("联络断路器合闸操作");
        order.setOperator("OP-TEST");

        List<OperationStep> operations = new ArrayList<>();

        OperationStep step1 = new OperationStep();
        step1.setStepNumber(1);
        step1.setDeviceId("TIE-101");
        step1.setDeviceName("110kV联络断路器");
        step1.setOperationType(OperationStep.OperationType.CLOSE);
        step1.setDeviceType("Breaker");
        operations.add(step1);

        order.setOperations(operations);
        return order;
    }

    private SwitchingOrder createNormalBreakerOrder() {
        SwitchingOrder order = new SwitchingOrder();
        order.setOrderId("ORDER-NORMAL-001");
        order.setOrderName("普通断路器操作");
        order.setOperator("OP-TEST");

        List<OperationStep> operations = new ArrayList<>();

        OperationStep step1 = new OperationStep();
        step1.setStepNumber(1);
        step1.setDeviceId("CB-302");
        step1.setDeviceName("35kV馈线断路器");
        step1.setOperationType(OperationStep.OperationType.CLOSE);
        step1.setDeviceType("Breaker");
        operations.add(step1);

        order.setOperations(operations);
        return order;
    }
}
