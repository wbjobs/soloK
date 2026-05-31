package com.loganomaly.flink;

import com.loganomaly.model.AnomalyAlert;
import org.apache.flink.api.common.state.StateTtlConfig;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.time.Time;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;

import java.util.HashSet;

public class AlertDeduplicator extends KeyedProcessFunction<String, AnomalyAlert, AnomalyAlert> {

    private static final long serialVersionUID = 1L;

    private final long dedupWindowSeconds;
    private final long suppressionWindowSeconds;
    private final int maxAlertsPerWindow;

    private transient ValueState<AlertDedupState> dedupState;

    public AlertDeduplicator(long dedupWindowSeconds, long suppressionWindowSeconds, int maxAlertsPerWindow) {
        this.dedupWindowSeconds = dedupWindowSeconds;
        this.suppressionWindowSeconds = suppressionWindowSeconds;
        this.maxAlertsPerWindow = maxAlertsPerWindow;
    }

    @Override
    public void open(Configuration parameters) {
        StateTtlConfig ttlConfig = StateTtlConfig
                .newBuilder(Time.seconds(dedupWindowSeconds))
                .setUpdateType(StateTtlConfig.UpdateType.OnCreateAndWrite)
                .setStateVisibility(StateTtlConfig.StateVisibility.NeverReturnExpired)
                .build();

        ValueStateDescriptor<AlertDedupState> stateDescriptor =
                new ValueStateDescriptor<>("alertDedup", TypeInformation.of(AlertDedupState.class));
        stateDescriptor.enableTimeToLive(ttlConfig);
        dedupState = getRuntimeContext().getState(stateDescriptor);
    }

    @Override
    public void processElement(AnomalyAlert alert,
                               KeyedProcessFunction<String, AnomalyAlert, AnomalyAlert>.Context ctx,
                               Collector<AnomalyAlert> out) throws Exception {
        AlertDedupState state = dedupState.value();
        long now = alert.getTimestamp();

        if (state == null || now - state.windowStart > suppressionWindowSeconds * 1000) {
            state = new AlertDedupState();
            state.windowStart = now;
            state.count = 0;
            state.lastAlertTime = 0;
            state.seenAlerts = new HashSet<>();
        }

        String dedupKey = generateDedupKey(alert);
        boolean isDuplicate = state.seenAlerts.contains(dedupKey);
        boolean isRateLimited = state.count >= maxAlertsPerWindow;

        if (!isDuplicate && !isRateLimited) {
            out.collect(alert);
            state.seenAlerts.add(dedupKey);
            state.count++;
            state.lastAlertTime = now;
        }

        dedupState.update(state);
    }

    private String generateDedupKey(AnomalyAlert alert) {
        return alert.getAlertType() + ":" + alert.getIp() + ":" +
                Math.round(alert.getObservedValue() * 100);
    }

    public static class AlertDedupState {
        public long windowStart;
        public int count;
        public long lastAlertTime;
        public HashSet<String> seenAlerts;
    }
}
