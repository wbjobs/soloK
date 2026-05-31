package websocket

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
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Message struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type Client struct {
	ID     string
	UserID string
	Role   string
	Conn   *websocket.Conn
	Send   chan []byte
}

type Hub struct {
	clients    map[string]*Client
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[string]*Client),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.ID] = client
			h.mu.Unlock()
			log.Printf("[WebSocket] Client connected: %s (user: %s)\n", client.ID, client.UserID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.ID]; ok {
				delete(h.clients, client.ID)
				close(client.Send)
				log.Printf("[WebSocket] Client disconnected: %s\n", client.ID)
			}
			h.mu.Unlock()

		case message := <-h.broadcast:
			h.mu.RLock()
			for _, client := range h.clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.clients, client.ID)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) Broadcast(msg Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("[WebSocket] Failed to marshal broadcast: %v\n", err)
		return
	}
	h.broadcast <- data
}

func (h *Hub) SendToClient(clientID string, msg Message) {
	h.mu.RLock()
	client, ok := h.clients[clientID]
	h.mu.RUnlock()

	if !ok {
		return
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	select {
	case client.Send <- data:
	default:
	}
}

func (h *Hub) HandleWebSocket(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[WebSocket] Upgrade error: %v\n", err)
		return
	}

	userID := c.GetHeader("X-User-ID")
	role := c.GetHeader("X-User-Role")
	clientID := c.GetHeader("X-Client-ID")

	if clientID == "" {
		clientID = generateID()
	}

	client := &Client{
		ID:     clientID,
		UserID: userID,
		Role:   role,
		Conn:   conn,
		Send:   make(chan []byte, 256),
	}

	h.register <- client

	go h.readPump(client)
	go h.writePump(client)
}

func (h *Hub) readPump(client *Client) {
	defer func() {
		h.unregister <- client
		client.Conn.Close()
	}()

	client.Conn.SetReadLimit(65536)

	for {
		_, message, err := client.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WebSocket] Read error: %v\n", err)
			}
			break
		}

		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("[WebSocket] Unmarshal error: %v\n", err)
			continue
		}

		h.handleClientMessage(client, msg)
	}
}

func (h *Hub) writePump(client *Client) {
	defer func() {
		client.Conn.Close()
	}()

	for message := range client.Send {
		if err := client.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
			log.Printf("[WebSocket] Write error: %v\n", err)
			break
		}
	}
}

func (h *Hub) handleClientMessage(client *Client, msg Message) {
	switch msg.Type {
	case "ping":
		h.SendToClient(client.ID, Message{Type: "pong", Data: nil})
	}
}

func generateID() string {
	return fmt.Sprintf("ws-%d", time.Now().UnixNano())
}
