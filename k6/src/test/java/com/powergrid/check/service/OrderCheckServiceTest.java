package com.powergrid.check.service;

import com.powergrid.check.model.dto.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class OrderCheckServiceTest {

    @Autowired
    private OrderCheckService orderCheckService;

    @Test
    void testCheckValidSwitchingOrder() {
        SwitchingOrder order = createValidOrder();
        CheckResult result = orderCheckService.checkSwitchingOrder(order);

        assertNotNull(result);
        assertEquals(order.getOrderId(), result.getOrderId());
        System.out.println("校核结果: valid=" + result.isValid() + ", violations=" + result.getViolations().size());
        result.getViolations().forEach(v -> System.out.println("  违规: " + v.getRule() + " - " + v.getSuggestion()));
    }

    @Test
    void testCheckViolationOrder_LoadSwitching() {
        SwitchingOrder order = createLoadSwitchingViolationOrder();
        CheckResult result = orderCheckService.checkSwitchingOrder(order);

        assertNotNull(result);
        System.out.println("校核结果: valid=" + result.isValid() + ", violations=" + result.getViolations().size());
        result.getViolations().forEach(v -> System.out.println("  违规: " + v.getRule() + " - " + v.getSuggestion()));

        boolean hasLoadViolation = result.getViolations().stream()
                .anyMatch(v -> "防止带负荷拉合隔离开关".equals(v.getRule()));
        assertTrue(hasLoadViolation, "应该检测到带负荷拉刀闸违规");
    }

    @Test
    void testSimulateSwitchingOrder() {
        SwitchingOrder order = createValidOrder();
        SimulationResult result = orderCheckService.simulateSwitchingOrder(order);

        assertNotNull(result);
        assertEquals(order.getOrderId(), result.getOrderId());
        System.out.println("模拟结果: success=" + result.isSuccess());
        result.getSteps().forEach(step -> {
            System.out.println("  步骤" + step.getStepNumber() + ": " + step.getDeviceName()
                    + " " + step.getOperationType() + " -> " + (step.isSuccess() ? "成功" : "失败"));
            if (!step.isSuccess() && step.getViolation() != null) {
                System.out.println("    违规: " + step.getViolation().getRule());
            }
        });
    }

    private SwitchingOrder createValidOrder() {
        SwitchingOrder order = new SwitchingOrder();
        order.setOrderId("ORDER-TEST-001");
        order.setOrderName("主变送电操作票");
        order.setSubstation("TEST_SUB");
        order.setOperator("OP-001");

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

        order.setOperations(operations);
        return order;
    }

    private SwitchingOrder createLoadSwitchingViolationOrder() {
        SwitchingOrder order = new SwitchingOrder();
        order.setOrderId("ORDER-TEST-002");
        order.setOrderName("违规操作票-带负荷拉刀闸");
        order.setSubstation("TEST_SUB");
        order.setOperator("OP-002");

        List<OperationStep> operations = new ArrayList<>();

        OperationStep step1 = new OperationStep();
        step1.setStepNumber(1);
        step1.setDeviceId("DS-101-LINE");
        step1.setDeviceName("110kV进线线路侧刀闸");
        step1.setOperationType(OperationStep.OperationType.OPEN);
        step1.setDeviceType("Disconnector");
        operations.add(step1);

        order.setOperations(operations);
        return order;
    }
}
