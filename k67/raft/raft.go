package raft

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"sync"
	"time"
)

const (
	Follower  = "follower"
	Candidate = "candidate"
	Leader    = "leader"
)

type LogEntry struct {
	Index   uint64      `json:"index"`
	Term    uint64      `json:"term"`
	Command interface{} `json:"command"`
}

type Snapshot struct {
	LastIncludedIndex uint64                 `json:"last_included_index"`
	LastIncludedTerm  uint64                 `json:"last_included_term"`
	Data              map[string]ConfigValue `json:"data"`
}

type ConfigValue struct {
	Value   string `json:"value"`
	Version uint64 `json:"version"`
}

type RequestVoteRequest struct {
	Term         uint64 `json:"term"`
	CandidateID  string `json:"candidate_id"`
	LastLogIndex uint64 `json:"last_log_index"`
	LastLogTerm  uint64 `json:"last_log_term"`
}

type RequestVoteResponse struct {
	Term        uint64 `json:"term"`
	VoteGranted bool   `json:"vote_granted"`
}

type AppendEntriesRequest struct {
	Term         uint64      `json:"term"`
	LeaderID     string      `json:"leader_id"`
	PrevLogIndex uint64      `json:"prev_log_index"`
	PrevLogTerm  uint64      `json:"prev_log_term"`
	Entries      []LogEntry  `json:"entries"`
	LeaderCommit uint64      `json:"leader_commit"`
}

type AppendEntriesResponse struct {
	Term          uint64 `json:"term"`
	Success       bool   `json:"success"`
	ConflictIndex uint64 `json:"conflict_index,omitempty"`
	ConflictTerm  uint64 `json:"conflict_term,omitempty"`
}

type InstallSnapshotRequest struct {
	Term              uint64                 `json:"term"`
	LeaderID          string                 `json:"leader_id"`
	LastIncludedIndex uint64                 `json:"last_included_index"`
	LastIncludedTerm  uint64                 `json:"last_included_term"`
	Data              map[string]ConfigValue `json:"data"`
}

type InstallSnapshotResponse struct {
	Term uint64 `json:"term"`
}

type CommitApplier interface {
	Apply(entry LogEntry)
}

type ConfigChangeNotifier interface {
	NotifyChange(key string, entry LogEntry)
}

type RaftNode struct {
	mu sync.Mutex

	ID          string
	Peers       []string
	State       string
	CurrentTerm uint64
	VotedFor    string

	Log         []LogEntry
	CommitIndex uint64
	LastApplied uint64

	NextIndex  map[string]uint64
	MatchIndex map[string]uint64

	Snapshot        *Snapshot
	SnapshotEnabled bool

	LeaderID string

	ElectionTimeout   time.Duration
	HeartbeatInterval time.Duration

	Applier   CommitApplier
	Notifier  ConfigChangeNotifier

	StopCh          chan struct{}
	resetElectionCh chan struct{}
	proposeCh       chan struct{}
	stepDownCh      chan struct{}
	becomeLeaderCh  chan struct{}

	snapshotTimeout time.Duration
}

func NewRaftNode(id string, peers []string, applier CommitApplier) *RaftNode {
	n := &RaftNode{
		ID:                id,
		Peers:             peers,
		State:             Follower,
		CurrentTerm:       0,
		VotedFor:          "",
		Log:               make([]LogEntry, 0),
		CommitIndex:       0,
		LastApplied:       0,
		NextIndex:         make(map[string]uint64),
		MatchIndex:        make(map[string]uint64),
		Snapshot:          nil,
		SnapshotEnabled:   true,
		ElectionTimeout:   time.Duration(2000+rand.Intn(2000)) * time.Millisecond,
		HeartbeatInterval: 500 * time.Millisecond,
		Applier:           applier,
		StopCh:            make(chan struct{}),
		resetElectionCh:   make(chan struct{}, 64),
		proposeCh:         make(chan struct{}, 64),
		stepDownCh:        make(chan struct{}, 8),
		becomeLeaderCh:    make(chan struct{}, 8),
		snapshotTimeout:   15 * time.Second,
	}
	return n
}

