package com.powergrid.check.service;

import com.powergrid.check.model.dto.LoadInfo;
import com.powergrid.check.model.graph.Load;
import com.powergrid.check.repository.PowerDeviceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class LoadManagementService {

    private final PowerDeviceRepository powerDeviceRepository;
    private final DeviceCacheService deviceCacheService;

    private final Map<String, LoadInfo> loadInfoCache = new ConcurrentHashMap<>();

    public LoadInfo getLoadInfo(String deviceId) {
        LoadInfo cached = loadInfoCache.get(deviceId);
        if (cached != null) {
            return cached;
        }

        Optional<Load> loadOpt = getLoadDevice(deviceId);
        if (loadOpt.isPresent()) {
            Load load = loadOpt.get();
            LoadInfo info = convertToLoadInfo(load);
            loadInfoCache.put(deviceId, info);
            return info;
        }

        return null;
    }

    public List<LoadInfo> getAllLoads() {
        List<LoadInfo> result = new ArrayList<>();
        Iterable<com.powergrid.check.model.graph.PowerDevice> allDevices = powerDeviceRepository.findAll();
        for (com.powergrid.check.model.graph.PowerDevice device : allDevices) {
            if (device instanceof Load) {
                result.add(convertToLoadInfo((Load) device));
            }
        }
        return result;
    }

    public List<LoadInfo> getLoadsBySubstation(String substation) {
        List<LoadInfo> result = new ArrayList<>();
        Iterable<com.powergrid.check.model.graph.PowerDevice> allDevices = powerDeviceRepository.findAll();
        for (com.powergrid.check.model.graph.PowerDevice device : allDevices) {
            if (device instanceof Load && substation.equals(device.getSubstation())) {
                result.add(convertToLoadInfo((Load) device));
            }
        }
        return result;
    }

    public List<LoadInfo> getLoadsByImportance(String importanceLevel) {
        List<LoadInfo> result = new ArrayList<>();
        Iterable<com.powergrid.check.model.graph.PowerDevice> allDevices = powerDeviceRepository.findAll();
        for (com.powergrid.check.model.graph.PowerDevice device : allDevices) {
            if (device instanceof Load && importanceLevel.equals(((Load) device).getImportanceLevel())) {
                result.add(convertToLoadInfo((Load) device));
            }
        }
        return result;
    }

    public double getTotalLoadMW() {
        return getAllLoads().stream()
                .mapToDouble(LoadInfo::getCurrentLoadMW)
                .sum();
    }

    public double getTotalLoadMWBySubstation(String substation) {
        return getLoadsBySubstation(substation).stream()
                .mapToDouble(LoadInfo::getCurrentLoadMW)
                .sum();
    }

    public Map<String, Double> calculateLoadLossByPriority(List<String> lostDeviceIds) {
        Map<String, Double> lossByPriority = new HashMap<>();
        lossByPriority.put("CRITICAL", 0.0);
        lossByPriority.put("HIGH", 0.0);
        lossByPriority.put("MEDIUM", 0.0);
        lossByPriority.put("LOW", 0.0);

        for (String deviceId : lostDeviceIds) {
            LoadInfo load = getLoadInfo(deviceId);
            if (load != null) {
                String priority = load.getImportanceLevel();
                double current = lossByPriority.getOrDefault(priority, 0.0);
                lossByPriority.put(priority, current + load.getCurrentLoadMW());
            }
        }

        return lossByPriority;
    }

    public double calculateExpectedOutageCost(double energyLossMWh, String importanceLevel) {
        double costPerMWh = getOutageCostByImportance(importanceLevel);
        return energyLossMWh * costPerMWh;
    }

    private double getOutageCostByImportance(String importanceLevel) {
        switch (importanceLevel) {
            case "CRITICAL": return 10000.0;
            case "HIGH": return 5000.0;
            case "MEDIUM": return 1000.0;
            case "LOW": return 200.0;
            default: return 1000.0;
        }
    }

    private Optional<Load> getLoadDevice(String deviceId) {
        Optional<com.powergrid.check.model.graph.PowerDevice> deviceOpt = deviceCacheService.getDevice(deviceId);
        if (deviceOpt.isPresent() && deviceOpt.get() instanceof Load) {
            return Optional.of((Load) deviceOpt.get());
        }
        return Optional.empty();
    }

    private LoadInfo convertToLoadInfo(Load load) {
        LoadInfo info = new LoadInfo();
        info.setDeviceId(load.getDeviceId());
        info.setLoadName(load.getName());
        info.setLoadType(load.getLoadType());
        info.setRatedCapacityMW(load.getRatedCapacityMW() != null ? load.getRatedCapacityMW() : 0.0);
        info.setCurrentLoadMW(load.getCurrentLoadMW() != null ? load.getCurrentLoadMW() : 0.0);
        info.setLoadFactor(load.getLoadFactor() != null ? load.getLoadFactor() : 0.0);
        info.setImportanceLevel(load.getImportanceLevel());
        info.setPriority(load.getPriority() != null ? load.getPriority() : 0);
        info.setVoltageLevel(load.getVoltageLevel());
        info.setOutageCostPerMWh(load.getOutageCostPerMWh() != null ? load.getOutageCostPerMWh() : 1000.0);
        info.setSubstation(load.getSubstation());
        return info;
    }

    public void clearCache() {
        loadInfoCache.clear();
        log.info("负荷信息缓存已清空");
    }
}
