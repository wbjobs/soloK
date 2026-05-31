package handlers

import (
	"net/http"
	"time"

	"digitaltwin/internal/calibration"
	"digitaltwin/internal/database"
	"digitaltwin/internal/middleware"
	"digitaltwin/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type CalibrationHandler struct {
	db *database.DB
}

func NewCalibrationHandler(db *database.DB) *CalibrationHandler {
	return &CalibrationHandler{db: db}
}

func (h *CalibrationHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.POST("", middleware.AuthRequired(), middleware.RequirePermission(models.PermCalibrate), h.Calibrate)
	r.GET("/device/:deviceId", middleware.AuthRequired(), h.GetByDevice)
	r.GET("/:id", middleware.AuthRequired(), h.Get)
}

type CalibrateRequest struct {
	DeviceID string           `json:"device_id" binding:"required"`
	Measured []models.Vector3 `json:"measured" binding:"required,min=3"`
	Design   []models.Vector3 `json:"design" binding:"required,min=3"`
}

func (h *CalibrationHandler) Calibrate(c *gin.Context) {
	var req CalibrateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	report, err := calibration.Calibrate(req.DeviceID, req.Measured, req.Design)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	id := uuid.New().String()
	report.ID = id
	report.GeneratedAt = time.Now()

	userID, _ := c.Get("user_id")
	if uid, ok := userID.(string); ok {
		report.GeneratedBy = uid
	}

	for i, pt := range report.Points {
		ptID := uuid.New().String()
		_, _ = h.db.Pool.Exec(c, `
			INSERT INTO calibration_points (id, device_id, point_index,
				measured_x, measured_y, measured_z,
				design_x, design_y, design_z,
				offset_x, offset_y, offset_z, timestamp)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		`, ptID, req.DeviceID, i,
			pt.MeasuredPos.X, pt.MeasuredPos.Y, pt.MeasuredPos.Z,
			pt.DesignPos.X, pt.DesignPos.Y, pt.DesignPos.Z,
			pt.Offset.X, pt.Offset.Y, pt.Offset.Z, time.Now())
	}

	logOperation(h.db, c, "calibrate_device", "device", req.DeviceID,
		"Calibration completed with status: "+report.Status)

	c.JSON(http.StatusOK, report)
}

func (h *CalibrationHandler) GetByDevice(c *gin.Context) {
	deviceID := c.Param("deviceId")

	rows, err := h.db.Pool.Query(c, `
		SELECT id, device_id, point_index,
			measured_x, measured_y, measured_z,
			design_x, design_y, design_z,
			offset_x, offset_y, offset_z, timestamp
		FROM calibration_points WHERE device_id = $1 ORDER BY timestamp DESC
	`, deviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var points []models.CalibrationPoint
	for rows.Next() {
		var p models.CalibrationPoint
		err := rows.Scan(&p.ID, &p.DeviceID, &p.PointIndex,
			&p.MeasuredPos.X, &p.MeasuredPos.Y, &p.MeasuredPos.Z,
			&p.DesignPos.X, &p.DesignPos.Y, &p.DesignPos.Z,
			&p.Offset.X, &p.Offset.Y, &p.Offset.Z, &p.Timestamp)
		if err != nil {
			continue
		}
		points = append(points, p)
	}

	c.JSON(http.StatusOK, points)
}

func (h *CalibrationHandler) Get(c *gin.Context) {
	id := c.Param("id")

	var p models.CalibrationPoint
	err := h.db.Pool.QueryRow(c, `
		SELECT id, device_id, point_index,
			measured_x, measured_y, measured_z,
			design_x, design_y, design_z,
			offset_x, offset_y, offset_z, timestamp
		FROM calibration_points WHERE id = $1
	`, id).Scan(&p.ID, &p.DeviceID, &p.PointIndex,
		&p.MeasuredPos.X, &p.MeasuredPos.Y, &p.MeasuredPos.Z,
		&p.DesignPos.X, &p.DesignPos.Y, &p.DesignPos.Z,
		&p.Offset.X, &p.Offset.Y, &p.Offset.Z, &p.Timestamp)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "calibration point not found"})
		return
	}

	c.JSON(http.StatusOK, p)
}
