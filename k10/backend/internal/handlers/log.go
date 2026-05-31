package handlers

import (
	"net/http"
	"strconv"
	"time"

	"digitaltwin/internal/database"
	"digitaltwin/internal/middleware"
	"digitaltwin/internal/models"

	"github.com/gin-gonic/gin"
)

type LogHandler struct {
	db *database.DB
}

func NewLogHandler(db *database.DB) *LogHandler {
	return &LogHandler{db: db}
}

func (h *LogHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("", middleware.AuthRequired(), h.List)
	r.GET("/:id", middleware.AuthRequired(), h.Get)
}

func (h *LogHandler) List(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	action := c.Query("action")
	resource := c.Query("resource")
	hours := c.DefaultQuery("hours", "24")

	if limit > 500 {
		limit = 500
	}

	duration, err := time.ParseDuration(hours + "h")
	if err != nil {
		duration = 24 * time.Hour
	}
	since := time.Now().Add(-duration)

	query := `
		SELECT id, user_id, username, action, resource, resource_id, detail, ip_address, status, timestamp
		FROM operation_logs WHERE timestamp >= $1
	`
	args := []interface{}{since}
	argIdx := 2

	if action != "" {
		query += " AND action = $" + strconv.Itoa(argIdx)
		args = append(args, action)
		argIdx++
	}
	if resource != "" {
		query += " AND resource = $" + strconv.Itoa(argIdx)
		args = append(args, resource)
		argIdx++
	}

	query += " ORDER BY timestamp DESC LIMIT $" + strconv.Itoa(argIdx)
	args = append(args, limit)

	rows, err := h.db.Pool.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var logs []models.OperationLog
	for rows.Next() {
		var l models.OperationLog
		err := rows.Scan(&l.ID, &l.UserID, &l.Username, &l.Action,
			&l.Resource, &l.ResourceID, &l.Detail, &l.IPAddress,
			&l.Status, &l.Timestamp)
		if err != nil {
			continue
		}
		logs = append(logs, l)
	}

	c.JSON(http.StatusOK, logs)
}

func (h *LogHandler) Get(c *gin.Context) {
	id := c.Param("id")

	var l models.OperationLog
	err := h.db.Pool.QueryRow(c, `
		SELECT id, user_id, username, action, resource, resource_id, detail, ip_address, status, timestamp
		FROM operation_logs WHERE id = $1
	`, id).Scan(&l.ID, &l.UserID, &l.Username, &l.Action,
		&l.Resource, &l.ResourceID, &l.Detail, &l.IPAddress,
		&l.Status, &l.Timestamp)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "log not found"})
		return
	}

	c.JSON(http.StatusOK, l)
}
