package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"configcenter/raft"
	"configcenter/storage"

	"github.com/gorilla/mux"
)

type PutConfigRequest struct {
	Value   string `json:"value"`
	Version uint64 `json:"version"`
}

type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

type Watcher struct {
	key       string
	version   uint64
	ch        chan *storage.ConfigEntry
	cancelled bool
	mu        sync.Mutex
}

type WatchHub struct {
	mu       sync.RWMutex
	watchers map[string][]*Watcher
}

func NewWatchHub() *WatchHub {
	return &WatchHub{
		watchers: make(map[string][]*Watcher),
	}
}

func (h *WatchHub) AddWatcher(key string, version uint64) *Watcher {
	w := &Watcher{
		key:     key,
		version: version,
		ch:      make(chan *storage.ConfigEntry, 1),
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.watchers[key] = append(h.watchers[key], w)
	return w
}

func (h *WatchHub) RemoveWatcher(key string, w *Watcher) {
	w.mu.Lock()
	w.cancelled = true
	w.mu.Unlock()
	h.mu.Lock()
	defer h.mu.Unlock()
	watchers := h.watchers[key]
	for i, watcher := range watchers {
		if watcher == w {
			h.watchers[key] = append(watchers[:i], watchers[i+1:]...)
			break
		}
	}
}

func (h *WatchHub) NotifyChange(key string, entry *storage.ConfigEntry) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, w := range h.watchers[key] {
		w.mu.Lock()
		if !w.cancelled && entry.Version > w.version {
			select {
			case w.ch <- entry:
			default:
			}
		}
		w.mu.Unlock()
	}
	for _, w := range h.watchers[""] {
		w.mu.Lock()
		if !w.cancelled && entry.Version > w.version {
			select {
			case w.ch <- entry:
			default:
			}
		}
		w.mu.Unlock()
	}
}

type Server struct {
	Node   *raft.RaftNode
	Store  *storage.LevelDBStore
	Router *mux.Router
	Addr   string
	Hub    *WatchHub
}

func NewServer(addr string, node *raft.RaftNode, store *storage.LevelDBStore) *Server {
	s := &Server{
		Node:   node,
		Store:  store,
		Router: mux.NewRouter(),
		Addr:   addr,
		Hub:    NewWatchHub(),
	}
	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	s.Router.HandleFunc("/v1/config/{key}", s.putConfig).Methods("PUT")
	s.Router.HandleFunc("/v1/config/{key}", s.getConfig).Methods("GET")
	s.Router.HandleFunc("/v1/config/{key}/watch", s.watchConfig).Methods("GET")
	s.Router.HandleFunc("/raft/vote", s.handleRequestVote).Methods("POST")
	s.Router.HandleFunc("/raft/append", s.handleAppendEntries).Methods("POST")
	s.Router.HandleFunc("/raft/snapshot", s.handleInstallSnapshot).Methods("POST")
	s.Router.HandleFunc("/v1/status", s.getStatus).Methods("GET")
	s.Router.HandleFunc("/v1/changelog", s.getChangeLog).Methods("GET")
	s.Router.HandleFunc("/v1/audit", s.getAuditLog).Methods("GET")
	s.Router.HandleFunc("/v1/backup", s.exportBackup).Methods("GET")
	s.Router.HandleFunc("/v1/backup", s.importBackup).Methods("POST")
}

func (s *Server) Start() error {
	fmt.Printf("[%s] Starting server on %s\n", s.Node.ID, s.Addr)
	return http.ListenAndServe(s.Addr, s.Router)
}

