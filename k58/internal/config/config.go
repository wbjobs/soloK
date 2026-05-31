package config

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	clientv3 "go.etcd.io/etcd/client/v3"
)

const (
	configKey = "/idgenerator/config"
)

type Config struct {
	Mode          string   `json:"mode"`
	GRPCPort      int      `json:"grpc_port"`
	HTTPPort      int      `json:"http_port"`
	EtcdEndpoints []string `json:"etcd_endpoints"`
	MySQLDSN      string   `json:"mysql_dsn"`
	BizTag        string   `json:"biz_tag"`
	SegmentStep   int64    `json:"segment_step"`
	BizType       int64    `json:"biz_type"`
	ShardKey      int64    `json:"shard_key"`
}

type Manager struct {
	mu         sync.RWMutex
	config     *Config
	etcdClient *clientv3.Client
	ctx        context.Context
	cancel     context.CancelFunc
	callbacks  []func(*Config)
}

func DefaultConfig() *Config {
	return &Config{
		Mode:          "snowflake",
		GRPCPort:      50051,
		HTTPPort:      9090,
		EtcdEndpoints: []string{"localhost:2379"},
		MySQLDSN:      "root:password@tcp(localhost:3306)/idgen",
		BizTag:        "default",
		SegmentStep:   1000,
		BizType:       0,
		ShardKey:      0,
	}
}

func NewManager(etcdEndpoints []string) (*Manager, error) {
	cli, err := clientv3.New(clientv3.Config{
		Endpoints:   etcdEndpoints,
		DialTimeout: 5 * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect etcd: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	m := &Manager{
		etcdClient: cli,
		ctx:        ctx,
		cancel:     cancel,
		config:     DefaultConfig(),
	}

	if err := m.loadConfig(); err != nil {
		log.Printf("Failed to load config from etcd, using default: %v", err)
	}

	go m.watchConfig()

	return m, nil
}

func (m *Manager) loadConfig() error {
	resp, err := m.etcdClient.Get(m.ctx, configKey)
	if err != nil {
		return err
	}

	if len(resp.Kvs) == 0 {
		return fmt.Errorf("config not found")
	}

	var cfg Config
	if err := json.Unmarshal(resp.Kvs[0].Value, &cfg); err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.config = &cfg
	m.notifyCallbacks(&cfg)

	return nil
}

func (m *Manager) watchConfig() {
	rch := m.etcdClient.Watch(m.ctx, configKey)
	for wresp := range rch {
		for _, ev := range wresp.Events {
			if ev.Type == clientv3.EventTypePut {
				var cfg Config
				if err := json.Unmarshal(ev.Kv.Value, &cfg); err != nil {
					log.Printf("Failed to unmarshal config: %v", err)
					continue
				}

				m.mu.Lock()
				m.config = &cfg
				m.notifyCallbacks(&cfg)
				m.mu.Unlock()

				log.Println("Config reloaded successfully")
			}
		}
	}
}

func (m *Manager) Get() *Config {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.config
}

func (m *Manager) OnChange(callback func(*Config)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.callbacks = append(m.callbacks, callback)
}

func (m *Manager) notifyCallbacks(cfg *Config) {
	for _, cb := range m.callbacks {
		go cb(cfg)
	}
}

func (m *Manager) Close() {
	m.cancel()
	if m.etcdClient != nil {
		m.etcdClient.Close()
	}
}
