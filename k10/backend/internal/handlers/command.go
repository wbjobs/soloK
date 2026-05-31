package handlers

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"digitaltwin/internal/database"
	"digitaltwin/internal/middleware"
	"digitaltwin/internal/models"
	"digitaltwin/internal/mqttclient"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type CommandHandler struct {
	db       *database.DB
	mqtt     *mqttclient.Client
	mu       sync.Mutex
	deviceLocks map[string]*models.MutexLock
}

func NewCommandHandler(db *database.DB, mqtt *mqttclient.Client) *CommandHandler {
	return &CommandHandler{
		db:          db,
		mqtt:        mqtt,
		deviceLocks: make(map[string]*models.MutexLock),
	}
}

func (h *CommandHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.POST("", middleware.AuthRequired(), middleware.RequirePermission(models.PermControl), h.SendCommand)
	r.GET("/locks", middleware.AuthRequired(), h.ListLocks)
	r.POST("/locks/:deviceId/acquire", middleware.AuthRequired(), middleware.RequirePermission(models.PermControl), h.AcquireLock)
	r.POST("/locks/:deviceId/release", middleware.AuthRequired(), middleware.RequirePermission(models.PermControl), h.ReleaseLock)
	r.GET("/:id", middleware.AuthRequired(), h.GetCommand)
}

type SendCommandRequest struct {
	DeviceID string                 `json:"device_id" binding:"required"`
	Type     models.CommandType     `json:"type" binding:"required"`
	Params   map[string]interface{} `json:"params"`
}

func (h *CommandHandler) SendCommand(c *gin.Context) {
	userID, _ := c.Get("user_id")
	username, _ := c.Get("username")

	var req SendCommandRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	h.mu.Lock()
	lock, locked := h.deviceLocks[req.DeviceID]
	if locked && lock.UserID != userID.(string) {
		h.mu.Unlock()
		c.JSON(http.StatusConflict, gin.H{
			"error":   "device is locked by another user",
			"locked_by": lock.Username,
			"acquired_at": lock.AcquiredAt,
		})
		return
	}
	h.mu.Unlock()

	id := uuid.New().String()
	now := time.Now()

	paramsJSON, _ := json.Marshal(req.Params)

	cmd := models.ControlCommand{
		ID:        id,
		DeviceID:  req.DeviceID,
		Type:      req.Type,
		Params:    req.Params,
		UserID:    userID.(string),
		Timestamp: now,
		Status:    models.CmdStatusPending,
	}

	_, err := h.db.Pool.Exec(c, `
		INSERT INTO control_commands (id, device_id, type, params, user_id, timestamp, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, id, req.DeviceID, req.Type, paramsJSON, userID.(string), now, models.CmdStatusPending)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if h.mqtt != nil {
		if err := h.mqtt.SendCommand(req.DeviceID, cmd); err != nil {
			_, _ = h.db.Pool.Exec(c,
				"UPDATE control_commands SET status = $1, error = $2 WHERE id = $3",
				models.CmdStatusFailed, err.Error(), id)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to send MQTT command"})
			return
		}
	}

	_, _ = h.db.Pool.Exec(c,
		"UPDATE control_commands SET status = $1 WHERE id = $2",
		models.CmdStatusExecuting, id)

	logOperation(h.db, c, "send_command", "command", id, "Sent command: "+string(req.Type))

	c.JSON(http.StatusAccepted, gin.H{
		"id":     id,
		"status": models.CmdStatusExecuting,
		"message": "command sent",
	})
}

type AcquireLockRequest struct {
	Reason string `json:"reason"`
	TTL    int    `json:"ttl"`
}

func (h *CommandHandler) AcquireLock(c *gin.Context) {
	deviceID := c.Param("deviceId")
	userID, _ := c.Get("user_id")
	username, _ := c.Get("username")

	var req AcquireLockRequest
	_ = c.ShouldBindJSON(&req)

	ttl := 300
	if req.TTL > 0 {
		ttl = req.TTL
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	if existing, ok := h.deviceLocks[deviceID]; ok {
		if time.Now().Before(existing.ExpiresAt) {
			if existing.UserID != userID.(string) {
				c.JSON(http.StatusConflict, gin.H{
					"error":       "device is locked by another user",
					"locked_by":   existing.Username,
					"acquired_at": existing.AcquiredAt,
					"expires_at":  existing.ExpiresAt,
				})
				return
			}
			existing.ExpiresAt = time.Now().Add(time.Duration(ttl) * time.Second)
			c.JSON(http.StatusOK, gin.H{"message": "lock renewed", "expires_at": existing.ExpiresAt})
			return
		}
	}

	lock := &models.MutexLock{
		DeviceID:   deviceID,
		UserID:     userID.(string),
		Username:   username.(string),
		Reason:     req.Reason,
		AcquiredAt: time.Now(),
		ExpiresAt:  time.Now().Add(time.Duration(ttl) * time.Second),
	}

	h.deviceLocks[deviceID] = lock

	logOperation(h.db, c, "acquire_lock", "device", deviceID, "Acquired lock on device")

	c.JSON(http.StatusOK, gin.H{
		"message":     "lock acquired",
		"acquired_at": lock.AcquiredAt,
		"expires_at":  lock.ExpiresAt,
	})
}

func (h *CommandHandler) ReleaseLock(c *gin.Context) {
	deviceID := c.Param("deviceId")
	userID, _ := c.Get("user_id")

	h.mu.Lock()
	defer h.mu.Unlock()

	lock, ok := h.deviceLocks[deviceID]
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "no lock found"})
		return
	}

	if lock.UserID != userID.(string) {
		c.JSON(http.StatusForbidden, gin.H{"error": "you do not hold this lock"})
		return
	}

	delete(h.deviceLocks, deviceID)

	logOperation(h.db, c, "release_lock", "device", deviceID, "Released lock on device")

	c.JSON(http.StatusOK, gin.H{"message": "lock released"})
}

func (h *CommandHandler) ListLocks(c *gin.Context) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	locks := make([]models.MutexLock, 0, len(h.deviceLocks))
	for _, lock := range h.deviceLocks {
		if time.Now().Before(lock.ExpiresAt) {
			locks = append(locks, *lock)
		}
	}

	c.JSON(http.StatusOK, locks)
}

func (h *CommandHandler) GetCommand(c *gin.Context) {
	id := c.Param("id")

	var cmd models.ControlCommand
	var paramsJSON []byte
	err := h.db.Pool.QueryRow(c, `
		SELECT id, device_id, type, params, user_id, timestamp, status, result, error
		FROM control_commands WHERE id = $1
	`, id).Scan(&cmd.ID, &cmd.DeviceID, &cmd.Type, &paramsJSON, &cmd.UserID,
		&cmd.Timestamp, &cmd.Status, &cmd.Result, &cmd.Error)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "command not found"})
		return
	}

	if paramsJSON != nil {
		_ = json.Unmarshal(paramsJSON, &cmd.Params)
	}

	c.JSON(http.StatusOK, cmd)
}
