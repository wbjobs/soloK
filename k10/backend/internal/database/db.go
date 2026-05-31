package database

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DB struct {
	Pool *pgxpool.Pool
}

func New(connStr string) (*DB, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	log.Println("Connected to PostgreSQL successfully")

	db := &DB{Pool: pool}
	if err := db.initSchema(); err != nil {
		return nil, fmt.Errorf("failed to init schema: %w", err)
	}

	return db, nil
}

func (db *DB) initSchema() error {
	ctx := context.Background()
	schema := `
	CREATE TABLE IF NOT EXISTS devices (
		id VARCHAR(64) PRIMARY KEY,
		name VARCHAR(128) NOT NULL,
		type VARCHAR(32) NOT NULL,
		status VARCHAR(32) NOT NULL DEFAULT 'offline',
		position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
		position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
		position_z DOUBLE PRECISION NOT NULL DEFAULT 0,
		rotation_x DOUBLE PRECISION NOT NULL DEFAULT 0,
		rotation_y DOUBLE PRECISION NOT NULL DEFAULT 0,
		rotation_z DOUBLE PRECISION NOT NULL DEFAULT 0,
		metadata JSONB,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS users (
		id VARCHAR(64) PRIMARY KEY,
		username VARCHAR(64) UNIQUE NOT NULL,
		password VARCHAR(256) NOT NULL,
		role VARCHAR(32) NOT NULL DEFAULT 'viewer',
		token VARCHAR(256),
		last_login TIMESTAMPTZ,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS operation_logs (
		id VARCHAR(64) PRIMARY KEY,
		user_id VARCHAR(64) NOT NULL,
		username VARCHAR(64) NOT NULL,
		action VARCHAR(128) NOT NULL,
		resource VARCHAR(64) NOT NULL,
		resource_id VARCHAR(64),
		detail TEXT,
		ip_address VARCHAR(64),
		status VARCHAR(32) NOT NULL,
		timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS control_commands (
		id VARCHAR(64) PRIMARY KEY,
		device_id VARCHAR(64) NOT NULL,
		type VARCHAR(64) NOT NULL,
		params JSONB,
		user_id VARCHAR(64) NOT NULL,
		timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		status VARCHAR(32) NOT NULL DEFAULT 'pending',
		result TEXT,
		error TEXT
	);

	CREATE TABLE IF NOT EXISTS anomaly_events (
		id VARCHAR(64) PRIMARY KEY,
		device_id VARCHAR(64) NOT NULL,
		type VARCHAR(64) NOT NULL,
		severity VARCHAR(32) NOT NULL,
		description TEXT,
		score DOUBLE PRECISION NOT NULL DEFAULT 0,
		data JSONB,
		position_x DOUBLE PRECISION,
		position_y DOUBLE PRECISION,
		position_z DOUBLE PRECISION,
		timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		acknowledged BOOLEAN NOT NULL DEFAULT FALSE
	);

	CREATE TABLE IF NOT EXISTS virtual_limits (
		id VARCHAR(64) PRIMARY KEY,
		device_id VARCHAR(64) NOT NULL,
		x_min DOUBLE PRECISION NOT NULL,
		x_max DOUBLE PRECISION NOT NULL,
		y_min DOUBLE PRECISION NOT NULL,
		y_max DOUBLE PRECISION NOT NULL,
		z_min DOUBLE PRECISION NOT NULL,
		z_max DOUBLE PRECISION NOT NULL,
		color VARCHAR(16),
		opacity DOUBLE PRECISION NOT NULL DEFAULT 0.3,
		is_active BOOLEAN NOT NULL DEFAULT TRUE,
		created_by VARCHAR(64) NOT NULL,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS calibration_points (
		id VARCHAR(64) PRIMARY KEY,
		device_id VARCHAR(64) NOT NULL,
		point_index INTEGER NOT NULL,
		measured_x DOUBLE PRECISION NOT NULL,
		measured_y DOUBLE PRECISION NOT NULL,
		measured_z DOUBLE PRECISION NOT NULL,
		design_x DOUBLE PRECISION NOT NULL,
		design_y DOUBLE PRECISION NOT NULL,
		design_z DOUBLE PRECISION NOT NULL,
		offset_x DOUBLE PRECISION NOT NULL,
		offset_y DOUBLE PRECISION NOT NULL,
		offset_z DOUBLE PRECISION NOT NULL,
		timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_operation_logs_timestamp ON operation_logs(timestamp DESC);
	CREATE INDEX IF NOT EXISTS idx_anomaly_events_device_time ON anomaly_events(device_id, timestamp DESC);
	CREATE INDEX IF NOT EXISTS idx_control_commands_device_time ON control_commands(device_id, timestamp DESC);
	CREATE INDEX IF NOT EXISTS idx_calibration_points_device ON calibration_points(device_id);
	`
	_, err := db.Pool.Exec(ctx, schema)
	return err
}

func BuildConnStr(host string, port int, user, password, dbname, sslmode string) string {
	return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		host, port, user, password, dbname, sslmode)
}

func (db *DB) Close() {
	db.Pool.Close()
}
