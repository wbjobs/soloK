package storage

import (
	"encoding/json"
	"fmt"
	"sync"

	"github.com/syndtr/goleveldb/leveldb"
	"github.com/syndtr/goleveldb/leveldb/util"
)

type ConfigEntry struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Version uint64 `json:"version"`
}

type ChangeLogEntry struct {
	Key        string `json:"key"`
	OldValue   string `json:"old_value"`
	NewValue   string `json:"new_value"`
	OldVersion uint64 `json:"old_version"`
	NewVersion uint64 `json:"new_version"`
	Term       uint64 `json:"term"`
	Index      uint64 `json:"index"`
	Operator   string `json:"operator"`
	Timestamp  int64  `json:"timestamp"`
	ClientIP   string `json:"client_ip"`
}

type LevelDBStore struct {
	mu   sync.Mutex
	db   *leveldb.DB
	path string
}

func NewLevelDBStore(path string) (*LevelDBStore, error) {
	db, err := leveldb.OpenFile(path, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to open leveldb: %w", err)
	}
	return &LevelDBStore{
		db:   db,
		path: path,
	}, nil
}

func (s *LevelDBStore) Close() error {
	return s.db.Close()
}

func configKey(key string) []byte {
	return []byte("config:" + key)
}

func changeLogKey(index uint64) []byte {
	return []byte(fmt.Sprintf("changelog:%020d", index))
}

func (s *LevelDBStore) PutConfig(key, value string, expectedVersion uint64) (*ConfigEntry, error) {
	existing, err := s.getConfigInternal(key)
	if err != nil {
		return nil, err
	}

	if expectedVersion > 0 {
		if existing == nil {
			return nil, fmt.Errorf("version conflict: key %s does not exist, expected version %d", key, expectedVersion)
		}
		if existing.Version != expectedVersion {
			return nil, fmt.Errorf("version conflict: key %s current version %d, expected version %d", key, existing.Version, expectedVersion)
		}
	}

	newVersion := uint64(1)
	if existing != nil {
		newVersion = existing.Version + 1
	}

	entry := &ConfigEntry{
		Key:     key,
		Value:   value,
		Version: newVersion,
	}

	data, err := json.Marshal(entry)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal config entry: %w", err)
	}

	batch := &leveldb.Batch{}
	batch.Put(configKey(key), data)

	verHistKey := []byte(fmt.Sprintf("verhist:%s:%020d", key, newVersion))
	batch.Put(verHistKey, data)

	if err := s.db.Write(batch, nil); err != nil {
		return nil, fmt.Errorf("failed to put config: %w", err)
	}

	return entry, nil
}

func (s *LevelDBStore) GetConfig(key string) (*ConfigEntry, error) {
	return s.getConfigInternal(key)
}

func (s *LevelDBStore) getConfigInternal(key string) (*ConfigEntry, error) {
	data, err := s.db.Get(configKey(key), nil)
	if err == leveldb.ErrNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get config: %w", err)
	}

	var entry ConfigEntry
	if err := json.Unmarshal(data, &entry); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}
	return &entry, nil
}

func (s *LevelDBStore) GetConfigByVersion(key string, version uint64) (*ConfigEntry, error) {
	if version == 0 {
		return s.getConfigInternal(key)
	}

	verHistKey := []byte(fmt.Sprintf("verhist:%s:%020d", key, version))
	data, err := s.db.Get(verHistKey, nil)
	if err == leveldb.ErrNotFound {
		return s.getConfigInternal(key)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get version history: %w", err)
	}

	var entry ConfigEntry
	if err := json.Unmarshal(data, &entry); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}
	return &entry, nil
}

func (s *LevelDBStore) WriteChangeLog(changelog *ChangeLogEntry) error {
	data, err := json.Marshal(changelog)
	if err != nil {
		return fmt.Errorf("failed to marshal changelog: %w", err)
	}

	if err := s.db.Put(changeLogKey(changelog.Index), data, nil); err != nil {
		return fmt.Errorf("failed to write changelog: %w", err)
	}

	return nil
}

func (s *LevelDBStore) GetChangeLogs(fromIndex uint64, limit int) ([]*ChangeLogEntry, error) {
	startKey := changeLogKey(fromIndex)
	iter := s.db.NewIterator(&util.Range{Start: startKey}, nil)
	defer iter.Release()

	var logs []*ChangeLogEntry
	count := 0
	for iter.Next() {
		if limit > 0 && count >= limit {
			break
		}
		var entry ChangeLogEntry
		if err := json.Unmarshal(iter.Value(), &entry); err != nil {
			continue
		}
		logs = append(logs, &entry)
		count++
	}

	return logs, nil
}

func (s *LevelDBStore) GetAllConfigs() (map[string]*ConfigEntry, error) {
	prefix := []byte("config:")
	iter := s.db.NewIterator(&util.Range{Start: prefix}, nil)
	defer iter.Release()

	configs := make(map[string]*ConfigEntry)
	for iter.Next() {
		var entry ConfigEntry
		if err := json.Unmarshal(iter.Value(), &entry); err != nil {
			continue
		}
		configs[entry.Key] = &entry
	}

	return configs, nil
}

func (s *LevelDBStore) ExportAll() (map[string]*ConfigEntry, []*ChangeLogEntry, error) {
	configs, err := s.GetAllConfigs()
	if err != nil {
		return nil, nil, err
	}

	iter := s.db.NewIterator(&util.Range{Start: []byte("changelog:")}, nil)
	defer iter.Release()

	var logs []*ChangeLogEntry
	for iter.Next() {
		var entry ChangeLogEntry
		if err := json.Unmarshal(iter.Value(), &entry); err != nil {
			continue
		}
		logs = append(logs, &entry)
	}

	return configs, logs, nil
}

func (s *LevelDBStore) ImportAll(configs map[string]*ConfigEntry) error {
	batch := &leveldb.Batch{}

	prefix := []byte("config:")
	iter := s.db.NewIterator(&util.Range{Start: prefix}, nil)
	for iter.Next() {
		batch.Delete(iter.Key())
	}
	iter.Release()

	verPrefix := []byte("verhist:")
	iter2 := s.db.NewIterator(&util.Range{Start: verPrefix}, nil)
	for iter2.Next() {
		batch.Delete(iter2.Key())
	}
	iter2.Release()

	for key, entry := range configs {
		data, err := json.Marshal(entry)
		if err != nil {
			return fmt.Errorf("failed to marshal config entry: %w", err)
		}
		batch.Put(configKey(key), data)
		verHistKey := []byte(fmt.Sprintf("verhist:%s:%020d", key, entry.Version))
		batch.Put(verHistKey, data)
	}

	if err := s.db.Write(batch, nil); err != nil {
		return fmt.Errorf("failed to write import batch: %w", err)
	}

	return nil
}

func (s *LevelDBStore) LoadSnapshot(configs map[string]*ConfigEntry) error {
	return s.ImportAll(configs)
}
