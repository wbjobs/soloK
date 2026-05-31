package scheduler

import (
	"log"
	"task-scheduler/config"
	"task-scheduler/db"
	"task-scheduler/models"
	"time"
)

type Scheduler struct {
	cfg *config.Config
}

func NewScheduler(cfg *config.Config) *Scheduler {
	return &Scheduler{
		cfg: cfg,
	}
}

func (s *Scheduler) Start() {
	ticker := time.NewTicker(s.cfg.SchedulerInterval)
	go func() {
		log.Printf("Task timeout scheduler started, interval: %v, task timeout: %v", s.cfg.SchedulerInterval, s.cfg.TaskTimeout)
		for range ticker.C {
			s.ResetTimeoutTasks()
		}
	}()
}

func (s *Scheduler) ResetTimeoutTasks() {
	timeoutThreshold := time.Now().Add(-s.cfg.TaskTimeout)

	tx := db.DB.Begin()
	if tx.Error != nil {
		log.Printf("Failed to begin transaction for timeout reset: %v", tx.Error)
		return
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	var tasks []models.Task
	result := tx.Where("status = ? AND updated_at < ?", models.TaskStatusRunning, timeoutThreshold).
		Set("gorm:query_option", "FOR UPDATE SKIP LOCKED").
		Find(&tasks)

	if result.Error != nil {
		tx.Rollback()
		log.Printf("Failed to query timeout tasks: %v", result.Error)
		return
	}

	if len(tasks) == 0 {
		tx.Rollback()
		return
	}

	resetCount := 0
	failCount := 0

	for _, task := range tasks {
		newRetryCount := task.RetryCount + 1

		var newStatus string
		if newRetryCount >= task.MaxRetry {
			newStatus = models.TaskStatusFailed
			failCount++
		} else {
			newStatus = models.TaskStatusPending
			resetCount++
		}

		updates := map[string]interface{}{
			"status":      newStatus,
			"worker_id":   nil,
			"retry_count": newRetryCount,
			"updated_at":  time.Now(),
		}

		if newStatus == models.TaskStatusFailed {
			updates["finished_at"] = time.Now()
			updates["error_message"] = "task timeout, worker may be down"
		}

		result := tx.Model(&task).Updates(updates)
		if result.Error != nil {
			log.Printf("Failed to reset task %d: %v", task.ID, result.Error)
			continue
		}
	}

	if err := tx.Commit().Error; err != nil {
		log.Printf("Failed to commit timeout reset transaction: %v", err)
		return
	}

	if resetCount > 0 || failCount > 0 {
		log.Printf("Timeout task processing completed, reset to pending: %d, marked as failed: %d", resetCount, failCount)
	}
}
