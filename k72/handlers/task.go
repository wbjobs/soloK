package handlers

import (
	"net/http"
	"task-scheduler/db"
	"task-scheduler/models"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type CreateTaskRequest struct {
	TaskType string `json:"task_type" binding:"required,max=50"`
	Payload  string `json:"payload"`
	MaxRetry int    `json:"max_retry" binding:"min=0,max=10"`
}

func CreateTask(c *gin.Context) {
	var req CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.MaxRetry == 0 {
		req.MaxRetry = 3
	}

	task := &models.Task{
		TaskType: req.TaskType,
		Payload:  req.Payload,
		Status:   models.TaskStatusPending,
		MaxRetry: req.MaxRetry,
	}

	result := db.DB.Create(task)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"msg":  "success",
		"data": task,
	})
}

type PullTaskRequest struct {
	WorkerID uint64 `json:"worker_id" binding:"required"`
	TaskType string `json:"task_type"`
}

func PullTask(c *gin.Context) {
	var req PullTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var worker models.Worker
	result := db.DB.Where("id = ?", req.WorkerID).First(&worker)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "worker not found"})
		return
	}

	if worker.Status != models.WorkerStatusActive {
		c.JSON(http.StatusOK, gin.H{
			"code": 1,
			"msg":  "worker is not active, cannot pull new tasks",
			"data": nil,
		})
		return
	}

	tx := db.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	var task models.Task
	query := tx.Where("status = ? AND retry_count < max_retry", models.TaskStatusPending)
	if req.TaskType != "" {
		query = query.Where("task_type = ?", req.TaskType)
	}

	result = query.Order("created_at ASC").
		Limit(1).
		Set("gorm:query_option", "FOR UPDATE SKIP LOCKED").
		First(&task)

	if result.Error != nil {
		tx.Rollback()
		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"msg":  "no task available",
			"data": nil,
		})
		return
	}

	now := time.Now()
	updates := map[string]interface{}{
		"status":     models.TaskStatusRunning,
		"worker_id":  req.WorkerID,
		"started_at": now,
		"updated_at": now,
	}

	result = tx.Model(&task).Updates(updates)
	if result.Error != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	task.Status = models.TaskStatusRunning
	task.WorkerID = &req.WorkerID
	task.StartedAt = &now

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"msg":  "success",
		"data": task,
	})
}

type UpdateTaskStatusRequest struct {
	WorkerID     uint64 `json:"worker_id" binding:"required"`
	Status       string `json:"status" binding:"required,oneof=pending running finished failed"`
	ErrorMessage string `json:"error_message"`
}

func UpdateTaskStatus(c *gin.Context) {
	taskID := c.Param("id")
	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "task id is required"})
		return
	}

	var req UpdateTaskStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{
		"status":     req.Status,
		"updated_at": time.Now(),
	}

	if req.Status == models.TaskStatusFinished || req.Status == models.TaskStatusFailed {
		updates["finished_at"] = time.Now()
	}

	if req.Status == models.TaskStatusFailed {
		updates["error_message"] = req.ErrorMessage
		updates["retry_count"] = gorm.Expr("retry_count + 1")
	}

	result := db.DB.Model(&models.Task{}).
		Where("id = ? AND worker_id = ?", taskID, req.WorkerID).
		Updates(updates)

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found or worker mismatch"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"msg":  "success",
	})
}
