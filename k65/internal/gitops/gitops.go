package gitops

import (
	"bufio"
	"bytes"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/k65/git-secrets-scan/internal/models"
)

type GitOperator struct {
	repoPath string
}

func New(repoPath string) (*GitOperator, error) {
	cmd := exec.Command("git", "-C", repoPath, "rev-parse", "--is-inside-work-tree")
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("not a valid git repository: %w", err)
	}
	return &GitOperator{repoPath: repoPath}, nil
}

func (g *GitOperator) GetAllCommits() ([]models.Commit, error) {
	format := `--pretty=format:%H|%an|%ae|%ad|%P|%s%x00`
	cmd := exec.Command("git", "-C", g.repoPath, "log", "--all", "--reverse", format)
	cmd.Env = append(cmd.Environ(), "LANG=C")

	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to get commits: %w", err)
	}

	var commits []models.Commit
	scanner := bufio.NewScanner(bytes.NewReader(output))
	scanner.Split(splitNull)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		commit, err := parseCommit(line)
		if err != nil {
			continue
		}
		commits = append(commits, commit)
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	return commits, nil
}

func (g *GitOperator) GetCommitChanges(hash string) ([]models.FileChange, error) {
	cmd := exec.Command("git", "-C", g.repoPath, "show", "--name-status", "--format=", hash)
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to get commit changes: %w", err)
	}

	var changes []models.FileChange
	scanner := bufio.NewScanner(bytes.NewReader(output))
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}

		status := parts[0]
		filename := parts[1]

		if status == "D" {
			continue
		}

		content, err := g.getFileContent(hash, filename)
		if err != nil {
			continue
		}

		changes = append(changes, models.FileChange{
			Filename: filename,
			Content:  content,
			Status:   status,
		})
	}

	return changes, scanner.Err()
}

func (g *GitOperator) getFileContent(hash, filename string) (string, error) {
	cmd := exec.Command("git", "-C", g.repoPath, "show", fmt.Sprintf("%s:%s", hash, filename))
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(output), nil
}

func (g *GitOperator) RewriteHistory(findings []models.Finding) error {
	if len(findings) == 0 {
		return fmt.Errorf("no findings to clean")
	}

	secretPatterns := make(map[string]bool)
	for _, f := range findings {
		secretPatterns[f.MatchValue] = true
	}

	filterScript := `
import re
import sys

patterns = [
`
	for pattern := range secretPatterns {
		escaped := strings.ReplaceAll(pattern, `\`, `\\`)
		escaped = strings.ReplaceAll(escaped, `"`, `\"`)
		filterScript += fmt.Sprintf(`    re.compile(r"%s"),`+"\n", escaped)
	}

	filterScript += `
]

def clean_text(text):
    for pat in patterns:
        text = pat.sub("[REDACTED]", text)
    return text

data = sys.stdin.read()
sys.stdout.write(clean_text(data))
`

	cmd := exec.Command(
		"git", "-C", g.repoPath,
		"filter-branch", "--force",
		"--tree-filter", fmt.Sprintf(`python3 -c '%s'`, filterScript),
		"--tag-name-filter", "cat",
		"--", "--all",
	)

	cmd.Stdout = exec.Command("echo", "").Stdout
	cmd.Stderr = exec.Command("echo", "").Stderr

	return cmd.Run()
}

func parseCommit(line string) (models.Commit, error) {
	line = strings.TrimSpace(line)
	parts := strings.SplitN(line, "|", 6)
	if len(parts) < 6 {
		return models.Commit{}, fmt.Errorf("invalid commit format")
	}

	hash := strings.TrimSpace(parts[0])
	author := strings.TrimSpace(parts[1])
	email := strings.TrimSpace(parts[2])
	dateStr := strings.TrimSpace(parts[3])
	parentStr := strings.TrimSpace(parts[4])
	message := parts[5]

	t, err := time.Parse("Mon Jan 2 15:04:05 2006 -0700", dateStr)
	if err != nil {
		t = time.Now()
	}

	parents := []string{}
	if parentStr != "" {
		parents = strings.Fields(parentStr)
	}

	return models.Commit{
		Hash:         hash,
		Author:       author,
		Email:        email,
		Date:         t,
		Message:      message,
		ParentHashes: parents,
	}, nil
}

func splitNull(data []byte, atEOF bool) (advance int, token []byte, err error) {
	if i := bytes.IndexByte(data, 0); i >= 0 {
		return i + 1, data[:i], nil
	}
	if atEOF && len(data) > 0 {
		return len(data), data, nil
	}
	return 0, nil, nil
}

func (g *GitOperator) GetCommitCount() (int, error) {
	cmd := exec.Command("git", "-C", g.repoPath, "rev-list", "--count", "--all")
	output, err := cmd.Output()
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(strings.TrimSpace(string(output)))
}