func (s *Server) putConfig(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	key := vars["key"]

	var req PutConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Message: "invalid request body",
		})
		return
	}

	if !s.Node.IsLeader() {
		leaderID := s.Node.GetLeaderID()
		writeJSON(w, http.StatusTemporaryRedirect, APIResponse{
			Success: false,
			Message: fmt.Sprintf("not leader, leader is %s", leaderID),
		})
		return
	}

	clientIP := extractClientIP(r)

	command := map[string]interface{}{
		"op":               "put",
		"key":              key,
		"value":            req.Value,
		"expected_version": req.Version,
		"operator":         clientIP,
		"client_ip":        clientIP,
	}

	ok, logIndex, err := s.Node.Propose(command)
	if err != nil || !ok {
		writeJSON(w, http.StatusServiceUnavailable, APIResponse{
			Success: false,
			Message: "failed to propose: " + err.Error(),
		})
		return
	}

	committed := s.Node.WaitForCommit(logIndex, 3*time.Second)

	entry, err := s.Store.GetConfig(key)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, APIResponse{
			Success: false,
			Message: "storage error: " + err.Error(),
		})
		return
	}

	if !committed {
		writeJSON(w, http.StatusAccepted, APIResponse{
			Success: true,
			Message: "proposed but not yet confirmed committed",
			Data:    entry,
		})
		return
	}

	if entry != nil {
		s.Hub.NotifyChange(key, entry)
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    entry,
	})
}

func (s *Server) getConfig(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	key := vars["key"]
	versionStr := r.URL.Query().Get("version")

	var entry *storage.ConfigEntry
	var err error

	if versionStr != "" {
		version, parseErr := strconv.ParseUint(versionStr, 10, 64)
		if parseErr != nil {
			writeJSON(w, http.StatusBadRequest, APIResponse{
				Success: false,
				Message: "invalid version parameter",
			})
			return
		}
		entry, err = s.Store.GetConfigByVersion(key, version)
	} else {
		entry, err = s.Store.GetConfig(key)
	}

	if err != nil {
		writeJSON(w, http.StatusInternalServerError, APIResponse{
			Success: false,
			Message: "storage error: " + err.Error(),
		})
		return
	}

	if entry == nil {
		writeJSON(w, http.StatusNotFound, APIResponse{
			Success: false,
			Message: fmt.Sprintf("key %s not found", key),
		})
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    entry,
	})
}

func (s *Server) watchConfig(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	key := vars["key"]
	versionStr := r.URL.Query().Get("version")
	timeoutStr := r.URL.Query().Get("timeout")

	version := uint64(0)
	if versionStr != "" {
		if v, err := strconv.ParseUint(versionStr, 10, 64); err == nil {
			version = v
		}
	}

	timeout := 30 * time.Second
	if timeoutStr != "" {
		if secs, err := strconv.Atoi(timeoutStr); err == nil && secs > 0 && secs <= 120 {
			timeout = time.Duration(secs) * time.Second
		}
	}

	current, err := s.Store.GetConfig(key)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, APIResponse{
			Success: false,
			Message: "storage error: " + err.Error(),
		})
		return
	}

	if current != nil && current.Version > version {
		writeJSON(w, http.StatusOK, APIResponse{
			Success: true,
			Data:    current,
		})
		return
	}

	watcher := s.Hub.AddWatcher(key, version)
	defer s.Hub.RemoveWatcher(key, watcher)

	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()

	flusher, canFlush := w.(http.Flusher)

	if canFlush {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.WriteHeader(http.StatusOK)
		flusher.Flush()
	}

	select {
	case entry := <-watcher.ch:
		if canFlush {
			data, _ := json.Marshal(APIResponse{Success: true, Data: entry})
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		} else {
			writeJSON(w, http.StatusOK, APIResponse{
				Success: true,
				Data:    entry,
			})
		}
	case <-ctx.Done():
		if canFlush {
			data, _ := json.Marshal(APIResponse{Success: true, Message: "timeout, no change"})
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		} else {
			writeJSON(w, http.StatusOK, APIResponse{
				Success: true,
				Message: "timeout, no change",
			})
		}
	}
}

func (s *Server) handleRequestVote(w http.ResponseWriter, r *http.Request) {
	var req raft.RequestVoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Message: "invalid request",
		})
		return
	}

	resp := s.Node.HandleRequestVote(req)
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleAppendEntries(w http.ResponseWriter, r *http.Request) {
	var req raft.AppendEntriesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Message: "invalid request",
		})
		return
	}

	resp := s.Node.HandleAppendEntries(req)
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleInstallSnapshot(w http.ResponseWriter, r *http.Request) {
	var req raft.InstallSnapshotRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Message: "invalid request",
		})
		return
	}

	resp := s.Node.HandleInstallSnapshot(req)
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) getStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"node_id": s.Node.ID,
			"state":   s.Node.GetState(),
			"term":    s.Node.GetCurrentTerm(),
			"leader":  s.Node.GetLeaderID(),
		},
	})
}

