package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/solok/k62/cache"
	"github.com/solok/k62/scheduler"
)

func main() {
	addr := flag.String("addr", ":50050", "Scheduler listen address")
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

	sched := scheduler.NewScheduler(nil, cacheClient)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := sched.Start(*addr); err != nil {
			log.Fatalf("Scheduler failed: %v", err)
		}
	}()

	log.Printf("Scheduler started on %s — waiting for workers to register", *addr)
	fmt.Printf("\nTo start a worker with auto-registration:\n")
	fmt.Printf("  go run cmd/worker/main.go -id W0 -addr :50051 -scheduler %s -inmemory\n\n", *addr)
	fmt.Printf("To submit a factorization request:\n")
	fmt.Printf("  go run cmd/client/main.go -addr %s -numbers 1234567890 -priority HIGH\n\n", *addr)

	<-sigCh
	log.Println("Shutting down scheduler...")
	sched.Stop()
}
