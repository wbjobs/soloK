package com.powergrid.check.service;

import com.powergrid.check.model.fact.OperationContext;
import com.powergrid.check.model.dto.OperationStep;
import com.powergrid.check.model.dto.Violation;
import com.powergrid.check.model.graph.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.kie.api.runtime.KieContainer;
import org.kie.api.runtime.KieSession;
import org.springframework.stereotype.Service;

import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class RuleEngineService {

    private final KieContainer kieContainer;
    private final TopologyAnalysisService topologyAnalysisService;
    private final DeviceCacheService deviceCacheService;
    private final DeviceLockService deviceLockService;

    public List<Violation> executeRules(OperationStep step, Map<String, PowerDevice> virtualState,
                                        Map<String, String> previousOperations, boolean simulationMode) {
        OperationContext context = buildContext(step, virtualState, previousOperations, simulationMode);
        return executeRulesWithContext(context);
    }

    public List<Violation> executeRulesWithContext(OperationContext context) {
        KieSession kieSession = kieContainer.newKieSession();
        try {
            kieSession.insert(context);
            int firedRules = kieSession.fireAllRules();
            log.debug("规则引擎执行完成，触发规则数量: {}", firedRules);
            return context.getViolations();
        } finally {
            kieSession.dispose();
        }
    }

    public OperationContext buildContext(OperationStep step, Map<String, PowerDevice> virtualState,
                                          Map<String, String> previousOperations, boolean simulationMode) {
        OperationContext context = new OperationContext();
        context.setCurrentStep(step);
        context.setSimulationMode(simulationMode);

        Optional<PowerDevice> deviceOpt = getDeviceFromState(virtualState, step.getDeviceId());
        if (deviceOpt.isPresent()) {
            PowerDevice device = deviceOpt.get();
            context.setTargetDevice(device);

            context.setEnergized(topologyAnalysisService.isDeviceEnergized(step.getDeviceId()));

            if (device instanceof Disconnector) {
                PowerDevice breaker = topologyAnalysisService.getAssociatedBreaker(step.getDeviceId());
                if (breaker != null) {
                    context.setAssociatedBreaker(breaker);
                    context.setHasLoad(topologyAnalysisService.hasLoad(breaker.getDeviceId()));
                }
            } else if (device instanceof Breaker) {
                context.setHasLoad(topologyAnalysisService.hasLoad(step.getDeviceId()));

                Breaker breaker = (Breaker) device;
                if (breaker.isTieBreaker()) {
                    context.setTieBreaker(true);
                    Map<String, Boolean> tieBreakerStatus = topologyAnalysisService.checkTieBreakerBothSides(step.getDeviceId());
                    context.setLeftSideEnergized(tieBreakerStatus.getOrDefault("leftEnergized", false));
                    context.setRightSideEnergized(tieBreakerStatus.getOrDefault("rightEnergized", false));
                    context.setBothSidesEnergized(tieBreakerStatus.getOrDefault("bothSidesEnergized", false));
                    log.debug("联络断路器[{}]两侧状态: 左侧带电={}, 右侧带电={}, 两侧均带电={}",
                            step.getDeviceId(), context.isLeftSideEnergized(),
                            context.isRightSideEnergized(), context.isBothSidesEnergized());
                }
            }

            List<GroundSwitch> nearbyGroundSwitches = topologyAnalysisService.getNearbyGroundSwitches(step.getDeviceId());
            context.setNearbyGroundSwitches(new ArrayList<>(nearbyGroundSwitches));
            context.setHasGrounding(!nearbyGroundSwitches.isEmpty());

            if (step.getOperationType() == OperationStep.OperationType.CLOSE && !nearbyGroundSwitches.isEmpty()) {
                context.setHasGrounding(true);
            }
        }

        Map<String, PowerDevice> statusMap = new HashMap<>();
        if (!simulationMode) {
            if (deviceLockService.isLocked(step.getDeviceId())) {
                statusMap.put("LOCK_" + step.getDeviceId(), context.getTargetDevice());
            }
        }
        context.setDeviceStatusMap(statusMap);

        if (previousOperations != null) {
            context.setPreviousOperations(previousOperations);
        }

        return context;
    }

    private Optional<PowerDevice> getDeviceFromState(Map<String, PowerDevice> virtualState, String deviceId) {
        if (virtualState != null && virtualState.containsKey(deviceId)) {
            return Optional.of(virtualState.get(deviceId));
        }
        return deviceCacheService.getDevice(deviceId);
    }

    public Map<String, String> buildPreviousOperationsMap(List<OperationStep> completedSteps) {
        Map<String, String> operations = new HashMap<>();

        for (OperationStep step : completedSteps) {
            Optional<PowerDevice> deviceOpt = deviceCacheService.getDevice(step.getDeviceId());
            if (deviceOpt.isPresent()) {
                PowerDevice device = deviceOpt.get();
                if (device instanceof Disconnector) {
                    Disconnector ds = (Disconnector) device;
                    String key = ds.getSideType() + "_" + ds.getAssociatedBreakerId() + "_STEP_" + step.getStepNumber();
                    operations.put(key, step.getOperationType().name());
                }
            }
            operations.put("STEP_" + step.getStepNumber() + "_" + step.getDeviceId(),
                    step.getOperationType().name());
        }

        return operations;
    }
}