func (n *RaftNode) Start() {
	go n.run()
}

func (n *RaftNode) run() {
	electionTimer := time.NewTimer(n.ElectionTimeout)
	heartbeatTimer := time.NewTimer(n.HeartbeatInterval)
	heartbeatTimer.Stop()

	for {
		n.mu.Lock()
		state := n.State
		n.mu.Unlock()

		switch state {
		case Follower, Candidate:
			select {
			case <-electionTimer.C:
				n.mu.Lock()
				if n.State == Follower || n.State == Candidate {
					n.becomeCandidate()
				}
				n.mu.Unlock()
				electionTimer.Reset(n.randomElectionTimeout())
			case <-n.resetElectionCh:
				electionTimer.Reset(n.randomElectionTimeout())
			case <-n.proposeCh:
			case <-n.StopCh:
				return
			}
		case Leader:
			select {
			case <-heartbeatTimer.C:
				n.sendHeartbeats()
				heartbeatTimer.Reset(n.HeartbeatInterval)
			case <-n.proposeCh:
				n.replicateLog()
			case <-n.becomeLeaderCh:
				heartbeatTimer.Stop()
				n.sendHeartbeats()
				heartbeatTimer.Reset(n.HeartbeatInterval)
			case <-n.stepDownCh:
				n.mu.Lock()
				if n.State == Leader {
					n.State = Follower
				}
				n.mu.Unlock()
				electionTimer.Reset(n.randomElectionTimeout())
				heartbeatTimer.Stop()
			case <-n.StopCh:
				return
			}
		}
	}
}

func (n *RaftNode) randomElectionTimeout() time.Duration {
	return time.Duration(2000+rand.Intn(2000)) * time.Millisecond
}

func (n *RaftNode) becomeCandidate() {
	n.State = Candidate
	n.CurrentTerm++
	n.VotedFor = n.ID
	n.LeaderID = ""

	votesReceived := 1
	votesNeeded := len(n.Peers)/2 + 1

	lastLogIndex := n.getLastLogIndex()
	lastLogTerm := n.getLastLogTerm()

	req := RequestVoteRequest{
		Term:         n.CurrentTerm,
		CandidateID:  n.ID,
		LastLogIndex: lastLogIndex,
		LastLogTerm:  lastLogTerm,
	}

	for _, peer := range n.Peers {
		go func(peer string) {
			resp, err := n.sendRequestVote(peer, req)
			if err != nil {
				return
			}
			n.mu.Lock()
			defer n.mu.Unlock()

			if n.State != Candidate || n.CurrentTerm != req.Term {
				return
			}
			if resp.Term > n.CurrentTerm {
				n.State = Follower
				n.CurrentTerm = resp.Term
				n.VotedFor = ""
				return
			}
			if resp.VoteGranted {
				votesReceived++
				if votesReceived >= votesNeeded && n.State == Candidate {
					n.becomeLeader()
					select {
					case n.proposeCh <- struct{}{}:
					default:
					}
				}
			}
		}(peer)
	}
}

func (n *RaftNode) becomeLeader() {
	n.State = Leader
	n.LeaderID = n.ID

	lastIdx := n.getLastLogIndex()
	for _, peer := range n.Peers {
		n.NextIndex[peer] = lastIdx + 1
		n.MatchIndex[peer] = 0
	}

	noOp := LogEntry{
		Index:   lastIdx + 1,
		Term:    n.CurrentTerm,
		Command: map[string]interface{}{"op": "noop"},
	}
	n.Log = append(n.Log, noOp)

	select {
	case n.becomeLeaderCh <- struct{}{}:
	default:
	}
}

