package com.loganomaly.flink;

import com.loganomaly.model.IpStats;
import com.loganomaly.model.NginxLog;
import org.apache.flink.api.common.functions.AggregateFunction;

public class IpStatsAggregator implements AggregateFunction<NginxLog, IpStatsAccumulator, IpStats> {

    private static final long serialVersionUID = 1L;

    @Override
    public IpStatsAccumulator createAccumulator() {
        return new IpStatsAccumulator();
    }

    @Override
    public IpStatsAccumulator add(NginxLog log, IpStatsAccumulator acc) {
        if (acc.ip == null) {
            acc.ip = log.getIp();
        }
        acc.requestCount++;
        if (log.isError()) {
            acc.errorCount++;
        }
        acc.totalResponseTime += log.getResponseTime();
        return acc;
    }

    @Override
    public IpStats getResult(IpStatsAccumulator acc) {
        double errorRate = acc.requestCount > 0 ? (double) acc.errorCount / acc.requestCount : 0.0;
        double avgResponseTime = acc.requestCount > 0 ? acc.totalResponseTime / acc.requestCount : 0.0;
        return new IpStats(acc.ip, 0, 0, acc.requestCount, errorRate, avgResponseTime);
    }

    @Override
    public IpStatsAccumulator merge(IpStatsAccumulator a, IpStatsAccumulator b) {
        if (a.ip == null) a.ip = b.ip;
        a.requestCount += b.requestCount;
        a.errorCount += b.errorCount;
        a.totalResponseTime += b.totalResponseTime;
        return a;
    }

    public static class IpStatsAccumulator {
        public String ip;
        public long requestCount;
        public long errorCount;
        public double totalResponseTime;
    }
}
