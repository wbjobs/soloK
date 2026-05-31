package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"digitaltwin/internal/database"
	"digitaltwin/internal/middleware"
	"digitaltwin/internal/models"

	"github.com/gin-gonic/gin"
)

type AnomalyHandler struct {
	db *database.DB
}

func NewAnomalyHandler(db *database.DB) *AnomalyHandler {
	return &AnomalyHandler{db: db}
}

func (h *AnomalyHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("", middleware.AuthRequired(), h.List)
	r.GET("/:id", middleware.AuthRequired(), h.Get)
	r.PUT("/:id/acknowledge", middleware.AuthRequired(), h.Acknowledge)
	r.GET("/device/:deviceId", middleware.AuthRequired(), h.ListByDevice)
}

func (h *AnomalyHandler) List(c *gin.Context) {
	limit := 100
	severity := c.Query("severity")

	var rows interface{}
	var err error

	if severity != "" {
		rows, err = h.db.Pool.Query(c, `
			SELECT id, device_id, type, severity, description, score, data,
			       position_x, position_y, position_z, timestamp, acknowledged
			FROM anomaly_events WHERE severity = $1 ORDER BY timestamp DESC LIMIT $2
		`, severity, limit)
	} else {
		rows, err = h.db.Pool.Query(c, `
			SELECT id, device_id, type, severity, description, score, data,
			       position_x, position_y, position_z, timestamp, acknowledged
			FROM anomaly_events ORDER BY timestamp DESC LIMIT $1
		`, limit)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type rowScanner interface {
		Next() bool
		Scan(dest ...interface{}) error
		Close()
	}

	var events []models.AnomalyEvent
	scanner := rows.(rowScanner)
	defer scanner.Close()

	for scanner.Next() {
		var e models.AnomalyEvent
		var dataJSON []byte
		err := scanner.Scan(&e.ID, &e.DeviceID, &e.Type, &e.Severity,
			&e.Description, &e.Score, &dataJSON,
			&e.Position.X, &e.Position.Y, &e.Position.Z,
			&e.Timestamp, &e.Acknowledged)
		if err != nil {
			continue
		}
		if dataJSON != nil {
			_ = json.Unmarshal(dataJSON, &e.Data)
		}
		events = append(events, e)
	}

	c.JSON(http.StatusOK, events)
}

func (h *AnomalyHandler) Get(c *gin.Context) {
	id := c.Param("id")

	var e models.AnomalyEvent
	var dataJSON []byte
	err := h.db.Pool.QueryRow(c, `
		SELECT id, device_id, type, severity, description, score, data,
		       position_x, position_y, position_z, timestamp, acknowledged
		FROM anomaly_events WHERE id = $1
	`, id).Scan(&e.ID, &e.DeviceID, &e.Type, &e.Severity,
		&e.Description, &e.Score, &dataJSON,
		&e.Position.X, &e.Position.Y, &e.Position.Z,
		&e.Timestamp, &e.Acknowledged)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "anomaly not found"})
		return
	}

	if dataJSON != nil {
		_ = json.Unmarshal(dataJSON, &e.Data)
	}

	c.JSON(http.StatusOK, e)
}

func (h *AnomalyHandler) Acknowledge(c *gin.Context) {
	id := c.Param("id")

	result, err := h.db.Pool.Exec(c,
		"UPDATE anomaly_events SET acknowledged = TRUE WHERE id = $1", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if result.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "anomaly not found"})
		return
	}

	logOperation(h.db, c, "acknowledge_anomaly", "anomaly", id, "Acknowledged anomaly")

	c.JSON(http.StatusOK, gin.H{"message": "acknowledged"})
}

func (h *AnomalyHandler) ListByDevice(c *gin.Context) {
	deviceID := c.Param("deviceId")
	hours := c.DefaultQuery("hours", "24")

	duration, err := time.ParseDuration(hours + "h")
	if err != nil {
		duration = 24 * time.Hour
	}

	since := time.Now().Add(-duration)

	rows, err := h.db.Pool.Query(c, `
		SELECT id, device_id, type, severity, description, score, data,
		       position_x, position_y, position_z, timestamp, acknowledged
		FROM anomaly_events
		WHERE device_id = $1 AND timestamp >= $2
		ORDER BY timestamp DESC
	`, deviceID, since)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var events []models.AnomalyEvent
	for rows.Next() {
		var e models.AnomalyEvent
		var dataJSON []byte
		err := rows.Scan(&e.ID, &e.DeviceID, &e.Type, &e.Severity,
			&e.Description, &e.Score, &dataJSON,
			&e.Position.X, &e.Position.Y, &e.Position.Z,
			&e.Timestamp, &e.Acknowledged)
		if err != nil {
			continue
		}
		if dataJSON != nil {
			_ = json.Unmarshal(dataJSON, &e.Data)
		}
		events = append(events, e)
	}

	c.JSON(http.StatusOK, events)
}
