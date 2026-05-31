package handlers

import (
	"net/http"
	"strconv"
	"time"

	"digitaltwin/internal/middleware"
	"digitaltwin/internal/models"
	"digitaltwin/internal/timeseries"

	"github.com/gin-gonic/gin"
)

type TelemetryHandler struct {
	ts *timeseries.TSDB
}

func NewTelemetryHandler(ts *timeseries.TSDB) *TelemetryHandler {
	return &TelemetryHandler{ts: ts}
}

func (h *TelemetryHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/:deviceId", middleware.AuthRequired(), h.Query)
	r.GET("/:deviceId/recent", middleware.AuthRequired(), h.Recent)
}

func (h *TelemetryHandler) Query(c *gin.Context) {
	deviceID := c.Param("deviceId")

	startStr := c.Query("start")
	endStr := c.Query("end")

	var start, end time.Time
	var err error

	if startStr != "" {
		start, err = time.Parse(time.RFC3339, startStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start time format"})
			return
		}
	} else {
		start = time.Now().Add(-1 * time.Hour)
	}

	if endStr != "" {
		end, err = time.Parse(time.RFC3339, endStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end time format"})
			return
		}
	} else {
		end = time.Now()
	}

	if h.ts == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "timeseries database not available"})
		return
	}

	telemetry, err := h.ts.QueryTelemetry(deviceID, start, end)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if telemetry == nil {
		telemetry = []models.DeviceTelemetry{}
	}

	c.JSON(http.StatusOK, telemetry)
}

func (h *TelemetryHandler) Recent(c *gin.Context) {
	deviceID := c.Param("deviceId")

	limit, err := strconv.Atoi(c.DefaultQuery("limit", "100"))
	if err != nil || limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}

	if h.ts == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "timeseries database not available"})
		return
	}

	telemetry, err := h.ts.QueryRecentTelemetry(deviceID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if telemetry == nil {
		telemetry = []models.DeviceTelemetry{}
	}

	c.JSON(http.StatusOK, telemetry)
}
