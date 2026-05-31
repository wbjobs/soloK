package mqttclient

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"digitaltwin/internal/models"
	"digitaltwin/internal/timeseries"
	"digitaltwin/internal/websocket"
)

type Client struct {
	client    mqtt.Client
	ts        *timeseries.TSDB
	wsHub     *websocket.Hub
	mu        sync.RWMutex
	handlers  map[string][]func(topic string, payload []byte)
}

func New(broker, clientID, username, password string, qos byte, ts *timeseries.TSDB, wsHub *websocket.Hub) *Client {
	opts := mqtt.NewClientOptions()
	opts.AddBroker(broker)
	opts.SetClientID(clientID)
	opts.SetUsername(username)
	opts.SetPassword(password)
	opts.SetAutoReconnect(true)
	opts.SetMaxReconnectInterval(10 * time.Second)
	opts.SetCleanSession(true)
	opts.SetKeepAlive(60 * time.Second)

	c := &Client{
		ts:       ts,
		wsHub:    wsHub,
		handlers: make(map[string][]func(topic string, payload []byte)),
	}

	opts.OnConnect = func(_ mqtt.Client) {
		log.Println("[MQTT] Connected to broker")
		c.subscribeAll()
	}

	opts.OnConnectionLost = func(_ mqtt.Client, err error) {
		log.Printf("[MQTT] Connection lost: %v\n", err)
	}

	c.client = mqtt.NewClient(opts)
	return c
}

func (c *Client) Connect() error {
	if token := c.client.Connect(); token.Wait() && token.Error() != nil {
		return fmt.Errorf("MQTT connect failed: %w", token.Error())
	}
	return nil
}

func (c *Client) Disconnect() {
	c.client.Disconnect(250)
}

func (c *Client) subscribeAll() {
	topics := map[string]byte{
		"device/+/telemetry":          1,
		"device/+/state/robotic_arm":  1,
		"device/+/state/conveyor":     1,
		"device/+/state/vision":       1,
		"device/+/status":             1,
	}

	for topic, qos := range topics {
		token := c.client.Subscribe(topic, qos, c.handleMessage)
		token.Wait()
		log.Printf("[MQTT] Subscribed to topic: %s\n", topic)
	}
}

func (c *Client) handleMessage(_ mqtt.Client, msg mqtt.Message) {
	topic := msg.Topic()
	payload := msg.Payload()

	log.Printf("[MQTT] Received message on topic: %s\n", topic)

	go c.dispatch(topic, payload)
	go c.storeTelemetry(topic, payload)
}

func (c *Client) dispatch(topic string, payload []byte) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	for pattern, handlers := range c.handlers {
		if matchTopic(pattern, topic) {
			for _, h := range handlers {
				go h(topic, payload)
			}
		}
	}
}

func (c *Client) On(pattern string, handler func(topic string, payload []byte)) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.handlers[pattern] = append(c.handlers[pattern], handler)
}

func (c *Client) storeTelemetry(topic string, payload []byte) {
	if topic == "device/+/telemetry" {
		return
	}

	var tel models.DeviceTelemetry
	if err := json.Unmarshal(payload, &tel); err != nil {
		log.Printf("[MQTT] Failed to unmarshal telemetry: %v\n", err)
		return
	}

	if tel.DeviceID == "" {
		return
	}

	tel.Timestamp = time.Now()

	if c.ts != nil {
		if err := c.ts.InsertTelemetry(tel); err != nil {
			log.Printf("[TSDB] Failed to insert telemetry: %v\n", err)
		}
	}

	if c.wsHub != nil {
		wsMsg := websocket.Message{
			Type: "telemetry",
			Data: tel,
		}
		c.wsHub.Broadcast(wsMsg)
	}
}

func (c *Client) Publish(topic string, qos byte, retained bool, payload interface{}) error {
	var data []byte
	switch v := payload.(type) {
	case []byte:
		data = v
	case string:
		data = []byte(v)
	default:
		b, err := json.Marshal(v)
		if err != nil {
			return err
		}
		data = b
	}

	token := c.client.Publish(topic, qos, retained, data)
	token.Wait()
	if token.Error() != nil {
		return fmt.Errorf("MQTT publish failed: %w", token.Error())
	}
	return nil
}

func (c *Client) SendCommand(deviceID string, cmd models.ControlCommand) error {
	topic := fmt.Sprintf("device/%s/command", deviceID)
	return c.Publish(topic, 1, false, cmd)
}

func matchTopic(pattern, topic string) bool {
	if pattern == topic {
		return true
	}

	for i := 0; i < len(pattern); i++ {
		if pattern[i] == '+' {
			for topic[i] != '/' {
				i++
				if i >= len(topic) {
					return true
				}
			}
		} else if i >= len(topic) || pattern[i] != topic[i] {
			return false
		}
	}
	return true
}
