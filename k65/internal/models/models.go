package models

import "time"

type Commit struct {
	Hash      string    `json:"hash"`
	Author    string    `json:"author"`
	Email     string    `json:"email"`
	Date      time.Time `json:"date"`
	Message   string    `json:"message"`
	ParentHashes []string `json:"parent_hashes"`
}

type FileChange struct {
	Filename string `json:"filename"`
	Content  string `json:"content"`
	Status   string `json:"status"`
}

type Finding struct {
	CommitHash  string    `json:"commit_hash"`
	Filename    string    `json:"filename"`
	MatchType   string    `json:"match_type"`
	MatchValue  string    `json:"match_value"`
	LineNumber  int       `json:"line_number"`
	Description string    `json:"description"`
	Confidence  float64   `json:"confidence"`
	Entropy     float64   `json:"entropy,omitempty"`
}

type ScanResult struct {
	RepoPath     string    `json:"repo_path"`
	ScanTime     time.Time `json:"scan_time"`
	TotalCommits int       `json:"total_commits"`
	ScannedNew   int       `json:"scanned_new"`
	Skipped      int       `json:"skipped"`
	Findings     []Finding `json:"findings"`
	Duration     string    `json:"duration"`
}

type CachedCommit struct {
	Hash      string
	ScanTime  time.Time
	HasSecret bool
}
