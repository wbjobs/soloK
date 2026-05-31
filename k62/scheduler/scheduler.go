package scheduler

import (
	"context"
	"fmt"
	"log"
	"net"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/solok/k62/cache"
	pb "github.com/solok/k62/pb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/backoff"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/keepalive"
)

const (
	TaskTimeout       = 30 * time.Second
	MaxRetries        = 2
	RetryDelay        = 500 * time.Millisecond
	DialTimeout       = 5 * time.Second
	WorkerTTL         = 30 * time.Second
)

type workerEntry struct {
	id      string
	addr    string
	client  pb.WorkerServiceClient
	conn    *grpc.ClientConn
	lastHB  time.Time
	busy    bool
}

type taskState struct {
	taskID     string
	number     string
	priority   pb.Priority
	retryCount int
	result     *pb.FactorizationResult
	err        error
	completed  bool
}

type Scheduler struct {
	pb.UnimplementedFactorizerServiceServer
	pb.UnimplementedRegistryServiceServer
	cache      cache.Cache
	server     *grpc.Server
	taskCounter atomic.Uint64
	schedulerID string

	mu        sync.RWMutex
	workers   map[string]*workerEntry
	rrIndex   atomic.Uint64
}

func NewScheduler(workerAddrs []string, cacheClient cache.Cache) *Scheduler {
	s := &Scheduler{
		cache:       cacheClient,
		workers:     make(map[string]*workerEntry),
		schedulerID: fmt.Sprintf("scheduler-%d", time.Now().UnixMilli()),
	}
	return s
}

func (s *Scheduler) ConnectToWorkers() error {
	return nil
}

func (s *Scheduler) connectToWorker(addr string) (pb.WorkerServiceClient, *grpc.ClientConn, error) {
	dialCtx, dialCancel := context.WithTimeout(context.Background(), DialTimeout)
	defer dialCancel()

	conn, err := grpc.DialContext(dialCtx, addr,
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
		return nil, nil, err
	}
	client := pb.NewWorkerServiceClient(conn)
	return client, conn, nil
}

func (s *Scheduler) Register(ctx context.Context, req *pb.RegisterRequest) (*pb.RegisterResponse, error) {
	log.Printf("[Scheduler] Registration request from Worker-%s at %s", req.WorkerId, req.WorkerAddr)

	client, conn, err := s.connectToWorker(req.WorkerAddr)
	if err != nil {
		log.Printf("[Scheduler] Failed to connect to Worker-%s at %s: %v", req.WorkerId, req.WorkerAddr, err)
		return &pb.RegisterResponse{
			Accepted:    false,
			SchedulerId: s.schedulerID,
			Error:       fmt.Sprintf("failed to connect: %v", err),
		}, nil
	}

	s.mu.Lock()
	if existing, ok := s.workers[req.WorkerId]; ok {
		existing.conn.Close()
	}
	s.workers[req.WorkerId] = &workerEntry{
		id:     req.WorkerId,
		addr:   req.WorkerAddr,
		client: client,
		conn:   conn,
		lastHB: time.Now(),
		busy:   false,
	}
	s.mu.Unlock()

	log.Printf("[Scheduler] Worker-%s registered (total workers: %d)", req.WorkerId, len(s.workers))
	return &pb.RegisterResponse{
		Accepted:    true,
		SchedulerId: s.schedulerID,
	}, nil
}

func (s *Scheduler) Heartbeat(ctx context.Context, req *pb.HeartbeatRequest) (*pb.HeartbeatResponse, error) {
	s.mu.Lock()
	if w, ok := s.workers[req.WorkerId]; ok {
		w.lastHB = time.Now()
		w.busy = req.Busy
	} else {
		s.mu.Unlock()
		return &pb.HeartbeatResponse{Acknowledged: false}, nil
	}
	s.mu.Unlock()

	return &pb.HeartbeatResponse{Acknowledged: true}, nil
}

func (s *Scheduler) removeStaleWorkers() {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	for id, w := range s.workers {
		if now.Sub(w.lastHB) > WorkerTTL {
			log.Printf("[Scheduler] Removing stale worker %s (last heartbeat %v ago)", id, now.Sub(w.lastHB))
			w.conn.Close()
			delete(s.workers, id)
		}
	}
}

func (s *Scheduler) nextWorker() pb.WorkerServiceClient {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var available []*workerEntry
	for _, w := range s.workers {
		if !w.busy {
			available = append(available, w)
		}
	}

	if len(available) == 0 {
		if len(s.workers) > 0 {
			ids := make([]string, 0, len(s.workers))
			for _, w := range s.workers {
				ids = append(ids, w.id)
			}
			idx := s.rrIndex.Add(1) % uint64(len(ids))
			return s.workers[ids[idx]].client
		}
		return nil
	}

	sort.Slice(available, func(i, j int) bool {
		return available[i].id < available[j].id
	})
	idx := s.rrIndex.Add(1) % uint64(len(available))
	return available[idx].client
}

