package com.powergrid.check.model.fact;

import com.powergrid.check.model.dto.OperationStep;
import com.powergrid.check.model.dto.Violation;
import com.powergrid.check.model.graph.PowerDevice;
import lombok.Data;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Data
public class OperationContext {

    private OperationStep currentStep;

    private PowerDevice targetDevice;

    private PowerDevice associatedBreaker;

    private List<PowerDevice> connectedDevices = new ArrayList<>();

    private List<PowerDevice> nearbyGroundSwitches = new ArrayList<>();

    private Map<String, PowerDevice> deviceStatusMap = new HashMap<>();

    private Map<String, String> previousOperations = new HashMap<>();

    private boolean hasLoad = false;

    private boolean isEnergized = false;

    private boolean hasGrounding = false;

    private String intervalId;

    private boolean tieBreaker = false;

    private boolean leftSideEnergized = false;

    private boolean rightSideEnergized = false;

    private boolean bothSidesEnergized = false;

    public boolean isTieBreaker() {
        return tieBreaker;
    }

    private List<Violation> violations = new ArrayList<>();

    private boolean simulationMode = false;

    public void addViolation(String rule, String device, String deviceName, String suggestion, String severity) {
        Violation violation = new Violation();
        violation.setRule(rule);
        violation.setDevice(device);
        violation.setDeviceName(deviceName);
        violation.setSuggestion(suggestion);
        violation.setStepNumber(currentStep != null ? currentStep.getStepNumber() : null);
        violation.setSeverity(severity);
        this.violations.add(violation);
    }

    public boolean hasViolations() {
        return !violations.isEmpty();
    }
}
