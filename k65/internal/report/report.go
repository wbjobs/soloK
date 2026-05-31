package report

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/k65/git-secrets-scan/internal/models"
)

func GenerateJSON(result models.ScanResult, outputPath string) error {
	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal report: %w", err)
	}

	if outputPath == "" {
		outputPath = fmt.Sprintf("scan-report-%s.json", time.Now().Format("20060102-150405"))
	}

	absPath, err := filepath.Abs(outputPath)
	if err != nil {
		absPath = outputPath
	}

	if err := os.WriteFile(absPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write report: %w", err)
	}

	fmt.Printf("Report written to: %s\n", absPath)
	return nil
}

func PrintSummary(result models.ScanResult) {
	fmt.Println("\n=== Scan Summary ===")
	fmt.Printf("Repository: %s\n", result.RepoPath)
	fmt.Printf("Scan Time: %s\n", result.ScanTime.Format(time.RFC3339))
	fmt.Printf("Total Commits: %d\n", result.TotalCommits)
	fmt.Printf("Newly Scanned: %d\n", result.ScannedNew)
	fmt.Printf("Skipped (cached): %d\n", result.Skipped)
	fmt.Printf("Duration: %s\n", result.Duration)
	fmt.Printf("Total Findings: %d\n", len(result.Findings))

	if len(result.Findings) == 0 {
		fmt.Println("\nNo secrets found!")
		return
	}

	grouped := make(map[string][]models.Finding)
	for _, f := range result.Findings {
		key := fmt.Sprintf("%s:%s", f.CommitHash, f.Filename)
		grouped[key] = append(grouped[key], f)
	}

	fmt.Println("\n=== Findings ===")
	i := 1
	for key, findings := range grouped {
		fmt.Printf("\n[%d] %s\n", i, key)
		for _, f := range findings {
			fmt.Printf("  - Type: %s\n", f.MatchType)
			fmt.Printf("    Line: %d\n", f.LineNumber)
			fmt.Printf("    Confidence: %.2f\n", f.Confidence)
			fmt.Printf("    Entropy: %.2f\n", f.Entropy)
			fmt.Printf("    Description: %s\n", f.Description)
			fmt.Printf("    Match: %s\n", maskSecret(f.MatchValue))
		}
		i++
	}

	types := make(map[string]int)
	for _, f := range result.Findings {
		types[f.MatchType]++
	}

	fmt.Println("\n=== Finding Types ===")
	type pair struct {
		k string
		v int
	}
	var pairs []pair
	for k, v := range types {
		pairs = append(pairs, pair{k, v})
	}
	sort.Slice(pairs, func(i, j int) bool {
		return pairs[i].v > pairs[j].v
	})
	for _, p := range pairs {
		fmt.Printf("  %s: %d\n", p.k, p.v)
	}
}

func maskSecret(s string) string {
	if len(s) <= 8 {
		return s
	}
	prefix := s[:4]
	suffix := s[len(s)-4:]
	mask := ""
	for i := 0; i < len(s)-8; i++ {
		mask += "*"
	}
	return prefix + mask + suffix
}
