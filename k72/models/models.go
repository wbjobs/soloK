package models

import (
	"time"
)

const (
	TaskStatusPending  = "pending"
	TaskStatusRunning  = "running"
	TaskStatusFinished = "finished"
	TaskStatusFailed   = "failed"
)

const (
	WorkerStatusActive   = "active"
	WorkerStatusDraining = "draining"
	WorkerStatusInactive = "inactive"
)

type Task struct {
	ID           uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	TaskType     string    `gorm:"size:50;not null;index" json:"task_type"`
	Payload      string    `gorm:"type:text" json:"payload"`
	Status       string    `gorm:"size:20;not null;default:pending;index" json:"status"`
	WorkerID     *uint64   `gorm:"index" json:"worker_id,omitempty"`
	RetryCount   int       `gorm:"not null;default:0" json:"retry_count"`
	MaxRetry     int       `gorm:"not null;default:3" json:"max_retry"`
	ErrorMessage string    `gorm:"type:text" json:"error_message,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	StartedAt    *time.Time `json:"started_at,omitempty"`
	FinishedAt   *time.Time `json:"finished_at,omitempty"`
}

type Worker struct {
	ID          uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	Name        string    `gorm:"size:100;not null;uniqueIndex" json:"name"`
	IP          string    `gorm:"size:50" json:"ip"`
	Status      string    `gorm:"size:20;not null;default:active" json:"status"`
	LastHeartbeat time.Time `gorm:"index" json:"last_heartbeat"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
