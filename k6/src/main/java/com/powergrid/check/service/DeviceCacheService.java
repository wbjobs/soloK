package com.powergrid.check.service;

import com.powergrid.check.model.graph.PowerDevice;
import com.powergrid.check.repository.PowerDeviceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceCacheService {

    private static final String DEVICE_STATUS_KEY = "device:status:";
    private static final String DEVICE_INFO_KEY = "device:info:";
    private static final long CACHE_EXPIRE_HOURS = 24;

    private final RedisTemplate<String, Object> redisTemplate;
    private final PowerDeviceRepository powerDeviceRepository;

    private final Map<String, PowerDevice> localCache = new ConcurrentHashMap<>();

    public Optional<PowerDevice> getDevice(String deviceId) {
        PowerDevice cached = localCache.get(deviceId);
        if (cached != null) {
            return Optional.of(cached);
        }

        Object cachedObj = redisTemplate.opsForValue().get(DEVICE_INFO_KEY + deviceId);
        if (cachedObj instanceof PowerDevice) {
            localCache.put(deviceId, (PowerDevice) cachedObj);
            return Optional.of((PowerDevice) cachedObj);
        }

        Optional<PowerDevice> deviceOpt = powerDeviceRepository.findByDeviceId(deviceId);
        deviceOpt.ifPresent(device -> {
            localCache.put(deviceId, device);
            redisTemplate.opsForValue().set(DEVICE_INFO_KEY + deviceId, device, CACHE_EXPIRE_HOURS, TimeUnit.HOURS);
        });

        return deviceOpt;
    }

    public String getDeviceStatus(String deviceId) {
        Object status = redisTemplate.opsForValue().get(DEVICE_STATUS_KEY + deviceId);
        if (status != null) {
            return status.toString();
        }

        Optional<PowerDevice> deviceOpt = getDevice(deviceId);
        if (deviceOpt.isPresent()) {
            String deviceStatus = deviceOpt.get().getStatus();
            redisTemplate.opsForValue().set(DEVICE_STATUS_KEY + deviceId, deviceStatus, CACHE_EXPIRE_HOURS, TimeUnit.HOURS);
            return deviceStatus;
        }

        return null;
    }

    public void updateDeviceStatus(String deviceId, String newStatus) {
        localCache.remove(deviceId);
        redisTemplate.delete(DEVICE_INFO_KEY + deviceId);
        redisTemplate.opsForValue().set(DEVICE_STATUS_KEY + deviceId, newStatus, CACHE_EXPIRE_HOURS, TimeUnit.HOURS);
    }

    public void refreshDeviceCache(String deviceId) {
        localCache.remove(deviceId);
        redisTemplate.delete(DEVICE_INFO_KEY + deviceId);
        redisTemplate.delete(DEVICE_STATUS_KEY + deviceId);
        getDevice(deviceId);
    }

    public void clearAllCache() {
        localCache.clear();
    }
}