func (n *RaftNode) HandleRequestVote(req RequestVoteRequest) RequestVoteResponse {
	n.mu.Lock()
	defer n.mu.Unlock()

	resp := RequestVoteResponse{Term: n.CurrentTerm}

	if req.Term < n.CurrentTerm {
		return resp
	}

	if req.Term > n.CurrentTerm {
		n.State = Follower
		n.CurrentTerm = req.Term
		n.VotedFor = ""
		n.LeaderID = ""
		resp.Term = req.Term
		select {
		case n.stepDownCh <- struct{}{}:
		default:
		}
	}

	if n.VotedFor == "" || n.VotedFor == req.CandidateID {
		lastLogTerm := n.getLastLogTerm()
		lastLogIndex := n.getLastLogIndex()
		logOk := req.LastLogTerm > lastLogTerm ||
			(req.LastLogTerm == lastLogTerm && req.LastLogIndex >= lastLogIndex)
		if logOk {
			n.VotedFor = req.CandidateID
			select {
			case n.resetElectionCh <- struct{}{}:
			default:
			}
			resp.VoteGranted = true
		}
	}

	return resp
}

func (n *RaftNode) HandleAppendEntries(req AppendEntriesRequest) AppendEntriesResponse {
	n.mu.Lock()
	defer n.mu.Unlock()

	resp := AppendEntriesResponse{Term: n.CurrentTerm}

	if req.Term < n.CurrentTerm {
		return resp
	}

	if req.Term > n.CurrentTerm {
		n.State = Follower
		n.CurrentTerm = req.Term
		n.VotedFor = ""
		n.LeaderID = req.LeaderID
		resp.Term = req.Term
		select {
		case n.stepDownCh <- struct{}{}:
		default:
		}
	}

	if req.Term == n.CurrentTerm {
		if n.State == Candidate {
			n.State = Follower
		}
		if n.LeaderID == "" {
			n.LeaderID = req.LeaderID
		}
		resp.Term = req.Term
	}

	select {
	case n.resetElectionCh <- struct{}{}:
	default:
	}

	snapshotLastIdx := n.getSnapshotLastIndex()

	if req.PrevLogIndex > 0 {
		if req.PrevLogIndex < snapshotLastIdx {
			resp.Success = false
			resp.ConflictIndex = snapshotLastIdx + 1
			return resp
		}
		localIdx := int(req.PrevLogIndex - snapshotLastIdx)
		if localIdx > len(n.Log) {
			resp.Success = false
			resp.ConflictIndex = n.getLastLogIndex() + 1
			return resp
		}
		if localIdx > 0 {
			if n.Log[localIdx-1].Term != req.PrevLogTerm {
				conflictTerm := n.Log[localIdx-1].Term
				conflictIdx := uint64(0)
				for i := localIdx - 1; i >= 0; i-- {
					if n.Log[i].Term != conflictTerm {
						conflictIdx = n.Log[i].Index + 1
						break
					}
				}
				if conflictIdx == 0 {
					conflictIdx = snapshotLastIdx + 1
				}
				resp.Success = false
				resp.ConflictTerm = conflictTerm
				resp.ConflictIndex = conflictIdx
				return resp
			}
		} else if req.PrevLogIndex == snapshotLastIdx && n.Snapshot != nil {
			if n.Snapshot.LastIncludedTerm != req.PrevLogTerm {
				resp.Success = false
				resp.ConflictIndex = snapshotLastIdx
				return resp
			}
		}
	}

	insertIdx := int(req.PrevLogIndex - snapshotLastIdx)
	for i, entry := range req.Entries {
		logPos := insertIdx + 1 + i
		if logPos <= len(n.Log) {
			if n.Log[logPos-1].Term != entry.Term {
				n.Log = n.Log[:logPos-1]
				n.Log = append(n.Log, entry)
			}
		} else {
			n.Log = append(n.Log, entry)
		}
	}

	if req.LeaderCommit > n.CommitIndex {
		lastNewIdx := req.PrevLogIndex + uint64(len(req.Entries))
		if req.LeaderCommit < lastNewIdx {
			n.CommitIndex = req.LeaderCommit
		} else {
			n.CommitIndex = lastNewIdx
		}
		n.applyCommitted()
	}

	resp.Success = true
	return resp
}

