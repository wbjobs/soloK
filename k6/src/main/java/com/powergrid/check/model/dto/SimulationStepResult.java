package com.powergrid.check.model.dto;

import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
public class SimulationStepResult {

    private int stepNumber;

    private String deviceId;

    private String deviceName;

    private OperationStep.OperationType operationType;

    private boolean success;

    private String statusBefore;

    private String statusAfter;

    private Map<String, String> affectedDevices;

    private String description;

    private Violation violation;

    private List<DeviceEnergizedState> energizedStates;

    private int energizedDeviceCount;

    private int deEnergizedDeviceCount;

    private double energizedLoadMW;

    private double deEnergizedLoadMW;

    private Map<String, Object> energizedSummary;
}
