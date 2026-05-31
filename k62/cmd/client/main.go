package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"strings"
	"time"

	pb "github.com/solok/k62/pb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/backoff"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/keepalive"
)

func main() {
	addr := flag.String("addr", "localhost:50050", "Scheduler address")
	numbers := flag.String("numbers", "12345678901234567890", "Comma-separated numbers to factorize")
	priority := flag.String("priority", "MEDIUM", "Task priority: LOW, MEDIUM, HIGH")
	timeout := flag.Int("timeout", 60, "Client timeout in seconds")
	flag.Parse()

	dialCtx, dialCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer dialCancel()

	conn, err := grpc.DialContext(dialCtx, *addr,
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
		log.Fatalf("Failed to connect to scheduler: %v", err)
	}
	defer conn.Close()

	client := pb.NewFactorizerServiceClient(conn)

	numList := strings.Split(*numbers, ",")
	for i := range numList {
		numList[i] = strings.TrimSpace(numList[i])
	}

	p := pb.ParsePriority(*priority)

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*timeout)*time.Second)
	defer cancel()

	resp, err := client.Factorize(ctx, &pb.FactorizeRequest{
		Numbers:  numList,
		Priority: p,
	})
	if err != nil {
		log.Fatalf("Factorize RPC failed: %v", err)
	}

	fmt.Println("\n========== Factorization Results ==========")
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
	fmt.Println("============================================")
}
