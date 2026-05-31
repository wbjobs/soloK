package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/solok/k62/cache"
	pb "github.com/solok/k62/pb"
	"github.com/solok/k62/scheduler"
	"github.com/solok/k62/worker"
	"google.golang.org/grpc"
	"google.golang.org/grpc/backoff"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/keepalive"
)

func main() {
	log.SetFlags(log.Ltime | log.Lmicroseconds)

	cacheClient := cache.NewInMemoryCache()
	defer cacheClient.Close()

	pool := worker.NewWorkerPool(3, "localhost:50051", cacheClient)
	pool.SetSchedulerAddr("localhost:50050")

	sched := scheduler.NewScheduler(nil, cacheClient)

	go func() {
		if err := sched.Start(":50050"); err != nil {
			log.Fatalf("Scheduler failed: %v", err)
		}
	}()
	defer sched.Stop()
	time.Sleep(200 * time.Millisecond)

	if err := pool.StartAll(); err != nil {
		log.Fatalf("Failed to start workers: %v", err)
	}
	defer pool.StopAll()

	if err := pool.RegisterAllWithScheduler(); err != nil {
		log.Fatalf("Failed to register workers: %v", err)
	}

	time.Sleep(300 * time.Millisecond)

	dialCtx, dialCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer dialCancel()

	conn, err := grpc.DialContext(dialCtx, "localhost:50050",
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithKeepaliveParams(keepalive.ClientParameters{
			Time:                1 * time.Minute,
			Timeout:             10 * time.Second,
			PermitWithoutStream: true,
		}),
		grpc.WithDefaultCallOptions(grpc.ForceCodec(pb.JsonCodec{})),
		grpc.WithConnectParams(grpc.ConnectParams{
			Backoff:           backoff.DefaultConfig,
			MinConnectTimeout: 5 * time.Second,
		}),
	)
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	client := pb.NewFactorizerServiceClient(conn)

	priorities := []pb.Priority{
		pb.Priority_HIGH,
		pb.Priority_MEDIUM,
		pb.Priority_LOW,
	}

	numbers := [][]string{
		{"170141183460469231731687303715884105727"},
		{"1234567890", "9876543210"},
		{"99999999999999999999999999999999999999999999999999"},
	}

	for i, pri := range priorities {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)

		resp, err := client.Factorize(ctx, &pb.FactorizeRequest{
			Numbers:  numbers[i],
			Priority: pri,
		})
		cancel()
		if err != nil {
			log.Fatalf("Factorize failed: %v", err)
		}

		fmt.Printf("\n===== Priority: %s =====\n", pri.String())
		for _, r := range resp.Results {
			if r.Error != "" {
				fmt.Printf("  %s → ERROR: %s\n", r.Number, r.Error)
			} else {
				verified := "✗"
				if r.Verified {
					verified = "✓"
				}
				fmt.Printf("  %s = %s  [verified: %s]\n", r.Number, pb.FormatFactors(r.Factors), verified)
			}
		}
	}

	fmt.Println("\n========== Demo Complete ==========")

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
	log.Println("Shutting down...")
}
