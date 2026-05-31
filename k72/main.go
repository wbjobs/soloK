package main

import (
	"log"
	"task-scheduler/config"
	"task-scheduler/db"
	"task-scheduler/handlers"
	"task-scheduler/scheduler"

	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()

	if err := db.Init(cfg); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	log.Println("Database initialized successfully")

	sched := scheduler.NewScheduler(cfg)
	sched.Start()

	r := gin.Default()

	api := r.Group("/api/v1")
	{
		worker := api.Group("/worker")
		{
			worker.POST("/register", handlers.RegisterWorker)
			worker.POST("/heartbeat", handlers.Heartbeat)
			worker.PUT("/status", handlers.UpdateWorkerStatus)
			worker.POST("/unregister", handlers.UnregisterWorker)
			worker.GET("/:id/stats", handlers.GetWorkerStats)
		}

		task := api.Group("/task")
		{
			task.POST("", handlers.CreateTask)
			task.POST("/pull", handlers.PullTask)
			task.PUT("/:id/status", handlers.UpdateTaskStatus)
		}
	}

	log.Printf("Server starting on %s", cfg.ServerAddr())
	if err := r.Run(cfg.ServerAddr()); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
