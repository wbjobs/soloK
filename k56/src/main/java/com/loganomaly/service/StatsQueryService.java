package com.loganomaly.service;

import com.google.gson.Gson;
import com.loganomaly.repository.AlertHistoryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.TimeUnit;

@Service
public class StatsQueryService {

    private static final String STATS_KEY_PREFIX = "stats:";
    private static final String STATS_INDEX_KEY = "stats:ips";
    private static final String ALERT_LIST_KEY = "alerts:recent";
    private static final String DEGRADATION_STATUS_KEY = "system:degradation";

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired
    private AlertHistoryRepository alertHistoryRepository;

    private final Gson gson = new Gson();

    public Map<String, Object> getIpStats(String ip) {
        String statsJson = redisTemplate.opsForValue().get(STATS_KEY_PREFIX + ip);
        if (statsJson == null) {
            return Map.of("ip", ip, "status", "no_data");
        }
        Map<String, Object> stats = gson.fromJson(statsJson, Map.class);
        stats.put("status", "active");
        return stats;
    }

    public List<Map<String, Object>> getAllStats() {
        Set<String> ips = redisTemplate.opsForSet().members(STATS_INDEX_KEY);
        if (ips == null || ips.isEmpty()) {
            return Collections.emptyList();
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (String ip : ips) {
            String statsJson = redisTemplate.opsForValue().get(STATS_KEY_PREFIX + ip);
            if (statsJson != null) {
                Map<String, Object> stats = gson.fromJson(statsJson, Map.class);
                result.add(stats);
            }
        }
        return result;
    }

    public List<Map<String, Object>> getRecentAlerts(int count) {
        List<String> alertJsons = redisTemplate.opsForList().range(ALERT_LIST_KEY, 0, count - 1);
        if (alertJsons == null) {
            return Collections.emptyList();
        }
        List<Map<String, Object>> alerts = new ArrayList<>();
        for (String json : alertJsons) {
            alerts.add(gson.fromJson(json, Map.class));
        }
        return alerts;
    }

    public Map<String, Object> getDashboardSummary() {
        Set<String> activeIps = redisTemplate.opsForSet().members(STATS_INDEX_KEY);
        Long alertCount = redisTemplate.opsForList().size(ALERT_LIST_KEY);
        long recentAlertCount = alertHistoryRepository.countByCreatedAtAfter(
                java.time.Instant.now().minusSeconds(300));

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("activeIps", activeIps != null ? activeIps.size() : 0);
        summary.put("recentAlertCount", recentAlertCount);
        summary.put("redisAlertCount", alertCount != null ? alertCount : 0);
        summary.put("timestamp", System.currentTimeMillis());
        return summary;
    }

    public Map<String, Object> getDegradationStatus() {
        String statusJson = redisTemplate.opsForValue().get(DEGRADATION_STATUS_KEY);
        if (statusJson == null) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("mode", "NORMAL");
            result.put("message", "No degradation data available (monitor not yet started or Redis key expired)");
            result.put("timestamp", System.currentTimeMillis());
            return result;
        }
        Map<String, Object> status = gson.fromJson(statusJson, Map.class);
        return status;
    }
}
