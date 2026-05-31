package com.loganomaly.flink;

import com.loganomaly.model.IpStats;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;

public class IpStatsWindowFunction extends ProcessWindowFunction<IpStats, IpStats, String, TimeWindow> {

    private static final long serialVersionUID = 1L;

    @Override
    public void process(String ip,
                        ProcessWindowFunction<IpStats, IpStats, String, TimeWindow>.Context context,
                        Iterable<IpStats> elements,
                        Collector<IpStats> out) {
        for (IpStats stats : elements) {
            stats.setWindowStart(context.window().getStart());
            stats.setWindowEnd(context.window().getEnd());
            out.collect(stats);
        }
    }
}
