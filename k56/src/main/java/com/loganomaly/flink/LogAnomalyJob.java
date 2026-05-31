package com.loganomaly.flink;

import com.loganomaly.deserializer.NginxLogDeserializer;
import com.loganomaly.model.AnomalyAlert;
import com.loganomaly.model.IpStats;
import com.loganomaly.model.NginxLog;
import com.loganomaly.sink.PostgresAlertSink;
import com.loganomaly.sink.RedisAlertSink;
import com.loganomaly.sink.RedisStatsSink;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.restartstrategy.RestartStrategies;
import org.apache.flink.api.common.time.Time;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.windowing.assigners.SlidingEventTimeWindows;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

public class LogAnomalyJob {

    private static final double CPU_THRESHOLD = 0.85;
    private static final double MEMORY_THRESHOLD = 0.85;
    private static final long RESOURCE_CHECK_INTERVAL_MS = 5000;
    private static final int SAMPLING_RATIO = 10;

    public static void main(String[] args) throws Exception {
        String kafkaBrokers = getEnv("KAFKA_BROKERS", "localhost:9092");
        String kafkaTopic = getEnv("KAFKA_TOPIC", "nginx-logs");
        String kafkaGroup = getEnv("KAFKA_GROUP", "log-anomaly-detector");
        String redisHost = getEnv("REDIS_HOST", "localhost");
        int redisPort = Integer.parseInt(getEnv("REDIS_PORT", "6379"));
        String pgUrl = getEnv("PG_URL", "jdbc:postgresql://localhost:5432/loganomaly");
        String pgUser = getEnv("PG_USER", "loganomaly");
        String pgPass = getEnv("PG_PASS", "loganomaly");

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        env.enableCheckpointing(30000, CheckpointingMode.EXACTLY_ONCE);
        CheckpointConfig checkpointConfig = env.getCheckpointConfig();
        checkpointConfig.setCheckpointTimeout(300000);
        checkpointConfig.setMinPauseBetweenCheckpoints(15000);
        checkpointConfig.setMaxConcurrentCheckpoints(1);
        checkpointConfig.setTolerableCheckpointFailureNumber(3);
        checkpointConfig.setExternalizedCheckpointCleanup(
                CheckpointConfig.ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION);

        env.setRestartStrategy(RestartStrategies.failureRateRestart(
                5,
                Time.of(10, TimeUnit.MINUTES),
                Time.of(30, TimeUnit.SECONDS)
        ));

        KafkaSource<NginxLog> kafkaSource = KafkaSource.<NginxLog>builder()
                .setBootstrapServers(kafkaBrokers)
                .setTopics(kafkaTopic)
                .setGroupId(kafkaGroup)
                .setStartingOffsets(OffsetsInitializer.committedOffsets(OffsetsInitializer.latest()))
                .setValueOnlyDeserializer(new NginxLogDeserializer())
                .setProperty("enable.auto.commit", "false")
                .build();

        WatermarkStrategy<NginxLog> watermarkStrategy = WatermarkStrategy
                .<NginxLog>forBoundedOutOfOrderness(Duration.ofSeconds(3))
                .withTimestampAssigner((log, ts) -> log.getTimestamp())
                .withIdleness(Duration.ofSeconds(10));

        DataStream<NginxLog> logStream = env
                .fromSource(kafkaSource, watermarkStrategy, "Kafka Nginx Log Source")
                .uid("kafka-source")
                .filter(log -> log != null && log.getIp() != null)
                .uid("log-filter")
                .name("Filter Valid Logs")
                .filter(new AdaptiveSamplingFilter(
                        CPU_THRESHOLD, MEMORY_THRESHOLD,
                        RESOURCE_CHECK_INTERVAL_MS, SAMPLING_RATIO,
                        redisHost, redisPort))
                .uid("adaptive-sampling")
                .name("Adaptive Sampling (1/" + SAMPLING_RATIO + " on degradation)");

        SingleOutputStreamOperator<IpStats> ipStatsStream = logStream
                .keyBy(NginxLog::getIp)
                .window(SlidingEventTimeWindows.of(
                        org.apache.flink.streaming.api.windowing.time.Time.seconds(10),
                        org.apache.flink.streaming.api.windowing.time.Time.seconds(5)))
                .aggregate(new IpStatsAggregator(), new IpStatsWindowFunction())
                .uid("ip-stats-window")
                .name("IP Stats Sliding Window");

        ipStatsStream.addSink(new RedisStatsSink(redisHost, redisPort))
                .name("Redis Stats Sink")
                .setUid("redis-stats-sink");

        DataStream<AnomalyAlert> statsAlerts = ipStatsStream
                .keyBy(IpStats::getIp)
                .process(new StatsAnomalyDetector())
                .uid("stats-anomaly-detector")
                .name("Stats Anomaly Detector (2σ)");

        DataStream<AnomalyAlert> markovAlerts = logStream
                .keyBy(NginxLog::getIp)
                .process(new MarkovPathDetector())
                .uid("markov-path-detector")
                .name("Markov Path Anomaly Detector");

        DataStream<AnomalyAlert> allAlerts = statsAlerts
                .union(markovAlerts);

        DataStream<AnomalyAlert> deduplicatedAlerts = allAlerts
                .keyBy(alert -> alert.getAlertType() + ":" + alert.getIp())
                .process(new AlertDeduplicator(300, 60, 10))
                .uid("alert-deduplicator")
                .name("Alert Deduplicator (60s window, max 10 alerts)");

        deduplicatedAlerts.addSink(new RedisAlertSink(redisHost, redisPort, 3600))
                .name("Redis Alert Sink")
                .setUid("redis-alert-sink");

        deduplicatedAlerts.addSink(new PostgresAlertSink(pgUrl, pgUser, pgPass))
                .name("PostgreSQL Alert Sink")
                .setUid("postgres-alert-sink");

        deduplicatedAlerts.print("ALERT")
                .uid("alert-print");

        env.execute("Real-time Log Anomaly Detection");
    }

    private static String getEnv(String key, String defaultValue) {
        String value = System.getenv(key);
        return value != null ? value : defaultValue;
    }
}
