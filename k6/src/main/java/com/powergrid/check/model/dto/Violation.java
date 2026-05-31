package com.powergrid.check.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class Violation {

    private String rule;

    private String device;

    private String deviceName;

    private String suggestion;

    private Integer stepNumber;

    private String severity;
}