func (n *RaftNode) HandleInstallSnapshot(req InstallSnapshotRequest) InstallSnapshotResponse {
	n.mu.Lock()
	defer n.mu.Unlock()

	resp := InstallSnapshotResponse{Term: n.CurrentTerm}

	if req.Term < n.CurrentTerm {
		return resp
	}

	if req.Term > n.CurrentTerm {
		n.State = Follower
		n.CurrentTerm = req.Term
		n.VotedFor = ""
		n.LeaderID = req.LeaderID
		resp.Term = req.Term
		select {
		case n.stepDownCh <- struct{}{}:
		default:
		}
	}

	if req.Term == n.CurrentTerm {
		if n.State == Candidate {
			n.State = Follower
		}
		if n.LeaderID == "" {
			n.LeaderID = req.LeaderID
		}
		resp.Term = req.Term
	}

	select {
	case n.resetElectionCh <- struct{}{}:
	default:
	}

	oldSnapshotLastIdx := n.getSnapshotLastIndex()

	n.Snapshot = &Snapshot{
		LastIncludedIndex: req.LastIncludedIndex,
		LastIncludedTerm:  req.LastIncludedTerm,
		Data:              req.Data,
	}

	if req.LastIncludedIndex > oldSnapshotLastIdx {
		cutoff := req.LastIncludedIndex - oldSnapshotLastIdx
		if cutoff <= uint64(len(n.Log)) {
			n.Log = n.Log[cutoff:]
		} else {
			n.Log = make([]LogEntry, 0)
		}
	}

	if n.LastApplied < req.LastIncludedIndex {
		n.LastApplied = req.LastIncludedIndex
	}
	if n.CommitIndex < req.LastIncludedIndex {
		n.CommitIndex = req.LastIncludedIndex
	}

	return resp
}

func (n *RaftNode) Propose(command interface{}) (bool, uint64, error) {
	n.mu.Lock()
	defer n.mu.Unlock()

	if n.State != Leader {
		return false, 0, fmt.Errorf("not leader")
	}

	entry := LogEntry{
		Index:   n.getLastLogIndex() + 1,
		Term:    n.CurrentTerm,
		Command: command,
	}
	n.Log = append(n.Log, entry)

	select {
	case n.proposeCh <- struct{}{}:
	default:
	}

	return true, entry.Index, nil
}

func (n *RaftNode) WaitForCommit(index uint64, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		n.mu.Lock()
		committed := n.CommitIndex >= index
		stillLeader := n.State == Leader
		n.mu.Unlock()
		if committed {
			return true
		}
		if !stillLeader {
			return false
		}
		time.Sleep(10 * time.Millisecond)
	}
	return false
}

func (n *RaftNode) replicateLog() {
	for _, peer := range n.Peers {
		go func(peer string) {
			n.replicateToPeer(peer, 3)
		}(peer)
	}
}

