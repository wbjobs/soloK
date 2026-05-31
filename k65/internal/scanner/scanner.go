package scanner

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/k65/git-secrets-scan/internal/models"
)

var (
	uuidPattern      = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	datePattern      = regexp.MustCompile(`^\d{4}[-/]?\d{2}[-/]?\d{2}$`)
	versionPattern   = regexp.MustCompile(`^\d+\.\d+(\.\d+)?(-\w+)?$`)
	commitHashPattern = regexp.MustCompile(`^[0-9a-fA-F]{7,40}$`)
	colorHexPattern  = regexp.MustCompile(`^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$`)
	ipPattern        = regexp.MustCompile(`^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$`)
	macPattern       = regexp.MustCompile(`^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$`)
	semverPattern    = regexp.MustCompile(`^v?\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$`)
)

func isFalsePositive(match string) bool {
	m := strings.TrimSpace(match)
	
	if uuidPattern.MatchString(m) {
		return true
	}
	if datePattern.MatchString(m) {
		return true
	}
	if versionPattern.MatchString(m) {
		return true
	}
	if commitHashPattern.MatchString(m) && len(m) >= 7 && len(m) <= 40 {
		return true
	}
	if colorHexPattern.MatchString(m) {
		return true
	}
	if ipPattern.MatchString(m) {
		return true
	}
	if macPattern.MatchString(m) {
		return true
	}
	if semverPattern.MatchString(m) {
		return true
	}
	
	if len(m) >= 8 && len(m) <= 12 {
		lower := strings.ToLower(m)
		if strings.HasPrefix(lower, "20") || strings.HasPrefix(lower, "19") {
			if _, err := regexp.MatchString(`^\d+$`, m); err == nil {
				return true
			}
		}
	}
	
	return false
}

type Pattern struct {
	Regex       *regexp.Regexp
	Type        string
	Description string
	Confidence  float64
}

type Scanner struct {
	patterns []Pattern
}

func New() *Scanner {
	patterns := []Pattern{
		{
			Regex:       regexp.MustCompile(`(?i)(?:password|passwd|pwd)\s*[=:]\s*["']?([^\s"'&;]+)["']?`),
			Type:        "password",
			Description: "Potential password in configuration",
			Confidence:  0.7,
		},
		{
			Regex:       regexp.MustCompile(`(?i)(?:api[_-]?key|apikey|secret[_-]?key|client[_-]?secret)\s*[=:]\s*["']?([A-Za-z0-9_\-]{16,})["']?`),
			Type:        "api_key",
			Description: "Potential API key",
			Confidence:  0.8,
		},
		{
			Regex:       regexp.MustCompile(`(?i)(?:token|access[_-]?token|auth[_-]?token)\s*[=:]\s*["']?([A-Za-z0-9_\-]{20,})["']?`),
			Type:        "token",
			Description: "Potential access token",
			Confidence:  0.8,
		},
		{
			Regex:       regexp.MustCompile(`-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----`),
			Type:        "private_key",
			Description: "Private key file content",
			Confidence:  0.99,
		},
		{
			Regex:       regexp.MustCompile(`AKIA[0-9A-Z]{16}`),
			Type:        "aws_access_key",
			Description: "AWS Access Key ID",
			Confidence:  0.95,
		},
		{
			Regex:       regexp.MustCompile(`(?i)ghp_[A-Za-z0-9]{36}`),
			Type:        "github_token",
			Description: "GitHub Personal Access Token",
			Confidence:  0.95,
		},
		{
			Regex:       regexp.MustCompile(`(?i)sk_(?:live|test)_[A-Za-z0-9]{24,}`),
			Type:        "stripe_key",
			Description: "Stripe API Secret Key",
			Confidence:  0.95,
		},
		{
			Regex:       regexp.MustCompile(`mongodb(?:\+srv)?://[^\s/$.?#].[^\s]*`),
			Type:        "mongodb_uri",
			Description: "MongoDB connection URI with credentials",
			Confidence:  0.9,
		},
		{
			Regex:       regexp.MustCompile(`postgres(?:ql)?://[^\s/$.?#].[^\s]*`),
			Type:        "postgres_uri",
			Description: "PostgreSQL connection URI with credentials",
			Confidence:  0.9,
		},
		{
			Regex:       regexp.MustCompile(`mysql://[^\s/$.?#].[^\s]*`),
			Type:        "mysql_uri",
			Description: "MySQL connection URI with credentials",
			Confidence:  0.9,
		},
		{
			Regex:       regexp.MustCompile(`redis://[^\s/$.?#].[^\s]*`),
			Type:        "redis_uri",
			Description: "Redis connection URI with credentials",
			Confidence:  0.85,
		},
		{
			Regex:       regexp.MustCompile(`(?i)(?:ssh-rsa|ssh-dss|ecdsa-sha2-nistp256|ssh-ed25519)\s+[A-Za-z0-9+/=]{40,}`),
			Type:        "ssh_public_key",
			Description: "SSH public key (low risk)",
			Confidence:  0.3,
		},
		{
			Regex:       regexp.MustCompile(`-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----`),
			Type:        "certificate",
			Description: "SSL/TLS Certificate (low risk)",
			Confidence:  0.3,
		},
	}

	return &Scanner{patterns: patterns}
}

