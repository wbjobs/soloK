package handlers

import (
	"net/http"
	"time"

	"digitaltwin/internal/database"
	"digitaltwin/internal/middleware"
	"digitaltwin/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type VirtualLimitHandler struct {
	db *database.DB
}

func NewVirtualLimitHandler(db *database.DB) *VirtualLimitHandler {
	return &VirtualLimitHandler{db: db}
}

func (h *VirtualLimitHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("", middleware.AuthRequired(), h.List)
	r.GET("/:id", middleware.AuthRequired(), h.Get)
	r.POST("", middleware.AuthRequired(), middleware.RequirePermission(models.PermControl), h.Create)
	r.PUT("/:id", middleware.AuthRequired(), middleware.RequirePermission(models.PermControl), h.Update)
	r.DELETE("/:id", middleware.AuthRequired(), middleware.RequirePermission(models.PermControl), h.Delete)
	r.GET("/device/:deviceId", middleware.AuthRequired(), h.GetByDevice)
}

func (h *VirtualLimitHandler) List(c *gin.Context) {
	rows, err := h.db.Pool.Query(c, `
		SELECT id, device_id, x_min, x_max, y_min, y_max, z_min, z_max,
		       color, opacity, is_active, created_by, created_at, updated_at
		FROM virtual_limits ORDER BY created_at DESC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var limits []models.VirtualLimit
	for rows.Next() {
		var l models.VirtualLimit
		err := rows.Scan(&l.ID, &l.DeviceID,
			&l.Bounds.XMin, &l.Bounds.XMax,
			&l.Bounds.YMin, &l.Bounds.YMax,
			&l.Bounds.ZMin, &l.Bounds.ZMax,
			&l.Color, &l.Opacity, &l.IsActive,
			&l.CreatedBy, &l.CreatedAt, &l.UpdatedAt)
		if err != nil {
			continue
		}
		limits = append(limits, l)
	}

	c.JSON(http.StatusOK, limits)
}

func (h *VirtualLimitHandler) Get(c *gin.Context) {
	id := c.Param("id")

	var l models.VirtualLimit
	err := h.db.Pool.QueryRow(c, `
		SELECT id, device_id, x_min, x_max, y_min, y_max, z_min, z_max,
		       color, opacity, is_active, created_by, created_at, updated_at
		FROM virtual_limits WHERE id = $1
	`, id).Scan(&l.ID, &l.DeviceID,
		&l.Bounds.XMin, &l.Bounds.XMax,
		&l.Bounds.YMin, &l.Bounds.YMax,
		&l.Bounds.ZMin, &l.Bounds.ZMax,
		&l.Color, &l.Opacity, &l.IsActive,
		&l.CreatedBy, &l.CreatedAt, &l.UpdatedAt)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "virtual limit not found"})
		return
	}

	c.JSON(http.StatusOK, l)
}

type CreateLimitRequest struct {
	DeviceID string         `json:"device_id" binding:"required"`
	Bounds   models.Bounds3D `json:"bounds" binding:"required"`
	Color    string         `json:"color"`
	Opacity  float64        `json:"opacity"`
	IsActive bool           `json:"is_active"`
}

func (h *VirtualLimitHandler) Create(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req CreateLimitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Opacity <= 0 {
		req.Opacity = 0.3
	}
	if req.Color == "" {
		req.Color = "#00ff00"
	}

	id := uuid.New().String()
	now := time.Now()

	_, err := h.db.Pool.Exec(c, `
		INSERT INTO virtual_limits (id, device_id, x_min, x_max, y_min, y_max, z_min, z_max,
			color, opacity, is_active, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
	`, id, req.DeviceID,
		req.Bounds.XMin, req.Bounds.XMax,
		req.Bounds.YMin, req.Bounds.YMax,
		req.Bounds.ZMin, req.Bounds.ZMax,
		req.Color, req.Opacity, req.IsActive,
		userID.(string), now, now)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	logOperation(h.db, c, "create_virtual_limit", "virtual_limit", id, "Created virtual limit")

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

type UpdateLimitRequest struct {
	Bounds   *models.Bounds3D `json:"bounds"`
	Color    string           `json:"color"`
	Opacity  float64          `json:"opacity"`
	IsActive *bool            `json:"is_active"`
}

func (h *VirtualLimitHandler) Update(c *gin.Context) {
	id := c.Param("id")

	var req UpdateLimitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()

	if req.Bounds != nil {
		_, err := h.db.Pool.Exec(c, `
			UPDATE virtual_limits SET
				x_min = $1, x_max = $2, y_min = $3, y_max = $4,
				z_min = $5, z_max = $6, updated_at = $7
			WHERE id = $8
		`, req.Bounds.XMin, req.Bounds.XMax,
			req.Bounds.YMin, req.Bounds.YMax,
			req.Bounds.ZMin, req.Bounds.ZMax,
			now, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if req.Color != "" {
		_, _ = h.db.Pool.Exec(c, "UPDATE virtual_limits SET color = $1, updated_at = $2 WHERE id = $3",
			req.Color, now, id)
	}
	if req.Opacity > 0 {
		_, _ = h.db.Pool.Exec(c, "UPDATE virtual_limits SET opacity = $1, updated_at = $2 WHERE id = $3",
			req.Opacity, now, id)
	}
	if req.IsActive != nil {
		_, _ = h.db.Pool.Exec(c, "UPDATE virtual_limits SET is_active = $1, updated_at = $2 WHERE id = $3",
			*req.IsActive, now, id)
	}

	logOperation(h.db, c, "update_virtual_limit", "virtual_limit", id, "Updated virtual limit")

	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

func (h *VirtualLimitHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	result, err := h.db.Pool.Exec(c, "DELETE FROM virtual_limits WHERE id = $1", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if result.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "virtual limit not found"})
		return
	}

	logOperation(h.db, c, "delete_virtual_limit", "virtual_limit", id, "Deleted virtual limit")

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *VirtualLimitHandler) GetByDevice(c *gin.Context) {
	deviceID := c.Param("deviceId")

	rows, err := h.db.Pool.Query(c, `
		SELECT id, device_id, x_min, x_max, y_min, y_max, z_min, z_max,
		       color, opacity, is_active, created_by, created_at, updated_at
		FROM virtual_limits WHERE device_id = $1 AND is_active = TRUE
	`, deviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var limits []models.VirtualLimit
	for rows.Next() {
		var l models.VirtualLimit
		err := rows.Scan(&l.ID, &l.DeviceID,
			&l.Bounds.XMin, &l.Bounds.XMax,
			&l.Bounds.YMin, &l.Bounds.YMax,
			&l.Bounds.ZMin, &l.Bounds.ZMax,
			&l.Color, &l.Opacity, &l.IsActive,
			&l.CreatedBy, &l.CreatedAt, &l.UpdatedAt)
		if err != nil {
			continue
		}
		limits = append(limits, l)
	}

	c.JSON(http.StatusOK, limits)
}
