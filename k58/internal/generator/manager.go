package generator

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"idgenerator/internal/config"
	"idgenerator/internal/health"
	"idgenerator/internal/metrics"
	"idgenerator/pkg/segment"
	"idgenerator/pkg/snowflake"
	"idgenerator/pkg/uuid"
)

type GeneratorManager struct {
	mu            sync.RWMutex
	snowflakeGen  *snowflake.SnowflakeGenerator
	segmentGen    *segment.SegmentGenerator
	uuidGen       *uuid.UUIDGenerator
	configMgr     *config.Manager
	metrics       *metrics.Metrics
	healthMgr     *health.Manager
}

func NewGeneratorManager(cfgMgr *config.Manager, m *metrics.Metrics, hm *health.Manager) (*GeneratorManager, error) {
	gm := &GeneratorManager{
		configMgr: cfgMgr,
		metrics:   m,
		healthMgr: hm,
		uuidGen:   uuid.NewUUIDGenerator(),
	}

	cfg := cfgMgr.Get()

	if err := gm.initSnowflake(cfg); err != nil {
		log.Printf("Warning: failed to init snowflake: %v", err)
	}

	if err := gm.initSegment(cfg); err != nil {
		log.Printf("Warning: failed to init segment: %v", err)
	}

	gm.registerHealthChecks()

	cfgMgr.OnChange(gm.onConfigChange)

	return gm, nil
}

func (gm *GeneratorManager) initSnowflake(cfg *config.Config) error {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	if gm.snowflakeGen != nil {
		gm.snowflakeGen.Close()
	}

	gen, err := snowflake.NewSnowflakeGenerator(cfg.EtcdEndpoints, cfg.BizType, cfg.ShardKey)
	if err != nil {
		return err
	}

	gm.snowflakeGen = gen

	if gm.metrics != nil {
		gm.metrics.AddWorkerConflicts(gen.GetConflictCount())
	}

	return nil
}

func (gm *GeneratorManager) initSegment(cfg *config.Config) error {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	if gm.segmentGen != nil {
		gm.segmentGen.Close()
	}

	gen, err := segment.NewSegmentGenerator(cfg.MySQLDSN, cfg.BizTag, cfg.SegmentStep)
	if err != nil {
		return err
	}

	gm.segmentGen = gen
	return nil
}

func (gm *GeneratorManager) onConfigChange(cfg *config.Config) {
	log.Println("Config changed, reinitializing generators...")

	if err := gm.initSnowflake(cfg); err != nil {
		log.Printf("Warning: failed to reinit snowflake: %v", err)
	}

	if err := gm.initSegment(cfg); err != nil {
		log.Printf("Warning: failed to reinit segment: %v", err)
	}
}

func (gm *GeneratorManager) GenerateSnowflake(count int) ([]int64, error) {
	start := time.Now()
	defer func() {
		if gm.metrics != nil {
			gm.metrics.ObserveDuration("snowflake", time.Since(start))
		}
	}()

	gm.mu.RLock()
	defer gm.mu.RUnlock()

	if gm.snowflakeGen == nil {
		if gm.metrics != nil {
			gm.metrics.IncRequests("snowflake", false)
		}
		return nil, fmt.Errorf("snowflake generator not initialized")
	}

	ids, err := gm.snowflakeGen.BatchIDs(count)
	if gm.metrics != nil {
		gm.metrics.IncRequests("snowflake", err == nil)
	}

	return ids, err
}

func (gm *GeneratorManager) GenerateSegment(count int) ([]int64, error) {
	start := time.Now()
	defer func() {
		if gm.metrics != nil {
			gm.metrics.ObserveDuration("segment", time.Since(start))
		}
	}()

	gm.mu.RLock()
	defer gm.mu.RUnlock()

	if gm.segmentGen == nil {
		if gm.metrics != nil {
			gm.metrics.IncRequests("segment", false)
		}
		return nil, fmt.Errorf("segment generator not initialized")
	}

	ids, err := gm.segmentGen.BatchIDs(count)
	if gm.metrics != nil {
		gm.metrics.IncRequests("segment", err == nil)
	}

	return ids, err
}

func (gm *GeneratorManager) GenerateUUID(count int) ([]string, error) {
	start := time.Now()
	defer func() {
		if gm.metrics != nil {
			gm.metrics.ObserveDuration("uuid", time.Since(start))
		}
	}()

	uuids, err := gm.uuidGen.BatchUUIDs(count)
	if gm.metrics != nil {
		gm.metrics.IncRequests("uuid", err == nil)
	}

	return uuids, err
}

func (gm *GeneratorManager) registerHealthChecks() {
	if gm.healthMgr == nil {
		return
	}

	gm.healthMgr.Register(health.NewSimpleChecker("snowflake", func(ctx context.Context) (bool, string) {
		gm.mu.RLock()
		defer gm.mu.RUnlock()
		if gm.snowflakeGen == nil {
			return false, "not initialized"
		}
		_, err := gm.snowflakeGen.NextID()
		return err == nil, fmt.Sprintf("worker_id: %d", gm.snowflakeGen.GetWorkerID())
	}))

	gm.healthMgr.Register(health.NewSimpleChecker("segment", func(ctx context.Context) (bool, string) {
		gm.mu.RLock()
		defer gm.mu.RUnlock()
		if gm.segmentGen == nil {
			return false, "not initialized"
		}
		seg := gm.segmentGen.GetCurrentSegment()
		if seg == nil {
			return false, "no segment"
		}
		return true, fmt.Sprintf("current: %d, end: %d", seg.CurID, seg.EndID)
	}))

	gm.healthMgr.Register(health.NewSimpleChecker("uuid", func(ctx context.Context) (bool, string) {
		_, err := gm.uuidGen.NextUUID()
		return err == nil, "ok"
	}))
}

func (gm *GeneratorManager) Close() {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	if gm.snowflakeGen != nil {
		gm.snowflakeGen.Close()
	}
	if gm.segmentGen != nil {
		gm.segmentGen.Close()
	}
	if gm.uuidGen != nil {
		gm.uuidGen.Close()
	}
}

func ParseSnowflakeID(id int64) *snowflake.ParsedID {
	return snowflake.ParseID(id)
}
