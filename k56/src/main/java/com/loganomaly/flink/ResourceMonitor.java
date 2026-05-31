package com.loganomaly.flink;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.OperatingSystemMXBean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

public class ResourceMonitor {

    private static final Logger LOG = LoggerFactory.getLogger(ResourceMonitor.class);

    public enum Mode {
        NORMAL,
        DEGRADED,
        RECOVERING
    }

    private final double cpuThreshold;
    private final double memoryThreshold;
    private final double cpuRecoverThreshold;
    private final double memoryRecoverThreshold;
    private final long checkIntervalMs;
    private final long recoverDurationMs;
    private final int consecutiveHighCountTrigger;
    private final int consecutiveLowCountRecover;

    private final AtomicReference<Mode> currentMode = new AtomicReference<>(Mode.NORMAL);
    private volatile double lastCpuUsage;
    private volatile double lastMemoryUsage;
    private volatile long degradedSince;
    private volatile long recoveringSince;
    private int consecutiveHighCount;
    private int consecutiveLowCount;

    private transient Thread monitorThread;
    private transient OperatingSystemMXBean osBean;
    private transient MemoryMXBean memoryBean;
    private transient Consumer<ResourceMonitor> onStateChange;

    public ResourceMonitor(double cpuThreshold, double memoryThreshold, long checkIntervalMs) {
        this(cpuThreshold, memoryThreshold, checkIntervalMs, null);
    }

    public ResourceMonitor(double cpuThreshold, double memoryThreshold, long checkIntervalMs,
                           Consumer<ResourceMonitor> onStateChange) {
        this.cpuThreshold = cpuThreshold;
        this.memoryThreshold = memoryThreshold;
        this.cpuRecoverThreshold = cpuThreshold * 0.75;
        this.memoryRecoverThreshold = memoryThreshold * 0.75;
        this.checkIntervalMs = checkIntervalMs;
        this.recoverDurationMs = 30000;
        this.consecutiveHighCountTrigger = 3;
        this.consecutiveLowCountRecover = 5;
        this.onStateChange = onStateChange;
    }

    public void start() {
        osBean = ManagementFactory.getOperatingSystemMXBean();
        memoryBean = ManagementFactory.getMemoryMXBean();

        monitorThread = new Thread(this::monitorLoop, "resource-monitor");
        monitorThread.setDaemon(true);
        monitorThread.start();
        LOG.info("ResourceMonitor started: cpuThreshold={}%, memoryThreshold={}%, checkInterval={}ms",
                cpuThreshold * 100, memoryThreshold * 100, checkIntervalMs);
    }

    public void stop() {
        if (monitorThread != null) {
            monitorThread.interrupt();
        }
    }

    private void monitorLoop() {
        while (!Thread.currentThread().isInterrupted()) {
            try {
                sampleMetrics();
                evaluateState();
                Thread.sleep(checkIntervalMs);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                LOG.warn("ResourceMonitor error: {}", e.getMessage());
            }
        }
    }

    private void sampleMetrics() {
        if (osBean instanceof com.sun.management.OperatingSystemMXBean sunOsBean) {
            lastCpuUsage = sunOsBean.getProcessCpuLoad();
            if (lastCpuUsage < 0) {
                lastCpuUsage = 0;
            }
        } else {
            double loadAvg = osBean.getSystemLoadAverage();
            int processors = osBean.getAvailableProcessors();
            lastCpuUsage = processors > 0 ? Math.min(loadAvg / processors, 1.0) : 0;
            if (lastCpuUsage < 0) lastCpuUsage = 0;
        }

        long used = memoryBean.getHeapMemoryUsage().getUsed();
        long max = memoryBean.getHeapMemoryUsage().getMax();
        lastMemoryUsage = max > 0 ? (double) used / max : 0;
    }

    private void evaluateState() {
        boolean cpuHigh = lastCpuUsage > cpuThreshold;
        boolean memHigh = lastMemoryUsage > memoryThreshold;
        boolean cpuLow = lastCpuUsage < cpuRecoverThreshold;
        boolean memLow = lastMemoryUsage < memoryRecoverThreshold;

        Mode mode = currentMode.get();

        switch (mode) {
            case NORMAL -> {
                if (cpuHigh || memHigh) {
                    consecutiveHighCount++;
                    if (consecutiveHighCount >= consecutiveHighCountTrigger) {
                        transitionTo(Mode.DEGRADED);
                        consecutiveHighCount = 0;
                    }
                } else {
                    consecutiveHighCount = 0;
                }
            }
            case DEGRADED -> {
                if (cpuLow && memLow) {
                    consecutiveLowCount++;
                    if (consecutiveLowCount >= consecutiveLowCountRecover) {
                        transitionTo(Mode.RECOVERING);
                        consecutiveLowCount = 0;
                    }
                } else {
                    consecutiveLowCount = 0;
                }
            }
            case RECOVERING -> {
                if (cpuHigh || memHigh) {
                    transitionTo(Mode.DEGRADED);
                } else if (System.currentTimeMillis() - recoveringSince > recoverDurationMs) {
                    transitionTo(Mode.NORMAL);
                }
            }
        }
    }

    private void transitionTo(Mode newMode) {
        Mode oldMode = currentMode.getAndSet(newMode);
        if (oldMode != newMode) {
            long now = System.currentTimeMillis();
            switch (newMode) {
                case DEGRADED -> {
                    degradedSince = now;
                    LOG.warn(">>> DEGRADATION ACTIVATED: cpu={}%, mem={}% — switching to 1/10 sampling",
                            String.format("%.1f", lastCpuUsage * 100), String.format("%.1f", lastMemoryUsage * 100));
                }
                case RECOVERING -> {
                    recoveringSince = now;
                    LOG.info(">>> RECOVERY STARTED: cpu={}%, mem={}% — testing full load",
                            String.format("%.1f", lastCpuUsage * 100), String.format("%.1f", lastMemoryUsage * 100));
                }
                case NORMAL -> {
                    LOG.info(">>> FULLY RECOVERED: cpu={}%, mem={}% — back to normal processing",
                            String.format("%.1f", lastCpuUsage * 100), String.format("%.1f", lastMemoryUsage * 100));
                }
            }
            if (onStateChange != null) {
                try {
                    onStateChange.accept(this);
                } catch (Exception e) {
                    LOG.warn("State change callback failed: {}", e.getMessage());
                }
            }
        }
    }

    public Mode getCurrentMode() {
        return currentMode.get();
    }

    public boolean isDegraded() {
        return currentMode.get() == Mode.DEGRADED;
    }

    public double getLastCpuUsage() {
        return lastCpuUsage;
    }

    public double getLastMemoryUsage() {
        return lastMemoryUsage;
    }

    public long getDegradedSince() {
        return degradedSince;
    }
}