func (n *RaftNode) replicateToPeer(peer string, maxRetries int) {
	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(50*attempt) * time.Millisecond)
		}

		n.mu.Lock()
		if n.State != Leader {
			n.mu.Unlock()
			return
		}

		nextIdx := n.NextIndex[peer]
		snapshotLastIdx := n.getSnapshotLastIndex()

		if nextIdx <= snapshotLastIdx && n.SnapshotEnabled && n.Snapshot != nil {
			snapReq := InstallSnapshotRequest{
				Term:              n.CurrentTerm,
				LeaderID:          n.ID,
				LastIncludedIndex: n.Snapshot.LastIncludedIndex,
				LastIncludedTerm:  n.Snapshot.LastIncludedTerm,
				Data:              n.Snapshot.Data,
			}
			n.mu.Unlock()

			resp, err := n.sendInstallSnapshotWithRetry(peer, snapReq, 3)
			if err != nil {
				log.Printf("[Raft] InstallSnapshot to %s failed after retries: %v", peer, err)
				continue
			}

			n.mu.Lock()
			if n.State != Leader {
				n.mu.Unlock()
				return
			}
			if resp.Term > n.CurrentTerm {
				n.stepDownLocked(resp.Term)
				n.mu.Unlock()
				return
			}
			n.NextIndex[peer] = snapReq.LastIncludedIndex + 1
			n.MatchIndex[peer] = snapReq.LastIncludedIndex
			n.mu.Unlock()
			return
		}

		prevLogIndex := nextIdx - 1
		prevLogTerm := uint64(0)
		var entries []LogEntry

		if prevLogIndex > 0 {
			localIdx := int(prevLogIndex - snapshotLastIdx)
			if localIdx > 0 && localIdx <= len(n.Log) {
				prevLogTerm = n.Log[localIdx-1].Term
			} else if prevLogIndex == snapshotLastIdx && n.Snapshot != nil {
				prevLogTerm = n.Snapshot.LastIncludedTerm
			} else if localIdx > len(n.Log) {
				n.NextIndex[peer] = snapshotLastIdx + 1
				n.mu.Unlock()
				continue
			} else {
				n.NextIndex[peer] = snapshotLastIdx + 1
				n.mu.Unlock()
				continue
			}
		}

		startLocal := int(nextIdx - snapshotLastIdx)
		if startLocal <= 0 {
			startLocal = 1
		}
		if startLocal <= len(n.Log) {
			entries = make([]LogEntry, len(n.Log[startLocal-1:]))
			copy(entries, n.Log[startLocal-1:])
		}

		req := AppendEntriesRequest{
			Term:         n.CurrentTerm,
			LeaderID:     n.ID,
			PrevLogIndex: prevLogIndex,
			PrevLogTerm:  prevLogTerm,
			Entries:      entries,
			LeaderCommit: n.CommitIndex,
		}
		n.mu.Unlock()

		resp, err := n.sendAppendEntries(peer, req)
		if err != nil {
			continue
		}

		n.mu.Lock()
		if n.State != Leader || n.CurrentTerm != req.Term {
			n.mu.Unlock()
			return
		}

		if resp.Term > n.CurrentTerm {
			n.stepDownLocked(resp.Term)
			n.mu.Unlock()
			return
		}

		if resp.Success {
			n.NextIndex[peer] = prevLogIndex + uint64(len(entries)) + 1
			n.MatchIndex[peer] = prevLogIndex + uint64(len(entries))
			n.advanceCommit()
			n.mu.Unlock()
			return
		}

		if resp.ConflictIndex > 0 {
			n.NextIndex[peer] = resp.ConflictIndex
		} else {
			if n.NextIndex[peer] > 1 {
				n.NextIndex[peer]--
			}
		}
		n.mu.Unlock()
	}
}

func (n *RaftNode) stepDownLocked(higherTerm uint64) {
	n.State = Follower
	n.CurrentTerm = higherTerm
	n.VotedFor = ""
	select {
	case n.stepDownCh <- struct{}{}:
	default:
	}
}

func (n *RaftNode) advanceCommit() {
	for idx := n.CommitIndex + 1; idx <= n.getLastLogIndex(); idx++ {
		replicas := 1
		for _, peer := range n.Peers {
			if n.MatchIndex[peer] >= idx {
				replicas++
			}
		}
		if replicas >= len(n.Peers)/2+1 {
			localIdx := int(idx - n.getSnapshotLastIndex())
			if localIdx > 0 && localIdx <= len(n.Log) {
				if n.Log[localIdx-1].Term == n.CurrentTerm {
					n.CommitIndex = idx
				}
			}
		}
	}
	n.applyCommitted()
}

