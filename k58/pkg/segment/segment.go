package segment

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"sync"
	"sync/atomic"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

const (
	defaultStep   = 1000
	defaultBizTag = "default"
	maxBatchCount = 1000
)

type Segment struct {
	StartID int64
	EndID   int64
	CurID   int64
}

type SegmentGenerator struct {
	mu        sync.Mutex
	db        *sql.DB
	bizTag    string
	step      int64
	segment   *Segment
	nextSeg   *Segment
	loading   int32
	readyChan chan struct{}
}

func NewSegmentGenerator(dsn, bizTag string, step int64) (*SegmentGenerator, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to connect mysql: %w", err)
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping mysql: %w", err)
	}

	if bizTag == "" {
		bizTag = defaultBizTag
	}

	if step <= 0 {
		step = defaultStep
	}

	gen := &SegmentGenerator{
		db:        db,
		bizTag:    bizTag,
		step:      step,
		readyChan: make(chan struct{}, 1),
	}

	if err := gen.initTable(); err != nil {
		return nil, err
	}

	if err := gen.loadNextSegment(); err != nil {
		return nil, err
	}

	gen.segment = gen.nextSeg
	gen.nextSeg = nil

	return gen, nil
}

func (s *SegmentGenerator) initTable() error {
	createTableSQL := `
	CREATE TABLE IF NOT EXISTS id_segments (
		biz_tag VARCHAR(128) NOT NULL PRIMARY KEY,
		max_id BIGINT NOT NULL DEFAULT 0,
		step INT NOT NULL DEFAULT 1000,
		description VARCHAR(256) NULL,
		updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`

	_, err := s.db.Exec(createTableSQL)
	if err != nil {
		return fmt.Errorf("failed to create table: %w", err)
	}

	var exists int
	err = s.db.QueryRow("SELECT COUNT(*) FROM id_segments WHERE biz_tag = ?", s.bizTag).Scan(&exists)
	if err != nil {
		return err
	}

	if exists == 0 {
		_, err = s.db.Exec("INSERT INTO id_segments (biz_tag, max_id, step, description) VALUES (?, 0, ?, 'default segment')", s.bizTag, s.step)
		if err != nil {
			return fmt.Errorf("failed to insert biz_tag: %w", err)
		}
	}

	return nil
}

func (s *SegmentGenerator) loadNextSegment() error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var maxID int64
	err = tx.QueryRow("SELECT max_id FROM id_segments WHERE biz_tag = ? FOR UPDATE", s.bizTag).Scan(&maxID)
	if err != nil {
		return err
	}

	newMaxID := maxID + s.step
	_, err = tx.Exec("UPDATE id_segments SET max_id = ? WHERE biz_tag = ?", newMaxID, s.bizTag)
	if err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	s.nextSeg = &Segment{
		StartID: maxID,
		EndID:   newMaxID,
		CurID:   maxID,
	}

	return nil
}

func (s *SegmentGenerator) tryAsyncLoad() {
	if !atomic.CompareAndSwapInt32(&s.loading, 0, 1) {
		return
	}

	go func() {
		defer atomic.StoreInt32(&s.loading, 0)

		seg := func() *Segment {
			s.mu.Lock()
			defer s.mu.Unlock()
			return s.segment
		}()

		if seg == nil {
			return
		}

		threshold := seg.EndID - seg.StartID
		threshold = threshold * 30 / 100
		if threshold < 100 {
			threshold = 100
		}

		if seg.CurID-seg.StartID < threshold {
			return
		}

		var nextSeg *Segment
		tx, err := s.db.Begin()
		if err != nil {
			log.Printf("async load segment begin tx failed: %v", err)
			return
		}
		defer tx.Rollback()

		var maxID int64
		err = tx.QueryRow("SELECT max_id FROM id_segments WHERE biz_tag = ? FOR UPDATE", s.bizTag).Scan(&maxID)
		if err != nil {
			log.Printf("async load segment query failed: %v", err)
			return
		}

		newMaxID := maxID + s.step
		_, err = tx.Exec("UPDATE id_segments SET max_id = ? WHERE biz_tag = ?", newMaxID, s.bizTag)
		if err != nil {
			log.Printf("async load segment update failed: %v", err)
			return
		}

		if err := tx.Commit(); err != nil {
			log.Printf("async load segment commit failed: %v", err)
			return
		}

		nextSeg = &Segment{
			StartID: maxID,
			EndID:   newMaxID,
			CurID:   maxID,
		}

		s.mu.Lock()
		if s.nextSeg == nil {
			s.nextSeg = nextSeg
		}
		s.mu.Unlock()

		select {
		case s.readyChan <- struct{}{}:
		default:
		}
	}()
}

func (s *SegmentGenerator) switchSegment() error {
	if s.nextSeg != nil {
		s.segment = s.nextSeg
		s.nextSeg = nil
		return nil
	}

	if err := s.loadNextSegment(); err != nil {
		return err
	}

	s.segment = s.nextSeg
	s.nextSeg = nil
	return nil
}

func (s *SegmentGenerator) NextID() (int64, error) {
	s.mu.Lock()

	if s.segment == nil {
		s.mu.Unlock()
		return 0, errors.New("no segment available")
	}

	if s.segment.CurID < s.segment.EndID {
		id := s.segment.CurID
		s.segment.CurID++

		if s.nextSeg == nil {
			s.mu.Unlock()
			s.tryAsyncLoad()
			return id, nil
		}

		s.mu.Unlock()
		return id, nil
	}

	if err := s.switchSegment(); err != nil {
		s.mu.Unlock()
		return 0, err
	}

	id := s.segment.CurID
	s.segment.CurID++

	if s.nextSeg == nil {
		s.mu.Unlock()
		s.tryAsyncLoad()
		return id, nil
	}

	s.mu.Unlock()
	return id, nil
}

func (s *SegmentGenerator) BatchIDs(count int) ([]int64, error) {
	if count <= 0 || count > maxBatchCount {
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

func (s *SegmentGenerator) Close() {
	if s.db != nil {
		s.db.Close()
	}
}

func (s *SegmentGenerator) GetCurrentSegment() *Segment {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.segment == nil {
		return nil
	}
	return &Segment{
		StartID: s.segment.StartID,
		EndID:   s.segment.EndID,
		CurID:   s.segment.CurID,
	}
}
