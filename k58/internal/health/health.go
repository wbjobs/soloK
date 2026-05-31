package health

import (
	"context"
	"sync"
)

type Checker interface {
	Name() string
	Check(ctx context.Context) (bool, string)
}

type Check struct {
	Healthy bool
	Message string
}

type Manager struct {
	mu       sync.RWMutex
	checkers map[string]Checker
}

func NewManager() *Manager {
	return &Manager{
		checkers: make(map[string]Checker),
	}
}

func (m *Manager) Register(checker Checker) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.checkers[checker.Name()] = checker
}

func (m *Manager) CheckAll(ctx context.Context) (bool, map[string]Check) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	healthy := true
	results := make(map[string]Check)

	for name, checker := range m.checkers {
		ok, msg := checker.Check(ctx)
		results[name] = Check{
			Healthy: ok,
			Message: msg,
		}
		if !ok {
			healthy = false
		}
	}

	return healthy, results
}

type SimpleChecker struct {
	name    string
	checkFn func(ctx context.Context) (bool, string)
}

func (c *SimpleChecker) Name() string {
	return c.name
}

func (c *SimpleChecker) Check(ctx context.Context) (bool, string) {
	return c.checkFn(ctx)
}

func NewSimpleChecker(name string, fn func(ctx context.Context) (bool, string)) Checker {
	return &SimpleChecker{
		name:    name,
		checkFn: fn,
	}
}
