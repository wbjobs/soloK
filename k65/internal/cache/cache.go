package cache

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"

	"github.com/k65/git-secrets-scan/internal/models"
)

const maxRetries = 5
const retryInterval = 50 * time.Millisecond

type Cache struct {
	db *sql.DB
	mu sync.Mutex
}

func New(repoPath string) (*Cache, error) {
	cacheDir := filepath.Join(repoPath, ".git", "git-secrets-scan")
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create cache directory: %w", err)
	}

	dbPath := filepath.Join(cacheDir, "scan_cache.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	c := &Cache{db: db}
	if err := c.init(); err != nil {
		db.Close()
		return nil, err
	}

	return c, nil
}

func (c *Cache) init() error {
	pragmas := []string{
		"PRAGMA journal_mode = WAL",
		"PRAGMA synchronous = NORMAL",
		"PRAGMA busy_timeout = 5000",
		"PRAGMA foreign_keys = ON",
	}

	for _, pragma := range pragmas {
		if _, err := c.execWithRetry(pragma); err != nil {
			return fmt.Errorf("failed to set %s: %w", pragma, err)
		}
	}

	schema := `
	CREATE TABLE IF NOT EXISTS scanned_commits (
		hash TEXT PRIMARY KEY,
		scan_time DATETIME NOT NULL,
		has_secret INTEGER NOT NULL DEFAULT 0,
		findings_json TEXT NOT NULL DEFAULT '[]'
	);
	CREATE INDEX IF NOT EXISTS idx_scanned_commits_hash ON scanned_commits(hash);
	`
	_, err := c.execWithRetry(schema)
	if err != nil {
		return err
	}

	c.migrateSchema()
	return nil
}

func (c *Cache) migrateSchema() {
	c.execWithRetry("ALTER TABLE scanned_commits ADD COLUMN findings_json TEXT NOT NULL DEFAULT '[]'")
}

func (c *Cache) execWithRetry(query string, args ...interface{}) (sql.Result, error) {
	var result sql.Result
	var err error

	for i := 0; i < maxRetries; i++ {
		c.mu.Lock()
		result, err = c.db.Exec(query, args...)
		c.mu.Unlock()

		if err == nil {
			return result, nil
		}

		if isLockedError(err) && i < maxRetries-1 {
			time.Sleep(retryInterval * time.Duration(i+1))
			continue
		}

		return nil, err
	}

	return nil, err
}

func (c *Cache) queryRowWithRetry(query string, args ...interface{}) *sql.Row {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.db.QueryRow(query, args...)
}

func isLockedError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return strings.Contains(errStr, "database is locked") ||
		strings.Contains(errStr, "busy") ||
		strings.Contains(errStr, "locking protocol")
}

func (c *Cache) IsScanned(hash string) (bool, bool, []models.Finding, error) {
	var hasSecret int
	var scanTime time.Time
	var findingsJSON string
	err := c.queryRowWithRetry(
		"SELECT has_secret, scan_time, findings_json FROM scanned_commits WHERE hash = ?",
		hash,
	).Scan(&hasSecret, &scanTime, &findingsJSON)

	if err == sql.ErrNoRows {
		return false, false, nil, nil
	}
	if err != nil {
		return false, false, nil, err
	}

	var cachedFindings []models.Finding
	if findingsJSON != "" && findingsJSON != "[]" {
		json.Unmarshal([]byte(findingsJSON), &cachedFindings)
	}

	return true, hasSecret == 1, cachedFindings, nil
}

func (c *Cache) MarkScanned(hash string, hasSecret bool, findings []models.Finding) error {
	findingsJSON := "[]"
	if len(findings) > 0 {
		data, err := json.Marshal(findings)
		if err == nil {
			findingsJSON = string(data)
		}
	}

	_, err := c.execWithRetry(
		"INSERT OR REPLACE INTO scanned_commits (hash, scan_time, has_secret, findings_json) VALUES (?, ?, ?, ?)",
		hash,
		time.Now(),
		boolToInt(hasSecret),
		findingsJSON,
	)
	return err
}

func (c *Cache) Clear() error {
	_, err := c.execWithRetry("DELETE FROM scanned_commits")
	return err
}

func (c *Cache) Close() error {
	return c.db.Close()
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
