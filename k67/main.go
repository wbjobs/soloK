package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"configcenter/api"
	"configcenter/raft"
	"configcenter/storage"
)

type ConfigApplier struct {
	store *storage.LevelDBStore
	node  *raft.RaftNode
	hub   *api.WatchHub
}

func (a *ConfigApplier) Apply(entry raft.LogEntry) {
	cmdMap, ok := entry.Command.(map[string]interface{})
	if !ok {
		data, err := json.Marshal(entry.Command)
		if err != nil {
			log.Printf("[Apply] failed to marshal command: %v", err)
			return
		}
		if err := json.Unmarshal(data, &cmdMap); err != nil {
			log.Printf("[Apply] failed to unmarshal command: %v", err)
			return
		}
	}

	op, _ := cmdMap["op"].(string)
	if op == "noop" {
		return
	}
	if op != "put" && op != "import" {
		return
	}

	key, _ := cmdMap["key"].(string)
	value, _ := cmdMap["value"].(string)
	expectedVersion := uint64(0)
	if v, ok := cmdMap["expected_version"].(float64); ok {
		expectedVersion = uint64(v)
	}
	operator, _ := cmdMap["operator"].(string)
	clientIP, _ := cmdMap["client_ip"].(string)

	if op == "import" {
		expectedVersion = 0
	}

	existing, _ := a.store.GetConfig(key)
	var oldVersion uint64
	var oldValue string
	if existing != nil {
		oldVersion = existing.Version
		oldValue = existing.Value
	}

	newEntry, err := a.store.PutConfig(key, value, expectedVersion)
	if err != nil {
		log.Printf("[Apply] failed to put config key=%s: %v", key, err)
		return
	}

	changelog := &storage.ChangeLogEntry{
		Key:        key,
		OldValue:   oldValue,
		NewValue:   value,
		OldVersion: oldVersion,
		NewVersion: newEntry.Version,
		Term:       entry.Term,
		Index:      entry.Index,
		Operator:   operator,
		Timestamp:  time.Now().UnixMilli(),
		ClientIP:   clientIP,
	}
	if err := a.store.WriteChangeLog(changelog); err != nil {
		log.Printf("[Apply] failed to write changelog: %v", err)
	}

	if a.hub != nil {
		a.hub.NotifyChange(key, newEntry)
	}

	if entry.Index%100 == 0 && entry.Index > 0 {
		go a.takeSnapshot()
	}

	log.Printf("[Apply] op=%s key=%s value=%s version=%d term=%d index=%d operator=%s",
		op, key, value, newEntry.Version, entry.Term, entry.Index, operator)
}

func (a *ConfigApplier) takeSnapshot() {
	configs, err := a.store.GetAllConfigs()
	if err != nil {
		log.Printf("[Snapshot] failed to get all configs: %v", err)
		return
	}

	snapData := make(map[string]raft.ConfigValue)
	for k, v := range configs {
		snapData[k] = raft.ConfigValue{
			Value:   v.Value,
			Version: v.Version,
		}
	}

	a.node.TakeSnapshot(snapData)
	log.Printf("[Snapshot] snapshot taken with %d keys", len(snapData))
}

func main() {
	id := flag.String("id", "node1", "node ID")
	addr := flag.String("addr", "127.0.0.1:8001", "listen address")
	peers := flag.String("peers", "127.0.0.1:8002,127.0.0.1:8003", "comma-separated peer addresses")
	dataDir := flag.String("data", "./data/node1", "data directory")
	flag.Parse()

	os.MkdirAll(*dataDir, 0755)

	store, err := storage.NewLevelDBStore(*dataDir + "/leveldb")
	if err != nil {
		log.Fatalf("Failed to open LevelDB: %v", err)
	}
	defer store.Close()

	peerList := parsePeers(*peers)

	applier := &ConfigApplier{store: store}

	node := raft.NewRaftNode(*id, peerList, applier)
	applier.node = node

	snapshot, err := loadSnapshot(*dataDir + "/snapshot.json")
	if err == nil && snapshot != nil {
		node.Snapshot = snapshot
		configs := make(map[string]*storage.ConfigEntry)
		for k, v := range snapshot.Data {
			configs[k] = &storage.ConfigEntry{
				Key:     k,
				Value:   v.Value,
				Version: v.Version,
			}
		}
		if err := store.LoadSnapshot(configs); err != nil {
			log.Printf("Warning: failed to load snapshot into store: %v", err)
		}
		log.Printf("[%s] Loaded snapshot with %d keys, lastIncludedIndex=%d",
			*id, len(snapshot.Data), snapshot.LastIncludedIndex)
	}

	node.Start()

	server := api.NewServer(*addr, node, store)
	applier.hub = server.Hub

	go func() {
		time.Sleep(5 * time.Second)
		for {
			time.Sleep(30 * time.Second)
			if node.IsLeader() {
				applier.takeSnapshot()
				saveSnapshot(*dataDir+"/snapshot.json", node)
			}
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := server.Start(); err != nil {
			log.Fatalf("Server error: %v", err)
		}
	}()

	fmt.Printf("[%s] Config center node started on %s, peers=%v\n", *id, *addr, peerList)

	<-sigCh
	fmt.Printf("[%s] Shutting down...\n", *id)
	close(node.StopCh)
}

func parsePeers(peersStr string) []string {
	var result []string
	start := 0
	for i := 0; i <= len(peersStr); i++ {
		if i == len(peersStr) || peersStr[i] == ',' {
			peer := peersStr[start:i]
			if peer != "" {
				result = append(result, peer)
			}
			start = i + 1
		}
	}
	return result
}

func loadSnapshot(path string) (*raft.Snapshot, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var snap raft.Snapshot
	if err := json.Unmarshal(data, &snap); err != nil {
		return nil, err
	}
	return &snap, nil
}

func saveSnapshot(path string, node *raft.RaftNode) {
	snapshot := node.GetSnapshot()

	if snapshot == nil {
		return
	}

	data, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		log.Printf("[Snapshot] failed to marshal snapshot: %v", err)
		return
	}

	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		log.Printf("[Snapshot] failed to write snapshot tmp file: %v", err)
		return
	}
	if err := os.Rename(tmpPath, path); err != nil {
		log.Printf("[Snapshot] failed to rename snapshot file: %v", err)
	}
}
