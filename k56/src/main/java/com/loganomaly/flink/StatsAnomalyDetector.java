package com.loganomaly.flink;

import com.loganomaly.model.IpStats;
import com.loganomaly.model.AnomalyAlert;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;

public class StatsAnomalyDetector extends KeyedProcessFunction<String, IpStats, AnomalyAlert> {

    private static final long serialVersionUID = 1L;
    private static final double SIGMA_MULTIPLIER = 2.0;
    private static final int MIN_SAMPLES = 5;

    private transient ValueState<StatsBaseline> baselineState;

    @Override
    public void open(Configuration parameters) {
        ValueStateDescriptor<StatsBaseline> descriptor =
                new ValueStateDescriptor<>("statsBaseline", TypeInformation.of(StatsBaseline.class));
        baselineState = getRuntimeContext().getState(descriptor);
    }

    @Override
    public void processElement(IpStats stats,
                               KeyedProcessFunction<String, IpStats, AnomalyAlert>.Context ctx,
                               Collector<AnomalyAlert> out) throws Exception {
        StatsBaseline baseline = baselineState.value();
        if (baseline == null) {
            baseline = new StatsBaseline();
        }

        baseline.update(stats);

        if (baseline.sampleCount >= MIN_SAMPLES) {
            checkAnomaly(stats, baseline, out);
        }

        baselineState.update(baseline);
    }

    private void checkAnomaly(IpStats stats, StatsBaseline baseline, Collector<AnomalyAlert> out) {
        long now = System.currentTimeMillis();

        if (Math.abs(stats.getRequestCount() - baseline.meanRequestCount) > SIGMA_MULTIPLIER * baseline.stdRequestCount) {
            out.collect(new AnomalyAlert(
                    java.util.UUID.randomUUID().toString(),
                    stats.getIp(),
                    "HIGH_REQUEST_FREQUENCY",
                    String.format("IP %s request count %d deviates from mean %.2f (2σ=%.2f)",
                            stats.getIp(), stats.getRequestCount(), baseline.meanRequestCount,
                            SIGMA_MULTIPLIER * baseline.stdRequestCount),
                    stats.getRequestCount(),
                    baseline.meanRequestCount,
                    SIGMA_MULTIPLIER * baseline.stdRequestCount,
                    now
            ));
        }

        if (baseline.stdErrorRate > 0.001 &&
                Math.abs(stats.getErrorRate() - baseline.meanErrorRate) > SIGMA_MULTIPLIER * baseline.stdErrorRate) {
            out.collect(new AnomalyAlert(
                    java.util.UUID.randomUUID().toString(),
                    stats.getIp(),
                    "ABNORMAL_ERROR_RATE",
                    String.format("IP %s error rate %.4f deviates from mean %.4f (2σ=%.4f)",
                            stats.getIp(), stats.getErrorRate(), baseline.meanErrorRate,
                            SIGMA_MULTIPLIER * baseline.stdErrorRate),
                    stats.getErrorRate(),
                    baseline.meanErrorRate,
                    SIGMA_MULTIPLIER * baseline.stdErrorRate,
                    now
            ));
        }

        if (baseline.stdResponseTime > 0.001 &&
                Math.abs(stats.getAvgResponseTime() - baseline.meanResponseTime) > SIGMA_MULTIPLIER * baseline.stdResponseTime) {
            out.collect(new AnomalyAlert(
                    java.util.UUID.randomUUID().toString(),
                    stats.getIp(),
                    "ABNORMAL_RESPONSE_TIME",
                    String.format("IP %s avg response time %.2f deviates from mean %.2f (2σ=%.2f)",
                            stats.getIp(), stats.getAvgResponseTime(), baseline.meanResponseTime,
                            SIGMA_MULTIPLIER * baseline.stdResponseTime),
                    stats.getAvgResponseTime(),
                    baseline.meanResponseTime,
                    SIGMA_MULTIPLIER * baseline.stdResponseTime,
                    now
            ));
        }
    }

    public static class StatsBaseline {
        public int sampleCount;
        public double meanRequestCount;
        public double meanErrorRate;
        public double meanResponseTime;
        public double m2RequestCount;
        public double m2ErrorRate;
        public double m2ResponseTime;
        public double stdRequestCount;
        public double stdErrorRate;
        public double stdResponseTime;

        public void update(IpStats stats) {
            sampleCount++;
            double n = sampleCount;

            double deltaR = stats.getRequestCount() - meanRequestCount;
            meanRequestCount += deltaR / n;
            m2RequestCount += deltaR * (stats.getRequestCount() - meanRequestCount);
            stdRequestCount = n > 1 ? Math.sqrt(m2RequestCount / (n - 1)) : 0.0;

            double deltaE = stats.getErrorRate() - meanErrorRate;
            meanErrorRate += deltaE / n;
            m2ErrorRate += deltaE * (stats.getErrorRate() - meanErrorRate);
            stdErrorRate = n > 1 ? Math.sqrt(m2ErrorRate / (n - 1)) : 0.0;

            double deltaT = stats.getAvgResponseTime() - meanResponseTime;
            meanResponseTime += deltaT / n;
            m2ResponseTime += deltaT * (stats.getAvgResponseTime() - meanResponseTime);
            stdResponseTime = n > 1 ? Math.sqrt(m2ResponseTime / (n - 1)) : 0.0;
        }
    }
}
