package com.loganomaly.model;

import java.io.Serializable;

public class AnomalyAlert implements Serializable {

    private static final long serialVersionUID = 1L;

    private String alertId;
    private String ip;
    private String alertType;
    private String description;
    private double observedValue;
    private double expectedValue;
    private double threshold;
    private long timestamp;

    public AnomalyAlert() {}

    public AnomalyAlert(String alertId, String ip, String alertType, String description,
                        double observedValue, double expectedValue, double threshold, long timestamp) {
        this.alertId = alertId;
        this.ip = ip;
        this.alertType = alertType;
        this.description = description;
        this.observedValue = observedValue;
        this.expectedValue = expectedValue;
        this.threshold = threshold;
        this.timestamp = timestamp;
    }

    public String getAlertId() { return alertId; }
    public void setAlertId(String alertId) { this.alertId = alertId; }

    public String getIp() { return ip; }
    public void setIp(String ip) { this.ip = ip; }

    public String getAlertType() { return alertType; }
    public void setAlertType(String alertType) { this.alertType = alertType; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public double getObservedValue() { return observedValue; }
    public void setObservedValue(double observedValue) { this.observedValue = observedValue; }

    public double getExpectedValue() { return expectedValue; }
    public void setExpectedValue(double expectedValue) { this.expectedValue = expectedValue; }

    public double getThreshold() { return threshold; }
    public void setThreshold(double threshold) { this.threshold = threshold; }

    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }

    @Override
    public String toString() {
        return "AnomalyAlert{alertId='" + alertId + "', ip='" + ip +
                "', type='" + alertType + "', desc='" + description + "'}";
    }
}
