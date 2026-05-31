package handlers

import (
	"net/http"
	"task-scheduler/db"
	"task-scheduler/models"
	"time"

	"github.com/gin-gonic/gin"
)

type RegisterWorkerRequest struct {
	Name string `json:"name" binding:"required,max=100"`
	IP   string `json:"ip" binding:"max=50"`
}

func RegisterWorker(c *gin.Context) {
	var req RegisterWorkerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	worker := &models.Worker{
		Name:          req.Name,
		IP:            req.IP,
		Status:        models.WorkerStatusActive,
		LastHeartbeat: now,
	}

	result := db.DB.Where(models.Worker{Name: req.Name}).Assign(worker).FirstOrCreate(worker)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"msg":  "success",
		"data": worker,
	})
}

type UpdateWorkerStatusRequest struct {
	WorkerID uint64 `json:"worker_id" binding:"required"`
	Status   string `json:"status" binding:"required,oneof=active draining inactive"`
}

func UpdateWorkerStatus(c *gin.Context) {
	var req UpdateWorkerStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := db.DB.Model(&models.Worker{}).
		Where("id = ?", req.WorkerID).
		Update("status", req.Status)

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "worker not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"msg":  "success",
	})
}

type UnregisterWorkerRequest struct {
	WorkerID uint64 `json:"worker_id" binding:"required"`
	Force    bool   `json:"force"`
}

func UnregisterWorker(c *gin.Context) {
	var req UnregisterWorkerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var runningCount int64
	db.DB.Model(&models.Task{}).
		Where("worker_id = ? AND status = ?", req.WorkerID, models.TaskStatusRunning).
		Count(&runningCount)

	if runningCount > 0 && !req.Force {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":  1,
			"msg":   "worker still has running tasks, please wait or use force=true",
			"running_tasks": runningCount,
		})
		return
	}

	tx := db.DB.Begin()

	if !req.Force {
		result := tx.Delete(&models.Worker{}, req.WorkerID)
		if result.Error != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}
	} else {
		result := tx.Model(&models.Task{}).
			Where("worker_id = ? AND status = ?", req.WorkerID, models.TaskStatusRunning).
			Updates(map[string]interface{}{
				"status":     models.TaskStatusPending,
				"worker_id":  nil,
				"updated_at": time.Now(),
			})
		if result.Error != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}

		result = tx.Delete(&models.Worker{}, req.WorkerID)
		if result.Error != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"msg":  "success",
	})
}

func GetWorkerStats(c *gin.Context) {
	workerID := c.Param("id")
	if workerID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "worker id is required"})
		return
	}

	var worker models.Worker
	result := db.DB.Where("id = ?", workerID).First(&worker)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "worker not found"})
		return
	}

	var runningCount int64
	db.DB.Model(&models.Task{}).
		Where("worker_id = ? AND status = ?", workerID, models.TaskStatusRunning).
		Count(&runningCount)

	var pendingCount int64
	db.DB.Model(&models.Task{}).
		Where("worker_id = ? AND status = ?", workerID, models.TaskStatusPending).
		Count(&pendingCount)

	var finishedCount int64
	db.DB.Model(&models.Task{}).
		Where("worker_id = ? AND status = ?", workerID, models.TaskStatusFinished).
		Count(&finishedCount)

	var failedCount int64
	db.DB.Model(&models.Task{}).
		Where("worker_id = ? AND status = ?", workerID, models.TaskStatusFailed).
		Count(&failedCount)

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"msg":  "success",
		"data": gin.H{
			"worker":         worker,
			"running_tasks":  runningCount,
			"pending_tasks":  pendingCount,
			"finished_tasks": finishedCount,
			"failed_tasks":   failedCount,
			"can_unregister": runningCount == 0,
		},
	})
}
