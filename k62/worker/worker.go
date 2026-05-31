package worker

import (
	"context"
	"fmt"
	"log"
	"net"
	"sync"
	"time"

	"github.com/solok/k62/algorithm"
	"github.com/solok/k62/cache"
	pb "github.com/solok/k62/pb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/keepalive"
)

var (
	serverKeepaliveParams = keepalive.ServerParameters{
		MaxConnectionIdle:     5 * time.Minute,
		MaxConnectionAge:      30 * time.Minute,
		MaxConnectionAgeGrace: 5 * time.Second,
		Time:                  2 * time.Hour,
		Timeout:               20 * time.Second,
	}

	serverKeepalivePolicy = keepalive.EnforcementPolicy{
		MinTime:             5 * time.Second,
		PermitWithoutStream: true,
	}
)

type Worker struct {
	pb.UnimplementedWorkerServiceServer
	schedulerAddr string
	id            string
	addr          string
	cache         cache.Cache
	server        *grpc.Server
	mu            sync.Mutex
	busy          bool
	registryConn  *grpc.ClientConn
	registryCli   pb.RegistryServiceClient
	stopHeartbeat chan struct{}
}

func NewWorker(id string, addr string, cacheClient cache.Cache) *Worker {
	return &Worker{
		id:            id,
		addr:          addr,
		cache:         cacheClient,
		stopHeartbeat: make(chan struct{}),
	}
}

func (w *Worker) SetSchedulerAddr(addr string) {
	w.schedulerAddr = addr
}

const (
	WorkerComputeTimeout = 25 * time.Second
	HeartbeatInterval    = 10 * time.Second
)

func (w *Worker) ExecuteTask(ctx context.Context, req *pb.TaskRequest) (*pb.TaskResponse, error) {
	w.mu.Lock()
	w.busy = true
	w.mu.Unlock()
	defer func() {
		w.mu.Lock()
		w.busy = false
		w.mu.Unlock()
	}()

	log.Printf("[Worker-%s] Received task %s: factorize %s (priority=%s, retry=%d)",
		w.id, req.TaskId, req.Number, req.Priority.String(), req.RetryCount)

	resp := &pb.TaskResponse{
		TaskId: req.TaskId,
		Number: req.Number,
	}

	cachedEntry, err := w.cache.Get(ctx, req.Number)
	if err != nil {
		log.Printf("[Worker-%s] Cache lookup error for %s: %v", w.id, req.Number, err)
	}
	if cachedEntry != nil {
		log.Printf("[Worker-%s] Cache hit for %s", w.id, req.Number)
		resp.Factors = cachedEntry.Factors
		if cachedEntry.Error != "" {
			resp.Error = cachedEntry.Error
		}
		resp.Verified = algorithm.VerifyFactorization(req.Number, resp.Factors)
		return resp, nil
	}

	computeCtx, cancel := context.WithTimeout(ctx, WorkerComputeTimeout)
	defer cancel()

	factors, factorErr := algorithm.FactorizeStringsWithContext(computeCtx, req.Number)
	if factorErr != nil {
		resp.Error = factorErr.Error()
		log.Printf("[Worker-%s] Factorization failed for %s: %v", w.id, req.Number, factorErr)
	} else {
		resp.Factors = factors
		resp.Verified = algorithm.VerifyFactorization(req.Number, factors)
		log.Printf("[Worker-%s] Factorized %s = %v (verified=%v)", w.id, req.Number, factors, resp.Verified)
	}

	cacheEntry := &cache.CacheEntry{
		Number:  req.Number,
		Factors: factors,
	}
	if factorErr != nil {
		cacheEntry.Error = factorErr.Error()
	}
	if cacheErr := w.cache.Set(ctx, cacheEntry); cacheErr != nil {
		log.Printf("[Worker-%s] Failed to cache result for %s: %v", w.id, req.Number, cacheErr)
	} else {
		log.Printf("[Worker-%s] Cached result for %s", w.id, req.Number)
	}

	return resp, nil
}

