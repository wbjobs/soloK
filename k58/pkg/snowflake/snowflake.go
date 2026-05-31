package snowflake

import (
	"context"
	"errors"
	"fmt"
	"net"
	"sync"
	"time"

	clientv3 "go.etcd.io/etcd/client/v3"
)

const (
	timestampBits     = uint(39)
	bizTypeBits     = uint(2)
	shardKeyBits    = uint(10)
	workerIDBits    = uint(7)
	sequenceBits   = uint(5)

	maxBizType    = int64(-1) ^ (int64(-1) << bizTypeBits)
	maxShardKey   = int64(-1) ^ (int64(-1) << shardKeyBits)
	maxWorkerID  = int64(-1) ^ (int64(-1) << workerIDBits)
	maxSequence  = int64(-1) ^ (int64(-1) << sequenceBits)

	sequenceShift  = uint(0)
	workerIDShift = sequenceBits
	shardKeyShift = workerIDShift + workerIDBits
	bizTypeShift  = shardKeyShift + shardKeyBits
	timestampShift = bizTypeShift + bizTypeBits

	epoch            = int64(1704067200000)
	etcdWorkerPrefix = "/idgenerator/snowflake/workers/"
	leaseTTL         = 30
	clockBackwardTolerance = int64(5)
	clockBackwardMaxWait   = int64(500)
)

type SnowflakeGenerator struct {
	mu            sync.Mutex
	bizType       int64
	shardKey      int64
	workerID      int64
	sequence      int64
	lastTime      int64
	etcdClient    *clientv3.Client
	leaseID       clientv3.LeaseID
	ctx           context.Context
	cancel        context.CancelFunc
	conflictCnt   int64
	backwardCount int64
}

type ParsedID struct {
	Timestamp  int64
	Time       time.Time
	BizType    int64
	ShardKey   int64
	WorkerID   int64
	Sequence   int64
}

func NewSnowflakeGenerator(etcdEndpoints []string, bizType int64, shardKey int64) (*SnowflakeGenerator, error) {
	if bizType < 0 || bizType > maxBizType {
		return nil, fmt.Errorf("bizType must be between 0 and %d", maxBizType)
	}
	if shardKey < 0 || shardKey > maxShardKey {
		return nil, fmt.Errorf("shardKey must be between 0 and %d", maxShardKey)
	}

	cli, err := clientv3.New(clientv3.Config{
		Endpoints:   etcdEndpoints,
		DialTimeout: 5 * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect etcd: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	gen := &SnowflakeGenerator{
		etcdClient: cli,
		ctx:        ctx,
		cancel:     cancel,
		bizType:    bizType,
		shardKey:   shardKey,
	}

	if err := gen.registerWorker(); err != nil {
		cancel()
		cli.Close()
		return nil, err
	}

	go gen.keepAlive()
	return gen, nil
}

func (s *SnowflakeGenerator) registerWorker() error {
	hostname, _ := getHostname()
	for attempt := 0; attempt < 10; attempt++ {
		workerID := time.Now().UnixNano() % (maxWorkerID + 1)
		key := fmt.Sprintf("%s%d", etcdWorkerPrefix, workerID)

		leaseResp, err := s.etcdClient.Grant(s.ctx, leaseTTL)
		if err != nil {
			return err
		}

		txn := s.etcdClient.Txn(s.ctx)
		txn.If(clientv3.Compare(clientv3.CreateRevision(key), "=", 0)).
			Then(clientv3.OpPut(key, hostname, clientv3.WithLease(leaseResp.ID))).
			Else(clientv3.OpGet(key))

		resp, err := txn.Commit()
		if err != nil {
			return err
		}

		if resp.Succeeded {
			s.workerID = workerID
			s.leaseID = leaseResp.ID
			return nil
		}

		s.conflictCnt++
		time.Sleep(100 * time.Millisecond)
	}

	return errors.New("failed to allocate worker ID after multiple attempts")
}

func (s *SnowflakeGenerator) keepAlive() {
	ch, err := s.etcdClient.KeepAlive(s.ctx, s.leaseID)
	if err != nil {
		return
	}

	for range ch {
	}
}

func (s *SnowflakeGenerator) NextID() (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UnixMilli()

	if now < s.lastTime {
		offset := s.lastTime - now
		if offset <= clockBackwardTolerance {
			waited := int64(0)
			for now < s.lastTime && waited < clockBackwardMaxWait {
				time.Sleep(time.Millisecond)
				now = time.Now().UnixMilli()
				waited++
			}
			if now < s.lastTime {
				s.backwardCount++
				return 0, fmt.Errorf("clock moved backwards %dms, exceeded tolerance", s.lastTime-now)
			}
		} else {
			s.backwardCount++
			return 0, fmt.Errorf("clock moved backwards %dms, exceeded max tolerance %dms", offset, clockBackwardTolerance)
		}
	}

	if now == s.lastTime {
		s.sequence = (s.sequence + 1) & maxSequence
		if s.sequence == 0 {
			for now <= s.lastTime {
				now = time.Now().UnixMilli()
			}
		}
	} else {
		s.sequence = 0
	}

	s.lastTime = now
	id := ((now - epoch) << timestampShift) |
		(s.bizType << bizTypeShift) |
		(s.shardKey << shardKeyShift) |
		(s.workerID << workerIDShift) |
		s.sequence

	return id, nil
}

func ParseID(id int64) *ParsedID {
	timestamp := (id >> timestampShift) + epoch
	return &ParsedID{
		Timestamp: timestamp,
		Time:      time.UnixMilli(timestamp),
		BizType:   (id >> bizTypeShift) & maxBizType,
		ShardKey:  (id >> shardKeyShift) & maxShardKey,
		WorkerID:  (id >> workerIDShift) & maxWorkerID,
		Sequence:  id & maxSequence,
	}
}

func (s *SnowflakeGenerator) BatchIDs(count int) ([]int64, error) {
	if count <= 0 || count > 1000 {
		return nil, errors.New("count must be between 1 and 1000")
	}

	ids := make([]int64, count)
	for i := 0; i < count; i++ {
		id, err := s.NextID()
		if err != nil {
			return nil, err
		}
		ids[i] = id
	}

	return ids, nil
}

func (s *SnowflakeGenerator) GetWorkerID() int64 {
	return s.workerID
}

func (s *SnowflakeGenerator) GetBizType() int64 {
	return s.bizType
}

func (s *SnowflakeGenerator) GetShardKey() int64 {
	return s.shardKey
}

func (s *SnowflakeGenerator) GetConflictCount() int64 {
	return s.conflictCnt
}

func (s *SnowflakeGenerator) GetBackwardCount() int64 {
	return s.backwardCount
}

func (s *SnowflakeGenerator) Close() {
	s.cancel()
	if s.etcdClient != nil {
		s.etcdClient.Revoke(context.Background(), s.leaseID)
		s.etcdClient.Close()
	}
}

func getHostname() (string, error) {
	hostname, err := net.LookupHost("localhost")
	if err != nil {
		return "unknown", nil
	}
	if len(hostname) > 0 {
		return hostname[0], nil
	}
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "unknown", nil
	}
	for _, addr := range addrs {
		if ipNet, ok := addr.(*net.IPNet); ok && !ipNet.IP.IsLoopback() {
			if ipNet.IP.To4() != nil {
				return ipNet.IP.String(), nil
			}
		}
	}
	return "unknown", nil
}
