package com.loganomaly.sink;

import com.google.gson.Gson;
import com.loganomaly.model.AnomalyAlert;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.sink.RichSinkFunction;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPoolConfig;
import redis.clients.jedis.Transaction;

public class RedisAlertSink extends RichSinkFunction<AnomalyAlert> {

    private static final long serialVersionUID = 1L;
    private static final String ALERT_KEY_PREFIX = "alert:";
    private static final String ALERT_LIST_KEY = "alerts:recent";
    private static final String ALERT_SET_KEY = "alerts:seen";

    private final String host;
    private final int port;
    private final int ttlSeconds;

    private transient JedisPool jedisPool;
    private transient Gson gson;

    public RedisAlertSink(String host, int port, int ttlSeconds) {
        this.host = host;
        this.port = port;
        this.ttlSeconds = ttlSeconds;
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
    public void invoke(AnomalyAlert alert, Context context) {
        try (Jedis jedis = jedisPool.getResource()) {
            String alertId = alert.getAlertId();
            String alertKey = ALERT_KEY_PREFIX + alertId;

            Long isNew = jedis.setnx(alertKey, "");
            if (isNew == 1) {
                String alertJson = gson.toJson(alert);

                Transaction tx = jedis.multi();
                tx.setex(alertKey, ttlSeconds, alertJson);
                tx.sadd(ALERT_SET_KEY, alertId);
                tx.lpush(ALERT_LIST_KEY, alertJson);
                tx.ltrim(ALERT_LIST_KEY, 0, 999);
                tx.expire(ALERT_SET_KEY, ttlSeconds);
                tx.expire(ALERT_LIST_KEY, ttlSeconds);
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
