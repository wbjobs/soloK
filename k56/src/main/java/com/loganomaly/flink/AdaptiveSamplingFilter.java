package com.loganomaly.flink;

import com.loganomaly.model.NginxLog;
import org.apache.flink.api.common.functions.RichFilterFunction;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.metrics.Counter;
import org.apache.flink.metrics.Gauge;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.atomic.AtomicLong;

public class AdaptiveSamplingFilter extends RichFilterFunction<NginxLog> {

    private static final Logger LOG = LoggerFactory.getLogger(AdaptiveSamplingFilter.class);

    private final double cpuThreshold;
    private final double memoryThreshold;
    private final long checkIntervalMs;
    private final int samplingRatio;
    private final String redisHost;
    private final int redisPort;

    private transient ResourceMonitor resourceMonitor;
    private transient DegradationStatusPublisher statusPublisher;
    private transient AtomicLong totalRecords;
    private transient AtomicLong passedRecords;
    private transient AtomicLong sampledRecords;
    private transient Counter degradedCounter;

    public AdaptiveSamplingFilter(double cpuThreshold, double memoryThreshold,
                                  long checkIntervalMs, int samplingRatio) {
        this(cpuThreshold, memoryThreshold, checkIntervalMs, samplingRatio, null, 0);
    }

    public AdaptiveSamplingFilter(double cpuThreshold, double memoryThreshold,
                                  long checkIntervalMs, int samplingRatio,
                                  String redisHost, int redisPort) {
        this.cpuThreshold = cpuThreshold;
        this.memoryThreshold = memoryThreshold;
        this.checkIntervalMs = checkIntervalMs;
        this.samplingRatio = samplingRatio;
        this.redisHost = redisHost;
        this.redisPort = redisPort;
    }

    @Override
    public void open(Configuration parameters) {
        totalRecords = new AtomicLong(0);
        passedRecords = new AtomicLong(0);
        sampledRecords = new AtomicLong(0);

        DegradationStatusPublisher publisher = null;
        if (redisHost != null && redisPort > 0) {
            try {
                publisher = new DegradationStatusPublisher(redisHost, redisPort);
                publisher.init();
            } catch (Exception e) {
                LOG.warn("Failed to init DegradationStatusPublisher, status will not be published: {}", e.getMessage());
                publisher = null;
            }
        }
        statusPublisher = publisher;

        resourceMonitor = new ResourceMonitor(cpuThreshold, memoryThreshold, checkIntervalMs,
                publisher != null ? monitor -> publisher.publishStatus(monitor) : null);
        resourceMonitor.start();

        getRuntimeContext().getMetricGroup().addGroup("sampling")
                .gauge("mode", (Gauge<String>) () -> resourceMonitor.getCurrentMode().name());
        getRuntimeContext().getMetricGroup().addGroup("sampling")
                .gauge("cpuUsage", (Gauge<Double>) () -> resourceMonitor.getLastCpuUsage());
        getRuntimeContext().getMetricGroup().addGroup("sampling")
                .gauge("memoryUsage", (Gauge<Double>) () -> resourceMonitor.getLastMemoryUsage());
        getRuntimeContext().getMetricGroup().addGroup("sampling")
                .gauge("totalRecords", (Gauge<Long>) totalRecords::get);
        getRuntimeContext().getMetricGroup().addGroup("sampling")
                .gauge("passedRecords", (Gauge<Long>) passedRecords::get);
        getRuntimeContext().getMetricGroup().addGroup("sampling")
                .gauge("sampledOutRecords", (Gauge<Long>) sampledRecords::get);

        degradedCounter = getRuntimeContext().getMetricGroup()
                .addGroup("sampling").counter("degradedTransitions");

        LOG.info("AdaptiveSamplingFilter initialized: cpuThreshold={}%, memThreshold={}%, " +
                        "checkInterval={}ms, samplingRatio=1/{}, redisPublish={}",
                cpuThreshold * 100, memoryThreshold * 100, checkIntervalMs, samplingRatio,
                publisher != null ? "enabled" : "disabled");
    }

    @Override
    public boolean filter(NginxLog log) {
        totalRecords.incrementAndGet();

        ResourceMonitor.Mode mode = resourceMonitor.getCurrentMode();

        switch (mode) {
            case NORMAL, RECOVERING -> {
                passedRecords.incrementAndGet();
                return true;
            }
            case DEGRADED -> {
                long count = totalRecords.get();
                if (count % samplingRatio == 0) {
                    passedRecords.incrementAndGet();
                    return true;
                } else {
                    sampledRecords.incrementAndGet();
                    return false;
                }
            }
            default -> {
                passedRecords.incrementAndGet();
                return true;
            }
        }
    }

    @Override
    public void close() {
        if (resourceMonitor != null) {
            resourceMonitor.stop();
        }
        if (statusPublisher != null) {
            statusPublisher.close();
        }
        LOG.info("AdaptiveSamplingFilter closed: total={}, passed={}, sampledOut={}",
                totalRecords.get(), passedRecords.get(), sampledRecords.get());
    }
}
