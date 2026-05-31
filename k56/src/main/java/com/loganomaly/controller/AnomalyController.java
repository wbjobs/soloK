package com.loganomaly.controller;

import com.loganomaly.entity.AlertHistory;
import com.loganomaly.repository.AlertHistoryRepository;
import com.loganomaly.service.StatsQueryService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class AnomalyController {

    @Autowired
    private StatsQueryService statsQueryService;

    @Autowired
    private AlertHistoryRepository alertHistoryRepository;

    @GetMapping("/stats")
    public ResponseEntity<List<Map<String, Object>>> getAllStats() {
        return ResponseEntity.ok(statsQueryService.getAllStats());
    }

    @GetMapping("/stats/{ip}")
    public ResponseEntity<Map<String, Object>> getIpStats(@PathVariable String ip) {
        return ResponseEntity.ok(statsQueryService.getIpStats(ip));
    }

    @GetMapping("/alerts/recent")
    public ResponseEntity<List<Map<String, Object>>> getRecentAlerts(
            @RequestParam(defaultValue = "50") int count) {
        return ResponseEntity.ok(statsQueryService.getRecentAlerts(count));
    }

    @GetMapping("/alerts/history")
    public ResponseEntity<Page<AlertHistory>> getAlertHistory(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(
                alertHistoryRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(page, size)));
    }

    @GetMapping("/alerts/history/ip/{ip}")
    public ResponseEntity<Page<AlertHistory>> getAlertHistoryByIp(
            @PathVariable String ip,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(
                alertHistoryRepository.findByIpOrderByCreatedAtDesc(ip, PageRequest.of(page, size)));
    }

    @GetMapping("/alerts/history/type/{type}")
    public ResponseEntity<Page<AlertHistory>> getAlertHistoryByType(
            @PathVariable String type,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(
                alertHistoryRepository.findByAlertTypeOrderByCreatedAtDesc(type, PageRequest.of(page, size)));
    }

    @GetMapping("/alerts/history/search")
    public ResponseEntity<List<AlertHistory>> searchAlertHistory(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant start,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant end) {
        return ResponseEntity.ok(
                alertHistoryRepository.findByCreatedAtBetweenOrderByCreatedAtDesc(start, end));
    }

    @GetMapping("/dashboard")
    public ResponseEntity<Map<String, Object>> getDashboard() {
        return ResponseEntity.ok(statsQueryService.getDashboardSummary());
    }

    @GetMapping("/system/degradation")
    public ResponseEntity<Map<String, Object>> getDegradationStatus() {
        return ResponseEntity.ok(statsQueryService.getDegradationStatus());
    }
}
