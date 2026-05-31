package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/solok/k62/cache"
	"github.com/solok/k62/worker"
)

func main() {
	id := flag.String("id", "W0", "Worker ID")
	addr := flag.String("addr", ":50051", "Worker listen address")
	scheduler := flag.String("scheduler", "", "Scheduler address for auto-registration")
	redisAddr := flag.String("redis", "localhost:6379", "Redis address")
	redisPass := flag.String("redis-pass", "", "Redis password")
	redisDB := flag.Int("redis-db", 0, "Redis database number")
	useInMemory := flag.Bool("inmemory", false, "Use in-memory cache instead of Redis")
	flag.Parse()

	var cacheClient cache.Cache
	if *useInMemory {
		cacheClient = cache.NewInMemoryCache()
		log.Println("Using in-memory cache")
	} else {
		cacheClient = cache.NewRedisCache(*redisAddr, *redisPass, *redisDB, 0)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := cacheClient.Ping(ctx); err != nil {
			log.Printf("Warning: Redis not available at %s, falling back to in-memory cache: %v", *redisAddr, err)
			cacheClient.Close()
			cacheClient = cache.NewInMemoryCache()
		} else {
			log.Printf("Connected to Redis at %s", *redisAddr)
		}
	}
	defer cacheClient.Close()

	w := worker.NewWorker(*id, *addr, cacheClient)
	if *scheduler != "" {
		w.SetSchedulerAddr(*scheduler)
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := w.Start(); err != nil {
			log.Fatalf("Worker %s failed: %v", *id, err)
		}
	}()

	log.Printf("Worker %s started on %s", *id, *addr)

	if *scheduler != "" {
		time.Sleep(500 * time.Millisecond)
		if err := w.RegisterWithScheduler(); err != nil {
			log.Printf("Worker %s auto-registration failed: %v", *id, err)
		}
	}

	<-sigCh
	log.Printf("Worker %s shutting down...", *id)
	w.Stop()
}
