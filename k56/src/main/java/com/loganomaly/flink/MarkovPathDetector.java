package com.loganomaly.flink;

import com.loganomaly.model.AnomalyAlert;
import com.loganomaly.model.NginxLog;
import org.apache.flink.api.common.state.MapState;
import org.apache.flink.api.common.state.MapStateDescriptor;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;

import java.util.*;

public class MarkovPathDetector extends KeyedProcessFunction<String, NginxLog, AnomalyAlert> {

    private static final long serialVersionUID = 1L;
    private static final double SIGMA_MULTIPLIER = 2.0;
    private static final int MIN_TRANSITIONS = 10;

    private transient MapState<String, TransitionCounter> transitionState;
    private transient ValueState<String> lastPathState;
    private transient ValueState<MarkovBaseline> baselineState;

    @Override
    public void open(Configuration parameters) {
        MapStateDescriptor<String, TransitionCounter> transitionDesc =
                new MapStateDescriptor<>("markovTransitions",
                        TypeInformation.of(String.class),
                        TypeInformation.of(TransitionCounter.class));
        transitionState = getRuntimeContext().getMapState(transitionDesc);

        ValueStateDescriptor<String> lastPathDesc =
                new ValueStateDescriptor<>("lastPath", TypeInformation.of(String.class));
        lastPathState = getRuntimeContext().getState(lastPathDesc);

        ValueStateDescriptor<MarkovBaseline> baselineDesc =
                new ValueStateDescriptor<>("markovBaseline", TypeInformation.of(MarkovBaseline.class));
        baselineState = getRuntimeContext().getState(baselineDesc);
    }

    @Override
    public void processElement(NginxLog log,
                               KeyedProcessFunction<String, NginxLog, AnomalyAlert>.Context ctx,
                               Collector<AnomalyAlert> out) throws Exception {
        String currentPath = normalizePath(log.getUrl());
        String lastPath = lastPathState.value();

        if (lastPath != null) {
            String transitionKey = lastPath + "->" + currentPath;
            TransitionCounter counter = transitionState.get(transitionKey);
            if (counter == null) {
                counter = new TransitionCounter();
            }
            counter.count++;
            transitionState.put(transitionKey, counter);

            MarkovBaseline baseline = baselineState.value();
            if (baseline == null) {
                baseline = new MarkovBaseline();
            }
            baseline.totalTransitions++;

            double probability = (double) counter.count / baseline.totalTransitions;
            baseline.addProbability(probability);

            if (baseline.sampleCount >= MIN_TRANSITIONS) {
                double mean = baseline.meanProbability;
                double std = baseline.stdProbability;
                double deviation = probability - mean;

                if (deviation < -SIGMA_MULTIPLIER * std && std > 0.001) {
                    out.collect(new AnomalyAlert(
                            UUID.randomUUID().toString(),
                            log.getIp(),
                            "MARKOV_PATH_ANOMALY",
                            String.format("IP %s: path transition %s has probability %.6f, " +
                                            "deviates from mean %.6f by more than 2σ(%.6f)",
                                    log.getIp(), transitionKey, probability, mean, SIGMA_MULTIPLIER * std),
                            probability,
                            mean,
                            SIGMA_MULTIPLIER * std,
                            System.currentTimeMillis()
                    ));
                }
            }

            baselineState.update(baseline);
        }

        lastPathState.update(currentPath);
    }

    private String normalizePath(String url) {
        if (url == null || url.isEmpty()) return "/";
        int queryIdx = url.indexOf('?');
        String path = queryIdx >= 0 ? url.substring(0, queryIdx) : url;
        return path.replaceAll("/\\d+", "/{id}");
    }

    public static class TransitionCounter {
        public long count;
    }

    public static class MarkovBaseline {
        public long totalTransitions;
        public int sampleCount;
        public double meanProbability;
        public double m2Probability;
        public double stdProbability;

        public void addProbability(double p) {
            sampleCount++;
            double n = sampleCount;
            double delta = p - meanProbability;
            meanProbability += delta / n;
            m2Probability += delta * (p - meanProbability);
            stdProbability = n > 1 ? Math.sqrt(m2Probability / (n - 1)) : 0.0;
        }
    }
}
