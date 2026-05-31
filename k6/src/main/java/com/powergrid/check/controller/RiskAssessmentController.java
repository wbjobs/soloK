package com.powergrid.check.controller;

import com.powergrid.check.model.dto.*;
import com.powergrid.check.service.EnergizedAreaService;
import com.powergrid.check.service.LoadManagementService;
import com.powergrid.check.service.RiskAssessmentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/risk")
@RequiredArgsConstructor
public class RiskAssessmentController {

    private final RiskAssessmentService riskAssessmentService;
    private final EnergizedAreaService energizedAreaService;
    private final LoadManagementService loadManagementService;

    @PostMapping("/assess")
    public ResponseEntity<RiskAssessmentResult> assessRisk(@RequestBody SwitchingOrder order) {
        log.info("收到操作票[{}]风险评估请求", order.getOrderId());
        RiskAssessmentResult result = riskAssessmentService.assessRisk(order);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/assess/config")
    public ResponseEntity<RiskAssessmentResult> assessRiskWithConfig(
            @RequestBody SwitchingOrder order,
            @RequestParam(required = false, defaultValue = "10000") int iterations,
            @RequestParam(required = false, defaultValue = "0.001") double operatorErrorRate,
            @RequestParam(required = false, defaultValue = "0.0001") double breakerFailureRate,
            @RequestParam(required = false, defaultValue = "true") boolean parallel) {

        log.info("收到操作票[{}]风险评估请求(自定义配置)", order.getOrderId());

        MonteCarloConfig config = new MonteCarloConfig();
        config.setIterations(iterations);
        config.setOperatorErrorRate(operatorErrorRate);
        config.setBreakerFailureRate(breakerFailureRate);
        config.setEnableParallelSimulation(parallel);

        RiskAssessmentResult result = riskAssessmentService.assessRisk(order, config);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/energized-states")
    public ResponseEntity<List<DeviceEnergizedState>> getCurrentEnergizedStates() {
        log.info("查询当前所有设备带电状态");
        List<DeviceEnergizedState> states = energizedAreaService.calculateAllEnergizedStates();
        return ResponseEntity.ok(states);
    }

    @GetMapping("/energized-states/summary")
    public ResponseEntity<Map<String, Object>> getEnergizedSummary() {
        log.info("查询电网带电状态汇总");
        List<DeviceEnergizedState> states = energizedAreaService.calculateAllEnergizedStates();
        Map<String, Object> summary = energizedAreaService.calculateEnergizedSummary(states);
        return ResponseEntity.ok(summary);
    }

    @GetMapping("/dashboard")
    public ResponseEntity<Map<String, Object>> getRiskDashboard() {
        log.info("查询风险仪表盘数据");
        Map<String, Object> dashboard = riskAssessmentService.getRiskDashboard();
        return ResponseEntity.ok(dashboard);
    }

    @GetMapping("/loads")
    public ResponseEntity<List<LoadInfo>> getAllLoads() {
        log.info("查询所有负荷信息");
        return ResponseEntity.ok(loadManagementService.getAllLoads());
    }

    @GetMapping("/loads/substation/{substation}")
    public ResponseEntity<List<LoadInfo>> getLoadsBySubstation(@PathVariable String substation) {
        log.info("查询变电站[{}]的负荷信息", substation);
        return ResponseEntity.ok(loadManagementService.getLoadsBySubstation(substation));
    }

    @GetMapping("/loads/importance/{level}")
    public ResponseEntity<List<LoadInfo>> getLoadsByImportance(@PathVariable String level) {
        log.info("查询重要性等级[{}]的负荷信息", level);
        return ResponseEntity.ok(loadManagementService.getLoadsByImportance(level));
    }

    @PostMapping("/compare")
    public ResponseEntity<Map<String, Object>> compareOperationRisks(@RequestBody List<SwitchingOrder> orders) {
        log.info("比较{}份操作票的风险", orders.size());
        Map<String, Object> comparison = riskAssessmentService.compareOperationRisks(orders);
        return ResponseEntity.ok(comparison);
    }
}
