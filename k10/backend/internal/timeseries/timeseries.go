package timeseries

import (
	"context"
	"fmt"
	"time"

	"digitaltwin/internal/models"

	"github.com/jackc/pgx/v5/pgxpool"
)

type TSDB struct {
	Pool *pgxpool.Pool
}

func New(connStr string) (*TSDB, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to TimescaleDB: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping TimescaleDB: %w", err)
	}

	ts := &TSDB{Pool: pool}
	if err := ts.initSchema(); err != nil {
		return nil, fmt.Errorf("failed to init TimescaleDB schema: %w", err)
	}

	return ts, nil
}

func (ts *TSDB) initSchema() error {
	ctx := context.Background()
	schema := `
	CREATE TABLE IF NOT EXISTS device_telemetry (
		device_id VARCHAR(64) NOT NULL,
		timestamp TIMESTAMPTZ NOT NULL,
		position_x DOUBLE PRECISION,
		position_y DOUBLE PRECISION,
		position_z DOUBLE PRECISION,
		velocity_x DOUBLE PRECISION,
		velocity_y DOUBLE PRECISION,
		velocity_z DOUBLE PRECISION,
		velocity_magnitude DOUBLE PRECISION,
		temperature DOUBLE PRECISION,
		vibration DOUBLE PRECISION,
		current DOUBLE PRECISION,
		is_anomaly BOOLEAN DEFAULT FALSE,
		anomaly_score DOUBLE PRECISION,
		anomaly_type VARCHAR(64)
	);

	SELECT create_hypertable('device_telemetry', 'timestamp', if_not_exists => TRUE);

	CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON device_telemetry(device_id, timestamp DESC);

	CREATE TABLE IF NOT EXISTS robotic_arm_states (
		device_id VARCHAR(64) NOT NULL,
		timestamp TIMESTAMPTZ NOT NULL,
		joint_angles DOUBLE PRECISION[] NOT NULL,
		end_effector_x DOUBLE PRECISION,
		end_effector_y DOUBLE PRECISION,
		end_effector_z DOUBLE PRECISION,
		end_effector_rot_x DOUBLE PRECISION,
		end_effector_rot_y DOUBLE PRECISION,
		end_effector_rot_z DOUBLE PRECISION,
		gripper_state DOUBLE PRECISION,
		is_moving BOOLEAN
	);

	SELECT create_hypertable('robotic_arm_states', 'timestamp', if_not_exists => TRUE);

	CREATE TABLE IF NOT EXISTS conveyor_belt_states (
		device_id VARCHAR(64) NOT NULL,
		timestamp TIMESTAMPTZ NOT NULL,
		speed DOUBLE PRECISION,
		is_running BOOLEAN,
		direction INTEGER,
		load_count INTEGER
	);

	SELECT create_hypertable('conveyor_belt_states', 'timestamp', if_not_exists => TRUE);
	`
	_, err := ts.Pool.Exec(ctx, schema)
	return err
}

func (ts *TSDB) InsertTelemetry(tel models.DeviceTelemetry) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := ts.Pool.Exec(ctx, `
		INSERT INTO device_telemetry (
			device_id, timestamp,
			position_x, position_y, position_z,
			velocity_x, velocity_y, velocity_z,
			velocity_magnitude,
			temperature, vibration, current,
			is_anomaly, anomaly_score, anomaly_type
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
	`,
		tel.DeviceID, tel.Timestamp,
		tel.Position.X, tel.Position.Y, tel.Position.Z,
		tel.Velocity.X, tel.Velocity.Y, tel.Velocity.Z,
		tel.VelocityMag,
		tel.Temperature, tel.Vibration, tel.Current,
		tel.IsAnomaly, tel.AnomalyScore, tel.AnomalyType,
	)
	return err
}

func (ts *TSDB) QueryTelemetry(deviceID string, start, end time.Time) ([]models.DeviceTelemetry, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	rows, err := ts.Pool.Query(ctx, `
		SELECT device_id, timestamp,
			position_x, position_y, position_z,
			velocity_x, velocity_y, velocity_z,
			velocity_magnitude,
			temperature, vibration, current,
			is_anomaly, anomaly_score, anomaly_type
		FROM device_telemetry
		WHERE device_id = $1 AND timestamp >= $2 AND timestamp <= $3
		ORDER BY timestamp ASC
	`, deviceID, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []models.DeviceTelemetry
	for rows.Next() {
		var t models.DeviceTelemetry
		err := rows.Scan(
			&t.DeviceID, &t.Timestamp,
			&t.Position.X, &t.Position.Y, &t.Position.Z,
			&t.Velocity.X, &t.Velocity.Y, &t.Velocity.Z,
			&t.VelocityMag,
			&t.Temperature, &t.Vibration, &t.Current,
			&t.IsAnomaly, &t.AnomalyScore, &t.AnomalyType,
		)
		if err != nil {
			return nil, err
		}
		results = append(results, t)
	}
	return results, nil
}

func (ts *TSDB) QueryRecentTelemetry(deviceID string, limit int) ([]models.DeviceTelemetry, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	rows, err := ts.Pool.Query(ctx, `
		SELECT device_id, timestamp,
			position_x, position_y, position_z,
			velocity_x, velocity_y, velocity_z,
			velocity_magnitude,
			temperature, vibration, current,
			is_anomaly, anomaly_score, anomaly_type
		FROM device_telemetry
		WHERE device_id = $1
		ORDER BY timestamp DESC
		LIMIT $2
	`, deviceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []models.DeviceTelemetry
	for rows.Next() {
		var t models.DeviceTelemetry
		err := rows.Scan(
			&t.DeviceID, &t.Timestamp,
			&t.Position.X, &t.Position.Y, &t.Position.Z,
			&t.Velocity.X, &t.Velocity.Y, &t.Velocity.Z,
			&t.VelocityMag,
			&t.Temperature, &t.Vibration, &t.Current,
			&t.IsAnomaly, &t.AnomalyScore, &t.AnomalyType,
		)
		if err != nil {
			return nil, err
		}
		results = append(results, t)
	}
	return results, nil
}

func (ts *TSDB) InsertRoboticArmState(state models.RoboticArmState) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	joints := make([]float64, 6)
	copy(joints, state.JointAngles)

	_, err := ts.Pool.Exec(ctx, `
		INSERT INTO robotic_arm_states (
			device_id, timestamp, joint_angles,
			end_effector_x, end_effector_y, end_effector_z,
			end_effector_rot_x, end_effector_rot_y, end_effector_rot_z,
			gripper_state, is_moving
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`,
		state.DeviceID, state.Timestamp, joints,
		state.EndEffectorPos.X, state.EndEffectorPos.Y, state.EndEffectorPos.Z,
		state.EndEffectorRot.X, state.EndEffectorRot.Y, state.EndEffectorRot.Z,
		state.GripperState, state.IsMoving,
	)
	return err
}

func (ts *TSDB) InsertConveyorBeltState(state models.ConveyorBeltState) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := ts.Pool.Exec(ctx, `
		INSERT INTO conveyor_belt_states (
			device_id, timestamp, speed, is_running, direction, load_count
		) VALUES ($1, $2, $3, $4, $5, $6)
	`,
		state.DeviceID, state.Timestamp, state.Speed,
		state.IsRunning, state.Direction, state.LoadCount,
	)
	return err
}

func (ts *TSDB) Close() {
	ts.Pool.Close()
}
