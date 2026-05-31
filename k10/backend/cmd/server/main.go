package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"digitaltwin/internal/anomaly"
	"digitaltwin/internal/config"
	"digitaltwin/internal/database"
	"digitaltwin/internal/handlers"
	"digitaltwin/internal/middleware"
	"digitaltwin/internal/models"
	"digitaltwin/internal/mqttclient"
	"digitaltwin/internal/timeseries"
	"digitaltwin/internal/websocket"

	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()

	db, err := database.New(database.BuildConnStr(
		cfg.Database.Host, cfg.Database.Port,
		cfg.Database.User, cfg.Database.Password,
		cfg.Database.DBName, cfg.Database.SSLMode,
	))
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()
	log.Println("PostgreSQL connected successfully")

	ts, err := timeseries.New(database.BuildConnStr(
		cfg.Timescale.Host, cfg.Timescale.Port,
		cfg.Timescale.User, cfg.Timescale.Password,
		cfg.Timescale.DBName, cfg.Timescale.SSLMode,
	))
	if err != nil {
		log.Printf("Warning: TimescaleDB connection failed: %v", err)
		log.Println("Running without TimescaleDB - anomaly detection and historical queries will be limited")
	} else {
		defer ts.Close()
		log.Println("TimescaleDB connected successfully")
	}

	detector := anomaly.NewDetector()

	wsHub := websocket.NewHub()
	go wsHub.Run()
	log.Println("WebSocket hub started")

	mqtt := mqttclient.New(
		cfg.MQTT.Broker, cfg.MQTT.ClientID,
		cfg.MQTT.Username, cfg.MQTT.Password,
		cfg.MQTT.QoS, ts, wsHub,
	)

	if err := mqtt.Connect(); err != nil {
		log.Printf("Warning: MQTT connection failed: %v", err)
		log.Println("Running without MQTT - device communication will be limited")
	} else {
		defer mqtt.Disconnect()
		log.Println("MQTT connected successfully")
	}

	mqtt.On("device/+/telemetry", func(topic string, payload []byte) {
		go func() {
			var tel models.DeviceTelemetry
			if err := json.Unmarshal(payload, &tel); err != nil {
				return
			}
			if tel.DeviceID == "" {
				return
			}
			isAnomaly, score, anomalyType := detector.Detect(tel.DeviceID, tel)
			if isAnomaly {
				tel.IsAnomaly = true
				tel.AnomalyScore = score
				tel.AnomalyType = anomalyType
				wsHub.Broadcast(websocket.Message{
					Type: "anomaly",
					Data: map[string]interface{}{
						"device_id":    tel.DeviceID,
						"type":         anomalyType,
						"score":        score,
						"position":     tel.Position,
						"vibration":    tel.Vibration,
						"current":      tel.Current,
						"temperature":  tel.Temperature,
						"timestamp":    time.Now(),
					},
				})
			}
		}()
	})

	gin.SetMode(gin.ReleaseMode)

	r := gin.Default()
	r.Use(middleware.CORSMiddleware())

	api := r.Group("/api/v1")
	{
		authH := handlers.NewAuthHandler(db)
		authH.RegisterRoutes(api.Group("/auth"))

		deviceH := handlers.NewDeviceHandler(db)
		deviceH.RegisterRoutes(api.Group("/devices"))

		cmdH := handlers.NewCommandHandler(db, mqtt)
		cmdH.RegisterRoutes(api.Group("/commands"))

		anomalyH := handlers.NewAnomalyHandler(db)
		anomalyH.RegisterRoutes(api.Group("/anomalies"))

		limitH := handlers.NewVirtualLimitHandler(db)
		limitH.RegisterRoutes(api.Group("/virtual-limits"))

		calibH := handlers.NewCalibrationHandler(db)
		calibH.RegisterRoutes(api.Group("/calibrations"))

		logH := handlers.NewLogHandler(db)
		logH.RegisterRoutes(api.Group("/logs"))

		telH := handlers.NewTelemetryHandler(ts)
		telH.RegisterRoutes(api.Group("/telemetry"))
	}

	r.GET("/ws", wsHub.HandleWebSocket)

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"version": "1.0.0",
			"time":    time.Now().UTC(),
		})
	})

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:      r,
		ReadTimeout:  time.Duration(cfg.Server.ReadTimeout) * time.Second,
		WriteTimeout: time.Duration(cfg.Server.WriteTimeout) * time.Second,
	}

	go func() {
		log.Printf("Server starting on port %d", cfg.Server.Port)
		log.Printf("Health check: http://localhost:%d/health", cfg.Server.Port)
		log.Printf("WebSocket: ws://localhost:%d/ws", cfg.Server.Port)
		log.Printf("API: http://localhost:%d/api/v1", cfg.Server.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server stopped")
}