func (s *Scanner) Scan(content string, filename, commitHash string) []models.Finding {
	var findings []models.Finding
	lines := strings.Split(content, "\n")

	for lineNum, line := range lines {
		for _, pattern := range s.patterns {
			matches := pattern.Regex.FindAllStringSubmatch(line, -1)
			for _, match := range matches {
				matchValue := match[0]
				if len(match) > 1 && match[1] != "" {
					matchValue = match[1]
				}

				entropy := calculateEntropy(matchValue)
				confidence := pattern.Confidence

				if len(matchValue) >= 8 && entropy > 3.0 {
					confidence = math.Min(confidence+0.1, 1.0)
				}

				if confidence < 0.5 && entropy < 3.5 {
					continue
				}

				if isFalsePositive(matchValue) {
					continue
				}

				findings = append(findings, models.Finding{
					CommitHash:  commitHash,
					Filename:    filename,
					MatchType:   pattern.Type,
					MatchValue:  matchValue,
					LineNumber:  lineNum + 1,
					Description: pattern.Description,
					Confidence:  confidence,
					Entropy:     entropy,
				})
			}
		}
	}

	findings = append(findings, s.scanHighEntropyStrings(content, filename, commitHash)...)

	return findings
}

func (s *Scanner) scanHighEntropyStrings(content string, filename, commitHash string) []models.Finding {
	var findings []models.Finding
	lines := strings.Split(content, "\n")

	hexPattern := regexp.MustCompile(`[0-9a-fA-F]{40,}`)
	base64Pattern := regexp.MustCompile(`[A-Za-z0-9+/]{48,}={0,2}`)

	for lineNum, line := range lines {
		for _, pattern := range []*regexp.Regexp{hexPattern, base64Pattern} {
			matches := pattern.FindAllString(line, -1)
			for _, match := range matches {
				if isFalsePositive(match) {
					continue
				}

				entropy := calculateEntropy(match)
				if entropy >= 4.2 && len(match) >= 40 {
					confidence := 0.5
					if entropy >= 4.8 {
						confidence = 0.7
					}
					if entropy >= 5.2 {
						confidence = 0.85
					}

					findings = append(findings, models.Finding{
						CommitHash:  commitHash,
						Filename:    filename,
						MatchType:   "high_entropy",
						MatchValue:  match,
						LineNumber:  lineNum + 1,
						Description: "High entropy string - potential secret",
						Confidence:  confidence,
						Entropy:     entropy,
					})
				}
			}
		}
	}

	return findings
}

func calculateEntropy(s string) float64 {
	if len(s) == 0 {
		return 0.0
	}

	freq := make(map[rune]int)
	for _, r := range s {
		freq[r]++
	}

	var entropy float64
	n := float64(len(s))
	for _, count := range freq {
		p := float64(count) / n
		entropy -= p * math.Log2(p)
	}

	return entropy
}

func (s *Scanner) LoadPluginRules(dir string) (int, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, fmt.Errorf("failed to read rules directory: %w", err)
	}

	loaded := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		name := entry.Name()
		if !strings.HasSuffix(name, ".json") && !strings.HasSuffix(name, ".yaml") && !strings.HasSuffix(name, ".yml") && !strings.HasSuffix(name, ".txt") {
			continue
		}

		filePath := filepath.Join(dir, name)
		count, err := s.loadRuleFile(filePath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Warning: failed to load rule file %s: %v\n", filePath, err)
			continue
		}

		loaded += count
	}

	return loaded, nil
}

func (s *Scanner) loadRuleFile(filePath string) (int, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return 0, err
	}

	ext := strings.ToLower(filepath.Ext(filePath))
	switch ext {
	case ".json":
		return s.loadJSONRules(data)
	case ".yaml", ".yml":
		return s.loadYAMLRules(data)
	case ".txt":
		return s.loadTXTRules(data)
	}

	return 0, nil
}

type ruleFile struct {
	Rules []ruleEntry `json:"rules"`
}