func (n *RaftNode) applyCommitted() {
	for n.LastApplied < n.CommitIndex {
		n.LastApplied++
		localIdx := int(n.LastApplied - n.getSnapshotLastIndex())
		if localIdx > 0 && localIdx <= len(n.Log) {
			if n.Applier != nil {
				entry := n.Log[localIdx-1]
				n.mu.Unlock()
				n.Applier.Apply(entry)
				if n.Notifier != nil {
					n.Notifier.NotifyChange("", entry)
				}
				n.mu.Lock()
			}
		}
	}
}

func (n *RaftNode) sendHeartbeats() {
	for _, peer := range n.Peers {
		go func(peer string) {
			n.mu.Lock()
			if n.State != Leader {
				n.mu.Unlock()
				return
			}

			nextIdx := n.NextIndex[peer]
			snapshotLastIdx := n.getSnapshotLastIndex()

			prevLogIndex := nextIdx - 1
			prevLogTerm := uint64(0)
			var entries []LogEntry

			if prevLogIndex > 0 {
				localIdx := int(prevLogIndex - snapshotLastIdx)
				if localIdx > 0 && localIdx <= len(n.Log) {
					prevLogTerm = n.Log[localIdx-1].Term
				} else if prevLogIndex == snapshotLastIdx && n.Snapshot != nil {
					prevLogTerm = n.Snapshot.LastIncludedTerm
				}
			}

			startLocal := int(nextIdx - snapshotLastIdx)
			if startLocal <= 0 {
				startLocal = 1
			}
			if startLocal <= len(n.Log) {
				entries = make([]LogEntry, len(n.Log[startLocal-1:]))
				copy(entries, n.Log[startLocal-1:])
			}

			req := AppendEntriesRequest{
				Term:         n.CurrentTerm,
				LeaderID:     n.ID,
				PrevLogIndex: prevLogIndex,
				PrevLogTerm:  prevLogTerm,
				Entries:      entries,
				LeaderCommit: n.CommitIndex,
			}
			n.mu.Unlock()

			resp, err := n.sendAppendEntries(peer, req)
			if err != nil {
				return
			}

			n.mu.Lock()
			defer n.mu.Unlock()

			if n.State != Leader || n.CurrentTerm != req.Term {
				return
			}

			if resp.Term > n.CurrentTerm {
				n.stepDownLocked(resp.Term)
				return
			}

			if resp.Success {
				n.NextIndex[peer] = prevLogIndex + uint64(len(entries)) + 1
				n.MatchIndex[peer] = prevLogIndex + uint64(len(entries))
				n.advanceCommit()
			} else {
				if resp.ConflictIndex > 0 {
					n.NextIndex[peer] = resp.ConflictIndex
				} else {
					if n.NextIndex[peer] > 1 {
						n.NextIndex[peer]--
					}
				}
			}
		}(peer)
	}
}

func (n *RaftNode) TakeSnapshot(data map[string]ConfigValue) {
	n.mu.Lock()
	defer n.mu.Unlock()

	if n.CommitIndex == 0 {
		return
	}

	lastIdx := n.CommitIndex
	oldSnapshotLastIdx := n.getSnapshotLastIndex()

	var lastTerm uint64
	localIdx := int(lastIdx - oldSnapshotLastIdx)
	if localIdx > 0 && localIdx <= len(n.Log) {
		lastTerm = n.Log[localIdx-1].Term
	} else if n.Snapshot != nil {
		lastTerm = n.Snapshot.LastIncludedTerm
	} else {
		return
	}

	n.Snapshot = &Snapshot{
		LastIncludedIndex: lastIdx,
		LastIncludedTerm:  lastTerm,
		Data:              data,
	}

	cutoff := lastIdx - oldSnapshotLastIdx
	if cutoff > 0 && cutoff <= uint64(len(n.Log)) {
		n.Log = n.Log[cutoff:]
	}
}

func (n *RaftNode) IsLeader() bool {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.State == Leader
}

func (n *RaftNode) GetLeaderID() string {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.LeaderID
}

func (n *RaftNode) GetState() string {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.State
}

