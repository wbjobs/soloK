package cmd

import (
	"fmt"
	"path/filepath"

	"github.com/k65/git-secrets-scan/internal/cache"
	"github.com/spf13/cobra"
)

var clearCacheCmd = &cobra.Command{
	Use:   "clear-cache",
	Short: "Clear the scan cache for a repository",
	RunE:  runClearCache,
}

func init() {
	rootCmd.AddCommand(clearCacheCmd)
	clearCacheCmd.Flags().StringVarP(&repoPath, "repo", "r", ".", "Path to the Git repository")
}

func runClearCache(cmd *cobra.Command, args []string) error {
	absRepoPath, err := filepath.Abs(repoPath)
	if err != nil {
		absRepoPath = repoPath
	}

	cache, err := cache.New(absRepoPath)
	if err != nil {
		return fmt.Errorf("failed to initialize cache: %w", err)
	}
	defer cache.Close()

	if err := cache.Clear(); err != nil {
		return fmt.Errorf("failed to clear cache: %w", err)
	}

	fmt.Println("Scan cache cleared successfully")
	return nil
}
