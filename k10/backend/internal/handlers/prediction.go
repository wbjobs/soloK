package handlers

import (
	"net/http"
	"time"

	"digitaltwin/internal/middleware"
	"digitaltwin/internal/prediction"

	"github.com/gin-gonic/gin"
)

type PredictionHandler struct {
	predictor *prediction.LSTMPredictor
}

func NewPredictionHandler(predictor *prediction.LSTMPredictor) *PredictionHandler {
	return &PredictionHandler{predictor: predictor}
}

func (h *PredictionHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/:deviceId", middleware.AuthRequired(), h.GetPrediction)
	r.POST("/:deviceId/train", middleware.AuthRequired(), middleware.RequirePermission("calibrate"), h.Train)
	r.GET("/:deviceId/history", middleware.AuthRequired(), h.GetHistory)
}

func (h *PredictionHandler) GetPrediction(c *gin.Context) {
	deviceID := c.Param("deviceId")

	result, err := h.predictor.GetPrediction(deviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *PredictionHandler) Train(c *gin.Context) {
	deviceID := c.Param("deviceId")

	if err := h.predictor.Train(deviceID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	logOperation(nil, c, "train_prediction_model", "device", deviceID, "Trained prediction model")

	c.JSON(http.StatusOK, gin.H{"message": "model trained successfully"})
}

func (h *PredictionHandler) GetHistory(c *gin.Context) {
	deviceID := c.Param("deviceId")
	hours := c.DefaultQuery("hours", "24")

	duration, err := time.ParseDuration(hours + "h")
	if err != nil {
		duration = 24 * time.Hour
	}

	endTime := time.Now()
	startTime := endTime.Add(-duration)

	if h.predictor == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "predictor not available"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"device_id": deviceID,
		"start":     startTime,
		"end":       endTime,
		"message":   "historical data query placeholder",
	})
}
