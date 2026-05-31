package com.powergrid.check.service;

import com.powergrid.check.model.dto.DeviceEnergizedState;
import com.powergrid.check.model.graph.*;
import com.powergrid.check.repository.PowerDeviceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class EnergizedAreaService {

    private final PowerDeviceRepository powerDeviceRepository;
    private final DeviceCacheService deviceCacheService;
    private final LoadManagementService loadManagementService;

    public List<DeviceEnergizedState> calculateAllEnergizedStates() {
        return calculateAllEnergizedStates(new HashMap<>());
    }

    public List<DeviceEnergizedState> calculateAllEnergizedStates(Map<String, PowerDevice> virtualState) {
        List<DeviceEnergizedState> result = new ArrayList<>();
        Iterable<PowerDevice> allDevices = powerDeviceRepository.findAll();

        Set<String> energizedDeviceIds = calculateEnergizedArea(virtualState);

        for (PowerDevice device : allDevices) {
            boolean energized = energizedDeviceIds.contains(device.getDeviceId());
            DeviceEnergizedState state = new DeviceEnergizedState(
                    device.getDeviceId(),
                    device.getName(),
                    getDeviceType(device),
                    energized,
                    device.getVoltageLevel()
            );

            if (device instanceof Load) {
                Load load = (Load) device;
                state.setLoadMW(energized ? load.getCurrentLoadMW() : 0.0);
            }

            result.add(state);
        }

        log.debug("计算带电区域完成，共{}个设备，其中带电{}个", result.size(),
                result.stream().filter(DeviceEnergizedState::isEnergized).count());

        return result;
    }

    public Set<String> calculateEnergizedArea(Map<String, PowerDevice> virtualState) {
        Set<String> energizedSet = new HashSet<>();
        Queue<String> queue = new LinkedList<>();

        Iterable<PowerDevice> allDevices = powerDeviceRepository.findAll();
        for (PowerDevice device : allDevices) {
            if (device instanceof Busbar && "ENERGIZED".equals(device.getStatus())) {
                String deviceId = device.getDeviceId();
                energizedSet.add(deviceId);
                queue.offer(deviceId);
            }
            if (device instanceof Line && "ENERGIZED".equals(device.getStatus())) {
                String deviceId = device.getDeviceId();
                energizedSet.add(deviceId);
                queue.offer(deviceId);
            }
        }

        Map<String, PowerDevice> combinedState = new HashMap<>();
        for (PowerDevice device : allDevices) {
            combinedState.put(device.getDeviceId(), device);
        }
        if (virtualState != null) {
            combinedState.putAll(virtualState);
        }

        Set<String> visited = new HashSet<>();
        while (!queue.isEmpty()) {
            String currentId = queue.poll();
            if (visited.contains(currentId)) continue;
            visited.add(currentId);

            List<PowerDevice> connectedDevices = getConnectedDevices(currentId, combinedState);
            for (PowerDevice conn : connectedDevices) {
                String connId = conn.getDeviceId();
                if (energizedSet.contains(connId)) continue;

                if (isConductive(conn, combinedState)) {
                    energizedSet.add(connId);
                    queue.offer(connId);
                }
            }
        }

        return energizedSet;
    }

    private List<PowerDevice> getConnectedDevices(String deviceId, Map<String, PowerDevice> state) {
        PowerDevice device = state.get(deviceId);
        if (device == null || device.getConnections() == null) {
            return powerDeviceRepository.findConnectedDevices(deviceId);
        }

        List<PowerDevice> connected = new ArrayList<>();
        for (Connection conn : device.getConnections()) {
            PowerDevice target = conn.getTarget();
            if (target != null) {
                connected.add(target);
            }
        }
        return connected;
    }

    private boolean isConductive(PowerDevice device, Map<String, PowerDevice> state) {
        PowerDevice actualDevice = state.getOrDefault(device.getDeviceId(), device);

        if (actualDevice instanceof Breaker) {
            return "CLOSED".equals(actualDevice.getStatus());
        }
        if (actualDevice instanceof Disconnector) {
            return "CLOSED".equals(actualDevice.getStatus());
        }
        if (actualDevice instanceof GroundSwitch) {
            return false;
        }
        return true;
    }

    public Map<String, Object> calculateEnergizedSummary(List<DeviceEnergizedState> states) {
        Map<String, Object> summary = new HashMap<>();

        int energizedCount = 0;
        int deEnergizedCount = 0;
        double energizedLoadMW = 0.0;
        double deEnergizedLoadMW = 0.0;

        Map<String, Integer> voltageLevelStats = new HashMap<>();
        Map<String, Double> voltageLevelLoad = new HashMap<>();

        for (DeviceEnergizedState state : states) {
            if (state.isEnergized()) {
                energizedCount++;
                if (state.getLoadMW() != null) {
                    energizedLoadMW += state.getLoadMW();
                }
            } else {
                deEnergizedCount++;
                if (state.getLoadMW() != null) {
                    deEnergizedLoadMW += state.getLoadMW();
                }
            }

            String vl = state.getVoltageLevel();
            voltageLevelStats.put(vl, voltageLevelStats.getOrDefault(vl, 0) + 1);
            if (state.isEnergized() && state.getLoadMW() != null) {
                voltageLevelLoad.put(vl, voltageLevelLoad.getOrDefault(vl, 0.0) + state.getLoadMW());
            }
        }

        summary.put("totalDevices", energizedCount + deEnergizedCount);
        summary.put("energizedDevices", energizedCount);
        summary.put("deEnergizedDevices", deEnergizedCount);
        summary.put("energizedLoadMW", Math.round(energizedLoadMW * 100.0) / 100.0);
        summary.put("deEnergizedLoadMW", Math.round(deEnergizedLoadMW * 100.0) / 100.0);
        summary.put("voltageLevelStats", voltageLevelStats);
        summary.put("voltageLevelLoadMW", voltageLevelLoad);

        return summary;
    }

    public Map<String, Object> calculateStepEnergizedSummary(List<DeviceEnergizedState> states) {
        Map<String, Object> summary = new HashMap<>();

        int energizedCount = 0;
        int deEnergizedCount = 0;
        double energizedLoadMW = 0.0;
        double deEnergizedLoadMW = 0.0;

        List<Map<String, Object>> energizedDevices = new ArrayList<>();
        List<Map<String, Object>> deEnergizedDevices = new ArrayList<>();

        for (DeviceEnergizedState state : states) {
            Map<String, Object> deviceInfo = new HashMap<>();
            deviceInfo.put("deviceId", state.getDeviceId());
            deviceInfo.put("deviceName", state.getDeviceName());
            deviceInfo.put("color", state.getDisplayColor());
            deviceInfo.put("status", state.getDisplayStatus());
            if (state.getLoadMW() != null) {
                deviceInfo.put("loadMW", state.getLoadMW());
            }

            if (state.isEnergized()) {
                energizedCount++;
                energizedDevices.add(deviceInfo);
                if (state.getLoadMW() != null) {
                    energizedLoadMW += state.getLoadMW();
                }
            } else {
                deEnergizedCount++;
                deEnergizedDevices.add(deviceInfo);
                if (state.getLoadMW() != null) {
                    deEnergizedLoadMW += state.getLoadMW();
                }
            }
        }

        summary.put("energizedCount", energizedCount);
        summary.put("deEnergizedCount", deEnergizedCount);
        summary.put("energizedLoadMW", Math.round(energizedLoadMW * 100.0) / 100.0);
        summary.put("deEnergizedLoadMW", Math.round(deEnergizedLoadMW * 100.0) / 100.0);
        summary.put("energizedDevices", energizedDevices);
        summary.put("deEnergizedDevices", deEnergizedDevices);

        return summary;
    }

    private String getDeviceType(PowerDevice device) {
        if (device instanceof Busbar) return "Busbar";
        if (device instanceof Breaker) return "Breaker";
        if (device instanceof Disconnector) return "Disconnector";
        if (device instanceof GroundSwitch) return "GroundSwitch";
        if (device instanceof Line) return "Line";
        if (device instanceof Transformer) return "Transformer";
        if (device instanceof Load) return "Load";
        return "Unknown";
    }

    public double calculateTotalEnergizedLoad(Map<String, PowerDevice> virtualState) {
        Set<String> energizedArea = calculateEnergizedArea(virtualState);
        double totalLoad = 0.0;

        Iterable<PowerDevice> allDevices = powerDeviceRepository.findAll();
        for (PowerDevice device : allDevices) {
            if (device instanceof Load && energizedArea.contains(device.getDeviceId())) {
                Load load = (Load) device;
                if (load.getCurrentLoadMW() != null) {
                    totalLoad += load.getCurrentLoadMW();
                }
            }
        }

        return totalLoad;
    }

    public List<Load> getAffectedLoads(String operationDeviceId, Map<String, PowerDevice> virtualState) {
        Set<String> energizedBefore = calculateEnergizedArea(virtualState);

        Map<String, PowerDevice> newState = new HashMap<>(virtualState);
        PowerDevice device = newState.get(operationDeviceId);
        if (device != null) {
            PowerDevice modified = cloneDevice(device);
            modified.setStatus(device.getStatus().equals("CLOSED") ? "OPEN" : "CLOSED");
            newState.put(operationDeviceId, modified);
        }

        Set<String> energizedAfter = calculateEnergizedArea(newState);

        List<Load> affectedLoads = new ArrayList<>();
        Iterable<PowerDevice> allDevices = powerDeviceRepository.findAll();
        for (PowerDevice d : allDevices) {
            if (d instanceof Load) {
                Load load = (Load) d;
                boolean wasEnergized = energizedBefore.contains(load.getDeviceId());
                boolean willBeEnergized = energizedAfter.contains(load.getDeviceId());
                if (wasEnergized && !willBeEnergized) {
                    affectedLoads.add(load);
                }
            }
        }

        return affectedLoads;
    }

    private PowerDevice cloneDevice(PowerDevice device) {
        if (device instanceof Breaker) {
            Breaker clone = new Breaker();
            clone.setDeviceId(device.getDeviceId());
            clone.setStatus(device.getStatus());
            return clone;
        }
        return device;
    }
}
