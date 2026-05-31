package com.loganomaly.model;

import java.io.Serializable;

public class NginxLog implements Serializable {

    private static final long serialVersionUID = 1L;

    private String ip;
    private long timestamp;
    private String url;
    private int statusCode;
    private double responseTime;

    public NginxLog() {}

    public NginxLog(String ip, long timestamp, String url, int statusCode, double responseTime) {
        this.ip = ip;
        this.timestamp = timestamp;
        this.url = url;
        this.statusCode = statusCode;
        this.responseTime = responseTime;
    }

    public String getIp() { return ip; }
    public void setIp(String ip) { this.ip = ip; }

    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }

    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }

    public int getStatusCode() { return statusCode; }
    public void setStatusCode(int statusCode) { this.statusCode = statusCode; }

    public double getResponseTime() { return responseTime; }
    public void setResponseTime(double responseTime) { this.responseTime = responseTime; }

    public boolean isError() {
        return statusCode >= 400;
    }

    @Override
    public String toString() {
        return "NginxLog{ip='" + ip + "', timestamp=" + timestamp +
                ", url='" + url + "', statusCode=" + statusCode +
                ", responseTime=" + responseTime + "}";
    }
}
