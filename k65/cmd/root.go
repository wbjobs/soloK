package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "git-secrets-scan",
	Short: "Scan Git repository history for secrets, passwords, and tokens",
	Long: `git-secrets-scan is a CLI tool that scans the entire history of a Git repository
to detect potential secrets, passwords, private keys, and tokens using regex patterns
and entropy analysis. It supports concurrent scanning, progress tracking, and can
rewrite history to remove detected secrets.`,
	Run: func(cmd *cobra.Command, args []string) {
		cmd.Help()
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
