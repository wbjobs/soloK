package com.powergrid.check.model.dto;

import lombok.Data;
import java.util.ArrayList;
import java.util.List;

@Data
public class RiskAssessmentResult {

    private String orderId;

    private double overallRiskLevel;

    private String riskLevelDescription;

    private double loadSheddingProbability;

    private double expectedEnergyLossMWh;

    private double maxPotentialLossMWh;

    private int simulationIterations;

    private List<RiskEvent> riskEvents = new ArrayList<>();

    private List<RiskMitigation> mitigations = new ArrayList<>();

    @Data
    public static class RiskEvent {
        private String eventId;
        private String description;
        private double probability;
        private double impactMW;
        private double expectedLossMWh;
        private String severity;
        private String affectedDevices;
    }

    @Data
    public static class RiskMitigation {
        private String suggestion;
        private String priority;
        private double riskReductionPercent;
    }
}
