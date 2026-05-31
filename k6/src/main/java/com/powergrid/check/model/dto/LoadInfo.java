package com.powergrid.check.model.dto;

import lombok.Data;

@Data
public class LoadInfo {

    private String deviceId;

    private String loadName;

    private String loadType;

    private double ratedCapacityMW;

    private double currentLoadMW;

    private double loadFactor;

    private String importanceLevel;

    private int priority;

    private String voltageLevel;

    private double outageCostPerMWh;

    private String substation;

    public enum ImportanceLevel {
        CRITICAL,
        HIGH,
        MEDIUM,
        LOW
    }
}
