package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	DBHost             string
	DBPort             string
	DBUser             string
	DBPassword         string
	DBName             string
	ServerHost         string
	ServerPort         string
	TaskTimeout        time.Duration
	SchedulerInterval  time.Duration
}

func Load() *Config {
	taskTimeout, _ := strconv.Atoi(getEnv("TASK_TIMEOUT_SECONDS", "300"))
	schedulerInterval, _ := strconv.Atoi(getEnv("SCHEDULER_INTERVAL_SECONDS", "60"))

	return &Config{
		DBHost:             getEnv("DB_HOST", "127.0.0.1"),
		DBPort:             getEnv("DB_PORT", "3306"),
		DBUser:             getEnv("DB_USER", "root"),
		DBPassword:         getEnv("DB_PASSWORD", "root"),
		DBName:             getEnv("DB_NAME", "task_scheduler"),
		ServerHost:         getEnv("SERVER_HOST", "0.0.0.0"),
		ServerPort:         getEnv("SERVER_PORT", "8080"),
		TaskTimeout:        time.Duration(taskTimeout) * time.Second,
		SchedulerInterval:  time.Duration(schedulerInterval) * time.Second,
	}
}

func (c *Config) DSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		c.DBUser, c.DBPassword, c.DBHost, c.DBPort, c.DBName)
}

func (c *Config) ServerAddr() string {
	return fmt.Sprintf("%s:%s", c.ServerHost, c.ServerPort)
}

func getEnv(key, defaultValue string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultValue
}
