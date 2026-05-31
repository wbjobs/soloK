CREATE TABLE IF NOT EXISTS alert_history (
    alert_id        VARCHAR(64) PRIMARY KEY,
    ip              VARCHAR(45) NOT NULL,
    alert_type      VARCHAR(64) NOT NULL,
    description     TEXT,
    observed_value  DOUBLE PRECISION NOT NULL,
    expected_value  DOUBLE PRECISION NOT NULL,
    threshold       DOUBLE PRECISION NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_history_ip ON alert_history (ip);
CREATE INDEX IF NOT EXISTS idx_alert_history_type ON alert_history (alert_type);
CREATE INDEX IF NOT EXISTS idx_alert_history_created_at ON alert_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_ip_created ON alert_history (ip, created_at DESC);
