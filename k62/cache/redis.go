package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	KeyPrefix        = "factorize:"
	DefaultTTL       = 24 * time.Hour
	MaxRetries       = 3
	RetryBackoff     = 200 * time.Millisecond
	FallbackDuration = 5 * time.Minute
)

type RedisCache struct {
	client           *redis.Client
	ttl              time.Duration
	fallback         *InMemoryCache
	fallbackActive   bool
	fallbackExpiry   time.Time
	mu               sync.RWMutex
}

type CacheEntry struct {
	Number  string   `json:"number"`
	Factors []string `json:"factors"`
	Error   string   `json:"error,omitempty"`
}

func isRetryableRedisError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return strings.Contains(errStr, "CLUSTERDOWN") ||
		strings.Contains(errStr, "LOADING") ||
		strings.Contains(errStr, "TRYAGAIN") ||
		strings.Contains(errStr, "MOVED") ||
		strings.Contains(errStr, "i/o timeout") ||
		strings.Contains(errStr, "connection refused") ||
		strings.Contains(errStr, "connection reset")
}

func NewRedisCache(addr string, password string, db int, ttl time.Duration) *RedisCache {
	rdb := redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     password,
		DB:           db,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolSize:     10,
		MinIdleConns: 2,
		PoolTimeout:  4 * time.Second,
	})
	if ttl == 0 {
		ttl = DefaultTTL
	}
	return &RedisCache{
		client:   rdb,
		ttl:      ttl,
		fallback: NewInMemoryCache(),
	}
}

func (rc *RedisCache) checkFallback() bool {
	rc.mu.RLock()
	active := rc.fallbackActive && time.Now().Before(rc.fallbackExpiry)
	rc.mu.RUnlock()
	return active
}

func (rc *RedisCache) activateFallback() {
	rc.mu.Lock()
	rc.fallbackActive = true
	rc.fallbackExpiry = time.Now().Add(FallbackDuration)
	rc.mu.Unlock()
}

func (rc *RedisCache) tryRecover(ctx context.Context) bool {
	rc.mu.RLock()
	if !rc.fallbackActive {
		rc.mu.RUnlock()
		return true
	}
	rc.mu.RUnlock()

	if err := rc.client.Ping(ctx).Err(); err == nil {
		rc.mu.Lock()
		rc.fallbackActive = false
		rc.mu.Unlock()
		return true
	}
	return false
}

func (rc *RedisCache) Get(ctx context.Context, number string) (*CacheEntry, error) {
	if rc.checkFallback() {
		if rc.tryRecover(ctx) {
			entry, err := rc.getWithRetry(ctx, number)
			if err == nil {
				return entry, nil
			}
		}
		return rc.fallback.Get(ctx, number)
	}

	entry, err := rc.getWithRetry(ctx, number)
	if err != nil && isRetryableRedisError(err) {
		rc.activateFallback()
		return rc.fallback.Get(ctx, number)
	}
	return entry, err
}

func (rc *RedisCache) getWithRetry(ctx context.Context, number string) (*CacheEntry, error) {
	var lastErr error
	key := KeyPrefix + number

	for attempt := 0; attempt < MaxRetries; attempt++ {
		val, err := rc.client.Get(ctx, key).Result()
		if err == redis.Nil {
			return nil, nil
		}
		if err == nil {
			var entry CacheEntry
			if err := json.Unmarshal([]byte(val), &entry); err != nil {
				return nil, fmt.Errorf("json unmarshal failed: %w", err)
			}
			return &entry, nil
		}

		lastErr = err
		if !isRetryableRedisError(err) {
			break
		}

		if attempt < MaxRetries-1 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(RetryBackoff * time.Duration(attempt+1)):
			}
		}
	}

	return nil, fmt.Errorf("redis get failed after %d attempts: %w", MaxRetries, lastErr)
}

func (rc *RedisCache) Set(ctx context.Context, entry *CacheEntry) error {
	_ = rc.fallback.Set(ctx, entry)

	if rc.checkFallback() {
		rc.tryRecover(ctx)
		return nil
	}

	err := rc.setWithRetry(ctx, entry)
	if err != nil && isRetryableRedisError(err) {
		rc.activateFallback()
		return nil
	}
	return err
}

func (rc *RedisCache) setWithRetry(ctx context.Context, entry *CacheEntry) error {
	var lastErr error
	key := KeyPrefix + entry.Number
	data, err := json.Marshal(entry)
	if err != nil {
		return fmt.Errorf("json marshal failed: %w", err)
	}

	for attempt := 0; attempt < MaxRetries; attempt++ {
		err := rc.client.Set(ctx, key, data, rc.ttl).Err()
		if err == nil {
			return nil
		}

		lastErr = err
		if !isRetryableRedisError(err) {
			break
		}

		if attempt < MaxRetries-1 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(RetryBackoff * time.Duration(attempt+1)):
			}
		}
	}

	return fmt.Errorf("redis set failed after %d attempts: %w", MaxRetries, lastErr)
}

func (rc *RedisCache) Delete(ctx context.Context, number string) error {
	_ = rc.fallback.Delete(ctx, number)

	if rc.checkFallback() {
		rc.tryRecover(ctx)
		return nil
	}

	key := KeyPrefix + number
	err := rc.client.Del(ctx, key).Err()
	if err != nil && isRetryableRedisError(err) {
		rc.activateFallback()
		return nil
	}
	return err
}

func (rc *RedisCache) Exists(ctx context.Context, number string) (bool, error) {
	if rc.checkFallback() {
		return rc.fallback.Exists(ctx, number)
	}

	key := KeyPrefix + number
	n, err := rc.client.Exists(ctx, key).Result()
	if err != nil && isRetryableRedisError(err) {
		rc.activateFallback()
		return rc.fallback.Exists(ctx, number)
	}
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func (rc *RedisCache) Ping(ctx context.Context) error {
	return rc.client.Ping(ctx).Err()
}

func (rc *RedisCache) Close() error {
	return rc.client.Close()
}

type InMemoryCache struct {
	data map[string]*CacheEntry
}

func NewInMemoryCache() *InMemoryCache {
	return &InMemoryCache{data: make(map[string]*CacheEntry)}
}

func (im *InMemoryCache) Get(_ context.Context, number string) (*CacheEntry, error) {
	entry, ok := im.data[number]
	if !ok {
		return nil, nil
	}
	return entry, nil
}

func (im *InMemoryCache) Set(_ context.Context, entry *CacheEntry) error {
	im.data[entry.Number] = entry
	return nil
}

func (im *InMemoryCache) Delete(_ context.Context, number string) error {
	delete(im.data, number)
	return nil
}

func (im *InMemoryCache) Exists(_ context.Context, number string) (bool, error) {
	_, ok := im.data[number]
	return ok, nil
}

func (im *InMemoryCache) Ping(_ context.Context) error {
	return nil
}

func (im *InMemoryCache) Close() error {
	return nil
}

type Cache interface {
	Get(ctx context.Context, number string) (*CacheEntry, error)
	Set(ctx context.Context, entry *CacheEntry) error
	Delete(ctx context.Context, number string) error
	Exists(ctx context.Context, number string) (bool, error)
	Ping(ctx context.Context) error
	Close() error
}
