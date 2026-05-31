package com.powergrid.check.controller;

import com.powergrid.check.model.dto.CheckResult;
import com.powergrid.check.model.dto.SimulationResult;
import com.powergrid.check.model.dto.SwitchingOrder;
import com.powergrid.check.service.OrderCheckService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class SwitchingOrderController {

    private final OrderCheckService orderCheckService;

    @PostMapping("/check")
    public ResponseEntity<CheckResult> checkSwitchingOrder(@RequestBody SwitchingOrder order) {
        log.info("收到操作票校核请求: {}", order.getOrderId());

        CheckResult result = orderCheckService.checkSwitchingOrder(order);

        log.info("操作票[{}]校核完成, valid={}, violations={}",
                order.getOrderId(), result.isValid(), result.getViolations().size());

        return ResponseEntity.ok(result);
    }

    @PostMapping("/simulate")
    public ResponseEntity<SimulationResult> simulateSwitchingOrder(@RequestBody SwitchingOrder order) {
        log.info("收到操作票模拟预演请求: {}", order.getOrderId());

        SimulationResult result = orderCheckService.simulateSwitchingOrder(order);

        log.info("操作票[{}]模拟预演完成, success={}", order.getOrderId(), result.isSuccess());

        return ResponseEntity.ok(result);
    }
}
