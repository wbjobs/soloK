package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/k65/git-secrets-scan/internal/cache"
	"github.com/k65/git-secrets-scan/internal/gitops"
	"github.com/k65/git-secrets-scan/internal/models"
	"github.com/k65/git-secrets-scan/internal/report"
	"github.com/k65/git-secrets-scan/internal/scanner"
	"github.com/spf13/cobra"
)

var (
	repoPath   string
	outputPath string
	noCache    bool
	rulesDir   string
	scanCmd    = &cobra.Command{
		Use:   "scan",
		Short: "Scan a Git repository for secrets in commit history",
		RunE:  runScan,
	}
)

func init() {
	rootCmd.AddCommand(scanCmd)
	scanCmd.Flags().StringVarP(&repoPath, "repo", "r", ".", "Path to the Git repository")
	scanCmd.Flags().StringVarP(&outputPath, "output", "o", "", "Output path for JSON report (default: scan-report-<timestamp>.json)")
	scanCmd.Flags().BoolVar(&noCache, "no-cache", false, "Disable cache and rescan all commits")
	scanCmd.Flags().StringVarP(&rulesDir, "rules", "R", "", "Path to custom rules directory (default: <repo>/.git-secrets-scan/rules)")
}

func runScan(cmd *cobra.Command, args []string) error {
	absRepoPath, err := filepath.Abs(repoPath)
	if err != nil {
		absRepoPath = repoPath
	}

	gitOps, err := gitops.New(absRepoPath)
	if err != nil {
		return fmt.Errorf("failed to initialize git operator: %w", err)
	}

	cache, err := cache.New(absRepoPath)
	if err != nil {
		return fmt.Errorf("failed to initialize cache: %w", err)
	}
	defer cache.Close()

	if noCache {
		if err := cache.Clear(); err != nil {
			return fmt.Errorf("failed to clear cache: %w", err)
		}
		fmt.Println("Cache cleared, rescanning all commits...")
	}

	fmt.Printf("Fetching commit history for: %s\n", absRepoPath)
	commits, err := gitOps.GetAllCommits()
	if err != nil {
		return fmt.Errorf("failed to get commits: %w", err)
	}

	if len(commits) == 0 {
		return fmt.Errorf("no commits found in repository")
	}

	fmt.Printf("Found %d commits to scan\n", len(commits))
	fmt.Printf("Using %d concurrent workers\n\n", scanner.MaxWorkers)

	startTime := time.Now()

	parallelScanner := scanner.NewParallel(gitOps, cache)

	effectiveRulesDir := rulesDir
	if effectiveRulesDir == "" {
		effectiveRulesDir = filepath.Join(absRepoPath, ".git-secrets-scan", "rules")
	}

	rulesLoaded, err := parallelScanner.LoadPluginRules(effectiveRulesDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: failed to load plugin rules: %v\n", err)
	}
	if rulesLoaded > 0 {
		fmt.Printf("Loaded %d custom rules from: %s\n\n", rulesLoaded, effectiveRulesDir)
	}

	findings, skipped, scannedNew, err := parallelScanner.ScanAll(commits)
	if err != nil {
		return fmt.Errorf("scan failed: %w", err)
	}

	duration := time.Since(startTime)

	result := models.ScanResult{
		RepoPath:     absRepoPath,
		ScanTime:     time.Now(),
		TotalCommits: len(commits),
		ScannedNew:   scannedNew,
		Skipped:      skipped,
		Findings:     findings,
		Duration:     duration.String(),
	}

	report.PrintSummary(result)

	if err := report.GenerateJSON(result, outputPath); err != nil {
		return fmt.Errorf("failed to generate report: %w", err)
	}

	return nil
}
