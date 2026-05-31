package com.powergrid.check.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceLockService {

    private static final String LOCK_KEY_PREFIX = "device:lock:";
    private static final long DEFAULT_LOCK_EXPIRE_SECONDS = 300;
    private static final String LOCK_RELEASE_SCRIPT =
            "if redis.call('get', KEYS[1]) == ARGV[1] then " +
            "    return redis.call('del', KEYS[1]) " +
            "else " +
            "    return 0 " +
            "end";

    private final RedisTemplate<String, Object> redisTemplate;
    private final Map<String, String> lockHolder = new ConcurrentHashMap<>();

    public boolean tryLock(String deviceId, String operator) {
        return tryLock(deviceId, operator, DEFAULT_LOCK_EXPIRE_SECONDS);
    }

    public boolean tryLock(String deviceId, String operator, long expireSeconds) {
        String lockKey = LOCK_KEY_PREFIX + deviceId;
        String lockValue = operator + ":" + System.currentTimeMillis();

        Boolean success = redisTemplate.opsForValue()
                .setIfAbsent(lockKey, lockValue, expireSeconds, TimeUnit.SECONDS);

        if (Boolean.TRUE.equals(success)) {
            lockHolder.put(deviceId, lockValue);
            log.info("设备[{}]已被[{}]锁定", deviceId, operator);
            return true;
        }

        log.warn("设备[{}]锁定失败，可能已被其他操作占用", deviceId);
        return false;
    }

    public boolean releaseLock(String deviceId, String operator) {
        String lockKey = LOCK_KEY_PREFIX + deviceId;
        String lockValue = lockHolder.get(deviceId);

        if (lockValue == null) {
            log.warn("设备[{}]未持有锁", deviceId);
            return false;
        }

        RedisScript<Long> script = new DefaultRedisScript<>(LOCK_RELEASE_SCRIPT, Long.class);
        Long result = redisTemplate.execute(script, Collections.singletonList(lockKey), lockValue);

        if (result != null && result == 1) {
            lockHolder.remove(deviceId);
            log.info("设备[{}]锁已释放", deviceId);
            return true;
        }

        log.warn("设备[{}]锁释放失败", deviceId);
        return false;
    }

    public boolean isLocked(String deviceId) {
        String lockKey = LOCK_KEY_PREFIX + deviceId;
        return Boolean.TRUE.equals(redisTemplate.hasKey(lockKey));
    }

    public String getLockHolder(String deviceId) {
        String lockKey = LOCK_KEY_PREFIX + deviceId;
        Object value = redisTemplate.opsForValue().get(lockKey);
        return value != null ? value.toString() : null;
    }

    public boolean checkAndLockDevices(java.util.List<String> deviceIds, String operator) {
        for (String deviceId : deviceIds) {
            if (isLocked(deviceId)) {
                log.warn("设备[{}]已被锁定，无法批量锁定", deviceId);
                return false;
            }
        }

        for (String deviceId : deviceIds) {
            if (!tryLock(deviceId, operator)) {
                releaseLocks(deviceIds.subList(0, deviceIds.indexOf(deviceId)), operator);
                return false;
            }
        }

        return true;
    }

    public void releaseLocks(java.util.List<String> deviceIds, String operator) {
        for (String deviceId : deviceIds) {
            releaseLock(deviceId, operator);
        }
    }
}
