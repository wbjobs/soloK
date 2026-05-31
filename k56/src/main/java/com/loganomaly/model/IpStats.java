package com.loganomaly.model;

import java.io.Serializable;

public class IpStats implements Serializable {

    private static final long serialVersionUID = 1L;

    private String ip;
    private long windowStart;
    private long windowEnd;
    private long requestCount;
    private double errorRate;
    private double avgResponseTime;

    public IpStats() {}

    public IpStats(String ip, long windowStart, long windowEnd,
                   long requestCount, double errorRate, double avgResponseTime) {
        this.ip = ip;
        this.windowStart = windowStart;
        this.windowEnd = windowEnd;
        this.requestCount = requestCount;
        this.errorRate = errorRate;
        this.avgResponseTime = avgResponseTime;
    }

    public String getIp() { return ip; }
    public void setIp(String ip) { this.ip = ip; }

    public long getWindowStart() { return windowStart; }
    public void setWindowStart(long windowStart) { this.windowStart = windowStart; }

    public long getWindowEnd() { return windowEnd; }
    public void setWindowEnd(long windowEnd) { this.windowEnd = windowEnd; }

    public long getRequestCount() { return requestCount; }
    public void setRequestCount(long requestCount) { this.requestCount = requestCount; }

    public double getErrorRate() { return errorRate; }
    public void setErrorRate(double errorRate) { this.errorRate = errorRate; }

    public double getAvgResponseTime() { return avgResponseTime; }
    public void setAvgResponseTime(double avgResponseTime) { this.avgResponseTime = avgResponseTime; }

    @Override
    public String toString() {
        return "IpStats{ip='" + ip + "', window=[" + windowStart + "," + windowEnd +
                "], requestCount=" + requestCount +
                ", errorRate=" + String.format("%.4f", errorRate) +
                ", avgResponseTime=" + String.format("%.2f", avgResponseTime) + "}";
    }
}
