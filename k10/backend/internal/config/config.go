package config

import (
	"os"
	"strconv"
)

type Config struct {
	Server      ServerConfig
	Database    DatabaseConfig
	MQTT        MQTTConfig
	Timescale   TimescaleConfig
	Anomaly     AnomalyConfig
	VirtualLimit VirtualLimitConfig
}

type ServerConfig struct {
	Port         int
	ReadTimeout  int
	WriteTimeout int
}

type DatabaseConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	DBName   string
	SSLMode  string
}

type MQTTConfig struct {
	Broker   string
	ClientID string
	Username string
	Password string
	QoS      byte
}

type TimescaleConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	DBName   string
	SSLMode  string
}

type AnomalyConfig struct {
	Contamination  float64
	NTrees         int
	SampleSize     int
	MaxSamples     int
	TrainInterval  int
	DetectInterval int
}

type VirtualLimitConfig struct {
	DefaultBounds Bounds3D
}

type Bounds3D struct {
	XMin, XMax float64
	YMin, YMax float64
	ZMin, ZMax float64
}

func Load() *Config {
	return &Config{
		Server: ServerConfig{
			Port:         getEnvInt("SERVER_PORT", 8080),
			ReadTimeout:  getEnvInt("SERVER_READ_TIMEOUT", 30),
			WriteTimeout: getEnvInt("SERVER_WRITE_TIMEOUT", 30),
		},
		Database: DatabaseConfig{
			Host:     getEnvStr("DB_HOST", "localhost"),
			Port:     getEnvInt("DB_PORT", 5432),
			User:     getEnvStr("DB_USER", "postgres"),
			Password: getEnvStr("DB_PASSWORD", "postgres"),
			DBName:   getEnvStr("DB_NAME", "digitaltwin"),
			SSLMode:  getEnvStr("DB_SSLMODE", "disable"),
		},
		MQTT: MQTTConfig{
			Broker:   getEnvStr("MQTT_BROKER", "tcp://localhost:1883"),
			ClientID: getEnvStr("MQTT_CLIENT_ID", "digitaltwin-server"),
			Username: getEnvStr("MQTT_USERNAME", ""),
			Password: getEnvStr("MQTT_PASSWORD", ""),
			QoS:      byte(getEnvInt("MQTT_QOS", 1)),
		},
		Timescale: TimescaleConfig{
			Host:     getEnvStr("TS_HOST", "localhost"),
			Port:     getEnvInt("TS_PORT", 5432),
			User:     getEnvStr("TS_USER", "postgres"),
			Password: getEnvStr("TS_PASSWORD", "postgres"),
			DBName:   getEnvStr("TS_NAME", "timeseries"),
			SSLMode:  getEnvStr("TS_SSLMODE", "disable"),
		},
		Anomaly: AnomalyConfig{
			Contamination:  getEnvFloat("ANOMALY_CONTAMINATION", 0.05),
			NTrees:         getEnvInt("ANOMALY_N_TREES", 100),
			SampleSize:     getEnvInt("ANOMALY_SAMPLE_SIZE", 256),
			MaxSamples:     getEnvInt("ANOMALY_MAX_SAMPLES", 256),
			TrainInterval:  getEnvInt("ANOMALY_TRAIN_INTERVAL", 3600),
			DetectInterval: getEnvInt("ANOMALY_DETECT_INTERVAL", 5),
		},
		VirtualLimit: VirtualLimitConfig{
			DefaultBounds: Bounds3D{
				XMin: -2.0, XMax: 2.0,
				YMin: 0.0, YMax: 3.0,
				ZMin: -2.0, ZMax: 2.0,
			},
		},
	}
}

func getEnvStr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getEnvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return def
}

func getEnvFloat(key string, def float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return def
}
