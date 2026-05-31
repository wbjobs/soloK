package com.powergrid.check.model.dto;

import lombok.Data;

@Data
public class DeviceEnergizedState {

    private String deviceId;

    private String deviceName;

    private String deviceType;

    private boolean energized;

    private String displayColor;

    private String displayStatus;

    private String voltageLevel;

    private Double loadMW;

    public DeviceEnergizedState() {
    }

    public DeviceEnergizedState(String deviceId, String deviceName, String deviceType,
                                boolean energized, String voltageLevel) {
        this.deviceId = deviceId;
        this.deviceName = deviceName;
        this.deviceType = deviceType;
        this.energized = energized;
        this.voltageLevel = voltageLevel;
        this.displayColor = energized ? "#FF4444" : "#888888";
        this.displayStatus = energized ? "带电" : "停电";
    }

    public void setEnergized(boolean energized) {
        this.energized = energized;
        this.displayColor = energized ? "#FF4444" : "#888888";
        this.displayStatus = energized ? "带电" : "停电";
    }
}
