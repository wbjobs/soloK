package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"digitaltwin/internal/database"
	"digitaltwin/internal/middleware"
	"digitaltwin/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type DeviceHandler struct {
	db *database.DB
}

func NewDeviceHandler(db *database.DB) *DeviceHandler {
	return &DeviceHandler{db: db}
}

func (h *DeviceHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("", middleware.AuthRequired(), h.List)
	r.GET("/:id", middleware.AuthRequired(), h.Get)
	r.POST("", middleware.AuthRequired(), middleware.RequirePermission(models.PermAdmin), h.Create)
	r.PUT("/:id", middleware.AuthRequired(), middleware.RequirePermission(models.PermAdmin), h.Update)
	r.DELETE("/:id", middleware.AuthRequired(), middleware.RequirePermission(models.PermAdmin), h.Delete)
}

func (h *DeviceHandler) List(c *gin.Context) {
	rows, err := h.db.Pool.Query(c, `
		SELECT id, name, type, status, position_x, position_y, position_z,
		       rotation_x, rotation_y, rotation_z, metadata, created_at, updated_at
		FROM devices ORDER BY created_at DESC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var devices []models.Device
	for rows.Next() {
		var d models.Device
		var metadataJSON []byte
		err := rows.Scan(&d.ID, &d.Name, &d.Type, &d.Status,
			&d.Position.X, &d.Position.Y, &d.Position.Z,
			&d.Rotation.X, &d.Rotation.Y, &d.Rotation.Z,
			&metadataJSON, &d.CreatedAt, &d.UpdatedAt)
		if err != nil {
			continue
		}
		if metadataJSON != nil {
			_ = json.Unmarshal(metadataJSON, &d.Metadata)
		}
		devices = append(devices, d)
	}

	c.JSON(http.StatusOK, devices)
}

func (h *DeviceHandler) Get(c *gin.Context) {
	id := c.Param("id")

	var d models.Device
	var metadataJSON []byte
	err := h.db.Pool.QueryRow(c, `
		SELECT id, name, type, status, position_x, position_y, position_z,
		       rotation_x, rotation_y, rotation_z, metadata, created_at, updated_at
		FROM devices WHERE id = $1
	`, id).Scan(&d.ID, &d.Name, &d.Type, &d.Status,
		&d.Position.X, &d.Position.Y, &d.Position.Z,
		&d.Rotation.X, &d.Rotation.Y, &d.Rotation.Z,
		&metadataJSON, &d.CreatedAt, &d.UpdatedAt)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "device not found"})
		return
	}

	if metadataJSON != nil {
		_ = json.Unmarshal(metadataJSON, &d.Metadata)
	}

	c.JSON(http.StatusOK, d)
}

type CreateDeviceRequest struct {
	Name     string                 `json:"name" binding:"required"`
	Type     models.DeviceType      `json:"type" binding:"required"`
	Position models.Vector3         `json:"position"`
	Rotation models.Vector3         `json:"rotation"`
	Metadata map[string]interface{} `json:"metadata"`
}

func (h *DeviceHandler) Create(c *gin.Context) {
	var req CreateDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	id := uuid.New().String()
	now := time.Now()

	metadataJSON, _ := json.Marshal(req.Metadata)

	_, err := h.db.Pool.Exec(c, `
		INSERT INTO devices (id, name, type, status, position_x, position_y, position_z,
			rotation_x, rotation_y, rotation_z, metadata, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`, id, req.Name, req.Type, models.DeviceStatusOffline,
		req.Position.X, req.Position.Y, req.Position.Z,
		req.Rotation.X, req.Rotation.Y, req.Rotation.Z,
		metadataJSON, now, now)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	logOperation(h.db, c, "create_device", "device", id, "Created device: "+req.Name)

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

type UpdateDeviceRequest struct {
	Name     string                 `json:"name"`
	Status   models.DeviceStatus    `json:"status"`
	Position models.Vector3         `json:"position"`
	Rotation models.Vector3         `json:"rotation"`
	Metadata map[string]interface{} `json:"metadata"`
}

func (h *DeviceHandler) Update(c *gin.Context) {
	id := c.Param("id")

	var req UpdateDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	_, err := h.db.Pool.Exec(c, `
		UPDATE devices SET name = COALESCE($1, name),
			status = COALESCE($2, status),
			position_x = COALESCE($3, position_x),
			position_y = COALESCE($4, position_y),
			position_z = COALESCE($5, position_z),
			rotation_x = COALESCE($6, rotation_x),
			rotation_y = COALESCE($7, rotation_y),
			rotation_z = COALESCE($8, rotation_z),
			updated_at = $9
		WHERE id = $10
	`, req.Name, req.Status,
		req.Position.X, req.Position.Y, req.Position.Z,
		req.Rotation.X, req.Rotation.Y, req.Rotation.Z,
		now, id)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	logOperation(h.db, c, "update_device", "device", id, "Updated device")

	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

func (h *DeviceHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	result, err := h.db.Pool.Exec(c, "DELETE FROM devices WHERE id = $1", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if result.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "device not found"})
		return
	}

	logOperation(h.db, c, "delete_device", "device", id, "Deleted device")

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
