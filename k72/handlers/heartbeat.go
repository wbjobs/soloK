package handlers

import (
	"net/http"
	"task-scheduler/db"
	"task-scheduler/models"
	"time"

	"github.com/gin-gonic/gin"
)

type HeartbeatRequest struct {
	WorkerID uint64 `json:"worker_id" binding:"required"`
}

func Heartbeat(c *gin.Context) {
	var req HeartbeatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := db.DB.Model(&models.Worker{}).
		Where("id = ?", req.WorkerID).
		Updates(map[string]interface{}{
			"last_heartbeat": time.Now(),
			"status":         "active",
		})

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
		"data": gin.H{"timestamp": time.Now().Unix()},
	})
}
