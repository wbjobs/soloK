package com.powergrid.check.service;

import com.powergrid.check.model.dto.*;
import com.powergrid.check.model.entity.OperationHistory;
import com.powergrid.check.model.graph.PowerDevice;
import com.powergrid.check.repository.OperationHistoryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class OrderCheckService {

    private final RuleEngineService ruleEngineService;
    private final TopologyAnalysisService topologyAnalysisService;
    private final DeviceCacheService deviceCacheService;
    private final DeviceLockService deviceLockService;
    private final OperationHistoryRepository operationHistoryRepository;
    private final EnergizedAreaService energizedAreaService;
    private final RiskAssessmentService riskAssessmentService;

    public CheckResult checkSwitchingOrder(SwitchingOrder order) {
        CheckResult result = new CheckResult();
        result.setValid(true);
        result.setOrderId(order.getOrderId());
        result.setCheckTime(LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));

        log.info("开始校核操作票: {}", order.getOrderId());

        List<OperationStep> operations = order.getOperations();
        if (operations == null || operations.isEmpty()) {
            result.addViolation(new Violation("操作票格式", null, null,
                    "操作序列不能为空", null, "HIGH"));
            return result;
        }

        Collections.sort(operations, Comparator.comparingInt(OperationStep::getStepNumber));

        Map<String, PowerDevice> virtualState = new HashMap<>();
        Map<String, String> previousOperations = new HashMap<>();

        for (int i = 0; i < operations.size(); i++) {
            OperationStep step = operations.get(i);
            log.debug("校核第{}步: {} - {}", step.getStepNumber(),
                    step.getOperationType(), step.getDeviceId());

            Optional<PowerDevice> deviceOpt = deviceCacheService.getDevice(step.getDeviceId());
            if (!deviceOpt.isPresent()) {
                result.addViolation(new Violation("设备不存在", step.getDeviceId(), step.getDeviceName(),
                        "设备ID不存在，请核对设备信息", step.getStepNumber(), "HIGH"));
                continue;
            }

            List<Violation> violations = ruleEngineService.executeRules(
                    step, virtualState, previousOperations, false);

            for (Violation v : violations) {
                result.addViolation(v);
            }

            if (violations.stream().noneMatch(v -> "CRITICAL".equals(v.getSeverity()))) {
                String newStatus = step.getOperationType() == OperationStep.OperationType.CLOSE
                        ? "CLOSED" : "OPEN";
                topologyAnalysisService.virtualUpdateDeviceStatus(virtualState, step.getDeviceId(), newStatus);

                Optional<PowerDevice> device = deviceCacheService.getDevice(step.getDeviceId());
                if (device.isPresent() && device.get() instanceof com.powergrid.check.model.graph.Disconnector) {
                    com.powergrid.check.model.graph.Disconnector ds =
                            (com.powergrid.check.model.graph.Disconnector) device.get();
                    String key = ds.getSideType() + "_" + ds.getAssociatedBreakerId() + "_STEP_" + step.getStepNumber();
                    previousOperations.put(key, step.getOperationType().name());
                }
            }

            saveOperationHistory(order, step, deviceOpt.get(), violations);
        }

        log.info("操作票[{}]校核完成，结果: {}, 违规数: {}",
                order.getOrderId(), result.isValid(), result.getViolations().size());

        try {
            RiskAssessmentResult riskAssessment = riskAssessmentService.assessRisk(order);
            result.setRiskAssessment(riskAssessment);
            log.info("操作票[{}]风险评估完成，风险等级: {}",
                    order.getOrderId(), riskAssessment.getRiskLevelDescription());
        } catch (Exception e) {
            log.warn("操作票[{}]风险评估失败: {}", order.getOrderId(), e.getMessage());
        }

        return result;
    }

    public SimulationResult simulateSwitchingOrder(SwitchingOrder order) {
        SimulationResult result = new SimulationResult();
        result.setOrderId(order.getOrderId());
        result.setSuccess(true);

        log.info("开始模拟预演操作票: {}", order.getOrderId());

        Map<String, PowerDevice> virtualState = new HashMap<>();
        Map<String, String> previousOperations = new HashMap<>();
        Map<String, String> finalState = topologyAnalysisService.getCurrentStateSnapshot();

        List<OperationStep> operations = order.getOperations();
        if (operations != null) {
            Collections.sort(operations, Comparator.comparingInt(OperationStep::getStepNumber));

            for (OperationStep step : operations) {
                SimulationStepResult stepResult = simulateStep(step, virtualState, previousOperations, finalState);
                result.getSteps().add(stepResult);

                if (!stepResult.isSuccess()) {
                    result.setSuccess(false);
                    break;
                }
            }
        }

        result.setFinalState(finalState);

        List<DeviceEnergizedState> finalEnergizedStates = energizedAreaService.calculateAllEnergizedStates(virtualState);
        result.setFinalEnergizedStates(finalEnergizedStates);
        result.setEnergizedSummary(energizedAreaService.calculateEnergizedSummary(finalEnergizedStates));

        result.setSummary(result.isSuccess()
                ? "模拟预演成功，所有操作步骤符合安全规范"
                : "模拟预演失败，存在违规操作");

        try {
            RiskAssessmentResult riskAssessment = riskAssessmentService.assessRisk(order);
            result.setRiskAssessment(riskAssessment);
        } catch (Exception e) {
            log.warn("操作票[{}]风险评估失败: {}", order.getOrderId(), e.getMessage());
        }

        log.info("操作票[{}]模拟预演完成，结果: {}", order.getOrderId(), result.isSuccess());

        return result;
    }

    private SimulationStepResult simulateStep(OperationStep step, Map<String, PowerDevice> virtualState,
                                              Map<String, String> previousOperations, Map<String, String> finalState) {
        SimulationStepResult stepResult = new SimulationStepResult();
        stepResult.setStepNumber(step.getStepNumber());
        stepResult.setDeviceId(step.getDeviceId());
        stepResult.setDeviceName(step.getDeviceName());
        stepResult.setOperationType(step.getOperationType());
        stepResult.setSuccess(true);

        Optional<PowerDevice> deviceOpt = deviceCacheService.getDevice(step.getDeviceId());
        if (!deviceOpt.isPresent()) {
            stepResult.setSuccess(false);
            stepResult.setDescription("设备不存在");
            stepResult.setViolation(new Violation("设备不存在", step.getDeviceId(), step.getDeviceName(),
                    "设备ID不存在", step.getStepNumber(), "HIGH"));
            return stepResult;
        }

        PowerDevice device = deviceOpt.get();
        String oldStatus = finalState.getOrDefault(step.getDeviceId(), device.getStatus());
        stepResult.setStatusBefore(oldStatus);

        List<Violation> violations = ruleEngineService.executeRules(
                step, virtualState, previousOperations, true);

        if (!violations.isEmpty()) {
            stepResult.setSuccess(false);
            stepResult.setViolation(violations.get(0));
            stepResult.setDescription("违规操作: " + violations.get(0).getRule());
            return stepResult;
        }

        String newStatus = step.getOperationType() == OperationStep.OperationType.CLOSE
                ? "CLOSED" : "OPEN";
        stepResult.setStatusAfter(newStatus);
        stepResult.setDescription(String.format("成功%s设备[%s]",
                step.getOperationType() == OperationStep.OperationType.CLOSE ? "合上" : "断开",
                step.getDeviceName()));

        topologyAnalysisService.virtualUpdateDeviceStatus(virtualState, step.getDeviceId(), newStatus);
        finalState.put(step.getDeviceId(), newStatus);

        Map<String, String> affected = analyzeAffectedDevices(step, virtualState);
        stepResult.setAffectedDevices(affected);

        List<DeviceEnergizedState> energizedStates = energizedAreaService.calculateAllEnergizedStates(virtualState);
        stepResult.setEnergizedStates(energizedStates);

        Map<String, Object> energizedSummary = energizedAreaService.calculateStepEnergizedSummary(energizedStates);
        stepResult.setEnergizedSummary(energizedSummary);
        stepResult.setEnergizedDeviceCount(((Number) energizedSummary.get("energizedCount")).intValue());
        stepResult.setDeEnergizedDeviceCount(((Number) energizedSummary.get("deEnergizedCount")).intValue());
        stepResult.setEnergizedLoadMW(((Number) energizedSummary.get("energizedLoadMW")).doubleValue());
        stepResult.setDeEnergizedLoadMW(((Number) energizedSummary.get("deEnergizedLoadMW")).doubleValue());

        if (device instanceof com.powergrid.check.model.graph.Disconnector) {
            com.powergrid.check.model.graph.Disconnector ds =
                    (com.powergrid.check.model.graph.Disconnector) device;
            String key = ds.getSideType() + "_" + ds.getAssociatedBreakerId() + "_STEP_" + step.getStepNumber();
            previousOperations.put(key, step.getOperationType().name());
        }

        return stepResult;
    }

    private Map<String, String> analyzeAffectedDevices(OperationStep step, Map<String, PowerDevice> virtualState) {
        Map<String, String> affected = new HashMap<>();

        List<PowerDevice> connected = topologyAnalysisService.getConnectedDevices(step.getDeviceId());
        for (PowerDevice conn : connected) {
            boolean isEnergized = topologyAnalysisService.isDeviceEnergized(conn.getDeviceId());
            String status = isEnergized ? "ENERGIZED" : "DE_ENERGIZED";
            if (!status.equals(conn.getStatus())) {
                affected.put(conn.getDeviceId(), conn.getName() + ": " + conn.getStatus() + " -> " + status);
            }
        }

        return affected;
    }

    private void saveOperationHistory(SwitchingOrder order, OperationStep step, PowerDevice device,
                                      List<Violation> violations) {
        try {
            OperationHistory history = new OperationHistory();
            history.setOrderId(order.getOrderId());
            history.setDeviceId(step.getDeviceId());
            history.setOperator(order.getOperator());
            history.setOperateTime(LocalDateTime.now());
            history.setOperationType(step.getOperationType().name());
            history.setStatusBefore(device.getStatus());
            history.setStatusAfter(step.getOperationType() == OperationStep.OperationType.CLOSE
                    ? "CLOSED" : "OPEN");
            history.setResult(violations.isEmpty() ? "SUCCESS" : "FAILED");
            history.setHasViolation(!violations.isEmpty());
            history.setViolationRules(violations.stream()
                    .map(Violation::getRule)
                    .collect(Collectors.toList()));

            operationHistoryRepository.save(history);
        } catch (Exception e) {
            log.warn("保存操作历史失败: {}", e.getMessage());
        }
    }
}