func (s *Scheduler) Factorize(ctx context.Context, req *pb.FactorizeRequest) (*pb.FactorizeResponse, error) {
	priority := req.GetPriority()
	log.Printf("[Scheduler] Received factorize request with %d numbers (priority=%s)", len(req.Numbers), priority.String())

	s.removeStaleWorkers()

	var cachedResults []*pb.FactorizationResult
	var pendingNumbers []string

	for _, num := range req.Numbers {
		entry, err := s.cache.Get(ctx, num)
		if err != nil {
			log.Printf("[Scheduler] Cache lookup error for %s: %v", num, err)
		}
		if entry != nil {
			result := &pb.FactorizationResult{
				Number:   num,
				Factors:  entry.Factors,
				Error:    entry.Error,
				Verified: true,
			}
			cachedResults = append(cachedResults, result)
			log.Printf("[Scheduler] Cache hit for %s", num)
		} else {
			pendingNumbers = append(pendingNumbers, num)
		}
	}

	if len(pendingNumbers) == 0 {
		log.Printf("[Scheduler] All results from cache")
		return &pb.FactorizeResponse{Results: cachedResults}, nil
	}

	taskResults := s.dispatchTasks(ctx, pendingNumbers, priority)

	var allResults []*pb.FactorizationResult
	allResults = append(allResults, cachedResults...)
	for _, tr := range taskResults {
		allResults = append(allResults, tr.result)
	}

	log.Printf("[Scheduler] Completed: %d from cache, %d computed", len(cachedResults), len(taskResults))
	return &pb.FactorizeResponse{Results: allResults}, nil
}

func (s *Scheduler) dispatchTasks(parentCtx context.Context, numbers []string, priority pb.Priority) []*taskState {
	states := make([]*taskState, len(numbers))
	for i, num := range numbers {
		states[i] = &taskState{
			taskID:   fmt.Sprintf("task-%d", s.taskCounter.Add(1)),
			number:   num,
			priority: priority,
		}
	}

	sort.Slice(states, func(i, j int) bool {
		return states[i].priority > states[j].priority
	})

	var wg sync.WaitGroup
	for i := range states {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			states[idx] = s.executeWithRetry(parentCtx, states[idx])
		}(i)
	}
	wg.Wait()

	return states
}

func (s *Scheduler) executeWithRetry(parentCtx context.Context, ts *taskState) *taskState {
	for attempt := 0; attempt <= MaxRetries; attempt++ {
		ts.retryCount = attempt
		result, err := s.executeSingle(parentCtx, ts)
		if err == nil {
			ts.result = result
			ts.err = nil
			ts.completed = true
			return ts
		}

		ts.err = err
		log.Printf("[Scheduler] Task %s attempt %d failed for %s: %v", ts.taskID, attempt+1, ts.number, err)

		if attempt < MaxRetries {
			select {
			case <-parentCtx.Done():
				ts.result = &pb.FactorizationResult{
					Number: ts.number,
					Error:  "parent context cancelled",
				}
				ts.completed = true
				return ts
			case <-time.After(RetryDelay):
			}
		}
	}

	ts.result = &pb.FactorizationResult{
		Number: ts.number,
		Error:  fmt.Sprintf("failed after %d retries: %v", MaxRetries, ts.err),
	}
	ts.completed = true
	return ts
}

func (s *Scheduler) executeSingle(parentCtx context.Context, ts *taskState) (*pb.FactorizationResult, error) {
	taskCtx, cancel := context.WithTimeout(parentCtx, TaskTimeout)
	defer cancel()

	worker := s.nextWorker()
	if worker == nil {
		return nil, fmt.Errorf("no available workers")
	}

	req := &pb.TaskRequest{
		TaskId:     ts.taskID,
		Number:     ts.number,
		RetryCount: int32(ts.retryCount),
		Priority:   ts.priority,
	}

	log.Printf("[Scheduler] Dispatching task %s (%s, priority=%s) attempt %d",
		ts.taskID, ts.number, ts.priority.String(), ts.retryCount+1)

	resp, err := worker.ExecuteTask(taskCtx, req)
	if err != nil {
		return nil, fmt.Errorf("worker execute failed: %w", err)
	}

	result := &pb.FactorizationResult{
		Number:   resp.Number,
		Factors:  resp.Factors,
		Error:    resp.Error,
		Verified: resp.Verified,
	}

	if resp.Error != "" {
		return result, fmt.Errorf("computation error: %s", resp.Error)
	}

	return result, nil
}

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

func (s *Scheduler) Start(addr string) error {
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("scheduler listen failed: %w", err)
	}
	s.server = grpc.NewServer(
		grpc.KeepaliveParams(serverKeepaliveParams),
		grpc.KeepaliveEnforcementPolicy(serverKeepalivePolicy),
		grpc.ForceServerCodec(pb.JsonCodec{}),
	)
	pb.RegisterFactorizerServiceServer(s.server, s)
	pb.RegisterRegistryServiceServer(s.server, s)

	go s.staleWorkerLoop()

	log.Printf("[Scheduler] Starting on %s", addr)
	return s.server.Serve(lis)
}

func (s *Scheduler) staleWorkerLoop() {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		s.removeStaleWorkers()
	}
}

func (s *Scheduler) Stop() {
	if s.server != nil {
		log.Printf("[Scheduler] Stopping")
		s.server.GracefulStop()
	}
	s.mu.Lock()
	for _, w := range s.workers {
		w.conn.Close()
	}
	s.mu.Unlock()
}

func (s *Scheduler) GetWorkerCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.workers)
}