type ruleEntry struct {
	Pattern     string  `json:"pattern"`
	Type        string  `json:"type"`
	Description string  `json:"description"`
	Confidence  float64 `json:"confidence"`
}

func (s *Scanner) loadJSONRules(data []byte) (int, error) {
	var rf ruleFile
	if err := json.Unmarshal(data, &rf); err != nil {
		return 0, fmt.Errorf("invalid JSON rule file: %w", err)
	}

	loaded := 0
	for _, r := range rf.Rules {
		re, err := regexp.Compile(r.Pattern)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Warning: invalid regex pattern %q: %v\n", r.Pattern, err)
			continue
		}

		confidence := r.Confidence
		if confidence <= 0 {
			confidence = 0.7
		}
		if confidence > 1.0 {
			confidence = 1.0
		}

		desc := r.Description
		if desc == "" {
			desc = fmt.Sprintf("Custom rule: %s", r.Type)
		}

		s.patterns = append(s.patterns, Pattern{
			Regex:       re,
			Type:        r.Type,
			Description: desc,
			Confidence:  confidence,
		})
		loaded++
	}

	return loaded, nil
}

func (s *Scanner) loadYAMLRules(data []byte) (int, error) {
	lines := strings.Split(string(data), "\n")
	var currentRule *ruleEntry
	loaded := 0

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		if strings.HasPrefix(trimmed, "- pattern:") {
			if currentRule != nil {
				if _, err := loadYAMLRuleEntry(currentRule, s); err == nil {
					loaded++
				}
			}
			currentRule = &ruleEntry{}
			currentRule.Pattern = unquote(strings.TrimPrefix(trimmed, "- pattern:"))
		} else if currentRule != nil {
			if strings.HasPrefix(trimmed, "pattern:") {
				currentRule.Pattern = unquote(strings.TrimPrefix(trimmed, "pattern:"))
			} else if strings.HasPrefix(trimmed, "type:") {
				currentRule.Type = unquote(strings.TrimPrefix(trimmed, "type:"))
			} else if strings.HasPrefix(trimmed, "description:") {
				currentRule.Description = unquote(strings.TrimPrefix(trimmed, "description:"))
			} else if strings.HasPrefix(trimmed, "confidence:") {
				val := unquote(strings.TrimPrefix(trimmed, "confidence:"))
				if f, err := strconv.ParseFloat(val, 64); err == nil {
					currentRule.Confidence = f
				}
			}
		}
	}

	if currentRule != nil {
		if _, err := loadYAMLRuleEntry(currentRule, s); err == nil {
			loaded++
		}
	}

	return loaded, nil
}

func loadYAMLRuleEntry(r *ruleEntry, s *Scanner) (Pattern, error) {
	re, err := regexp.Compile(r.Pattern)
	if err != nil {
		return Pattern{}, err
	}

	confidence := r.Confidence
	if confidence <= 0 {
		confidence = 0.7
	}

	desc := r.Description
	if desc == "" {
		desc = fmt.Sprintf("Custom rule: %s", r.Type)
	}

	p := Pattern{
		Regex:       re,
		Type:        r.Type,
		Description: desc,
		Confidence:  confidence,
	}
	s.patterns = append(s.patterns, p)
	return p, nil
}

func (s *Scanner) loadTXTRules(data []byte) (int, error) {
	loaded := 0
	lines := strings.Split(string(data), "\n")

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		parts := strings.SplitN(trimmed, "|", 4)
		pattern := strings.TrimSpace(parts[0])

		re, err := regexp.Compile(pattern)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Warning: invalid regex pattern %q: %v\n", pattern, err)
			continue
		}

		ruleType := "custom"
		if len(parts) > 1 && parts[1] != "" {
			ruleType = strings.TrimSpace(parts[1])
		}

		description := fmt.Sprintf("Custom rule: %s", ruleType)
		if len(parts) > 2 && parts[2] != "" {
			description = strings.TrimSpace(parts[2])
		}

		confidence := 0.7
		if len(parts) > 3 && parts[3] != "" {
			if f, err := strconv.ParseFloat(strings.TrimSpace(parts[3]), 64); err == nil {
				confidence = f
			}
		}

		s.patterns = append(s.patterns, Pattern{
			Regex:       re,
			Type:        ruleType,
			Description: description,
			Confidence:  confidence,
		})
		loaded++
	}

	return loaded, nil
}

func unquote(s string) string {
	s = strings.TrimSpace(s)
	if len(s) >= 2 && (s[0] == '"' || s[0] == '\'') && s[len(s)-1] == s[0] {
		return s[1 : len(s)-1]
	}
	return s
}
