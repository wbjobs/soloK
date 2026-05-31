package handlers

import (
	"time"

	"digitaltwin/internal/database"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func logOperation(db *database.DB, c *gin.Context, action, resource, resourceID, detail string) {
	userID, _ := c.Get("user_id")
	username, _ := c.Get("username")

	uid, _ := userID.(string)
	uname, _ := username.(string)

	id := uuid.New().String()
	ip := c.ClientIP()

	_, _ = db.Pool.Exec(c, `
		INSERT INTO operation_logs (id, user_id, username, action, resource, resource_id, detail, ip_address, status, timestamp)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, id, uid, uname, action, resource, resourceID, detail, ip, "success", time.Now())
}
