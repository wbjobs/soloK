package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"idgenerator/internal/config"
	"idgenerator/internal/generator"
	"idgenerator/internal/health"
	"idgenerator/internal/metrics"
	"idgenerator/internal/server"
)

func main() {
	defaultCfg := config.DefaultConfig()

	cfgMgr, err := config.NewManager(defaultCfg.EtcdEndpoints)
	if err != nil {
		log.Printf("Warning: failed to create config manager, using default: %v", err)
	}
	defer cfgMgr.Close()

	cfg := cfgMgr.Get()

	m := metrics.NewMetrics()
	metricsServer := metrics.StartMetricsServer(cfg.HTTPPort)
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		metricsServer.Shutdown(ctx)
	}()

	hm := health.NewManager()

	gm, err := generator.NewGeneratorManager(cfgMgr, m, hm)
	if err != nil {
		log.Fatalf("Failed to create generator manager: %v", err)
	}
	defer gm.Close()

	idServer := server.NewIDGeneratorServer(gm, hm)

	go func() {
		log.Printf("Starting gRPC server on port %d...", cfg.GRPCPort)
		if err := idServer.Start(cfg.GRPCPort); err != nil {
			log.Fatalf("Failed to start gRPC server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	idServer.Stop()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := metricsServer.Shutdown(ctx); err != nil {
		log.Printf("Metrics server shutdown error: %v", err)
	}

	log.Println("Server shutdown complete")
}
