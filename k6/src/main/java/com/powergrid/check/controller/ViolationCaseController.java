package com.powergrid.check.controller;

import com.powergrid.check.model.entity.ViolationCase;
import com.powergrid.check.service.OperationHistoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@Slf4j
@RestController
@RequestMapping("/api/cases")
@RequiredArgsConstructor
public class ViolationCaseController {

    private final OperationHistoryService caseService;

    @GetMapping
    public ResponseEntity<List<ViolationCase>> getAllCases() {
        log.info("查询所有违规案例");
        return ResponseEntity.ok(caseService.getAllViolationCases());
    }

    @GetMapping("/rule/{ruleName}")
    public ResponseEntity<List<ViolationCase>> getCasesByRule(@PathVariable String ruleName) {
        log.info("按规则[{}]查询违规案例", ruleName);
        return ResponseEntity.ok(caseService.getViolationCasesByRule(ruleName));
    }

    @GetMapping("/severity/{severity}")
    public ResponseEntity<List<ViolationCase>> getCasesBySeverity(@PathVariable String severity) {
        log.info("按严重程度[{}]查询违规案例", severity);
        return ResponseEntity.ok(caseService.getViolationCasesBySeverity(severity));
    }

    @GetMapping("/device-type/{deviceType}")
    public ResponseEntity<List<ViolationCase>> getCasesByDeviceType(@PathVariable String deviceType) {
        log.info("按设备类型[{}]查询违规案例", deviceType);
        return ResponseEntity.ok(caseService.getViolationCasesByDeviceType(deviceType));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ViolationCase> getCaseById(@PathVariable String id) {
        log.info("查询违规案例[{}]", id);
        Optional<ViolationCase> caseOpt = caseService.getViolationCaseById(id);
        return caseOpt.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<ViolationCase> createCase(@RequestBody ViolationCase violationCase) {
        log.info("创建新的违规案例: {}", violationCase.getCaseId());
        ViolationCase saved = caseService.saveViolationCase(violationCase);
        return ResponseEntity.ok(saved);
    }

    @PostMapping("/{id}/increment")
    public ResponseEntity<Void> incrementOccurrence(@PathVariable String id) {
        log.info("增加案例[{}]的发生次数", id);
        caseService.incrementCaseOccurrence(id);
        return ResponseEntity.ok().build();
    }
}