func (n *RaftNode) GetCurrentTerm() uint64 {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.CurrentTerm
}

func (n *RaftNode) GetSnapshot() *Snapshot {
	n.mu.Lock()
	defer n.mu.Unlock()
	if n.Snapshot == nil {
		return nil
	}
	cp := *n.Snapshot
	cp.Data = make(map[string]ConfigValue, len(n.Snapshot.Data))
	for k, v := range n.Snapshot.Data {
		cp.Data[k] = v
	}
	return &cp
}

func (n *RaftNode) getLastLogIndex() uint64 {
	snapshotLast := n.getSnapshotLastIndex()
	if len(n.Log) == 0 {
		return snapshotLast
	}
	return n.Log[len(n.Log)-1].Index
}

func (n *RaftNode) getLastLogTerm() uint64 {
	if len(n.Log) == 0 {
		if n.Snapshot != nil {
			return n.Snapshot.LastIncludedTerm
		}
		return 0
	}
	return n.Log[len(n.Log)-1].Term
}

func (n *RaftNode) getSnapshotLastIndex() uint64 {
	if n.Snapshot != nil {
		return n.Snapshot.LastIncludedIndex
	}
	return 0
}

func (n *RaftNode) sendRequestVote(peer string, req RequestVoteRequest) (RequestVoteResponse, error) {
	url := fmt.Sprintf("http://%s/raft/vote", peer)
	body, err := json.Marshal(req)
	if err != nil {
		return RequestVoteResponse{}, err
	}
	client := &http.Client{Timeout: 800 * time.Millisecond}
	resp, err := client.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return RequestVoteResponse{}, err
	}
	defer resp.Body.Close()
	var voteResp RequestVoteResponse
	if err := json.NewDecoder(resp.Body).Decode(&voteResp); err != nil {
		return RequestVoteResponse{}, err
	}
	return voteResp, nil
}

func (n *RaftNode) sendAppendEntries(peer string, req AppendEntriesRequest) (AppendEntriesResponse, error) {
	url := fmt.Sprintf("http://%s/raft/append", peer)
	body, err := json.Marshal(req)
	if err != nil {
		return AppendEntriesResponse{}, err
	}
	client := &http.Client{Timeout: 800 * time.Millisecond}
	resp, err := client.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return AppendEntriesResponse{}, err
	}
	defer resp.Body.Close()
	var appendResp AppendEntriesResponse
	if err := json.NewDecoder(resp.Body).Decode(&appendResp); err != nil {
		return AppendEntriesResponse{}, err
	}
	return appendResp, nil
}

func (n *RaftNode) sendInstallSnapshotWithRetry(peer string, req InstallSnapshotRequest, maxRetries int) (InstallSnapshotResponse, error) {
	var lastErr error
	for i := 0; i < maxRetries; i++ {
		resp, err := n.sendInstallSnapshot(peer, req)
		if err == nil {
			return resp, nil
		}
		lastErr = err
		log.Printf("[Raft] InstallSnapshot to %s attempt %d/%d failed: %v", peer, i+1, maxRetries, err)
		time.Sleep(time.Duration(200*(i+1)) * time.Millisecond)
	}
	return InstallSnapshotResponse{}, lastErr
}

func (n *RaftNode) sendInstallSnapshot(peer string, req InstallSnapshotRequest) (InstallSnapshotResponse, error) {
	url := fmt.Sprintf("http://%s/raft/snapshot", peer)
	body, err := json.Marshal(req)
	if err != nil {
		return InstallSnapshotResponse{}, err
	}
	client := &http.Client{Timeout: n.snapshotTimeout}
	resp, err := client.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return InstallSnapshotResponse{}, err
	}
	defer resp.Body.Close()
	var snapResp InstallSnapshotResponse
	if err := json.NewDecoder(resp.Body).Decode(&snapResp); err != nil {
		return InstallSnapshotResponse{}, err
	}
	return snapResp, nil
}
