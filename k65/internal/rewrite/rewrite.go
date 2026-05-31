package rewrite

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strings"

	"github.com/k65/git-secrets-scan/internal/models"
)

type Rewriter struct {
	repoPath string
}

func New(repoPath string) *Rewriter {
	return &Rewriter{repoPath: repoPath}
}

func (r *Rewriter) CleanSecrets(findings []models.Finding) error {
	if len(findings) == 0 {
		return fmt.Errorf("no secrets to clean")
	}

	uniqueSecrets := make(map[string]bool)
	for _, f := range findings {
		if f.Confidence >= 0.7 {
			uniqueSecrets[f.MatchValue] = true
		}
	}

	if len(uniqueSecrets) == 0 {
		return fmt.Errorf("no high-confidence secrets to clean (confidence >= 0.7)")
	}

	scriptPath, err := r.createFilterScript(uniqueSecrets)
	if err != nil {
		return err
	}
	defer os.Remove(scriptPath)

	fmt.Printf("Rewriting git history to remove %d unique secrets...\n", len(uniqueSecrets))
	fmt.Println("WARNING: This will permanently modify your git history!")
	fmt.Println("Make sure you have a backup before proceeding.")

	cmd := exec.Command(
		"git", "-C", r.repoPath,
		"filter-branch", "--force",
		"--tree-filter", fmt.Sprintf(`go run "%s"`, scriptPath),
		"--tag-name-filter", "cat",
		"--", "--all",
	)

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to rewrite history: %w", err)
	}

	fmt.Println("\nHistory rewrite completed successfully!")
	fmt.Println("NOTE: You may need to run 'git push --force' to update remote repositories.")
	fmt.Println("NOTE: You should clear the scan cache with 'git-secrets-scan clear-cache'")

	return nil
}

func (r *Rewriter) createFilterScript(secrets map[string]bool) (string, error) {
	var patterns []string
	for secret := range secrets {
		escaped := regexp.QuoteMeta(secret)
		patterns = append(patterns, escaped)
	}

	script := `package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
)

var patterns = []*regexp.Regexp{
` + strings.Join(quotePatterns(patterns), ",\n") + `
}

var replacement = "[REDACTED]"

func main() {
	err := filepath.Walk(".", func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			if info.Name() == ".git" {
				return filepath.SkipDir
			}
			return nil
		}
		if !isTextFile(path) {
			return nil
		}
		return processFile(path)
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func processFile(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	content := string(data)
	modified := content
	for _, pat := range patterns {
		modified = pat.ReplaceAllString(modified, replacement)
	}
	if modified != content {
		return os.WriteFile(path, []byte(modified), 0644)
	}
	return nil
}

func isTextFile(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	reader := bufio.NewReader(f)
	buf := make([]byte, 512)
	n, _ := reader.Read(buf)
	if n == 0 {
		return true
	}
	nullCount := 0
	for _, b := range buf[:n] {
		if b == 0 {
			nullCount++
		}
	}
	return nullCount == 0
}
`

	tmpFile, err := os.CreateTemp("", "git-filter-*.go")
	if err != nil {
		return "", err
	}
	defer tmpFile.Close()

	if _, err := tmpFile.WriteString(script); err != nil {
		return "", err
	}

	return tmpFile.Name(), nil
}

func quotePatterns(patterns []string) []string {
	var quoted []string
	for _, p := range patterns {
		quoted = append(quoted, fmt.Sprintf("\tregexp.MustCompile(`%s`)", p))
	}
	return quoted
}

func (r *Rewriter) CleanWithBFG(findings []models.Finding) error {
	bfgPath, err := exec.LookPath("bfg")
	if err != nil {
		return fmt.Errorf("BFG not found in PATH, please install it first: %w", err)
	}

	replacementsFile, err := r.createBFGReplacements(findings)
	if err != nil {
		return err
	}
	defer os.Remove(replacementsFile)

	fmt.Printf("Using BFG to clean %d secrets...\n", len(findings))

	cmd := exec.Command(
		bfgPath,
		"--replace-text", replacementsFile,
		r.repoPath,
	)

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("BFG failed: %w", err)
	}

	fmt.Println("\nBFG cleanup completed!")
	fmt.Println("Run 'git reflog expire --expire=now --all && git gc --prune=now --aggressive' to complete cleanup")

	return nil
}

func (r *Rewriter) createBFGReplacements(findings []models.Finding) (string, error) {
	tmpFile, err := os.CreateTemp("", "bfg-replacements-*.txt")
	if err != nil {
		return "", err
	}
	defer tmpFile.Close()

	writer := bufio.NewWriter(tmpFile)
	uniqueSecrets := make(map[string]bool)

	for _, f := range findings {
		if f.Confidence >= 0.7 && !uniqueSecrets[f.MatchValue] {
			uniqueSecrets[f.MatchValue] = true
			fmt.Fprintf(writer, "%s==>%s\n", f.MatchValue, "***REMOVED***")
		}
	}

	writer.Flush()
	return tmpFile.Name(), nil
}
