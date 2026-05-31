package scanner

import (
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/k65/git-secrets-scan/internal/cache"
	"github.com/k65/git-secrets-scan/internal/gitops"
	"github.com/k65/git-secrets-scan/internal/models"
	"github.com/schollz/progressbar/v3"
)

const MaxWorkers = 8

type ParallelScanner struct {
	scanner  *Scanner
	gitOps   *gitops.GitOperator
	cache    *cache.Cache
	bar      *progressbar.ProgressBar
}

func NewParallel(gitOps *gitops.GitOperator, cache *cache.Cache) *ParallelScanner {
	s := New()
	return &ParallelScanner{
		scanner: s,
		gitOps:  gitOps,
		cache:   cache,
	}
}

func (ps *ParallelScanner) LoadPluginRules(dir string) (int, error) {
	return ps.scanner.LoadPluginRules(dir)
}

func (ps *ParallelScanner) ScanAll(commits []models.Commit) ([]models.Finding, int, int, error) {
	var (
		findings      []models.Finding
		findingsMu    sync.Mutex
		skipped       int
		scannedNew    int
		wg            sync.WaitGroup
	)

	total := len(commits)
	ps.bar = progressbar.NewOptions(total,
		progressbar.OptionSetDescription("Scanning commits"),
		progressbar.OptionSetWriter(os.Stderr),
		progressbar.OptionShowCount(),
		progressbar.OptionShowIts(),
		progressbar.OptionSetItsString("commits"),
		progressbar.OptionThrottle(100*time.Millisecond),
		progressbar.OptionOnCompletion(func() {
			fmt.Fprintln(os.Stderr)
		}),
	)

	jobs := make(chan models.Commit, MaxWorkers)

	for w := 0; w < MaxWorkers; w++ {
		wg.Add(1)
		go ps.worker(jobs, &findings, &findingsMu, &skipped, &scannedNew, &wg)
	}

	go func() {
		for _, commit := range commits {
			jobs <- commit
		}
		close(jobs)
	}()

	go ps.renderProgress()

	wg.Wait()
	ps.bar.Finish()

	return findings, skipped, scannedNew, nil
}

func (ps *ParallelScanner) worker(jobs <-chan models.Commit, findings *[]models.Finding, findingsMu *sync.Mutex, skipped *int, scannedNew *int, wg *sync.WaitGroup) {
	defer wg.Done()

	for commit := range jobs {
		scanned, hasSecret, cachedFindings, err := ps.cache.IsScanned(commit.Hash)
		if err != nil {
			ps.bar.Add(1)
			continue
		}

		if scanned {
			findingsMu.Lock()
			*skipped++
			if hasSecret && len(cachedFindings) > 0 {
				*findings = append(*findings, cachedFindings...)
			}
			findingsMu.Unlock()
			ps.bar.Add(1)
			continue
		}

		commitFindings := ps.scanCommit(commit)

		hasSecret = len(commitFindings) > 0
		ps.cache.MarkScanned(commit.Hash, hasSecret, commitFindings)

		findingsMu.Lock()
		*scannedNew++
		if hasSecret {
			*findings = append(*findings, commitFindings...)
		}
		findingsMu.Unlock()

		ps.bar.Add(1)
	}
}

func (ps *ParallelScanner) scanCommit(commit models.Commit) []models.Finding {
	var findings []models.Finding

	changes, err := ps.gitOps.GetCommitChanges(commit.Hash)
	if err != nil {
		return findings
	}

	for _, change := range changes {
		if isBinaryFile(change.Content) {
			continue
		}

		fileFindings := ps.scanner.Scan(change.Content, change.Filename, commit.Hash)
		findings = append(findings, fileFindings...)
	}

	return findings
}

func (ps *ParallelScanner) renderProgress() {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for !ps.bar.IsFinished() {
		<-ticker.C
	}
}

func isBinaryFile(content string) bool {
	if len(content) == 0 {
		return false
	}

	nullCount := 0
	for i := 0; i < len(content) && i < 8000; i++ {
		if content[i] == 0 {
			nullCount++
		}
	}

	return nullCount > 0
}
