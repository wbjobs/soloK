package com.loganomaly.sink;

import com.loganomaly.model.AnomalyAlert;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.sink.RichSinkFunction;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.util.concurrent.TimeUnit;

public class PostgresAlertSink extends RichSinkFunction<AnomalyAlert> {

    private static final long serialVersionUID = 1L;
    private static final String INSERT_SQL =
            "INSERT INTO alert_history (alert_id, ip, alert_type, description, " +
                    "observed_value, expected_value, threshold, created_at) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
                    "ON CONFLICT (alert_id) DO NOTHING";

    private static final int BATCH_SIZE = 50;
    private static final long BATCH_INTERVAL_MS = 5000;

    private final String jdbcUrl;
    private final String username;
    private final String password;

    private transient HikariDataSource dataSource;
    private transient Connection connection;
    private transient PreparedStatement preparedStatement;
    private transient int batchCount;
    private transient long lastBatchTime;

    public PostgresAlertSink(String jdbcUrl, String username, String password) {
        this.jdbcUrl = jdbcUrl;
        this.username = username;
        this.password = password;
    }

    @Override
    public void open(Configuration parameters) throws Exception {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(jdbcUrl);
        config.setUsername(username);
        config.setPassword(password);
        config.setDriverClassName("org.postgresql.Driver");
        config.setMaximumPoolSize(2);
        config.setMinimumIdle(1);
        config.setConnectionTimeout(TimeUnit.SECONDS.toMillis(10));
        config.setIdleTimeout(TimeUnit.MINUTES.toMillis(5));
        config.setMaxLifetime(TimeUnit.MINUTES.toMillis(30));

        dataSource = new HikariDataSource(config);
        connection = dataSource.getConnection();
        connection.setAutoCommit(false);
        preparedStatement = connection.prepareStatement(INSERT_SQL);
        batchCount = 0;
        lastBatchTime = System.currentTimeMillis();
    }

    @Override
    public void invoke(AnomalyAlert alert, Context context) throws Exception {
        preparedStatement.setString(1, alert.getAlertId());
        preparedStatement.setString(2, alert.getIp());
        preparedStatement.setString(3, alert.getAlertType());
        preparedStatement.setString(4, alert.getDescription());
        preparedStatement.setDouble(5, alert.getObservedValue());
        preparedStatement.setDouble(6, alert.getExpectedValue());
        preparedStatement.setDouble(7, alert.getThreshold());
        preparedStatement.setTimestamp(8, new Timestamp(alert.getTimestamp()));
        preparedStatement.addBatch();
        batchCount++;

        long now = System.currentTimeMillis();
        if (batchCount >= BATCH_SIZE || (now - lastBatchTime) >= BATCH_INTERVAL_MS) {
            executeBatch();
        }
    }

    private void executeBatch() throws Exception {
        if (batchCount > 0) {
            try {
                preparedStatement.executeBatch();
                connection.commit();
            } catch (Exception e) {
                connection.rollback();
                throw e;
            } finally {
                preparedStatement.clearBatch();
                batchCount = 0;
                lastBatchTime = System.currentTimeMillis();
            }
        }
    }

    @Override
    public void close() throws Exception {
        try {
            if (preparedStatement != null) {
                executeBatch();
                preparedStatement.close();
            }
        } finally {
            if (connection != null && !connection.isClosed()) {
                connection.close();
            }
            if (dataSource != null && !dataSource.isClosed()) {
                dataSource.close();
            }
        }
    }
}
