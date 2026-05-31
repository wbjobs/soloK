package com.loganomaly.flink;

import com.google.gson.Gson;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPoolConfig;

import java.util.LinkedHashMap;
import java.util.Map;

public class DegradationStatusPublisher {

    private static final Logger LOG = LoggerFactory.getLogger(DegradationStatusPublisher.class);
    private static final String STATUS_KEY = "system:degradation";
    private static final String CHANNEL = "degradation-events";

    private final String redisHost;
    private final int redisPort;
    private final Gson gson = new Gson();

    private JedisPool jedisPool;
    private ResourceMonitor.Mode lastPublishedMode = ResourceMonitor.Mode.NORMAL;

    public DegradationStatusPublisher(String redisHost, int redisPort) {
        this.redisHost = redisHost;
        this.redisPort = redisPort;
    }

    public void init() {
        JedisPoolConfig config = new JedisPoolConfig();
        config.setMaxTotal(3);
        config.setMaxIdle(2);
        jedisPool = new JedisPool(config, redisHost, redisPort, 3000);
    }

    public void publishStatus(ResourceMonitor monitor) {
        ResourceMonitor.Mode currentMode = monitor.getCurrentMode();

        if (currentMode != lastPublishedMode || currentMode == ResourceMonitor.Mode.DEGRADED) {
            Map<String, Object> status = new LinkedHashMap<>();
            status.put("mode", currentMode.name());
            status.put("cpuUsage", String.format("%.2f", monitor.getLastCpuUsage() * 100));
            status.put("memoryUsage", String.format("%.2f", monitor.getLastMemoryUsage() * 100));
            status.put("timestamp", System.currentTimeMillis());

            if (currentMode == ResourceMonitor.Mode.DEGRADED) {
                status.put("degradedSince", monitor.getDegradedSince());
                status.put("samplingRatio", "1/10");
            }

            String json = gson.toJson(status);

            try (Jedis jedis = jedisPool.getResource()) {
                jedis.setex(STATUS_KEY, 30, json);
                if (currentMode != lastPublishedMode) {
                    jedis.publish(CHANNEL, json);
                    lastPublishedMode = currentMode;
                }
            } catch (Exception e) {
                LOG.warn("Failed to publish degradation status to Redis: {}", e.getMessage());
            }
        }
    }

    public void close() {
        if (jedisPool != null) {
            jedisPool.close();
        }
    }
}
