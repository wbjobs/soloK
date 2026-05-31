package webrtc

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type SignalType string

const (
	SignalTypeOffer          SignalType = "offer"
	SignalTypeAnswer         SignalType = "answer"
	SignalTypeICECandidate   SignalType = "ice_candidate"
	SignalTypeJoin           SignalType = "join"
	SignalTypeLeave          SignalType = "leave"
	SignalTypeSessionInfo    SignalType = "session_info"
	SignalTypeARMarker       SignalType = "ar_marker"
	SignalTypeARAnnotation   SignalType = "ar_annotation"
	SignalTypeChat           SignalType = "chat"
	SignalTypeError          SignalType = "error"
	SignalTypePing           SignalType = "ping"
	SignalTypePong           SignalType = "pong"
)

type SignalMessage struct {
	Type      SignalType      `json:"type"`
	SessionID string          `json:"session_id,omitempty"`
	UserID    string          `json:"user_id,omitempty"`
	UserName  string          `json:"user_name,omitempty"`
	Role      string          `json:"role,omitempty"`
	Data      json.RawMessage `json:"data,omitempty"`
	Timestamp time.Time       `json:"timestamp"`
}

type ARMarker struct {
	ID          string  `json:"id"`
	SessionID   string  `json:"session_id"`
	UserID      string  `json:"user_id"`
	Type        string  `json:"type"`
	PositionX   float64 `json:"position_x"`
	PositionY   float64 `json:"position_y"`
	PositionZ   float64 `json:"position_z"`
	Color       string  `json:"color,omitempty"`
	Label       string  `json:"label,omitempty"`
	ArrowToX    float64 `json:"arrow_to_x,omitempty"`
	ArrowToY    float64 `json:"arrow_to_y,omitempty"`
	ArrowToZ    float64 `json:"arrow_to_z,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type ARAnnotation struct {
	ID        string    `json:"id"`
	SessionID string    `json:"session_id"`
	UserID    string    `json:"user_id"`
	Text      string    `json:"text"`
	PositionX float64   `json:"position_x"`
	PositionY float64   `json:"position_y"`
	PositionZ float64   `json:"position_z"`
	CreatedAt time.Time `json:"created_at"`
}

type Peer struct {
	ID       string
	Name     string
	Role     string
	Conn     *websocket.Conn
	Send     chan []byte
	IsExpert bool
}

type Session struct {
	ID        string
	Expert    *Peer
	Assistant *Peer
	Markers   map[string]*ARMarker
	Annotations []*ARAnnotation
	CreatedAt time.Time
	Active    bool
}

type SignalServer struct {
	sessions map[string]*Session
	peers    map[string]*Peer
	mu       sync.RWMutex
}

func NewSignalServer() *SignalServer {
	return &SignalServer{
		sessions: make(map[string]*Session),
		peers:    make(map[string]*Peer),
	}
}

func (s *SignalServer) HandleWebSocket(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[WebRTC] Upgrade error: %v\n", err)
		return
	}

	userID := c.Query("user_id")
	userName := c.Query("user_name")
	role := c.Query("role")

	if userID == "" {
		userID = fmt.Sprintf("user_%d", time.Now().UnixNano())
	}
	if userName == "" {
		userName = "User"
	}

	peer := &Peer{
		ID:       userID,
		Name:     userName,
		Role:     role,
		Conn:     conn,
		Send:     make(chan []byte, 256),
		IsExpert: role == "expert",
	}

	s.mu.Lock()
	s.peers[peer.ID] = peer
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.peers, peer.ID)
		for _, session := range s.sessions {
			if session.Expert != nil && session.Expert.ID == peer.ID {
				session.Expert = nil
			}
			if session.Assistant != nil && session.Assistant.ID == peer.ID {
				session.Assistant = nil
			}
			if session.Expert == nil && session.Assistant == nil {
				session.Active = false
			}
		}
		s.mu.Unlock()
		close(peer.Send)
		conn.Close()
	}()

	go s.readPump(peer)
	go s.writePump(peer)

	log.Printf("[WebRTC] Peer connected: %s (%s)\n", peer.Name, peer.Role)
}

func (s *SignalServer) readPump(peer *Peer) {
	defer func() {
		peer.Conn.Close()
	}()

	peer.Conn.SetReadLimit(65536)

	for {
		_, message, err := peer.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WebRTC] Read error from %s: %v\n", peer.ID, err)
			}
			break
		}

		var msg SignalMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("[WebRTC] Invalid message from %s: %v\n", peer.ID, err)
			continue
		}

		msg.UserID = peer.ID
		msg.UserName = peer.Name
		msg.Role = peer.Role
		msg.Timestamp = time.Now()

		s.handleMessage(peer, &msg)
	}
}

func (s *SignalServer) writePump(peer *Peer) {
	defer func() {
		peer.Conn.Close()
	}()

	for message := range peer.Send {
		if err := peer.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
			log.Printf("[WebRTC] Write error to %s: %v\n", peer.ID, err)
			break
		}
	}
}

func (s *SignalServer) handleMessage(peer *Peer, msg *SignalMessage) {
	switch msg.Type {
	case SignalTypePing:
		s.sendToPeer(peer, SignalMessage{
			Type:      SignalTypePong,
			Timestamp: time.Now(),
		})

	case SignalTypeJoin:
		s.handleJoin(peer, msg)

	case SignalTypeLeave:
		s.handleLeave(peer, msg)

	case SignalTypeOffer, SignalTypeAnswer, SignalTypeICECandidate:
		s.forwardSignal(peer, msg)

	case SignalTypeARMarker:
		s.handleARMarker(peer, msg)

	case SignalTypeARAnnotation:
		s.handleARAnnotation(peer, msg)

	case SignalTypeChat:
		s.handleChat(peer, msg)

	default:
		log.Printf("[WebRTC] Unknown message type: %s\n", msg.Type)
	}
}

func (s *SignalServer) handleJoin(peer *Peer, msg *SignalMessage) {
	sessionID := msg.SessionID
	if sessionID == "" {
		sessionID = fmt.Sprintf("session_%d", time.Now().UnixNano())
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	session, exists := s.sessions[sessionID]
	if !exists {
		session = &Session{
			ID:        sessionID,
			Markers:   make(map[string]*ARMarker),
			CreatedAt: time.Now(),
			Active:    true,
		}
		s.sessions[sessionID] = session
	}

	if peer.IsExpert {
		session.Expert = peer
	} else {
		session.Assistant = peer
	}

	s.sendToPeer(peer, SignalMessage{
		Type:      SignalTypeSessionInfo,
		SessionID: sessionID,
		Data:      s.getSessionData(session),
		Timestamp: time.Now(),
	})

	s.broadcastToSession(session, SignalMessage{
		Type:      SignalTypeSessionInfo,
		SessionID: sessionID,
		UserID:    peer.ID,
		UserName:  peer.Name,
		Role:      peer.Role,
		Data:      s.getSessionData(session),
		Timestamp: time.Now(),
	}, peer.ID)

	log.Printf("[WebRTC] %s joined session %s\n", peer.Name, sessionID)
}

func (s *SignalServer) handleLeave(peer *Peer, msg *SignalMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, session := range s.sessions {
		if session.Expert != nil && session.Expert.ID == peer.ID {
			session.Expert = nil
		}
		if session.Assistant != nil && session.Assistant.ID == peer.ID {
			session.Assistant = nil
		}
		if session.Expert == nil && session.Assistant == nil {
			session.Active = false
		}
	}
}

func (s *SignalServer) forwardSignal(peer *Peer, msg *SignalMessage) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	session, exists := s.sessions[msg.SessionID]
	if !exists {
		s.sendToPeer(peer, SignalMessage{
			Type:      SignalTypeError,
			Data:      json.RawMessage(`{"error":"session not found"}`),
			Timestamp: time.Now(),
		})
		return
	}

	var target *Peer
	if peer.IsExpert && session.Assistant != nil {
		target = session.Assistant
	} else if !peer.IsExpert && session.Expert != nil {
		target = session.Expert
	}

	if target != nil {
		s.sendToPeer(target, *msg)
	}
}

func (s *SignalServer) handleARMarker(peer *Peer, msg *SignalMessage) {
	var marker ARMarker
	if err := json.Unmarshal(msg.Data, &marker); err != nil {
		return
	}

	marker.ID = fmt.Sprintf("marker_%d", time.Now().UnixNano())
	marker.UserID = peer.ID
	marker.SessionID = msg.SessionID
	marker.CreatedAt = time.Now()

	s.mu.Lock()
	session, exists := s.sessions[msg.SessionID]
	if exists {
		session.Markers[marker.ID] = &marker
	}
	s.mu.Unlock()

	s.broadcastToSession(session, SignalMessage{
		Type:      SignalTypeARMarker,
		SessionID: msg.SessionID,
		UserID:    peer.ID,
		UserName:  peer.Name,
		Data:      mustMarshal(marker),
		Timestamp: time.Now(),
	}, "")
}

func (s *SignalServer) handleARAnnotation(peer *Peer, msg *SignalMessage) {
	var annotation ARAnnotation
	if err := json.Unmarshal(msg.Data, &annotation); err != nil {
		return
	}

	annotation.ID = fmt.Sprintf("annotation_%d", time.Now().UnixNano())
	annotation.UserID = peer.ID
	annotation.SessionID = msg.SessionID
	annotation.CreatedAt = time.Now()

	s.mu.Lock()
	session, exists := s.sessions[msg.SessionID]
	if exists {
		session.Annotations = append(session.Annotations, &annotation)
	}
	s.mu.Unlock()

	s.broadcastToSession(session, SignalMessage{
		Type:      SignalTypeARAnnotation,
		SessionID: msg.SessionID,
		UserID:    peer.ID,
		UserName:  peer.Name,
		Data:      mustMarshal(annotation),
		Timestamp: time.Now(),
	}, "")
}

func (s *SignalServer) handleChat(peer *Peer, msg *SignalMessage) {
	s.mu.RLock()
	session, exists := s.sessions[msg.SessionID]
	s.mu.RUnlock()

	if exists {
		s.broadcastToSession(session, *msg, "")
	}
}

func (s *SignalServer) getSessionData(session *Session) json.RawMessage {
	type SessionInfo struct {
		ID         string       `json:"id"`
		Expert     *PeerInfo    `json:"expert,omitempty"`
		Assistant  *PeerInfo    `json:"assistant,omitempty"`
		Markers    []*ARMarker  `json:"markers"`
		Active     bool         `json:"active"`
		CreatedAt  time.Time    `json:"created_at"`
	}

	type PeerInfo struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Role string `json:"role"`
	}

	info := SessionInfo{
		ID:        session.ID,
		Markers:   make([]*ARMarker, 0, len(session.Markers)),
		Active:    session.Active,
		CreatedAt: session.CreatedAt,
	}

	for _, m := range session.Markers {
		info.Markers = append(info.Markers, m)
	}

	if session.Expert != nil {
		info.Expert = &PeerInfo{ID: session.Expert.ID, Name: session.Expert.Name, Role: session.Expert.Role}
	}
	if session.Assistant != nil {
		info.Assistant = &PeerInfo{ID: session.Assistant.ID, Name: session.Assistant.Name, Role: session.Assistant.Role}
	}

	return mustMarshal(info)
}

func (s *SignalServer) sendToPeer(peer *Peer, msg SignalMessage) {
	if peer == nil {
		return
	}
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	select {
	case peer.Send <- data:
	default:
	}
}

func (s *SignalServer) broadcastToSession(session *Session, msg SignalMessage, excludeID string) {
	if session == nil {
		return
	}

	if session.Expert != nil && session.Expert.ID != excludeID {
		s.sendToPeer(session.Expert, msg)
	}
	if session.Assistant != nil && session.Assistant.ID != excludeID {
		s.sendToPeer(session.Assistant, msg)
	}
}

func mustMarshal(v interface{}) json.RawMessage {
	data, _ := json.Marshal(v)
	return data
}

func (s *SignalServer) GetActiveSessions() []map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	sessions := make([]map[string]interface{}, 0)
	for _, session := range s.sessions {
		if session.Active {
			s := map[string]interface{}{
				"id":         session.ID,
				"expert":     session.Expert != nil,
				"assistant":  session.Assistant != nil,
				"markers":    len(session.Markers),
				"created_at": session.CreatedAt,
			}
			if session.Expert != nil {
				s["expert_name"] = session.Expert.Name
			}
			if session.Assistant != nil {
				s["assistant_name"] = session.Assistant.Name
			}
			sessions = append(sessions, s)
		}
	}
	return sessions
}
