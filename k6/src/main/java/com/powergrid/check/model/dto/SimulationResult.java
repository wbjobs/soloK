package com.powergrid.check.model.dto;

import lombok.Data;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Data
public class SimulationResult {

    private String orderId;

    private boolean success;

    private List<SimulationStepResult> steps = new ArrayList<>();

    private Map<String, String> finalState;

    private String summary;

    private List<DeviceEnergizedState> finalEnergizedStates;

    private RiskAssessmentResult riskAssessment;

    private Map<String, Object> energizedSummary;
}
