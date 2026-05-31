package com.powergrid.check.service;

import com.powergrid.check.model.graph.*;
import com.powergrid.check.repository.PowerDeviceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class TopologyAnalysisService {

    private final PowerDeviceRepository powerDeviceRepository;
    private final DeviceCacheService deviceCacheService;

    private final Map<String, List<String>> substationGroundSwitchCache = new ConcurrentHashMap<>();
    private final Map<String, Long> substationGroundSwitchCacheTime = new ConcurrentHashMap<>();
    private static final long GROUND_SWITCH_CACHE_TTL_MS = 30000;

    public List<PowerDevice> getConnectedDevices(String deviceId) {
        Optional<PowerDevice> deviceOpt = deviceCacheService.getDevice(deviceId);
        if (deviceOpt.isPresent()) {
            PowerDevice device = deviceOpt.get();
            if (device instanceof Breaker && ((Breaker) device).isTieBreaker()) {
                Breaker tieBreaker = (Breaker) device;
                List<String> substations = new ArrayList<>();
                if (tieBreaker.getLeftSideSubstation() != null) {
                    substations.add(tieBreaker.getLeftSideSubstation());
                }
                if (tieBreaker.getRightSideSubstation() != null) {
                    substations.add(tieBreaker.getRightSideSubstation());
                }
                if (!substations.isEmpty()) {
                    return powerDeviceRepository.findConnectedDevicesInSubstations(deviceId, substations);
                }
            }
        }
        return powerDeviceRepository.findConnectedDevices(deviceId);
    }

    public boolean isDeviceEnergized(String deviceId) {
        Optional<PowerDevice> deviceOpt = deviceCacheService.getDevice(deviceId);
        if (!deviceOpt.isPresent()) {
            return false;
        }

        PowerDevice device = deviceOpt.get();
        if (device.isEnergized()) {
            return true;
        }

        if (device instanceof Breaker && ((Breaker) device).isTieBreaker()) {
            Map<String, Object> result = powerDeviceRepository.checkTieBreakerBothSidesEnergized(deviceId);
            if (result != null) {
                boolean leftEnergized = Boolean.TRUE.equals(result.get("leftEnergized"));
                boolean rightEnergized = Boolean.TRUE.equals(result.get("rightEnergized"));
                return leftEnergized || rightEnergized;
            }
        }

        String substation = device.getSubstation();
        return checkEnergizedThroughPath(deviceId, substation, new HashSet<>());
    }

    public Map<String, Boolean> checkTieBreakerBothSides(String breakerId) {
        Map<String, Boolean> result = new HashMap<>();
        result.put("leftEnergized", false);
        result.put("rightEnergized", false);
        result.put("bothSidesEnergized", false);

        Optional<PowerDevice> deviceOpt = deviceCacheService.getDevice(breakerId);
        if (!deviceOpt.isPresent() || !(deviceOpt.get() instanceof Breaker)) {
            return result;
        }

        Breaker breaker = (Breaker) deviceOpt.get();
        if (!breaker.isTieBreaker()) {
            return result;
        }

        Map<String, Object> dbResult = powerDeviceRepository.checkTieBreakerBothSidesEnergized(breakerId);
        if (dbResult != null) {
            boolean leftEnergized = Boolean.TRUE.equals(dbResult.get("leftEnergized"));
            boolean rightEnergized = Boolean.TRUE.equals(dbResult.get("rightEnergized"));
            result.put("leftEnergized", leftEnergized);
            result.put("rightEnergized", rightEnergized);
            result.put("bothSidesEnergized", leftEnergized && rightEnergized);
        }

        return result;
    }

    private boolean checkEnergizedThroughPath(String deviceId, String boundarySubstation, Set<String> visited) {
        if (visited.contains(deviceId)) {
            return false;
        }
        visited.add(deviceId);

        Optional<PowerDevice> deviceOpt = deviceCacheService.getDevice(deviceId);
        if (!deviceOpt.isPresent()) {
            return false;
        }

        PowerDevice device = deviceOpt.get();

        if (!Objects.equals(device.getSubstation(), boundarySubstation)) {
            log.debug("设备[{}]所属变电站[{}]超出边界[{}]，停止遍历",
                    deviceId, device.getSubstation(), boundarySubstation);
            return false;
        }

        if (device.isEnergized()) {
            return true;
        }

        if (device instanceof Breaker && !device.isClosed()) {
            return false;
        }
        if (device instanceof Disconnector && !device.isClosed()) {
            return false;
        }

        List<PowerDevice> connected = getConnectedDevices(deviceId);
        for (PowerDevice conn : connected) {
            if (!visited.contains(conn.getDeviceId())
                    && Objects.equals(conn.getSubstation(), boundarySubstation)) {
                if (checkEnergizedThroughPath(conn.getDeviceId(), boundarySubstation, visited)) {
                    return true;
                }
            }
        }

        return false;
    }

    public boolean hasLoad(String breakerId) {
        Optional<PowerDevice> deviceOpt = deviceCacheService.getDevice(breakerId);
        if (deviceOpt.isPresent() && deviceOpt.get() instanceof Breaker) {
            Breaker breaker = (Breaker) deviceOpt.get();
            return breaker.hasLoadCurrent();
        }
        return false;
    }

    public List<GroundSwitch> getNearbyGroundSwitches(String deviceId) {
        Optional<PowerDevice> deviceOpt = deviceCacheService.getDevice(deviceId);
        if (!deviceOpt.isPresent()) {
            return Collections.emptyList();
        }

        PowerDevice device = deviceOpt.get();
        List<String> substations = getRelevantSubstations(device);

        if (substations.isEmpty()) {
            return Collections.emptyList();
        }

        List<PowerDevice> relevantGroundSwitches = getCachedGroundSwitches(substations);
        List<PowerDevice> connected = getConnectedDevices(deviceId);
        Set<String> connectedIds = connected.stream()
                .map(PowerDevice::getDeviceId)
                .collect(Collectors.toSet());
        connectedIds.add(deviceId);

        List<GroundSwitch> result = new ArrayList<>();
        for (PowerDevice gs : relevantGroundSwitches) {
            if (gs instanceof GroundSwitch && gs.isClosed()) {
                List<PowerDevice> gsConnected = getConnectedDevices(gs.getDeviceId());
                for (PowerDevice gc : gsConnected) {
                    if (connectedIds.contains(gc.getDeviceId())) {
                        result.add((GroundSwitch) gs);
                        break;
                    }
                }
            }
        }

        return result;
    }

    private List<String> getRelevantSubstations(PowerDevice device) {
        List<String> substations = new ArrayList<>();

        if (device instanceof Breaker && ((Breaker) device).isTieBreaker()) {
            Breaker tieBreaker = (Breaker) device;
            if (tieBreaker.getLeftSideSubstation() != null) {
                substations.add(tieBreaker.getLeftSideSubstation());
            }
            if (tieBreaker.getRightSideSubstation() != null) {
                substations.add(tieBreaker.getRightSideSubstation());
            }
        } else if (device.getSubstation() != null) {
            substations.add(device.getSubstation());
        }

        return substations;
    }

    private List<PowerDevice> getCachedGroundSwitches(List<String> substations) {
        String cacheKey = String.join("|", substations);
        long now = System.currentTimeMillis();

        Long cacheTime = substationGroundSwitchCacheTime.get(cacheKey);
        if (cacheTime != null && (now - cacheTime) < GROUND_SWITCH_CACHE_TTL_MS) {
            List<String> cachedIds = substationGroundSwitchCache.get(cacheKey);
            if (cachedIds != null) {
                return powerDeviceRepository.findByDeviceIds(cachedIds);
            }
        }

        List<PowerDevice> groundSwitches;
        if (substations.size() == 1) {
            groundSwitches = powerDeviceRepository.findClosedGroundSwitchesBySubstation(substations.get(0));
        } else {
            groundSwitches = powerDeviceRepository.findClosedGroundSwitchesBySubstations(substations);
        }

        List<String> ids = groundSwitches.stream()
                .map(PowerDevice::getDeviceId)
                .collect(Collectors.toList());
        substationGroundSwitchCache.put(cacheKey, ids);
        substationGroundSwitchCacheTime.put(cacheKey, now);

        log.debug("变电站{}接地刀闸查询缓存已更新，共{}个接地刀闸", substations, groundSwitches.size());

        return groundSwitches;
    }

    public boolean hasGrounding(String deviceId) {
        List<GroundSwitch> groundSwitches = getNearbyGroundSwitches(deviceId);
        return !groundSwitches.isEmpty();
    }

    public PowerDevice getAssociatedBreaker(String disconnectorId) {
        Optional<PowerDevice> deviceOpt = deviceCacheService.getDevice(disconnectorId);
        if (deviceOpt.isPresent() && deviceOpt.get() instanceof Disconnector) {
            Disconnector ds = (Disconnector) deviceOpt.get();
            String breakerId = ds.getAssociatedBreakerId();
            if (breakerId != null) {
                Optional<PowerDevice> breakerOpt = deviceCacheService.getDevice(breakerId);
                return breakerOpt.orElse(null);
            }
        }
        return null;
    }

    public List<Disconnector> getAssociatedDisconnectors(String breakerId) {
        List<PowerDevice> devices = powerDeviceRepository.findDisconnectorsByBreaker(breakerId);
        return devices.stream()
                .filter(d -> d instanceof Disconnector)
                .map(d -> (Disconnector) d)
                .collect(Collectors.toList());
    }

    public Map<String, String> analyzeIntervalStatus(String intervalId) {
        Map<String, String> status = new HashMap<>();
        List<PowerDevice> intervalDevices = findDevicesByInterval(intervalId);

        boolean hasEnergized = false;
        boolean hasGrounded = false;

        for (PowerDevice device : intervalDevices) {
            if (device.isEnergized() || isDeviceEnergized(device.getDeviceId())) {
                hasEnergized = true;
            }
            if (device instanceof GroundSwitch && device.isClosed()) {
                hasGrounded = true;
            }
            status.put(device.getDeviceId(), device.getStatus());
        }

        status.put("intervalEnergized", String.valueOf(hasEnergized));
        status.put("intervalGrounded", String.valueOf(hasGrounded));

        return status;
    }

    private List<PowerDevice> findDevicesByInterval(String intervalId) {
        List<PowerDevice> result = new ArrayList<>();
        List<PowerDevice> connected = getConnectedDevices(intervalId);
        result.addAll(connected);
        return result;
    }

    public Map<String, String> getCurrentStateSnapshot() {
        Map<String, String> snapshot = new HashMap<>();
        Iterable<PowerDevice> allDevices = powerDeviceRepository.findAll();
        for (PowerDevice device : allDevices) {
            snapshot.put(device.getDeviceId(), device.getStatus());
        }
        return snapshot;
    }

    public void updateDeviceStatus(String deviceId, String newStatus) {
        Optional<PowerDevice> deviceOpt = powerDeviceRepository.findByDeviceId(deviceId);
        if (deviceOpt.isPresent()) {
            PowerDevice device = deviceOpt.get();
            device.setStatus(newStatus);
            powerDeviceRepository.save(device);
            deviceCacheService.updateDeviceStatus(deviceId, newStatus);

            Optional<PowerDevice> updatedDevice = deviceCacheService.getDevice(deviceId);
            if (updatedDevice.isPresent()) {
                List<String> substations = getRelevantSubstations(updatedDevice.get());
                for (String substation : substations) {
                    invalidateGroundSwitchCache(substation);
                }
            }

            log.info("设备[{}]状态已更新为: {}", deviceId, newStatus);
        }
    }

    private void invalidateGroundSwitchCache(String substation) {
        Iterator<Map.Entry<String, List<String>>> iterator = substationGroundSwitchCache.entrySet().iterator();
        while (iterator.hasNext()) {
            Map.Entry<String, List<String>> entry = iterator.next();
            if (entry.getKey().contains(substation)) {
                iterator.remove();
                substationGroundSwitchCacheTime.remove(entry.getKey());
            }
        }
    }

    public void virtualUpdateDeviceStatus(Map<String, PowerDevice> virtualState, String deviceId, String newStatus) {
        Optional<PowerDevice> deviceOpt = deviceCacheService.getDevice(deviceId);
        if (deviceOpt.isPresent()) {
            PowerDevice device = deviceOpt.get();
            PowerDevice virtualDevice = cloneDevice(device);
            virtualDevice.setStatus(newStatus);
            virtualState.put(deviceId, virtualDevice);
            log.debug("虚拟操作: 设备[{}]状态更新为: {}", deviceId, newStatus);
        }
    }

    private PowerDevice cloneDevice(PowerDevice device) {
        if (device instanceof Breaker) {
            Breaker clone = new Breaker();
            clone.setId(device.getId());
            clone.setDeviceId(device.getDeviceId());
            clone.setName(device.getName());
            clone.setStatus(device.getStatus());
            clone.setVoltageLevel(device.getVoltageLevel());
            clone.setSubstation(device.getSubstation());
            clone.setHasLoad(((Breaker) device).getHasLoad());
            clone.setIsTieBreaker(((Breaker) device).getIsTieBreaker());
            clone.setLeftSideSubstation(((Breaker) device).getLeftSideSubstation());
            clone.setRightSideSubstation(((Breaker) device).getRightSideSubstation());
            return clone;
        } else if (device instanceof Disconnector) {
            Disconnector clone = new Disconnector();
            clone.setId(device.getId());
            clone.setDeviceId(device.getDeviceId());
            clone.setName(device.getName());
            clone.setStatus(device.getStatus());
            clone.setVoltageLevel(device.getVoltageLevel());
            clone.setSubstation(device.getSubstation());
            clone.setSideType(((Disconnector) device).getSideType());
            clone.setAssociatedBreakerId(((Disconnector) device).getAssociatedBreakerId());
            return clone;
        } else if (device instanceof GroundSwitch) {
            GroundSwitch clone = new GroundSwitch();
            clone.setId(device.getId());
            clone.setDeviceId(device.getDeviceId());
            clone.setName(device.getName());
            clone.setStatus(device.getStatus());
            clone.setVoltageLevel(device.getVoltageLevel());
            clone.setSubstation(device.getSubstation());
            clone.setLocation(((GroundSwitch) device).getLocation());
            clone.setAssociatedDeviceId(((GroundSwitch) device).getAssociatedDeviceId());
            return clone;
        } else if (device instanceof Busbar) {
            Busbar clone = new Busbar();
            clone.setId(device.getId());
            clone.setDeviceId(device.getDeviceId());
            clone.setName(device.getName());
            clone.setStatus(device.getStatus());
            clone.setVoltageLevel(device.getVoltageLevel());
            clone.setSubstation(device.getSubstation());
            clone.setSection(((Busbar) device).getSection());
            clone.setBusType(((Busbar) device).getBusType());
            return clone;
        } else if (device instanceof Line) {
            Line clone = new Line();
            clone.setId(device.getId());
            clone.setDeviceId(device.getDeviceId());
            clone.setName(device.getName());
            clone.setStatus(device.getStatus());
            clone.setVoltageLevel(device.getVoltageLevel());
            clone.setSubstation(device.getSubstation());
            clone.setLineLength(((Line) device).getLineLength());
            clone.setLineCode(((Line) device).getLineCode());
            return clone;
        } else if (device instanceof Transformer) {
            Transformer clone = new Transformer();
            clone.setId(device.getId());
            clone.setDeviceId(device.getDeviceId());
            clone.setName(device.getName());
            clone.setStatus(device.getStatus());
            clone.setVoltageLevel(device.getVoltageLevel());
            clone.setSubstation(device.getSubstation());
            clone.setCapacity(((Transformer) device).getCapacity());
            clone.setWindingType(((Transformer) device).getWindingType());
            return clone;
        }
        return device;
    }

    public void clearGroundSwitchCache() {
        substationGroundSwitchCache.clear();
        substationGroundSwitchCacheTime.clear();
        log.info("接地刀闸缓存已清空");
    }
}