func (w *Worker) RegisterWithScheduler() error {
	if w.schedulerAddr == "" {
		log.Printf("[Worker-%s] No scheduler address configured, skipping registration", w.id)
		return nil
	}

	conn, err := grpc.Dial(w.schedulerAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithDefaultCallOptions(grpc.ForceCodec(pb.JsonCodec{})),
	)
	if err != nil {
		return fmt.Errorf("failed to connect to scheduler: %w", err)
	}
	w.registryConn = conn
	w.registryCli = pb.NewRegistryServiceClient(conn)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	host, port, _ := net.SplitHostPort(w.addr)
	externalAddr := w.addr
	if host == "" || host == "0.0.0.0" {
		externalAddr = fmt.Sprintf("localhost:%s", port)
	}

	resp, err := w.registryCli.Register(ctx, &pb.RegisterRequest{
		WorkerId:   w.id,
		WorkerAddr: externalAddr,
	})
	if err != nil {
		conn.Close()
		w.registryConn = nil
		w.registryCli = nil
		return fmt.Errorf("registration failed: %w", err)
	}

	if !resp.Accepted {
		conn.Close()
		w.registryConn = nil
		w.registryCli = nil
		return fmt.Errorf("registration rejected: %s", resp.Error)
	}

	log.Printf("[Worker-%s] Registered with scheduler %s", w.id, resp.SchedulerId)
	go w.heartbeatLoop()
	return nil
}

func (w *Worker) heartbeatLoop() {
	ticker := time.NewTicker(HeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-w.stopHeartbeat:
			return
		case <-ticker.C:
			w.mu.Lock()
			busy := w.busy
			w.mu.Unlock()

			if w.registryCli == nil {
				continue
			}

			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			_, err := w.registryCli.Heartbeat(ctx, &pb.HeartbeatRequest{
				WorkerId: w.id,
				Busy:     busy,
			})
			cancel()
			if err != nil {
				log.Printf("[Worker-%s] Heartbeat failed: %v", w.id, err)
			}
		}
	}
}

func (w *Worker) IsBusy() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.busy
}

func (w *Worker) Start() error {
	lis, err := net.Listen("tcp", w.addr)
	if err != nil {
		return fmt.Errorf("worker-%s listen failed: %w", w.id, err)
	}
	w.server = grpc.NewServer(
		grpc.KeepaliveParams(serverKeepaliveParams),
		grpc.KeepaliveEnforcementPolicy(serverKeepalivePolicy),
		grpc.ForceServerCodec(pb.JsonCodec{}),
	)
	pb.RegisterWorkerServiceServer(w.server, w)

	log.Printf("[Worker-%s] Starting on %s", w.id, w.addr)
	return w.server.Serve(lis)
}

func (w *Worker) Stop() {
	close(w.stopHeartbeat)
	if w.registryConn != nil {
		w.registryConn.Close()
	}
	if w.server != nil {
		log.Printf("[Worker-%s] Stopping", w.id)
		w.server.GracefulStop()
	}
}

func (w *Worker) GetAddr() string {
	return w.addr
}

func (w *Worker) GetID() string {
	return w.id
}

type WorkerPool struct {
	workers []*Worker
}

func NewWorkerPool(count int, baseAddr string, cacheClient cache.Cache) *WorkerPool {
	pool := &WorkerPool{
		workers: make([]*Worker, count),
	}
	_, port, _ := net.SplitHostPort(baseAddr)
	host := "localhost"
	if h, p, err := net.SplitHostPort(baseAddr); err == nil {
		host = h
		_ = p
	}

	for i := 0; i < count; i++ {
		addr := fmt.Sprintf("%s:%d", host, mustParsePort(port)+i)
		pool.workers[i] = NewWorker(
			fmt.Sprintf("W%d", i),
			addr,
			cacheClient,
		)
	}
	return pool
}

func mustParsePort(port string) int {
	var p int
	fmt.Sscanf(port, "%d", &p)
	if p == 0 {
		p = 50051
	}
	return p
}

func (wp *WorkerPool) SetSchedulerAddr(addr string) {
	for _, w := range wp.workers {
		w.SetSchedulerAddr(addr)
	}
}

func (wp *WorkerPool) StartAll() error {
	for _, w := range wp.workers {
		go func(worker *Worker) {
			if err := worker.Start(); err != nil {
				log.Printf("Worker %s error: %v", worker.GetID(), err)
			}
		}(w)
	}
	time.Sleep(500 * time.Millisecond)
	return nil
}

func (wp *WorkerPool) RegisterAllWithScheduler() error {
	for _, w := range wp.workers {
		if err := w.RegisterWithScheduler(); err != nil {
			log.Printf("[WorkerPool] Worker %s registration failed: %v", w.GetID(), err)
		}
	}
	return nil
}

func (wp *WorkerPool) StopAll() {
	var wg sync.WaitGroup
	for _, w := range wp.workers {
		wg.Add(1)
		go func(worker *Worker) {
			defer wg.Done()
			worker.Stop()
		}(w)
	}
	wg.Wait()
}

func (wp *WorkerPool) GetAddrs() []string {
	addrs := make([]string, len(wp.workers))
	for i, w := range wp.workers {
		addrs[i] = w.addr
	}
	return addrs
}
