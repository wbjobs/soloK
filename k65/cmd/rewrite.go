package cmd

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/k65/git-secrets-scan/internal/cache"
	"github.com/k65/git-secrets-scan/internal/models"
	"github.com/k65/git-secrets-scan/internal/rewrite"
	"github.com/spf13/cobra"
)

var (
	reportPath  string
	useBFG      bool
	interactive bool
	rewriteCmd  = &cobra.Command{
		Use:   "rewrite",
		Short: "Rewrite Git history to remove detected secrets",
		Long: `Rewrite the Git history to remove secrets detected by a previous scan.
This uses git filter-branch by default, or BFG if specified.
WARNING: This permanently modifies your Git history! Make sure to backup first.`,
		RunE: runRewrite,
	}
)

func init() {
	rootCmd.AddCommand(rewriteCmd)
	rewriteCmd.Flags().StringVarP(&reportPath, "report", "f", "", "Path to the scan report JSON file")
	rewriteCmd.Flags().StringVarP(&repoPath, "repo", "r", ".", "Path to the Git repository")
	rewriteCmd.Flags().BoolVar(&useBFG, "bfg", false, "Use BFG Repo-Cleaner instead of git filter-branch")
	rewriteCmd.Flags().BoolVarP(&interactive, "interactive", "i", false, "Interactively confirm each finding before cleaning")
	rewriteCmd.MarkFlagRequired("report")
}

func runRewrite(cmd *cobra.Command, args []string) error {
	absRepoPath, err := filepath.Abs(repoPath)
	if err != nil {
		absRepoPath = repoPath
	}

	reportData, err := os.ReadFile(reportPath)
	if err != nil {
		return fmt.Errorf("failed to read report file: %w", err)
	}

	var result models.ScanResult
	if err := json.Unmarshal(reportData, &result); err != nil {
		return fmt.Errorf("failed to parse report file: %w", err)
	}

	if len(result.Findings) == 0 {
		return fmt.Errorf("no findings in report, nothing to clean")
	}

	findings := result.Findings

	if interactive {
		findings, err = interactiveSelect(findings)
		if err != nil {
			return err
		}
		if len(findings) == 0 {
			fmt.Println("No findings selected for cleanup.")
			return nil
		}
	} else {
		highConfidence := 0
		for _, f := range result.Findings {
			if f.Confidence >= 0.7 {
				highConfidence++
			}
		}
		fmt.Printf("Found %d findings in report\n", len(result.Findings))
		fmt.Printf("High confidence findings (>= 0.7): %d\n", highConfidence)

		if highConfidence == 0 {
			return fmt.Errorf("no high-confidence findings to clean")
		}
	}

	rewriter := rewrite.New(absRepoPath)

	if useBFG {
		fmt.Println("Using BFG Repo-Cleaner...")
		if err := rewriter.CleanWithBFG(findings); err != nil {
			return err
		}
	} else {
		fmt.Println("Using git filter-branch...")
		if err := rewriter.CleanSecrets(findings); err != nil {
			return err
		}
	}

	fmt.Println("\nClearing scan cache since commit hashes have changed...")
	c, err := cache.New(absRepoPath)
	if err != nil {
		return fmt.Errorf("failed to open cache for clearing: %w", err)
	}
	defer c.Close()
	if err := c.Clear(); err != nil {
		return fmt.Errorf("failed to clear cache: %w", err)
	}
	fmt.Println("Scan cache cleared successfully")

	return nil
}

func interactiveSelect(findings []models.Finding) ([]models.Finding, error) {
	reader := bufio.NewReader(os.Stdin)
	var selected []models.Finding

	fmt.Printf("\n=== Interactive Cleanup (%d findings) ===\n", len(findings))
	fmt.Println("For each finding, choose: [y] clean / [n] skip / [a] clean all remaining / [q] quit")
	fmt.Println()

	for i, f := range findings {
		fmt.Printf("--- Finding %d/%d ---\n", i+1, len(findings))
		fmt.Printf("  Type:        %s\n", f.MatchType)
		fmt.Printf("  File:        %s (line %d)\n", f.Filename, f.LineNumber)
		fmt.Printf("  Commit:      %s\n", f.CommitHash[:12])
		fmt.Printf("  Match:       %s\n", maskRewriteSecret(f.MatchValue))
		fmt.Printf("  Description: %s\n", f.Description)
		fmt.Printf("  Confidence:  %.2f\n", f.Confidence)
		fmt.Printf("  Entropy:     %.2f\n", f.Entropy)
		fmt.Println()

		fmt.Print("Clean this finding? [y/n/a/q]: ")

		input, err := reader.ReadString('\n')
		if err != nil {
			return selected, fmt.Errorf("failed to read input: %w", err)
		}

		answer := strings.TrimSpace(strings.ToLower(input))
		switch answer {
		case "y", "yes":
			selected = append(selected, f)
			fmt.Println("  -> Marked for cleanup.")
		case "a", "all":
			selected = append(selected, f)
			for j := i + 1; j < len(findings); j++ {
				selected = append(selected, findings[j])
			}
			fmt.Printf("  -> Marked all %d remaining findings for cleanup.\n", len(findings)-i)
			return selected, nil
		case "q", "quit":
			fmt.Println("  -> Quitting interactive mode.")
			return selected, nil
		default:
			fmt.Println("  -> Skipped.")
		}
		fmt.Println()
	}

	return selected, nil
}

func maskRewriteSecret(s string) string {
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
