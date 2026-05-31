package com.loganomaly.sink;

import com.google.gson.Gson;
import com.loganomaly.model.IpStats;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.sink.RichSinkFunction;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPoolConfig;
import redis.clients.jedis.Transaction;

public class RedisStatsSink extends RichSinkFunction<IpStats> {

    private static final long serialVersionUID = 1L;
    private static final String STATS_KEY_PREFIX = "stats:";
    private static final String STATS_INDEX_KEY = "stats:ips";
    private static final String STATS_VERSION_SUFFIX = ":version";

    private final String host;
    private final int port;

    private transient JedisPool jedisPool;
    private transient Gson gson;

    public RedisStatsSink(String host, int port) {
        this.host = host;
        this.port = port;
    }

    @Override
    public void open(Configuration parameters) {
        JedisPoolConfig poolConfig = new JedisPoolConfig();
        poolConfig.setMaxTotal(10);
        poolConfig.setMaxIdle(5);
        poolConfig.setMinIdle(2);
        poolConfig.setBlockWhenExhausted(true);
        poolConfig.setMaxWaitMillis(5000);
        jedisPool = new JedisPool(poolConfig, host, port, 5000);
        gson = new Gson();
    }

    @Override
    public void invoke(IpStats stats, Context context) {
        try (Jedis jedis = jedisPool.getResource()) {
            String ip = stats.getIp();
            String statsKey = STATS_KEY_PREFIX + ip;
            String versionKey = statsKey + STATS_VERSION_SUFFIX;

            long currentWindowEnd = stats.getWindowEnd();
            String lastVersionStr = jedis.get(versionKey);
            long lastVersion = lastVersionStr != null ? Long.parseLong(lastVersionStr) : 0;

            if (currentWindowEnd > lastVersion) {
                String statsJson = gson.toJson(stats);

                Transaction tx = jedis.multi();
                tx.setex(statsKey, 60, statsJson);
                tx.setex(versionKey, 60, String.valueOf(currentWindowEnd));
                tx.sadd(STATS_INDEX_KEY, ip);
                tx.expire(STATS_INDEX_KEY, 120);
                tx.exec();
            }
        }
    }

    @Override
    public void close() {
        if (jedisPool != null) {
            jedisPool.close();
        }
    }
}
