package com.powergrid.check.model.dto;

import lombok.Data;

@Data
public class OperationStep {

    private String deviceId;

    private String deviceName;

    private OperationType operationType;

    private String deviceType;

    private int stepNumber;

    public enum OperationType {
        CLOSE,
        OPEN
    }
}
