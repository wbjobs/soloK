package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"time"

	"digitaltwin/internal/database"
	"digitaltwin/internal/middleware"
	"digitaltwin/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AuthHandler struct {
	db *database.DB
}

func NewAuthHandler(db *database.DB) *AuthHandler {
	return &AuthHandler{db: db}
}

func (h *AuthHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.POST("/login", h.Login)
	r.POST("/register", h.Register)
	r.GET("/me", middleware.AuthRequired(), h.Me)
	r.POST("/logout", middleware.AuthRequired(), h.Logout)
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	Token    string       `json:"token"`
	UserID   string       `json:"user_id"`
	Username string       `json:"username"`
	Role     models.UserRole `json:"role"`
}

func hashPassword(password string) string {
	hash := sha256.Sum256([]byte(password))
	return hex.EncodeToString(hash[:])
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	err := h.db.Pool.QueryRow(c, `
		SELECT id, username, password, role FROM users WHERE username = $1
	`, req.Username).Scan(&user.ID, &user.Username, &user.Password, &user.Role)

	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if hashPassword(req.Password) != user.Password {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	now := time.Now()
	_, _ = h.db.Pool.Exec(c, "UPDATE users SET last_login = $1 WHERE id = $2", now, user.ID)

	token, err := middleware.GenerateToken(&user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, LoginResponse{
		Token:    token,
		UserID:   user.ID,
		Username: user.Username,
		Role:     user.Role,
	})
}

type RegisterRequest struct {
	Username string         `json:"username" binding:"required,min=3,max=64"`
	Password string         `json:"password" binding:"required,min=6"`
	Role     models.UserRole `json:"role"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Role == "" {
		req.Role = models.RoleViewer
	}

	existing := 0
	_ = h.db.Pool.QueryRow(c, "SELECT COUNT(*) FROM users WHERE username = $1", req.Username).Scan(&existing)
	if existing > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "username already exists"})
		return
	}

	id := uuid.New().String()
	hashedPwd := hashPassword(req.Password)

	_, err := h.db.Pool.Exec(c, `
		INSERT INTO users (id, username, password, role) VALUES ($1, $2, $3, $4)
	`, id, req.Username, hashedPwd, req.Role)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": id, "username": req.Username, "role": req.Role})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID, _ := c.Get("user_id")
	username, _ := c.Get("username")
	role, _ := c.Get("user_role")

	c.JSON(http.StatusOK, gin.H{
		"id":       userID,
		"username": username,
		"role":     role,
	})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "logged out"})
}
