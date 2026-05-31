package com.powergrid.check.model.dto;

import lombok.Data;
import java.util.ArrayList;
import java.util.List;

@Data
public class CheckResult {

    private boolean valid;

    private String orderId;

    private List<Violation> violations = new ArrayList<>();

    private String checkTime;

    private RiskAssessmentResult riskAssessment;

    public void addViolation(Violation violation) {
        this.violations.add(violation);
        this.valid = false;
    }
}
