package com.powergrid.check.controller;

import com.powergrid.check.model.entity.OperationHistory;
import com.powergrid.check.model.entity.ViolationCase;
import com.powergrid.check.service.OperationHistoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/history")
@RequiredArgsConstructor
public class HistoryController {

    private final OperationHistoryService historyService;

    @GetMapping("/order/{orderId}")
    public ResponseEntity<List<OperationHistory>> getHistoryByOrderId(@PathVariable String orderId) {
        log.info("查询操作票[{}]的操作历史", orderId);
        return ResponseEntity.ok(historyService.getHistoryByOrderId(orderId));
    }

    @GetMapping("/device/{deviceId}")
    public ResponseEntity<List<OperationHistory>> getHistoryByDeviceId(@PathVariable String deviceId) {
        log.info("查询设备[{}]的操作历史", deviceId);
        return ResponseEntity.ok(historyService.getHistoryByDeviceId(deviceId));
    }

    @GetMapping("/operator/{operator}")
    public ResponseEntity<List<OperationHistory>> getHistoryByOperator(@PathVariable String operator) {
        log.info("查询操作员[{}]的操作历史", operator);
        return ResponseEntity.ok(historyService.getHistoryByOperator(operator));
    }

    @GetMapping("/time-range")
    public ResponseEntity<List<OperationHistory>> getHistoryByTimeRange(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startTime,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endTime) {
        log.info("查询时间范围[{} - {}]的操作历史", startTime, endTime);
        return ResponseEntity.ok(historyService.getHistoryByTimeRange(startTime, endTime));
    }

    @GetMapping("/violations")
    public ResponseEntity<List<OperationHistory>> getViolationHistory() {
        log.info("查询所有违规操作历史");
        return ResponseEntity.ok(historyService.getViolationHistory());
    }
}