func (s *Server) getChangeLog(w http.ResponseWriter, r *http.Request) {
	fromStr := r.URL.Query().Get("from")
	limitStr := r.URL.Query().Get("limit")

	from := uint64(0)
	limit := 100

	if fromStr != "" {
		if v, err := strconv.ParseUint(fromStr, 10, 64); err == nil {
			from = v
		}
	}
	if limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil {
			limit = v
		}
	}

	logs, err := s.Store.GetChangeLogs(from, limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, APIResponse{
			Success: false,
			Message: "storage error: " + err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    logs,
	})
}

func (s *Server) getAuditLog(w http.ResponseWriter, r *http.Request) {
	keyFilter := r.URL.Query().Get("key")
	operatorFilter := r.URL.Query().Get("operator")
	fromStr := r.URL.Query().Get("from")
	limitStr := r.URL.Query().Get("limit")

	from := uint64(0)
	limit := 200

	if fromStr != "" {
		if v, err := strconv.ParseUint(fromStr, 10, 64); err == nil {
			from = v
		}
	}
	if limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil {
			limit = v
		}
	}

	logs, err := s.Store.GetChangeLogs(from, 0)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, APIResponse{
			Success: false,
			Message: "storage error: " + err.Error(),
		})
		return
	}

	var filtered []*storage.ChangeLogEntry
	for _, l := range logs {
		if keyFilter != "" && l.Key != keyFilter {
			continue
		}
		if operatorFilter != "" && l.Operator != operatorFilter {
			continue
		}
		filtered = append(filtered, l)
		if limit > 0 && len(filtered) >= limit {
			break
		}
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    filtered,
	})
}

type BackupData struct {
	Configs    map[string]*storage.ConfigEntry `json:"configs"`
	ChangeLogs []*storage.ChangeLogEntry        `json:"change_logs"`
	ExportTime int64                            `json:"export_time"`
	NodeID     string                           `json:"node_id"`
}

func (s *Server) exportBackup(w http.ResponseWriter, r *http.Request) {
	configs, logs, err := s.Store.ExportAll()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, APIResponse{
			Success: false,
			Message: "storage error: " + err.Error(),
		})
		return
	}

	backup := BackupData{
		Configs:    configs,
		ChangeLogs: logs,
		ExportTime: time.Now().Unix(),
		NodeID:     s.Node.ID,
	}

	writeJSON(w, http.StatusOK, backup)
}

func (s *Server) importBackup(w http.ResponseWriter, r *http.Request) {
	if !s.Node.IsLeader() {
		writeJSON(w, http.StatusTemporaryRedirect, APIResponse{
			Success: false,
			Message: "not leader, only leader can import backup",
		})
		return
	}

	var backup BackupData
	if err := json.NewDecoder(r.Body).Decode(&backup); err != nil {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Message: "invalid backup data: " + err.Error(),
		})
		return
	}

	if len(backup.Configs) == 0 {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Message: "backup contains no configs",
		})
		return
	}

	for key, entry := range backup.Configs {
		command := map[string]interface{}{
			"op":               "import",
			"key":              key,
			"value":            entry.Value,
			"expected_version": uint64(0),
			"import_version":   entry.Version,
			"operator":         "backup-restore",
			"client_ip":        "system",
		}
		s.Node.Propose(command)
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Message: fmt.Sprintf("importing %d configs via Raft", len(backup.Configs)),
	})
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func extractClientIP(r *http.Request) string {
	xfwd := r.Header.Get("X-Forwarded-For")
	if xfwd != "" {
		parts := strings.Split(xfwd, ",")
		return strings.TrimSpace(parts[0])
	}
	xff := r.Header.Get("X-Real-IP")
	if xff != "" {
		return xff
	}
	idx := strings.LastIndex(r.RemoteAddr, ":")
	if idx > 0 {
		return r.RemoteAddr[:idx]
	}
	return r.RemoteAddr
}
