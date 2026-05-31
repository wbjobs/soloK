package com.loganomaly.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "alert_history")
public class AlertHistory {

    @Id
    @Column(length = 64)
    private String alertId;

    @Column(nullable = false, length = 45)
    private String ip;

    @Column(nullable = false, length = 64)
    private String alertType;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false)
    private double observedValue;

    @Column(nullable = false)
    private double expectedValue;

    @Column(nullable = false)
    private double threshold;

    @Column(nullable = false)
    private Instant createdAt;

    public AlertHistory() {}

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

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
